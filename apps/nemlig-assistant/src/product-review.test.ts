import assert from "node:assert/strict";
import test from "node:test";
import { BasketProposalService } from "./proposals.js";
import { NemligError, type Product } from "./client.js";
import {
  DRAFT_IDLE_TIMEOUT_MS,
  MAX_DRAFT_PRODUCTS,
  ProductReviewService,
  type ReviewOperationJournal,
} from "./product-review.js";
import type { ReviewOperation } from "./local-basket.js";
import {
  applyLocalBasketCommand,
  createOwnerLocalBasketInventory,
  type LocalBasketCommand,
  type OwnerLocalBasketInventory,
} from "./local-basket.js";
import {
  mutateOwnerLocalBasketInventory,
  type LocalBasketInventoryStorage,
  type LocalBasketStorageAccess,
} from "./local-basket-storage.js";

const product = (id: number): Product => ({
  id,
  name: `Product ${id}`,
  price: 5,
  unitPrice: 5,
  unit: "stk",
  unitSize: "1 stk",
  brand: "",
  category: "",
  subcategory: "",
  imageUrl: "",
  available: true,
  labels: [],
  isOrganic: false,
  isFrozen: false,
  isRefrigerated: false,
  isDairy: false,
  isLactoseFree: false,
  isGlutenFree: false,
  isVegan: false,
  isOnDiscount: false,
});
const client = {
  getProduct: async (id: number) => product(id),
  searchProducts: async () => [product(3)],
  listShoppingLists: async () => [],
  createShoppingList: async () => 1,
  updateShoppingListProduct: async () => undefined,
  getShoppingList: async () => ({ id: 1, name: "fixture", items: [] }),
  deleteShoppingList: async () => undefined,
  addShoppingListToCart: async () => undefined,
};

const withShoppingList = <
  T extends Pick<BasketProposalService, "prepareAdditions" | "apply">,
>(
  proposals: T,
): T & Pick<BasketProposalService, "prepareShoppingListAdditions"> => ({
  ...proposals,
  prepareShoppingListAdditions: (owner, items, _name, authorization, options) =>
    proposals.prepareAdditions(owner, items, authorization, options),
});

const createDurableReviewJournal = (ownerId: string) => {
  const values = new Map<string, unknown>();
  const storage: LocalBasketInventoryStorage = {
    async get<T>(key: string) {
      return values.get(key) as T | undefined;
    },
    async put<T>(key: string, value: T) {
      values.set(key, structuredClone(value));
    },
    async delete(key: string) {
      values.delete(key);
    },
    async setAlarm() {},
    async deleteAlarm() {},
    async transaction<T>(
      action: (access: LocalBasketStorageAccess) => Promise<T>,
    ) {
      return action(storage);
    },
  };
  return {
    journal: {
      async read(operationId: string) {
        return (await mutateOwnerLocalBasketInventory(storage, ownerId, {
          kind: "review-operation-read",
          operationId,
        })) as Awaited<ReturnType<ReviewOperationJournal["read"]>>;
      },
      async claim(operationId: string, generation: string) {
        return (await mutateOwnerLocalBasketInventory(storage, ownerId, {
          kind: "review-operation-claim",
          operationId,
          generation,
        })) as boolean;
      },
      async write(operation: ReviewOperation) {
        await mutateOwnerLocalBasketInventory(storage, ownerId, {
          kind: "review-operation-write",
          operation,
        });
      },
      async complete(operationId: string, generation: string) {
        await mutateOwnerLocalBasketInventory(storage, ownerId, {
          kind: "review-operation-complete",
          operationId,
          generation,
        });
      },
    } satisfies ReviewOperationJournal,
    read(operationId: string) {
      return mutateOwnerLocalBasketInventory(storage, ownerId, {
        kind: "review-operation-read",
        operationId,
      });
    },
  };
};

test("unsaved drafts cannot prepare or submit a basket addition", async () => {
  let prepares = 0;
  let applies = 0;
  let listCreates = 0;
  const service = new ProductReviewService(
    {
      ...client,
      createShoppingList: async () => {
        listCreates++;
        return 99;
      },
    },
    {
      proposals: withShoppingList({
        prepareAdditions: async () => {
          prepares++;
          throw new Error("Unsaved drafts cannot be prepared.");
        },
        apply: async () => {
          applies++;
          throw new Error("Unsaved drafts cannot be submitted.");
        },
      }),
    },
  );
  const draft = await service.start("owner", [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 1 },
  ]);
  assert.deepEqual(
    draft.items.map((item) => item.state),
    ["ready", "ready"],
  );
  await assert.rejects(service.prepare("owner"), /Save this draft/u);
  await assert.rejects(
    service.submit("owner", "stale-submission"),
    /Save this draft/u,
  );
  assert.deepEqual([prepares, applies, listCreates], [0, 0, 0]);
});

test("Local baskets accept 500 exact products and reject 501 before provider reads", async () => {
  const items = Array.from({ length: MAX_DRAFT_PRODUCTS }, (_, index) => ({
    product_id: index + 1,
    quantity: 1,
  }));
  const draft = await new ProductReviewService(client).start("owner", items);
  assert.equal(draft.items.length, MAX_DRAFT_PRODUCTS);

  let reads = 0;
  const overLimit = new ProductReviewService({
    ...client,
    getProduct: async (id) => {
      reads++;
      return product(id);
    },
  });
  await assert.rejects(
    overLimit.start("owner", [
      ...items,
      { product_id: MAX_DRAFT_PRODUCTS + 1, quantity: 1 },
    ]),
    /1–500/u,
  );
  assert.equal(reads, 0);
});

test("unsaved drafts expire without passive refresh extending them", async () => {
  let now = 10;
  const service = new ProductReviewService(client, { now: () => now });
  const draft = await service.start("owner", [{ product_id: 1, quantity: 1 }]);

  now += DRAFT_IDLE_TIMEOUT_MS - 1;
  assert.equal(service.active("owner", draft.draftId)?.draftId, draft.draftId);
  now += 1;
  assert.equal(service.active("owner"), undefined);
  await assert.rejects(
    service.update(
      "owner",
      { kind: "quantity", product_id: 1, quantity: 2 },
      undefined,
      draft.draftId,
    ),
    /expired/u,
  );
});

test("explicit draft edits renew activity and stale cards cannot target a new draft", async () => {
  let now = 10;
  const service = new ProductReviewService(client, { now: () => now });
  const oldDraft = await service.start("owner", [
    { product_id: 1, quantity: 1 },
  ]);
  now += DRAFT_IDLE_TIMEOUT_MS - 1;
  await service.update(
    "owner",
    { kind: "quantity", product_id: 1, quantity: 2 },
    undefined,
    oldDraft.draftId,
  );
  now += DRAFT_IDLE_TIMEOUT_MS - 1;
  assert.equal(service.active("owner")?.items[0]?.quantity, 2);
  now += 1;
  assert.equal(service.active("owner"), undefined);

  const newDraft = await service.start("owner", [
    { product_id: 2, quantity: 1 },
  ]);
  await assert.rejects(
    service.update(
      "owner",
      { kind: "quantity", product_id: 2, quantity: 9 },
      undefined,
      oldDraft.draftId,
    ),
    /changed/u,
  );
  assert.equal(service.active("owner")?.draftId, newDraft.draftId);
  assert.equal(service.active("owner")?.items[0]?.quantity, 1);
});

test("draft edits make no provider writes until Save verifies the exact rows", async () => {
  const writes: string[] = [];
  const saved = {
    id: 44,
    name: "Weekend",
    items: [] as Array<{ productId: number; quantity: number }>,
  };
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    createShoppingList: async (name: string) => {
      writes.push(`create:${name}`);
      return 44;
    },
    updateShoppingListProduct: async (
      listId: number,
      productId: number,
      quantity: number,
    ) => {
      writes.push(`update:${listId}:${productId}:${quantity}`);
      saved.items.push({ productId, quantity });
    },
    getShoppingList: async (listId: number) => {
      assert.equal(listId, 44);
      writes.push("readback");
      return structuredClone(saved);
    },
  });
  const draft = await service.start("owner", [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 1 },
  ]);
  await service.update(
    "owner",
    { kind: "quantity", product_id: 1, quantity: 3 },
    undefined,
    draft.draftId,
  );
  assert.deepEqual(writes, []);

  const result = await service.update(
    "owner",
    { kind: "save", name: "Weekend" },
    undefined,
    draft.draftId,
  );
  assert.equal(result.saveStatus, "saved");
  assert.equal(result.shoppingListId, 44);
  assert.equal(result.shoppingListName, "Weekend");
  assert.equal(result.draftId, undefined);
  assert.deepEqual(writes, [
    "create:Weekend",
    "readback",
    "update:44:1:3",
    "update:44:2:1",
    "readback",
  ]);
});

