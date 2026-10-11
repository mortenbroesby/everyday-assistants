import {
  type BasketProposalService,
  type ApplyResult,
  VerifiedPartialAdditionsError,
} from "./proposals.js";
import { randomUUID } from "node:crypto";
import { NemligError } from "./nemlig-error.js";
import {
  ProductNotFoundError,
  shoppingListFingerprint,
  type ShoppingList,
  type ShoppingListOverview,
  type ShoppingListClient,
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
  LocalBasketEdit,
  LocalBasketSummary,
} from "./local-basket.js";

export type ReviewDestination = "needs-review" | "ready" | "alternatives";
/** Bounds transient draft payloads while allowing a full family shopping trip. */
export const MAX_DRAFT_PRODUCTS = 500;
const nativeListTransferUnavailable =
  "We cannot verify Nemlig will transfer the exact reviewed list unchanged. Basket additions are disabled until that guarantee is verified. No basket write was sent.";
const quantityMap = <Item>(
  items: readonly Item[],
  productId: (item: Item) => number,
  quantity: (item: Item) => number,
): Map<number, number> =>
  new Map(items.map((item) => [productId(item), quantity(item)]));
const reviewQuantities = (items: ReviewItem[]) =>
  quantityMap(
    items,
    (item) => item.product_id,
    (item) => item.quantity,
  );
export const DRAFT_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const MAX_DURABLE_REVIEW_CACHE = 8;
export interface ReviewItem {
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
  completedDraftId?: string;
  snapshot: ProductReviewSnapshot;
  proposalId?: string;
}
type ReviewProposals = Pick<
  BasketProposalService,
  "prepareAdditions" | "apply"
> &
  Partial<Pick<BasketProposalService, "prepareShoppingListAdditions">>;
type ReviewClient = ProductDiscoveryClient & Partial<ShoppingListClient>;
export interface LocalBasketRepository {
  mutate(command: LocalBasketCommand): Promise<unknown>;
}

