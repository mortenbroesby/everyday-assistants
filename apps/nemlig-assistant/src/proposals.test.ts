import assert from "node:assert/strict";
import test from "node:test";
import { NemligClient, type Basket, type Product, type ShoppingClient } from "./client.js";
import {
  basketFingerprint,
  BasketProposalService,
  type ProposalAuditEvent,
} from "./proposals.js";

const product: Product = {
  id: 7,
  name: "Banan",
  price: 2.5,
  unit: "2,50 kr/stk.",
  unitPrice: 2.5,
  unitSize: "1 stk.",
  brand: "",
  category: "Grønt",
  subcategory: "",
  imageUrl: "",
  available: true,
  labels: ["Frugt"],
  isOrganic: false,
  isFrozen: false,
  isRefrigerated: false,
  isDairy: false,
  isLactoseFree: false,
  isGlutenFree: false,
  isVegan: true,
  isOnDiscount: false,
};

const emptyBasket = (): Basket => ({
  items: [],
  productsPrice: 0,
  deliveryPrice: 0,
  numberOfProducts: 0,
  deliveryTime: undefined,
});

const bananaBasket = (quantity = 1): Basket => ({
  items: [{ id: 7, name: "Banan", quantity, total: 2.5 * quantity }],
  productsPrice: 2.5 * quantity,
  deliveryPrice: 0,
  numberOfProducts: quantity,
  deliveryTime: undefined,
});

type ProposalClient = Pick<
  ShoppingClient,
  "searchProducts" | "getProduct" | "getFreshProduct" | "getCart" | "addToCart"
>;

const fakeClient = (overrides: Partial<ProposalClient> = {}): ProposalClient => ({
  searchProducts: async () => [product],
  getProduct: async (id) => ({ ...product, id }),
  getFreshProduct: async (id) => ({ ...product, id }),
  getCart: async () => emptyBasket(),
  addToCart: async (_id, quantity = 1) => bananaBasket(quantity),
  ...overrides,
});

const otherProduct: Product = { ...product, id: 8, name: "Pære", price: 4, unitPrice: 4, unit: "4 kr/stk." };

const httpProposalFixture = (
  initial: Basket,
  options: {
    onBasketRead?: (read: number, basket: Basket) => void;
    failBasketReadAt?: number[];
    failAntiForgery?: boolean;
    failPostAfterApply?: number;
  } = {},
) => {
  const state = { basket: structuredClone(initial), basketReads: 0 };
  const events: string[] = [];
  const posts: Array<{ ProductId: number; quantity: number; AffectPartialQuantity: false; disableQuantityValidation: false }> = [];
  const client = new NemligClient(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/basket/GetBasket")) {
      state.basketReads += 1;
      options.onBasketRead?.(state.basketReads, state.basket);
      events.push("read");
      if (options.failBasketReadAt?.includes(state.basketReads)) return new Response("{}", { status: 503 });
      return Response.json({
        Lines: state.basket.items.map((item) => ({
          Id: item.id,
          Name: item.name,
          Quantity: item.quantity,
          Total: item.total,
        })),
        TotalProductsPrice: state.basket.productsPrice,
        DeliveryPrice: state.basket.deliveryPrice,
        NumberOfProducts: state.basket.numberOfProducts,
        FormattedDeliveryTime: state.basket.deliveryTime,
      });
    }
    if (path.endsWith("/AntiForgery")) {
      if (options.failAntiForgery) return new Response("{}", { status: 503 });
      const headers = new Headers();
      headers.append("set-cookie", "XSRF-TOKEN=test-xsrf; Path=/");
      headers.append("set-cookie", "XSRF-COOKIE-TOKEN=test-cookie; Path=/");
      return Response.json({ Header: "X-XSRF-TOKEN", Value: "test-xsrf" }, { headers });
    }
    if (path.endsWith("/basket/AddToBasket")) {
      const body = JSON.parse(String(init?.body)) as typeof posts[number];
      posts.push(body);
      events.push(`write:${body.ProductId}`);
      const selected = body.ProductId === 7 ? product : body.ProductId === 8 ? otherProduct : undefined;
      assert.ok(selected, `Unexpected product write: ${body.ProductId}`);
      const existing = state.basket.items.find((item) => item.id === body.ProductId);
      const nextLine = { id: body.ProductId, name: selected.name, quantity: body.quantity, total: (selected.price ?? 0) * body.quantity };
      state.basket = {
        ...state.basket,
        items: existing
          ? state.basket.items.map((item) => item.id === body.ProductId ? nextLine : item)
          : [...state.basket.items, nextLine],
        productsPrice: (state.basket.productsPrice ?? 0) - (existing?.total ?? 0) + (nextLine.total ?? 0),
        numberOfProducts: (state.basket.numberOfProducts ?? 0) - (existing?.quantity ?? 0) + body.quantity,
      };
      if (posts.length === options.failPostAfterApply) throw new Error("Mock response lost after provider applied write");
      return Response.json({});
    }
    throw new Error(`Unexpected mock request: ${path}`);
  });
  Object.assign(client, { loggedIn: true });
  client.getProduct = async (id) => id === 7 ? product : otherProduct;
  client.getFreshProduct = async (id) => id === 7 ? product : otherProduct;
  return { client, state, events, posts };
};