test("saved drafts compare staged changes with the native list baseline", async () => {
  const saved = {
    id: 44,
    name: "Weekend",
    items: [] as Array<{ productId: number; quantity: number }>,
  };
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [
      { id: 44, name: "Weekend", productCount: saved.items.length },
    ],
    createShoppingList: async () => 44,
    updateShoppingListProduct: async (_listId, productId, quantity) => {
      saved.items = saved.items.filter((item) => item.productId !== productId);
      if (quantity > 0) {
        saved.items.push({ productId, quantity });
      }
    },
    getShoppingList: async () => structuredClone(saved),
  });
  const draft = await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  const list = await service.update(
    "owner",
    { kind: "save", name: "Weekend" },
    undefined,
    draft.draftId,
  );
  assert.equal(list.shoppingListId, 44);
  assert.equal(list.shoppingListDirty, undefined);

  const staged = await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  assert.equal(staged.shoppingListDirty, true);
  const reverted = await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 1,
  });
  assert.equal(reverted.shoppingListDirty, false);
});

test("an existing native shopping list reopens as the shared review without a local mirror write", async () => {
  const writes: string[] = [];
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [
      { id: 44, name: "Family", productCount: 2, totalAmount: 10 },
    ],
    getShoppingList: async (id: number) => ({
      id,
      name: "Family",
      items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ],
    }),
    createShoppingList: async () => {
      writes.push("create");
      return 45;
    },
    updateShoppingListProduct: async () => {
      writes.push("update");
    },
    deleteShoppingList: async () => {
      writes.push("delete");
    },
    addShoppingListToCart: async () => {
      writes.push("transfer");
    },
  });

  const review = await service.openShoppingList("conversation", 44);
  assert.deepEqual(
    review.items.map(({ product_id, quantity }) => [product_id, quantity]),
    [
      [1, 2],
      [2, 1],
    ],
  );
  assert.equal(review.shoppingListId, 44);
  assert.equal(review.shoppingListName, "Family");
  assert.equal(review.saveStatus, "saved");
  assert.equal(review.draftId, undefined);
  assert.deepEqual(service.active("conversation"), review);
  assert.deepEqual(writes, []);
});

test("opening a native list cannot replace a draft edited during deferred reads", async () => {
  let releaseList!: (list: {
    id: number;
    name: string;
    items: Array<{ productId: number; quantity: number }>;
  }) => void;
  let markReadStarted!: () => void;
  const readStarted = new Promise<void>((resolve) => {
    markReadStarted = resolve;
  });
  const delayedList = new Promise<{
    id: number;
    name: string;
    items: Array<{ productId: number; quantity: number }>;
  }>((resolve) => {
    releaseList = resolve;
  });
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => {
      markReadStarted();
      return delayedList;
    },
  });
  await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  const opening = service.openShoppingList("owner", 44);
  await readStarted;
  const edited = await service.update("owner", {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  releaseList({
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  });

  await assert.rejects(opening, /active shopping-list review changed/u);
  assert.equal(service.active("owner")?.draftId, edited.draftId);
  assert.equal(service.active("owner")?.items[0]?.quantity, 2);
});

test("a later deferred native-list open cannot replace an earlier open", async () => {
  let releaseFirst!: (list: {
    id: number;
    name: string;
    items: Array<{ productId: number; quantity: number }>;
  }) => void;
  let releaseSecond!: (list: {
    id: number;
    name: string;
    items: Array<{ productId: number; quantity: number }>;
  }) => void;
  let readsStarted = 0;
  let markBothReadsStarted!: () => void;
  const bothReadsStarted = new Promise<void>((resolve) => {
    markBothReadsStarted = resolve;
  });
  const gates = [
    new Promise<{
      id: number;
      name: string;
      items: Array<{ productId: number; quantity: number }>;
    }>((resolve) => {
      releaseFirst = resolve;
    }),
    new Promise<{
      id: number;
      name: string;
      items: Array<{ productId: number; quantity: number }>;
    }>((resolve) => {
      releaseSecond = resolve;
    }),
  ];
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [
      { id: 44, name: "Family" },
      { id: 45, name: "Work" },
    ],
    getShoppingList: async () => {
      const gate = gates[readsStarted++];
      if (readsStarted === 2) {
        markBothReadsStarted();
      }
      return gate;
    },
  });
  const first = service.openShoppingList("owner", 44);
  const second = service.openShoppingList("owner", 45);
  await bothReadsStarted;
  releaseFirst({
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  });
  await first;
  releaseSecond({
    id: 45,
    name: "Work",
    items: [{ productId: 2, quantity: 1 }],
  });

  await assert.rejects(second, /active shopping-list review changed/u);
  assert.equal(service.active("owner")?.shoppingListId, 44);
});

test("reopening a changed native list preserves staged edits and shows current rows", async () => {
  const native = {
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  };
  let writes = 0;
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [
      { id: 44, name: "Family", productCount: native.items.length },
    ],
    getShoppingList: async () => structuredClone(native),
    updateShoppingListProduct: async (_listId, productId, quantity) => {
      writes++;
      native.items = native.items.filter(
        (item) => item.productId !== productId,
      );
      if (quantity > 0) {
        native.items.push({ productId, quantity });
      }
    },
  });

  await service.openShoppingList("owner", 44);
  const staged = await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  native.items = [{ productId: 1, quantity: 3 }];

  const reopened = await service.openShoppingList("owner", 44);
  assert.deepEqual(reopened.items, staged.items);
  assert.equal(reopened.shoppingListDirty, true);
  assert.equal(reopened.updateStatus, "partial");
  assert.equal(reopened.conflictItems?.[0]?.quantity, 3);
  assert.match(reopened.actionNotice ?? "", /Review the current rows/u);
  const updated = await service.updateShoppingList("owner", 44, {
    kind: "update",
  });
  assert.equal(updated.saveStatus, "saved");
  assert.equal(native.items[0]?.quantity, 2);
  assert.equal(writes, 1);
});

