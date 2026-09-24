import type { BasketProposalService, ApplyResult } from "./proposals.js";
import { randomUUID } from "node:crypto";
import { NemligError } from "./client.js";
import { isAuthenticationFailure, resolveDetailedProductSearch, type ProductDiscoveryClient } from "./product-discovery.js";
import { createProductView, type ProductView } from "./product-presentation.js";
import { runReadPool } from "./read-coordination.js";

export type ReviewDestination = "needs-review" | "basket" | "alternatives";
export interface ReviewItem {
  product_id: number;
  quantity: number;
  state: "needs-review" | "basket";
  view: ProductView;
}
export interface ProductReviewSnapshot {
  review_id: string;
  revision: number;
  expires_at: string;
  destination: ReviewDestination;
  items: ReviewItem[];
  submission?: { submission_id: string; status: "prepared" | "submitted" | "uncertain"; expires_at: string; review: Record<string, unknown> };
  alternatives?: { product_id: number; origin: "needs-review" | "basket"; query: string; views: ProductView[] };
}
export type ProductReviewAction =
  | { kind: "accept" | "remove"; product_ids: number[] }
  | { kind: "quantity"; product_id: number; quantity: number }
  | { kind: "navigate"; destination: ReviewDestination }
  | { kind: "alternatives"; product_id: number; query: string; limit?: number }
  | { kind: "replace"; product_id: number; replacement_id: number };
interface StoredReview { owner: string; busy: boolean; snapshot: ProductReviewSnapshot; proposalId?: string }
type ReviewProposals = Pick<BasketProposalService, "prepareAdditions" | "apply">;

const validPositive = (value: number): boolean => Number.isSafeInteger(value) && value > 0;
const available = (view: ProductView): boolean => view.status === "complete" && view.product.available === true;

/** Private, bounded, temporary state. Local edits cannot call a provider mutation. */
export class ProductReviewService {
  private readonly drafts = new Map<string, StoredReview>();
  private readonly now: () => number;
  private readonly proposals?: ReviewProposals;

  constructor(private readonly client: ProductDiscoveryClient, options: { now?: () => number; proposals?: ReviewProposals } = {}) {
    this.now = options.now ?? Date.now;
    this.proposals = options.proposals;
  }

  private expire(): void {
    for (const [id, draft] of this.drafts) {
      if (!draft.busy && Date.parse(draft.snapshot.expires_at) <= this.now()) this.drafts.delete(id);
    }
  }

  private get(owner: string, id: string): StoredReview {
    this.expire();
    const draft = this.drafts.get(id);
    if (!draft || draft.owner !== owner || Date.parse(draft.snapshot.expires_at) <= this.now()) {
      throw new NemligError("Temporary product review unavailable or expired. Start a new review explicitly.");
    }
    return draft;
  }

  show(owner: string, id: string): ProductReviewSnapshot {
    return structuredClone(this.get(owner, id).snapshot);
  }

  async start(owner: string, items: Array<{ product_id: number; quantity: number }>, signal?: AbortSignal): Promise<ProductReviewSnapshot> {
    this.expire();
    if (!items.length || items.length > 50 || new Set(items.map(i => i.product_id)).size !== items.length ||
      items.some(i => !validPositive(i.product_id) || !validPositive(i.quantity))) {
      throw new NemligError("Provide 1–50 unique exact products with positive integer quantities.");
    }
    const checkCapacity = () => {
      if ([...this.drafts.values()].filter(draft => draft.owner === owner).length >= 8) {
        throw new NemligError("Temporary review limit reached. Existing drafts expire after one hour.");
      }
    };
    checkCapacity();
    const rows = await runReadPool(items, async (item, readSignal): Promise<ReviewItem> => {
      let view: ProductView;
      try {
        const product = await this.client.getProduct(item.product_id, readSignal);
        if (product.id !== item.product_id) throw new NemligError("Product identity mismatch.");
        view = createProductView(product, { kind: "details" });
      } catch (error) {
        if (readSignal.aborted || isAuthenticationFailure(error)) throw error;
        view = { context: "details", status: "unavailable", product_id: item.product_id };
      }
      return { ...item, state: "needs-review", view };
    }, { signal });
    checkCapacity();
    const snapshot: ProductReviewSnapshot = {
      review_id: randomUUID(), revision: 1, expires_at: new Date(this.now() + 3_600_000).toISOString(),
      destination: "needs-review", items: rows,
    };
    this.drafts.set(snapshot.review_id, { owner, busy: false, snapshot });
    return structuredClone(snapshot);
  }

