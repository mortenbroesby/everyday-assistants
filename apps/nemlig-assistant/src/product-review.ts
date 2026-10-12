import {
  type BasketProposalService,
  type ApplyResult,
  BasketTransferNotDispatchedError,
  NativeTransferUnconfirmedError,
  VerifiedPartialAdditionsError,
} from "./proposals.js";
import { randomUUID } from "node:crypto";
import { NemligError } from "./nemlig-error.js";
import {
  ProductNotFoundError,
  shoppingListFingerprint,
  type Basket,
  type ShoppingList,
  type ShoppingListOverview,
  type ShoppingListClient,
  type ShoppingClient,
} from "./client.js";
import {
  isAuthenticationFailure,
  resolveDetailedProductSearch,
  type ProductDiscoveryClient,
} from "./product-discovery.js";
import { createProductView, type ProductView } from "./product-presentation.js";
import { runReadPool } from "./read-coordination.js";
import type {
  LocalBasket,
  LocalBasketCommand,
  LocalBasketSummary,
  ReviewOperation,
} from "./local-basket.js";

export type ReviewDestination = "needs-review" | "ready" | "alternatives";
/** Bounds transient draft payloads while allowing a full family shopping trip. */
export const MAX_DRAFT_PRODUCTS = 500;
const quantityMap = <Item>(
  items: readonly Item[],
  productId: (item: Item) => number,
  quantity: (item: Item) => number,
): Map<number, number> =>
  new Map(items.map((item) => [productId(item), quantity(item)]));
const reviewItemInputs = (items: ShoppingList["items"]) =>
  items.map(({ productId, quantity }) => ({
    product_id: productId,
    quantity,
  }));
const sameQuantities = (
  left: Map<number, number>,
  right: Map<number, number>,
): boolean =>
  left.size === right.size &&
  [...left].every(([productId, quantity]) => right.get(productId) === quantity);
const sameShoppingListItems = (
  left: Array<{ productId: number; quantity: number }>,
  right: ShoppingList["items"],
): boolean =>
  sameQuantities(
    quantityMap(
      left,
      (item) => item.productId,
      (item) => item.quantity,
    ),
    quantityMap(
      right,
      (item) => item.productId,
      (item) => item.quantity,
    ),
  );
const reviewQuantities = (items: ReviewItem[]) =>
  quantityMap(
    items,
    (item) => item.product_id,
    (item) => item.quantity,
  );
export const DRAFT_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const MAX_DURABLE_REVIEW_CACHE = 8;
interface ReviewItem {
  product_id: number;
  quantity: number;
  state: "needs-review" | "ready";
  view: ProductView;
}
export interface ProductReviewSnapshot {
  draftId?: string;
  draftExpiresAt?: number;
  shoppingListId?: number;
  shoppingListName?: string;
  saveStatus?: "saving" | "saved" | "partial" | "uncertain";
  shoppingListDirty?: boolean;
  updateStatus?: "saving" | "partial" | "uncertain";
  conflictItems?: ReviewItem[];
  saveProgress?: { completed: number; total: number };
  actionNotice?: string;
  basketId?: string;
  revision?: number;
  submissionAttempted?: boolean;
  destination: ReviewDestination;
  items: ReviewItem[];
  submission?: {
    submission_id: string;
    status: "prepared" | "submitted" | "uncertain" | "partial";
    verified_additions?: number;
    skipped_products?: Array<{ product_id: number; name: string }>;
    cleanup_warning?: string;
    expires_at: string;
    review: Record<string, unknown>;
  };
  alternatives?: {
    product_id: number;
    origin: ReviewItem["state"];
    query: string;
    views: ProductView[];
  };
}
export type ProductReviewAction =
  | { kind: "save"; name: string }
  | { kind: "update" }
  | { kind: "accept" | "remove" | "revisit"; product_ids: number[] }
  | { kind: "add"; items: Array<{ product_id: number; quantity: number }> }
  | { kind: "quantity"; product_id: number; quantity: number }
  | { kind: "discard_pending_update" }
  | { kind: "navigate"; destination: ReviewDestination }
  | { kind: "alternatives"; product_id: number; query: string; limit?: number }
  | { kind: "replace"; product_id: number; replacement_id: number };
interface StoredReview {
  busy: boolean;
  lastActivityAt?: number;
  accountIdentity?: string;
  nativeFingerprint?: string;
  nativeItems?: Array<{ productId: number; quantity: number }>;
  createAttempted?: boolean;
  operationGeneration?: string;
  completedDraftId?: string;
  snapshot: ProductReviewSnapshot;
  proposalId?: string;
}
type ReviewProposals = Pick<
  BasketProposalService,
  "prepareAdditions" | "apply"
> &
  Partial<
    Pick<
      BasketProposalService,
      | "prepareShoppingListAdditions"
      | "transferNativeShoppingList"
      | "matchesNativeShoppingListTransfer"
    >
  >;
type ReviewClient = ProductDiscoveryClient &
  Partial<ShoppingListClient & Pick<ShoppingClient, "getCart">>;
export interface LocalBasketRepository {
  mutate(command: LocalBasketCommand): Promise<unknown>;
}
interface NativeListSubmissionPlan {
  operationId: string;
  submissionId: string;
  accountIdentity: string;
  fingerprint: string;
  list: ShoppingList;
  baseline: Basket;
  operation: ReviewOperation;
}
type NativeSourceCleanupState = "exact" | "changed" | "uncertain";
type NativeSourceCleanupResult = {
  status: "deleted" | "retained" | "uncertain";
  warning?: string;
};
export interface ReviewOperationJournal {
  read(operationId: string): Promise<ReviewOperation | undefined>;
  claim(operationId: string, generation: string): Promise<boolean>;
  release?(operationId: string, generation: string): Promise<boolean>;
  write(operation: ReviewOperation): Promise<void>;
  complete(operationId: string, generation: string): Promise<void | boolean>;
}

const completeNativeListUpdate = async (
  journal: ReviewOperationJournal,
  operation: ReviewOperation,
  failureMessage: string,
): Promise<void> => {
  await journal.complete(operation.operationId, operation.generation);
  const completed = await journal.read(operation.operationId);
  if (
    completed?.generation !== operation.generation ||
    completed.completedUntil === undefined
  ) {
    throw new NemligError(failureMessage);
  }
};
type DraftListCreationClaim =
  | { kind: "claimed" }
  | { kind: "existing"; listId: number }
  | { kind: "blocked" };

const reviewKey = (owner: string, basketId: string): string =>
  `${owner}\0${basketId}`;
const updateOperationId = (listId: number): string =>
  `native-list-update:${listId}`;
const submitOperationId = (listId: number): string =>
  `native-list-submit:${listId}`;
type NativeSubmissionStage =
  "active_review" | "target" | "preflight" | "transfer";
const failNativeSubmission = (
  stage: NativeSubmissionStage,
  error: unknown,
): never => {
  console.warn(
    JSON.stringify({
      schema_version: 1,
      event: "native_shopping_list_submit_failed",
      stage,
      ...(error instanceof NemligError && error.status !== undefined
        ? { provider_status: error.status }
        : {}),
    }),
  );
  if (stage !== "transfer") {
    const detail =
      error instanceof NemligError
        ? error.message
        : "Shopping-list submission preflight failed.";
    const suffix =
      /no (?:basket|provider) write was sent|no transfer was sent/iu.test(
        detail,
      )
        ? ""
        : " No basket write was sent.";
    throw new NemligError(
      `${detail}${suffix}`,
      error instanceof NemligError ? error.status : undefined,
    );
  }
  throw error;
};
const localBasketSnapshot = (basket: LocalBasket): ProductReviewSnapshot => ({
  basketId: basket.basketId,
  revision: basket.revision,
  submissionAttempted: basket.submissionAttempted === true,
  destination: "ready",
  items: basket.lines.map((line) => ({
    product_id: line.productId,
    quantity: line.quantity,
    state: "ready",
    view: structuredClone(line.view),
  })),
});
const localBasket = (value: unknown): LocalBasket => {
  if (
    !value ||
    typeof value !== "object" ||
    !("basketId" in value) ||
    !Array.isArray((value as LocalBasket).lines)
  ) {
    throw new NemligError("Local basket unavailable. Refresh the basket.");
  }
  return value as LocalBasket;
};

const validPositive = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;
const available = (view: ProductView): boolean =>
  view.status === "complete" && view.product.available === true;
const requirePreparedSubmission = (
  submission: ProductReviewSnapshot["submission"],
  submissionId: string,
  proposalId: string | undefined,
  now: number,
) => {
  if (
    !submission ||
    submission.status !== "prepared" ||
    submission.submission_id !== submissionId ||
    !proposalId
  ) {
    throw new NemligError(
      "Submission is absent, changed, or already attempted. Refresh the Local basket.",
    );
  }
  if (Date.parse(submission.expires_at) <= now) {
    throw new NemligError(
      "Submission expired. Prepare a fresh exact review for approval.",
    );
  }
  return { proposalId, submission };
};

/** Private, bounded, temporary state. Local edits cannot call a provider mutation. */
export class ProductReviewService {
  private readonly drafts = new Map<string, StoredReview>();
  private readonly expiredDraftIds = new Set<string>();
  private readonly startingOwners = new Set<string>();
  private readonly basketOperations = new Set<string>();
  private readonly proposals?: ReviewProposals;
  private readonly now: () => number;

  constructor(
    private readonly client: ReviewClient,
    options: { now?: () => number; proposals?: ReviewProposals } = {},
  ) {
    this.proposals = options.proposals;
    this.now = options.now ?? Date.now;
  }

  private touch(owner: string, stored: StoredReview): void {
    this.drafts.delete(owner);
    this.drafts.set(owner, stored);
  }

  private makeRoom(): void {
    if (this.drafts.size + this.startingOwners.size < 8) {
      return;
    }
    const oldest = [...this.drafts.entries()].find(
      ([, draft]) =>
        !draft.busy &&
        draft.snapshot.submission?.status !== "submitted" &&
        draft.snapshot.submission?.status !== "uncertain" &&
        draft.snapshot.submission?.status !== "partial",
    );
    if (!oldest) {
      throw new NemligError(
        "Active Local basket limit reached. Finish an in-progress Local basket and try again.",
      );
    }
    const [owner] = oldest;
    this.drafts.delete(owner);
  }

  private makeDurableRoom(key: string): boolean {
    if (this.drafts.has(key)) {
      return true;
    }
    const durable = [...this.drafts.entries()].filter(([candidate]) =>
      candidate.includes("\0"),
    );
    if (durable.length < MAX_DURABLE_REVIEW_CACHE) {
      return true;
    }
    const oldest = durable.find(
      ([candidate, draft]) =>
        !draft.busy &&
        !this.basketOperations.has(candidate) &&
        !this.startingOwners.has(candidate.split("\0", 1)[0] ?? ""),
    );
    if (!oldest) {
      return false;
    }
    this.drafts.delete(oldest[0]);
    return true;
  }

  private cacheDurable(key: string, stored: StoredReview): void {
    if (this.makeDurableRoom(key)) {
      this.drafts.set(key, stored);
    }
  }

  forgetBasket(owner: string, basketId: string): void {
    const key = reviewKey(owner, basketId);
    const stored = this.drafts.get(key);
    if (stored?.busy || this.basketOperations.has(key)) {
      return;
    }
    this.drafts.delete(key);
  }