test("saved native list verifies transfer before durable source cleanup and replay fence", async () => {
  const native = {
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  };
  const baseline = {
    items: [
      { id: 1, name: "Product 1", quantity: 2, total: 10 },
      { id: 99, name: "Existing", quantity: 1, total: 6 },
    ],
    productsPrice: 16,
    deliveryPrice: 0,
    numberOfProducts: 3,
    deliveryTime: undefined,
  };
  let basket = structuredClone(baseline);
  let sourcePresent = true;
  let listCreates = 0;
  let listUpdates = 0;
  let listDeletes = 0;
  let transfers = 0;
  const events: string[] = [];
  let readOperation: (
    operationId: string,
  ) => Promise<ReviewOperation | undefined> = async () => undefined;
  const nativeClient = {
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () =>
      sourcePresent ? [{ id: 44, name: "Family" }] : [],
    getShoppingList: async () => {
      events.push("source-read");
      return structuredClone(native);
    },
    deleteShoppingList: async (listId: number) => {
      assert.equal(listId, 44);
      const receipt = await readOperation("native-list-submit:44");
      assert.equal(receipt?.completed, true);
      assert.equal(receipt?.cleanupStatus, "pending");
      events.push("delete-list");
      listDeletes++;
      sourcePresent = false;
    },
    createShoppingList: async () => {
      listCreates++;
      return 45;
    },
    updateShoppingListProduct: async () => {
      listUpdates++;
    },
    getCart: async () => {
      events.push("basket-read");
      return structuredClone(basket);
    },
    addShoppingListToCart: async (listId: number) => {
      assert.equal(listId, 44);
      events.push("transfer");
      transfers++;
      basket = {
        ...baseline,
        items: [
          { id: 1, name: "Product 1", quantity: 3, total: 15 },
          { id: 99, name: "Existing", quantity: 1, total: 6 },
        ],
        productsPrice: 21,
        numberOfProducts: 4,
      };
    },
  };
  const proposals = new BasketProposalService({
    getProduct: async (id) => product(id),
    getFreshProduct: async (id) => product(id),
    getCart: async () => {
      events.push("basket-read");
      return structuredClone(basket);
    },
    addToCart: async () => {
      throw new Error("Submit must use Nemlig's native list transfer.");
    },
    getShoppingList: nativeClient.getShoppingList,
    createShoppingList: nativeClient.createShoppingList,
    updateShoppingListProduct: nativeClient.updateShoppingListProduct,
    addShoppingListToCart: nativeClient.addShoppingListToCart,
  });
  const service = new ProductReviewService(nativeClient, { proposals });
  const { journal, read } = createDurableReviewJournal("owner");
  readOperation = async (operationId) =>
    (await read(operationId)) as ReviewOperation | undefined;
  await service.openShoppingList("owner", 44, undefined, journal);
  events.length = 0;

  const submitted = await service.submit(
    "owner",
    "attempt-1",
    44,
    undefined,
    journal,
  );

  assert.equal(submitted.review.submission?.status, "submitted");
  assert.equal(submitted.result.basket.number_of_products, 4);
  assert.equal(basket.items[0]?.quantity, 3);
  assert.equal(basket.items[1]?.id, 99);
  assert.equal(sourcePresent, false);
  assert.deepEqual(
    [transfers, listCreates, listUpdates, listDeletes],
    [1, 0, 0, 1],
  );
  assert.ok(events.indexOf("transfer") < events.lastIndexOf("basket-read"));
  assert.ok(events.lastIndexOf("basket-read") < events.indexOf("delete-list"));
  const receipt = (await read("native-list-submit:44")) as
    ReviewOperation | undefined;
  assert.equal(receipt?.kind, "submit");
  assert.equal(receipt?.dispatchAttempted, true);
  assert.equal(receipt?.completed, true);
  assert.equal(receipt?.cleanupStatus, "deleted");

  await assert.rejects(
    service.submit("owner", "attempt-2", 44, undefined, journal),
    /unavailable or was deleted/u,
  );
  assert.equal(transfers, 1);
  const restarted = new ProductReviewService(nativeClient, { proposals });
  await assert.rejects(
    restarted.openShoppingList("owner", 44, undefined, journal),
    /unavailable or was deleted/u,
  );
  assert.equal(transfers, 1);
});

test("failed source cleanup keeps the list and never replays the verified transfer", async () => {
  const native = {
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  };
  const baseline = {
    items: [{ id: 99, name: "Existing", quantity: 1, total: 6 }],
    productsPrice: 6,
    deliveryPrice: 0,
    numberOfProducts: 1,
    deliveryTime: undefined,
  };
  let basket = structuredClone(baseline);
  let transfers = 0;
  let deletes = 0;
  const provider = {
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => structuredClone(native),
    getFreshProduct: async (id: number) => product(id),
    addToCart: async () => {
      throw new Error("Submission must use the native list transfer.");
    },
    getCart: async () => structuredClone(basket),
    deleteShoppingList: async () => {
      deletes++;
      throw new Error("Delete failed.");
    },
    addShoppingListToCart: async () => {
      transfers++;
      basket = {
        ...baseline,
        items: [
          ...baseline.items,
          { id: 1, name: "Product 1", quantity: 1, total: 5 },
        ],
        productsPrice: 11,
        numberOfProducts: 2,
      };
    },
  };
  const proposals = new BasketProposalService(provider);
  const { journal, read } = createDurableReviewJournal("owner");
  const service = new ProductReviewService(provider, { proposals });
  await service.openShoppingList("owner", 44, undefined, journal);
  const submitted = await service.submit(
    "owner",
    "attempt-1",
    44,
    undefined,
    journal,
  );

  assert.equal(submitted.review.submission?.status, "submitted");
  assert.match(
    submitted.review.submission?.cleanup_warning ?? "",
    /deletion was not confirmed/u,
  );
  assert.equal(
    submitted.result.cleanup_warning,
    submitted.review.submission?.cleanup_warning,
  );
  assert.equal(
    ((await read("native-list-submit:44")) as ReviewOperation | undefined)
      ?.cleanupStatus,
    "retained",
  );
  assert.deepEqual([transfers, deletes], [1, 1]);
  const replay = await service.submit(
    "owner",
    "attempt-1",
    44,
    undefined,
    journal,
  );
  assert.equal(replay.result.replayed, true);
  assert.equal(replay.result.cleanup_warning, submitted.result.cleanup_warning);
  assert.deepEqual([transfers, deletes], [1, 1]);

  const restarted = new ProductReviewService(provider, { proposals });
  await restarted.openShoppingList("owner", 44, undefined, journal);
  await assert.rejects(
    restarted.submit("owner", "attempt-2", 44, undefined, journal),
    /already transferred/u,
  );
  assert.deepEqual([transfers, deletes], [1, 1]);
});

test("reopening a completed receipt resumes pending source cleanup without transfer", async () => {
  const native = {
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  };
  let sourcePresent = true;
  let transfers = 0;
  const provider = {
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () =>
      sourcePresent ? [{ id: 44, name: "Family" }] : [],
    getShoppingList: async () => structuredClone(native),
    deleteShoppingList: async () => {
      sourcePresent = false;
    },
    addShoppingListToCart: async () => {
      transfers++;
    },
  };
  const { journal, read } = createDurableReviewJournal("owner");
  const operation: ReviewOperation = {
    operationId: "native-list-submit:44",
    generation: "attempt-1",
    accountIdentity: "account-1",
    kind: "submit",
    cleanupStatus: "pending",
    name: "Family",
    listId: 44,
    items: [{ productId: 1, quantity: 1 }],
    baseline: [],
  };
  await journal.write(operation);
  assert.equal(
    await journal.claim(operation.operationId, operation.generation),
    true,
  );
  await journal.complete(operation.operationId, operation.generation);

  const service = new ProductReviewService(provider);
  await assert.rejects(
    service.openShoppingList("owner", 44, undefined, journal),
    /unavailable or was deleted/u,
  );
  assert.equal(sourcePresent, false);
  assert.equal(
    ((await read(operation.operationId)) as ReviewOperation | undefined)
      ?.cleanupStatus,
    "deleted",
  );
  assert.equal(transfers, 0);
});

test("reopening retains a source changed after verified transfer", async () => {
  const native = {
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 2 }],
  };
  let deletes = 0;
  const provider = {
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => structuredClone(native),
    deleteShoppingList: async () => {
      deletes++;
    },
  };
  const { journal, read } = createDurableReviewJournal("owner");
  const operation: ReviewOperation = {
    operationId: "native-list-submit:44",
    generation: "attempt-1",
    accountIdentity: "account-1",
    kind: "submit",
    cleanupStatus: "pending",
    name: "Family",
    listId: 44,
    items: [{ productId: 1, quantity: 1 }],
    baseline: [],
  };
  await journal.write(operation);
  assert.equal(
    await journal.claim(operation.operationId, operation.generation),
    true,
  );
  await journal.complete(operation.operationId, operation.generation);

  const review = await new ProductReviewService(provider).openShoppingList(
    "owner",
    44,
    undefined,
    journal,
  );
  assert.equal(review.submission?.status, "submitted");
  assert.match(
    review.submission?.cleanup_warning ?? "",
    /source list changed/u,
  );
  assert.equal(
    ((await read(operation.operationId)) as ReviewOperation | undefined)
      ?.cleanupStatus,
    "retained",
  );
  assert.equal(deletes, 0);
});

