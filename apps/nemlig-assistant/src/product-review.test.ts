import assert from "node:assert/strict";
import test from "node:test";
import {
  NemligError,
  ProductNotFoundError,
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
  providerIdentity: () => "fixture-account",
  getProduct: async (id: number) => product(id),
  getFreshProduct: async (id: number) => product(id),
  searchProducts: async () => [product(3)],
  listShoppingLists: async () => [],
  getShoppingList: async () => ({ id: 1, name: "fixture", items: [] }),
};

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

test("direct Submit rechecks identity and package before dispatch but accepts a price change", async () => {
  const owner = "fresh-direct-owner";
  const durable = createDurableReviewJournal(owner);
  const basket: Basket = {
    items: [],
    productsPrice: 0,
    deliveryPrice: 0,
    numberOfProducts: 0,
    deliveryTime: undefined,
  };
  let current = { ...product(7), unitSize: "2 stk" };
  let freshReads = 0;
  let writes = 0;
  const service = new ProductReviewService({
    ...client,
    getFreshProduct: async () => {
      freshReads++;
      return current;
    },
    getCart: async () => basket,
    addManyToCart: async (additions, options) => {
      await options?.beforeDispatch?.(basket);
      writes++;
      return {
        ...basket,
        items: additions.map(({ productId, quantity }) => ({
          id: productId,
          name: "Product 7",
          quantity,
          total: 6 * quantity,
        })),
        numberOfProducts: additions.reduce(
          (sum, item) => sum + item.quantity,
          0,
        ),
      };
    },
  });
  const draft = await service.startDirectBasket(owner, [
    { product_id: 7, quantity: 1 },
  ]);
  await assert.rejects(
    service.submitDirectBasket(
      owner,
      draft.draftId!,
      "11111111-1111-4111-8111-111111111111",
      [{ product_id: 7, quantity: 1 }],
      undefined,
      durable.journal,
    ),
    /product.*changed.*review/i,
  );
  assert.equal(freshReads, 1);
  assert.equal(writes, 0);
  assert.equal(
    await durable.read(`direct-basket-submit:${draft.draftId}`),
    undefined,
  );

  current = { ...product(8), available: false };
  await assert.rejects(
    service.submitDirectBasket(
      owner,
      draft.draftId!,
      "77777777-7777-4777-8777-777777777777",
      [{ product_id: 7, quantity: 1 }],
      undefined,
      durable.journal,
    ),
    /product.*changed.*review/i,
  );
  assert.equal(writes, 0);

  current = { ...product(7), unitSize: "2 stk", available: false };
  await assert.rejects(
    service.submitDirectBasket(
      owner,
      draft.draftId!,
      "88888888-8888-4888-8888-888888888888",
      [{ product_id: 7, quantity: 1 }],
      undefined,
      durable.journal,
    ),
    /product.*changed.*review/i,
  );
  assert.equal(writes, 0);

  current = { ...product(7), price: 6 };
  const submitted = await service.submitDirectBasket(
    owner,
    draft.draftId!,
    "22222222-2222-4222-8222-222222222222",
    [{ product_id: 7, quantity: 1 }],
    undefined,
    durable.journal,
  );
  assert.equal(submitted.result.status, "completed");
  assert.equal(freshReads, 4);
  assert.equal(writes, 1);
});

