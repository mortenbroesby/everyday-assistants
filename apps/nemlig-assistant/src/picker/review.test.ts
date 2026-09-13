import assert from "node:assert/strict";
import test from "node:test";
import { NemligClient, NemligError, type Product } from "../client.js";
import { resolveProposedBasketReview, type ProposedBasketReviewItem } from "./review.js";

const product = (id: number, name: string): Product => ({
  id, name, price: 10, unit: "10 kr/kg", unitPrice: 10, unitSize: "1 kg", brand: "Test",
  category: "", subcategory: "", imageUrl: "", available: true, labels: [], isOrganic: false,
  isFrozen: false, isRefrigerated: false, isDairy: false, isLactoseFree: false,
  isGlutenFree: false, isVegan: false, isOnDiscount: false,
});

type FakeOptions = {
  readonly delay?: (id: number) => number;
  readonly failure?: (id: number) => unknown;
  readonly name?: (id: number) => string;
  readonly productId?: (id: number) => number;
};

const abortableProducts = (options: FakeOptions = {}) => {
  const events: string[] = [];
  let active = 0;
  let maximum = 0;
  const getProduct = (id: number, signal?: AbortSignal): Promise<Product> => new Promise((resolve, reject) => {
    active += 1;
    maximum = Math.max(maximum, active);
    events.push(`start:${id}`);
    let done = false;
    const finish = (error?: unknown) => {
      if (done) return;
      done = true;
      active -= 1;
      events.push(`${error === undefined ? "complete" : "fail"}:${id}`);
      if (error === undefined) resolve(product(options.productId?.(id) ?? id, options.name?.(id) ?? `item-${Math.floor((id - 1) / 10)}`));
      else reject(error);
    };
    const timer = setTimeout(() => finish(options.failure?.(id)), options.delay?.(id) ?? 1);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      events.push(`interrupt:${id}`);
      setTimeout(() => finish(signal.reason ?? new DOMException("aborted", "AbortError")), 1);
    }, { once: true });
  });
  return { client: { getProduct }, events, state: () => ({ active, maximum }) };
};

const reviewItem = (index: number): ProposedBasketReviewItem => ({
  ingredient: `item-${index}`,
  product: index * 10 + 1,
  alternatives: Array.from({ length: 9 }, (_, offset) => index * 10 + offset + 2),
  quantity: 1,
  confidence: 80,
  favorite_match: false,
});

test("picker review resolves fifty decisions and 500 unique references with concurrency three", async () => {
  const fake = abortableProducts();
  const input = Array.from({ length: 50 }, (_, index) => reviewItem(index));
  const result = await resolveProposedBasketReview(fake.client, input);
  assert.equal(result.items.length, 50);
  assert.equal(result.rejected.length, 0);
  assert.deepEqual(result.items.map(({ ingredient }) => ingredient), input.map(({ ingredient }) => ingredient));
  assert.equal(fake.events.filter((event) => event.startsWith("start:")).length, 500);
  assert.ok(fake.state().maximum <= 3);
  assert.equal(fake.state().active, 0);
});

test("picker review coalesces exact IDs while evaluating each ingredient position", async () => {
  const fake = abortableProducts({ name: () => "mælk" });
  const result = await resolveProposedBasketReview(fake.client, [
    { ...reviewItem(0), ingredient: "mælk", product: 7, alternatives: [8] },
    { ...reviewItem(1), ingredient: "mælk", product: 7, alternatives: [8] },
  ]);
  assert.equal(result.items.length, 2);
  assert.deepEqual(fake.events.filter((event) => event.startsWith("start:")).sort(), ["start:7", "start:8"]);
});

test("picker review carries the exact search term through navigation", async () => {
  const fake = abortableProducts({ name: () => "mælk" });
  const result = await resolveProposedBasketReview(fake.client, [{ ...reviewItem(0), ingredient: "milk", search_term: "mælk", alternatives: [] }]);
  assert.equal(result.items[0]?.search_term, "mælk");
});