const reviewKey = (owner: string, basketId: string): string =>
  `${owner}\0${basketId}`;
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

  // Serialize local edits, preserve explicit operation order, and revision-check provider reads.
  // fallow-ignore-next-line complexity
  async updateBasket(
    owner: string,
    basketId: string,
    action: ProductReviewAction,
    repository: LocalBasketRepository,
    signal?: AbortSignal,
  ): Promise<ProductReviewSnapshot> {
    const key = reviewKey(owner, basketId);
    if (this.basketOperations.has(key)) {
      throw new NemligError("A Local basket operation is in progress.");
    }
    this.basketOperations.add(key);
    try {
      let review = await this.showBasket(owner, basketId, repository, true);
      const current = localBasket(
        await repository.mutate({ kind: "read", basketId }),
      );
      if (current.submissionAttempted && action.kind !== "navigate") {
        throw new NemligError(
          "Inspect the actual Nemlig basket before changing this Local basket.",
        );
      }
      const updated = await this.update(key, action, signal);
      review = updated;
      let edit: LocalBasketEdit | undefined;
      if (action.kind === "quantity") {
        edit = {
          kind: "quantity",
          productId: action.product_id,
          quantity: action.quantity,
        };
      } else if (action.kind === "remove") {
        edit = { kind: "remove", productIds: action.product_ids };
      } else if (action.kind === "add") {
        edit = {
          kind: "append",
          lines: action.items.map((addition) => {
            const item = updated.items.find(
              (candidate) => candidate.product_id === addition.product_id,
            );
            if (!item) {
              throw new NemligError(
                "Exact product is not in this Local basket.",
              );
            }
            return {
              productId: addition.product_id,
              quantity: addition.quantity,
              view: item.view,
            };
          }),
        };
      } else if (action.kind === "replace") {
        const item = updated.items.find(
          (candidate) => candidate.product_id === action.replacement_id,
        );
        if (!item) {
          throw new NemligError(
            "Exact replacement is not in this Local basket.",
          );
        }
        edit = {
          kind: "replace",
          productId: action.product_id,
          line: {
            productId: action.replacement_id,
            quantity:
              current.lines.find((line) => line.productId === action.product_id)
                ?.quantity ?? 1,
            view: item.view,
          },
        };
      }
      if (edit) {
        const result = await repository.mutate({
          kind: "edit",
          basketId,
          edit,
          ...(action.kind === "add" || action.kind === "replace"
            ? { expectedRevision: current.revision }
            : {}),
        });
        const changed = localBasket(result);
        const next = this.drafts.get(key);
        review = {
          ...(next?.snapshot ?? updated),
          items: changed.lines.map((line) => ({
            product_id: line.productId,
            quantity: line.quantity,
            state: "ready" as const,
            view: structuredClone(line.view),
          })),
          basketId,
          revision: changed.revision,
          submissionAttempted: changed.submissionAttempted === true,
        };
        if (next) {
          next.snapshot = review;
          next.proposalId = undefined;
        }
      }
      return review;
    } finally {
      this.basketOperations.delete(key);
    }
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
        "Local basket unavailable. Show this conversation's current Local basket; never replay the failed edit. If none remains, ask before starting a new Local basket.",
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

  // Validate account, inventory, native identity, and rows before trusting a list ID.
  // fallow-ignore-next-line complexity
  async openShoppingList(
    owner: string,
    listId: number,
    signal?: AbortSignal,
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
    if (current?.busy) {
      throw new NemligError("A shopping-list operation is in progress.");
    }
    const lists = await this.getShoppingLists(signal);
    if (!lists.some((list) => list.id === listId)) {
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
    const rows = await this.readItems(
      list.items.map(({ productId, quantity }) => ({
        product_id: productId,
        quantity,
      })),
      signal,
    );
    if (this.client.providerIdentity() !== accountIdentity) {
      throw new NemligError(
        "Connected Nemlig account changed. Select a list again.",
      );
    }
    const snapshot: ProductReviewSnapshot = {
      shoppingListId: list.id,
      shoppingListName: list.name,
      saveStatus: "saved",
      destination: "ready",
      items: rows,
    };
    if (
      current?.accountIdentity === accountIdentity &&
      current.snapshot.shoppingListId === list.id &&
      (current.snapshot.shoppingListDirty || current.snapshot.updateStatus)
    ) {
      const fingerprint = shoppingListFingerprint(list);
      if (fingerprint !== current.nativeFingerprint) {
        current.snapshot.conflictItems = rows;
        current.snapshot.updateStatus = "partial";
        current.snapshot.actionNotice =
          "Nemlig changed this list while edits were pending. Current rows are shown alongside your staged edits; review both before continuing.";
      } else if (current.snapshot.updateStatus) {
        current.snapshot.conflictItems = rows;
      }
      this.touch(owner, current);
      return structuredClone(current.snapshot);
    }
    this.drafts.set(owner, {
      busy: false,
      accountIdentity,
      nativeFingerprint: shoppingListFingerprint(list),
      nativeItems: list.items.map((item) => ({ ...item })),
      snapshot,
    });
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
      current.id !== listId ||
      current.name !== stored.snapshot.shoppingListName
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
    } else {
      stored.snapshot.items = rows;
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
      const accountIdentity = this.client.providerIdentity();
      if (
        stored.accountIdentity !== accountIdentity ||
        !stored.nativeFingerprint ||
        stored.snapshot.actionNotice
      ) {
        throw new NemligError(
          "Refresh this shopping list before making another change.",
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
      );
    } finally {
      stored.busy = false;
    }
  }

  private async persistNativeListUpdate(
    owner: string,
    stored: StoredReview,
    listId: number,
    current: ShoppingList,
    accountIdentity: string,
    signal?: AbortSignal,
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
    );
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
    stored.snapshot = next;
    stored.snapshot.saveStatus = "saved";
    stored.nativeFingerprint = shoppingListFingerprint(saved);
    stored.nativeItems = saved.items.map((item) => ({ ...item }));
    stored.snapshot.shoppingListDirty = false;
    delete stored.snapshot.updateStatus;
    delete stored.snapshot.actionNotice;
    this.touch(owner, stored);
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
    stored.createAttempted = true;
    stored.snapshot.shoppingListName = name;
    stored.snapshot.saveProgress = {
      completed: 0,
      total: stored.snapshot.items.length,
    };
    try {
      const listId = await this.client.createShoppingList(name, signal);
      stored.snapshot.shoppingListId = listId;
      stored.snapshot.saveStatus = "partial";
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

  // Keep reconciliation, missing-row writes, and exact readback in one recovery protocol.
  // fallow-ignore-next-line complexity
  private async populateDraftShoppingList(
    owner: string,
    stored: StoredReview,
    accountIdentity: string,
    signal?: AbortSignal,
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
    const markPartial = (notice: string, completed: number) => {
      stored.snapshot.saveStatus = "partial";
      stored.snapshot.saveProgress = {
        completed,
        total: stored.snapshot.items.length,
      };
      stored.snapshot.actionNotice = notice;
      this.touch(owner, stored);
    };
    const current = await this.client.getShoppingList(listId, signal);
    if (
      this.client.providerIdentity?.() !== accountIdentity ||
      current.id !== listId ||
      current.name !== listName
    ) {
      markPartial(
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
      markPartial(
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
    for (const item of stored.snapshot.items) {
      if (present.has(item.product_id)) {
        continue;
      }
      try {
        if (signal?.aborted) {
          throw signal.reason ?? new NemligError("Save was cancelled.");
        }
        await this.client.updateShoppingListProduct(
          listId,
          item.product_id,
          item.quantity,
          signal,
        );
      } catch (error) {
        markPartial(
          `Saved ${completed} of ${stored.snapshot.items.length} products. Refresh and continue saving to reconcile the same list.`,
          completed,
        );
        if (signal?.aborted) {
          throw error;
        }
        return;
      }
      present.set(item.product_id, item.quantity);
      completed += 1;
      stored.snapshot.saveProgress = {
        completed,
        total: stored.snapshot.items.length,
      };
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
      markPartial(
        `Nemlig confirmed ${completed} of ${stored.snapshot.items.length} products. Refresh the list before continuing.`,
        Math.min(present.size, stored.snapshot.items.length),
      );
      return;
    }
    stored.snapshot.saveStatus = "saved";
    stored.nativeFingerprint = shoppingListFingerprint(saved);
    stored.nativeItems = saved.items.map((item) => ({ ...item }));
    stored.completedDraftId = stored.snapshot.draftId;
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
  ): Promise<ProductReviewSnapshot> {
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
      stored.snapshot.saveStatus = "saving";
      providerStarted = true;
      const listId = await this.resolveDraftShoppingList(
        stored,
        listName,
        accountIdentity,
        signal,
      );
      if (listId) {
        await this.populateDraftShoppingList(
          owner,
          stored,
          accountIdentity,
          signal,
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
  ): Promise<ProductReviewSnapshot> {
    if (action.kind === "save") {
      return this.save(owner, action.name, expectedDraftId, signal);
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

  private rejectNativeListTransfer(
    owner: string,
    stored: StoredReview,
    expectedShoppingListId: number | undefined,
    requireExactTarget: boolean,
  ): never {
    if (
      stored.snapshot.shoppingListDirty ||
      stored.snapshot.updateStatus !== undefined
    ) {
      throw new NemligError(
        "Update the saved Nemlig shopping list and confirm the readback before submitting.",
      );
    }
    const listId = stored.snapshot.shoppingListId;
    if (listId === undefined || stored.snapshot.saveStatus !== "saved") {
      throw new NemligError(
        "Save this draft as a Nemlig shopping list before reviewing basket additions.",
      );
    }
    if (requireExactTarget && listId !== expectedShoppingListId) {
      throw new NemligError(
        "Select the exact saved Nemlig shopping list before adding it to the basket.",
      );
    }
    stored.snapshot.submission = undefined;
    stored.proposalId = undefined;
    stored.snapshot.actionNotice = nativeListTransferUnavailable;
    this.touch(owner, stored);
    throw new NemligError(nativeListTransferUnavailable);
  }

  async prepare(
    owner: string,
    _signal?: AbortSignal,
    expectedDraftId?: string,
  ): Promise<ProductReviewSnapshot> {
    const stored = this.lock(owner, expectedDraftId);
    try {
      return this.rejectNativeListTransfer(owner, stored, undefined, false);
    } finally {
      stored.busy = false;
    }
  }

  /** Native-list submission is blocked pending the transfer decision. */
  async submit(
    owner: string,
    _submissionId: string,
    expectedShoppingListId?: number,
    _signal?: AbortSignal,
  ): Promise<{ review: ProductReviewSnapshot; result: ApplyResult }> {
    if (!this.proposals) {
      throw new NemligError("Submission service unavailable.");
    }
    const stored = this.lock(owner);
    try {
      return this.rejectNativeListTransfer(
        owner,
        stored,
        expectedShoppingListId,
        true,
      );
    } finally {
      stored.busy = false;
    }
  }
}