const basketWithExistingProducts = (): Basket => ({
  items: [
    { id: 7, name: "Banan", quantity: 2, total: 5 },
    { id: 9, name: "Minimælk", quantity: 1, total: 12.5 },
  ],
  productsPrice: 17.5,
  deliveryPrice: 0,
  numberOfProducts: 3,
  deliveryTime: undefined,
});

test("real client applies multiple reviewed lines sequentially and preserves unrelated products", async () => {
  const fixture = httpProposalFixture(basketWithExistingProducts());
  const service = new BasketProposalService(fixture.client);
  const prepared = await service.prepareAdditions("connection", [
    { product_id: 7, quantity: 1 },
    { product_id: 8, quantity: 2 },
  ], { kind: "exact_review" });

  const result = await service.apply("connection", prepared.proposal_id, "additions");

  assert.deepEqual(fixture.posts, [
    { ProductId: 7, quantity: 3, AffectPartialQuantity: false, disableQuantityValidation: false },
    { ProductId: 8, quantity: 2, AffectPartialQuantity: false, disableQuantityValidation: false },
  ]);
  assert.deepEqual(fixture.events, ["read", "read", "read", "write:7", "read", "read", "write:8", "read"]);
  assert.deepEqual(result.basket.items, [
    { id: 7, name: "Banan", quantity: 3, total: 7.5 },
    { id: 9, name: "Minimælk", quantity: 1, total: 12.5 },
    { id: 8, name: "Pære", quantity: 2, total: 8 },
  ]);
  assert.equal(result.basket.products_price, 28);
  assert.equal(result.basket.number_of_products, 6);
});

test("real client rejects basket drift before the first product POST", async () => {
  const fixture = httpProposalFixture(basketWithExistingProducts(), {
    onBasketRead: (read, basket) => {
      if (read === 3) {
        const banana = basket.items.find((item) => item.id === 7)!;
        banana.quantity = 3;
        banana.total = 7.5;
        basket.productsPrice = 20;
        basket.numberOfProducts = 4;
      }
    },
  });
  const service = new BasketProposalService(fixture.client);
  const prepared = await service.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" });

  await assert.rejects(
    service.apply("connection", prepared.proposal_id, "additions"),
    /Basket changed before an addition; no provider write was sent/u,
  );
  assert.deepEqual(fixture.posts, []);
  await assert.rejects(service.apply("connection", prepared.proposal_id, "additions"), /no longer applicable/u);
});

test("real client stops a multi-line proposal when the basket drifts between writes", async () => {
  const fixture = httpProposalFixture(basketWithExistingProducts(), {
    onBasketRead: (read, basket) => {
      if (read === 5) {
        const milk = basket.items.find((item) => item.id === 9)!;
        milk.quantity = 2;
        milk.total = 25;
        basket.productsPrice = 30;
        basket.numberOfProducts = 6;
      }
    },
  });
  const audits: ProposalAuditEvent[] = [];
  const service = new BasketProposalService(fixture.client, { audit: (event) => audits.push(event) });
  const prepared = await service.prepareAdditions("connection", [
    { product_id: 7, quantity: 1 },
    { product_id: 8, quantity: 2 },
  ], { kind: "exact_review" });

  await assert.rejects(
    service.apply("connection", prepared.proposal_id, "additions"),
    /Earlier verified additions: Banan\..*basket changed before the next write.*no later write was sent/u,
  );
  assert.deepEqual(fixture.posts, [{
    ProductId: 7,
    quantity: 3,
    AffectPartialQuantity: false,
    disableQuantityValidation: false,
  }]);
  await assert.rejects(service.apply("connection", prepared.proposal_id, "additions"), /no longer applicable/u);
  assert.equal(fixture.posts.length, 1);
  assert.deepEqual(audits.slice(-2), [
    { event: "applying", operation: "additions", result: "started" },
    { event: "partial", operation: "additions", result: "verified-partial" },
  ]);
});

