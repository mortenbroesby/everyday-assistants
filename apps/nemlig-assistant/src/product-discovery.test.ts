import assert from "node:assert/strict";
import test from "node:test";
import { NemligError, type Basket, type Product } from "./client.js";
import {
  type ProductDiscoveryClient,
  PlanningDeadlineError,
  resolveDetailedProductSearch,
  resolveProductDiscovery,
  type CatalogueRetrieval,
} from "./product-discovery.js";
import { resolveNativeProductDiscovery } from "../scripts/native-product-discovery.js";

const product = (id: number, name: string): Product => ({
  id, name, price: 10, unit: "10 kr/kg", unitPrice: 10, unitSize: "1 kg", brand: "Test",
  category: "", subcategory: "", imageUrl: "", available: true, labels: [], isOrganic: false,
  isFrozen: false, isRefrigerated: false, isDairy: false, isLactoseFree: false,
  isGlutenFree: false, isVegan: false, isOnDiscount: false,
});
const basket = (): Basket => ({ items: [], productsPrice: 0, deliveryPrice: 0, numberOfProducts: 0, deliveryTime: undefined });

type FakeOptions = {
  readonly delay?: (key: string) => number;
  readonly searchFailure?: (query: string) => unknown;
  readonly basketFailure?: unknown;
};

