import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "./client.js";
import { handleLocalBasketStateRequest } from "./local-basket-callback.js";
import {
  mutateOwnerLocalBasketInventory,
  type LocalBasketInventoryStorage,
} from "./local-basket-storage.js";
import type { LocalBasket } from "./local-basket.js";
import {
  ProductReviewService,
  type LocalBasketRepository,
} from "./product-review.js";
import {
  VerifiedPartialAdditionsError,
  type ApplyResult,
} from "./proposals.js";

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

const verified: ApplyResult = {
  status: "completed",
  operation: "additions",
  replayed: false,
  verified_additions: 1,
  basket: {
    items: [],
    products_price: 10,
    delivery_price: undefined,
    number_of_products: 2,
    delivery_time: undefined,
  },
};

async function fixture() {
  let values = new Map<string, unknown>();
  const storage: LocalBasketInventoryStorage = {
    get: async <T>(key: string) => structuredClone(values.get(key)) as T,
    put: async (key, value) => {
      values.set(key, structuredClone(value));
    },
    delete: async (key) => values.delete(key),
    setAlarm: async () => {},
    deleteAlarm: async () => {},
    transaction: async (action) => {
      const before = structuredClone(values);
      try {
        return await action(storage);
      } catch (error) {
        values = before;
        throw error;
      }
    },
  };
  const state = {
    providerCalls: 0,
    productReads: 0,
    rejectFence: false,
    rejectCompletion: false,
    apply: async (): Promise<ApplyResult> => verified,
  };
  const repository: LocalBasketRepository = {
    async mutate(command) {
      const response = await handleLocalBasketStateRequest(
        new Request("http://local-basket-state.internal/inventory", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-nemlig-local-basket-capability": "fixture-capability",
          },
          body: JSON.stringify(command),
        }),
        {
          idFromName: (owner) => owner,
          get: () => ({
            async mutate(owner, parsed) {
              if (
                parsed.kind === "edit" &&
                ((state.rejectFence &&
                  parsed.edit.kind === "attempt-submission") ||
                  (state.rejectCompletion &&
                    parsed.edit.kind === "complete-submission"))
              ) {
                throw new Error("Simulated persistence interruption");
              }
              return mutateOwnerLocalBasketInventory(storage, owner, parsed);
            },
          }),
        },
        async () => "owner",
      );
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    },
  };
  const newService = () =>
    new ProductReviewService(
      {
        getProduct: async (id) => {
          state.productReads++;
          return product(id);
        },
        searchProducts: async () => [product(3)],
      },
      {
        proposals: {
          prepareAdditions: async () => ({
            applicable: true,
            proposal_id: "fixture-proposal",
            operation: "additions",
            connection_bound: true,
            issued_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            basket_fingerprint: "fixture",
            review: {},
          }),
          apply: async () => {
            state.providerCalls++;
            return state.apply();
          },
        },
      },
    );
  const service = newService();
  const created = await service.createBasket(
    "owner",
    [{ product_id: 1, quantity: 2 }],
    repository,
  );
  const basketId = created.review.basketId!;
  const prepare = () => service.prepareBasket("owner", basketId, repository);
  const read = async () =>
    (await repository.mutate({ kind: "read", basketId })) as LocalBasket;
  return { state, repository, service, newService, basketId, prepare, read };
}

test("durable callback restores product display but never prepared authority", async () => {
  const f = await fixture();
  const prepared = await f.prepare();
  const restarted = f.newService();
  const reads = f.state.productReads;
  const recovered = await restarted.showBasket(
    "owner",
    f.basketId,
    f.repository,
  );
  assert.equal(recovered.items[0]?.quantity, 2);
  assert.equal(f.state.productReads, reads);
  assert.equal(recovered.submission, undefined);
  await assert.rejects(
    restarted.submitBasket(
      "owner",
      f.basketId,
      prepared.submission!.submission_id,
      f.repository,
    ),
  );
  assert.equal(f.state.providerCalls, 0);
});

test("metadata heartbeat preserves a fresh exact prepared submission", async () => {
  const f = await fixture();
  const prepared = await f.prepare();
  await f.repository.mutate({ kind: "heartbeat", basketId: f.basketId });
  const shown = await f.service.showBasket("owner", f.basketId, f.repository);
  assert.equal(
    shown.submission?.submission_id,
    prepared.submission!.submission_id,
  );
  const result = await f.service.submitBasket(
    "owner",
    f.basketId,
    prepared.submission!.submission_id,
    f.repository,
  );
  assert.equal(result.review.submission?.status, "submitted");
  assert.equal(f.state.providerCalls, 1);
});

test("durable fence precedes provider execution and heartbeat cannot prevent success cleanup", async () => {
  const f = await fixture();
  const prepared = await f.prepare();
  f.state.apply = async () => {
    assert.equal((await f.read()).submissionAttempted, true);
    await f.repository.mutate({ kind: "heartbeat", basketId: f.basketId });
    return verified;
  };
  const result = await f.service.submitBasket(
    "owner",
    f.basketId,
    prepared.submission!.submission_id,
    f.repository,
  );
  assert.equal(result.review.submission?.status, "submitted");
  assert.equal(f.state.providerCalls, 1);
  assert.deepEqual(await f.repository.mutate({ kind: "list" }), []);
});

test("failure to persist the attempt fence prevents every provider call", async () => {
  const f = await fixture();
  const prepared = await f.prepare();
  f.state.rejectFence = true;
  await assert.rejects(
    f.service.submitBasket(
      "owner",
      f.basketId,
      prepared.submission!.submission_id,
      f.repository,
    ),
  );
  assert.equal(f.state.providerCalls, 0);
  assert.equal((await f.read()).submissionAttempted, undefined);
});

test("cleanup failure after verified addition retains a restart-safe no-retry fence", async () => {
  const f = await fixture();
  const prepared = await f.prepare();
  f.state.rejectCompletion = true;
  await assert.rejects(
    f.service.submitBasket(
      "owner",
      f.basketId,
      prepared.submission!.submission_id,
      f.repository,
    ),
  );
  assert.equal(f.state.providerCalls, 1);
  assert.equal((await f.read()).submissionAttempted, true);
  const restarted = f.newService();
  const recovered = await restarted.showBasket(
    "owner",
    f.basketId,
    f.repository,
  );
  assert.equal(recovered.submissionAttempted, true);
  assert.equal(recovered.submission, undefined);
  await assert.rejects(
    restarted.prepareBasket("owner", f.basketId, f.repository),
  );
  await assert.rejects(
    restarted.submitBasket(
      "owner",
      f.basketId,
      prepared.submission!.submission_id,
      f.repository,
    ),
  );
  assert.equal(f.state.providerCalls, 1);
});

test("verified partial additions remain visible without restoring authority after restart", async () => {
  const f = await fixture();
  const prepared = await f.prepare();
  f.state.apply = async () => {
    throw new VerifiedPartialAdditionsError(
      1,
      "Stopped after one verified addition",
    );
  };
  await assert.rejects(
    f.service.submitBasket(
      "owner",
      f.basketId,
      prepared.submission!.submission_id,
      f.repository,
    ),
    VerifiedPartialAdditionsError,
  );
  const current = await f.service.showBasket("owner", f.basketId, f.repository);
  assert.equal(current.submission?.status, "partial");
  assert.equal(current.submission?.verified_additions, 1);
  const recovered = await f
    .newService()
    .showBasket("owner", f.basketId, f.repository);
  assert.equal(recovered.submission, undefined);
  assert.equal(recovered.submissionAttempted, true);
  assert.equal(f.state.providerCalls, 1);
});