test("real client never retries a proposal after an uncertain later write", async () => {
  const fixture = httpProposalFixture(basketWithExistingProducts(), { failPostAfterApply: 2 });
  const service = new BasketProposalService(fixture.client);
  const prepared = await service.prepareAdditions("connection", [
    { product_id: 7, quantity: 1 },
    { product_id: 8, quantity: 2 },
  ], { kind: "exact_review" });

  await assert.rejects(service.apply("connection", prepared.proposal_id, "additions"), /may have changed.*do not retry/u);
  await assert.rejects(service.apply("connection", prepared.proposal_id, "additions"), /no longer applicable/u);
  assert.deepEqual(fixture.posts, [
    { ProductId: 7, quantity: 3, AffectPartialQuantity: false, disableQuantityValidation: false },
    { ProductId: 8, quantity: 2, AffectPartialQuantity: false, disableQuantityValidation: false },
  ]);
});

test("real client rejects a known pre-write read failure without calling it uncertain", async () => {
  const fixture = httpProposalFixture(basketWithExistingProducts(), { failBasketReadAt: [3] });
  const service = new BasketProposalService(fixture.client);
  const prepared = await service.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" });

  await assert.rejects(service.apply("connection", prepared.proposal_id, "additions"), /no provider write was sent/u);
  await assert.rejects(service.apply("connection", prepared.proposal_id, "additions"), /no longer applicable/u);
  assert.deepEqual(fixture.posts, []);
});

test("a failed apply-time basket read consumes the proposal before any write", async () => {
  const fixture = httpProposalFixture(basketWithExistingProducts(), { failBasketReadAt: [2] });
  const service = new BasketProposalService(fixture.client);
  const prepared = await service.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" });

  await assert.rejects(service.apply("connection", prepared.proposal_id, "additions"), /no provider write was sent/u);
  await assert.rejects(service.apply("connection", prepared.proposal_id, "additions"), /no longer applicable/u);
  assert.deepEqual(fixture.posts, []);
});

test("real client consumes a proposal when anti-forgery setup fails before dispatch", async () => {
  const fixture = httpProposalFixture(basketWithExistingProducts(), { failAntiForgery: true });
  const service = new BasketProposalService(fixture.client);
  const prepared = await service.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" });

  await assert.rejects(service.apply("connection", prepared.proposal_id, "additions"), /no provider write was sent/u);
  await assert.rejects(service.apply("connection", prepared.proposal_id, "additions"), /no longer applicable/u);
  assert.deepEqual(fixture.posts, []);
});

test("real client reports a verified partial batch when the next pre-write read fails", async () => {
  const fixture = httpProposalFixture(basketWithExistingProducts(), { failBasketReadAt: [5] });
  const service = new BasketProposalService(fixture.client);
  const prepared = await service.prepareAdditions("connection", [
    { product_id: 7, quantity: 1 },
    { product_id: 8, quantity: 2 },
  ], { kind: "exact_review" });

  await assert.rejects(service.apply("connection", prepared.proposal_id, "additions"), /Earlier verified additions: Banan\..*no later write/u);
  await assert.rejects(service.apply("connection", prepared.proposal_id, "additions"), /no longer applicable/u);
  assert.deepEqual(fixture.posts.map(({ ProductId }) => ProductId), [7]);
});