test("direct Submit skips a confirmed missing product and blocks an ambiguous fresh lookup", async () => {
  const owner = "fresh-skipped-owner";
  const durable = createDurableReviewJournal(owner);
  const basket: Basket = {
    items: [],
    productsPrice: 0,
    deliveryPrice: 0,
    numberOfProducts: 0,
    deliveryTime: undefined,
  };
  let failLookup = true;
  let dispatched: BasketAddition[] = [];
  const service = new ProductReviewService({
    ...client,
    getFreshProduct: async (id) => {
      if (id === 7) {
        throw new ProductNotFoundError(id);
      }
      if (failLookup) {
        throw new Error("Product lookup unavailable");
      }
      return product(id);
    },
    getCart: async () => basket,
    addManyToCart: async (additions, options) => {
      await options?.beforeDispatch?.(basket);
      dispatched = additions;
      return {
        ...basket,
        items: additions.map(({ productId, quantity }) => ({
          id: productId,
          name: `Product ${productId}`,
          quantity,
          total: 5 * quantity,
        })),
        numberOfProducts: additions.reduce(
          (sum, item) => sum + item.quantity,
          0,
        ),
      };
    },
  });
  const draft = await service.startDirectBasket(owner, [
    { product_id: 7, quantity: 1 },
    { product_id: 8, quantity: 2 },
  ]);
  await assert.rejects(
    service.submitDirectBasket(
      owner,
      draft.draftId!,
      "33333333-3333-4333-8333-333333333333",
      [
        { product_id: 7, quantity: 1 },
        { product_id: 8, quantity: 2 },
      ],
      undefined,
      durable.journal,
    ),
    /lookup|validated/i,
  );
  assert.deepEqual(dispatched, []);
  assert.equal(
    await durable.read(`direct-basket-submit:${draft.draftId}`),
    undefined,
  );

  failLookup = false;
  const submitted = await service.submitDirectBasket(
    owner,
    draft.draftId!,
    "44444444-4444-4444-8444-444444444444",
    [
      { product_id: 7, quantity: 1 },
      { product_id: 8, quantity: 2 },
    ],
    undefined,
    durable.journal,
  );
  assert.deepEqual(dispatched, [{ productId: 8, quantity: 2 }]);
  assert.deepEqual(submitted.result.skipped_products, [
    { product_id: 7, name: "Product 7" },
  ]);
  assert.equal(submitted.result.verified_additions, 2);
});

test("direct Submit with only unavailable products reports no write and cannot offer basket save", async () => {
  const owner = "all-skipped-owner";
  const durable = createDurableReviewJournal(owner);
  const basket: Basket = {
    items: [],
    productsPrice: 0,
    deliveryPrice: 0,
    numberOfProducts: 0,
    deliveryTime: undefined,
  };
  let basketWrites = 0;
  let listWrites = 0;
  const service = new ProductReviewService({
    ...client,
    getFreshProduct: async (id) => ({ ...product(id), available: false }),
    getCart: async () => basket,
    addManyToCart: async () => {
      basketWrites++;
      return basket;
    },
    createShoppingListFromBasket: async () => {
      listWrites++;
      return basket;
    },
  });
  const draft = await service.startDirectBasket(owner, [
    { product_id: 7, quantity: 1 },
  ]);
  const submitted = await service.submitDirectBasket(
    owner,
    draft.draftId!,
    "55555555-5555-4555-8555-555555555555",
    [{ product_id: 7, quantity: 1 }],
    undefined,
    durable.journal,
  );
  assert.equal(submitted.result.verified_additions, 0);
  assert.deepEqual(submitted.result.skipped_products, [
    { product_id: 7, name: "Product 7" },
  ]);
  assert.equal(basketWrites, 0);
  assert.equal(
    await durable.read(`direct-basket-submit:${draft.draftId}`),
    undefined,
  );
  await assert.rejects(
    service.saveCurrentBasketAsShoppingList(
      owner,
      draft.draftId!,
      "66666666-6666-4666-8666-666666666666",
      undefined,
      durable.journal,
    ),
    /only after.*addition is verified/u,
  );
  assert.equal(listWrites, 0);
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

test(
  "concurrent direct draft submissions dispatch only once",
  { timeout: 5_000 },
  async () => {
    const owner = "concurrent-direct-owner";
    const requested = [{ product_id: 7, quantity: 2 }];
    const durable = createDurableReviewJournal(owner);
    let markEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    let releaseWrite!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
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
      getCart: async () => structuredClone(basket),
      addManyToCart: async (
        additions: BasketAddition[],
        options?: { beforeDispatch?: (baseline: Basket) => Promise<void> },
      ) => {
        markEntered();
        await release;
        await options?.beforeDispatch?.(structuredClone(basket));
        writes++;
        return {
          ...basket,
          items: additions.map(({ productId, quantity }) => ({
            id: productId,
            name: `Product ${productId}`,
            quantity,
            total: quantity * 5,
          })),
          numberOfProducts: 2,
        };
      },
    });
    const draft = await service.startDirectBasket(owner, requested);
    const first = service.submitDirectBasket(
      owner,
      draft.draftId!,
      "11111111-1111-4111-8111-111111111111",
      requested,
      undefined,
      durable.journal,
    );
    await entered;
    try {
      await assert.rejects(
        service.submitDirectBasket(
          owner,
          draft.draftId!,
          "22222222-2222-4222-8222-222222222222",
          requested,
          undefined,
          durable.journal,
        ),
        /operation is in progress/u,
      );
      assert.equal(writes, 0);
    } finally {
      releaseWrite();
    }
    assert.equal((await first).result.status, "completed");
    assert.equal(writes, 1);
  },
);

