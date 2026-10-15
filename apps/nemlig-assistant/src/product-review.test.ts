import assert from "node:assert/strict";
import test from "node:test";
import {
  BasketProposalService,
  NativeTransferUnconfirmedError,
} from "./proposals.js";
import {
  NemligError,
  type Basket,
  type BasketAddition,
  type Product,
} from "./client.js";
import {
  DRAFT_IDLE_TIMEOUT_MS,
  MAX_DRAFT_PRODUCTS,
  ProductReviewService,
  type ReviewOperationJournal,
} from "./product-review.js";
import type { LocalBasketCommand, ReviewOperation } from "./local-basket.js";
import { handleLocalBasketStateRequest } from "./local-basket-callback.js";
import { attachLocalBasketCapability } from "./local-basket-capability.js";
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

const createDurableReviewJournal = (
  ownerId: string,
  now: () => number = Date.now,
) => {
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
        return (await mutateOwnerLocalBasketInventory(
          storage,
          ownerId,
          {
            kind: "review-operation-read",
            operationId,
          },
          now(),
        )) as Awaited<ReturnType<ReviewOperationJournal["read"]>>;
      },
      async claim(operationId: string, generation: string) {
        return (await mutateOwnerLocalBasketInventory(
          storage,
          ownerId,
          {
            kind: "review-operation-claim",
            operationId,
            generation,
          },
          now(),
        )) as boolean;
      },
      async write(operation: ReviewOperation) {
        await mutateOwnerLocalBasketInventory(
          storage,
          ownerId,
          {
            kind: "review-operation-write",
            operation,
          },
          now(),
        );
      },
      async complete(operationId: string, generation: string) {
        return (await mutateOwnerLocalBasketInventory(
          storage,
          ownerId,
          {
            kind: "review-operation-complete",
            operationId,
            generation,
          },
          now(),
        )) as boolean;
      },
    } satisfies ReviewOperationJournal,
    read(operationId: string) {
      return mutateOwnerLocalBasketInventory(
        storage,
        ownerId,
        {
          kind: "review-operation-read",
          operationId,
        },
        now(),
      );
    },
  };
};

const createCallbackReviewJournal = (ownerId: string) => {
  const durable = createDurableReviewJournal(ownerId);
  const capability = `capability-${ownerId}`;
  const call = async (command: LocalBasketCommand): Promise<unknown> => {
    const response = await handleLocalBasketStateRequest(
      attachLocalBasketCapability(
        new Request("http://local-basket-state.internal/inventory", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
        }),
        capability,
      ),
      {
        idFromName: (owner) => owner,
        get: () => ({
          mutate: async (_owner, parsed) => {
            switch (parsed.kind) {
              case "review-operation-read":
                return durable.read(parsed.operationId);
              case "review-operation-claim":
                return durable.journal.claim(
                  parsed.operationId,
                  parsed.generation,
                );
              case "review-operation-write":
                await durable.journal.write(parsed.operation);
                return null;
              case "review-operation-complete":
                return durable.journal.complete(
                  parsed.operationId,
                  parsed.generation,
                );
              case "review-operation-release":
                return false;
            }
          },
        }),
      },
      async (value) => (value === capability ? ownerId : undefined),
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  };
  return {
    journal: {
      async read(operationId: string) {
        return (await call({ kind: "review-operation-read", operationId })) as
          ReviewOperation | undefined;
      },
      async claim(operationId: string, generation: string) {
        return (await call({
          kind: "review-operation-claim",
          operationId,
          generation,
        })) as boolean;
      },
      async write(operation: ReviewOperation) {
        await call({ kind: "review-operation-write", operation });
      },
      async complete(operationId: string, generation: string) {
        return (await call({
          kind: "review-operation-complete",
          operationId,
          generation,
        })) as boolean;
      },
    } satisfies ReviewOperationJournal,
    read: durable.read,
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

test("choosing products creates and reads back one exact native shopping list", async () => {
  const owner = "owner";
  const { journal } = createDurableReviewJournal(owner);
  const lists = new Map<
    number,
    {
      id: number;
      name: string;
      items: Array<{ productId: number; quantity: number }>;
    }
  >();
  const writes: Array<[number, number, number]> = [];
  let nextId = 41;
  let basketWrites = 0;
  const provider = {
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () =>
      [...lists.values()].map(({ id, name, items }) => ({
        id,
        name,
        productCount: items.length,
      })),
    createShoppingList: async (name: string) => {
      const id = nextId++;
      lists.set(id, { id, name, items: [] });
      return id;
    },
    getShoppingList: async (id: number) => structuredClone(lists.get(id)!),
    updateShoppingListProduct: async (
      id: number,
      productId: number,
      quantity: number,
    ) => {
      writes.push([id, productId, quantity]);
      const list = lists.get(id)!;
      list.items = list.items.filter((item) => item.productId !== productId);
      if (quantity > 0) {
        list.items.push({ productId, quantity });
      }
    },
    addShoppingListToCart: async () => {
      basketWrites += 1;
    },
  };
  const service = new ProductReviewService(provider);

  const review = await service.startShoppingList(
    owner,
    [
      { product_id: 1, quantity: 2 },
      { product_id: 2, quantity: 1 },
    ],
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "Groceries",
    undefined,
    journal,
  );

  assert.equal(review.shoppingListId, 41);
  assert.equal(review.shoppingListName, "Groceries");
  assert.equal(review.saveStatus, "saved");
  assert.equal(review.draftId, undefined);
  assert.deepEqual(writes, [
    [41, 1, 2],
    [41, 2, 1],
  ]);
  assert.deepEqual(lists.get(41)?.items, [
    { productId: 1, quantity: 2 },
    { productId: 2, quantity: 1 },
  ]);
  assert.equal(basketWrites, 0);

  const replay = await service.startShoppingList(
    owner,
    [
      { product_id: 1, quantity: 2 },
      { product_id: 2, quantity: 1 },
    ],
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "Groceries",
    undefined,
    journal,
  );
  assert.equal(replay.shoppingListId, 41);
  assert.deepEqual(writes, [
    [41, 1, 2],
    [41, 2, 1],
  ]);
  lists.set(42, { id: 42, name: "Other", items: [] });
  await service.openShoppingList(owner, 42, undefined, journal);
  const replayAfterOpeningAnotherList = await service.startShoppingList(
    owner,
    [
      { product_id: 1, quantity: 2 },
      { product_id: 2, quantity: 1 },
    ],
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "Groceries",
    undefined,
    journal,
  );
  assert.equal(replayAfterOpeningAnotherList.shoppingListId, 41);
  await assert.rejects(
    service.startShoppingList(
      owner,
      [
        { product_id: 1, quantity: 4 },
        { product_id: 2, quantity: 1 },
      ],
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "Groceries",
      undefined,
      journal,
    ),
    /different shopping-list creation/u,
  );
  await assert.rejects(
    service.startShoppingList(
      owner,
      [
        { product_id: 1, quantity: 2 },
        { product_id: 2, quantity: 1 },
      ],
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "Other name",
      undefined,
      journal,
    ),
    /different shopping-list creation/u,
  );
});

test("creation IDs fence uncertain retries while new IDs allow identical lists", async () => {
  const owner = "owner";
  const { journal } = createDurableReviewJournal(owner);
  let createCalls = 0;
  let nextId = 50;
  let failCreate = true;
  const lists = new Map<
    number,
    {
      id: number;
      name: string;
      items: Array<{ productId: number; quantity: number }>;
    }
  >();
  const provider = {
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () =>
      [...lists.values()].map(({ id, name, items }) => ({
        id,
        name,
        productCount: items.length,
      })),
    createShoppingList: async (name: string) => {
      createCalls += 1;
      if (failCreate) {
        failCreate = false;
        throw new Error("creation outcome is unknown");
      }
      const id = nextId++;
      lists.set(id, { id, name, items: [] });
      return id;
    },
    getShoppingList: async (id: number) => structuredClone(lists.get(id)!),
    updateShoppingListProduct: async (
      id: number,
      productId: number,
      quantity: number,
    ) => {
      const list = lists.get(id)!;
      list.items = list.items.filter((item) => item.productId !== productId);
      if (quantity > 0) {
        list.items.push({ productId, quantity });
      }
    },
  };
  const items = [{ product_id: 7, quantity: 1 }];
  const creationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const first = new ProductReviewService(provider);
  const uncertain = await first.startShoppingList(
    owner,
    items,
    creationId,
    "Groceries",
    undefined,
    journal,
  );
  assert.equal(uncertain.saveStatus, "uncertain");
  assert.equal(createCalls, 1);

  const restarted = new ProductReviewService(provider);
  await assert.rejects(
    restarted.startShoppingList(
      owner,
      items,
      creationId,
      "Groceries",
      undefined,
      journal,
    ),
    /this operation will not create another list/u,
  );
  assert.equal(createCalls, 1);

  const deliberateNewList = await restarted.startShoppingList(
    owner,
    items,
    "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "Groceries",
    undefined,
    journal,
  );
  assert.equal(deliberateNewList.shoppingListId, 50);
  assert.equal(createCalls, 2);
});

test("direct basket draft submits 37 lines once, saves whole basket once, and abandons locally", async () => {
  const owner = "direct-owner";
  const durable = createDurableReviewJournal(owner);
  const requested = Array.from({ length: 37 }, (_, index) => ({
    product_id: index + 1,
    quantity: (index % 3) + 1,
  }));
  let basket = {
    items: [{ id: 900, name: "Existing", quantity: 2, total: 10 }],
    productsPrice: 10,
    deliveryPrice: 5,
    numberOfProducts: 2,
    deliveryTime: "Tomorrow",
  };
  let writes = 0;
  let listSaves = 0;
  let listCalls = 0;
  const provider = {
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => {
      listCalls++;
      return [];
    },
    createShoppingList: async () => {
      listCalls++;
      throw new Error("must not create a native list");
    },
    getCart: async () => structuredClone(basket),
    addManyToCart: async (
      items: BasketAddition[],
      options?: { beforeDispatch?: (baseline: Basket) => Promise<void> },
    ) => {
      await options?.beforeDispatch?.(structuredClone(basket));
      writes++;
      basket = {
        ...basket,
        items: [
          ...basket.items,
          ...items.map(({ productId, quantity }) => ({
            id: productId,
            name: `Product ${productId}`,
            quantity,
            total: 5 * quantity,
          })),
        ],
        numberOfProducts:
          basket.numberOfProducts! +
          items.reduce((sum, item) => sum + item.quantity, 0),
      };
      return structuredClone(basket);
    },
    createShoppingListFromBasket: async (options: {
      beforeDispatch?: (baseline: Basket) => Promise<void>;
    }) => {
      await options?.beforeDispatch?.(structuredClone(basket));
      listSaves++;
      return structuredClone(basket);
    },
  };
  const service = new ProductReviewService(provider);
  const draft = await service.startDirectBasket(owner, requested);
  assert.equal(draft.basketMode, "direct-basket");
  assert.equal(draft.items.length, 37);
  await assert.rejects(
    service.update(
      "different-owner",
      { kind: "quantity", product_id: 1, quantity: 9 },
      undefined,
      draft.draftId,
    ),
    /Unsaved draft is unavailable/u,
  );
  assert.equal(
    service.active(owner)?.items[0]?.quantity,
    requested[0]?.quantity,
  );
  await assert.rejects(
    service.submitDirectBasket(
      owner,
      draft.draftId!,
      "11111111-1111-4111-8111-111111111111",
      requested.map((item, index) =>
        index === 0 ? { ...item, quantity: item.quantity + 1 } : item,
      ),
      undefined,
      durable.journal,
    ),
    /exact products and quantities/u,
  );
  assert.equal(writes, 0);
  const submitted = await service.submitDirectBasket(
    owner,
    draft.draftId!,
    "22222222-2222-4222-8222-222222222222",
    requested,
    undefined,
    durable.journal,
  );
  assert.equal(submitted.result.status, "completed");
  assert.equal(writes, 1);
  assert.equal(listCalls, 0);
  assert.equal(basket.items[0]?.id, 900);
  assert.equal(basket.items.length, 38);
  await assert.rejects(
    service.submitDirectBasket(
      owner,
      draft.draftId!,
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      [{ ...requested[0]!, quantity: requested[0]!.quantity + 1 }],
      undefined,
      durable.journal,
    ),
    /receipt does not match.*exact reviewed products/u,
  );
  const wrongAccount = new ProductReviewService({
    ...provider,
    providerIdentity: () => "account-2",
  });
  await assert.rejects(
    wrongAccount.submitDirectBasket(
      owner,
      draft.draftId!,
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      requested,
      undefined,
      durable.journal,
    ),
    /receipt does not match the connected account/u,
  );

  const saveId = "33333333-3333-4333-8333-333333333333";
  const saved = await service.saveCurrentBasketAsShoppingList(
    owner,
    draft.draftId!,
    saveId,
    undefined,
    durable.journal,
  );
  assert.equal(saved.replayed, false);
  assert.equal(listSaves, 1);
  const restarted = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    getCart: async () => structuredClone(basket),
    createShoppingListFromBasket: async () => {
      listSaves++;
      return structuredClone(basket);
    },
  });
  const replay = await restarted.saveCurrentBasketAsShoppingList(
    owner,
    draft.draftId!,
    "44444444-4444-4444-8444-444444444444",
    undefined,
    durable.journal,
  );
  assert.equal(replay.replayed, true);
  assert.equal(listSaves, 1);
  assert.equal(writes, 1);

  const anotherOwner = "abandon-owner";
  const abandoned = await service.startDirectBasket(
    anotherOwner,
    requested.slice(0, 1),
  );
  service.end(anotherOwner, abandoned.draftId);
  assert.equal(service.active(anotherOwner), undefined);
  assert.equal(writes, 1);
  assert.equal(listCalls, 0);
});