test("basket fingerprints are order-stable and change with reviewed basket state", () => {
  const first: Basket = {
    ...bananaBasket(),
    items: [bananaBasket().items[0]!, { id: 2, name: "Milk", quantity: 1, total: 12 }],
  };
  const reordered = { ...first, items: [...first.items].reverse() };
  assert.equal(basketFingerprint(first), basketFingerprint(reordered));
  assert.notEqual(basketFingerprint(first), basketFingerprint({ ...first, productsPrice: 99 }));
});

test("addition preparation stores exact review data without mutation or connection disclosure", async () => {
  const audits: ProposalAuditEvent[] = [];
  let mutations = 0;
  const service = new BasketProposalService(
    fakeClient({ addToCart: async () => { mutations += 1; return bananaBasket(2); } }),
    {
      now: () => new Date("2026-08-30T12:00:00Z"),
      id: () => "00000000-0000-4000-8000-000000000007",
      audit: (event) => audits.push(event),
    },
  );
  const proposal = await service.prepareAdditions("private-connection", [{ product_id: 7, quantity: 2 }], { kind: "exact_review" });
  assert.equal(proposal.authorization, "exact_review");
  assert.equal(proposal.expires_at, "2026-08-30T12:15:00.000Z");
  assert.equal(proposal.connection_bound, true);
  assert.doesNotMatch(JSON.stringify(proposal), /private-connection/);
  assert.deepEqual(proposal.review, {
    lines: [{
      product_id: 7,
      name: "Banan",
      unit_size: "1 stk.",
      category: "Grønt",
      subcategory: "",
      quantity: 2,
      current_quantity: 0,
      resulting_quantity: 2,
      current_line_total: 0,
      resulting_line_total: 5,
      available: true,
      item_price: 2.5,
      unit_price: 2.5,
      unit: "2,50 kr/stk.",
      currency: "DKK",
      line_total: 5,
      labels: ["Frugt"],
    }],
    expected_products_price: 5,
    expected_number_of_products: 2,
  });
  assert.equal(mutations, 0);
  assert.deepEqual(audits, [{ event: "created", operation: "additions", result: "prepared" }]);
  assert.doesNotMatch(JSON.stringify(audits), /Banan|private-connection|00000000/);
});

test("approved addition quantities are deltas for existing lines and preserve unrelated products", async () => {
  const original: Basket = {
    items: [
      { id: 7, name: "Banan", quantity: 2, total: 5 },
      { id: 9, name: "Minimælk", quantity: 1, total: 12.5 },
    ],
    productsPrice: 17.5,
    deliveryPrice: 0,
    numberOfProducts: 3,
    deliveryTime: undefined,
  };
  let current = structuredClone(original);
  const writes: Array<[number, number]> = [];
  const client = fakeClient({
    getCart: async () => structuredClone(current),
    addToCart: async (id, quantityDelta = 1) => {
      writes.push([id, quantityDelta]);
      const existing = current.items.find((item) => item.id === id);
      const targetQuantity = (existing?.quantity ?? 0) + quantityDelta;
      const line: Basket["items"][number] = {
        id,
        name: "Banan",
        quantity: targetQuantity,
        total: 2.5 * targetQuantity,
      };
      current = {
        ...current,
        items: existing
          ? current.items.map((item) => item.id === id ? line : item)
          : [...current.items, line],
        productsPrice: (current.productsPrice ?? 0) - (existing?.total ?? 0) + line.total!,
        numberOfProducts: (current.numberOfProducts ?? 0) - (existing?.quantity ?? 0) + targetQuantity,
      };
      return structuredClone(current);
    },
  });
  const service = new BasketProposalService(client);
  const prepared = await service.prepareAdditions(
    "connection",
    [{ product_id: 7, quantity: 1 }],
    { kind: "exact_review" },
  );
  assert.deepEqual(prepared.review, {
    lines: [{
      product_id: 7,
      name: "Banan",
      unit_size: "1 stk.",
      category: "Grønt",
      subcategory: "",
      quantity: 1,
      available: true,
      item_price: 2.5,
      unit_price: 2.5,
      unit: "2,50 kr/stk.",
      currency: "DKK",
      line_total: 2.5,
      labels: ["Frugt"],
      current_quantity: 2,
      resulting_quantity: 3,
      current_line_total: 5,
      resulting_line_total: 7.5,
    }],
    expected_products_price: 20,
    expected_number_of_products: 4,
  });
  const applied = await service.apply("connection", prepared.proposal_id, "additions");
  assert.deepEqual(writes, [[7, 1]], "the proposal service passes the approved positive delta");
  assert.deepEqual(applied.basket.items, [
    { id: 7, name: "Banan", quantity: 3, total: 7.5 },
    { id: 9, name: "Minimælk", quantity: 1, total: 12.5 },
  ]);
  assert.equal(applied.basket.products_price, 20);
  assert.equal(applied.basket.number_of_products, 4);
});