const abortableFake = (options: FakeOptions = {}) => {
  const events: string[] = [];
  let active = 0; let maximum = 0; let searchActive = 0; let searchMaximum = 0; let settled = 0;
  const wait = <T>(key: string, value: T, signal: AbortSignal | undefined, failure?: unknown): Promise<T> => new Promise((resolve, reject) => {
    active += 1; maximum = Math.max(maximum, active);
    if (key.startsWith("search:") || key.startsWith("product:")) { searchActive += 1; searchMaximum = Math.max(searchMaximum, searchActive); }
    events.push(`start:${key}`);
    let done = false;
    const finish = (error?: unknown) => {
      if (done) return;
      done = true; active -= 1;
      if (key.startsWith("search:") || key.startsWith("product:")) searchActive -= 1;
      settled += 1; events.push(`${error === undefined ? "complete" : "fail"}:${key}`);
      if (error === undefined) resolve(value); else reject(error);
    };
    const timer = setTimeout(() => finish(failure), options.delay?.(key) ?? 4);
    const abort = () => {
      clearTimeout(timer); events.push(`interrupt:${key}`);
      setTimeout(() => finish(signal?.reason ?? new DOMException("aborted", "AbortError")), 3);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
  const client: ProductDiscoveryClient = {
    searchProducts: (query, _limit, signal) => wait(`search:${query}`, [product(query.length + 1, query)], signal, options.searchFailure?.(query)),
    getProduct: (id, signal) => wait(`product:${id}`, product(id, `Product ${id}`), signal),
    getCart: (signal) => wait("basket", basket(), signal, options.basketFailure),
  };
  return { client, events, state: () => ({ active, maximum, searchMaximum, settled }) };
};

const search = (query: string): CatalogueRetrieval => ({ kind: "search", query, limit: 20 });

test("native and Effect coordinators preserve order, three-read concurrency, and distinct duplicate-line results", async () => {
  for (const count of [1, 5, 24, 50]) for (const coordinator of [
    (client: ProductDiscoveryClient, retrievals: readonly CatalogueRetrieval[]) => resolveNativeProductDiscovery(client, retrievals),
    resolveProductDiscovery,
  ]) {
    const retrievals = Array.from({ length: count }, (_, index) => search(`item-${index}`));
    const fake = abortableFake({ delay: (key) => key.endsWith("0") ? 16 : 2 });
    const result = await coordinator(fake.client, retrievals);
    assert.equal(result.discoveries.length, count);
    assert.deepEqual(result.discoveries.map(({ products }) => products[0]?.name), retrievals.map((item) => item.kind === "search" ? item.query : String(item.productId)));
    assert.equal(fake.events.filter((event) => event.startsWith("start:search:")).length, count);
    assert.ok(fake.state().searchMaximum <= 3, `${coordinator.name} exceeded the catalogue limit`);
    assert.equal(fake.state().active, 0);
  }

  const duplicates = Array.from({ length: 24 }, (_, index) => search(`item-${index % 12}`));
  const fake = abortableFake();
  await resolveProductDiscovery(fake.client, duplicates);
  assert.equal(fake.events.filter((event) => event.startsWith("start:search:")).length, 12);
});

test("retrieval coalescing preserves exact spelling boundaries and shares exact selected products only by ID", async () => {
  const fake = abortableFake();
  const result = await resolveNativeProductDiscovery(fake.client, [
    search(" Mælk "), search("Mælk"), search("mælk"), search("mæ  lk"),
    { kind: "product", productId: 9 }, { kind: "product", productId: 9 },
  ]);
  assert.equal(result.discoveries.length, 6);
  assert.deepEqual(fake.events.filter((event) => event.startsWith("start:")).sort(), [
    "start:basket", "start:product:9", "start:search: Mælk ", "start:search:mæ  lk", "start:search:mælk",
  ]);
});

test("retrieval coalescing is isolated to one coordinator invocation", async () => {
  const fake = abortableFake();
  await resolveProductDiscovery(fake.client, [search("mælk"), search("mælk")]);
  await resolveProductDiscovery(fake.client, [search("mælk"), search("mælk")]);
  assert.equal(fake.events.filter((event) => event === "start:search:mælk").length, 2);
  assert.equal(fake.events.filter((event) => event === "start:basket").length, 2);
});

test("ordinary failures remain per-line unavailable while authentication retains its identity", async () => {
  const ordinary = abortableFake({ searchFailure: (query) => query === "broken" ? new Error("provider unavailable") : undefined });
  const ordinaryResult = await resolveProductDiscovery(ordinary.client, [search("ok"), search("broken"), search("broken")]);
  assert.deepEqual(ordinaryResult.discoveries.map(({ unavailable }) => unavailable), [false, true, true]);
  assert.equal(ordinary.events.filter((event) => event === "start:search:broken").length, 1);

  const expired = new NemligError("expired", 401);
  const authenticated = abortableFake({ searchFailure: (query) => query === "expired" ? expired : undefined, delay: (key) => key.includes("expired") ? 1 : 40 });
  await assert.rejects(resolveProductDiscovery(authenticated.client, [search("expired"), search("slow-a"), search("slow-b"), search("queued")]), (error) => error === expired);
  assert.equal(authenticated.state().active, 0, "Effect waits for abort-aware reads to settle");
  assert.equal(authenticated.events.includes("start:search:queued"), false, "fatal failure leaves queued reads unstarted");
  assert.ok(authenticated.events.some((event) => event.startsWith("interrupt:search:slow")));
});

test("basket failure, caller abort, and deadline interrupt the Effect scope before it returns", async () => {
  const basketFailure = new Error("basket unavailable");
  const brokenBasket = abortableFake({ basketFailure, delay: (key) => key === "basket" ? 1 : 40 });
  await assert.rejects(resolveProductDiscovery(brokenBasket.client, [search("a"), search("b"), search("c"), search("d")]), (error) => error === basketFailure);
  assert.equal(brokenBasket.state().active, 0);
  assert.equal(brokenBasket.events.includes("start:search:d"), false);

  const callerAbort = new Error("caller stopped planning");
  const controller = new AbortController();
  const cancelled = abortableFake({ delay: () => 40 });
  const pending = resolveProductDiscovery(cancelled.client, [search("a"), search("b"), search("c"), search("d")], { signal: controller.signal });
  setTimeout(() => controller.abort(callerAbort), 2);
  await assert.rejects(pending, (error) => error === callerAbort);
  assert.equal(cancelled.state().active, 0);
  assert.equal(cancelled.events.includes("start:search:d"), false);

  const timed = abortableFake({ delay: () => 40 });
  await assert.rejects(resolveProductDiscovery(timed.client, [search("a"), search("b"), search("c"), search("d")], { deadlineMs: 2 }), PlanningDeadlineError);
  assert.equal(timed.state().active, 0);
  assert.equal(timed.events.includes("start:search:d"), false);
});

test("an already-aborted request starts no basket or catalogue work", async () => {
  const controller = new AbortController();
  const reason = new Error("caller stopped before planning");
  controller.abort(reason);
  const fake = abortableFake();
  await assert.rejects(
    resolveProductDiscovery(fake.client, [search("a"), search("b")], { signal: controller.signal }),
    (error) => error === reason,
  );
  assert.deepEqual(fake.events, []);
  assert.deepEqual(fake.state(), { active: 0, maximum: 0, searchMaximum: 0, settled: 0 });
});

test("invalid deadlines are rejected before basket or catalogue work", async () => {
  for (const deadlineMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const fake = abortableFake();
    await assert.rejects(
      resolveProductDiscovery(fake.client, [search("a")], { deadlineMs }),
      (error) => error instanceof RangeError && error.message === "Product discovery deadline must be a positive finite number.",
    );
    assert.deepEqual(fake.events, []);
  }
});

test("detailed search hydrates unique results in source order and exposes partial detail failures", async () => {
  const shallow = [product(1, "Mælk"), product(2, "Havremælk"), product(1, "Mælk"), product(3, "Soyamælk")];
  let active = 0;
  let maximum = 0;
  const calls: number[] = [];
  const client: ProductDiscoveryClient = {
    searchProducts: async () => shallow,
    getProduct: async (id, signal) => {
      calls.push(id);
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, id === 1 ? 8 : 2);
        signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
      });
      active -= 1;
      if (id === 2) throw new Error("detail unavailable");
      return product(id, `Detailed ${id}`);
    },
    getCart: async () => basket(),
  };

  const result = await resolveDetailedProductSearch(client, "mælk", 4, { concurrency: 2 });

  assert.deepEqual(calls, [1, 2, 3]);
  assert.ok(maximum <= 2);
  assert.deepEqual(result.items.map((item) => ({
    productId: item.productId,
    status: item.status,
    name: item.status === "hydrated" ? item.product.name : undefined,
  })), [
    { productId: 1, status: "hydrated", name: "Detailed 1" },
    { productId: 2, status: "unavailable", name: undefined },
    { productId: 3, status: "hydrated", name: "Detailed 3" },
  ]);
});