test("a deliberate same-item request after submission starts a fresh draft", async () => {
  const owner = "repeat-direct-owner";
  const durable = createDurableReviewJournal(owner);
  let writes = 0;
  const basket: Basket = {
    items: [],
    productsPrice: 0,
    deliveryPrice: 0,
    numberOfProducts: 0,
    deliveryTime: undefined,
  };
  const provider = {
    ...client,
    providerIdentity: () => "account-1",
    getCart: async () => structuredClone(basket),
    addManyToCart: async (
      _items: BasketAddition[],
      options?: { beforeDispatch?: (baseline: Basket) => Promise<void> },
    ) => {
      await options?.beforeDispatch?.(structuredClone(basket));
      writes++;
      return structuredClone(basket);
    },
  };
  const service = new ProductReviewService(provider);
  const requested = [{ product_id: 12, quantity: 2 }];
  const first = await service.startDirectBasket(owner, requested);
  const firstSubmissionId = "11111111-1111-4111-8111-111111111111";
  const submitted = await service.submitDirectBasket(
    owner,
    first.draftId!,
    firstSubmissionId,
    requested,
    undefined,
    durable.journal,
  );
  assert.equal(submitted.result.replayed, false);
  assert.equal(writes, 1);
  await assert.rejects(
    service.update(
      owner,
      { kind: "quantity", product_id: 12, quantity: 3 },
      undefined,
      first.draftId,
    ),
    /already been submitted.*Start a new draft/u,
  );

  const second = await service.startDirectBasket(owner, requested);
  assert.notEqual(second.draftId, first.draftId);
  const deliberateRepeat = await service.submitDirectBasket(
    owner,
    second.draftId!,
    "22222222-2222-4222-8222-222222222222",
    requested,
    undefined,
    durable.journal,
  );
  assert.equal(deliberateRepeat.result.replayed, false);
  assert.equal(writes, 2);

  const oldDraftRetry = await service.submitDirectBasket(
    owner,
    first.draftId!,
    firstSubmissionId,
    requested,
    undefined,
    durable.journal,
  );
  assert.equal(oldDraftRetry.result.replayed, true);
  assert.equal(writes, 2);
});

test("an uncertain direct draft remains protected from a new selection", async () => {
  const owner = "uncertain-direct-start-owner";
  const durable = createDurableReviewJournal(owner);
  let writes = 0;
  const basket: Basket = {
    items: [],
    productsPrice: 0,
    deliveryPrice: 0,
    numberOfProducts: 0,
    deliveryTime: undefined,
  };
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    getCart: async () => structuredClone(basket),
    addManyToCart: async (
      _items: BasketAddition[],
      options?: { beforeDispatch?: (baseline: Basket) => Promise<void> },
    ) => {
      await options?.beforeDispatch?.(structuredClone(basket));
      writes++;
      throw new Error("provider response lost");
    },
  });
  const requested = [{ product_id: 33, quantity: 1 }];
  const draft = await service.startDirectBasket(owner, requested);
  await assert.rejects(
    service.submitDirectBasket(
      owner,
      draft.draftId!,
      "12121212-1212-4212-8212-121212121212",
      requested,
      undefined,
      durable.journal,
    ),
    /provider response lost/u,
  );
  const sameRequest = await service.startDirectBasket(owner, requested);
  assert.equal(sameRequest.draftId, draft.draftId);
  await assert.rejects(
    service.startDirectBasket(owner, [{ product_id: 34, quantity: 1 }]),
    /already in progress|pending|unconfirmed/u,
  );
  assert.equal(writes, 1);
});