test("addition preparation rejects incomplete basket facts before creating a proposal", async () => {
  const complete = basketWithExistingProducts();
  const incompleteSnapshots: Basket[] = [
    { ...complete, productsPrice: undefined },
    { ...complete, numberOfProducts: undefined },
    { ...complete, items: [{ ...complete.items[0]!, quantity: undefined }, complete.items[1]!] },
    { ...complete, items: [{ ...complete.items[0]!, total: undefined }, complete.items[1]!] },
  ];

  for (const basket of incompleteSnapshots) {
    let productReads = 0;
    const service = new BasketProposalService(fakeClient({
      getCart: async () => structuredClone(basket),
      getProduct: async () => { productReads += 1; return product; },
    }));
    await assert.rejects(
      service.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" }),
      /basket.*(complete|verified|safely)/iu,
    );
  assert.equal(productReads, 0, "incomplete basket facts must be rejected before product lookups");
  }
});

test("addition preparation rejects missing or planner-issued authorization", async () => {
  const service = new BasketProposalService(fakeClient({ getCart: async () => emptyBasket() }));
  const items = [{ product_id: 7, quantity: 1 }];
  await assert.rejects(service.prepareAdditions("connection", items, undefined as never), /authorization is required/);
  await assert.rejects(
    service.prepareAdditions("connection", items, { kind: "same_run_automatic", token: "not-supported" } as never),
    /authorization is required/,
  );
});

test("proposal audits preserve terminal state order and provider sequencing", async () => {
  const completedAudits: ProposalAuditEvent[] = [];
  const calls: string[] = [];
  const completed = new BasketProposalService(fakeClient({
    getCart: async () => { calls.push("cart"); return emptyBasket(); },
    getProduct: async () => { calls.push("review"); return product; },
    getFreshProduct: async () => { calls.push("fresh"); return product; },
    addToCart: async () => { calls.push("add"); return bananaBasket(); },
  }), { id: () => "00000000-0000-4000-8000-000000000030", audit: (event) => completedAudits.push(event) });
  const completedProposal = await completed.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" });
  await completed.apply("connection", completedProposal.proposal_id, "additions");
  await completed.apply("connection", completedProposal.proposal_id, "additions");
  assert.deepEqual(calls, ["cart", "review", "cart", "fresh", "add"]);
  assert.deepEqual(completedAudits, [
    { event: "created", operation: "additions", result: "prepared" },
    { event: "applying", operation: "additions", result: "started" },
    { event: "completed", operation: "additions", result: "verified" },
    { event: "replayed", operation: "additions", result: "known-result" },
  ]);

  let now = new Date("2026-09-06T10:00:00Z");
  const expiredAudits: ProposalAuditEvent[] = [];
  const expired = new BasketProposalService(fakeClient(), {
    now: () => now, ttlMs: 1, id: () => "00000000-0000-4000-8000-000000000031", audit: (event) => expiredAudits.push(event),
  });
  const expiredProposal = await expired.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" });
  now = new Date("2026-09-06T10:00:01Z");
  await assert.rejects(expired.apply("connection", expiredProposal.proposal_id, "additions"), /expired/);
  assert.deepEqual(expiredAudits, [
    { event: "created", operation: "additions", result: "prepared" },
    { event: "expired", operation: "additions", result: "expired" },
  ]);

  let current = emptyBasket();
  const invalidAudits: ProposalAuditEvent[] = [];
  const invalid = new BasketProposalService(fakeClient({ getCart: async () => current }), {
    id: () => "00000000-0000-4000-8000-000000000032", audit: (event) => invalidAudits.push(event),
  });
  const invalidProposal = await invalid.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" });
  current = bananaBasket();
  await assert.rejects(invalid.apply("connection", invalidProposal.proposal_id, "additions"), /Basket changed/);
  assert.deepEqual(invalidAudits, [
    { event: "created", operation: "additions", result: "prepared" },
    { event: "invalidated", operation: "additions", result: "rejected" },
  ]);

  let writes = 0;
  const indeterminateAudits: ProposalAuditEvent[] = [];
  const indeterminate = new BasketProposalService(fakeClient({
    addToCart: async () => { writes += 1; throw new Error("lost readback"); },
  }), { id: () => "00000000-0000-4000-8000-000000000033", audit: (event) => indeterminateAudits.push(event) });
  const indeterminateProposal = await indeterminate.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" });
  await assert.rejects(indeterminate.apply("connection", indeterminateProposal.proposal_id, "additions"), /may have changed/);
  await assert.rejects(indeterminate.apply("connection", indeterminateProposal.proposal_id, "additions"), /no longer applicable/);
  assert.equal(writes, 1);
  assert.deepEqual(indeterminateAudits, [
    { event: "created", operation: "additions", result: "prepared" },
    { event: "applying", operation: "additions", result: "started" },
    { event: "indeterminate", operation: "additions", result: "uncertain" },
  ]);
});

