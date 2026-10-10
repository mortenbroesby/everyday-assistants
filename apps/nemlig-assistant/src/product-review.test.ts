import assert from "node:assert/strict";
import test from "node:test";
import { VerifiedPartialAdditionsError } from "./proposals.js";
import { NemligError, type Product } from "./client.js";
import { MAX_DRAFT_PRODUCTS, ProductReviewService } from "./product-review.js";

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
};

test("local Draft lists accept 500 exact products and reject 501 before provider reads", async () => {
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

test("supported cards share sequential owner-scoped edits and retain alternatives", async () => {
  const service = new ProductReviewService(client);
  await service.start("owner", [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 1 },
  ]);
  const accepted = await service.update("owner", {
    kind: "accept",
    product_ids: [1],
  });
  assert.deepEqual(
    accepted.items.map((i) => i.state),
    ["ready", "needs-review"],
  );
  await assert.rejects(
    service.update("owner", {
      kind: "accept",
      product_ids: [1],
    }),
    /Only To decide/i,
  );
  assert.deepEqual(service.active("owner"), accepted);
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
      [3, "needs-review"],
    ],
  );
  assert.equal(replaced.destination, "needs-review");
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
    kind: "accept",
    product_ids: [1],
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

test("Ready lines cannot choose alternatives until moved back; replacement remains unaccepted", async () => {
  const service = new ProductReviewService(client);
  await service.start("owner", [{ product_id: 1, quantity: 2 }]);
  let draft = await service.update("owner", {
    kind: "accept",
    product_ids: [1],
  });
  await assert.rejects(
    service.update("owner", {
      kind: "alternatives",
      product_id: 1,
      query: "alternative",
    }),
    /Move a Ready product/i,
  );
  assert.deepEqual(service.active("owner"), draft);
  await service.update("owner", {
    kind: "revisit",
    product_ids: [1],
  });
  draft = await service.update("owner", {
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
  assert.equal(draft.items[0]?.state, "needs-review");
  assert.equal(draft.items[0]?.quantity, 2);
  assert.equal(draft.destination, "needs-review");
});

test("removing all accepted products keeps unresolved lines and never reads the provider basket", async () => {
  const service = new ProductReviewService(client);
  await service.start("owner", [
    { product_id: 1, quantity: 1 },
    { product_id: 2, quantity: 1 },
  ]);
  await service.update("owner", {
    kind: "accept",
    product_ids: [1],
  });
  let draft = await service.update("owner", {
    kind: "remove",
    product_ids: [1],
  });
  assert.deepEqual(
    draft.items.map((item) => [item.product_id, item.state]),
    [[2, "needs-review"]],
  );
  draft = await service.update("owner", {
    kind: "remove",
    product_ids: [2],
  });
  assert.deepEqual(draft.items, []);
  assert.deepEqual(service.active("owner"), draft);
});

test("preparation includes only accepted products while In Review remains populated", async () => {
  let prepared: Array<{ product_id: number; quantity: number }> = [];
  const proposals = {
    prepareAdditions: async (_owner: string, items: typeof prepared) => {
      prepared = items;
      return {
        applicable: true as const,
        proposal_id: "private",
        operation: "additions" as const,
        connection_bound: true as const,
        issued_at: new Date(0).toISOString(),
        expires_at: new Date(Date.now() + 900_000).toISOString(),
        basket_fingerprint: "private",
        review: { lines: items },
      };
    },
    apply: async (): Promise<never> => {
      throw new Error("No provider write expected");
    },
  };
  const service = new ProductReviewService(client, { proposals });
  await service.start("owner", [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 3 },
  ]);
  await service.update("owner", {
    kind: "accept",
    product_ids: [1],
  });
  const draft = await service.prepare("owner");
  assert.deepEqual(prepared, [{ product_id: 1, quantity: 2 }]);
  assert.deepEqual(
    draft.items.map((item) => item.state),
    ["ready", "needs-review"],
  );
  assert.equal(draft.submission?.status, "prepared");
});

test("session drafts survive an hour, repeated starts preserve them, and explicit end clears them", async () => {
  let now = 0;
  const service = new ProductReviewService(client, { now: () => now });
  await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  assert.equal(service.active("another-session-owner"), undefined);
  const edited = await service.update("owner", {
    kind: "accept",
    product_ids: [1],
  });
  await assert.rejects(
    service.update("owner", {
      kind: "accept",
      product_ids: [1, 99],
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
      items: [{ product_id: 1, quantity: 2 }],
    }),
    /unique exact/i,
  );
  assert.deepEqual(service.active("owner-1"), draft);
  const added = await service.update("owner-1", {
    kind: "add",
    items: [{ product_id: 2, quantity: 3 }],
  });
  assert.deepEqual(
    added.items.map((item) => [item.product_id, item.quantity, item.state]),
    [
      [1, 1, "needs-review"],
      [2, 3, "needs-review"],
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

test("submission hides provider references, invalidates edits, and retains verified or uncertain outcomes", async () => {
  let writes = 0;
  let fail = false;
  const proposals = {
    prepareAdditions: async () => ({
      applicable: true as const,
      proposal_id: "private-provider-reference",
      operation: "additions" as const,
      connection_bound: true as const,
      issued_at: new Date(0).toISOString(),
      expires_at: new Date(Date.now() + 900_000).toISOString(),
      basket_fingerprint: "private",
      review: { lines: [{ product_id: 1, quantity: 1, item_price: 5 }] },
    }),
    apply: async () => {
      writes++;
      if (fail) {
        throw new Error("Readback unavailable");
      }
      return {
        status: "completed" as const,
        operation: "additions" as const,
        replayed: false,
        basket: {
          items: [],
          products_price: 0,
          delivery_price: 0,
          number_of_products: 0,
          delivery_time: undefined,
        },
      };
    },
  };
  const service = new ProductReviewService(client, { proposals });
  await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  await service.update("owner", {
    kind: "accept",
    product_ids: [1],
  });
  let draft = await service.prepare("owner");
  assert.equal(writes, 0);
  assert.ok(!JSON.stringify(draft).includes("private-provider-reference"));
  const invalidated = draft.submission!.submission_id;
  draft = await service.update("owner", {
    kind: "revisit",
    product_ids: [1],
  });
  assert.equal(draft.items[0]?.state, "needs-review");
  await assert.rejects(service.submit("owner", invalidated), /submission/i);
  await service.update("owner", {
    kind: "accept",
    product_ids: [1],
  });
  draft = await service.prepare("owner");
  const changedQuantitySubmission = draft.submission!.submission_id;
  await service.update("owner", {
    kind: "quantity",
    product_id: 1,
    quantity: 2,
  });
  await assert.rejects(
    service.submit("owner", changedQuantitySubmission),
    /submission/i,
  );
  assert.equal(writes, 0);
  draft = await service.prepare("owner");
  const reference = draft.submission!.submission_id;
  const result = await service.submit("owner", reference);
  assert.equal(result.review.submission?.status, "submitted");
  assert.equal(result.review.items.length, 1);
  assert.equal(writes, 1);
  await assert.rejects(service.submit("owner", reference), /submission/i);
  await service.update("owner", {
    kind: "quantity",
    product_id: 1,
    quantity: 3,
  });
  draft = await service.prepare("owner");
  fail = true;
  await assert.rejects(
    service.submit("owner", draft.submission!.submission_id),
    /Readback/,
  );
  const uncertain = service.active("owner");
  assert.equal(uncertain?.submission?.status, "uncertain");
  assert.equal(uncertain?.items.length, 1);
  await assert.rejects(service.prepare("owner"), /inspect/i);
  assert.equal(writes, 2);
});

test("a verified partial addition remains blocked with its confirmed count", async () => {
  const proposals = {
    prepareAdditions: async () => ({
      applicable: true as const,
      proposal_id: "private-provider-reference",
      operation: "additions" as const,
      connection_bound: true as const,
      issued_at: new Date(0).toISOString(),
      expires_at: new Date(Date.now() + 900_000).toISOString(),
      basket_fingerprint: "private",
      review: { lines: [{ product_id: 1, quantity: 1, item_price: 5 }] },
    }),
    apply: async () => {
      throw new VerifiedPartialAdditionsError(
        1,
        "Earlier verified additions: Product 1. The next write failed its basket preflight; no later write was sent.",
      );
    },
  };
  const service = new ProductReviewService(client, { proposals });
  await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  await service.update("owner", {
    kind: "accept",
    product_ids: [1],
  });
  const draft = await service.prepare("owner");

  await assert.rejects(
    service.submit("owner", draft.submission!.submission_id),
    /no later write was sent/i,
  );

  const partial = service.active("owner");
  assert.equal(partial?.submission?.status, "partial");
  assert.equal(partial?.submission?.verified_additions, 1);
  await assert.rejects(service.prepare("owner"), /inspect/i);
});

test("clarification edits to To decide preserve the exact prepared Ready submission; Ready changes invalidate it", async () => {
  let writes = 0;
  const proposals = {
    prepareAdditions: async (
      _owner: string,
      items: Array<{ product_id: number; quantity: number }>,
    ) => ({
      applicable: true as const,
      proposal_id: "private",
      operation: "additions" as const,
      connection_bound: true as const,
      issued_at: new Date(0).toISOString(),
      expires_at: new Date(Date.now() + 900_000).toISOString(),
      basket_fingerprint: "private",
      review: { lines: items.map((item) => ({ ...item, item_price: 5 })) },
    }),
    apply: async () => {
      writes++;
      return {
        status: "completed" as const,
        operation: "additions" as const,
        replayed: false,
        basket: {
          items: [],
          products_price: 0,
          delivery_price: 0,
          number_of_products: 0,
          delivery_time: undefined,
        },
      };
    },
  };
  const service = new ProductReviewService(client, { proposals });
  await service.start("owner", [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 1 },
  ]);
  await service.update("owner", {
    kind: "accept",
    product_ids: [1],
  });
  let draft = await service.prepare("owner");
  const exactSubmission = draft.submission!;

  draft = await service.update("owner", {
    kind: "add",
    items: [{ product_id: 3, quantity: 1 }],
  });
  assert.equal(draft.destination, "needs-review");
  assert.equal(draft.submission?.submission_id, exactSubmission.submission_id);
  assert.deepEqual(
    draft.items
      .filter((item) => item.state === "ready")
      .map(({ product_id, quantity }) => [product_id, quantity]),
    [[1, 2]],
  );
  const submitted = await service.submit(
    "owner",
    exactSubmission.submission_id,
  );
  assert.equal(submitted.review.submission?.status, "submitted");
  assert.deepEqual(submitted.result.basket.items, []);
  assert.equal(writes, 1);

  await service.start("other-owner", [{ product_id: 1, quantity: 2 }]);
  await service.update("other-owner", {
    kind: "accept",
    product_ids: [1],
  });
  let next = await service.prepare("other-owner");
  const oldSubmission = next.submission!.submission_id;
  next = await service.update("other-owner", {
    kind: "quantity",
    product_id: 1,
    quantity: 3,
  });
  assert.equal(next.submission, undefined);
  await assert.rejects(
    service.submit("other-owner", oldSubmission),
    /submission/i,
  );
  assert.equal(writes, 1);
});

test("an expired prepared submission cannot write the provider basket", async () => {
  let now = 1_000;
  let writes = 0;
  const proposals = {
    prepareAdditions: async () => ({
      proposal_id: "private",
      expires_at: new Date(now + 1_000).toISOString(),
      review: { lines: [{ product_id: 1, quantity: 1 }] },
    }),
    apply: async () => {
      writes++;
      throw new Error("Expired proposal must never apply");
    },
  } as unknown as NonNullable<
    ConstructorParameters<typeof ProductReviewService>[1]
  >["proposals"];
  const service = new ProductReviewService(client, {
    proposals,
    now: () => now,
  });
  await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  await service.update("owner", {
    kind: "accept",
    product_ids: [1],
  });
  const draft = await service.prepare("owner");
  now += 1_000;
  await assert.rejects(
    service.submit("owner", draft.submission!.submission_id),
    /expired/i,
  );
  assert.equal(writes, 0);
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

test("failed hydration remains visible and cannot enter Ready", async () => {
  const service = new ProductReviewService({
    ...client,
    getProduct: async () => {
      throw new Error("Missing");
    },
  });
  const draft = await service.start("owner", [{ product_id: 1, quantity: 1 }]);
  assert.equal(draft.items[0]?.view.status, "unavailable");
  await assert.rejects(
    service.update("owner", {
      kind: "accept",
      product_ids: [1],
    }),
    /unavailable/i,
  );
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