test("expired direct receipts cannot replay while the old draft stays active", async () => {
  const owner = "retained-direct-owner";
  let now = 10_000;
  const durable = createDurableReviewJournal(owner, () => now);
  let writes = 0;
  let listSaves = 0;
  const basket: Basket = {
    items: [],
    productsPrice: 0,
    deliveryPrice: 0,
    numberOfProducts: 0,
    deliveryTime: undefined,
  };
  const provider = {
    ...client,
    providerIdentity: () => "account-1",
    getCart: async () => structuredClone(basket),
    addManyToCart: async (
      _items: BasketAddition[],
      options?: { beforeDispatch?: (baseline: Basket) => Promise<void> },
    ) => {
      await options?.beforeDispatch?.(structuredClone(basket));
      writes++;
      return structuredClone(basket);
    },
    createShoppingListFromBasket: async (options: {
      beforeDispatch?: (baseline: Basket) => Promise<void>;
    }) => {
      await options.beforeDispatch?.(structuredClone(basket));
      listSaves++;
      return structuredClone(basket);
    },
  };
  const service = new ProductReviewService(provider, { now: () => now });
  const requested = [{ product_id: 24, quantity: 1 }];
  const draft = await service.startDirectBasket(owner, requested);
  await service.submitDirectBasket(
    owner,
    draft.draftId!,
    "33333333-3333-4333-8333-333333333333",
    requested,
    undefined,
    durable.journal,
  );
  await service.saveCurrentBasketAsShoppingList(
    owner,
    draft.draftId!,
    "44444444-4444-4444-8444-444444444444",
    undefined,
    durable.journal,
  );
  assert.equal(writes, 1);
  assert.equal(listSaves, 1);

  // Repeated access keeps this submitted draft active beyond the durable
  // receipt window. Its explicit terminal markers must still fence.
  for (let hour = 0; hour < 3; hour++) {
    now += 60 * 60 * 1000;
    await service.update(
      owner,
      { kind: "navigate", destination: "ready" },
      undefined,
      draft.draftId,
    );
  }
  await durable.journal.read(`direct-basket-submit:${draft.draftId}`);
  await durable.journal.read(`direct-basket-save:${draft.draftId}`);
  assert.equal(
    await durable.read(`direct-basket-submit:${draft.draftId}`),
    undefined,
  );
  assert.equal(
    await durable.read(`direct-basket-save:${draft.draftId}`),
    undefined,
  );
  for (const submissionId of [
    "33333333-3333-4333-8333-333333333333",
    "55555555-5555-4555-8555-555555555555",
  ]) {
    await assert.rejects(
      service.submitDirectBasket(
        owner,
        draft.draftId!,
        submissionId,
        requested,
        undefined,
        durable.journal,
      ),
      /already attempted|already submitted|do not submit this draft again/u,
    );
  }
  for (const saveId of [
    "44444444-4444-4444-8444-444444444444",
    "66666666-6666-4666-8666-666666666666",
  ]) {
    await assert.rejects(
      service.saveCurrentBasketAsShoppingList(
        owner,
        draft.draftId!,
        saveId,
        undefined,
        durable.journal,
      ),
      /already attempted|already fenced|do not retry/u,
    );
  }
  assert.equal(writes, 1);
  assert.equal(listSaves, 1);
  const restarted = new ProductReviewService(provider, { now: () => now });
  await assert.rejects(
    restarted.submitDirectBasket(
      owner,
      draft.draftId!,
      "55555555-5555-4555-8555-555555555555",
      requested,
      undefined,
      durable.journal,
    ),
    /Unsaved draft is unavailable/u,
  );
  await assert.rejects(
    restarted.saveCurrentBasketAsShoppingList(
      owner,
      draft.draftId!,
      "66666666-6666-4666-8666-666666666666",
      undefined,
      durable.journal,
    ),
    /Unsaved draft is unavailable/u,
  );
  assert.equal(writes, 1);
  assert.equal(listSaves, 1);
  const freshDraft = await service.startDirectBasket(owner, requested);
  assert.notEqual(freshDraft.draftId, draft.draftId);
  const freshSubmit = await service.submitDirectBasket(
    owner,
    freshDraft.draftId!,
    "77777777-7777-4777-8777-777777777777",
    requested,
    undefined,
    durable.journal,
  );
  assert.equal(freshSubmit.result.replayed, false);
  assert.equal(writes, 2);
});

test("direct journal payloads omit zero basket rows and reject invalid baselines", async () => {
  const owner = "zero-row-direct-owner";
  const durable = createCallbackReviewJournal(owner);
  const baseline: Basket = {
    items: [
      { id: 90, name: "Empty line", quantity: 0, total: 0 },
      { id: 91, name: "Existing", quantity: 3, total: 9 },
    ],
    productsPrice: 9,
    deliveryPrice: 0,
    numberOfProducts: 3,
    deliveryTime: undefined,
  };
  let writes = 0;
  let listSaves = 0;
  const provider = {
    ...client,
    providerIdentity: () => "account-1",
    getCart: async () => structuredClone(baseline),
    addManyToCart: async (
      _items: BasketAddition[],
      options?: { beforeDispatch?: (basket: Basket) => Promise<void> },
    ) => {
      await options?.beforeDispatch?.(structuredClone(baseline));
      writes++;
      return structuredClone(baseline);
    },
    createShoppingListFromBasket: async (options: {
      beforeDispatch?: (basket: Basket) => Promise<void>;
    }) => {
      await options.beforeDispatch?.(structuredClone(baseline));
      listSaves++;
      return structuredClone(baseline);
    },
  };
  const service = new ProductReviewService(provider);
  const requested = [{ product_id: 7, quantity: 2 }];
  const draft = await service.startDirectBasket(owner, requested);
  await service.submitDirectBasket(
    owner,
    draft.draftId!,
    "77777777-7777-4777-8777-777777777777",
    requested,
    undefined,
    durable.journal,
  );
  const submit = (await durable.read(
    `direct-basket-submit:${draft.draftId}`,
  )) as ReviewOperation;
  assert.deepEqual(submit.baseline, [{ productId: 91, quantity: 3 }]);
  await service.saveCurrentBasketAsShoppingList(
    owner,
    draft.draftId!,
    "88888888-8888-4888-8888-888888888888",
    undefined,
    durable.journal,
  );
  const save = (await durable.read(
    `direct-basket-save:${draft.draftId}`,
  )) as ReviewOperation;
  assert.deepEqual(save.items, [{ productId: 91, quantity: 3 }]);
  assert.deepEqual(save.baseline, [{ productId: 91, quantity: 3 }]);
  assert.equal(writes, 1);
  assert.equal(listSaves, 1);

  for (const [index, invalidItems] of [
    [
      { id: 91, name: "Existing", quantity: 3, total: 9 },
      { id: 91, name: "Duplicate", quantity: 0, total: 0 },
    ],
    [{ id: 91, name: "Negative", quantity: -1, total: 0 }],
    [{ id: 0, name: "Invalid identity", quantity: 1, total: 0 }],
  ].entries()) {
    let invalidWrites = 0;
    const invalidOwner = `invalid-baseline-${index}`;
    const invalidDurable = createCallbackReviewJournal(invalidOwner);
    const invalidProvider = {
      ...provider,
      getCart: async () => ({ ...baseline, items: invalidItems }),
      addManyToCart: async (
        _items: BasketAddition[],
        options?: { beforeDispatch?: (basket: Basket) => Promise<void> },
      ) => {
        await options?.beforeDispatch?.({ ...baseline, items: invalidItems });
        invalidWrites++;
        return structuredClone(baseline);
      },
    };
    const invalidService = new ProductReviewService(invalidProvider);
    const invalidDraft = await invalidService.startDirectBasket(
      invalidOwner,
      requested,
    );
    await assert.rejects(
      invalidService.submitDirectBasket(
        invalidOwner,
        invalidDraft.draftId!,
        "99999999-9999-4999-8999-999999999999",
        requested,
        undefined,
        invalidDurable.journal,
      ),
      /cannot be bound safely/u,
    );
    assert.equal(invalidWrites, 0);
    assert.equal(
      await invalidDurable.read(`direct-basket-submit:${invalidDraft.draftId}`),
      undefined,
    );
  }
});

test("loading a saved list copies rows into a draft without mutating its source", async () => {
  const owner = "loaded-source-owner";
  const durable = createDurableReviewJournal(owner);
  const source = {
    id: 55,
    name: "Family list",
    items: [{ productId: 1, quantity: 2 }],
  };
  let account = "account-1";
  let listReads = 0;
  let listWrites = 0;
  let basketWrites = 0;
  let basket = {
    items: [] as Array<{
      id: number;
      name: string;
      quantity: number;
      total: number;
    }>,
    productsPrice: 0,
    deliveryPrice: 5,
    numberOfProducts: 0,
    deliveryTime: "Tomorrow",
  };
  const provider = {
    ...client,
    providerIdentity: () => account,
    getShoppingList: async () => {
      listReads++;
      return structuredClone(source);
    },
    updateShoppingListProduct: async () => {
      listWrites++;
    },
    deleteShoppingList: async () => {
      listWrites++;
    },
    getCart: async (): Promise<Basket> => structuredClone(basket),
    addManyToCart: async (
      items: BasketAddition[],
      options?: {
        beforeDispatch?: (baseline: Basket) => Promise<void>;
      },
    ) => {
      await options?.beforeDispatch?.(structuredClone(basket));
      basketWrites++;
      basket = {
        ...basket,
        items: items.map(({ productId, quantity }) => ({
          id: productId,
          name: `Product ${productId}`,
          quantity,
          total: quantity * 5,
        })),
        productsPrice: items.reduce((sum, item) => sum + item.quantity * 5, 0),
        numberOfProducts: items.reduce((sum, item) => sum + item.quantity, 0),
      };
      return structuredClone(basket);
    },
  };
  const service = new ProductReviewService(provider);
  const first = await service.loadShoppingListIntoDirectBasket(
    owner,
    source.id,
  );
  assert.equal(first.basketMode, "direct-basket");
  assert.equal(first.shoppingListId, undefined);
  assert.equal(first.shoppingListName, source.name);
  assert.deepEqual(
    first.items.map(({ product_id, quantity }) => [product_id, quantity]),
    [[1, 2]],
  );
  const edited = await service.update(owner, {
    kind: "quantity",
    product_id: 1,
    quantity: 3,
  });
  const submitted = await service.submitDirectBasket(
    owner,
    edited.draftId!,
    "55555555-5555-4555-8555-555555555555",
    [{ product_id: 1, quantity: 3 }],
    undefined,
    durable.journal,
  );
  assert.equal(submitted.result.status, "completed");
  assert.deepEqual(source.items, [{ productId: 1, quantity: 2 }]);
  assert.equal(listWrites, 0);
  assert.equal(basketWrites, 1);
  const second = await service.loadShoppingListIntoDirectBasket(
    owner,
    source.id,
  );
  assert.notEqual(second.draftId, first.draftId);
  assert.deepEqual(
    second.items.map(({ product_id, quantity }) => [product_id, quantity]),
    [[1, 2]],
  );
  assert.equal(listReads, 2);
  assert.equal(listWrites, 0);
  assert.equal(basketWrites, 1);

  account = "account-2";
  await assert.rejects(
    service.loadShoppingListIntoDirectBasket(owner, source.id),
    /account changed|connected Nemlig account|Reconnect to the Nemlig account/iu,
  );
});

