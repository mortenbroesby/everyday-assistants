import assert from "node:assert/strict";
import test from "node:test";
import { NemligError, type Product } from "./client.js";
import { MAX_DRAFT_PRODUCTS, ProductReviewService } from "./product-review.js";

const product = (id: number): Product => ({
  id, name: `Product ${id}`, price: 5, unitPrice: 5, unit: "stk", unitSize: "1 stk", brand: "", category: "", subcategory: "", imageUrl: "", available: true,
  labels: [], isOrganic: false, isFrozen: false, isRefrigerated: false, isDairy: false, isLactoseFree: false, isGlutenFree: false, isVegan: false, isOnDiscount: false,
});
const client = { getProduct: async (id: number) => product(id), searchProducts: async () => [product(3)] };

test("local Draft lists accept 500 exact products and reject 501 before provider reads", async () => {
  const items = Array.from({ length: MAX_DRAFT_PRODUCTS }, (_, index) => ({ product_id: index + 1, quantity: 1 }));
  const draft = await new ProductReviewService(client).start("owner", items);
  assert.equal(draft.items.length, MAX_DRAFT_PRODUCTS);

  let reads = 0;
  const overLimit = new ProductReviewService({ ...client, getProduct: async (id) => { reads++; return product(id); } });
  await assert.rejects(overLimit.start("owner", [...items, { product_id: MAX_DRAFT_PRODUCTS + 1, quantity: 1 }]), /1–500/u);
  assert.equal(reads, 0);
});

test("voice and touch share exact local edits, reject stale/foreign references, and retain alternatives", async () => {
  const service = new ProductReviewService(client);
  const initial = await service.start("owner", [{ product_id: 1, quantity: 2 }, { product_id: 2, quantity: 1 }]);
  const accepted = await service.update("owner", initial.review_id, initial.revision, { kind: "accept", product_ids: [1] });
  assert.deepEqual(accepted.items.map(i => i.state), ["ready", "needs-review"]);
  await assert.rejects(service.update("owner", initial.review_id, accepted.revision, { kind: "accept", product_ids: [1] }), /Only To decide/i);
  assert.equal(service.show("owner", initial.review_id).revision, accepted.revision);
  await assert.rejects(service.update("owner", initial.review_id, initial.revision, { kind: "remove", product_ids: [1] }), /stale/i);
  assert.throws(() => service.show("stranger", initial.review_id), /unavailable/i);
  const alternatives = await service.update("owner", initial.review_id, accepted.revision, { kind: "alternatives", product_id: 2, query: "alternative" });
  const ready = await service.update("owner", initial.review_id, alternatives.revision, { kind: "navigate", destination: "ready" });
  assert.equal(ready.alternatives?.product_id, 2);
  const replaced = await service.update("owner", initial.review_id, ready.revision, { kind: "replace", product_id: 2, replacement_id: 3 });
  assert.deepEqual(replaced.items.map(i => [i.product_id, i.state]), [[1, "ready"], [3, "needs-review"]]);
  assert.equal(replaced.destination, "needs-review");
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

test("alternatives preserve every unique provider result in order unless the user requests a count", async () => {
  const candidates = Array.from({ length: 12 }, (_, index) => product(index + 10));
  const receivedLimits: Array<number | undefined> = [];
  const service = new ProductReviewService({
    ...client,
    searchProducts: async (_query, limit) => { receivedLimits.push(limit); return [...candidates, candidates[0]!]; },
  });
  const draft = await service.start("owner", [{ product_id: 1, quantity: 2 }]);
  const alternatives = await service.update("owner", draft.review_id, draft.revision, {
    kind: "alternatives", product_id: 1, query: "smør",
  });
  assert.deepEqual(receivedLimits, [undefined]);
  assert.deepEqual(alternatives.alternatives?.views.map(view => view.status === "complete" ? view.product.id : view.product_id), candidates.map(item => item.id));

  const limited = await service.update("owner", draft.review_id, alternatives.revision, {
    kind: "alternatives", product_id: 1, query: "smør", limit: 2,
  });
  assert.deepEqual(receivedLimits, [undefined, 2]);
  assert.deepEqual(limited.alternatives?.views.map(view => view.status === "complete" ? view.product.id : view.product_id), [10, 11]);
});

test("Ready lines cannot choose alternatives until moved back; replacement remains unaccepted", async () => {
  const service = new ProductReviewService(client);
  let draft = await service.start("owner", [{ product_id: 1, quantity: 2 }]);
  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "accept", product_ids: [1] });
  await assert.rejects(service.update("owner", draft.review_id, draft.revision, { kind: "alternatives", product_id: 1, query: "alternative" }), /Move a Ready product/i);
  assert.deepEqual(service.show("owner", draft.review_id), draft);
  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "revisit", product_ids: [1] });
  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "alternatives", product_id: 1, query: "alternative" });
  await assert.rejects(service.update("owner", draft.review_id, draft.revision, { kind: "replace", product_id: 1, replacement_id: 4 }), /exact returned alternative/i);
  assert.deepEqual(service.show("owner", draft.review_id), draft, "a non-candidate replacement must leave the draft unchanged");
  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "replace", product_id: 1, replacement_id: 3 });
  assert.equal(draft.items[0]?.state, "needs-review");
  assert.equal(draft.items[0]?.quantity, 2);
  assert.equal(draft.destination, "needs-review");
});

