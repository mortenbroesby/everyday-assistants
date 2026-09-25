import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "./client.js";
import { ProductReviewService } from "./product-review.js";

const product = (id: number): Product => ({
  id, name: `Product ${id}`, price: 5, unitPrice: 5, unit: "stk", unitSize: "1 stk", brand: "", category: "", subcategory: "", imageUrl: "", available: true,
  labels: [], isOrganic: false, isFrozen: false, isRefrigerated: false, isDairy: false, isLactoseFree: false, isGlutenFree: false, isVegan: false, isOnDiscount: false,
});
const client = { getProduct: async (id: number) => product(id), searchProducts: async () => [product(3)] };

test("voice and touch share exact local edits, reject stale/foreign references, and retain alternatives", async () => {
  const service = new ProductReviewService(client);
  const initial = await service.start("owner", [{ product_id: 1, quantity: 2 }, { product_id: 2, quantity: 1 }]);
  const accepted = await service.update("owner", initial.review_id, initial.revision, { kind: "accept", product_ids: [1] });
  assert.deepEqual(accepted.items.map(i => i.state), ["basket", "needs-review"]);
  await assert.rejects(service.update("owner", initial.review_id, initial.revision, { kind: "remove", product_ids: [1] }), /stale/i);
  assert.throws(() => service.show("stranger", initial.review_id), /unavailable/i);
  const alternatives = await service.update("owner", initial.review_id, accepted.revision, { kind: "alternatives", product_id: 2, query: "alternative" });
  const basket = await service.update("owner", initial.review_id, alternatives.revision, { kind: "navigate", destination: "basket" });
  assert.equal(basket.alternatives?.product_id, 2);
  const replaced = await service.update("owner", initial.review_id, basket.revision, { kind: "replace", product_id: 2, replacement_id: 3 });
  assert.deepEqual(replaced.items.map(i => [i.product_id, i.state]), [[1, "basket"], [3, "basket"]]);
  const removed = await service.update("owner", initial.review_id, replaced.revision, { kind: "remove", product_ids: [1] });
  assert.deepEqual(removed.items.map(i => i.product_id), [3]);
  removed.items.length = 0;
  assert.equal(service.show("owner", initial.review_id).items.length, 1);
});

test("alternatives omit products already present in the local review", async () => {
  const service = new ProductReviewService({
    ...client,
    searchProducts: async () => [product(2), product(3)],
  });
  const initial = await service.start("owner", [{ product_id: 1, quantity: 1 }, { product_id: 2, quantity: 1 }]);
  const alternatives = await service.update("owner", initial.review_id, initial.revision, {
    kind: "alternatives", product_id: 1, query: "alternative",
  });
  assert.deepEqual(alternatives.alternatives?.views.map(view => view.status === "complete" ? view.product.id : view.product_id), [3]);
});

test("session drafts survive an hour, repeated starts preserve them, and explicit end clears them", async () => {
  let now = 0;
  const service = new ProductReviewService(client, { now: () => now });
  const draft = await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  assert.equal(service.active("another-session-owner"), undefined);
  assert.throws(() => service.show("another-session-owner", draft.review_id), /unavailable/i);
  const edited = await service.update("owner", draft.review_id, draft.revision, { kind: "accept", product_ids: [1] });
  await assert.rejects(service.update("owner", draft.review_id, edited.revision, { kind: "accept", product_ids: [1, 99] }), /product/i);
  now = 3_600_001;
  assert.deepEqual(await service.start("owner", [{ product_id: 2, quantity: 1 }]), edited);
  assert.deepEqual(service.active("owner"), edited);
  assert.equal(service.show("owner", draft.review_id).items[0]?.state, "basket");
  assert.throws(() => service.end("owner", draft.review_id, draft.revision), /stale/i);
  service.end("owner", draft.review_id, edited.revision);
  assert.equal(service.active("owner"), undefined);
  assert.throws(() => service.show("owner", draft.review_id), /unavailable/i);
  const restarted = await service.start("owner", [{ product_id: 2, quantity: 1 }]);
  assert.notEqual(restarted.review_id, draft.review_id);
});

test("adding exact products is atomic, reviewable, and bounded; older idle sessions are evicted", async () => {
  const service = new ProductReviewService(client);
  const draft = await service.start("owner-1", [{ product_id: 1, quantity: 1 }]);
  await assert.rejects(service.update("owner-1", draft.review_id, draft.revision, { kind: "add", items: [{ product_id: 1, quantity: 2 }] }), /unique exact/i);
  assert.deepEqual(service.show("owner-1", draft.review_id), draft);
  const added = await service.update("owner-1", draft.review_id, draft.revision, { kind: "add", items: [{ product_id: 2, quantity: 3 }] });
  assert.deepEqual(added.items.map(item => [item.product_id, item.quantity, item.state]), [[1, 1, "needs-review"], [2, 3, "needs-review"]]);
  for (let index = 2; index <= 8; index++) await service.start(`owner-${index}`, [{ product_id: index, quantity: 1 }]);
  await service.start("owner-9", [{ product_id: 9, quantity: 1 }]);
  assert.equal(service.active("owner-1"), undefined);
  assert.equal(service.active("owner-9")?.items[0]?.product_id, 9);
});