test("an uncertain whole-basket save is fenced across service restart", async () => {
  const owner = "uncertain-basket-save-owner";
  const durable = createDurableReviewJournal(owner);
  let basket: Basket = {
    items: [{ id: 99, name: "Existing", quantity: 1, total: 5 }],
    productsPrice: 5,
    deliveryPrice: 0,
    numberOfProducts: 1,
    deliveryTime: undefined,
  };
  let basketWrites = 0;
  let listSaves = 0;
  const provider = {
    ...client,
    providerIdentity: () => "account-1",
    getCart: async () => structuredClone(basket),
    addManyToCart: async (
      items: BasketAddition[],
      options?: { beforeDispatch?: (baseline: Basket) => Promise<void> },
    ) => {
      await options?.beforeDispatch?.(structuredClone(basket));
      basketWrites++;
      basket = {
        ...basket,
        items: [
          ...basket.items,
          ...items.map(({ productId, quantity }) => ({
            id: productId,
            name: `Product ${productId}`,
            quantity,
            total: quantity * 2,
          })),
        ],
        productsPrice:
          basket.productsPrice! +
          items.reduce((sum, item) => sum + item.quantity * 2, 0),
        numberOfProducts:
          basket.numberOfProducts! +
          items.reduce((sum, item) => sum + item.quantity, 0),
      };
      return structuredClone(basket);
    },
    createShoppingListFromBasket: async (options: {
      beforeDispatch?: (baseline: Basket) => Promise<void>;
    }) => {
      await options.beforeDispatch?.(structuredClone(basket));
      listSaves++;
      throw new Error("response lost after list creation");
    },
  };
  const service = new ProductReviewService(provider);
  const draft = await service.startDirectBasket(owner, [
    { product_id: 7, quantity: 2 },
  ]);
  await service.submitDirectBasket(
    owner,
    draft.draftId!,
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    [{ product_id: 7, quantity: 2 }],
    undefined,
    durable.journal,
  );
  assert.equal(basketWrites, 1);
  await assert.rejects(
    service.saveCurrentBasketAsShoppingList(
      owner,
      draft.draftId!,
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      undefined,
      durable.journal,
    ),
    /response lost after list creation/u,
  );
  assert.equal(listSaves, 1);
  const restarted = new ProductReviewService(provider);
  await assert.rejects(
    restarted.saveCurrentBasketAsShoppingList(
      owner,
      draft.draftId!,
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      undefined,
      durable.journal,
    ),
    /may have completed|do not retry/u,
  );
  assert.equal(listSaves, 1);
  assert.equal(basketWrites, 1);
});

test("account changes after direct writes keep their receipts uncertain", async () => {
  const owner = "account-change-direct-owner";
  const durable = createDurableReviewJournal(owner);
  let account = "account-1";
  let basket: Basket = {
    items: [],
    productsPrice: 0,
    deliveryPrice: 0,
    numberOfProducts: 0,
    deliveryTime: undefined,
  };
  let resolveBasketSave: ((value: Basket) => void) | undefined;
  let releaseSave: (() => void) | undefined;
  const saveStarted = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let saveCalls = 0;
  const provider = {
    ...client,
    providerIdentity: () => account,
    getCart: async () => structuredClone(basket),
    addManyToCart: async (
      items: BasketAddition[],
      options?: { beforeDispatch?: (baseline: Basket) => Promise<void> },
    ) => {
      await options?.beforeDispatch?.(structuredClone(basket));
      basket = {
        ...basket,
        items: items.map(({ productId, quantity }) => ({
          id: productId,
          name: `Product ${productId}`,
          quantity,
          total: quantity,
        })),
        productsPrice: items.reduce((sum, item) => sum + item.quantity, 0),
        numberOfProducts: items.reduce((sum, item) => sum + item.quantity, 0),
      };
      return structuredClone(basket);
    },
    createShoppingListFromBasket: async (options: {
      beforeDispatch?: (baseline: Basket) => Promise<void>;
    }) => {
      await options.beforeDispatch?.(structuredClone(basket));
      saveCalls++;
      releaseSave?.();
      return new Promise<Basket>((resolve) => {
        resolveBasketSave = resolve;
      });
    },
  };
  const service = new ProductReviewService(provider);
  const draft = await service.startDirectBasket(owner, [
    { product_id: 7, quantity: 2 },
  ]);
  await service.submitDirectBasket(
    owner,
    draft.draftId!,
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    [{ product_id: 7, quantity: 2 }],
    undefined,
    durable.journal,
  );
  account = "account-2";
  assert.equal(
    (await durable.journal.read(`direct-basket-submit:${draft.draftId}`))
      ?.completed,
    true,
  );
  account = "account-1";
  const saving = service.saveCurrentBasketAsShoppingList(
    owner,
    draft.draftId!,
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    undefined,
    durable.journal,
  );
  await saveStarted;
  account = "account-2";
  resolveBasketSave?.(structuredClone(basket));
  await assert.rejects(
    saving,
    /account changed after the basket-to-list request/u,
  );
  assert.equal(saveCalls, 1);
  assert.notEqual(
    (await durable.journal.read(`direct-basket-save:${draft.draftId}`))
      ?.completed,
    true,
  );
});

test("account change after bulk dispatch prevents a completed receipt", async () => {
  const owner = "account-change-bulk-owner";
  const durable = createDurableReviewJournal(owner);
  let account = "account-1";
  const basket: Basket = {
    items: [],
    productsPrice: 0,
    deliveryPrice: 0,
    numberOfProducts: 0,
    deliveryTime: undefined,
  };
  let releaseDispatch: (() => void) | undefined;
  let resolveResponse: ((value: Basket) => void) | undefined;
  const dispatchStarted = new Promise<void>((resolve) => {
    releaseDispatch = resolve;
  });
  const provider = {
    ...client,
    providerIdentity: () => account,
    getCart: async () => structuredClone(basket),
    addManyToCart: async (
      _items: BasketAddition[],
      options?: { beforeDispatch?: (baseline: Basket) => Promise<void> },
    ) => {
      await options?.beforeDispatch?.(structuredClone(basket));
      releaseDispatch?.();
      return new Promise<Basket>((resolve) => {
        resolveResponse = resolve;
      });
    },
  };
  const service = new ProductReviewService(provider);
  const draft = await service.startDirectBasket(owner, [
    { product_id: 7, quantity: 2 },
  ]);
  const submission = service.submitDirectBasket(
    owner,
    draft.draftId!,
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    [{ product_id: 7, quantity: 2 }],
    undefined,
    durable.journal,
  );
  await dispatchStarted;
  account = "account-2";
  resolveResponse?.(structuredClone(basket));
  await assert.rejects(submission, /account changed after the basket request/u);
  assert.notEqual(
    (await durable.journal.read(`direct-basket-submit:${draft.draftId}`))
      ?.completed,
    true,
  );
});

test("no-journal partial creation reopens its exact list without retrying writes", async () => {
  const native = {
    id: 55,
    name: "Family",
    items: [] as Array<{ productId: number; quantity: number }>,
  };
  let createCalls = 0;
  let writes = 0;
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [
      { id: native.id, name: native.name, productCount: native.items.length },
    ],
    createShoppingList: async () => {
      createCalls += 1;
      return native.id;
    },
    getShoppingList: async () => structuredClone(native),
    updateShoppingListProduct: async (
      _listId: number,
      productId: number,
      quantity: number,
    ) => {
      writes += 1;
      if (productId === 2) {
        throw new Error("provider timed out");
      }
      native.items = [{ productId, quantity }];
    },
  });
  const items = [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 1 },
  ];
  const creationId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  const partial = await service.startShoppingList(
    "owner",
    items,
    creationId,
    "Family",
  );
  assert.equal(partial.saveStatus, "partial");
  assert.equal(partial.shoppingListId, 55);
  assert.equal(writes, 2);

  const recovered = await service.startShoppingList(
    "owner",
    items,
    creationId,
    "Family",
  );
  assert.equal(recovered.saveStatus, "partial");
  assert.equal(recovered.shoppingListId, 55);
  assert.equal(recovered.conflictItems?.length, 1);
  assert.equal(writes, 2);
  assert.equal(createCalls, 1);
  await assert.rejects(
    service.startShoppingList(
      "owner",
      [{ product_id: 1, quantity: 9 }],
      creationId,
      "Family",
    ),
    /different account, selection, or shopping-list name/u,
  );
  await assert.rejects(
    service.startShoppingList(
      "owner",
      items,
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "Family",
    ),
    /pending or unconfirmed changes/u,
  );
});

