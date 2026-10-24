import {
  basketPayload,
  type ApplyResult,
  NativeTransferUnconfirmedError,
} from "./basket-result.js";
import { randomUUID } from "node:crypto";
import { NemligError } from "./nemlig-error.js";
import {
  ProductNotFoundError,
  type Basket,
  type BasketAddition,
  type Product,
  type ShoppingList,
  type ShoppingListOverview,
  type ShoppingClient,
  type ShoppingListClient,
} from "./client.js";
import {
  isAuthenticationFailure,
  resolveDetailedProductSearch,
  type ProductDiscoveryClient,
} from "./product-discovery.js";
import { createProductView, type ProductView } from "./product-presentation.js";
import type { ReviewItem, ReviewSnapshot } from "./review-schema.js";
import { runReadPool } from "./read-coordination.js";
import type { LocalBasketCommand, ReviewOperation } from "./local-basket.js";

export type ReviewDestination = ReviewSnapshot["destination"];
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
const basketOperationItems = (basket: Basket) => {
  const seen = new Set<number>();
  const items: Array<{ productId: number; quantity: number }> = [];
  for (const item of basket.items) {
    if (
      !validPositive(item.id ?? 0) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity! < 0 ||
      seen.has(item.id!)
    ) {
      throw new NemligError(
        "The current basket cannot be bound safely to a provider write.",
      );
    }
    seen.add(item.id!);
    if (item.quantity! > 0) {
      items.push({ productId: item.id!, quantity: item.quantity! });
    }
  }
  return items;
};
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
const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
export const DRAFT_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
export type ProductReviewSnapshot = ReviewSnapshot;
export interface ReviewedShoppingList {
  name: string;
  items: Array<{ product_id: number; quantity: number }>;
}
export type ProductReviewAction =
  | { kind: "accept" | "remove" | "revisit"; product_ids: number[] }
  | { kind: "add"; items: Array<{ product_id: number; quantity: number }> }
  | { kind: "quantity"; product_id: number; quantity: number }
  | { kind: "discard_pending_update" }
  | { kind: "navigate"; destination: ReviewDestination }
  | {
      kind: "alternatives";
      product_id: number;
      query: string;
      limit?: number;
      suggested?: boolean;
    }
  | { kind: "replace"; product_id: number; replacement_id: number };
interface StoredReview {
  busy: boolean;
  operationStatus?: "editing" | "submitting";
  lastActivityAt?: number;
  accountIdentity?: string;
  directBasketSaveAttempted?: boolean;
  snapshot: ProductReviewSnapshot;
}
const markReviewSubmissionUncertain = (
  stored: StoredReview,
  submissionId: string,
  expiresAt: string,
  notice: string,
): void => {
  stored.snapshot.submission = {
    submission_id: submissionId,
    status: "uncertain",
    expires_at: expiresAt,
    review: {},
  };
  stored.snapshot.submissionAttempted = true;
  stored.snapshot.actionNotice = notice;
};
type ReviewClient = ProductDiscoveryClient &
  Partial<
    Pick<
      ShoppingListClient,
      "providerIdentity" | "listShoppingLists" | "getShoppingList"
    >
  > &
  Partial<
    Pick<
      ShoppingClient,
      | "getFreshProduct"
      | "getCart"
      | "addManyToCart"
      | "createShoppingListFromBasket"
    >
  >;
export type ReviewJournalCommand = Extract<
  LocalBasketCommand,
  { kind: `review-operation-${string}` }
>;
export interface ReviewJournalRepository {
  mutate(command: ReviewJournalCommand): Promise<unknown>;
}
type DirectReviewOperationIntent = Pick<
  ReviewOperation,
  | "operationId"
  | "generation"
  | "accountIdentity"
  | "name"
  | "items"
  | "baseline"
> & { kind: "submit" | "basket-save" };
export interface ReviewOperationJournal {
  // Reads include historical native-list receipts; current writes do not create them.
  read(operationId: string): Promise<ReviewOperation | undefined>;
  claim(operationId: string, generation: string): Promise<boolean>;
  write(operation: DirectReviewOperationIntent): Promise<void>;
  complete(operationId: string, generation: string): Promise<void | boolean>;
}

const validPositive = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;