test("dirty and in-flight native-list updates cannot prepare submission", async () => {
  const native = {
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  };
  let releaseUpdate!: () => void;
  let updating = false;
  const service = new ProductReviewService(
    {
      ...client,
      providerIdentity: () => "account-1",
      listShoppingLists: async () => [
        { id: 44, name: "Family", productCount: native.items.length },
      ],
      getShoppingList: async () => structuredClone(native),
      updateShoppingListProduct: async (_id, productId, quantity) => {
        if (updating) {
          await new Promise<void>((resolve) => {
            releaseUpdate = resolve;
          });
        }
        native.items = native.items.filter(
          (item) => item.productId !== productId,
        );
        if (quantity > 0) {
          native.items.push({ productId, quantity });
        }
      },
    },
    {
      proposals: withShoppingList({
        prepareAdditions: async () => {
          throw new Error("must not prepare");
        },
        apply: async () => {
          throw new Error("must not apply");
        },
      }),
    },
  );
  await service.openShoppingList("owner", 44);
  const staged = await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  assert.equal(staged.shoppingListDirty, true);
  await assert.rejects(
    service.prepare("owner"),
    /Update the saved Nemlig shopping list/u,
  );
  await assert.rejects(
    service.submit("owner", "attempt", 44),
    /Update the saved Nemlig shopping list/u,
  );

  updating = true;
  const update = service.updateShoppingList("owner", 44, { kind: "update" });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    service.prepare("owner"),
    /Update the saved Nemlig shopping list/u,
  );
  await assert.rejects(
    service.submit("owner", "attempt", 44),
    /operation is in progress/u,
  );
  releaseUpdate();
  const saved = await update;
  assert.equal(saved.shoppingListDirty, false);
  await assert.rejects(
    service.prepare("owner"),
    /Submit the confirmed saved shopping list directly/u,
  );
});

test("an unconfirmed native-list update stays dirty and blocks submission", async () => {
  const native = {
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  };
  const service = new ProductReviewService(
    {
      ...client,
      providerIdentity: () => "account-1",
      listShoppingLists: async () => [
        { id: 44, name: "Family", productCount: native.items.length },
      ],
      getShoppingList: async () => structuredClone(native),
      updateShoppingListProduct: async () => {
        throw new Error("write outcome unknown");
      },
    },
    {
      proposals: withShoppingList({
        prepareAdditions: async () => {
          throw new Error("must not prepare");
        },
        apply: async () => {
          throw new Error("must not apply");
        },
      }),
    },
  );
  await service.openShoppingList("owner", 44);
  await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  const result = await service.updateShoppingList("owner", 44, {
    kind: "update",
  });
  assert.equal(result.shoppingListDirty, true);
  assert.equal(result.updateStatus, "partial");
  await assert.rejects(
    service.prepare("owner"),
    /Update the saved Nemlig shopping list/u,
  );
  await assert.rejects(
    service.submit("owner", "attempt", 44),
    /Update the saved Nemlig shopping list/u,
  );
});

test("native shopping-list edits stage locally until Update writes and reads back the same list", async () => {
  const native = {
    id: 44,
    name: "Family",
    items: [
      { productId: 1, quantity: 2 },
      { productId: 2, quantity: 1 },
    ],
  };
  const writes: Array<[number, number, number]> = [];
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [
      { id: 44, name: "Family", productCount: 2 },
    ],
    getShoppingList: async () => structuredClone(native),
    updateShoppingListProduct: async (
      listId: number,
      productId: number,
      quantity: number,
    ) => {
      writes.push([listId, productId, quantity]);
      native.items = native.items.filter(
        (item) => item.productId !== productId,
      );
      if (quantity > 0) {
        native.items.push({ productId, quantity });
      }
    },
  });

  await service.openShoppingList("owner", 44);
  const staged = await service.updateShoppingList("owner", 44, {
    kind: "remove",
    product_ids: [1],
  });

  assert.deepEqual(writes, []);
  assert.equal(staged.shoppingListDirty, true);
  assert.deepEqual(native.items, [
    { productId: 1, quantity: 2 },
    { productId: 2, quantity: 1 },
  ]);

  const updated = await service.updateShoppingList("owner", 44, {
    kind: "update",
  });

  assert.deepEqual(writes, [[44, 1, 0]]);
  assert.equal(updated.shoppingListDirty, false);
  assert.deepEqual(
    updated.items.map(({ product_id }) => product_id),
    [2],
  );
  assert.deepEqual(native.items, [{ productId: 2, quantity: 1 }]);
});

test("journal write failures leave drafts recoverable and make no provider writes", async () => {
  const journal: ReviewOperationJournal = {
    read: async () => undefined,
    claim: async () => false,
    write: async () => {
      throw new Error("journal storage unavailable");
    },
    complete: async () => undefined,
  };
  let providerWrites = 0;
  const native = {
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  };
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => structuredClone(native),
    updateShoppingListProduct: async () => {
      providerWrites += 1;
    },
    createShoppingList: async () => {
      providerWrites += 1;
      return 55;
    },
  });
  await service.openShoppingList("owner", 44);
  await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  await assert.rejects(
    service.updateShoppingList(
      "owner",
      44,
      { kind: "update" },
      undefined,
      journal,
    ),
    /could not be recorded safely/u,
  );
  const activeList = service.active("owner");
  assert.equal(activeList?.updateStatus, "partial");
  assert.equal(activeList?.items[0]?.quantity, 2);
  assert.match(activeList?.actionNotice ?? "", /No products were changed/u);

  const draftService = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [],
    createShoppingList: async () => {
      providerWrites += 1;
      return 55;
    },
  });
  const draft = await draftService.start("draft-owner", [
    { product_id: 1, quantity: 1 },
  ]);
  await assert.rejects(
    draftService.save(
      "draft-owner",
      "Family",
      draft.draftId,
      undefined,
      journal,
    ),
    /Could not record this save safely/u,
  );
  assert.equal(draftService.active("draft-owner")?.saveStatus, undefined);
  assert.equal(providerWrites, 0);
});

test("completed native-list updates can be followed by edits using the durable journal", async () => {
  const owner = "owner";
  const native = {
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  };
  const { journal, read } = createDurableReviewJournal(owner);
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => structuredClone(native),
    updateShoppingListProduct: async (_listId, productId, quantity) => {
      native.items = native.items.filter(
        (item) => item.productId !== productId,
      );
      if (quantity > 0) {
        native.items.push({ productId, quantity });
      }
    },
  });
  const stage = (quantity: number) =>
    service.updateShoppingList(owner, 44, {
      kind: "quantity",
      product_id: 1,
      quantity,
    });
  const update = () =>
    service.updateShoppingList(
      owner,
      44,
      { kind: "update" },
      undefined,
      journal,
    );
  const operationId = "native-list-update:44";

  await service.openShoppingList(owner, 44, undefined, journal);
  await stage(2);
  assert.equal((await update()).saveStatus, "saved");
  const firstGeneration = ((await read(operationId)) as ReviewOperation)
    .generation;

  await stage(3);
  assert.equal((await update()).saveStatus, "saved");
  const secondGeneration = ((await read(operationId)) as ReviewOperation)
    .generation;
  assert.notEqual(secondGeneration, firstGeneration);

  await service.openShoppingList(owner, 44, undefined, journal);
  await stage(4);
  assert.equal((await update()).saveStatus, "saved");
  const thirdGeneration = ((await read(operationId)) as ReviewOperation)
    .generation;
  assert.notEqual(thirdGeneration, secondGeneration);
  assert.deepEqual(native.items, [{ productId: 1, quantity: 4 }]);
});