test("a delayed creation journal read cannot overwrite a busy native-list selection", async () => {
  let resolveFirstRead!: () => void;
  let resolveSecondRead!: () => void;
  let firstReadStarted!: () => void;
  let secondReadStarted!: () => void;
  let hydrationStarted!: () => void;
  let finishHydration!: () => void;
  const firstReadGate = new Promise<void>((resolve) => {
    resolveFirstRead = resolve;
  });
  const secondReadGate = new Promise<void>((resolve) => {
    resolveSecondRead = resolve;
  });
  const firstStarted = new Promise<void>((resolve) => {
    firstReadStarted = resolve;
  });
  const secondStarted = new Promise<void>((resolve) => {
    secondReadStarted = resolve;
  });
  const hydrationGate = new Promise<void>((resolve) => {
    finishHydration = resolve;
  });
  const hydration = new Promise<void>((resolve) => {
    hydrationStarted = resolve;
  });
  let reads = 0;
  const operations = new Map<string, ReviewOperation>();
  const journal: ReviewOperationJournal = {
    read: async (operationId) => {
      reads += 1;
      if (reads === 1) {
        firstReadStarted();
        await firstReadGate;
      } else {
        secondReadStarted();
        await secondReadGate;
      }
      return structuredClone(operations.get(operationId));
    },
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
    complete: async () => true,
  };
  let createCalls = 0;
  const native = {
    id: 81,
    name: "Groceries",
    items: [] as Array<{ productId: number; quantity: number }>,
  };
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    getProduct: async (id) => {
      hydrationStarted();
      await hydrationGate;
      return product(id);
    },
    listShoppingLists: async () => [
      { id: native.id, name: native.name, productCount: native.items.length },
    ],
    createShoppingList: async () => {
      createCalls += 1;
      return native.id;
    },
    getShoppingList: async () => structuredClone(native),
    updateShoppingListProduct: async (_id, productId, quantity) => {
      native.items = [{ productId, quantity }];
    },
  });
  const first = service.startShoppingList(
    "owner",
    [{ product_id: 1, quantity: 1 }],
    "11111111-1111-4111-8111-111111111111",
    "Groceries",
    undefined,
    journal,
  );
  await firstStarted;
  const second = service.startShoppingList(
    "owner",
    [{ product_id: 2, quantity: 1 }],
    "22222222-2222-4222-8222-222222222222",
    "Groceries",
    undefined,
    journal,
  );
  await secondStarted;
  resolveFirstRead();
  await hydration;
  resolveSecondRead();
  await assert.rejects(second, /operation is in progress/u);
  finishHydration();
  const result = await first;
  assert.equal(result.shoppingListId, native.id);
  assert.equal(createCalls, 1);
  assert.deepEqual(native.items, [{ productId: 1, quantity: 1 }]);
});

test("account changes during product hydration abort native-list creation", async () => {
  let account = "account-1";
  let hydrated!: () => void;
  let releaseHydration!: () => void;
  const hydrationStarted = new Promise<void>((resolve) => {
    hydrated = resolve;
  });
  const hydrationGate = new Promise<void>((resolve) => {
    releaseHydration = resolve;
  });
  let creates = 0;
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => account,
    getProduct: async (id) => {
      hydrated();
      await hydrationGate;
      return product(id);
    },
    createShoppingList: async () => {
      creates += 1;
      return 90;
    },
  });
  const starting = service.startShoppingList(
    "owner",
    [{ product_id: 1, quantity: 1 }],
    "33333333-3333-4333-8333-333333333333",
    "Groceries",
  );
  await hydrationStarted;
  account = "account-2";
  releaseHydration();
  await assert.rejects(starting, /account changed while preparing/u);
  assert.equal(creates, 0);
});

test("native-list quantity edits persist without an Update action", async () => {
  const native = {
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  };
  const writes: Array<[number, number, number]> = [];
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [
      { id: 44, name: "Family", productCount: 1 },
    ],
    getShoppingList: async () => structuredClone(native),
    updateShoppingListProduct: async (listId, productId, quantity) => {
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

  const updated = await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 3,
  });

  assert.deepEqual(writes, [[44, 1, 3]]);
  assert.equal(updated.shoppingListDirty, false);
  assert.equal(updated.items[0]?.quantity, 3);
  assert.deepEqual(native.items, [{ productId: 1, quantity: 3 }]);
});

test("a no-journal uncertain edit stays blocked after refresh until explicit discard", async () => {
  const native = {
    id: 44,
    name: "Family",
    items: [
      { productId: 1, quantity: 1 },
      { productId: 2, quantity: 1 },
    ],
  };
  let failNextWrite = true;
  let writes = 0;
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => structuredClone(native),
    updateShoppingListProduct: async (_listId, productId, quantity) => {
      writes += 1;
      if (failNextWrite) {
        failNextWrite = false;
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
  await service.openShoppingList("owner", 44);
  const partial = await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  assert.equal(partial.updateStatus, "partial");
  assert.equal(writes, 1);

  const refreshed = await service.openShoppingList("owner", 44);
  assert.equal(refreshed.updateStatus, "partial");
  assert.match(refreshed.actionNotice ?? "", /discard pending changes/u);
  await assert.rejects(
    service.updateShoppingList("owner", 44, {
      kind: "quantity",
      product_id: 2,
      quantity: 3,
    }),
    /Refresh this shopping list/u,
  );
  assert.equal(writes, 1);

  const discarded = await service.updateShoppingList("owner", 44, {
    kind: "discard_pending_update",
  });
  assert.equal(discarded.updateStatus, undefined);
  assert.equal(discarded.shoppingListDirty, false);
  assert.deepEqual(
    discarded.items.map(({ product_id, quantity }) => [product_id, quantity]),
    [
      [1, 1],
      [2, 1],
    ],
  );
  assert.equal(writes, 1);
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

test("native-list quantity edits persist and can be reversed", async () => {
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
  const list = await service.startShoppingList(
    "owner",
    [{ product_id: 1, quantity: 1 }],
    "44444444-4444-4444-8444-444444444444",
    "Weekend",
  );
  assert.equal(list.shoppingListId, 44);
  assert.equal(Boolean(list.shoppingListDirty), false);

  const increased = await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  assert.equal(Boolean(increased.shoppingListDirty), false);
  assert.equal(saved.items[0]?.quantity, 2);
  const reverted = await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 1,
  });
  assert.equal(Boolean(reverted.shoppingListDirty), false);
  assert.equal(saved.items[0]?.quantity, 1);
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

test("new draft replaces only a clean saved review after hydration", async () => {
  const saved = {
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 2 }],
  };
  let failHydration = false;
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: saved.id, name: saved.name }],
    getShoppingList: async () => structuredClone(saved),
    getProduct: async (id: number) => {
      if (failHydration) {
        throw new NemligError("synthetic product read failure", 401);
      }
      return product(id);
    },
  });
  const native = await service.openShoppingList("owner", 44);
  assert.equal(native.shoppingListId, 44);

  await assert.rejects(
    service.start("owner", [{ product_id: 0, quantity: 1 }]),
    /unique exact products/u,
  );
  assert.equal(service.active("owner")?.shoppingListId, 44);
  failHydration = true;
  await assert.rejects(
    service.start("owner", [{ product_id: 2, quantity: 1 }]),
    /synthetic product read failure/u,
  );
  assert.equal(service.active("owner")?.shoppingListId, 44);
  failHydration = false;

  const draft = await service.start("owner", [
    { product_id: 2, quantity: 1 },
    { product_id: 3, quantity: 2 },
  ]);
  assert.equal(draft.draftId !== undefined, true);
  assert.deepEqual(
    draft.items.map(({ product_id, quantity }) => [product_id, quantity]),
    [
      [2, 1],
      [3, 2],
    ],
  );
  assert.deepEqual(saved.items, [{ productId: 1, quantity: 2 }]);

  const reopened = await service.openShoppingList("owner", 44);
  await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 3,
  });
  await assert.rejects(
    service.start("owner", [{ product_id: 2, quantity: 1 }]),
    /pending or unconfirmed changes/u,
  );
  assert.equal(
    service.active("owner")?.shoppingListId,
    reopened.shoppingListId,
  );
  assert.equal(service.active("owner")?.shoppingListDirty, true);
});