test("removing all accepted products keeps unresolved lines and never reads the provider basket", async () => {
  const service = new ProductReviewService(client);
  let draft = await service.start("owner", [{ product_id: 1, quantity: 1 }, { product_id: 2, quantity: 1 }]);
  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "accept", product_ids: [1] });
  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "remove", product_ids: [1] });
  assert.deepEqual(draft.items.map(item => [item.product_id, item.state]), [[2, "needs-review"]]);
  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "remove", product_ids: [2] });
  assert.deepEqual(draft.items, []);
  assert.deepEqual(service.active("owner"), draft);
});

test("preparation includes only accepted products while In Review remains populated", async () => {
  let prepared: Array<{ product_id: number; quantity: number }> = [];
  const proposals = {
    prepareAdditions: async (_owner: string, items: typeof prepared) => {
      prepared = items;
      return { applicable: true as const, proposal_id: "private", operation: "additions" as const, connection_bound: true as const,
        issued_at: new Date(0).toISOString(), expires_at: new Date(Date.now() + 900_000).toISOString(), basket_fingerprint: "private", review: { lines: items } };
    },
    apply: async (): Promise<never> => { throw new Error("No provider write expected"); },
  };
  const service = new ProductReviewService(client, { proposals });
  let draft = await service.start("owner", [{ product_id: 1, quantity: 2 }, { product_id: 2, quantity: 3 }]);
  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "accept", product_ids: [1] });
  draft = await service.prepare("owner", draft.review_id, draft.revision);
  assert.deepEqual(prepared, [{ product_id: 1, quantity: 2 }]);
  assert.deepEqual(draft.items.map(item => item.state), ["ready", "needs-review"]);
  assert.equal(draft.submission?.status, "prepared");
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
  assert.equal(service.show("owner", draft.review_id).items[0]?.state, "ready");
  assert.throws(() => service.end("owner", draft.review_id, draft.revision), /stale/i);
  service.end("owner", draft.review_id, edited.revision);
  assert.equal(service.active("owner"), undefined);
  assert.throws(() => service.show("owner", draft.review_id), /unavailable/i);
  const restarted = await service.start("owner", [{ product_id: 2, quantity: 1 }]);
  assert.notEqual(restarted.review_id, draft.review_id);
});