test("interrupted native-list updates resume the intended diff after restart", async () => {
  const native = {
    id: 44,
    name: "Family",
    items: [
      { productId: 1, quantity: 1 },
      { productId: 2, quantity: 1 },
    ],
  };
  const operations = new Map<string, ReviewOperation>();
  const journal: ReviewOperationJournal = {
    read: async (operationId) => structuredClone(operations.get(operationId)),
    claim: async (operationId) => {
      const operation = operations.get(operationId);
      if (!operation || operation.createAttempted) {
        return false;
      }
      operations.set(operationId, { ...operation, createAttempted: true });
      return true;
    },
    write: async (operation) => {
      operations.set(operation.operationId, structuredClone(operation));
    },
    complete: async (operationId, generation) => {
      if (operations.get(operationId)?.generation === generation) {
        operations.set(operationId, {
          ...operations.get(operationId)!,
          completedUntil: Date.now() + 2 * 60 * 60 * 1000,
        });
      }
    },
  };
  let failSecondUpdate = true;
  const newService = () =>
    new ProductReviewService({
      ...client,
      providerIdentity: () => "account-1",
      listShoppingLists: async () => [{ id: 44, name: "Family" }],
      getShoppingList: async () => structuredClone(native),
      updateShoppingListProduct: async (_listId, productId, quantity) => {
        if (productId === 2 && failSecondUpdate) {
          failSecondUpdate = false;
          throw new Error("provider timed out");
        }
        native.items = native.items.filter(
          (item) => item.productId !== productId,
        );
        if (quantity > 0) {
          native.items.push({ productId, quantity });
        }
      },
    });
  const service = newService();
  await service.openShoppingList("owner", 44);
  await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 2,
    quantity: 2,
  });
  const partial = await service.updateShoppingList(
    "owner",
    44,
    { kind: "update" },
    undefined,
    journal,
  );
  assert.equal(partial.updateStatus, "partial");
  assert.equal(
    native.items.find(({ productId }) => productId === 1)?.quantity,
    2,
  );
  assert.equal(
    native.items.find(({ productId }) => productId === 2)?.quantity,
    1,
  );

  const restarted = newService();
  const recovered = await restarted.openShoppingList(
    "owner",
    44,
    undefined,
    journal,
  );
  assert.deepEqual(
    recovered.items.map(({ product_id, quantity }) => [product_id, quantity]),
    [
      [1, 2],
      [2, 2],
    ],
  );
  assert.equal(recovered.actionNotice, undefined);
  assert.deepEqual(
    new Map(
      recovered.conflictItems?.map(({ product_id, quantity }) => [
        product_id,
        quantity,
      ]),
    ),
    new Map([
      [1, 2],
      [2, 1],
    ]),
  );
  const saved = await restarted.updateShoppingList(
    "owner",
    44,
    { kind: "update" },
    undefined,
    journal,
  );
  assert.equal(saved.saveStatus, "saved");
  assert.equal(saved.shoppingListDirty, false);
  assert.deepEqual(native.items, [
    { productId: 1, quantity: 2 },
    { productId: 2, quantity: 2 },
  ]);
  assert.equal(operations.size, 1);
  assert.ok(operations.get("native-list-update:44")?.completedUntil);
});

test("external edits during an interrupted update preserve intent until explicit Update", async () => {
  let operation: ReviewOperation | undefined = {
    operationId: "native-list-update:44",
    generation: "update-attempt-1",
    accountIdentity: "account-1",
    kind: "update",
    name: "Family",
    listId: 44,
    baseline: [{ productId: 1, quantity: 1 }],
    items: [{ productId: 1, quantity: 2 }],
  };
  const journal: ReviewOperationJournal = {
    read: async () => structuredClone(operation),
    claim: async () => false,
    write: async (next) => {
      assert.equal(next.generation, operation?.generation);
      assert.deepEqual(next.items, operation?.items);
      operation = structuredClone(next);
    },
    complete: async (operationId, generation) => {
      if (
        operation?.operationId === operationId &&
        operation.generation === generation
      ) {
        operation = { ...operation, completedUntil: Date.now() + 7200000 };
      }
    },
  };
  let writes = 0;
  let native = [{ productId: 1, quantity: 3 }];
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => ({ id: 44, name: "Family", items: native }),
    updateShoppingListProduct: async (_listId, productId, quantity) => {
      writes++;
      native = native.filter((item) => item.productId !== productId);
      if (quantity > 0) {
        native.push({ productId, quantity });
      }
    },
  });
  const recovered = await service.openShoppingList(
    "owner",
    44,
    undefined,
    journal,
  );
  assert.equal(recovered.items[0]?.quantity, 2);
  assert.equal(recovered.conflictItems?.[0]?.quantity, 3);
  assert.match(recovered.actionNotice ?? "", /pending change is preserved/u);
  assert.equal(writes, 0);
  const updated = await service.updateShoppingList(
    "owner",
    44,
    { kind: "update" },
    undefined,
    journal,
  );
  assert.equal(updated.saveStatus, "saved");
  assert.equal(native[0]?.quantity, 2);
  assert.ok(operation?.completedUntil);
  assert.equal(writes, 1);
});

test("discarding an interrupted update holds its lock through renamed-list readback", async () => {
  const { journal } = createDurableReviewJournal("owner");
  await journal.write({
    operationId: "native-list-update:44",
    generation: "update-1",
    accountIdentity: "account-1",
    kind: "update",
    name: "Family",
    listId: 44,
    baseline: [{ productId: 1, quantity: 1 }],
    items: [{ productId: 1, quantity: 2 }],
  });
  let blockInventory = false;
  let inventoryStarted!: () => void;
  let releaseInventory!: () => void;
  const started = new Promise<void>((resolve) => {
    inventoryStarted = resolve;
  });
  const pendingInventory = new Promise<void>((resolve) => {
    releaseInventory = resolve;
  });
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => {
      if (blockInventory) {
        inventoryStarted();
        await pendingInventory;
      }
      return [{ id: 44, name: "Renamed family" }];
    },
    getShoppingList: async () => ({
      id: 44,
      name: "Renamed family",
      items: [{ productId: 1, quantity: 1 }],
    }),
  });
  const opened = await service.openShoppingList(
    "owner",
    44,
    undefined,
    journal,
  );
  assert.equal(opened.updateStatus, "partial");
  blockInventory = true;
  const discarding = service.updateShoppingList(
    "owner",
    44,
    { kind: "discard_pending_update" },
    undefined,
    journal,
  );
  await started;
  await assert.rejects(
    service.updateShoppingList("owner", 44, {
      kind: "quantity",
      product_id: 1,
      quantity: 3,
    }),
    /operation is in progress/u,
  );
  releaseInventory();
  const discarded = await discarding;
  assert.equal(discarded.updateStatus, undefined);
  assert.equal(discarded.shoppingListName, "Renamed family");
  assert.equal(
    (await journal.read("native-list-update:44"))?.completedUntil !== undefined,
    true,
  );
});

test("discarding a pending update retires only a confirmed deleted list", async () => {
  const { journal } = createDurableReviewJournal("owner");
  await journal.write({
    operationId: "native-list-update:44",
    generation: "update-1",
    accountIdentity: "account-1",
    kind: "update",
    name: "Family",
    listId: 44,
    baseline: [{ productId: 1, quantity: 1 }],
    items: [{ productId: 1, quantity: 2 }],
  });
  let lists = [{ id: 44, name: "Family" }];
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => lists,
    getShoppingList: async () => ({
      id: 44,
      name: "Family",
      items: [{ productId: 1, quantity: 1 }],
    }),
  });
  await service.openShoppingList("owner", 44, undefined, journal);
  lists = [];
  const recovered = await service.updateShoppingList(
    "owner",
    44,
    { kind: "discard_pending_update" },
    undefined,
    journal,
  );
  assert.equal(recovered.shoppingListId, undefined);
  assert.equal(recovered.items.length, 0);
  assert.match(recovered.actionNotice ?? "", /deleted in Nemlig/u);
  assert.equal(
    (await journal.read("native-list-update:44"))?.completedUntil !== undefined,
    true,
  );
});

test("a pending update from another account cannot be retired", async () => {
  const { journal } = createDurableReviewJournal("owner");
  await journal.write({
    operationId: "native-list-update:44",
    generation: "update-1",
    accountIdentity: "account-1",
    kind: "update",
    name: "Family",
    listId: 44,
    baseline: [{ productId: 1, quantity: 1 }],
    items: [{ productId: 1, quantity: 2 }],
  });
  let accountIdentity = "account-1";
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => accountIdentity,
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => ({
      id: 44,
      name: "Family",
      items: [{ productId: 1, quantity: 1 }],
    }),
  });
  await service.openShoppingList("owner", 44, undefined, journal);
  accountIdentity = "account-2";
  await assert.rejects(
    service.updateShoppingList(
      "owner",
      44,
      { kind: "discard_pending_update" },
      undefined,
      journal,
    ),
    /Refresh this shopping list/u,
  );
  assert.equal(
    (await journal.read("native-list-update:44"))?.completedUntil,
    undefined,
  );
});