  private forgetMissingBaskets(
    owner: string,
    baskets: readonly LocalBasketSummary[],
  ): void {
    const prefix = `${owner}\0`;
    const available = new Set(baskets.map(({ basketId }) => basketId));
    for (const [key, stored] of this.drafts) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      const basketId = key.slice(prefix.length);
      if (
        !available.has(basketId) &&
        !stored.busy &&
        !this.basketOperations.has(key)
      ) {
        this.drafts.delete(key);
      }
    }
  }

  private expireDraft(owner: string, stored: StoredReview): void {
    const draftId = stored.snapshot.draftId;
    if (draftId) {
      const key = `${owner}\0${draftId}`;
      this.expiredDraftIds.add(key);
      if (this.expiredDraftIds.size > 32) {
        const oldest = this.expiredDraftIds.values().next().value;
        if (oldest) {
          this.expiredDraftIds.delete(oldest);
        }
      }
    }
    this.drafts.delete(owner);
  }

  private readItems(
    items: Array<{ product_id: number; quantity: number }>,
    signal?: AbortSignal,
  ): Promise<ReviewItem[]> {
    return runReadPool(
      items,
      async (item, readSignal): Promise<ReviewItem> => {
        let view: ProductView;
        try {
          const product = await this.client.getProduct(
            item.product_id,
            readSignal,
          );
          if (product.id !== item.product_id) {
            throw new NemligError("Product identity mismatch.");
          }
          view = createProductView(product, { kind: "details" });
        } catch (error) {
          if (readSignal.aborted || isAuthenticationFailure(error)) {
            throw error;
          }
          view = {
            context: "details",
            status: "unavailable",
            product_id: item.product_id,
            ...(error instanceof ProductNotFoundError ? { missing: true } : {}),
          };
        }
        return { ...item, state: "ready", view };
      },
      { signal },
    );
  }

  async listBaskets(
    repository: LocalBasketRepository,
    owner?: string,
  ): Promise<LocalBasketSummary[]> {
    const baskets = (await repository.mutate({
      kind: "list",
    })) as LocalBasketSummary[];
    if (owner) {
      this.forgetMissingBaskets(owner, baskets);
    }
    return baskets;
  }

  // Preserve only safe live outcomes across revisions; never restore prepared authority.
  // fallow-ignore-next-line complexity
  async showBasket(
    owner: string,
    basketId: string,
    repository: LocalBasketRepository,
    allowOperation = false,
  ): Promise<ProductReviewSnapshot> {
    const key = reviewKey(owner, basketId);
    let basket: LocalBasket;
    try {
      basket = localBasket(await repository.mutate({ kind: "read", basketId }));
    } catch (error) {
      this.forgetBasket(owner, basketId);
      throw error;
    }
    const previous = this.drafts.get(key);
    if (previous?.busy || (!allowOperation && this.basketOperations.has(key))) {
      throw new NemligError(
        "A Local basket operation is in progress. Refresh it after the request finishes.",
      );
    }
    const snapshot = localBasketSnapshot(basket);
    if (previous?.snapshot.revision === basket.revision) {
      if (basket.submissionAttempted) {
        if (
          previous.snapshot.submission?.status === "uncertain" ||
          previous.snapshot.submission?.status === "partial" ||
          previous.snapshot.submission?.status === "submitted"
        ) {
          snapshot.submission = structuredClone(previous.snapshot.submission);
        }
      } else {
        snapshot.alternatives = structuredClone(previous.snapshot.alternatives);
        snapshot.submission = structuredClone(previous.snapshot.submission);
      }
      previous.snapshot = snapshot;
      this.touch(key, previous);
      return structuredClone(snapshot);
    }
    this.cacheDurable(key, { busy: false, snapshot });
    return structuredClone(snapshot);
  }

  async createBasket(
    owner: string,
    items: Array<{ product_id: number; quantity: number }>,
    repository: LocalBasketRepository,
    signal?: AbortSignal,
    selectionKey?: string,
  ): Promise<{ review: ProductReviewSnapshot; baskets: LocalBasketSummary[] }> {
    const rows = await this.readItems(items, signal);
    const created = (await repository.mutate({
      kind: "create",
      ...(selectionKey ? { selectionKey } : {}),
      lines: rows.map(({ product_id, quantity, view }) => ({
        productId: product_id,
        quantity,
        view,
      })),
    })) as { basket: LocalBasket; evictedBasketId?: string };
    if (created.evictedBasketId) {
      this.drafts.delete(reviewKey(owner, created.evictedBasketId));
    }
    const review = localBasketSnapshot(created.basket);
    this.cacheDurable(reviewKey(owner, created.basket.basketId), {
      busy: false,
      snapshot: review,
    });
    return { review, baskets: await this.listBaskets(repository, owner) };
  }

  private canPrepareShoppingList(): boolean {
    return Boolean(
      this.proposals?.prepareShoppingListAdditions &&
      this.client.createShoppingList &&
      this.client.updateShoppingListProduct &&
      this.client.getShoppingList &&
      this.client.addShoppingListToCart,
    );
  }

  private async prepareSubmissionProposal(
    owner: string,
    basketId: string,
    basket: LocalBasket,
    signal: AbortSignal | undefined,
  ): Promise<{
    proposal: Awaited<ReturnType<BasketProposalService["prepareAdditions"]>>;
  }> {
    if (!this.canPrepareShoppingList()) {
      throw new NemligError(
        "Shopping-list submission is unavailable. No Nemlig basket write was sent.",
      );
    }
    const proposal = await this.proposals!.prepareShoppingListAdditions!(
      owner,
      basket.lines.map(({ productId, quantity }) => ({
        product_id: productId,
        quantity,
      })),
      `Nemlig Assistant ${basketId.slice(0, 8)}`,
      { kind: "exact_review" },
      { signal, freshProducts: true },
    );
    return { proposal };
  }

  // Preparation and provider apply keep separate, visible critical sections with different fence ordering.
  // fallow-ignore-next-line code-duplication
  async prepareBasket(
    owner: string,
    basketId: string,
    repository: LocalBasketRepository,
    signal?: AbortSignal,
  ): Promise<ProductReviewSnapshot> {
    // Keep both provider-authority entry points independently fail-closed.
    // fallow-ignore-next-line code-duplication
    if (!this.proposals) {
      throw new NemligError("Submission service unavailable.");
    }
    const key = reviewKey(owner, basketId);
    if (this.basketOperations.has(key)) {
      throw new NemligError("A Local basket operation is in progress.");
    }
    this.basketOperations.add(key);
    try {
      await this.showBasket(owner, basketId, repository, true);
      const stored = this.lock(key);
      try {
        const basket = localBasket(
          await repository.mutate({ kind: "read", basketId }),
        );
        if (basket.submissionAttempted) {
          throw new NemligError(
            "Inspect the actual Nemlig basket before preparing another submission.",
          );
        }
        if (!basket.lines.length) {
          throw new NemligError("The Local basket is empty.");
        }
        if (
          basket.lines.some((line) =>
            line.view.status === "unavailable"
              ? line.view.missing !== true
              : line.view.product.available === undefined,
          )
        ) {
          throw new NemligError(
            "The Local basket has unresolved product identity or availability.",
          );
        }
        const { proposal } = await this.prepareSubmissionProposal(
          owner,
          basketId,
          basket,
          signal,
        );
        const current = localBasket(
          await repository.mutate({ kind: "read", basketId }),
        );
        if (
          current.revision !== basket.revision ||
          current.submissionAttempted
        ) {
          throw new NemligError(
            "The Local basket changed during preparation. Refresh and prepare again.",
          );
        }
        stored.proposalId = proposal.proposal_id;
        stored.snapshot = {
          ...localBasketSnapshot(current),
          submission: {
            submission_id: randomUUID(),
            status: "prepared",
            expires_at: proposal.expires_at,
            review: structuredClone(proposal.review),
          },
        };
        return structuredClone(stored.snapshot);
      } finally {
        stored.busy = false;
      }
    } finally {
      this.basketOperations.delete(key);
    }
  }

  // Fence before provider apply, retain uncertain outcomes, and delete only after verified readback.
  // fallow-ignore-next-line complexity
  async submitBasket(
    owner: string,
    basketId: string,
    submissionId: string,
    repository: LocalBasketRepository,
  ): Promise<{ review: ProductReviewSnapshot; result: ApplyResult }> {
    // Keep both provider-authority entry points independently fail-closed.
    // fallow-ignore-next-line code-duplication
    if (!this.proposals) {
      throw new NemligError("Submission service unavailable.");
    }
    const key = reviewKey(owner, basketId);
    if (this.basketOperations.has(key)) {
      throw new NemligError("A Local basket operation is in progress.");
    }
    this.basketOperations.add(key);
    try {
      const stored = this.lock(key);
      try {
        const { proposalId, submission } = requirePreparedSubmission(
          stored.snapshot.submission,
          submissionId,
          stored.proposalId,
          this.now(),
        );
        const current = localBasket(
          await repository.mutate({ kind: "read", basketId }),
        );
        if (
          current.submissionAttempted ||
          current.revision !== stored.snapshot.revision
        ) {
          throw new NemligError(
            "The Local basket changed after review. Prepare a fresh exact review.",
          );
        }
        const fenced = localBasket(
          await repository.mutate({
            kind: "edit",
            basketId,
            edit: { kind: "attempt-submission" },
            expectedRevision: current.revision,
          }),
        );
        submission.status = "uncertain";
        stored.snapshot = { ...localBasketSnapshot(fenced), submission };
        let result: ApplyResult;
        try {
          result = await this.proposals.apply(owner, proposalId, "additions");
        } catch (error) {
          if (error instanceof VerifiedPartialAdditionsError) {
            submission.status = "partial";
            submission.verified_additions = error.verifiedAdditions;
            stored.snapshot = { ...stored.snapshot, submission };
          }
          throw error;
        }
        submission.status = "submitted";
        submission.skipped_products = result.skipped_products;
        submission.verified_additions = result.verified_additions;
        submission.cleanup_warning = result.cleanup_warning;
        stored.snapshot = { ...stored.snapshot, submission };
        await repository.mutate({
          kind: "edit",
          basketId,
          edit: { kind: "complete-submission" },
          expectedRevision: fenced.revision,
        });
        this.drafts.delete(key);
        return { review: structuredClone(stored.snapshot), result };
      } finally {
        stored.busy = false;
      }
    } finally {
      this.basketOperations.delete(key);
    }
  }

  // Expiry, ownership, and stale-card checks must pass before returning draft state.
  // fallow-ignore-next-line complexity
  private get(owner: string, expectedDraftId?: string): StoredReview {
    let draft = this.drafts.get(owner);
    if (
      draft?.snapshot.draftId &&
      !draft.busy &&
      this.now() - (draft.lastActivityAt ?? 0) >= DRAFT_IDLE_TIMEOUT_MS
    ) {
      this.expireDraft(owner, draft);
      draft = undefined;
    }
    if (!draft) {
      if (
        expectedDraftId &&
        this.expiredDraftIds.has(`${owner}\0${expectedDraftId}`)
      ) {
        throw new NemligError(
          "Unsaved draft expired. Start a new draft; its previous products cannot be restored.",
        );
      }
      throw new NemligError(
        "Unsaved draft is unavailable. Start a new draft; previous choices and approval cannot be restored.",
      );
    }
    if (
      expectedDraftId !== undefined &&
      draft.snapshot.draftId !== expectedDraftId
    ) {
      throw new NemligError(
        "Unsaved draft changed. Refresh the current draft before editing.",
      );
    }
    return draft;
  }

  active(
    owner: string,
    expectedDraftId?: string,
  ): ProductReviewSnapshot | undefined {
    const stored = this.drafts.get(owner);
    if (!stored) {
      return undefined;
    }
    if (
      stored.snapshot.draftId &&
      !stored.busy &&
      this.now() - (stored.lastActivityAt ?? 0) >= DRAFT_IDLE_TIMEOUT_MS
    ) {
      this.expireDraft(owner, stored);
      return undefined;
    }
    if (
      expectedDraftId !== undefined &&
      stored.snapshot.draftId !== expectedDraftId
    ) {
      throw new NemligError(
        "Unsaved draft changed. Refresh the current draft before editing.",
      );
    }
    this.touch(owner, stored);
    return structuredClone(stored.snapshot);
  }

  end(owner: string, expectedDraftId?: string): void {
    const stored = this.lock(owner, expectedDraftId);
    this.drafts.delete(owner);
    stored.busy = false;
  }

  // Start serializes expiry, creation, and product hydration for one owner.
  // fallow-ignore-next-line complexity
  async start(
    owner: string,
    items: Array<{ product_id: number; quantity: number }>,
    signal?: AbortSignal,
  ): Promise<ProductReviewSnapshot> {
    const active = this.drafts.get(owner);
    if (active) {
      if (
        active.snapshot.draftId &&
        !active.busy &&
        this.now() - (active.lastActivityAt ?? 0) >= DRAFT_IDLE_TIMEOUT_MS
      ) {
        this.expireDraft(owner, active);
      } else {
        this.touch(owner, active);
        return structuredClone(active.snapshot);
      }
    }
    if (this.startingOwners.has(owner)) {
      throw new NemligError(
        "A Local basket is starting. Refresh it after the current request finishes.",
      );
    }
    if (!items.length) {
      throw new NemligError(
        "No active Local basket to show. Find exact products and provide them to start a new Local basket.",
      );
    }
    if (
      items.length > MAX_DRAFT_PRODUCTS ||
      new Set(items.map((i) => i.product_id)).size !== items.length ||
      items.some(
        (i) => !validPositive(i.product_id) || !validPositive(i.quantity),
      )
    ) {
      throw new NemligError(
        `Provide 1–${MAX_DRAFT_PRODUCTS} unique exact products with positive integer quantities.`,
      );
    }
    this.makeRoom();
    this.startingOwners.add(owner);
    try {
      const rows = await this.readItems(items, signal);
      const createdAt = this.now();
      const snapshot: ProductReviewSnapshot = {
        draftId: randomUUID(),
        draftExpiresAt: createdAt + DRAFT_IDLE_TIMEOUT_MS,
        destination: "ready",
        items: rows,
      };
      this.drafts.set(owner, {
        busy: false,
        lastActivityAt: createdAt,
        snapshot,
      });
      return structuredClone(snapshot);
    } finally {
      this.startingOwners.delete(owner);
    }
  }

  async getShoppingLists(
    signal?: AbortSignal,
  ): Promise<ShoppingListOverview[]> {
    if (!this.client.providerIdentity || !this.client.listShoppingLists) {
      throw new NemligError("Native shopping-list discovery is unavailable.");
    }
    this.client.providerIdentity();
    return this.client.listShoppingLists(signal);
  }

  // Keep missing-list, journal, and owner checks in one fail-closed recovery path.
  // fallow-ignore-next-line complexity
  async retireDeletedNativeListUpdate(
    owner: string,
    listId: number,
    signal: AbortSignal | undefined,
    journal: ReviewOperationJournal | undefined,
  ): Promise<ProductReviewSnapshot | undefined> {
    if (
      !journal ||
      !this.client.providerIdentity ||
      !this.client.listShoppingLists
    ) {
      return undefined;
    }
    const accountIdentity = this.client.providerIdentity();
    const operationId = updateOperationId(listId);
    const operation = await journal.read(operationId);
    if (!operation || operation.completedUntil !== undefined) {
      return undefined;
    }
    if (
      operation.kind !== "update" ||
      operation.accountIdentity !== accountIdentity ||
      operation.listId !== listId
    ) {
      throw new NemligError(
        "The interrupted update does not match this account and list. Its recovery record was kept.",
      );
    }
    const lists = await this.client.listShoppingLists(signal);
    if (this.client.providerIdentity() !== accountIdentity) {
      throw new NemligError(
        "Nemlig account changed while checking the deleted list. Its recovery record was kept.",
      );
    }
    if (lists.some(({ id }) => id === listId)) {
      return undefined;
    }
    await completeNativeListUpdate(
      journal,
      operation,
      "Could not confirm the deleted list's pending update was retired. Refresh before continuing.",
    );
    const snapshot: ProductReviewSnapshot = {
      destination: "ready",
      items: [],
      actionNotice:
        "This shopping list was deleted in Nemlig. Its pending update was retired; choose another list or start a draft.",
    };
    const active = this.drafts.get(owner);
    if (!active?.busy && active?.snapshot.shoppingListId === listId) {
      this.drafts.set(owner, {
        busy: false,
        accountIdentity,
        nativeFingerprint: undefined,
        nativeItems: [],
        snapshot,
      });
    }
    return structuredClone(snapshot);
  }

  private storeNativeListReview(
    owner: string,
    accountIdentity: string,
    list: ShoppingList,
    snapshot: ProductReviewSnapshot,
    operationGeneration?: string,
  ): void {
    this.drafts.set(owner, {
      busy: false,
      accountIdentity,
      nativeFingerprint: shoppingListFingerprint(list),
      nativeItems: list.items.map((item) => ({ ...item })),
      ...(operationGeneration ? { operationGeneration } : {}),
      snapshot,
    });
  }

  // Validate account, inventory, native identity, and rows before trusting a list ID.
  // fallow-ignore-next-line complexity
  async openShoppingList(
    owner: string,
    listId: number,
    signal?: AbortSignal,
    journal?: ReviewOperationJournal,
  ): Promise<ProductReviewSnapshot> {
    if (
      !validPositive(listId) ||
      !this.client.providerIdentity ||
      !this.client.getShoppingList
    ) {
      throw new NemligError("Shopping list is unavailable.");
    }
    const accountIdentity = this.client.providerIdentity();
    const current = this.drafts.get(owner);
    const initialSnapshot = current?.snapshot;
    if (current?.busy) {
      throw new NemligError("A shopping-list operation is in progress.");
    }
    const assertCurrentEntry = () => {
      if (
        this.drafts.get(owner) !== current ||
        current?.busy ||
        current?.snapshot !== initialSnapshot
      ) {
        throw new NemligError(
          "The active shopping-list review changed. Refresh it before continuing.",
        );
      }
      if (
        current?.snapshot.draftId &&
        this.now() - (current.lastActivityAt ?? 0) >= DRAFT_IDLE_TIMEOUT_MS
      ) {
        this.expireDraft(owner, current);
        throw new NemligError(
          "Unsaved draft expired. Start a new draft; its previous products cannot be restored.",
        );
      }
    };
    const lists = await this.getShoppingLists(signal);
    if (!lists.some((list) => list.id === listId)) {
      const submission = await journal?.read(submitOperationId(listId));
      if (
        submission?.kind === "submit" &&
        submission.completed &&
        submission.listId === listId &&
        submission.accountIdentity === accountIdentity &&
        (submission.cleanupStatus === "pending" ||
          submission.cleanupStatus === "uncertain")
      ) {
        await this.cleanupNativeSubmissionSource(submission, journal!, signal);
      }
      throw new NemligError(
        "Shopping list is unavailable or was deleted.",
        404,
      );
    }
    const list = await this.client.getShoppingList(listId, signal);
    if (
      list.id !== listId ||
      this.client.providerIdentity() !== accountIdentity
    ) {
      throw new NemligError("Shopping list identity changed. Select it again.");
    }
    const rows = await this.readItems(reviewItemInputs(list.items), signal);
    if (this.client.providerIdentity() !== accountIdentity) {
      throw new NemligError(
        "Connected Nemlig account changed. Select a list again.",
      );
    }
    assertCurrentEntry();
    const operation = await journal?.read(updateOperationId(listId));
    assertCurrentEntry();
    if (operation?.kind === "update" && !operation.completedUntil) {
      if (
        operation.listId !== listId ||
        operation.accountIdentity !== accountIdentity
      ) {
        throw new NemligError(
          "An interrupted update belongs to a different Nemlig account or list. No saved-list data was restored.",
        );
      }
      const baseline = new Map(
        (operation.baseline ?? []).map(({ productId, quantity }) => [
          productId,
          quantity,
        ]),
      );
      const desired = new Map(
        operation.items.map(({ productId, quantity }) => [productId, quantity]),
      );
      const present = new Map(
        list.items.map(({ productId, quantity }) => [productId, quantity]),
      );
      const ids = new Set([
        ...baseline.keys(),
        ...desired.keys(),
        ...present.keys(),
      ]);
      const conflict =
        operation.name !== list.name ||
        [...ids].some((id) => {
          const quantity = present.get(id) ?? 0;
          return (
            quantity !== (baseline.get(id) ?? 0) &&
            quantity !== (desired.get(id) ?? 0)
          );
        });
      const intendedItems = await this.readItems(
        reviewItemInputs(operation.items),
        signal,
      );
      if (this.client.providerIdentity() !== accountIdentity) {
        throw new NemligError(
          "Connected Nemlig account changed. Select a list again.",
        );
      }
      assertCurrentEntry();
      const diffCount = [...ids].filter(
        (id) => (baseline.get(id) ?? 0) !== (desired.get(id) ?? 0),
      ).length;
      const completed = [...ids].filter(
        (id) =>
          (baseline.get(id) ?? 0) !== (desired.get(id) ?? 0) &&
          (present.get(id) ?? 0) === (desired.get(id) ?? 0),
      ).length;
      const recovered: ProductReviewSnapshot = {
        shoppingListId: list.id,
        shoppingListName: list.name,
        saveStatus: "partial",
        updateStatus: "partial",
        shoppingListDirty: true,
        saveProgress: { completed, total: diffCount },
        destination: "ready",
        items: intendedItems,
        conflictItems: rows,
        ...(conflict
          ? {
              actionNotice:
                "Nemlig changed this list during an interrupted update. Your pending change is preserved; review the current list before continuing.",
            }
          : {}),
      };
      this.storeNativeListReview(
        owner,
        accountIdentity,
        list,
        recovered,
        operation.generation,
      );
      return structuredClone(recovered);
    }
    const snapshot: ProductReviewSnapshot = {
      shoppingListId: list.id,
      shoppingListName: list.name,
      saveStatus: "saved",
      destination: "ready",
      items: rows,
    };
    const submission = await journal?.read(submitOperationId(listId));
    if (
      submission?.kind === "submit" &&
      !submission.completed &&
      submission.completedUntil === undefined
    ) {
      if (
        submission.listId !== listId ||
        submission.accountIdentity !== accountIdentity
      ) {
        throw new NemligError(
          "An interrupted basket transfer belongs to another Nemlig account or list. Inspect it before continuing.",
        );
      }
      if (submission.dispatchAttempted) {
        snapshot.submission = {
          submission_id: submission.generation,
          status: "uncertain",
          expires_at: new Date(this.now() + 15 * 60 * 1000).toISOString(),
          review: {},
        };
        snapshot.submissionAttempted = true;
        snapshot.actionNotice =
          "A previous basket transfer may have completed. Inspect the actual basket; this transfer will not be retried.";
        try {
          if (
            this.client.getCart &&
            this.proposals?.matchesNativeShoppingListTransfer
          ) {
            const baseline: Basket = {
              items: (submission.baseline ?? []).map(
                ({ productId, quantity }) => ({
                  id: productId,
                  name: undefined,
                  quantity,
                  total: undefined,
                }),
              ),
              productsPrice: undefined,
              deliveryPrice: undefined,
              numberOfProducts: (submission.baseline ?? []).reduce(
                (sum, item) => sum + item.quantity,
                0,
              ),
              deliveryTime: undefined,
            };
            const currentBasket = await this.client.getCart(signal);
            if (
              this.client.providerIdentity() === accountIdentity &&
              this.proposals.matchesNativeShoppingListTransfer(
                baseline,
                currentBasket,
                submission.items.map(({ productId, quantity }) => ({
                  product_id: productId,
                  quantity,
                })),
              )
            ) {
              snapshot.actionNotice =
                "Basket quantities currently match the expected addition, but this transfer cannot be attributed after restart. Inspect the basket; do not retry.";
            }
          }
        } catch {
          // Keep the durable fence unresolved when basket readback is inconclusive.
        }
      }
      this.storeNativeListReview(owner, accountIdentity, list, snapshot);
      return structuredClone(snapshot);
    }
    if (
      submission?.kind === "submit" &&
      submission.completed &&
      submission.listId === listId &&
      submission.accountIdentity === accountIdentity
    ) {
      let cleanup: NativeSourceCleanupResult | undefined;
      if (
        submission.cleanupStatus === "pending" ||
        submission.cleanupStatus === "uncertain"
      ) {
        cleanup = await this.cleanupNativeSubmissionSource(
          submission,
          journal!,
          signal,
        );
        if (cleanup.status === "deleted") {
          throw new NemligError(
            "Shopping list is unavailable or was deleted.",
            404,
          );
        }
      }
      snapshot.submission = {
        submission_id: submission.generation,
        status: "submitted",
        ...((cleanup?.warning ?? submission.cleanupWarning)
          ? {
              cleanup_warning: cleanup?.warning ?? submission.cleanupWarning,
            }
          : {}),
        expires_at: new Date(this.now() + 15 * 60 * 1000).toISOString(),
        review: {},
      };
      snapshot.submissionAttempted = true;
      snapshot.actionNotice =
        cleanup?.warning ??
        submission.cleanupWarning ??
        "This exact shopping-list snapshot was already transferred. Update it before submitting another addition.";
    }
    if (
      current?.accountIdentity === accountIdentity &&
      current.snapshot.shoppingListId === list.id &&
      (current.snapshot.shoppingListDirty || current.snapshot.updateStatus)
    ) {
      const fingerprint = shoppingListFingerprint(list);
      const drifted = fingerprint !== current.nativeFingerprint;
      current.nativeFingerprint = fingerprint;
      current.nativeItems = list.items.map((item) => ({ ...item }));
      current.snapshot.conflictItems = rows;
      current.snapshot.saveStatus = "saved";
      delete current.snapshot.updateStatus;
      const baseline = quantityMap(
        current.nativeItems,
        (item) => item.productId,
        (item) => item.quantity,
      );
      current.snapshot.shoppingListDirty = !sameQuantities(
        baseline,
        reviewQuantities(current.snapshot.items),
      );
      if (drifted) {
        current.snapshot.updateStatus = "partial";
        current.snapshot.actionNotice =
          "Nemlig changed this list while edits were pending. Review the current rows alongside your staged edits, then choose Update shopping list to apply them.";
      } else {
        delete current.snapshot.actionNotice;
      }
      this.touch(owner, current);
      return structuredClone(current.snapshot);
    }
    const partialDraftId =
      current?.accountIdentity === accountIdentity &&
      current.snapshot.saveStatus === "partial" &&
      current.snapshot.shoppingListId === list.id
        ? current.snapshot.draftId
        : undefined;
    if (partialDraftId && journal) {
      const saveOperation = await journal.read(partialDraftId);
      assertCurrentEntry();
      if (saveOperation) {
        if (
          saveOperation.kind !== "save" ||
          saveOperation.generation !== partialDraftId ||
          saveOperation.accountIdentity !== accountIdentity ||
          saveOperation.listId !== list.id
        ) {
          throw new NemligError(
            "The interrupted save does not belong to this shopping list. Refresh before continuing.",
          );
        }
        if (!(await journal.complete(partialDraftId, partialDraftId))) {
          throw new NemligError(
            "Could not finish the interrupted save record. Refresh before continuing.",
          );
        }
        assertCurrentEntry();
      }
    }
    this.storeNativeListReview(owner, accountIdentity, list, snapshot);
    return structuredClone(snapshot);
  }

  // Keep inventory, account, identity, and drift checks in their required order.
  // fallow-ignore-next-line complexity
  private async currentNativeList(
    owner: string,
    stored: StoredReview,
    listId: number,
    accountIdentity: string,
    signal?: AbortSignal,
  ): Promise<ShoppingList | undefined> {
    const inventory = await this.client.listShoppingLists!(signal);
    if (this.client.providerIdentity?.() !== accountIdentity) {
      throw new NemligError(
        "Nemlig account changed while refreshing this shopping list. Select it again.",
      );
    }
    if (!inventory.some(({ id }) => id === listId)) {
      throw new NemligError(
        "Shopping list was deleted. Refresh the list.",
        404,
      );
    }
    const current = await this.client.getShoppingList!(listId, signal);
    if (
      this.client.providerIdentity?.() !== accountIdentity ||
      current.id !== listId
    ) {
      throw new NemligError("Shopping-list identity changed. Select it again.");
    }
    if (shoppingListFingerprint(current) === stored.nativeFingerprint) {
      return current;
    }
    const rows = await this.readItems(
      current.items.map(({ productId, quantity }) => ({
        product_id: productId,
        quantity,
      })),
      signal,
    );
    if (this.client.providerIdentity?.() !== accountIdentity) {
      throw new NemligError(
        "Nemlig account changed while refreshing this shopping list. Select it again.",
      );
    }
    if (stored.snapshot.shoppingListDirty) {
      stored.snapshot.conflictItems = rows;
      stored.snapshot.updateStatus = "partial";
      stored.snapshot.actionNotice =
        "Nemlig changed this list. Current rows are shown and your staged edits are preserved; reopen the list before updating.";
      stored.snapshot.shoppingListName = current.name;
      stored.nativeFingerprint = shoppingListFingerprint(current);
      stored.nativeItems = current.items.map((item) => ({ ...item }));
    } else {
      stored.snapshot.items = rows;
      stored.snapshot.shoppingListName = current.name;
      stored.nativeFingerprint = shoppingListFingerprint(current);
      stored.nativeItems = current.items.map((item) => ({ ...item }));
      stored.snapshot.actionNotice =
        "This shopping list changed in Nemlig. Review the refreshed rows before changing it again.";
      stored.snapshot.saveStatus = "saved";
    }
    this.touch(owner, stored);
    return undefined;
  }

  private async stageNativeListEdit(
    stored: StoredReview,
    action: ProductReviewAction,
    accountIdentity: string,
    signal?: AbortSignal,
  ): Promise<ProductReviewSnapshot> {
    const next = structuredClone(stored.snapshot);
    switch (action.kind) {
      case "quantity":
        this.stageNativeListQuantity(next, action);
        break;
      case "remove":
        this.stageNativeListRemoval(next, action);
        break;
      case "add":
        await this.stageNativeListAddition(
          next,
          action,
          accountIdentity,
          signal,
        );
        break;
      case "replace":
        this.stageNativeListReplacement(next, action);
        break;
      default:
        return structuredClone(stored.snapshot);
    }

    const baseline = quantityMap(
      stored.nativeItems ?? [],
      (item) => item.productId,
      (item) => item.quantity,
    );
    const desired = reviewQuantities(next.items);
    stored.snapshot = next;
    stored.snapshot.shoppingListDirty =
      JSON.stringify([...baseline].sort()) !==
      JSON.stringify([...desired].sort());
    delete stored.snapshot.submission;
    delete stored.proposalId;
    delete stored.snapshot.actionNotice;
    return structuredClone(stored.snapshot);
  }

  private nativeListItem(items: ReviewItem[], productId: number): ReviewItem {
    const item = items.find((row) => row.product_id === productId);
    if (!item) {
      throw new NemligError("Exact product is not in this shopping list.");
    }
    return item;
  }

  private stageNativeListQuantity(
    next: ProductReviewSnapshot,
    action: Extract<ProductReviewAction, { kind: "quantity" }>,
  ): void {
    if (!validPositive(action.quantity)) {
      throw new NemligError("Quantity must be a positive integer.");
    }
    this.nativeListItem(next.items, action.product_id).quantity =
      action.quantity;
  }

  private stageNativeListRemoval(
    next: ProductReviewSnapshot,
    action: { product_ids: number[] },
  ): void {
    if (
      !action.product_ids.length ||
      new Set(action.product_ids).size !== action.product_ids.length
    ) {
      throw new NemligError("Select unique exact products.");
    }
    action.product_ids.forEach((id) => this.nativeListItem(next.items, id));
    const removed = new Set(action.product_ids);
    next.items = next.items.filter((item) => !removed.has(item.product_id));
  }

  private async stageNativeListAddition(
    next: ProductReviewSnapshot,
    action: Extract<ProductReviewAction, { kind: "add" }>,
    accountIdentity: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const ids = action.items.map(({ product_id }) => product_id);
    if (
      !ids.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !validPositive(id)) ||
      action.items.some(({ quantity }) => !validPositive(quantity))
    ) {
      throw new NemligError(
        "Add unique exact products with positive quantities.",
      );
    }
    const rows = await this.readItems(action.items, signal);
    if (this.client.providerIdentity?.() !== accountIdentity) {
      throw new NemligError(
        "Nemlig account changed while refreshing this shopping list. Select it again.",
      );
    }
    for (const row of rows) {
      const existing = next.items.find(
        (item) => item.product_id === row.product_id,
      );
      if (existing) {
        existing.quantity += row.quantity;
        existing.view = row.view;
      } else {
        next.items.push({ ...row, quantity: row.quantity });
      }
    }
  }

  private stageNativeListReplacement(
    next: ProductReviewSnapshot,
    action: Extract<ProductReviewAction, { kind: "replace" }>,
  ): void {
    const target = this.nativeListItem(next.items, action.product_id);
    const replacement = next.alternatives?.views.find(
      (view) =>
        view.status === "complete" &&
        view.product.id === action.replacement_id &&
        view.product.available === true,
    );
    if (
      next.alternatives?.product_id !== target.product_id ||
      !replacement ||
      next.items.some((item) => item.product_id === action.replacement_id)
    ) {
      throw new NemligError("Choose an available exact returned alternative.");
    }
    target.product_id = action.replacement_id;
    target.view = replacement;
    delete next.alternatives;
  }

  // Keep the native-list action, ownership, lock, and refresh gates together.
  // fallow-ignore-next-line complexity
  async updateShoppingList(
    owner: string,
    listId: number,
    action: ProductReviewAction,
    signal?: AbortSignal,
    journal?: ReviewOperationJournal,
  ): Promise<ProductReviewSnapshot> {
    if (
      !validPositive(listId) ||
      !this.client.providerIdentity ||
      !this.client.listShoppingLists ||
      !this.client.getShoppingList ||
      !this.client.updateShoppingListProduct
    ) {
      throw new NemligError("Native shopping-list editing is unavailable.");
    }
    if (
      ["accept", "revisit", "navigate", "alternatives"].includes(action.kind)
    ) {
      const stored = this.get(owner);
      if (stored.snapshot.shoppingListId !== listId) {
        throw new NemligError("Select this exact shopping list again.");
      }
      return this.update(owner, action, signal);
    }

    const stored = this.lock(owner);
    try {
      if (stored.snapshot.shoppingListId !== listId) {
        throw new NemligError("Select this exact shopping list again.");
      }
      if (
        stored.snapshot.submission?.status === "uncertain" ||
        stored.snapshot.submission?.status === "partial"
      ) {
        throw new NemligError(
          "Inspect the actual Nemlig basket before changing or submitting this list again.",
        );
      }
      const accountIdentity = this.client.providerIdentity();
      const explicitConflictUpdate =
        (action.kind === "update" ||
          action.kind === "discard_pending_update") &&
        stored.snapshot.updateStatus === "partial" &&
        (stored.snapshot.conflictItems !== undefined ||
          action.kind === "discard_pending_update");
      if (
        stored.accountIdentity !== accountIdentity ||
        !stored.nativeFingerprint ||
        (stored.snapshot.actionNotice && !explicitConflictUpdate)
      ) {
        throw new NemligError(
          "Refresh this shopping list before making another change.",
        );
      }
      if (action.kind === "discard_pending_update") {
        return await this.discardPendingNativeListUpdate(
          owner,
          stored,
          listId,
          accountIdentity,
          signal,
          journal,
        );
      }
      const current = await this.currentNativeList(
        owner,
        stored,
        listId,
        accountIdentity,
        signal,
      );
      if (!current) {
        return structuredClone(stored.snapshot);
      }
      if (
        stored.snapshot.updateStatus === "partial" &&
        action.kind !== "update" &&
        stored.snapshot.actionNotice
      ) {
        throw new NemligError(
          "Resume the pending update or discard it after reviewing the current Nemlig list before changing the staged items.",
        );
      }
      if (action.kind !== "update") {
        const staged = await this.stageNativeListEdit(
          stored,
          action,
          accountIdentity,
          signal,
        );
        this.touch(owner, stored);
        return staged;
      }
      return await this.persistNativeListUpdate(
        owner,
        stored,
        listId,
        current,
        accountIdentity,
        signal,
        journal,
      );
    } finally {
      stored.busy = false;
    }
  }

  // This write state machine must preserve each provider outcome in the same journal.
  // fallow-ignore-next-line complexity
  private async persistNativeListUpdate(
    owner: string,
    stored: StoredReview,
    listId: number,
    current: ShoppingList,
    accountIdentity: string,
    signal?: AbortSignal,
    journal?: ReviewOperationJournal,
  ): Promise<ProductReviewSnapshot> {
    if (!stored.snapshot.shoppingListDirty) {
      throw new NemligError(
        "There are no staged shopping-list changes to save.",
      );
    }
    stored.snapshot.updateStatus = "saving";
    const next = structuredClone(stored.snapshot);
    const baseline = quantityMap(
      current.items,
      (item) => item.productId,
      (item) => item.quantity,
    );
    const desired = reviewQuantities(next.items);
    if (journal) {
      const operationId = updateOperationId(listId);
      try {
        const pending = await journal.read(operationId);
        const items = [...desired].map(([productId, quantity]) => ({
          productId,
          quantity,
        }));
        const samePending =
          pending?.completedUntil === undefined &&
          pending?.kind === "update" &&
          pending.accountIdentity === accountIdentity &&
          pending.listId === listId &&
          pending.name === current.name &&
          JSON.stringify(pending.items) === JSON.stringify(items);
        if (pending && pending.completedUntil === undefined && !samePending) {
          if (
            pending.kind !== "update" ||
            pending.accountIdentity !== accountIdentity ||
            pending.listId !== listId
          ) {
            throw new Error("A different shopping-list update is unresolved.");
          }
          const retired = await journal.complete(
            operationId,
            pending.generation,
          );
          if (retired === false) {
            throw new Error("The pending update changed during recovery.");
          }
        }
        const generation = samePending ? pending.generation : randomUUID();
        if (!samePending) {
          await journal.write({
            operationId,
            generation,
            accountIdentity,
            kind: "update",
            name: current.name,
            listId,
            baseline: [...baseline].map(([productId, quantity]) => ({
              productId,
              quantity,
            })),
            items,
          });
        }
        stored.operationGeneration = generation;
      } catch (error) {
        const message =
          error instanceof NemligError && error.status === 429
            ? error.message
            : "The update could not be recorded safely. No products were changed in Nemlig; refresh this list before continuing.";
        stored.snapshot.updateStatus = "partial";
        stored.snapshot.actionNotice = message;
        this.touch(owner, stored);
        throw new NemligError(message);
      }
    }
    const writeStatus = await this.writeNativeListDiff(
      owner,
      stored,
      listId,
      accountIdentity,
      baseline,
      desired,
      signal,
    );
    if (writeStatus === "uncertain") {
      return structuredClone(stored.snapshot);
    }
    return this.confirmNativeListUpdate(
      owner,
      stored,
      listId,
      current,
      accountIdentity,
      next,
      desired,
      writeStatus === "partial",
      journal,
    );
  }

  // Three-way row reconciliation must stay adjacent to its durable attempt fence.
  // fallow-ignore-next-line complexity
  private async discardPendingNativeListUpdate(
    owner: string,
    stored: StoredReview,
    listId: number,
    accountIdentity: string,
    signal: AbortSignal | undefined,
    journal: ReviewOperationJournal | undefined,
  ): Promise<ProductReviewSnapshot> {
    if (!journal) {
      throw new NemligError(
        "Pending update recovery is unavailable. Refresh the list before continuing.",
      );
    }
    const operationId = updateOperationId(listId);
    const operation = await journal.read(operationId);
    if (
      !operation ||
      operation.kind !== "update" ||
      operation.completedUntil !== undefined ||
      operation.accountIdentity !== accountIdentity ||
      operation.listId !== listId
    ) {
      throw new NemligError(
        "The pending update does not match this account and shopping list. No recovery record was changed.",
      );
    }
    const inventory = await this.client.listShoppingLists!(signal);
    if (this.client.providerIdentity?.() !== accountIdentity) {
      throw new NemligError(
        "Nemlig account changed while checking the list. The pending update was kept.",
      );
    }
    if (!inventory.some(({ id }) => id === listId)) {
      await completeNativeListUpdate(
        journal,
        operation,
        "Could not confirm the deleted list's pending update was retired. Refresh before continuing.",
      );
      stored.snapshot = {
        destination: "ready",
        items: [],
        actionNotice:
          "This shopping list was deleted in Nemlig. Its pending update was retired; choose another list or start a draft.",
      };
      stored.nativeFingerprint = undefined;
      stored.nativeItems = [];
      delete stored.operationGeneration;
      this.touch(owner, stored);
      return structuredClone(stored.snapshot);
    }
    const current = await this.client.getShoppingList!(listId, signal);
    if (
      this.client.providerIdentity?.() !== accountIdentity ||
      current.id !== listId
    ) {
      throw new NemligError(
        "Shopping-list identity changed. The pending update was kept.",
      );
    }
    const rows = await this.readItems(reviewItemInputs(current.items), signal);
    if (this.client.providerIdentity?.() !== accountIdentity) {
      throw new NemligError(
        "Nemlig account changed while reading the list. The pending update was kept.",
      );
    }
    await completeNativeListUpdate(
      journal,
      operation,
      "Could not confirm the pending update was retired. Refresh the list before continuing.",
    );
    stored.snapshot = {
      shoppingListId: listId,
      shoppingListName: current.name,
      saveStatus: "saved",
      shoppingListDirty: false,
      destination: "ready",
      items: rows,
    };
    stored.nativeFingerprint = shoppingListFingerprint(current);
    stored.nativeItems = current.items.map((item) => ({ ...item }));
    delete stored.operationGeneration;
    this.touch(owner, stored);
    return structuredClone(stored.snapshot);
  }

  // Stop after a failed write and reconcile the exact list before any deliberate retry.
  // fallow-ignore-next-line complexity
  private async writeNativeListDiff(
    owner: string,
    stored: StoredReview,
    listId: number,
    accountIdentity: string,
    baseline: Map<number, number>,
    desired: Map<number, number>,
    signal?: AbortSignal,
  ): Promise<"complete" | "partial" | "uncertain"> {
    for (const productId of new Set([...baseline.keys(), ...desired.keys()])) {
      if (signal?.aborted) {
        return "partial";
      }
      if (this.client.providerIdentity?.() !== accountIdentity) {
        this.uncertainNativeListUpdate(owner, stored, false);
        return "uncertain";
      }
      const before = baseline.get(productId) ?? 0;
      const after = desired.get(productId) ?? 0;
      if (before === after) {
        continue;
      }
      try {
        await this.client.updateShoppingListProduct!(
          listId,
          productId,
          after,
          signal,
        );
      } catch {
        return "partial";
      }
      if (this.client.providerIdentity?.() !== accountIdentity) {
        this.uncertainNativeListUpdate(owner, stored, false);
        return "uncertain";
      }
    }
    return "complete";
  }

  private async confirmNativeListUpdate(
    owner: string,
    stored: StoredReview,
    listId: number,
    current: ShoppingList,
    accountIdentity: string,
    next: ProductReviewSnapshot,
    desired: Map<number, number>,
    writeWasPartial: boolean,
    journal?: ReviewOperationJournal,
  ): Promise<ProductReviewSnapshot> {
    let saved: ShoppingList;
    try {
      saved = await this.client.getShoppingList!(listId);
    } catch {
      return this.uncertainNativeListUpdate(owner, stored, true);
    }
    if (
      this.client.providerIdentity?.() !== accountIdentity ||
      saved.id !== listId ||
      saved.name !== current.name
    ) {
      return this.uncertainNativeListUpdate(owner, stored, true);
    }
    const expected = {
      id: listId,
      name: current.name,
      items: [...desired].map(([productId, quantity]) => ({
        productId,
        quantity,
      })),
    };
    if (shoppingListFingerprint(saved) !== shoppingListFingerprint(expected)) {
      const rows = await this.readItems(
        saved.items.map(({ productId, quantity }) => ({
          product_id: productId,
          quantity,
        })),
      ).catch(() => undefined);
      if (!rows) {
        return this.uncertainNativeListUpdate(owner, stored, true);
      }
      stored.snapshot.conflictItems = rows;
      stored.nativeFingerprint = shoppingListFingerprint(saved);
      stored.nativeItems = saved.items.map((item) => ({ ...item }));
      stored.snapshot.saveStatus = "partial";
      stored.snapshot.updateStatus = "partial";
      stored.snapshot.actionNotice = writeWasPartial
        ? "Nemlig saved only part of this change. The current list is refreshed; review it before continuing."
        : "Nemlig returned different rows than requested. The current list is refreshed; review it before continuing.";
      this.touch(owner, stored);
      return structuredClone(stored.snapshot);
    }
    return this.confirmNativeListUpdateState(
      owner,
      stored,
      listId,
      saved,
      next,
      journal,
    );
  }

  private async confirmNativeListUpdateState(
    owner: string,
    stored: StoredReview,
    listId: number,
    saved: ShoppingList,
    next: ProductReviewSnapshot,
    journal?: ReviewOperationJournal,
  ): Promise<ProductReviewSnapshot> {
    stored.snapshot = next;
    stored.snapshot.saveStatus = "saved";
    stored.nativeFingerprint = shoppingListFingerprint(saved);
    stored.nativeItems = saved.items.map((item) => ({ ...item }));
    stored.snapshot.shoppingListDirty = false;
    delete stored.snapshot.updateStatus;
    delete stored.snapshot.actionNotice;
    this.touch(owner, stored);
    if (journal) {
      await journal
        .complete(updateOperationId(listId), stored.operationGeneration ?? "")
        .catch(() => undefined);
    }
    return structuredClone(stored.snapshot);
  }

  private uncertainNativeListUpdate(
    owner: string,
    stored: StoredReview,
    updateMayHaveReachedProvider: boolean,
  ): ProductReviewSnapshot {
    stored.snapshot.saveStatus = "uncertain";
    stored.snapshot.updateStatus = "uncertain";
    stored.snapshot.actionNotice = updateMayHaveReachedProvider
      ? "Nemlig did not confirm this change. Refresh the same list before trying again."
      : "Nemlig account changed during this change. Refresh this same list before continuing.";
    this.touch(owner, stored);
    return structuredClone(stored.snapshot);
  }

  private async resolveDraftShoppingList(
    stored: StoredReview,
    name: string,
    accountIdentity: string,
    signal?: AbortSignal,
    journal?: ReviewOperationJournal,
  ): Promise<number | undefined> {
    if (stored.snapshot.shoppingListId) {
      return stored.snapshot.shoppingListId;
    }
    if (!this.client.listShoppingLists || !this.client.createShoppingList) {
      throw new NemligError("Native shopping-list saving is unavailable.");
    }
    if (stored.createAttempted) {
      stored.snapshot.saveStatus = "uncertain";
      stored.snapshot.actionNotice =
        "Nemlig did not confirm which list it created. Refresh your shopping lists and explicitly select a list before continuing.";
      return undefined;
    }
    await this.client.listShoppingLists(signal);
    stored.accountIdentity = accountIdentity;
    const claim = await this.claimDraftShoppingListCreation(stored, journal);
    if (claim.kind === "existing") {
      return claim.listId;
    }
    if (claim.kind === "blocked") {
      return undefined;
    }
    return this.createDraftShoppingList(
      stored,
      name,
      accountIdentity,
      signal,
      journal,
    );
  }

  private async createDraftShoppingList(
    stored: StoredReview,
    name: string,
    accountIdentity: string,
    signal?: AbortSignal,
    journal?: ReviewOperationJournal,
  ): Promise<number | undefined> {
    stored.createAttempted = true;
    stored.snapshot.shoppingListName = name;
    stored.snapshot.saveProgress = {
      completed: 0,
      total: stored.snapshot.items.length,
    };
    try {
      const listId = await this.client.createShoppingList!(name, signal);
      stored.snapshot.shoppingListId = listId;
      stored.snapshot.saveStatus = "partial";
      if (journal && stored.snapshot.draftId) {
        await journal.write({
          operationId: stored.snapshot.draftId,
          generation: stored.snapshot.draftId,
          accountIdentity,
          kind: "save",
          name,
          listId,
          items: stored.snapshot.items.map(({ product_id, quantity }) => ({
            productId: product_id,
            quantity,
          })),
          progress: { completed: 0, total: stored.snapshot.items.length },
        });
      }
      return listId;
    } catch (error) {
      stored.snapshot.saveStatus = "uncertain";
      stored.snapshot.actionNotice =
        "Nemlig did not confirm list creation. Refresh your shopping lists before continuing.";
      if (signal?.aborted) {
        throw error;
      }
      return undefined;
    }
  }

  private async claimDraftShoppingListCreation(
    stored: StoredReview,
    journal?: ReviewOperationJournal,
  ): Promise<DraftListCreationClaim> {
    const draftId = stored.snapshot.draftId;
    if (!journal || !draftId || (await journal.claim(draftId, draftId))) {
      return { kind: "claimed" };
    }
    const existing = await journal.read(draftId);
    if (existing?.listId) {
      stored.snapshot.shoppingListId = existing.listId;
      stored.createAttempted = true;
      return { kind: "existing", listId: existing.listId };
    }
    stored.snapshot.saveStatus = "uncertain";
    stored.snapshot.actionNotice =
      "This save may already be creating a list. Refresh your shopping lists before continuing.";
    return { kind: "blocked" };
  }

  // Keep reconciliation, missing-row writes, and exact readback in one recovery protocol.
  // fallow-ignore-next-line complexity
  private async populateDraftShoppingList(
    owner: string,
    stored: StoredReview,
    accountIdentity: string,
    signal?: AbortSignal,
    journal?: ReviewOperationJournal,
  ): Promise<void> {
    const listId = stored.snapshot.shoppingListId;
    const listName = stored.snapshot.shoppingListName;
    if (
      !listId ||
      !listName ||
      !this.client.getShoppingList ||
      !this.client.updateShoppingListProduct
    ) {
      throw new NemligError("Native shopping-list saving is unavailable.");
    }
    const markPartial = async (notice: string, completed: number) => {
      stored.snapshot.saveStatus = "partial";
      stored.snapshot.saveProgress = {
        completed,
        total: stored.snapshot.items.length,
      };
      if (journal && stored.snapshot.draftId) {
        await journal.write({
          operationId: stored.snapshot.draftId,
          generation: stored.snapshot.draftId,
          accountIdentity,
          kind: "save",
          name: listName,
          listId,
          items: stored.snapshot.items.map(({ product_id, quantity }) => ({
            productId: product_id,
            quantity,
          })),
          progress: { completed, total: stored.snapshot.items.length },
        });
      }
      stored.snapshot.actionNotice = notice;
      this.touch(owner, stored);
    };
    const current = await this.client.getShoppingList(listId, signal);
    if (
      this.client.providerIdentity?.() !== accountIdentity ||
      current.id !== listId ||
      current.name !== listName
    ) {
      await markPartial(
        "The connected account or shopping-list identity changed. No more products were written.",
        0,
      );
      return;
    }
    const expected = new Map(
      stored.snapshot.items.map(({ product_id, quantity }) => [
        product_id,
        quantity,
      ]),
    );
    const present = new Map(
      current.items.map(({ productId, quantity }) => [productId, quantity]),
    );
    if (
      [...present].some(
        ([productId, quantity]) => expected.get(productId) !== quantity,
      )
    ) {
      await markPartial(
        "This shopping list changed outside the interrupted save. Refresh it before continuing.",
        0,
      );
      return;
    }
    let completed = present.size;
    stored.snapshot.saveProgress = {
      completed,
      total: stored.snapshot.items.length,
    };
    stored.snapshot.saveStatus = "saving";
    delete stored.snapshot.actionNotice;
    const missing = stored.snapshot.items.filter(
      (item) => !present.has(item.product_id),
    );
    let writeFailed = false;
    // Concurrent row updates may not compose at Nemlig; only exact readback makes a draft submittable.
    for (let index = 0; index < missing.length; index += 2) {
      if (signal?.aborted) {
        await markPartial(
          "Save was cancelled. Refresh this list before continuing.",
          completed,
        );
        throw signal.reason ?? new NemligError("Save was cancelled.");
      }
      const batch = missing.slice(index, index + 2);
      const results = await Promise.allSettled(
        batch.map((item) =>
          this.client.updateShoppingListProduct!(
            listId,
            item.product_id,
            item.quantity,
            signal,
          ),
        ),
      );
      for (const [offset, result] of results.entries()) {
        if (result.status === "fulfilled") {
          present.set(batch[offset]!.product_id, batch[offset]!.quantity);
        }
      }
      completed = present.size;
      stored.snapshot.saveProgress = {
        completed,
        total: stored.snapshot.items.length,
      };
      if (signal?.aborted) {
        await markPartial(
          "Save was cancelled. Refresh this list before continuing.",
          completed,
        );
        throw signal.reason ?? new NemligError("Save was cancelled.");
      }
      if (results.some((result) => result.status === "rejected")) {
        writeFailed = true;
      }
    }
    const saved = await this.client.getShoppingList(listId, signal);
    const expectedList = {
      id: listId,
      name: listName,
      items: stored.snapshot.items.map(({ product_id, quantity }) => ({
        productId: product_id,
        quantity,
      })),
    };
    if (
      this.client.providerIdentity?.() !== accountIdentity ||
      shoppingListFingerprint(saved) !== shoppingListFingerprint(expectedList)
    ) {
      const confirmed = saved.items.filter(
        ({ productId, quantity }) => expected.get(productId) === quantity,
      ).length;
      await markPartial(
        `Nemlig confirmed ${confirmed} of ${stored.snapshot.items.length} products. ${writeFailed ? "A product update failed. " : ""}Refresh the list before continuing.`,
        confirmed,
      );
      return;
    }
    stored.snapshot.saveStatus = "saved";
    stored.nativeFingerprint = shoppingListFingerprint(saved);
    stored.nativeItems = saved.items.map((item) => ({ ...item }));
    stored.completedDraftId = stored.snapshot.draftId;
    if (journal && stored.snapshot.draftId) {
      await journal
        .complete(stored.snapshot.draftId, stored.snapshot.draftId)
        .catch(() => undefined);
    }
    delete stored.snapshot.draftId;
    delete stored.snapshot.draftExpiresAt;
    delete stored.lastActivityAt;
    delete stored.createAttempted;
    delete stored.snapshot.actionNotice;
    this.touch(owner, stored);
  }

  // Keep creation uncertainty and same-ID resume transitions together to prevent replay.
  // fallow-ignore-next-line complexity
  async save(
    owner: string,
    name: string,
    expectedDraftId?: string,
    signal?: AbortSignal,
    journal?: ReviewOperationJournal,
  ): Promise<ProductReviewSnapshot> {
    if (!this.drafts.has(owner) && expectedDraftId && journal) {
      const operation = await journal.read(expectedDraftId);
      if (operation?.kind === "save") {
        const items = await this.readItems(
          operation.items.map(({ productId, quantity }) => ({
            product_id: productId,
            quantity,
          })),
          signal,
        );
        const lastActivityAt = this.now();
        this.drafts.set(owner, {
          busy: false,
          lastActivityAt,
          accountIdentity: operation.accountIdentity,
          createAttempted: operation.createAttempted,
          snapshot: {
            draftId: operation.operationId,
            draftExpiresAt: lastActivityAt + DRAFT_IDLE_TIMEOUT_MS,
            destination: "ready",
            items,
            shoppingListName: operation.name,
            ...(operation.listId ? { shoppingListId: operation.listId } : {}),
            saveStatus: "partial",
          },
        });
      }
    }
    const previous = this.drafts.get(owner);
    if (
      expectedDraftId &&
      !previous?.busy &&
      previous?.completedDraftId === expectedDraftId &&
      previous.snapshot.saveStatus === "saved"
    ) {
      return structuredClone(previous.snapshot);
    }
    const stored = this.lock(owner, expectedDraftId);
    let providerStarted = false;
    try {
      if (stored.snapshot.saveStatus === "saved") {
        return structuredClone(stored.snapshot);
      }
      const listName = name.trim();
      if (!listName || listName.length > 30) {
        throw new NemligError(
          "Shopping list name must contain 1–30 characters.",
        );
      }
      if (
        !this.client.providerIdentity ||
        !this.client.listShoppingLists ||
        !this.client.createShoppingList ||
        !this.client.updateShoppingListProduct ||
        !this.client.getShoppingList
      ) {
        throw new NemligError("Native shopping-list saving is unavailable.");
      }
      if (!stored.snapshot.items.length) {
        throw new NemligError("The unsaved draft is empty.");
      }
      if (
        stored.snapshot.shoppingListName &&
        stored.snapshot.shoppingListName !== listName
      ) {
        throw new NemligError(
          "An interrupted save must continue with its original list name.",
        );
      }
      const accountIdentity = this.client.providerIdentity();
      if (
        stored.accountIdentity &&
        stored.accountIdentity !== accountIdentity
      ) {
        stored.snapshot.saveStatus = "partial";
        stored.snapshot.actionNotice =
          "Reconnect to the Nemlig account that owns this interrupted list before continuing.";
        return structuredClone(stored.snapshot);
      }
      stored.accountIdentity = accountIdentity;
      stored.lastActivityAt = this.now();
      stored.snapshot.draftExpiresAt =
        stored.lastActivityAt + DRAFT_IDLE_TIMEOUT_MS;
      stored.snapshot.shoppingListName = listName;
      const previousSaveStatus = stored.snapshot.saveStatus;
      stored.snapshot.saveStatus = "saving";
      if (journal) {
        try {
          await journal.write({
            operationId: stored.snapshot.draftId!,
            generation: stored.snapshot.draftId!,
            accountIdentity,
            kind: "save",
            name: listName,
            createAttempted: stored.createAttempted,
            ...(stored.snapshot.shoppingListId
              ? { listId: stored.snapshot.shoppingListId }
              : {}),
            items: stored.snapshot.items.map(({ product_id, quantity }) => ({
              productId: product_id,
              quantity,
            })),
          });
        } catch (error) {
          const message =
            error instanceof NemligError && error.status === 429
              ? error.message
              : "Could not record this save safely. No Nemlig shopping list was created or changed.";
          if (previousSaveStatus === undefined) {
            delete stored.snapshot.saveStatus;
          } else {
            stored.snapshot.saveStatus = previousSaveStatus;
          }
          stored.snapshot.actionNotice = message;
          this.touch(owner, stored);
          throw new NemligError(message);
        }
      }
      providerStarted = true;
      const listId = await this.resolveDraftShoppingList(
        stored,
        listName,
        accountIdentity,
        signal,
        journal,
      );
      if (listId) {
        await this.populateDraftShoppingList(
          owner,
          stored,
          accountIdentity,
          signal,
          journal,
        );
      }
      this.touch(owner, stored);
      return structuredClone(stored.snapshot);
    } catch (error) {
      if (!providerStarted) {
        throw error;
      }
      stored.snapshot.saveStatus = stored.snapshot.shoppingListId
        ? "partial"
        : "uncertain";
      stored.snapshot.actionNotice ??=
        "Save was interrupted. Refresh the shopping list before continuing.";
      this.touch(owner, stored);
      if (signal?.aborted) {
        throw error;
      }
      return structuredClone(stored.snapshot);
    } finally {
      stored.busy = false;
    }
  }

  async update(
    owner: string,
    action: ProductReviewAction,
    signal?: AbortSignal,
    expectedDraftId?: string,
    journal?: ReviewOperationJournal,
  ): Promise<ProductReviewSnapshot> {
    if (action.kind === "save") {
      return this.save(owner, action.name, expectedDraftId, signal, journal);
    }
    if (action.kind === "update") {
      throw new NemligError(
        "Select a saved Nemlig shopping list to update it.",
      );
    }
    const stored = this.lock(owner, expectedDraftId);
    // Commit only after all validation and reads succeed, so bulk actions are atomic.
    const draft = structuredClone(stored.snapshot);
    const submissionSelection = (items: ReviewItem[]) =>
      JSON.stringify(
        items
          .map(({ product_id, quantity }) => [product_id, quantity])
          .sort(([left], [right]) => Number(left) - Number(right)),
      );
    const previousSubmissionSelection = submissionSelection(
      stored.snapshot.items,
    );
    const itemFor = (productId: number): ReviewItem => {
      const item = draft.items.find((row) => row.product_id === productId);
      if (!item) {
        throw new NemligError("Exact product is not in this Local basket.");
      }
      return item;
    };
    try {
      switch (action.kind) {
        case "accept":
        case "revisit": {
          if (
            !action.product_ids.length ||
            new Set(action.product_ids).size !== action.product_ids.length
          ) {
            throw new NemligError("Select unique exact products.");
          }
          action.product_ids.forEach(itemFor);
          for (const item of draft.items) {
            if (action.product_ids.includes(item.product_id)) {
              item.state = action.kind === "accept" ? "ready" : "needs-review";
            }
          }
          draft.destination =
            action.kind === "accept" ? "ready" : "needs-review";
          break;
        }
        case "remove": {
          if (
            !action.product_ids.length ||
            new Set(action.product_ids).size !== action.product_ids.length
          ) {
            throw new NemligError("Select unique exact products.");
          }
          action.product_ids.forEach(itemFor);
          draft.items = draft.items.filter(
            (item) => !action.product_ids.includes(item.product_id),
          );
          break;
        }
        case "add": {
          const existingIds = new Set(
            draft.items.map((item) => item.product_id),
          );
          const newProductCount = new Set(
            action.items
              .map((item) => item.product_id)
              .filter((id) => !existingIds.has(id)),
          ).size;
          if (
            !action.items.length ||
            action.items.some(
              (item) =>
                !validPositive(item.product_id) ||
                !validPositive(item.quantity),
            ) ||
            new Set(action.items.map((item) => item.product_id)).size !==
              action.items.length ||
            draft.items.length + newProductCount > MAX_DRAFT_PRODUCTS
          ) {
            throw new NemligError(
              `Add 1–${MAX_DRAFT_PRODUCTS} new unique exact products with positive integer quantities, up to ${MAX_DRAFT_PRODUCTS} products in total.`,
            );
          }
          const rows = await this.readItems(action.items, signal);
          for (const row of rows) {
            const existing = draft.items.find(
              (item) => item.product_id === row.product_id,
            );
            if (existing) {
              existing.quantity += row.quantity;
              existing.view = row.view;
            } else {
              draft.items.push(row);
            }
          }
          draft.destination = "ready";
          break;
        }
        case "quantity":
          if (!validPositive(action.quantity)) {
            throw new NemligError(
              "Quantity must be a positive integer. Use remove to delete a product.",
            );
          }
          itemFor(action.product_id).quantity = action.quantity;
          break;
        case "navigate":
          if (action.destination === "alternatives" && !draft.alternatives) {
            throw new NemligError("No alternatives are open.");
          }
          draft.destination = action.destination;
          break;
        case "alternatives": {
          const target = itemFor(action.product_id);
          if (action.limit !== undefined && !validPositive(action.limit)) {
            throw new NemligError(
              "Alternative limit must be a positive integer.",
            );
          }
          const results = await resolveDetailedProductSearch(
            this.client,
            action.query,
            action.limit,
            { signal },
          );
          const existingIds = new Set(
            draft.items.map((item) => item.product_id),
          );
          draft.alternatives = {
            product_id: target.product_id,
            origin: target.state,
            query: action.query,
            views: results.items
              .filter(
                (item) =>
                  item.productId === undefined ||
                  !existingIds.has(item.productId),
              )
              .slice(0, action.limit)
              .map((item) => createProductView(item, { kind: "details" })),
          };
          draft.destination = "alternatives";
          break;
        }
        case "replace": {
          const target = itemFor(action.product_id);
          if (draft.alternatives?.product_id !== target.product_id) {
            throw new NemligError(
              "Open alternatives for this exact product first.",
            );
          }
          const replacement = draft.alternatives.views.find(
            (view) =>
              view.status === "complete" &&
              view.product.id === action.replacement_id,
          );
          if (!replacement || !available(replacement)) {
            throw new NemligError(
              "Choose an available exact returned alternative.",
            );
          }
          if (
            draft.items.some(
              (item) =>
                item !== target && item.product_id === action.replacement_id,
            )
          ) {
            throw new NemligError(
              "This product already exists in the Local basket. Adjust its quantity instead.",
            );
          }
          target.product_id = action.replacement_id;
          target.view = replacement;
          target.state = "ready";
          draft.destination = "ready";
          delete draft.alternatives;
          break;
        }
      }
      if (
        draft.alternatives &&
        !draft.items.some(
          (item) => item.product_id === draft.alternatives!.product_id,
        )
      ) {
        if (draft.destination === "alternatives") {
          draft.destination = draft.alternatives.origin;
        }
        delete draft.alternatives;
      }
      this.get(owner, expectedDraftId); // Confirm the draft still exists after asynchronous reads.
      const quantityUnchanged =
        action.kind === "quantity" &&
        stored.snapshot.items.find(
          (item) => item.product_id === action.product_id,
        )?.quantity === action.quantity;
      const preserveSubmission =
        (draft.submission?.status === "submitted" && quantityUnchanged) ||
        draft.submission?.status === "uncertain" ||
        draft.submission?.status === "partial" ||
        (draft.submission?.status === "prepared" &&
          submissionSelection(draft.items) === previousSubmissionSelection);
      if (
        action.kind !== "navigate" &&
        action.kind !== "alternatives" &&
        !preserveSubmission
      ) {
        delete draft.submission;
        delete stored.proposalId;
      }
      stored.snapshot = draft;
      stored.lastActivityAt = this.now();
      if (draft.draftId) {
        draft.draftExpiresAt = stored.lastActivityAt + DRAFT_IDLE_TIMEOUT_MS;
        stored.snapshot.draftExpiresAt = draft.draftExpiresAt;
      }
      this.touch(owner, stored);
      return structuredClone(draft);
    } finally {
      stored.busy = false;
    }
  }

  private lock(owner: string, expectedDraftId?: string): StoredReview {
    const stored = this.get(owner, expectedDraftId);
    if (stored.busy) {
      throw new NemligError(
        "A Local basket operation is in progress. Refresh after it finishes.",
      );
    }
    stored.busy = true;
    this.touch(owner, stored);
    return stored;
  }

  async prepare(
    owner: string,
    _signal?: AbortSignal,
    expectedDraftId?: string,
  ): Promise<ProductReviewSnapshot> {
    const stored = this.get(owner, expectedDraftId);
    if (!stored.snapshot.shoppingListId || stored.snapshot.draftId) {
      throw new NemligError(
        "Save this draft as a Nemlig shopping list before submitting it.",
      );
    }
    if (
      stored.snapshot.shoppingListDirty ||
      stored.snapshot.updateStatus !== undefined
    ) {
      throw new NemligError(
        "Update the saved Nemlig shopping list and confirm the readback before submitting.",
      );
    }
    throw new NemligError(
      "Submit the confirmed saved shopping list directly; a separate review step is not needed.",
    );
  }

  // Keep target, dirty-state, and uncertain-outcome gates ordered in one check.
  // fallow-ignore-next-line complexity
  private requireSubmissionTarget(
    stored: StoredReview,
    expectedShoppingListId?: number,
  ): number {
    const listId = stored.snapshot.shoppingListId;
    if (listId === undefined) {
      throw new NemligError(
        "Save this draft as a Nemlig shopping list before submitting it.",
      );
    }
    if (listId !== expectedShoppingListId) {
      throw new NemligError(
        "Select the exact saved Nemlig shopping list before submitting.",
      );
    }
    if (
      stored.snapshot.saveStatus !== "saved" ||
      stored.snapshot.shoppingListDirty ||
      stored.snapshot.updateStatus !== undefined
    ) {
      throw new NemligError(
        "Update the saved Nemlig shopping list and confirm the readback before submitting.",
      );
    }
    if (
      stored.snapshot.submission?.status === "uncertain" ||
      stored.snapshot.submission?.status === "partial"
    ) {
      throw new NemligError(
        "Inspect the actual Nemlig basket before submitting this list again.",
      );
    }
    return listId;
  }

  // Replay returns the receipt and may finish cleanup; it never dispatches again.
  // fallow-ignore-next-line complexity
  private async replayNativeSubmission(
    stored: StoredReview,
    operationId: string,
    submissionId: string,
    signal: AbortSignal | undefined,
    journal: ReviewOperationJournal,
  ): Promise<
    { review: ProductReviewSnapshot; result: ApplyResult } | undefined
  > {
    const previous = await journal.read(operationId);
    if (
      previous &&
      !previous.completed &&
      previous.completedUntil === undefined &&
      previous.dispatchAttempted
    ) {
      throw new NemligError(
        "A previous basket transfer may have completed. Inspect the actual basket; this transfer will not be retried.",
      );
    }
    if (!previous?.completed || previous.generation !== submissionId) {
      return undefined;
    }
    const basket = await this.client.getCart!(signal);
    const cleanup =
      previous.cleanupStatus === "pending" ||
      previous.cleanupStatus === "uncertain"
        ? await this.cleanupNativeSubmissionSource(previous, journal, signal)
        : undefined;
    const cleanupWarning = cleanup?.warning ?? previous.cleanupWarning;
    stored.snapshot.submission = {
      submission_id: submissionId,
      status: "submitted",
      ...(cleanupWarning ? { cleanup_warning: cleanupWarning } : {}),
      expires_at: new Date(this.now() + 15 * 60 * 1000).toISOString(),
      review: {},
    };
    stored.snapshot.submissionAttempted = true;
    stored.snapshot.actionNotice =
      cleanupWarning ??
      "Nemlig confirmed this basket addition earlier; it was not submitted again.";
    return {
      review: structuredClone(stored.snapshot),
      result: {
        status: "completed",
        operation: "additions",
        replayed: true,
        ...(cleanupWarning ? { cleanup_warning: cleanupWarning } : {}),
        basket: {
          items: basket.items,
          products_price: basket.productsPrice,
          delivery_price: basket.deliveryPrice,
          number_of_products: basket.numberOfProducts,
          delivery_time: basket.deliveryTime,
        },
      },
    };
  }

  private async verifiedSubmissionBaseline(
    accountIdentity: string,
    signal?: AbortSignal,
  ): Promise<Basket> {
    const baseline = await this.client.getCart!(signal);
    const quantities = new Map<number, number>();
    for (const item of baseline.items) {
      if (
        item.id === undefined ||
        item.quantity === undefined ||
        !validPositive(item.id) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 0 ||
        quantities.has(item.id)
      ) {
        throw new NemligError(
          "The actual Nemlig basket could not be verified. No transfer was sent.",
        );
      }
      quantities.set(item.id, item.quantity);
    }
    if (this.client.providerIdentity!() !== accountIdentity) {
      throw new NemligError(
        "Nemlig account changed before submission. Refresh the list.",
      );
    }
    return baseline;
  }

  // Account, source fingerprint, basket baseline, and replay checks bind one approval.
  // fallow-ignore-next-line complexity
  private async prepareNativeSubmission(
    stored: StoredReview,
    listId: number,
    submissionId: string,
    operationId: string,
    accountIdentity: string,
    signal: AbortSignal | undefined,
    journal: ReviewOperationJournal,
  ): Promise<NativeListSubmissionPlan> {
    if (
      accountIdentity !== stored.accountIdentity ||
      !stored.nativeFingerprint
    ) {
      throw new NemligError(
        "Refresh this saved shopping list before submitting it.",
      );
    }
    const inventory = await this.getShoppingLists(signal);
    if (!inventory.some((list) => list.id === listId)) {
      throw new NemligError("Shopping list is unavailable or was deleted.");
    }
    const list = await this.client.getShoppingList!(listId, signal);
    const fingerprint = stored.nativeFingerprint;
    if (
      this.client.providerIdentity!() !== accountIdentity ||
      list.id !== listId ||
      list.name !== stored.snapshot.shoppingListName ||
      shoppingListFingerprint(list) !== fingerprint ||
      !sameQuantities(
        quantityMap(
          list.items,
          (item) => item.productId,
          (item) => item.quantity,
        ),
        reviewQuantities(stored.snapshot.items),
      )
    ) {
      console.warn(
        JSON.stringify({
          schema_version: 1,
          event: "native_shopping_list_source_changed",
        }),
      );
      stored.snapshot.actionNotice =
        "Nemlig changed this list. Refresh and review its current contents before submitting.";
      throw new NemligError(stored.snapshot.actionNotice);
    }
    const previous = await journal.read(operationId);
    if (
      previous?.completed &&
      sameShoppingListItems(previous.items, list.items)
    ) {
      throw new NemligError(
        "This exact shopping-list snapshot was already transferred. Update it before submitting another addition.",
      );
    }
    const baseline = await this.verifiedSubmissionBaseline(
      accountIdentity,
      signal,
    );
    return {
      operationId,
      submissionId,
      fingerprint,
      list,
      baseline,
      accountIdentity,
      operation: {
        operationId,
        generation: submissionId,
        accountIdentity,
        kind: "submit",
        cleanupStatus: "pending",
        name: list.name,
        listId,
        items: list.items.map(({ productId, quantity }) => ({
          productId,
          quantity,
        })),
        baseline: baseline.items.map((item) => ({
          productId: item.id!,
          quantity: item.quantity!,
        })),
      },
    };
  }

  private async markNativeSubmissionFailure(
    stored: StoredReview,
    error: unknown,
    operationId: string,
    submissionId: string,
    journal: ReviewOperationJournal,
  ): Promise<never> {
    const pending = await journal.read(operationId).catch(() => undefined);
    if (error instanceof BasketTransferNotDispatchedError) {
      const released = await journal
        .release?.(operationId, submissionId)
        .catch(() => false);
      if (released) {
        throw error;
      }
    }
    if (pending?.generation !== submissionId || !pending.dispatchAttempted) {
      throw error;
    }
    stored.snapshot.submission = {
      submission_id: submissionId,
      status: "uncertain",
      expires_at: new Date(this.now() + 15 * 60 * 1000).toISOString(),
      review: {},
    };
    stored.snapshot.submissionAttempted = true;
    stored.snapshot.actionNotice =
      error instanceof NativeTransferUnconfirmedError
        ? error.message
        : "Basket transfer may have completed. Inspect the actual Nemlig basket; do not submit again.";
    throw new NemligError(stored.snapshot.actionNotice);
  }

  // The destructive cleanup decision depends on ordered readback and receipt checks.
  // fallow-ignore-next-line complexity
  private async cleanupNativeSubmissionSource(
    operation: ReviewOperation,
    journal: ReviewOperationJournal,
    signal?: AbortSignal,
  ): Promise<NativeSourceCleanupResult> {
    let result: NativeSourceCleanupResult = {
      status: "uncertain",
      warning:
        "Nemlig confirmed the basket addition, but source-list cleanup could not be confirmed. Do not resubmit this addition.",
    };
    try {
      const inventory = await this.getShoppingLists(signal);
      if (this.client.providerIdentity!() !== operation.accountIdentity) {
        result = {
          status: "uncertain",
          warning:
            "Nemlig confirmed the basket addition, but the connected account changed before source-list cleanup. Inspect the list; do not resubmit.",
        };
      } else if (!inventory.some(({ id }) => id === operation.listId)) {
        result = { status: "deleted" };
      } else {
        const current = await this.client.getShoppingList!(
          operation.listId!,
          signal,
        );
        const state: NativeSourceCleanupState =
          this.client.providerIdentity!() !== operation.accountIdentity
            ? "uncertain"
            : current.id !== operation.listId ||
                current.name !== operation.name ||
                !sameShoppingListItems(operation.items, current.items)
              ? "changed"
              : "exact";
        if (state === "changed") {
          result = {
            status: "retained",
            warning:
              "Nemlig confirmed the basket addition, but the source list changed afterward. It was kept; review it before making changes.",
          };
        } else if (state === "exact" && this.client.deleteShoppingList) {
          if (signal?.aborted) {
            throw new NemligError(
              "Source-list cleanup was cancelled before deletion. Do not resubmit the verified basket addition.",
            );
          }
          try {
            await this.client.deleteShoppingList(operation.listId!, signal);
          } catch {
            // Readback below distinguishes a lost response from a failed delete.
          }
          const after = await this.getShoppingLists(signal);
          if (
            this.client.providerIdentity!() === operation.accountIdentity &&
            !after.some(({ id }) => id === operation.listId)
          ) {
            result = { status: "deleted" };
          } else {
            result = {
              status: "retained",
              warning:
                "Nemlig confirmed the basket addition, but source-list deletion was not confirmed. The list was kept; do not resubmit.",
            };
          }
        }
      }
    } catch {
      // The transfer is already verified; cleanup uncertainty must not invite replay.
    }
    const updated: ReviewOperation = {
      ...operation,
      cleanupStatus: result.status,
      cleanupWarning: result.warning,
    };
    try {
      await journal.write(updated);
      const saved = await journal.read(operation.operationId);
      if (
        saved?.generation !== operation.generation ||
        saved.cleanupStatus !== result.status ||
        saved.completed !== true
      ) {
        throw new Error("Cleanup receipt was not confirmed.");
      }
    } catch {
      return {
        status: "uncertain",
        warning:
          "Nemlig confirmed the basket addition, but source-list cleanup status could not be saved. Do not resubmit this addition.",
      };
    }
    return result;
  }

  // Transfer completion, cleanup, and uncertain-failure handling share one fence.
  // fallow-ignore-next-line complexity
  private async applyNativeSubmission(
    stored: StoredReview,
    plan: NativeListSubmissionPlan,
    signal: AbortSignal | undefined,
    journal: ReviewOperationJournal,
  ): Promise<{ review: ProductReviewSnapshot; result: ApplyResult }> {
    const proposals = this.proposals;
    const transfer = proposals?.transferNativeShoppingList;
    if (!proposals || !transfer) {
      throw new NemligError("Submission service unavailable.");
    }
    try {
      const result = await transfer.call(
        proposals,
        plan.list.id,
        plan.fingerprint,
        plan.list.items.map(({ productId, quantity }) => ({
          product_id: productId,
          quantity,
        })),
        plan.baseline,
        async () => {
          await journal.write(plan.operation);
          if (!(await journal.claim(plan.operationId, plan.submissionId))) {
            throw new NemligError(
              "A prior transfer attempt is fenced. Inspect the basket before continuing.",
            );
          }
        },
        signal,
      );
      await journal.complete(plan.operationId, plan.submissionId);
      const completed = await journal.read(plan.operationId);
      const isSubmitted =
        completed?.generation === plan.submissionId && completed.completed;
      const cleanup = isSubmitted
        ? await this.cleanupNativeSubmissionSource(completed, journal, signal)
        : undefined;
      stored.snapshot.submission = {
        submission_id: plan.submissionId,
        status: isSubmitted ? "submitted" : "uncertain",
        ...(cleanup?.warning ? { cleanup_warning: cleanup.warning } : {}),
        expires_at: new Date(this.now() + 15 * 60 * 1000).toISOString(),
        review: {},
      };
      stored.snapshot.submissionAttempted = true;
      stored.snapshot.actionNotice = isSubmitted
        ? (cleanup?.warning ??
          "Nemlig confirmed the basket addition and removed the source shopping list.")
        : "Nemlig confirmed the basket addition, but its recovery record could not be confirmed. Inspect the basket; do not submit again.";
      if (cleanup?.warning) {
        result.cleanup_warning = cleanup.warning;
      }
      return { review: structuredClone(stored.snapshot), result };
    } catch (error) {
      return this.markNativeSubmissionFailure(
        stored,
        error,
        plan.operationId,
        plan.submissionId,
        journal,
      );
    }
  }

  async submit(
    owner: string,
    submissionId: string,
    expectedShoppingListId?: number,
    signal?: AbortSignal,
    journal?: ReviewOperationJournal,
  ): Promise<{ review: ProductReviewSnapshot; result: ApplyResult }> {
    let stage: NativeSubmissionStage = "active_review";
    let stored: StoredReview | undefined;
    try {
      stored = this.lock(owner);
      stage = "target";
      const listId = this.requireSubmissionTarget(
        stored,
        expectedShoppingListId,
      );
      const activeJournal = this.requireNativeSubmissionJournal(journal);
      const operationId = submitOperationId(listId);
      const replay = await this.replayNativeSubmission(
        stored,
        operationId,
        submissionId,
        signal,
        activeJournal,
      );
      if (replay) {
        return replay;
      }
      const accountIdentity = this.client.providerIdentity!();
      stage = "preflight";
      const plan = await this.prepareNativeSubmission(
        stored,
        listId,
        submissionId,
        operationId,
        accountIdentity,
        signal,
        activeJournal,
      );
      stage = "transfer";
      return await this.applyNativeSubmission(
        stored,
        plan,
        signal,
        activeJournal,
      );
    } catch (error) {
      return failNativeSubmission(stage, error);
    } finally {
      if (stored) {
        stored.busy = false;
      }
    }
  }

  private requireNativeSubmissionJournal(
    journal?: ReviewOperationJournal,
  ): ReviewOperationJournal {
    if (
      !this.proposals?.transferNativeShoppingList ||
      !journal ||
      !this.client.getCart ||
      !this.client.providerIdentity ||
      !this.client.listShoppingLists ||
      !this.client.getShoppingList
    ) {
      throw new NemligError("Submission service unavailable.");
    }
    return journal;
  }
}