test("each rendered draft view supersedes older cards for that conversation", async () => {
  const service = new ProductReviewService(client);
  const draft = await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  const first = service.createView("owner", draft.review_id);
  const second = service.createView("owner", draft.review_id);

  assert.notEqual(first.view_id, second.view_id);
  assert.doesNotThrow(() => service.assertCurrentView("owner", draft.review_id, second.view_id));
  assert.throws(() => service.assertCurrentView("owner", draft.review_id, first.view_id), /out of date/i);
  assert.throws(() => service.assertCurrentView("another-owner", draft.review_id, second.view_id), /unavailable/i);
  assert.deepEqual(service.show("owner", draft.review_id), draft);
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

test("clarification edits to To decide preserve the exact prepared Ready submission; Ready changes invalidate it", async () => {
  let writes = 0;
  const proposals = {
    prepareAdditions: async (_owner: string, items: Array<{ product_id: number; quantity: number }>) => ({
      applicable: true as const, proposal_id: "private", operation: "additions" as const, connection_bound: true as const,
      issued_at: new Date(0).toISOString(), expires_at: new Date(Date.now() + 900_000).toISOString(), basket_fingerprint: "private",
      review: { lines: items.map(item => ({ ...item, item_price: 5 })) },
    }),
    apply: async () => {
      writes++;
      return { status: "completed" as const, operation: "additions" as const, replayed: false, basket: { items: [], products_price: 0, delivery_price: 0, number_of_products: 0, delivery_time: undefined } };
    },
  };
  const service = new ProductReviewService(client, { proposals });
  let draft = await service.start("owner", [{ product_id: 1, quantity: 2 }, { product_id: 2, quantity: 1 }]);
  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "accept", product_ids: [1] });
  draft = await service.prepare("owner", draft.review_id, draft.revision);
  const exactSubmission = draft.submission!;

  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "add", items: [{ product_id: 3, quantity: 1 }] });
  assert.equal(draft.destination, "needs-review");
  assert.equal(draft.submission?.submission_id, exactSubmission.submission_id);
  assert.deepEqual(draft.items.filter(item => item.state === "ready").map(({ product_id, quantity }) => [product_id, quantity]), [[1, 2]]);
  await assert.rejects(service.submit("owner", draft.review_id, draft.revision - 1, exactSubmission.submission_id), /stale/i);
  const submitted = await service.submit("owner", draft.review_id, draft.revision, exactSubmission.submission_id);
  assert.equal(submitted.review.submission?.status, "submitted");
  assert.deepEqual(submitted.result.basket.items, []);
  assert.equal(writes, 1);

  let next = await service.start("other-owner", [{ product_id: 1, quantity: 2 }]);
  next = await service.update("other-owner", next.review_id, next.revision, { kind: "accept", product_ids: [1] });
  next = await service.prepare("other-owner", next.review_id, next.revision);
  const oldSubmission = next.submission!.submission_id;
  next = await service.update("other-owner", next.review_id, next.revision, { kind: "quantity", product_id: 1, quantity: 3 });
  assert.equal(next.submission, undefined);
  await assert.rejects(service.submit("other-owner", next.review_id, next.revision, oldSubmission), /submission/i);
  assert.equal(writes, 1);
});

test("an expired prepared submission cannot write the provider basket", async () => {
  let now = 1_000;
  let writes = 0;
  const proposals = {
    prepareAdditions: async () => ({ proposal_id: "private", expires_at: new Date(now + 1_000).toISOString(), review: { lines: [{ product_id: 1, quantity: 1 }] } }),
    apply: async () => { writes++; throw new Error("Expired proposal must never apply"); },
  } as unknown as NonNullable<ConstructorParameters<typeof ProductReviewService>[1]>["proposals"];
  const service = new ProductReviewService(client, { proposals, now: () => now });
  let draft = await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  draft = await service.update("owner", draft.review_id, draft.revision, { kind: "accept", product_ids: [1] });
  draft = await service.prepare("owner", draft.review_id, draft.revision);
  now += 1_000;
  await assert.rejects(service.submit("owner", draft.review_id, draft.revision, draft.submission!.submission_id), /expired/i);
  assert.equal(writes, 0);
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

test("failed hydration remains visible and cannot enter Ready", async () => {
  const service = new ProductReviewService({ ...client, getProduct: async () => { throw new Error("Missing"); } });
  const draft = await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  assert.equal(draft.items[0]?.view.status, "unavailable");
  await assert.rejects(service.update("owner", draft.review_id, draft.revision, { kind: "accept", product_ids: [1] }), /unavailable/i);
  assert.deepEqual(service.show("owner", draft.review_id), draft);
});

test("start and add share exact-product hydration and propagate authentication failures", async () => {
  const service = new ProductReviewService({
    ...client,
    getProduct: async (id) => {
      if (id === 2) return product(99);
      if (id === 3) throw new NemligError("Session expired", 401);
      return product(id);
    },
  });
  const draft = await service.start("owner", [{ product_id: 1, quantity: 1 }, { product_id: 2, quantity: 1 }]);
  assert.equal(draft.items[1]?.view.status, "unavailable");
  const added = await service.update("owner", draft.review_id, draft.revision, { kind: "add", items: [{ product_id: 4, quantity: 1 }] });
  assert.equal(added.items[2]?.view.status, "complete");
  await assert.rejects(service.update("owner", draft.review_id, added.revision, { kind: "add", items: [{ product_id: 3, quantity: 1 }] }), /Session expired/u);
  assert.deepEqual(service.show("owner", draft.review_id), added);
  await assert.rejects(service.start("another-owner", [{ product_id: 3, quantity: 1 }]), /Session expired/u);
  assert.equal(service.active("another-owner"), undefined);
});
