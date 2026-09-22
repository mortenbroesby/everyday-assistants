import assert from "node:assert/strict";
import test from "node:test";
import { NemligError, type Product } from "./client.js";
import { type ProductDiscoveryClient, resolveDetailedProductSearch } from "./product-discovery.js";

const product = (id: number, name: string): Product => ({
  id, name, price: 10, unit: "10 kr/kg", unitPrice: 10, unitSize: "1 kg", brand: "Test",
  category: "", subcategory: "", imageUrl: "", available: true, labels: [], isOrganic: false,
  isFrozen: false, isRefrigerated: false, isDairy: false, isLactoseFree: false,
  isGlutenFree: false, isVegan: false, isOnDiscount: false,
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
