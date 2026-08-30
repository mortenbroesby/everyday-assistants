import assert from "node:assert/strict";
import test from "node:test";
import type { Basket, Product } from "./client.js";
import type { ShoppingClient } from "./cli.js";
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
  "getProduct" | "getCart" | "addToCart" | "removeFromCart" | "clearCart"
>;

const fakeClient = (overrides: Partial<ProposalClient> = {}): ProposalClient => ({
  getProduct: async () => product,
  getCart: async () => emptyBasket(),
  addToCart: async (_id, quantity = 1) => bananaBasket(quantity),
  removeFromCart: async () => emptyBasket(),
  clearCart: async () => emptyBasket(),
  ...overrides,
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
      ttlMs: 60_000,
      audit: (event) => audits.push(event),
    },
  );
  const proposal = await service.prepareAdditions("private-connection", [{ product_id: 7, quantity: 2 }]);
  assert.equal(proposal.expires_at, "2026-08-30T12:01:00.000Z");
  assert.equal(proposal.connection_bound, true);
  assert.doesNotMatch(JSON.stringify(proposal), /private-connection/);
  assert.deepEqual(proposal.review, {
    lines: [{
      product_id: 7,
      name: "Banan",
      unit_size: "1 stk.",
      quantity: 2,
      available: true,
      unit_price: 2.5,
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

test("application revalidates basket and product details before any mutation", async () => {
  let basket = emptyBasket();
  let currentProduct = product;
  let mutations = 0;
  const service = new BasketProposalService(fakeClient({
    getCart: async () => basket,
    getProduct: async () => currentProduct,
    addToCart: async () => { mutations += 1; return bananaBasket(); },
  }), { id: () => "00000000-0000-4000-8000-000000000008" });
  const changedBasketProposal = await service.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }]);
  basket = { ...emptyBasket(), productsPrice: 1 };
  await assert.rejects(
    service.apply("connection", changedBasketProposal.proposal_id, "additions"),
    /Basket changed after review/,
  );
  assert.equal(mutations, 0);

  basket = emptyBasket();
  const changedProductProposal = await service.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }]);
  currentProduct = { ...product, price: 3 };
  await assert.rejects(
    service.apply("connection", changedProductProposal.proposal_id, "additions"),
    /Product details changed after review/,
  );
  assert.equal(mutations, 0);
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
  const proposal = await service.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }]);
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
  const proposal = await service.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }]);
  await assert.rejects(service.apply("other", proposal.proposal_id, "additions"), /another connection/);
  assert.equal(writes, 0);
  now = new Date("2026-08-30T12:00:02Z");
  await assert.rejects(service.apply("connection", proposal.proposal_id, "additions"), /expired/);
  assert.equal(writes, 0);

  const live = new BasketProposalService(client, { id: () => "00000000-0000-4000-8000-000000000011" });
  const liveProposal = await live.prepareAdditions("connection", [{ product_id: 7, quantity: 1 }]);
  await assert.rejects(live.apply("connection", liveProposal.proposal_id, "additions"), /may have changed/);
  await assert.rejects(live.apply("connection", liveProposal.proposal_id, "additions"), /no longer applicable/);
  assert.equal(writes, 1);

  const restarted = new BasketProposalService(client);
  await assert.rejects(restarted.apply("connection", liveProposal.proposal_id, "additions"), /not found/);
  assert.equal(writes, 1);
});

test("one-line removal and clear prepare no-ops or apply only their exact reviewed operation", async () => {
  let basket = emptyBasket();
  let removes = 0;
  let clears = 0;
  const service = new BasketProposalService(fakeClient({
    getCart: async () => basket,
    removeFromCart: async () => { removes += 1; basket = emptyBasket(); return basket; },
    clearCart: async () => { clears += 1; basket = emptyBasket(); return basket; },
  }), { id: (() => { let id = 11; return () => `00000000-0000-4000-8000-${String(id++).padStart(12, "0")}`; })() });

  assert.equal((await service.prepareRemoval("connection", 7)).applicable, false);
  assert.equal((await service.prepareClear("connection")).applicable, false);

  basket = bananaBasket();
  const removal = await service.prepareRemoval("connection", 7);
  assert.equal(removal.applicable, true);
  if (!removal.applicable) return;
  const removed = await service.apply("connection", removal.proposal_id, "removal");
  assert.equal(removed.operation, "removal");
  assert.equal(removes, 1);
  assert.equal(clears, 0);

  basket = bananaBasket();
  const clear = await service.prepareClear("connection");
  assert.equal(clear.applicable, true);
  if (!clear.applicable) return;
  const cleared = await service.apply("connection", clear.proposal_id, "clear");
  assert.equal(cleared.operation, "clear");
  assert.equal(clears, 1);
});