  async update(owner: string, id: string, revision: number, action: ProductReviewAction, signal?: AbortSignal): Promise<ProductReviewSnapshot> {
    const stored = this.lock(owner, id, revision);
    // Commit only after all validation and reads succeed, so bulk actions are atomic.
    const draft = structuredClone(stored.snapshot);
    const itemFor = (productId: number): ReviewItem => {
      const item = draft.items.find(row => row.product_id === productId);
      if (!item) throw new NemligError("Exact product is not in this review.");
      return item;
    };
    try {
      switch (action.kind) {
        case "accept":
        case "remove": {
          if (!action.product_ids.length || new Set(action.product_ids).size !== action.product_ids.length) throw new NemligError("Select unique exact products.");
          const selected = action.product_ids.map(itemFor);
          if (action.kind === "accept") {
            if (selected.some(item => !available(item.view))) throw new NemligError("Unavailable products cannot be accepted. Choose an available alternative.");
            selected.forEach(item => { item.state = "basket"; });
          } else {
            draft.items = draft.items.filter(item => !action.product_ids.includes(item.product_id));
          }
          break;
        }
        case "quantity":
          if (!validPositive(action.quantity)) throw new NemligError("Quantity must be a positive integer. Use remove to delete a product.");
          itemFor(action.product_id).quantity = action.quantity;
          break;
        case "navigate":
          if (action.destination === "alternatives" && !draft.alternatives) throw new NemligError("No alternatives are open.");
          draft.destination = action.destination;
          break;
        case "alternatives": {
          const target = itemFor(action.product_id);
          const limit = action.limit ?? 5;
          if (!validPositive(limit) || limit > 10) throw new NemligError("Alternative limit must be between 1 and 10.");
          const results = await resolveDetailedProductSearch(this.client, action.query, limit, { signal });
          draft.alternatives = { product_id: target.product_id, origin: target.state, query: action.query, views: results.items.slice(0, limit).map(item => createProductView(item, { kind: "details" })) };
          draft.destination = "alternatives";
          break;
        }
        case "replace": {
          const target = itemFor(action.product_id);
          if (draft.alternatives?.product_id !== target.product_id) throw new NemligError("Open alternatives for this exact product first.");
          const replacement = draft.alternatives.views.find(view => view.status === "complete" && view.product.id === action.replacement_id);
          if (!replacement || !available(replacement)) throw new NemligError("Choose an available exact returned alternative.");
          if (draft.items.some(item => item !== target && item.product_id === action.replacement_id)) throw new NemligError("This product already exists in the local review. Adjust its quantity instead.");
          target.product_id = action.replacement_id;
          target.view = replacement;
          target.state = "basket";
          draft.destination = draft.alternatives.origin;
          delete draft.alternatives;
          break;
        }
      }
      if (draft.alternatives && !draft.items.some(item => item.product_id === draft.alternatives!.product_id)) {
        if (draft.destination === "alternatives") draft.destination = draft.alternatives.origin;
        delete draft.alternatives;
      }
      this.get(owner, id); // Expiry also applies across asynchronous reads.
      if (action.kind !== "navigate" && action.kind !== "alternatives") {
        delete draft.submission;
        delete stored.proposalId;
      }
      draft.revision++;
      stored.snapshot = draft;
      return structuredClone(draft);
    } finally {
      stored.busy = false;
    }
  }

  private lock(owner: string, id: string, revision: number): StoredReview {
    const stored = this.get(owner, id);
    if (stored.busy) throw new NemligError("A review operation is in progress. Refresh after it finishes.");
    if (stored.snapshot.revision !== revision) throw new NemligError("Review revision is stale. Refresh before trying this action again.");
    stored.busy = true;
    return stored;
  }

  async prepare(owner: string, id: string, revision: number, signal?: AbortSignal): Promise<ProductReviewSnapshot> {
    if (!this.proposals) throw new NemligError("Submission service unavailable.");
    const stored = this.lock(owner, id, revision);
    try {
      const previous = stored.snapshot.submission;
      if (previous && previous.status !== "prepared") throw new NemligError("Inspect the actual Nemlig basket before deliberately editing and reviewing a new submission.");
      const items = stored.snapshot.items.filter(item => item.state === "basket");
      if (!items.length) throw new NemligError("Local Basket is empty. Accept products before preparing submission.");
      const proposal = await this.proposals.prepareAdditions(owner, items.map(({ product_id, quantity }) => ({ product_id, quantity })), { kind: "exact_review" }, { signal });
      this.get(owner, id);
      stored.proposalId = proposal.proposal_id;
      stored.snapshot.submission = { submission_id: randomUUID(), status: "prepared", expires_at: proposal.expires_at, review: structuredClone(proposal.review) };
      stored.snapshot.revision++;
      return structuredClone(stored.snapshot);
    } finally { stored.busy = false; }
  }

  /** Model-only entry point: call only after explicit approval of this exact submission. */
  async submit(owner: string, id: string, revision: number, submissionId: string): Promise<{ review: ProductReviewSnapshot; result: ApplyResult }> {
    if (!this.proposals) throw new NemligError("Submission service unavailable.");
    const stored = this.lock(owner, id, revision);
    try {
      const submission = stored.snapshot.submission;
      if (!submission || submission.status !== "prepared" || submission.submission_id !== submissionId || !stored.proposalId) {
        throw new NemligError("Submission is absent, changed, or already attempted. Refresh the review.");
      }
      if (Date.parse(submission.expires_at) <= this.now()) throw new NemligError("Submission expired. Prepare a fresh exact review for approval.");
      // Record uncertainty before crossing the provider boundary; never silently retry.
      submission.status = "uncertain";
      stored.snapshot.revision++;
      const result = await this.proposals.apply(owner, stored.proposalId, "additions");
      submission.status = "submitted";
      return { review: structuredClone(stored.snapshot), result };
    } finally { stored.busy = false; }
  }
}