test("native list update never adopts readback from another account or list", async () => {
  let readCount = 0;
  let writes = 0;
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [
      { id: 44, name: "Family", productCount: 1 },
    ],
    getShoppingList: async () => {
      readCount++;
      if (readCount === 4) {
        return {
          id: 45,
          name: "Different account list",
          items: [{ productId: 3, quantity: 9 }],
        };
      }
      return {
        id: 44,
        name: "Family",
        items: [{ productId: 1, quantity: 1 }],
      };
    },
    updateShoppingListProduct: async () => {
      writes++;
    },
  });

  const opened = await service.openShoppingList("owner", 44);
  await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  const result = await service.updateShoppingList("owner", 44, {
    kind: "update",
  });

  assert.equal(result.saveStatus, "uncertain");
  assert.equal(result.items[0]?.quantity, 2);
  assert.deepEqual(
    result.items,
    opened.items.map((item) => ({ ...item, quantity: 2 })),
  );
  assert.equal(result.actionNotice?.includes("Refresh the same list"), true);
  assert.equal(writes, 1);
});

test("native list update stops if the Nemlig account changes during refresh", async () => {
  let account = "account-1";
  let readCount = 0;
  let writes = 0;
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => account,
    listShoppingLists: async () => [
      { id: 44, name: "Family", productCount: 1 },
    ],
    getShoppingList: async () => {
      readCount++;
      if (readCount === 2) {
        account = "account-2";
      }
      return {
        id: 44,
        name: "Family",
        items: [{ productId: 1, quantity: 1 }],
      };
    },
    updateShoppingListProduct: async () => {
      writes++;
    },
  });

  const opened = await service.openShoppingList("owner", 44);
  await assert.rejects(
    service.updateShoppingList("owner", 44, {
      kind: "quantity",
      product_id: 1,
      quantity: 2,
    }),
    /identity changed/u,
  );

  assert.deepEqual(service.active("owner"), opened);
  assert.equal(writes, 0);
});

test("partial draft saves reconcile and resume the same native list", async () => {
  let resolveCreate!: (id: number) => void;
  let creates = 0;
  let updates = 0;
  let failSecondUpdate = true;
  let saved = {
    id: 44,
    name: "List",
    items: [] as Array<{ productId: number; quantity: number }>,
  };
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    createShoppingList: async () => {
      creates += 1;
      return new Promise<number>((resolve) => {
        resolveCreate = resolve;
      });
    },
    updateShoppingListProduct: async (
      listId: number,
      productId: number,
      quantity: number,
    ) => {
      updates += 1;
      if (updates === 2) {
        if (failSecondUpdate) {
          throw new Error("uncertain update");
        }
      }
      const items = new Map(
        saved.items.map((item) => [item.productId, item.quantity]),
      );
      items.set(productId, quantity);
      saved = {
        ...saved,
        id: listId,
        items: [...items].map(([id, amount]) => ({
          productId: id,
          quantity: amount,
        })),
      };
    },
    getShoppingList: async () => structuredClone(saved),
  });
  const draft = await service.start("owner", [
    { product_id: 1, quantity: 1 },
    { product_id: 2, quantity: 1 },
  ]);
  const saving = service.save("owner", "List", draft.draftId);
  await assert.rejects(
    service.save("owner", "List", draft.draftId),
    /in progress/u,
  );
  resolveCreate(44);
  const partial = await saving;
  assert.equal(partial.saveStatus, "partial");
  assert.equal(partial.shoppingListId, 44);
  assert.equal(partial.draftId, draft.draftId);
  assert.deepEqual(partial.saveProgress, { completed: 1, total: 2 });

  failSecondUpdate = false;
  const resumed = await service.save("owner", "List", draft.draftId);
  assert.equal(resumed.saveStatus, "saved");
  assert.equal(resumed.shoppingListId, 44);
  assert.equal(resumed.draftId, undefined);
  assert.deepEqual({ creates, updates }, { creates: 1, updates: 3 });
  assert.deepEqual(saved.items, [
    { productId: 1, quantity: 1 },
    { productId: 2, quantity: 1 },
  ]);
  const duplicate = await service.save("owner", "List", draft.draftId);
  assert.equal(duplicate.saveStatus, "saved");
  assert.deepEqual({ creates, updates }, { creates: 1, updates: 3 });
});

test("uncertain creation never adopts an unrelated list by matching name", async () => {
  let inventoryReads = 0;
  let creates = 0;
  let writes = 0;
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () =>
      inventoryReads++ === 0 ? [] : [{ id: 55, name: "Family" }],
    createShoppingList: async () => {
      creates += 1;
      throw new Error("provider timed out");
    },
    updateShoppingListProduct: async () => {
      writes += 1;
    },
    getShoppingList: async () => {
      writes += 1;
      throw new Error("unexpected list read");
    },
  });
  const draft = await service.start("owner", [{ product_id: 1, quantity: 1 }]);

  const uncertain = await service.save("owner", "Family", draft.draftId);
  const retried = await service.save("owner", "Family", draft.draftId);

  assert.equal(uncertain.saveStatus, "uncertain");
  assert.equal(retried.saveStatus, "uncertain");
  assert.equal(retried.shoppingListId, undefined);
  assert.deepEqual({ creates, writes }, { creates: 1, writes: 0 });
});

test("uncertain list creation is never repeated after service restart", async () => {
  const operations = new Map<string, ReviewOperation>();
  let failListIdWrite = true;
  const journal: ReviewOperationJournal = {
    read: async (operationId) => structuredClone(operations.get(operationId)),
    claim: async (operationId) => {
      const operation = operations.get(operationId);
      if (!operation || operation.createAttempted) {
        return false;
      }
      operations.set(operationId, { ...operation, createAttempted: true });
      return true;
    },
    write: async (operation) => {
      if (operation.listId && failListIdWrite) {
        failListIdWrite = false;
        throw new Error("journal write interrupted");
      }
      operations.set(operation.operationId, structuredClone(operation));
    },
    complete: async (operationId, generation) => {
      if (operations.get(operationId)?.generation === generation) {
        operations.set(operationId, {
          ...operations.get(operationId)!,
          completedUntil: Date.now() + 7200000,
        });
      }
    },
  };
  let creates = 0;
  const native = {
    id: 55,
    name: "Family",
    items: [] as Array<{ productId: number; quantity: number }>,
  };
  const newService = () =>
    new ProductReviewService({
      ...client,
      providerIdentity: () => "account-1",
      listShoppingLists: async () =>
        creates ? [{ id: native.id, name: native.name }] : [],
      createShoppingList: async () => {
        creates += 1;
        return native.id;
      },
      updateShoppingListProduct: async (listId, productId, quantity) => {
        assert.equal(listId, native.id);
        native.items.push({ productId, quantity });
      },
      getShoppingList: async () => structuredClone(native),
    });
  const first = newService();
  const draft = await first.start("owner", [{ product_id: 1, quantity: 1 }]);
  const uncertain = await first.save(
    "owner",
    "Family",
    draft.draftId,
    undefined,
    journal,
  );
  assert.equal(uncertain.saveStatus, "uncertain");
  assert.equal(creates, 1);

  const restarted = await newService().save(
    "owner",
    "Family",
    draft.draftId,
    undefined,
    journal,
  );
  assert.equal(restarted.saveStatus, "uncertain");
  assert.equal(restarted.shoppingListId, undefined);
  assert.equal(creates, 1);
});