test("detailed search propagates authentication failures instead of hiding them", async () => {
  const expired = new NemligError("expired", 401);
  const client: ProductDiscoveryClient = {
    searchProducts: async () => [product(1, "Mælk")],
    getProduct: async () => { throw expired; },
    getCart: async () => basket(),
  };

  await assert.rejects(resolveDetailedProductSearch(client, "mælk", 1), (error) => error === expired);
});

test("detailed search does not impose an application result cap", async () => {
  const products = Array.from({ length: 12 }, (_, index) => product(index + 1, `Product ${index + 1}`));
  const calls: number[] = [];
  const client: ProductDiscoveryClient = {
    searchProducts: async (_query, limit) => {
      assert.equal(limit, undefined);
      return products;
    },
    getProduct: async (id) => { calls.push(id); return product(id, `Detailed ${id}`); },
    getCart: async () => basket(),
  };

  const result = await resolveDetailedProductSearch(client, "product");

  assert.equal(result.items.length, products.length);
  assert.equal(calls.length, products.length);
  assert.deepEqual(result.items.map((item) => item.productId), products.map((item) => item.id));
});

test("detailed search propagates cancellation and does not start queued detail reads", async () => {
  const products = Array.from({ length: 6 }, (_, index) => product(index + 1, `Product ${index + 1}`));
  const started: number[] = [];
  let active = 0;
  let maximum = 0;
  const client: ProductDiscoveryClient = {
    searchProducts: async () => products,
    getProduct: async (id, signal) => {
      started.push(id);
      active += 1;
      maximum = Math.max(maximum, active);
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 40);
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(signal.reason);
          }, { once: true });
        });
      } finally {
        active -= 1;
      }
      return product(id, `Detailed ${id}`);
    },
    getCart: async () => basket(),
  };
  const reason = new Error("caller stopped detailed search");
  const controller = new AbortController();
  const pending = resolveDetailedProductSearch(client, "product", undefined, { signal: controller.signal, concurrency: 2 });
  setTimeout(() => controller.abort(reason), 2);

  await assert.rejects(pending, (error) => error === reason);
  assert.ok(started.length <= 2);
  assert.ok(maximum <= 2);
  assert.equal(active, 0);
});