const sameReviewedProduct = (reviewed: ProductView, fresh: ProductView) => {
  if (reviewed.status !== "complete" || fresh.status !== "complete") {
    return false;
  }
  return (
    reviewed.product.id === fresh.product.id &&
    reviewed.product.name === fresh.product.name &&
    reviewed.product.brand === fresh.product.brand &&
    reviewed.product.unit === fresh.product.unit &&
    reviewed.product.unit_size === fresh.product.unit_size
  );
};

const checkFreshReviewItem = (item: ReviewItem, current: Product) => {
  const freshView = createProductView(current, { kind: "details" });
  if (
    current.id !== item.product_id ||
    !sameReviewedProduct(item.view, freshView)
  ) {
    throw new NemligError(
      "A reviewed product changed or could not be validated. Refresh and review it before submitting; no basket write was sent.",
    );
  }
  if (current.available === false) {
    return {
      kind: "skip" as const,
      product_id: item.product_id,
      name:
        (item.view.status === "complete"
          ? item.view.product.name
          : undefined) ??
        current.name ??
        `Product ${item.product_id}`,
    };
  }
  if (current.available !== true) {
    throw new NemligError(
      "A reviewed product changed or could not be validated. Refresh and review it before submitting; no basket write was sent.",
    );
  }
  return {
    kind: "add" as const,
    addition: { productId: item.product_id, quantity: item.quantity },
  };
};

const directDraftItemsFromShoppingList = (
  items: ShoppingList["items"],
): Array<{ product_id: number; quantity: number }> => {
  const draftItems = reviewItemInputs(items);
  if (
    !draftItems.length ||
    draftItems.length > MAX_DRAFT_PRODUCTS ||
    new Set(draftItems.map(({ product_id }) => product_id)).size !==
      draftItems.length ||
    draftItems.some(
      ({ product_id, quantity }) =>
        !validPositive(product_id) || !validPositive(quantity),
    )
  ) {
    throw new NemligError(
      "The selected shopping list has invalid or unsupported product rows and was not loaded.",
    );
  }
  return draftItems;
};
const available = (view: ProductView): boolean =>
  view.status === "complete" && view.product.available === true;
/** Private, bounded, temporary state. Local edits cannot call a provider mutation. */
export class ProductReviewService {
  private readonly drafts = new Map<string, StoredReview>();
  private readonly expiredDraftIds = new Set<string>();
  private readonly startingOwners = new Set<string>();
  private readonly now: () => number;