test("an explicit native-list selection serializes edits before replacing a draft", async () => {
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
  const draft = await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  const opening = service.openShoppingList("owner", 44);
  await readStarted;
  await assert.rejects(
    service.update("owner", {
      kind: "quantity",
      product_id: 1,
      quantity: 2,
    }),
    /review is opening/u,
  );
  assert.equal(service.active("owner")?.draftId, draft.draftId);
  releaseList({
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  });
  await opening;
  assert.equal(service.active("owner")?.shoppingListId, 44);
});

test("an existing native review stays protected during its delayed refresh", async () => {
  let delay = false;
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
      if (delay) {
        markReadStarted();
        return delayedList;
      }
      return { id: 44, name: "Family", items: [{ productId: 1, quantity: 1 }] };
    },
    updateShoppingListProduct: async () => undefined,
  });
  await service.openShoppingList("native", 44);
  delay = true;
  const opening = service.openShoppingList("native", 44);
  await readStarted;
  assert.throws(() => service.end("native"), /review is opening/u);
  await assert.rejects(
    service.updateShoppingList("native", 44, {
      kind: "quantity",
      product_id: 1,
      quantity: 2,
    }),
    /review is opening/u,
  );
  for (let index = 0; index < 7; index += 1) {
    await service.start(`protected-${index}`, [
      { product_id: index + 10, quantity: 1 },
    ]);
  }
  await assert.rejects(
    service.start("overflow", [{ product_id: 99, quantity: 1 }]),
    /limit reached/u,
  );
  assert.equal(service.active("native")?.shoppingListId, 44);
  releaseList({
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  });
  await opening;
  assert.equal(service.active("native")?.shoppingListId, 44);
});

test("a concurrent native-list open is rejected before a second provider read", async () => {
  let release!: (list: {
    id: number;
    name: string;
    items: Array<{ productId: number; quantity: number }>;
  }) => void;
  let reads = 0;
  const pending = new Promise<{
    id: number;
    name: string;
    items: Array<{ productId: number; quantity: number }>;
  }>((resolve) => {
    release = resolve;
  });
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [
      { id: 44, name: "Family" },
      { id: 45, name: "Work" },
    ],
    getShoppingList: async () => {
      reads += 1;
      return pending;
    },
  });
  const first = service.openShoppingList("owner", 44);
  await assert.rejects(
    service.openShoppingList("owner", 45),
    /already opening/u,
  );
  assert.equal(reads, 1);
  release({ id: 44, name: "Family", items: [{ productId: 1, quantity: 1 }] });
  await first;
  assert.equal(service.active("owner")?.shoppingListId, 44);
});

test("reopening a changed native list uses the current provider rows", async () => {
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
  await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  native.items = [{ productId: 1, quantity: 3 }];

  const reopened = await service.openShoppingList("owner", 44);
  assert.equal(reopened.items[0]?.quantity, 3);
  assert.equal(Boolean(reopened.shoppingListDirty), false);
  assert.equal(reopened.updateStatus, undefined);
  assert.equal(reopened.conflictItems, undefined);
  assert.equal(writes, 1, "opening the exact list only reads provider state");
  const updated = await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  assert.equal(updated.saveStatus, "saved");
  assert.equal(native.items[0]?.quantity, 2);
  assert.equal(writes, 2);
});

