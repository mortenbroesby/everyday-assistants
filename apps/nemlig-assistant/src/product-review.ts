import {
  type BasketProposalService,
  type ApplyResult,
  VerifiedPartialAdditionsError,
} from "./proposals.js";
import { randomUUID } from "node:crypto";
import { NemligError } from "./nemlig-error.js";
import { ProductNotFoundError } from "./client.js";
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
const MAX_DURABLE_REVIEW_CACHE = 8;
export interface ReviewItem {
  product_id: number;
  quantity: number;
  state: "needs-review" | "ready";
  view: ProductView;
}
export interface ProductReviewSnapshot {
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
  | { kind: "accept" | "remove" | "revisit"; product_ids: number[] }
  | { kind: "add"; items: Array<{ product_id: number; quantity: number }> }
  | { kind: "quantity"; product_id: number; quantity: number }
  | { kind: "navigate"; destination: ReviewDestination }
  | { kind: "alternatives"; product_id: number; query: string; limit?: number }
  | { kind: "replace"; product_id: number; replacement_id: number };
interface StoredReview {
  busy: boolean;
  snapshot: ProductReviewSnapshot;
  proposalId?: string;
}
type ReviewProposals = Pick<
  BasketProposalService,
  "prepareAdditions" | "apply"
>;
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
  private readonly startingOwners = new Set<string>();
  private readonly basketOperations = new Set<string>();
  private readonly proposals?: ReviewProposals;
  private readonly now: () => number;

  constructor(
    private readonly client: ProductDiscoveryClient,
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
        const proposal = await this.proposals.prepareAdditions(
          owner,
          basket.lines.map(({ productId, quantity }) => ({
            product_id: productId,
            quantity,
          })),
          { kind: "exact_review" },
          { signal, freshProducts: true },
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

  private get(owner: string): StoredReview {
    const draft = this.drafts.get(owner);
    if (!draft) {
      throw new NemligError(
        "Local basket unavailable. Show this conversation's current Local basket; never replay the failed edit. If none remains, ask before starting a new Local basket.",
      );
    }
    return draft;
  }

  active(owner: string): ProductReviewSnapshot | undefined {
    const stored = this.drafts.get(owner);
    if (!stored) {
      return undefined;
    }
    this.touch(owner, stored);
    return structuredClone(stored.snapshot);
  }

  end(owner: string): void {
    const stored = this.lock(owner);
    this.drafts.delete(owner);
    stored.busy = false;
  }

  async start(
    owner: string,
    items: Array<{ product_id: number; quantity: number }>,
    signal?: AbortSignal,
  ): Promise<ProductReviewSnapshot> {
    const active = this.drafts.get(owner);
    if (active) {
      this.touch(owner, active);
      return structuredClone(active.snapshot);
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
      const snapshot: ProductReviewSnapshot = {
        destination: "ready",
        items: rows,
      };
      this.drafts.set(owner, { busy: false, snapshot });
      return structuredClone(snapshot);
    } finally {
      this.startingOwners.delete(owner);
    }
  }

  async update(
    owner: string,
    action: ProductReviewAction,
    signal?: AbortSignal,
  ): Promise<ProductReviewSnapshot> {
    const stored = this.lock(owner);
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
        case "revisit":
          throw new NemligError(
            "This legacy selection action is no longer supported. Every Local basket item is included in whole-list submission.",
          );
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
          if (action.destination === "needs-review") {
            throw new NemligError("The Local basket has one product list.");
          }
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
      this.get(owner); // Confirm the draft still exists after asynchronous reads.
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
      this.touch(owner, stored);
      return structuredClone(draft);
    } finally {
      stored.busy = false;
    }
  }

  private lock(owner: string): StoredReview {
    const stored = this.get(owner);
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
    signal?: AbortSignal,
  ): Promise<ProductReviewSnapshot> {
    if (!this.proposals) {
      throw new NemligError("Submission service unavailable.");
    }
    const stored = this.lock(owner);
    try {
      const previous = stored.snapshot.submission;
      if (previous && previous.status !== "prepared") {
        throw new NemligError(
          "Inspect the actual Nemlig basket before deliberately editing and reviewing a new submission.",
        );
      }
      const items = stored.snapshot.items;
      if (!items.length) {
        throw new NemligError("The Local basket is empty.");
      }
      if (
        items.some((item) =>
          item.view.status === "unavailable"
            ? item.view.missing !== true
            : item.view.product.available === undefined,
        )
      ) {
        throw new NemligError(
          "The Local basket has unavailable or unresolved product details. Review them before submitting.",
        );
      }
      const proposal = await this.proposals.prepareAdditions(
        owner,
        items.map(({ product_id, quantity }) => ({ product_id, quantity })),
        { kind: "exact_review" },
        { signal, freshProducts: true },
      );
      this.get(owner);
      stored.proposalId = proposal.proposal_id;
      stored.snapshot.submission = {
        submission_id: randomUUID(),
        status: "prepared",
        expires_at: proposal.expires_at,
        review: structuredClone(proposal.review),
      };
      return structuredClone(stored.snapshot);
    } finally {
      stored.busy = false;
    }
  }

  /** Call only after explicit conversational or viewer approval of this exact submission. */
  async submit(
    owner: string,
    submissionId: string,
  ): Promise<{ review: ProductReviewSnapshot; result: ApplyResult }> {
    if (!this.proposals) {
      throw new NemligError("Submission service unavailable.");
    }
    const stored = this.lock(owner);
    try {
      const { proposalId, submission } = requirePreparedSubmission(
        stored.snapshot.submission,
        submissionId,
        stored.proposalId,
        this.now(),
      );
      // Record uncertainty before crossing the provider boundary; never silently retry.
      submission.status = "uncertain";
      let result: ApplyResult;
      try {
        result = await this.proposals.apply(owner, proposalId, "additions");
      } catch (error) {
        if (error instanceof VerifiedPartialAdditionsError) {
          submission.status = "partial";
          submission.verified_additions = error.verifiedAdditions;
        }
        throw error;
      }
      submission.status = "submitted";
      submission.skipped_products = result.skipped_products;
      submission.verified_additions = result.verified_additions;
      return { review: structuredClone(stored.snapshot), result };
    } finally {
      stored.busy = false;
    }
  }
}