test("picker review keeps 404 local to the missing proposed product or alternative", async () => {
  const missing = new Set([1, 3]);
  const fake = abortableProducts({
    failure: (id) => missing.has(id) ? new NemligError("missing", 404) : undefined,
    name: () => "mælk",
  });
  const result = await resolveProposedBasketReview(fake.client, [
    { ...reviewItem(0), ingredient: "mælk", product: 1, alternatives: [2] },
    { ...reviewItem(1), ingredient: "mælk", product: 2, alternatives: [3, 4] },
  ]);
  assert.deepEqual(result.rejected, [{ ingredient: "mælk", reason: "No proposed product matched this ingredient." }]);
  assert.deepEqual(result.items.map(({ product, alternatives }) => ({ product: product.id, alternatives: alternatives.map(({ id }) => id) })), [
    { product: 2, alternatives: [4] },
  ]);
});

test("picker review keeps malformed exact-product responses local while retaining valid siblings", async () => {
  const client = new NemligClient(async (input) => {
    const id = Number(new URL(String(input)).searchParams.get("id"));
    if (id === 1) return Response.json({});
    if (id === 3) return Response.json({ Id: 99, Name: "mælk" });
    return Response.json({ Id: id, Name: "mælk" });
  });
  Object.assign(client, {
    accessToken: "synthetic-token",
    productTimestamp: "stamp",
    timeslot: "slot",
    deliveryZoneId: 1,
    userId: "0",
  });

  const result = await resolveProposedBasketReview(client, [
    { ...reviewItem(0), ingredient: "mælk", product: 1, alternatives: [2] },
    { ...reviewItem(1), ingredient: "mælk", product: 2, alternatives: [3, 4] },
  ]);

  assert.deepEqual(result.rejected, [{ ingredient: "mælk", reason: "No proposed product matched this ingredient." }]);
  assert.deepEqual(result.items.map(({ product, alternatives }) => ({
    product: product.id,
    alternatives: alternatives.map(({ id }) => id),
  })), [{ product: 2, alternatives: [4] }]);
});

test("picker review rejects a provider response for a different exact product ID", async () => {
  const fake = abortableProducts({ name: () => "mælk", productId: (id) => id === 1 ? 99 : id });
  const result = await resolveProposedBasketReview(fake.client, [
    { ...reviewItem(0), ingredient: "mælk", product: 1, alternatives: [2] },
  ]);
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.rejected, [{ ingredient: "mælk", reason: "No proposed product matched this ingredient." }]);
});

test("picker review stops queued work and settles active reads on fatal failure", async () => {
  const failure = new NemligError("expired", 401);
  const fake = abortableProducts({
    delay: (id) => id === 1 ? 1 : 40,
    failure: (id) => id === 1 ? failure : undefined,
  });
  await assert.rejects(resolveProposedBasketReview(fake.client, [{ ...reviewItem(0), alternatives: [2, 3, 4] }]), (error) => error === failure);
  assert.equal(fake.state().active, 0, JSON.stringify(fake.events));
  assert.equal(fake.events.includes("start:4"), false, JSON.stringify(fake.events));
  assert.ok(fake.events.some((event) => event.startsWith("interrupt:")));
});

test("picker review propagates caller cancellation after reaching quiescence", async () => {
  const reason = new Error("caller cancelled review");
  const controller = new AbortController();
  const fake = abortableProducts({ delay: () => 40 });
  const pending = resolveProposedBasketReview(fake.client, [{ ...reviewItem(0), alternatives: [2, 3, 4] }], { signal: controller.signal });
  setTimeout(() => controller.abort(reason), 2);
  await assert.rejects(pending, (error) => error === reason);
  assert.equal(fake.state().active, 0);
  assert.equal(fake.events.includes("start:4"), false);
});