test("direct submission does not dispatch when journal read, write, or claim fails", async () => {
  for (const failed of ["read", "write", "claim"] as const) {
    const owner = `journal-${failed}-failure`;
    const durable = createDurableReviewJournal(owner);
    const requested = [{ product_id: 7, quantity: 1 }];
    const basket: Basket = {
      items: [],
      productsPrice: 0,
      deliveryPrice: 0,
      numberOfProducts: 0,
      deliveryTime: undefined,
    };
    let writes = 0;
    const service = new ProductReviewService({
      ...client,
      getCart: async () => structuredClone(basket),
      addManyToCart: async (
        _additions: BasketAddition[],
        options?: { beforeDispatch?: (baseline: Basket) => Promise<void> },
      ) => {
        await options?.beforeDispatch?.(structuredClone(basket));
        writes++;
        return structuredClone(basket);
      },
    });
    const draft = await service.startDirectBasket(owner, requested);
    const journal = {
      ...durable.journal,
      [failed]: async () => {
        throw new Error(`Synthetic ${failed} outage`);
      },
    } satisfies ReviewOperationJournal;
    await assert.rejects(
      service.submitDirectBasket(
        owner,
        draft.draftId!,
        "99999999-9999-4999-8999-999999999999",
        requested,
        undefined,
        journal,
      ),
      new RegExp(`Synthetic ${failed} outage`, "u"),
    );
    assert.equal(writes, 0, failed);
    const receipt = (await durable.read(
      `direct-basket-submit:${draft.draftId}`,
    )) as ReviewOperation | undefined;
    assert.equal(receipt?.dispatchAttempted, undefined, failed);
  }
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

test("a failed durable completion leaves a dispatched direct addition fenced after restart", async () => {
  const owner = "failed-completion-owner";
  const durable = createDurableReviewJournal(owner);
  const requested = [{ product_id: 7, quantity: 2 }];
  let writes = 0;
  let basket: Basket = {
    items: [],
    productsPrice: 0,
    deliveryPrice: 0,
    numberOfProducts: 0,
    deliveryTime: undefined,
  };
  const provider = {
    ...client,
    getCart: async () => structuredClone(basket),
    addManyToCart: async (
      additions: BasketAddition[],
      options?: { beforeDispatch?: (baseline: Basket) => Promise<void> },
    ) => {
      await options?.beforeDispatch?.(structuredClone(basket));
      writes++;
      basket = {
        ...basket,
        items: additions.map(({ productId, quantity }) => ({
          id: productId,
          name: `Product ${productId}`,
          quantity,
          total: quantity * 5,
        })),
        numberOfProducts: 2,
      };
      return structuredClone(basket);
    },
  };
  const service = new ProductReviewService(provider);
  const draft = await service.startDirectBasket(owner, requested);
  const journal = {
    ...durable.journal,
    complete: async () => {
      throw new Error("Synthetic completion outage");
    },
  } satisfies ReviewOperationJournal;
  await assert.rejects(
    service.submitDirectBasket(
      owner,
      draft.draftId!,
      "77777777-7777-4777-8777-777777777777",
      requested,
      undefined,
      journal,
    ),
    /Synthetic completion outage/u,
  );
  assert.equal(writes, 1);
  const receipt = (await durable.read(
    `direct-basket-submit:${draft.draftId}`,
  )) as ReviewOperation;
  assert.equal(receipt.dispatchAttempted, true);
  assert.notEqual(receipt.completed, true);
  const restarted = new ProductReviewService(provider);
  await assert.rejects(
    restarted.submitDirectBasket(
      owner,
      draft.draftId!,
      "88888888-8888-4888-8888-888888888888",
      requested,
      undefined,
      durable.journal,
    ),
    /may have completed/u,
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

test("basket-to-list save does not dispatch when journal read, write, or claim fails", async () => {
  for (const failed of ["read", "write", "claim"] as const) {
    const owner = `save-journal-${failed}-failure`;
    const durable = createDurableReviewJournal(owner);
    let basket: Basket = {
      items: [],
      productsPrice: 0,
      deliveryPrice: 0,
      numberOfProducts: 0,
      deliveryTime: undefined,
    };
    let saves = 0;
    const service = new ProductReviewService({
      ...client,
      getCart: async () => structuredClone(basket),
      addManyToCart: async (
        additions: BasketAddition[],
        options?: { beforeDispatch?: (baseline: Basket) => Promise<void> },
      ) => {
        await options?.beforeDispatch?.(structuredClone(basket));
        basket = {
          ...basket,
          items: additions.map(({ productId, quantity }) => ({
            id: productId,
            name: `Product ${productId}`,
            quantity,
            total: quantity * 5,
          })),
          numberOfProducts: 1,
        };
        return structuredClone(basket);
      },
      createShoppingListFromBasket: async (options: {
        beforeDispatch?: (baseline: Basket) => Promise<void>;
      }) => {
        await options.beforeDispatch?.(structuredClone(basket));
        saves++;
        return structuredClone(basket);
      },
    });
    const requested = [{ product_id: 7, quantity: 1 }];
    const draft = await service.startDirectBasket(owner, requested);
    await service.submitDirectBasket(
      owner,
      draft.draftId!,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      requested,
      undefined,
      durable.journal,
    );
    const journal = {
      ...durable.journal,
      [failed]: async () => {
        throw new Error(`Synthetic ${failed} outage`);
      },
    } satisfies ReviewOperationJournal;
    await assert.rejects(
      service.saveCurrentBasketAsShoppingList(
        owner,
        draft.draftId!,
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        undefined,
        journal,
      ),
      new RegExp(`Synthetic ${failed} outage`, "u"),
    );
    assert.equal(saves, 0, failed);
    const receipt = (await durable.read(
      `direct-basket-save:${draft.draftId}`,
    )) as ReviewOperation | undefined;
    assert.equal(receipt?.createAttempted, undefined, failed);
  }
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

test("Local baskets accept 500 exact products and reject 501 before provider reads", async () => {
  const items = Array.from({ length: MAX_DRAFT_PRODUCTS }, (_, index) => ({
    product_id: index + 1,
    quantity: 1,
  }));
  const draft = await new ProductReviewService(client).startDirectBasket(
    "owner",
    items,
  );
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
    overLimit.startDirectBasket("owner", [
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
  const draft = await service.startDirectBasket("owner", [
    { product_id: 1, quantity: 1 },
  ]);

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
  const oldDraft = await service.startDirectBasket("owner", [
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

  const newDraft = await service.startDirectBasket("owner", [
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

test("draft cards share one review and retain alternatives", async () => {
  const service = new ProductReviewService(client);
  await service.startDirectBasket("owner", [
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
  await service.startDirectBasket("owner", [
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

test("suggested alternatives keep the source subcategory while explicit searches stay open", async () => {
  const products = new Map([
    [
      1,
      {
        ...product(1),
        name: "Havredrik",
        category: "Kolonial",
        subcategory: "Plantedrikke",
      },
    ],
    [
      2,
      {
        ...product(2),
        name: "Another oat drink",
        category: "Kolonial",
        subcategory: "Plantedrikke",
      },
    ],
    [
      3,
      {
        ...product(3),
        name: "M&M's",
        category: "Kolonial",
        subcategory: "Chokolade",
      },
    ],
  ]);
  const service = new ProductReviewService({
    ...client,
    getProduct: async (id: number) => products.get(id)!,
    searchProducts: async () => [products.get(2)!, products.get(3)!],
  });
  await service.startDirectBasket("owner", [{ product_id: 1, quantity: 1 }]);

  const suggested = await service.update("owner", {
    kind: "alternatives",
    product_id: 1,
    query: "Plantedrikke",
    suggested: true,
  });
  assert.deepEqual(
    suggested.alternatives?.views.map((view) =>
      view.status === "complete" ? view.product.id : view.product_id,
    ),
    [2],
  );

  const searched = await service.update("owner", {
    kind: "alternatives",
    product_id: 1,
    query: "chokolade",
  });
  assert.deepEqual(
    searched.alternatives?.views.map((view) =>
      view.status === "complete" ? view.product.id : view.product_id,
    ),
    [2, 3],
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
  await service.startDirectBasket("owner", [{ product_id: 1, quantity: 2 }]);
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
  await service.startDirectBasket("owner", [{ product_id: 1, quantity: 2 }]);
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
  await service.startDirectBasket("owner", [
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
  await service.startDirectBasket("owner", [{ product_id: 1, quantity: 1 }]);
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
    await service.startDirectBasket("owner", [{ product_id: 1, quantity: 2 }]),
    edited,
  );
  assert.deepEqual(service.active("owner"), edited);
  assert.equal(service.active("owner")?.items[0]?.state, "ready");
  service.end("owner");
  assert.equal(service.active("owner"), undefined);
  const restarted = await service.startDirectBasket("owner", [
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
  const draft = await service.startDirectBasket("owner-1", [
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
    await service.startDirectBasket(`owner-${index}`, [
      { product_id: index, quantity: 1 },
    ]);
  }
  await service.startDirectBasket("owner-1", [
    { product_id: 1, quantity: 1 },
    { product_id: 2, quantity: 3 },
  ]);
  const readsAtCapacity = reads;
  await assert.rejects(
    service.startDirectBasket("owner-9", [{ product_id: 9, quantity: 1 }]),
    /limit reached/u,
  );
  assert.equal(reads, readsAtCapacity);
  assert.equal(service.active("owner-1")?.items[0]?.product_id, 1);
  for (let index = 2; index <= 8; index++) {
    assert.equal(service.active(`owner-${index}`)?.items[0]?.product_id, index);
  }

  service.end("owner-1");
  assert.equal(
    (
      await service.startDirectBasket("owner-9", [
        { product_id: 9, quantity: 1 },
      ])
    ).items[0]?.product_id,
    9,
  );
});

test("expired drafts release capacity after the existing idle deadline", async () => {
  let now = 1_000;
  const service = new ProductReviewService(client, { now: () => now });
  for (let index = 1; index <= 8; index++) {
    await service.startDirectBasket(`owner-${index}`, [
      { product_id: index, quantity: 1 },
    ]);
  }
  now += DRAFT_IDLE_TIMEOUT_MS;
  const next = await service.startDirectBasket("owner-9", [
    { product_id: 9, quantity: 1 },
  ]);
  assert.equal(next.items[0]?.product_id, 9);
  for (let index = 1; index <= 8; index++) {
    assert.equal(service.active(`owner-${index}`), undefined);
  }
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
  const draft = await service.startDirectBasket("owner", [
    { product_id: 1, quantity: 1 },
  ]);
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
  const draft = await service.startDirectBasket("owner", [
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
    service.startDirectBasket("another-owner", [
      { product_id: 3, quantity: 1 },
    ]),
    /Session expired/u,
  );
  assert.equal(service.active("another-owner"), undefined);
});

test("submission inspection compares exact quantities after restart without releasing the fence", async () => {
  const owner = "inspection-owner";
  const durable = createDurableReviewJournal(owner);
  const draftId = "11111111-1111-4111-8111-111111111111";
  const operation: ReviewOperation = {
    operationId: `direct-basket-submit:${draftId}`,
    generation: "22222222-2222-4222-8222-222222222222",
    accountIdentity: "fixture-account",
    kind: "submit",
    name: "Direct basket draft",
    items: [
      { productId: 7, quantity: 1 },
      { productId: 8, quantity: 1 },
    ],
    dispatchedItems: [{ productId: 7, quantity: 1 }],
    baseline: [
      { productId: 7, quantity: 1 },
      { productId: 9, quantity: 3 },
    ],
  };
  await durable.journal.write(operation);
  await durable.journal.claim(operation.operationId, operation.generation);
  let quantity = 1;
  let reads = 0;
  const provider = {
    ...client,
    getCart: async (): Promise<Basket> => {
      reads++;
      return {
        items: [
          { id: 7, quantity, name: undefined, total: undefined },
          { id: 9, quantity: 3, name: undefined, total: undefined },
        ],
        productsPrice: undefined,
        deliveryPrice: undefined,
        numberOfProducts: undefined,
        deliveryTime: undefined,
      };
    },
  };
  const service = new ProductReviewService(provider);
  const unchanged = await service.inspectDirectBasketSubmission(
    draftId,
    undefined,
    durable.journal,
  );
  assert.equal(unchanged.recovery.status, "unconfirmed");
  assert.equal(unchanged.recovery.comparison, "unchanged");
  assert.deepEqual(unchanged.recovery.lines, [
    { product_id: 7, before: 1, requested: 1, expected: 2, current: 1 },
  ]);
  assert.equal(unchanged.recovery.retry_allowed, false);
  quantity = 2; // An unrelated writer can produce the expected quantities.
  const matching = await new ProductReviewService(
    provider,
  ).inspectDirectBasketSubmission(draftId, undefined, durable.journal);
  assert.equal(matching.recovery.comparison, "matches_expected");
  assert.equal(matching.recovery.status, "unconfirmed");
  assert.notEqual(
    (await durable.journal.read(operation.operationId))?.completed,
    true,
  );
  const wrongAccount = new ProductReviewService({
    ...provider,
    providerIdentity: () => "another-account",
  });
  await assert.rejects(
    wrongAccount.inspectDirectBasketSubmission(
      draftId,
      undefined,
      durable.journal,
    ),
    /account/u,
  );
  assert.equal(reads, 2, "wrong account never reads the provider basket");
  await assert.rejects(
    service.inspectDirectBasketSubmission(
      "not-a-uuid",
      undefined,
      durable.journal,
    ),
    /unavailable/u,
  );
  await assert.rejects(
    service.inspectDirectBasketSubmission(
      "33333333-3333-4333-8333-333333333333",
      undefined,
      durable.journal,
    ),
    /No submission evidence/u,
  );
  assert.equal(
    reads,
    2,
    "invalid or missing evidence never reads the provider",
  );
  let identity = "fixture-account";
  const switched = new ProductReviewService({
    ...provider,
    providerIdentity: () => identity,
    getCart: async () => {
      const basket = await provider.getCart();
      identity = "changed-account";
      return basket;
    },
  });
  await assert.rejects(
    switched.inspectDirectBasketSubmission(draftId, undefined, durable.journal),
    /account changed/u,
  );
});