test("52-product save resumes after a service restart without recreating the list", async () => {
  let creates = 0;
  let updates = 0;
  let failAt31 = true;
  let native = {
    id: 88,
    name: "Meal plan",
    items: [] as Array<{ productId: number; quantity: number }>,
  };
  const operations = new Map<string, ReviewOperation>();
  const journal: ReviewOperationJournal = {
    read: async (operationId) => structuredClone(operations.get(operationId)),
    claim: async (operationId) => {
      const operation = operations.get(operationId);
      if (!operation || operation.createAttempted) {
        return false;
      }
      operations.set(operationId, { ...operation, createAttempted: true });
      return true;
    },
    write: async (operation) => {
      operations.set(operation.operationId, structuredClone(operation));
    },
    complete: async (operationId, generation) => {
      if (operations.get(operationId)?.generation === generation) {
        operations.set(operationId, {
          ...operations.get(operationId)!,
          completedUntil: Date.now() + 7200000,
        });
      }
    },
  };
  const newService = () =>
    new ProductReviewService({
      ...client,
      providerIdentity: () => "account-1",
      listShoppingLists: async () =>
        creates ? [{ id: native.id, name: native.name }] : [],
      createShoppingList: async (name: string) => {
        creates += 1;
        native = { ...native, name };
        return native.id;
      },
      updateShoppingListProduct: async (
        listId: number,
        productId: number,
        quantity: number,
      ) => {
        updates += 1;
        if (updates === 31 && failAt31) {
          failAt31 = false;
          throw new Error("provider timed out");
        }
        assert.equal(listId, native.id);
        native.items.push({ productId, quantity });
      },
      getShoppingList: async () => structuredClone(native),
    });
  const items = Array.from({ length: 52 }, (_, index) => ({
    product_id: index + 1,
    quantity: 1,
  }));
  const service = newService();
  const draft = await service.start("owner", items);

  const partial = await service.save(
    "owner",
    "Meal plan",
    draft.draftId,
    undefined,
    journal,
  );
  assert.equal(partial.saveStatus, "partial");
  assert.equal(partial.shoppingListId, 88);
  assert.deepEqual(partial.saveProgress, { completed: 30, total: 52 });
  assert.equal(native.items.length, 30);

  const resumed = await newService().save(
    "owner",
    "Meal plan",
    draft.draftId,
    undefined,
    journal,
  );
  assert.equal(resumed.saveStatus, "saved");
  assert.equal(resumed.shoppingListId, 88);
  assert.equal(native.items.length, 52);
  assert.deepEqual({ creates, updates }, { creates: 1, updates: 53 });
  assert.equal(operations.size, 1);
  assert.ok(operations.get(draft.draftId!)?.completedUntil);
  const duplicate = await newService().save(
    "owner",
    "Meal plan",
    draft.draftId,
    undefined,
    journal,
  );
  assert.equal(duplicate.saveStatus, "saved");
  assert.deepEqual({ creates, updates }, { creates: 1, updates: 53 });
});

test("52-product save reconciles caller cancellation before continuing", async () => {
  const controller = new AbortController();
  const operations = new Map<string, ReviewOperation>();
  const journal: ReviewOperationJournal = {
    read: async (operationId) => structuredClone(operations.get(operationId)),
    claim: async (operationId) => {
      const operation = operations.get(operationId);
      if (!operation || operation.createAttempted) {
        return false;
      }
      operations.set(operationId, { ...operation, createAttempted: true });
      return true;
    },
    write: async (operation) => {
      const current = operations.get(operation.operationId);
      operations.set(operation.operationId, {
        ...operation,
        createAttempted: current?.createAttempted || operation.createAttempted,
        ...(current?.listId ? { listId: current.listId } : {}),
      });
    },
    complete: async (operationId, generation) => {
      const operation = operations.get(operationId);
      if (operation?.generation === generation) {
        operations.set(operationId, {
          ...operation,
          completedUntil: Date.now() + 7200000,
        });
      }
    },
  };
  let creates = 0;
  let updates = 0;
  let native = {
    id: 89,
    name: "Meal plan",
    items: [] as Array<{ productId: number; quantity: number }>,
  };
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () =>
      creates ? [{ id: native.id, name: native.name }] : [],
    createShoppingList: async (name: string) => {
      creates += 1;
      native = { ...native, name };
      return native.id;
    },
    updateShoppingListProduct: async (
      listId: number,
      productId: number,
      quantity: number,
    ) => {
      assert.equal(listId, native.id);
      native.items.push({ productId, quantity });
      updates += 1;
      if (updates === 30) {
        controller.abort(new Error("caller cancelled"));
      }
    },
    getShoppingList: async () => structuredClone(native),
  });
  const items = Array.from({ length: 52 }, (_, index) => ({
    product_id: index + 1,
    quantity: 1,
  }));
  const draft = await service.start("owner", items);
  await assert.rejects(
    service.save(
      "owner",
      "Meal plan",
      draft.draftId,
      controller.signal,
      journal,
    ),
    /caller cancelled/u,
  );
  assert.equal(native.items.length, 30);
  assert.deepEqual(service.active("owner")?.saveProgress, {
    completed: 30,
    total: 52,
  });

  const resumed = await service.save(
    "owner",
    "Meal plan",
    draft.draftId,
    undefined,
    journal,
  );
  assert.equal(resumed.saveStatus, "saved");
  assert.equal(native.items.length, 52);
  assert.deepEqual({ creates, updates }, { creates: 1, updates: 52 });
  assert.ok(operations.get(draft.draftId!)?.completedUntil);
});