test("addition preparation accepts caller-selected line counts and rejects unknown availability", async () => {
  let basketReads = 0;
  const service = new BasketProposalService(fakeClient({
    getProduct: async (id) => ({ ...product, id, name: `Product ${id}` }),
    getCart: async () => { basketReads += 1; return emptyBasket(); },
  }));
  const items = Array.from({ length: 51 }, (_, index) => ({ product_id: index + 1, quantity: 1 }));
  assert.equal((await service.prepareAdditions("connection", items, { kind: "exact_review" })).review.lines instanceof Array, true);
  assert.equal(basketReads, 1);
  const unknownAvailability = new BasketProposalService(fakeClient({
    getProduct: async () => ({ ...product, available: undefined }),
  }));
  await assert.rejects(
    unknownAvailability.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" }),
    /availability could not be confirmed/u,
  );
});

test("addition preparation resolves every requested product through the bounded read pool", async () => {
  let active = 0;
  let maximum = 0;
  const starts: number[] = [];
  const service = new BasketProposalService(fakeClient({
    getProduct: async (id, signal) => new Promise((resolve, reject) => {
      starts.push(id);
      active += 1;
      maximum = Math.max(maximum, active);
      const timer = setTimeout(() => { active -= 1; resolve({ ...product, id }); }, 1);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        active -= 1;
        reject(signal.reason);
      }, { once: true });
    }),
  }));
  const items = Array.from({ length: 51 }, (_, index) => ({ product_id: index + 1, quantity: 1 }));
  const proposal = await service.prepareAdditions("connection", items, { kind: "exact_review" });
  assert.equal((proposal.review.lines as unknown[]).length, 51);
  assert.deepEqual(starts, items.map(({ product_id }) => product_id));
  assert.equal(maximum, 3);
  assert.equal(active, 0);
});

test("application revalidates basket and product details before any mutation", async () => {
  let basket = emptyBasket();
  let currentProduct = product;
  let mutations = 0;
  const service = new BasketProposalService(fakeClient({
    getCart: async () => basket,
    getFreshProduct: async () => currentProduct,
    addToCart: async () => { mutations += 1; return bananaBasket(); },
  }), { id: () => "00000000-0000-4000-8000-000000000008" });
  const changedBasketProposal = await service.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" });
  basket = { ...emptyBasket(), productsPrice: 1 };
  const basketError = await service.apply("connection", changedBasketProposal.proposal_id, "additions")
    .then(() => undefined, error => error);
  assert.equal(mutations, 0);
  assert.match(String(basketError), /Basket changed after review/);

  basket = emptyBasket();
  const changedProductProposal = await service.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" });
  currentProduct = { ...product, price: 3 };
  const productError = await service.apply("connection", changedProductProposal.proposal_id, "additions")
    .then(() => undefined, error => error);
  assert.equal(mutations, 0);
  assert.match(String(productError), /Product details changed after review/);
});