test("submission hides provider references, invalidates edits, and retains verified or uncertain outcomes", async () => {
  let writes = 0;
  let fail = false;
  const proposals = {
    prepareAdditions: async () => ({ applicable: true as const, proposal_id: "private-provider-reference", operation: "additions" as const, connection_bound: true as const,
      issued_at: new Date(0).toISOString(), expires_at: new Date(Date.now() + 900_000).toISOString(), basket_fingerprint: "private", review: { lines: [{ product_id: 1, quantity: 1, item_price: 5 }] } }),
    apply: async () => {
      writes++;
      if (fail) throw new Error("Readback unavailable");
      return { status: "completed" as const, operation: "additions" as const, replayed: false, basket: { items: [], products_price: 0, delivery_price: 0, number_of_products: 0, delivery_time: undefined } };
    },
  };
  const service = new ProductReviewService(client, { proposals });
  let draft = await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "accept", product_ids: [1] });
  draft = await service.prepare("owner", draft.review_id, draft.revision);
  assert.equal(writes, 0);
  assert.ok(!JSON.stringify(draft).includes("private-provider-reference"));
  const invalidated = draft.submission!.submission_id;
  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "revisit", product_ids: [1] });
  assert.equal(draft.items[0]?.state, "needs-review");
  await assert.rejects(service.submit("owner", draft.review_id, draft.revision, invalidated), /submission/i);
  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "accept", product_ids: [1] });
  draft = await service.prepare("owner", draft.review_id, draft.revision);
  const changedQuantitySubmission = draft.submission!.submission_id;
  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "quantity", product_id: 1, quantity: 2 });
  await assert.rejects(service.submit("owner", draft.review_id, draft.revision, changedQuantitySubmission), /submission/i);
  assert.equal(writes, 0);
  draft = await service.prepare("owner", draft.review_id, draft.revision);
  const reference = draft.submission!.submission_id;
  const result = await service.submit("owner", draft.review_id, draft.revision, reference);
  assert.equal(result.review.submission?.status, "submitted");
  assert.equal(result.review.items.length, 1);
  assert.equal(writes, 1);
  await assert.rejects(service.submit("owner", draft.review_id, result.review.revision, reference), /submission/i);
  draft = await service.update("owner", draft.review_id, result.review.revision, { kind: "quantity", product_id: 1, quantity: 3 });
  draft = await service.prepare("owner", draft.review_id, draft.revision);
  fail = true;
  await assert.rejects(service.submit("owner", draft.review_id, draft.revision, draft.submission!.submission_id), /Readback/);
  const uncertain = service.show("owner", draft.review_id);
  assert.equal(uncertain.submission?.status, "uncertain");
  assert.equal(uncertain.items.length, 1);
  await assert.rejects(service.prepare("owner", draft.review_id, uncertain.revision), /inspect/i);
  assert.equal(writes, 2);
});

test("an asynchronous alternatives search excludes conflicting edits and leaves no partial state on failure", async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const service = new ProductReviewService({ ...client, searchProducts: async () => { await pending; throw new Error("Search failed"); } });
  const draft = await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  const search = service.update("owner", draft.review_id, draft.revision, { kind: "alternatives", product_id: 1, query: "milk" });
  await assert.rejects(service.update("owner", draft.review_id, draft.revision, { kind: "remove", product_ids: [1] }), /progress/i);
  release();
  await assert.rejects(search, /Search failed/);
  assert.deepEqual(service.show("owner", draft.review_id), draft);
  const removed = await service.update("owner", draft.review_id, draft.revision, { kind: "remove", product_ids: [1] });
  assert.equal(removed.items.length, 0);
});

test("failed hydration remains visible and cannot enter the local Basket", async () => {
  const service = new ProductReviewService({ ...client, getProduct: async () => { throw new Error("Missing"); } });
  const draft = await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  assert.equal(draft.items[0]?.view.status, "unavailable");
  await assert.rejects(service.update("owner", draft.review_id, draft.revision, { kind: "accept", product_ids: [1] }), /unavailable/i);
  assert.deepEqual(service.show("owner", draft.review_id), draft);
});