test("durable snapshots use a bounded cache without evicting stored baskets", async () => {
  let inventory: OwnerLocalBasketInventory =
    createOwnerLocalBasketInventory("owner");
  let nextId = 0;
  let now = 100;
  const repository = {
    async mutate(command: LocalBasketCommand) {
      const result = applyLocalBasketCommand(inventory, "owner", command, {
        now: () => now,
        createId: () =>
          `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
      });
      inventory = result.inventory;
      return result.value;
    },
  };
  const service = new ProductReviewService(client);
  const created = await Promise.all(
    Array.from({ length: 12 }, (_, index) => {
      now += 1;
      return service.createBasket(
        "owner",
        [{ product_id: index + 1, quantity: 1 }],
        repository,
      );
    }),
  );
  const basketIds = created.map(({ review }) => review.basketId!);

  const cached = (service as unknown as { drafts: Map<string, unknown> })
    .drafts;
  assert.equal(cached.size, 8);
  assert.equal(inventory.baskets.length, 12);

  await repository.mutate({ kind: "delete", basketId: basketIds[11]! });
  assert.equal((await service.listBaskets(repository, "owner")).length, 11);
  assert.equal(cached.size, 7);
});

test("draft cards share one review and retain alternatives", async () => {
  const service = new ProductReviewService(client);
  await service.start("owner", [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 1 },
  ]);
  const before = service.active("owner")!;
  assert.deepEqual(
    before.items.map((i) => i.state),
    ["ready", "ready"],
  );
  const reconsidered = await service.update("owner", {
    kind: "revisit",
    product_ids: [1],
  });
  assert.deepEqual(
    reconsidered.items.map((item) => item.state),
    ["needs-review", "ready"],
  );
  const accepted = await service.update("owner", {
    kind: "accept",
    product_ids: [1],
  });
  assert.equal(accepted.items[0]?.state, "ready");
  await assert.rejects(
    service.update("stranger", { kind: "remove", product_ids: [1] }),
    /unavailable/i,
  );
  await service.update("owner", {
    kind: "alternatives",
    product_id: 2,
    query: "alternative",
  });
  const ready = await service.update("owner", {
    kind: "navigate",
    destination: "ready",
  });
  assert.equal(ready.alternatives?.product_id, 2);
  const replaced = await service.update("owner", {
    kind: "replace",
    product_id: 2,
    replacement_id: 3,
  });
  assert.deepEqual(
    replaced.items.map((i) => [i.product_id, i.state]),
    [
      [1, "ready"],
      [3, "ready"],
    ],
  );
  assert.equal(replaced.destination, "ready");
  const removed = await service.update("owner", {
    kind: "remove",
    product_ids: [1],
  });
  assert.deepEqual(
    removed.items.map((i) => i.product_id),
    [3],
  );
  removed.items.length = 0;
  assert.equal(service.active("owner")?.items.length, 1);
});

test("sequential actions from supported cards apply to the current owner list", async () => {
  const service = new ProductReviewService(client);
  const firstCard = await service.start("owner", [
    { product_id: 1, quantity: 1 },
    { product_id: 2, quantity: 1 },
  ]);
  const newerCard = await service.start("owner", [
    { product_id: 3, quantity: 1 },
  ]);
  assert.deepEqual(newerCard, firstCard);
  const current = await service.update("owner", {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  const earlierCardAction = await service.update("owner", {
    kind: "quantity",
    product_id: 2,
    quantity: 4,
  });
  assert.equal(current.items[0]?.state, "ready");
  assert.equal(earlierCardAction.items[1]?.quantity, 4);
  assert.equal(earlierCardAction.items[0]?.state, "ready");
});

test("alternatives omit products already present in the local review", async () => {
  const service = new ProductReviewService({
    ...client,
    searchProducts: async () => [product(2), product(3)],
  });
  await service.start("owner", [
    { product_id: 1, quantity: 1 },
    { product_id: 2, quantity: 1 },
  ]);
  const alternatives = await service.update("owner", {
    kind: "alternatives",
    product_id: 1,
    query: "alternative",
  });
  assert.deepEqual(
    alternatives.alternatives?.views.map((view) =>
      view.status === "complete" ? view.product.id : view.product_id,
    ),
    [3],
  );
});

test("alternatives preserve every unique provider result in order unless the user requests a count", async () => {
  const candidates = Array.from({ length: 12 }, (_, index) =>
    product(index + 10),
  );
  const receivedLimits: Array<number | undefined> = [];
  const service = new ProductReviewService({
    ...client,
    searchProducts: async (_query, limit) => {
      receivedLimits.push(limit);
      return [...candidates, candidates[0]!];
    },
  });
  await service.start("owner", [{ product_id: 1, quantity: 2 }]);
  const alternatives = await service.update("owner", {
    kind: "alternatives",
    product_id: 1,
    query: "smør",
  });
  assert.deepEqual(receivedLimits, [undefined]);
  assert.deepEqual(
    alternatives.alternatives?.views.map((view) =>
      view.status === "complete" ? view.product.id : view.product_id,
    ),
    candidates.map((item) => item.id),
  );

  const limited = await service.update("owner", {
    kind: "alternatives",
    product_id: 1,
    query: "smør",
    limit: 2,
  });
  assert.deepEqual(receivedLimits, [undefined, 2]);
  assert.deepEqual(
    limited.alternatives?.views.map((view) =>
      view.status === "complete" ? view.product.id : view.product_id,
    ),
    [10, 11],
  );
});

test("any Local basket line can find an alternative; replacement keeps its quantity", async () => {
  const service = new ProductReviewService(client);
  await service.start("owner", [{ product_id: 1, quantity: 2 }]);
  let draft = await service.update("owner", {
    kind: "alternatives",
    product_id: 1,
    query: "alternative",
  });
  await assert.rejects(
    service.update("owner", {
      kind: "replace",
      product_id: 1,
      replacement_id: 4,
    }),
    /exact returned alternative/i,
  );
  assert.deepEqual(
    service.active("owner"),
    draft,
    "a non-candidate replacement must leave the draft unchanged",
  );
  draft = await service.update("owner", {
    kind: "replace",
    product_id: 1,
    replacement_id: 3,
  });
  assert.equal(draft.items[0]?.state, "ready");
  assert.equal(draft.items[0]?.quantity, 2);
  assert.equal(draft.destination, "ready");
});

test("removing Local basket products never reads the provider basket", async () => {
  const service = new ProductReviewService(client);
  await service.start("owner", [
    { product_id: 1, quantity: 1 },
    { product_id: 2, quantity: 1 },
  ]);
  let draft = await service.update("owner", {
    kind: "remove",
    product_ids: [1],
  });
  assert.deepEqual(
    draft.items.map((item) => [item.product_id, item.state]),
    [[2, "ready"]],
  );
  draft = await service.update("owner", {
    kind: "remove",
    product_ids: [2],
  });
  assert.deepEqual(draft.items, []);
  assert.deepEqual(service.active("owner"), draft);
});

test("session drafts survive an hour, repeated starts preserve them, and explicit end clears them", async () => {
  let now = 0;
  const service = new ProductReviewService(client, { now: () => now });
  await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  assert.equal(service.active("another-session-owner"), undefined);
  const edited = await service.update("owner", {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  await assert.rejects(
    service.update("owner", {
      kind: "remove",
      product_ids: [99],
    }),
    /product/i,
  );
  now = 3_600_001;
  assert.deepEqual(
    await service.start("owner", [{ product_id: 2, quantity: 1 }]),
    edited,
  );
  assert.deepEqual(service.active("owner"), edited);
  assert.equal(service.active("owner")?.items[0]?.state, "ready");
  service.end("owner");
  assert.equal(service.active("owner"), undefined);
  const restarted = await service.start("owner", [
    { product_id: 2, quantity: 1 },
  ]);
  assert.equal(restarted.items[0]?.product_id, 2);
});

test("adding exact products is atomic, reviewable, and bounded; older idle sessions are evicted", async () => {
  const service = new ProductReviewService(client);
  const draft = await service.start("owner-1", [
    { product_id: 1, quantity: 1 },
  ]);
  await assert.rejects(
    service.update("owner-1", {
      kind: "add",
      items: [
        { product_id: 2, quantity: 1 },
        { product_id: 2, quantity: 2 },
      ],
    }),
    /unique exact/i,
  );
  assert.deepEqual(service.active("owner-1"), draft);
  const merged = await service.update("owner-1", {
    kind: "add",
    items: [{ product_id: 1, quantity: 2 }],
  });
  assert.deepEqual(
    merged.items.map(({ product_id, quantity }) => [product_id, quantity]),
    [[1, 3]],
  );
  const added = await service.update("owner-1", {
    kind: "add",
    items: [{ product_id: 2, quantity: 3 }],
  });
  assert.deepEqual(
    added.items.map((item) => [item.product_id, item.quantity, item.state]),
    [
      [1, 3, "ready"],
      [2, 3, "ready"],
    ],
  );
  for (let index = 2; index <= 8; index++) {
    await service.start(`owner-${index}`, [{ product_id: index, quantity: 1 }]);
  }
  await service.start("owner-1", []);
  await service.start("owner-9", [{ product_id: 9, quantity: 1 }]);
  assert.equal(service.active("owner-2"), undefined);
  assert.equal(service.active("owner-1")?.items[0]?.product_id, 1);
  assert.equal(service.active("owner-9")?.items[0]?.product_id, 9);
});

test("an asynchronous alternatives search excludes conflicting edits and leaves no partial state on failure", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = new ProductReviewService({
    ...client,
    searchProducts: async () => {
      await pending;
      throw new Error("Search failed");
    },
  });
  const draft = await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  const search = service.update("owner", {
    kind: "alternatives",
    product_id: 1,
    query: "milk",
  });
  await assert.rejects(
    service.update("owner", {
      kind: "remove",
      product_ids: [1],
    }),
    /progress/i,
  );
  release();
  await assert.rejects(search, /Search failed/);
  assert.deepEqual(service.active("owner"), draft);
  const removed = await service.update("owner", {
    kind: "remove",
    product_ids: [1],
  });
  assert.equal(removed.items.length, 0);
});

test("failed hydration remains visible and cannot bypass the draft Save gate", async () => {
  let preparations = 0;
  const service = new ProductReviewService(
    {
      ...client,
      getProduct: async () => {
        throw new NemligError("Unresolved lookup", 404);
      },
    },
    {
      proposals: withShoppingList({
        prepareAdditions: async () => {
          preparations++;
          throw new Error("Should not prepare unavailable products");
        },
        apply: async () => {
          throw new Error("Should not apply unavailable products");
        },
      }),
    },
  );
  const draft = await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  assert.equal(draft.items[0]?.view.status, "unavailable");
  await assert.rejects(service.prepare("owner"), /Save this draft/u);
  assert.equal(preparations, 0);
  assert.deepEqual(service.active("owner"), draft);
});

test("start and add share exact-product hydration and propagate authentication failures", async () => {
  const service = new ProductReviewService({
    ...client,
    getProduct: async (id) => {
      if (id === 2) {
        return product(99);
      }
      if (id === 3) {
        throw new NemligError("Session expired", 401);
      }
      return product(id);
    },
  });
  const draft = await service.start("owner", [
    { product_id: 1, quantity: 1 },
    { product_id: 2, quantity: 1 },
  ]);
  assert.equal(draft.items[1]?.view.status, "unavailable");
  const added = await service.update("owner", {
    kind: "add",
    items: [{ product_id: 4, quantity: 1 }],
  });
  assert.equal(added.items[2]?.view.status, "complete");
  await assert.rejects(
    service.update("owner", {
      kind: "add",
      items: [{ product_id: 3, quantity: 1 }],
    }),
    /Session expired/u,
  );
  assert.deepEqual(service.active("owner"), added);
  await assert.rejects(
    service.start("another-owner", [{ product_id: 3, quantity: 1 }]),
    /Session expired/u,
  );
  assert.equal(service.active("another-owner"), undefined);
});