  constructor(
    private readonly client: ReviewClient,
    options: {
      now?: () => number;
    } = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  private touch(owner: string, stored: StoredReview): void {
    this.drafts.delete(owner);
    this.drafts.set(owner, stored);
  }

  // Keep every state that can represent unresolved user or provider work.
  // fallow-ignore-next-line complexity
  private isProtected(stored: StoredReview): boolean {
    const { snapshot } = stored;
    return (
      stored.busy ||
      (snapshot.submissionAttempted === true &&
        snapshot.submission?.status !== "submitted") ||
      ["prepared", "uncertain", "partial"].includes(
        snapshot.submission?.status ?? "",
      )
    );
  }

  private shouldExpire(
    owner: string,
    stored: StoredReview,
    now: number,
  ): boolean {
    const { snapshot } = stored;
    return (
      !this.startingOwners.has(owner) &&
      !this.isProtected(stored) &&
      now - (stored.lastActivityAt ?? 0) >= DRAFT_IDLE_TIMEOUT_MS &&
      snapshot.draftId !== undefined
    );
  }

  private pruneExpiredReviews(): void {
    const now = this.now();
    for (const [owner, stored] of this.drafts) {
      if (!this.shouldExpire(owner, stored, now)) {
        continue;
      }
      this.expireDraft(owner, stored);
    }
  }

  private makeRoom(owner: string): void {
    this.pruneExpiredReviews();
    const occupied = () =>
      this.drafts.size +
      [...this.startingOwners].filter((pending) => !this.drafts.has(pending))
        .length;
    if (this.drafts.has(owner) || occupied() < 8) {
      return;
    }
    throw new NemligError(
      "Active review limit reached. Finish or resolve an existing review before opening another.",
    );
  }

  private reserve(owner: string): void {
    if (this.startingOwners.has(owner)) {
      throw new NemligError(
        "A review is already opening. Refresh it after the current request finishes.",
      );
    }
    this.makeRoom(owner);
    this.startingOwners.add(owner);
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

  // Expiry, ownership, and stale-card checks must pass before returning draft state.
  // fallow-ignore-next-line complexity
  private get(owner: string, expectedDraftId?: string): StoredReview {
    let draft = this.drafts.get(owner);
    if (draft && this.shouldExpire(owner, draft, this.now())) {
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
    if (this.shouldExpire(owner, stored, this.now())) {
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
    const snapshot = structuredClone(stored.snapshot);
    if (stored.operationStatus) {
      snapshot.operationStatus = stored.operationStatus;
    }
    return snapshot;
  }

  reviewContextOwner(reviewContextId: string):
    | {
        owner: string;
        shoppingListId?: number;
        draftId?: string;
      }
    | undefined {
    this.pruneExpiredReviews();
    for (const [owner, stored] of this.drafts) {
      const { shoppingListId, draftId } = stored.snapshot;
      if (
        stored.snapshot.reviewContextId === reviewContextId &&
        (shoppingListId !== undefined ||
          (stored.snapshot.basketMode === "direct-basket" && draftId))
      ) {
        return {
          owner,
          ...(shoppingListId === undefined ? {} : { shoppingListId }),
          ...(draftId === undefined ? {} : { draftId }),
        };
      }
    }
    return undefined;
  }

  end(owner: string, expectedDraftId?: string): void {
    const stored = this.lock(owner, expectedDraftId);
    this.drafts.delete(owner);
    this.unlock(stored);
  }

  // Keep expiry, exact-intent reuse, and unresolved-write protection together.
  // fallow-ignore-next-line complexity
  private reuseActiveDraft(
    owner: string,
    items: Array<{ product_id: number; quantity: number }>,
  ): ProductReviewSnapshot | undefined {
    if (this.startingOwners.has(owner)) {
      throw new NemligError(
        "A Local basket is starting. Refresh it after the current request finishes.",
      );
    }
    const active = this.drafts.get(owner);
    if (active?.busy) {
      throw new NemligError(
        "A basket operation is in progress. Refresh it after the current request finishes.",
      );
    }
    if (!active) {
      return undefined;
    }
    if (this.shouldExpire(owner, active, this.now())) {
      this.expireDraft(owner, active);
      return undefined;
    }
    const sameIntent = sameQuantities(
      quantityMap(
        active.snapshot.items,
        (item) => item.product_id,
        (item) => item.quantity,
      ),
      quantityMap(
        items,
        (item) => item.product_id,
        (item) => item.quantity,
      ),
    );
    const alreadySubmitted =
      active.snapshot.submissionAttempted === true &&
      active.snapshot.submission?.status === "submitted";
    if (sameIntent && !alreadySubmitted) {
      this.touch(owner, active);
      return structuredClone(active.snapshot);
    }
    if (this.isProtected(active)) {
      throw new NemligError(
        "A basket submission is unconfirmed. Resolve it before starting another draft.",
      );
    }
    return undefined;
  }

  // Start serializes expiry, creation, and product hydration for one owner.
  // fallow-ignore-next-line complexity
  private async start(
    owner: string,
    items: Array<{ product_id: number; quantity: number }>,
    signal?: AbortSignal,
  ): Promise<ProductReviewSnapshot> {
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
    const reused = this.reuseActiveDraft(owner, items);
    if (reused) {
      return reused;
    }
    const active = this.drafts.get(owner);
    this.reserve(owner);
    if (active && this.drafts.get(owner) === active) {
      active.busy = true;
    }
    try {
      const rows = await this.readItems(items, signal);
      const createdAt = this.now();
      const snapshot: ProductReviewSnapshot = {
        basketMode: "direct-basket",
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
    } catch (error) {
      if (active?.busy && this.drafts.get(owner) === active) {
        active.busy = false;
      }
      throw error;
    } finally {
      this.startingOwners.delete(owner);
    }
  }

  async startDirectBasket(
    owner: string,
    items: Array<{ product_id: number; quantity: number }>,
    signal?: AbortSignal,
  ): Promise<ProductReviewSnapshot> {
    if (!this.client.providerIdentity) {
      throw new NemligError("Direct basket identity is unavailable.");
    }
    const accountIdentity = this.client.providerIdentity();
    const current = this.drafts.get(owner);
    if (
      current?.snapshot.basketMode === "direct-basket" &&
      current.accountIdentity !== accountIdentity &&
      this.active(owner)
    ) {
      throw new NemligError(
        "Reconnect to the Nemlig account that owns this direct basket draft.",
      );
    }
    const snapshot = await this.start(owner, items, signal);
    const stored = this.get(owner, snapshot.draftId);
    if (
      stored.accountIdentity !== undefined &&
      stored.accountIdentity !== accountIdentity
    ) {
      throw new NemligError(
        "Nemlig account changed while preparing the direct basket draft.",
      );
    }
    stored.accountIdentity = accountIdentity;
    stored.snapshot.reviewContextId ??= randomUUID();
    this.touch(owner, stored);
    return structuredClone(stored.snapshot);
  }

  async loadShoppingListIntoDirectBasket(
    owner: string,
    shoppingListId: number,
    signal?: AbortSignal,
  ): Promise<ProductReviewSnapshot> {
    const { source, accountIdentity } = await this.readSavedListSource(
      shoppingListId,
      signal,
    );
    const items = directDraftItemsFromShoppingList(source.items);
    const current = this.active(owner);
    if (
      current?.basketMode === "direct-basket" &&
      current.submission?.status === "submitted"
    ) {
      this.end(owner, current.draftId);
    }
    const draft = await this.startDirectBasket(owner, items, signal);
    if (this.client.providerIdentity!() !== accountIdentity) {
      this.end(owner, draft.draftId);
      throw new NemligError(
        "Nemlig account changed while binding the loaded list to a temporary draft.",
      );
    }
    const stored = this.get(owner, draft.draftId);
    stored.snapshot.shoppingListName = source.name;
    stored.snapshot.actionNotice = `Loaded ${source.name} into a temporary draft. The saved shopping list remains unchanged.`;
    this.touch(owner, stored);
    return structuredClone(stored.snapshot);
  }

  private async readSavedListSource(
    shoppingListId: number,
    signal?: AbortSignal,
  ): Promise<{ source: ShoppingList; accountIdentity: string }> {
    if (!validPositive(shoppingListId) || !this.client.getShoppingList) {
      throw new NemligError("The selected shopping list cannot be loaded.");
    }
    if (!this.client.providerIdentity) {
      throw new NemligError("Nemlig account identity is unavailable.");
    }
    const accountIdentity = this.client.providerIdentity();
    const source = await this.client.getShoppingList(shoppingListId, signal);
    if (this.client.providerIdentity() !== accountIdentity) {
      throw new NemligError(
        "Nemlig account changed while loading the saved shopping list.",
      );
    }
    if (source.id !== shoppingListId) {
      throw new NemligError(
        "Nemlig returned a different shopping list than the selected source.",
      );
    }
    return { source, accountIdentity };
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

  async update(
    owner: string,
    action: ProductReviewAction,
    signal?: AbortSignal,
    expectedDraftId?: string,
  ): Promise<ProductReviewSnapshot> {
    const stored = this.lock(owner, expectedDraftId, "editing");
    if (
      stored.snapshot.basketMode === "direct-basket" &&
      stored.snapshot.submissionAttempted === true &&
      stored.snapshot.submission?.status === "submitted" &&
      action.kind !== "navigate"
    ) {
      this.unlock(stored);
      throw new NemligError(
        "This direct basket draft has already been submitted. Start a new draft before making further changes.",
      );
    }
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
          const sourceProduct =
            target.view.status === "complete" ? target.view.product : undefined;
          const sourceSubcategory =
            sourceProduct?.subcategory?.trim().toLocaleLowerCase("da-DK") ?? "";
          const sourceGroup =
            sourceSubcategory ||
            sourceProduct?.category?.trim().toLocaleLowerCase("da-DK") ||
            "";
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
              .filter(
                (item) =>
                  !action.suggested ||
                  !sourceGroup ||
                  (item.status === "hydrated" &&
                    (sourceSubcategory
                      ? item.product.subcategory
                      : item.product.category
                    )
                      ?.trim()
                      .toLocaleLowerCase("da-DK") === sourceGroup),
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
      this.unlock(stored);
    }
  }

  private lock(
    owner: string,
    expectedDraftId?: string,
    operationStatus?: StoredReview["operationStatus"],
  ): StoredReview {
    if (this.startingOwners.has(owner)) {
      throw new NemligError("A review is opening. Refresh after it finishes.");
    }
    const stored = this.get(owner, expectedDraftId);
    if (stored.busy) {
      throw new NemligError(
        "A Local basket operation is in progress. Refresh after it finishes.",
      );
    }
    stored.busy = true;
    stored.operationStatus =
      stored.snapshot.basketMode === "direct-basket"
        ? operationStatus
        : undefined;
    this.touch(owner, stored);
    return stored;
  }

  private unlock(stored: StoredReview): void {
    stored.busy = false;
    stored.operationStatus = undefined;
  }

  // Keep review binding, dispatch claim, account check, receipt, and uncertainty
  // transition together so no caller can accidentally split the no-replay flow.
  // fallow-ignore-next-line complexity
  async submitDirectBasket(
    owner: string,
    draftId: string,
    submissionId: string,
    reviewedItems: Array<{ product_id: number; quantity: number }>,
    signal: AbortSignal | undefined,
    journal: ReviewOperationJournal | undefined,
  ): Promise<{ review?: ProductReviewSnapshot; result: ApplyResult }> {
    if (!isUuid(draftId) || !isUuid(submissionId)) {
      throw new NemligError("Direct basket submission target is invalid.");
    }
    if (
      !journal ||
      !this.client.getCart ||
      !this.client.getFreshProduct ||
      !this.client.providerIdentity ||
      !this.client.addManyToCart
    ) {
      throw new NemligError("Direct basket submission service unavailable.");
    }
    const operationId = `direct-basket-submit:${draftId}`;
    if (
      !reviewedItems.length ||
      reviewedItems.some(
        ({ product_id, quantity }) =>
          !validPositive(product_id) || !validPositive(quantity),
      ) ||
      new Set(reviewedItems.map(({ product_id }) => product_id)).size !==
        reviewedItems.length
    ) {
      throw new NemligError("The reviewed direct basket payload is invalid.");
    }
    const prior = await journal.read(operationId);
    if (prior) {
      if (
        prior.accountIdentity !== this.client.providerIdentity() ||
        !sameShoppingListItems(
          prior.items,
          reviewedItems.map(({ product_id, quantity }) => ({
            productId: product_id,
            quantity,
          })),
        )
      ) {
        throw new NemligError(
          "This direct basket receipt does not match the connected account and exact reviewed products.",
        );
      }
      if (prior.completed) {
        return {
          result: {
            status: "completed",
            operation: "additions",
            replayed: true,
            basket: basketPayload(await this.client.getCart(signal)),
            cleanup_warning:
              "This submission was already completed. Inspect the current basket to confirm which approved products were added; no write was repeated.",
          },
        };
      }
      throw new NativeTransferUnconfirmedError(
        "A previous direct basket submission may have completed. Inspect the actual basket; this draft will not be submitted again.",
      );
    }
    const stored = this.lock(owner, draftId, "submitting");
    let dispatchClaimed = false;
    try {
      if (stored.snapshot.submissionAttempted) {
        throw new NativeTransferUnconfirmedError(
          stored.snapshot.submission?.status === "submitted"
            ? "This direct basket draft was already submitted. Start a new draft for another deliberate addition."
            : "A previous direct basket submission may have completed. Inspect the actual basket; do not submit this draft again.",
        );
      }
      if (
        stored.snapshot.basketMode !== "direct-basket" ||
        !stored.snapshot.reviewContextId ||
        !sameShoppingListItems(
          stored.snapshot.items.map(({ product_id, quantity }) => ({
            productId: product_id,
            quantity,
          })),
          reviewedItems.map(({ product_id, quantity }) => ({
            productId: product_id,
            quantity,
          })),
        ) ||
        reviewedItems.length !== stored.snapshot.items.length
      ) {
        throw new NemligError(
          "The direct basket draft changed after review. Refresh and review its exact products and quantities before submitting.",
        );
      }
      const accountIdentity = this.client.providerIdentity();
      if (stored.accountIdentity !== accountIdentity) {
        throw new NemligError(
          "Nemlig account changed while this draft was open. Refresh before submitting.",
        );
      }
      const checked = await runReadPool(
        stored.snapshot.items,
        async (item, readSignal) => {
          let current;
          try {
            current = await this.client.getFreshProduct!(
              item.product_id,
              readSignal,
            );
          } catch (error) {
            if (error instanceof ProductNotFoundError) {
              return {
                kind: "skip" as const,
                product_id: item.product_id,
                name:
                  (item.view.status === "complete"
                    ? item.view.product.name
                    : undefined) ?? `Product ${item.product_id}`,
              };
            }
            throw error;
          }
          return checkFreshReviewItem(item, current);
        },
        { signal },
      );
      const additions: BasketAddition[] = checked.flatMap((item) =>
        item.kind === "add" ? [item.addition] : [],
      );
      const skippedProducts = checked.flatMap((item) =>
        item.kind === "skip"
          ? [{ product_id: item.product_id, name: item.name }]
          : [],
      );
      const basket = additions.length
        ? await this.client.addManyToCart(additions, {
            signal,
            beforeDispatch: async (baseline) => {
              if (this.client.providerIdentity!() !== accountIdentity) {
                throw new NemligError(
                  "Nemlig account changed before direct basket submission. No basket write was sent.",
                );
              }
              const operation: DirectReviewOperationIntent = {
                operationId,
                generation: submissionId,
                accountIdentity,
                kind: "submit",
                name: "Direct basket draft",
                items: reviewedItems.map(({ product_id, quantity }) => ({
                  productId: product_id,
                  quantity,
                })),
                baseline: basketOperationItems(baseline),
              };
              await journal.write(operation);
              if (!(await journal.claim(operationId, submissionId))) {
                throw new NativeTransferUnconfirmedError(
                  "This direct basket submission is already fenced. Inspect the basket; do not retry.",
                );
              }
              dispatchClaimed = true;
            },
          })
        : await this.client.getCart(signal);
      if (this.client.providerIdentity() !== accountIdentity) {
        throw new NativeTransferUnconfirmedError(
          "Nemlig account changed after the basket request. Its outcome is unconfirmed; inspect the original account and do not retry.",
        );
      }
      if (additions.length) {
        await journal.complete(operationId, submissionId);
        const receipt = await journal.read(operationId);
        if (receipt?.generation !== submissionId || !receipt.completed) {
          throw new NativeTransferUnconfirmedError(
            "Basket addition was verified, but its no-replay receipt could not be confirmed. Inspect the basket; do not retry.",
          );
        }
      }
      stored.snapshot.submission = {
        submission_id: submissionId,
        status: "submitted",
        verified_additions: additions.reduce(
          (sum, item) => sum + item.quantity,
          0,
        ),
        ...(skippedProducts.length
          ? { skipped_products: skippedProducts }
          : {}),
        expires_at: new Date(this.now() + 15 * 60 * 1000).toISOString(),
        review: {},
      };
      stored.snapshot.submissionAttempted = true;
      stored.snapshot.actionNotice = additions.length
        ? skippedProducts.length
          ? "Nemlig confirmed the available additions; unavailable products were skipped. This draft cannot be submitted again."
          : "Nemlig confirmed the direct basket addition. This draft cannot be submitted again."
        : "No products were added because Nemlig confirmed they are unavailable. This draft cannot be submitted again.";
      return {
        review: structuredClone(stored.snapshot),
        result: {
          status: "completed",
          operation: "additions",
          replayed: false,
          basket: basketPayload(basket),
          verified_additions: additions.reduce(
            (sum, item) => sum + item.quantity,
            0,
          ),
          ...(skippedProducts.length
            ? { skipped_products: skippedProducts }
            : {}),
        },
      };
    } catch (error) {
      if (dispatchClaimed) {
        markReviewSubmissionUncertain(
          stored,
          submissionId,
          new Date(this.now() + 15 * 60 * 1000).toISOString(),
          "Direct basket submission may have completed. Inspect the actual basket; do not submit this draft again.",
        );
      }
      throw error;
    } finally {
      this.unlock(stored);
    }
  }

  // Keep the whole-basket save receipt and uncertain outcome adjacent to dispatch.
  // fallow-ignore-next-line complexity
  async saveCurrentBasketAsShoppingList(
    owner: string,
    draftId: string,
    saveId: string,
    signal: AbortSignal | undefined,
    journal: ReviewOperationJournal | undefined,
  ): Promise<{
    basket: Awaited<ReturnType<NonNullable<ShoppingClient["getCart"]>>>;
    replayed: boolean;
  }> {
    if (!isUuid(draftId) || !isUuid(saveId)) {
      throw new NemligError("The basket-to-list save target is invalid.");
    }
    if (
      !journal ||
      !this.client.providerIdentity ||
      !this.client.getCart ||
      !this.client.createShoppingListFromBasket
    ) {
      throw new NemligError("Basket-to-list saving is unavailable.");
    }
    const operationId = `direct-basket-save:${draftId}`;
    const accountIdentity = this.client.providerIdentity();
    const prior = await journal.read(operationId);
    if (prior) {
      if (
        prior.accountIdentity !== accountIdentity ||
        prior.kind !== "basket-save"
      ) {
        throw new NemligError(
          "This basket-to-list receipt does not match the connected account.",
        );
      }
      if (prior.completed === true) {
        return { basket: await this.client.getCart(signal), replayed: true };
      }
      throw new NativeTransferUnconfirmedError(
        "A previous basket-to-list save may have completed. Inspect saved shopping lists; do not retry.",
      );
    }
    const stored = this.lock(owner, draftId);
    if (stored.directBasketSaveAttempted) {
      stored.busy = false;
      throw new NativeTransferUnconfirmedError(
        "A basket-to-list save was already attempted for this draft. Inspect saved shopping lists; do not retry.",
      );
    }
    if (
      stored.snapshot.basketMode !== "direct-basket" ||
      stored.snapshot.submission?.status !== "submitted" ||
      stored.snapshot.submission.verified_additions === 0 ||
      stored.accountIdentity !== accountIdentity
    ) {
      stored.busy = false;
      throw new NemligError(
        "Save the current basket as a list only after this draft's basket addition is verified.",
      );
    }
    let dispatchClaimed = false;
    try {
      const basket = await this.client.createShoppingListFromBasket({
        signal,
        beforeDispatch: async (baseline) => {
          if (this.client.providerIdentity!() !== accountIdentity) {
            throw new NemligError(
              "Nemlig account changed before the save request. No list write was sent.",
            );
          }
          const items = basketOperationItems(baseline);
          const operation: DirectReviewOperationIntent = {
            operationId,
            generation: saveId,
            accountIdentity,
            kind: "basket-save",
            name: "Save current Nemlig basket as a shopping list",
            items,
            baseline: [...items],
          };
          await journal.write(operation);
          if (!(await journal.claim(operationId, saveId))) {
            throw new NativeTransferUnconfirmedError(
              "This basket-to-list save is already fenced. Inspect saved lists; do not retry.",
            );
          }
          dispatchClaimed = true;
          stored.directBasketSaveAttempted = true;
        },
      });
      if (this.client.providerIdentity() !== accountIdentity) {
        throw new NativeTransferUnconfirmedError(
          "Nemlig account changed after the basket-to-list request. Its outcome is unconfirmed; inspect saved lists and do not retry.",
        );
      }
      if (!(await journal.complete(operationId, saveId))) {
        throw new NativeTransferUnconfirmedError(
          "The basket-to-list request was acknowledged, but its no-replay receipt is unconfirmed. Inspect saved lists; do not retry.",
        );
      }
      stored.snapshot.actionNotice =
        "Basket save acknowledged. The entire current basket was preserved; find the new list in the shopping-list picker to review it.";
      this.touch(owner, stored);
      return { basket, replayed: false };
    } catch (error) {
      if (dispatchClaimed) {
        stored.snapshot.actionNotice =
          "Basket save may have completed. Inspect saved shopping lists; this request will not be retried.";
      }
      throw error;
    } finally {
      if (this.drafts.get(owner) === stored) {
        stored.busy = false;
      }
    }
  }
}