test("application uses reusable lookup for review and authoritative lookup for apply", async () => {
  let reusableReads = 0;
  let authoritativeReads = 0;
  const service = new BasketProposalService(fakeClient({
    getProduct: async () => { reusableReads += 1; return product; },
    getFreshProduct: async () => { authoritativeReads += 1; return product; },
  }), { id: () => "00000000-0000-4000-8000-000000000027" });
  const proposal = await service.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" });
  assert.deepEqual({ reusableReads, authoritativeReads }, { reusableReads: 1, authoritativeReads: 0 });
  await service.apply("connection", proposal.proposal_id, "additions");
  assert.deepEqual({ reusableReads, authoritativeReads }, { reusableReads: 1, authoritativeReads: 1 });
});

test("application checks every addition freshly before the first mutation", async () => {
  let mutations = 0;
  const freshIds: number[] = [];
  const service = new BasketProposalService(fakeClient({
    getFreshProduct: async (id) => {
      freshIds.push(id);
      if (id === 8) throw new Error("fresh lookup unavailable");
      return product;
    },
    addToCart: async () => { mutations += 1; return bananaBasket(); },
  }), { id: () => "00000000-0000-4000-8000-000000000028" });
  const proposal = await service.prepareAdditions("connection", [
    { product_id: 7, quantity: 1 },
    { product_id: 8, quantity: 1 },
  ], { kind: "exact_review" });
  await assert.rejects(
    service.apply("connection", proposal.proposal_id, "additions"),
    /could not be revalidated/,
  );
  assert.deepEqual(freshIds, [7, 8]);
  assert.equal(mutations, 0);
  await assert.rejects(service.apply("connection", proposal.proposal_id, "additions"), /no longer applicable/);
});

test("completed application is single-use, mutex-serialized, and replayed without another write", async () => {
  let writes = 0;
  const service = new BasketProposalService(fakeClient({
    addToCart: async () => {
      writes += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return bananaBasket();
    },
  }), { id: () => "00000000-0000-4000-8000-000000000009" });
  const proposal = await service.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" });
  const [first, second] = await Promise.all([
    service.apply("connection", proposal.proposal_id, "additions"),
    service.apply("connection", proposal.proposal_id, "additions"),
  ]);
  assert.equal(writes, 1);
  assert.deepEqual([first.replayed, second.replayed], [false, true]);
});

test("wrong-connection, expiry, restart, and indeterminate outcomes never write or retry", async () => {
  let now = new Date("2026-08-30T12:00:00Z");
  let writes = 0;
  const client = fakeClient({
    addToCart: async () => {
      writes += 1;
      throw new Error("readback lost");
    },
  });
  const service = new BasketProposalService(client, {
    now: () => now,
    id: () => "00000000-0000-4000-8000-000000000010",
    ttlMs: 1_000,
  });
  const proposal = await service.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" });
  await assert.rejects(service.apply("other", proposal.proposal_id, "additions"), /another connection/);
  assert.equal(writes, 0);
  now = new Date("2026-08-30T12:00:02Z");
  await assert.rejects(service.apply("connection", proposal.proposal_id, "additions"), /expired/);
  assert.equal(writes, 0);

  const live = new BasketProposalService(client, { id: () => "00000000-0000-4000-8000-000000000011" });
  const liveProposal = await live.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }], { kind: "exact_review" });
  await assert.rejects(live.apply("connection", liveProposal.proposal_id, "additions"), /may have changed/);
  await assert.rejects(live.apply("connection", liveProposal.proposal_id, "additions"), /no longer applicable/);
  assert.equal(writes, 1);

  const restarted = new BasketProposalService(client);
  await assert.rejects(restarted.apply("connection", liveProposal.proposal_id, "additions"), /not found/);
  assert.equal(writes, 1);
});

test("Ready submission preparation bypasses cached product facts", async () => {
  let freshReads = 0;
  const proposals = new BasketProposalService(fakeClient({
    getProduct: async () => { throw new Error("Cached facts must not prepare Ready submission"); },
    getFreshProduct: async () => { freshReads++; return { ...product, price: 3 }; },
  }));
  const review = await proposals.prepareAdditions("owner", [{ product_id: 7, quantity: 2 }], { kind: "exact_review" }, { freshProducts: true });
  assert.equal(freshReads, 1);
  assert.equal((review.review.lines as Array<{ item_price: number }>)[0]?.item_price, 3);
});