test("saved native list verifies transfer before durable source cleanup and replay fence", async () => {
  let now = 0;
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
  const service = new ProductReviewService(nativeClient, {
    proposals,
    now: () => now,
  });
  const { journal, read } = createDurableReviewJournal("owner");
  readOperation = async (operationId) =>
    (await read(operationId)) as ReviewOperation | undefined;
  await service.openShoppingList("owner", 44, undefined, journal);
  const expiredContextId = service.active("owner")?.reviewContextId;
  now += DRAFT_IDLE_TIMEOUT_MS / 2;
  for (let index = 0; index < 7; index += 1) {
    await service.start(`protected-${index}`, [
      { product_id: index + 10, quantity: 1 },
    ]);
  }
  now += DRAFT_IDLE_TIMEOUT_MS / 2 + 1;
  assert.ok(expiredContextId);
  assert.equal(service.reviewContextOwner(expiredContextId), undefined);
  assert.equal(service.active("owner"), undefined);
  await service.start("protected-7", [{ product_id: 20, quantity: 1 }]);
  events.length = 0;

  const submitted = await service.submit(
    "owner",
    "attempt-1",
    44,
    undefined,
    journal,
    { name: "Family", items: [{ product_id: 1, quantity: 1 }] },
  );

  assert.ok(submitted.review.submission);
  assert.equal(submitted.review.submission.status, "submitted");
  assert.equal(submitted.result.basket.number_of_products, 4);
  assert.ok(basket.items[0]);
  assert.ok(basket.items[1]);
  assert.equal(basket.items[0].quantity, 3);
  assert.equal(basket.items[1].id, 99);
  assert.equal(sourcePresent, false);
  assert.deepEqual(
    [transfers, listCreates, listUpdates, listDeletes],
    [1, 0, 0, 1],
  );
  assert.ok(events.indexOf("transfer") < events.lastIndexOf("basket-read"));
  assert.ok(events.lastIndexOf("basket-read") < events.indexOf("delete-list"));
  const receipt = (await read("native-list-submit:44")) as
    ReviewOperation | undefined;
  assert.ok(receipt);
  assert.equal(receipt.kind, "submit");
  assert.equal(receipt.dispatchAttempted, true);
  assert.equal(receipt.completed, true);
  assert.equal(receipt.cleanupStatus, "deleted");

  await assert.rejects(
    service.submit("owner", "attempt-2", 44, undefined, journal, {
      name: "Family",
      items: [{ product_id: 1, quantity: 1 }],
    }),
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

test("restarted submission preserves an attempted transfer as uncertain", async () => {
  let transfers = 0;
  let basketReads = 0;
  const native = {
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  };
  const provider = {
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => structuredClone(native),
    getCart: async () => {
      basketReads++;
      return {
        items: [],
        productsPrice: 0,
        deliveryPrice: 0,
        numberOfProducts: 0,
        deliveryTime: undefined,
      };
    },
    addShoppingListToCart: async () => {
      transfers++;
    },
  };
  const { journal, read } = createDurableReviewJournal("owner");
  const proposals = new BasketProposalService({
    getProduct: async (id) => product(id),
    getFreshProduct: async (id) => product(id),
    getCart: async () => provider.getCart(),
    addToCart: async () => provider.getCart(),
    getShoppingList: async () => structuredClone(native),
    addShoppingListToCart: async () => {
      transfers++;
    },
  });
  const operation: ReviewOperation = {
    operationId: "native-list-submit:44",
    generation: "attempt-1",
    accountIdentity: "account-1",
    kind: "submit",
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

  await assert.rejects(
    new ProductReviewService(provider, { proposals }).submit(
      "owner",
      "attempt-2",
      44,
      undefined,
      journal,
      { name: "Family", items: [{ product_id: 1, quantity: 1 }] },
    ),
    (error: unknown) => {
      assert.ok(
        error instanceof NativeTransferUnconfirmedError,
        `Unexpected replay error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      assert.match(
        error.message,
        /previous basket transfer may have completed/u,
      );
      assert.doesNotMatch(error.message, /no basket write was sent/iu);
      return true;
    },
  );
  assert.equal(transfers, 0);
  assert.equal(basketReads, 0);
  const receipt = (await read(operation.operationId)) as
    ReviewOperation | undefined;
  assert.equal(receipt?.dispatchAttempted, true);
  assert.equal(receipt?.completed, undefined);
});

test("opening a completed receipt does not retry source cleanup or transfer", async () => {
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
  const opened = await service.openShoppingList(
    "owner",
    44,
    undefined,
    journal,
  );
  assert.equal(opened.shoppingListId, 44);
  assert.equal(sourcePresent, true);
  assert.equal(
    ((await read(operation.operationId)) as ReviewOperation | undefined)
      ?.cleanupStatus,
    "pending",
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
  assert.equal(review.items[0]?.quantity, 2);
  assert.equal(review.submission?.cleanup_warning, undefined);
  assert.equal(
    ((await read(operation.operationId)) as ReviewOperation | undefined)
      ?.cleanupStatus,
    "pending",
  );
  assert.equal(deletes, 0);
});

test("in-flight native-list updates cannot prepare or submit", async () => {
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
  updating = true;
  const update = service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
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
  assert.equal(saved.items[0]?.quantity, 2);
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
  const result = await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
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

test("native shopping-list removal writes and reads back the same list immediately", async () => {
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

  assert.deepEqual(writes, [[44, 1, 0]]);
  assert.equal(staged.shoppingListDirty, false);
  assert.deepEqual(
    staged.items.map(({ product_id }) => product_id),
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
  await assert.rejects(
    service.updateShoppingList(
      "owner",
      44,
      { kind: "quantity", product_id: 1, quantity: 2 },
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
  const update = (quantity: number) =>
    service.updateShoppingList(
      owner,
      44,
      { kind: "quantity", product_id: 1, quantity },
      undefined,
      journal,
    );
  const operationId = "native-list-update:44";

  await service.openShoppingList(owner, 44, undefined, journal);
  assert.equal((await update(2)).saveStatus, "saved");
  const firstGeneration = ((await read(operationId)) as ReviewOperation)
    .generation;

  assert.equal((await update(3)).saveStatus, "saved");
  const secondGeneration = ((await read(operationId)) as ReviewOperation)
    .generation;
  assert.notEqual(secondGeneration, firstGeneration);

  await service.openShoppingList(owner, 44, undefined, journal);
  assert.equal((await update(4)).saveStatus, "saved");
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
  const partial = await service.updateShoppingList(
    "owner",
    44,
    {
      kind: "quantity",
      product_id: 2,
      quantity: 2,
    },
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
  assert.match(
    recovered.actionNotice ?? "",
    /interrupted before every change was confirmed/u,
  );
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
  let retryWrites = 0;
  const guarded = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => structuredClone(native),
    updateShoppingListProduct: async () => {
      retryWrites += 1;
    },
  });
  const guardedRecovery = await guarded.openShoppingList(
    "owner",
    44,
    undefined,
    journal,
  );
  assert.equal(guardedRecovery.updateStatus, "partial");
  await assert.rejects(
    guarded.updateShoppingList(
      "owner",
      44,
      {
        kind: "quantity",
        product_id: 1,
        quantity: 4,
      },
      undefined,
      journal,
    ),
    /Refresh this shopping list/u,
  );
  const discarded = await guarded.updateShoppingList(
    "owner",
    44,
    { kind: "discard_pending_update" },
    undefined,
    journal,
  );
  assert.equal(discarded.updateStatus, undefined);
  assert.equal(discarded.shoppingListDirty, false);
  assert.deepEqual(
    new Map(
      native.items.map(({ productId, quantity }) => [productId, quantity]),
    ),
    new Map([
      [1, 2],
      [2, 1],
    ]),
  );
  assert.equal(retryWrites, 0);
  assert.equal(operations.size, 1);
  assert.ok(operations.get("native-list-update:44")?.completedUntil);
});

test("external edits during an interrupted update require explicit discard", async () => {
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
  assert.match(recovered.actionNotice ?? "", /interrupted update/u);
  assert.equal(writes, 0);
  await assert.rejects(
    service.updateShoppingList(
      "owner",
      44,
      { kind: "quantity", product_id: 1, quantity: 4 },
      undefined,
      journal,
    ),
    /Refresh this shopping list/u,
  );
  const discarded = await service.updateShoppingList(
    "owner",
    44,
    { kind: "discard_pending_update" },
    undefined,
    journal,
  );
  assert.equal(discarded.saveStatus, "saved");
  assert.equal(native[0]?.quantity, 3);
  assert.ok(operation?.completedUntil);
  assert.equal(writes, 0);
});

test("opening an exact list completes a fully confirmed update without writes", async () => {
  const { journal, read } = createDurableReviewJournal("owner");
  await journal.write({
    operationId: "native-list-update:44",
    generation: "update-exact",
    accountIdentity: "account-1",
    kind: "update",
    name: "Family",
    listId: 44,
    baseline: [{ productId: 1, quantity: 1 }],
    items: [{ productId: 1, quantity: 2 }],
  });
  let writes = 0;
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => ({
      id: 44,
      name: "Family",
      items: [{ productId: 1, quantity: 2 }],
    }),
    updateShoppingListProduct: async () => {
      writes += 1;
    },
  });

  const reopened = await service.openShoppingList(
    "owner",
    44,
    undefined,
    journal,
  );

  assert.equal(reopened.saveStatus, "saved");
  assert.equal(reopened.updateStatus, undefined);
  assert.equal(reopened.items[0]?.quantity, 2);
  assert.equal(writes, 0);
  assert.ok(
    ((await read("native-list-update:44")) as ReviewOperation | undefined)
      ?.completedUntil,
  );
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

test("a changed intent must explicitly discard an interrupted update before editing", async () => {
  const { journal, read } = createDurableReviewJournal("owner");
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
  const native = {
    id: 44,
    name: "Family",
    items: [{ productId: 1, quantity: 1 }],
  };
  let writes = 0;
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => structuredClone(native),
    updateShoppingListProduct: async (_listId, productId, quantity) => {
      writes++;
      native.items = [{ productId, quantity }];
    },
  });
  await service.openShoppingList("owner", 44, undefined, journal);
  const previousGeneration = (await journal.read("native-list-update:44"))
    ?.generation;
  await assert.rejects(
    service.updateShoppingList("owner", 44, {
      kind: "quantity",
      product_id: 1,
      quantity: 3,
    }),
    /Refresh this shopping list/u,
  );
  const discarded = await service.updateShoppingList(
    "owner",
    44,
    { kind: "discard_pending_update" },
    undefined,
    journal,
  );
  assert.equal(discarded.updateStatus, undefined);
  const saved = await service.updateShoppingList(
    "owner",
    44,
    { kind: "quantity", product_id: 1, quantity: 3 },
    undefined,
    journal,
  );

  assert.equal(saved.saveStatus, "saved");
  assert.equal(native.items[0]?.quantity, 3);
  assert.equal(writes, 1);
  const updated = (await read("native-list-update:44")) as ReviewOperation;
  assert.notEqual(updated?.generation, previousGeneration);
  assert.ok(updated?.completedUntil);
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
      if (readCount === 3) {
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

  await service.openShoppingList("owner", 44);
  const result = await service.updateShoppingList("owner", 44, {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });

  assert.equal(result.saveStatus, "uncertain");
  assert.equal(result.items[0]?.quantity, 2);
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
  let now = 0;
  let resolveCreate!: (id: number) => void;
  let creates = 0;
  let updates = 0;
  let failSecondUpdate = true;
  let saved = {
    id: 44,
    name: "List",
    items: [] as Array<{ productId: number; quantity: number }>,
  };
  const service = new ProductReviewService(
    {
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
    },
    { now: () => now },
  );
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

  now += DRAFT_IDLE_TIMEOUT_MS + 1;
  assert.equal(service.active("owner", draft.draftId)?.saveStatus, "partial");

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

test("restart Save reserves its owner before awaiting the durable journal", async () => {
  const base = createDurableReviewJournal("owner").journal;
  const operation: ReviewOperation = {
    operationId: "save-recovery-1",
    generation: "save-recovery-1",
    accountIdentity: "account-1",
    kind: "save",
    name: "Family",
    createAttempted: true,
    listId: 44,
    items: [{ productId: 1, quantity: 1 }],
  };
  await base.write(operation);
  let release!: () => void;
  let markReadStarted!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const readStarted = new Promise<void>((resolve) => {
    markReadStarted = resolve;
  });
  let reads = 0;
  const journal: ReviewOperationJournal = {
    read: async (id) => {
      reads += 1;
      markReadStarted();
      await pending;
      return base.read(id);
    },
    claim: (...args) => base.claim(...args),
    write: (value) => base.write(value),
    complete: (...args) => base.complete(...args),
  };
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
  });
  const first = service.save(
    "owner",
    "Family",
    operation.operationId,
    undefined,
    journal,
  );
  await readStarted;
  await assert.rejects(
    service.save("owner", "Family", operation.operationId, undefined, journal),
    /already opening/u,
  );
  assert.equal(reads, 1);
  release();
  const recovered = await first;
  assert.equal(recovered.saveStatus, "saved");
  assert.equal(recovered.shoppingListId, 44);
});

test("draft save serializes row writes and verifies the actual list", async () => {
  let activeWrites = 0;
  let maximumActiveWrites = 0;
  const native = {
    id: 45,
    name: "List",
    items: [] as Array<{ productId: number; quantity: number }>,
  };
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [],
    createShoppingList: async () => native.id,
    updateShoppingListProduct: async (_listId, productId, quantity) => {
      activeWrites += 1;
      maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
      await new Promise<void>((resolve) => setImmediate(resolve));
      native.items.push({ productId, quantity });
      activeWrites -= 1;
    },
    getShoppingList: async () => structuredClone(native),
  });
  const draft = await service.start(
    "owner",
    Array.from({ length: 4 }, (_, index) => ({
      product_id: index + 1,
      quantity: 1,
    })),
  );

  const saved = await service.save("owner", "List", draft.draftId);

  assert.equal(saved.saveStatus, "saved");
  assert.equal(native.items.length, 4);
  assert.equal(maximumActiveWrites, 1);
});

test("draft save preserves rows when provider updates replace the list snapshot", async () => {
  let created = false;
  const { journal } = createDurableReviewJournal("owner");
  let native = {
    id: 46,
    name: "List",
    items: [] as Array<{ productId: number; quantity: number }>,
  };
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () =>
      created ? [{ id: native.id, name: native.name }] : [],
    createShoppingList: async () => {
      created = true;
      return native.id;
    },
    updateShoppingListProduct: async (_listId, productId, quantity) => {
      const before = structuredClone(native.items);
      await new Promise<void>((resolve) => setImmediate(resolve));
      native = { ...native, items: [...before, { productId, quantity }] };
    },
    getShoppingList: async () => structuredClone(native),
  });
  const draft = await service.start("owner", [
    { product_id: 1, quantity: 1 },
    { product_id: 2, quantity: 1 },
  ]);

  const saved = await service.save(
    "owner",
    "List",
    draft.draftId,
    undefined,
    journal,
  );

  assert.equal(saved.saveStatus, "saved");
  assert.equal(saved.shoppingListId, 46);
  const savedSubset = await service.openShoppingList(
    "owner",
    46,
    undefined,
    journal,
  );
  assert.equal(savedSubset.saveStatus, "saved");
  assert.ok((await journal.read(draft.draftId!))?.completedUntil);
  assert.deepEqual(
    savedSubset.items.map(({ product_id }) => product_id),
    [1, 2],
  );
  assert.deepEqual(
    native.items.map(({ productId }) => productId),
    [1, 2],
  );
});

test("one failed product update does not stop later shopping-list products", async () => {
  const native = {
    id: 47,
    name: "List",
    items: [] as Array<{ productId: number; quantity: number }>,
  };
  const attempted: number[] = [];
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [],
    createShoppingList: async () => native.id,
    updateShoppingListProduct: async (_listId, productId, quantity) => {
      attempted.push(productId);
      if (productId === 2) {
        throw new NemligError("Product unavailable");
      }
      native.items.push({ productId, quantity });
    },
    getShoppingList: async () => structuredClone(native),
  });
  const draft = await service.start(
    "owner",
    Array.from({ length: 4 }, (_, index) => ({
      product_id: index + 1,
      quantity: 1,
    })),
  );

  const partial = await service.save("owner", "List", draft.draftId);

  assert.deepEqual(attempted, [1, 2, 3, 4]);
  assert.equal(partial.saveStatus, "partial");
  assert.deepEqual(partial.saveProgress, { completed: 3, total: 4 });
  assert.equal(partial.shoppingListId, 47);
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
  assert.deepEqual(partial.saveProgress, { completed: 51, total: 52 });
  assert.equal(native.items.length, 51);

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
    await service.start("owner", [{ product_id: 1, quantity: 1 }]),
    edited,
  );
  assert.deepEqual(service.active("owner"), edited);
  assert.equal(service.active("owner")?.items[0]?.state, "ready");
  service.end("owner");
  assert.equal(service.active("owner"), undefined);
  const restarted = await service.start("owner", [
    { product_id: 1, quantity: 1 },
  ]);
  assert.equal(restarted.items[0]?.product_id, 1);
});

test("bounded capacity never silently evicts an unexpired draft", async () => {
  let reads = 0;
  const service = new ProductReviewService({
    ...client,
    getProduct: async (id: number) => {
      reads++;
      return product(id);
    },
  });
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
  await service.start("owner-1", [
    { product_id: 1, quantity: 1 },
    { product_id: 2, quantity: 3 },
  ]);
  const readsAtCapacity = reads;
  await assert.rejects(
    service.start("owner-9", [{ product_id: 9, quantity: 1 }]),
    /limit reached/u,
  );
  assert.equal(reads, readsAtCapacity);
  assert.equal(service.active("owner-1")?.items[0]?.product_id, 1);
  for (let index = 2; index <= 8; index++) {
    assert.equal(service.active(`owner-${index}`)?.items[0]?.product_id, index);
  }

  service.end("owner-1");
  assert.equal(
    (await service.start("owner-9", [{ product_id: 9, quantity: 1 }])).items[0]
      ?.product_id,
    9,
  );
});

test("expired drafts release capacity after the existing idle deadline", async () => {
  let now = 1_000;
  const service = new ProductReviewService(client, { now: () => now });
  for (let index = 1; index <= 8; index++) {
    await service.start(`owner-${index}`, [{ product_id: index, quantity: 1 }]);
  }
  now += DRAFT_IDLE_TIMEOUT_MS;
  const next = await service.start("owner-9", [{ product_id: 9, quantity: 1 }]);
  assert.equal(next.items[0]?.product_id, 9);
  for (let index = 1; index <= 8; index++) {
    assert.equal(service.active(`owner-${index}`), undefined);
  }
});

test("native review admission reserves capacity before provider hydration and releases it on failure", async () => {
  let releaseListRead!: () => void;
  let listReadStarted!: () => void;
  const listReadPending = new Promise<void>((resolve) => {
    releaseListRead = resolve;
  });
  const listReadReady = new Promise<void>((resolve) => {
    listReadStarted = resolve;
  });
  let productReads = 0;
  const service = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => {
      listReadStarted();
      await listReadPending;
      return [{ id: 44, name: "Family" }];
    },
    getShoppingList: async () => ({
      id: 44,
      name: "Family",
      items: [{ productId: 99, quantity: 1 }],
    }),
    getProduct: async (id: number) => {
      productReads++;
      return product(id);
    },
  });
  for (let index = 1; index <= 7; index++) {
    await service.start(`draft-${index}`, [{ product_id: index, quantity: 1 }]);
  }

  const opening = service.openShoppingList("native", 44);
  await listReadReady;
  const readsAtReservation = productReads;
  await assert.rejects(
    service.start("overflow", [{ product_id: 88, quantity: 1 }]),
    /limit reached/u,
  );
  assert.equal(productReads, readsAtReservation);
  releaseListRead();
  await opening;

  const fullReviewService = new ProductReviewService({
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [],
    getShoppingList: async () => ({ id: 44, name: "Family", items: [] }),
  });
  for (let index = 1; index <= 7; index++) {
    await fullReviewService.start(`draft-${index}`, [
      { product_id: index, quantity: 1 },
    ]);
  }
  await assert.rejects(
    fullReviewService.openShoppingList("failed-native", 44),
    /unavailable or was deleted/u,
  );
  assert.equal(
    (
      await fullReviewService.start("released-slot", [
        { product_id: 90, quantity: 1 },
      ])
    ).items[0]?.product_id,
    90,
  );
});

test("stateless native reviews stay bounded and clean expiry only drops the transient handle", async () => {
  let now = 5_000;
  let deletes = 0;
  const service = new ProductReviewService(
    {
      ...client,
      providerIdentity: () => "account-1",
      listShoppingLists: async () =>
        Array.from({ length: 9 }, (_, index) => ({
          id: index + 1,
          name: `List ${index + 1}`,
        })),
      getShoppingList: async (id: number) => ({
        id,
        name: `List ${id}`,
        items: [{ productId: id, quantity: 1 }],
      }),
      deleteShoppingList: async () => {
        deletes++;
      },
    },
    { now: () => now },
  );
  const contexts: string[] = [];
  for (let index = 1; index <= 9; index++) {
    const review = await service.openShoppingList(`stateless-${index}`, index);
    assert.ok(review.reviewContextId);
    contexts.push(review.reviewContextId);
  }
  assert.equal(service.reviewContextOwner(contexts[0]!), undefined);
  for (const context of contexts.slice(1)) {
    assert.ok(service.reviewContextOwner(context));
  }

  const lastContext = contexts.at(-1)!;
  now += DRAFT_IDLE_TIMEOUT_MS;
  assert.equal(service.reviewContextOwner(lastContext), undefined);
  const reopened = await service.openShoppingList("stateless-9", 9);
  assert.ok(reopened.reviewContextId);
  assert.notEqual(reopened.reviewContextId, lastContext);
  assert.equal(deletes, 0);
});

test("capacity pressure preserves staged native edits", async () => {
  const native = {
    id: 44,
    name: "Family",
    items: [{ productId: 99, quantity: 1 }],
  };
  const provider = {
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => structuredClone(native),
    updateShoppingListProduct: async () => undefined,
  };
  const service = new ProductReviewService(provider);
  const nativeReview = await service.openShoppingList("native", 44);
  await service.updateShoppingList("native", 44, {
    kind: "quantity",
    product_id: 99,
    quantity: 2,
  });
  for (let index = 1; index <= 7; index++) {
    await service.start(`draft-${index}`, [{ product_id: index, quantity: 1 }]);
  }
  await assert.rejects(
    service.start("overflow", [{ product_id: 88, quantity: 1 }]),
    /limit reached/u,
  );
  const staged = service.active("native");
  assert.equal(staged?.shoppingListDirty, true);
  assert.equal(staged?.items[0]?.quantity, 2);
  assert.equal(
    service.reviewContextOwner(nativeReview.reviewContextId!)?.shoppingListId,
    44,
  );
});

test("capacity pressure preserves an unresolved native submission fence", async () => {
  const provider = {
    ...client,
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => ({
      id: 44,
      name: "Family",
      items: [{ productId: 99, quantity: 1 }],
    }),
  };
  const { journal } = createDurableReviewJournal("owner");
  await journal.write({
    operationId: "native-list-submit:44",
    generation: "uncertain-attempt",
    accountIdentity: "account-1",
    kind: "submit",
    name: "Family",
    listId: 44,
    items: [{ productId: 99, quantity: 1 }],
    baseline: [],
    dispatchAttempted: true,
  });
  const service = new ProductReviewService(provider);
  const review = await service.openShoppingList(
    "native",
    44,
    undefined,
    journal,
  );
  assert.equal(review.submission?.status, "uncertain");
  for (let index = 1; index <= 7; index++) {
    await service.start(`draft-${index}`, [{ product_id: index, quantity: 1 }]);
  }
  await assert.rejects(
    service.start("overflow", [{ product_id: 88, quantity: 1 }]),
    /limit reached/u,
  );
  assert.equal(service.active("native")?.submission?.status, "uncertain");
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
