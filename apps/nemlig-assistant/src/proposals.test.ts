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

const replacementProduct: Product = {
  ...product,
  id: 8,
  name: "Økologisk banan",
  price: 2,
  unit: "2,00 kr/stk.",
  unitPrice: 2,
  unitSize: "1 stk.",
  labels: ["Frugt", "Øko"],
  isOrganic: true,
  isOnDiscount: true,
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

const replacementBasket = (oldQuantity = 1, replacementQuantity = 0): Basket => {
  const items: Basket["items"] = [
    { id: 7, name: product.name, quantity: oldQuantity, total: 2.5 * oldQuantity },
  ];
  if (replacementQuantity) {
    items.push({
      id: 8,
      name: replacementProduct.name,
      quantity: replacementQuantity,
      total: 2 * replacementQuantity,
    });
  }
  return {
    items,
    productsPrice: 2.5 * oldQuantity + 2 * replacementQuantity,
    deliveryPrice: 0,
    numberOfProducts: oldQuantity + replacementQuantity,
    deliveryTime: undefined,
  };
};

type ProposalClient = Pick<
  ShoppingClient,
  "getProduct" | "getCart" | "addToCart" | "removeFromCart" | "clearCart"
>;

const fakeClient = (overrides: Partial<ProposalClient> = {}): ProposalClient => ({
  getProduct: async (id) => id === 8 ? replacementProduct : product,
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

test("replacement preparation reviews exact net basket savings without mutation", async () => {
  let mutations = 0;
  let basket = replacementBasket();
  const service = new BasketProposalService(fakeClient({
    getCart: async () => basket,
    addToCart: async () => { mutations += 1; return basket; },
    removeFromCart: async () => { mutations += 1; return basket; },
  }), { id: () => "00000000-0000-4000-8000-000000000020" });

  const proposal = await service.prepareReplacement("connection", 7, 8, 1);
  assert.equal(proposal.applicable, true);
  if (!proposal.applicable) return;
  assert.equal(proposal.operation, "replacement");
  assert.deepEqual(proposal.review, {
    current_line: {
      product_id: 7, name: "Banan", unit: "2,50 kr/stk.", unit_size: "1 stk.", quantity: 1,
      available: true, item_price: 2.5, unit_price: 2.5, line_total: 2.5, labels: ["Frugt"],
    },
    replacement_line: {
      product_id: 8, name: "Økologisk banan", unit: "2,00 kr/stk.", unit_size: "1 stk.", quantity: 1,
      available: true, item_price: 2, unit_price: 2, line_total: 2, labels: ["Frugt", "Øko"],
    },
    existing_replacement_line: null,
    current_products_price: 2.5,
    expected_products_price: 2,
    expected_number_of_products: 1,
    price_difference: 0.5,
    potential_savings: 0.5,
  });
  assert.equal(mutations, 0);

  basket = replacementBasket(1, 1);
  const existing = await service.prepareReplacement("connection", 7, 8, 2);
  assert.equal(existing.applicable, true);
  if (!existing.applicable) return;
  assert.deepEqual(existing.review.existing_replacement_line, basket.items[1]);
  assert.equal(existing.review.expected_products_price, 4);
  assert.equal(existing.review.price_difference, 0.5);

  await assert.rejects(service.prepareReplacement("connection", 7, 7, 1), /must differ/);
  assert.equal((await service.prepareReplacement("connection", 99, 8, 1)).applicable, false);
  await assert.rejects(service.prepareReplacement("connection", 7, 8, 0), /quantity must be positive/);
  const unavailable = new BasketProposalService(fakeClient({
    getCart: async () => replacementBasket(),
    getProduct: async (id) => id === 8 ? { ...replacementProduct, available: false } : product,
  }));
  await assert.rejects(unavailable.prepareReplacement("connection", 7, 8, 1), /unavailable/);
  const incomplete = new BasketProposalService(fakeClient({
    getCart: async () => replacementBasket(),
    getProduct: async (id) => id === 8 ? { ...replacementProduct, price: undefined } : product,
  }));
  await assert.rejects(incomplete.prepareReplacement("connection", 7, 8, 1), /incomplete/);
  assert.equal(mutations, 0);
});

test("replacement application adds and verifies before removing, then replays without writes", async () => {
  let basket = replacementBasket();
  const calls: string[] = [];
  const service = new BasketProposalService(fakeClient({
    getCart: async () => basket,
    addToCart: async (id, quantity) => {
      calls.push(`add:${id}:${quantity}`);
      basket = {
        items: [...replacementBasket().items, { id: 8, name: replacementProduct.name, quantity, total: 2 * (quantity ?? 1) }],
        productsPrice: 2.5 + 2 * (quantity ?? 1), deliveryPrice: 0,
        numberOfProducts: 1 + (quantity ?? 1), deliveryTime: undefined,
      };
      return basket;
    },
    removeFromCart: async (id) => {
      calls.push(`remove:${id}`);
      basket = {
        ...basket,
        items: basket.items.filter((item) => item.id !== id),
        productsPrice: 4,
        numberOfProducts: 2,
      };
      return basket;
    },
  }), { id: () => "00000000-0000-4000-8000-000000000021" });
  const proposal = await service.prepareReplacement("connection", 7, 8, 2);
  assert.equal(proposal.applicable, true);
  if (!proposal.applicable) return;
  const result = await service.apply("connection", proposal.proposal_id, "replacement");
  assert.deepEqual(calls, ["add:8:2", "remove:7"]);
  assert.equal(result.operation, "replacement");
  assert.equal(result.basket.products_price, 4);
  assert.equal((await service.apply("connection", proposal.proposal_id, "replacement")).replayed, true);
  assert.deepEqual(calls, ["add:8:2", "remove:7"]);
});

test("replacement failures stop, consume the proposal, and never compensate or retry", async () => {
  const prepare = async (overrides: Partial<ProposalClient> = {}, options = {}) => {
    let basket = replacementBasket();
    let adds = 0;
    let removes = 0;
    const service = new BasketProposalService(fakeClient({
      getCart: async () => basket,
      addToCart: async (_id, quantity) => {
        adds += 1;
        basket = {
          items: [...replacementBasket().items, { id: 8, name: replacementProduct.name, quantity, total: 2 * (quantity ?? 1) }],
          productsPrice: 2.5 + 2 * (quantity ?? 1),
          deliveryPrice: 0,
          numberOfProducts: 1 + (quantity ?? 1),
          deliveryTime: undefined,
        };
        return basket;
      },
      removeFromCart: async () => {
        removes += 1;
        basket = {
          ...basket,
          items: basket.items.filter((item) => item.id !== 7),
          productsPrice: 2,
          numberOfProducts: 1,
        };
        return basket;
      },
      ...overrides,
    }), { id: () => "00000000-0000-4000-8000-000000000022", ...options });
    const proposal = await service.prepareReplacement("connection", 7, 8, 1);
    assert.equal(proposal.applicable, true);
    if (!proposal.applicable) throw new Error("expected proposal");
    return { service, proposal, counts: () => ({ adds, removes }), setBasket: (value: Basket) => { basket = value; } };
  };

  const addMismatch = await prepare({ addToCart: async () => replacementBasket() });
  await assert.rejects(addMismatch.service.apply("connection", addMismatch.proposal.proposal_id, "replacement"), /old product was not intentionally removed/);
  await assert.rejects(addMismatch.service.apply("connection", addMismatch.proposal.proposal_id, "replacement"), /no longer applicable/);
  assert.equal(addMismatch.counts().removes, 0);

  const addFailure = await prepare({ addToCart: async () => { throw new Error("upstream add failed"); } });
  await assert.rejects(addFailure.service.apply("connection", addFailure.proposal.proposal_id, "replacement"), /old product was not intentionally removed/);
  assert.equal(addFailure.counts().removes, 0);

  const removalMismatch = await prepare({
    removeFromCart: async () => ({
      items: [...replacementBasket().items, { id: 8, name: replacementProduct.name, quantity: 1, total: 2 }],
      productsPrice: 4.5, deliveryPrice: 0, numberOfProducts: 2, deliveryTime: undefined,
    }),
  });
  await assert.rejects(removalMismatch.service.apply("connection", removalMismatch.proposal.proposal_id, "replacement"), /old product may remain/);

  const removalFailure = await prepare({ removeFromCart: async () => { throw new Error("upstream removal failed"); } });
  await assert.rejects(removalFailure.service.apply("connection", removalFailure.proposal.proposal_id, "replacement"), /old product may remain/);

  const drift = await prepare();
  drift.setBasket({ ...replacementBasket(), productsPrice: 99 });
  await assert.rejects(drift.service.apply("connection", drift.proposal.proposal_id, "replacement"), /Basket changed/);
  assert.deepEqual(drift.counts(), { adds: 0, removes: 0 });

  let replacement = replacementProduct;
  const productDrift = await prepare({ getProduct: async (id) => id === 8 ? replacement : product });
  replacement = { ...replacementProduct, price: 3 };
  await assert.rejects(productDrift.service.apply("connection", productDrift.proposal.proposal_id, "replacement"), /details changed/);
  assert.deepEqual(productDrift.counts(), { adds: 0, removes: 0 });

  let now = new Date("2026-08-31T10:00:00Z");
  const expired = await prepare({}, { now: () => now, ttlMs: 1 });
  await assert.rejects(expired.service.apply("other", expired.proposal.proposal_id, "replacement"), /another connection/);
  now = new Date("2026-08-31T10:00:01Z");
  await assert.rejects(expired.service.apply("connection", expired.proposal.proposal_id, "replacement"), /expired/);
  assert.deepEqual(expired.counts(), { adds: 0, removes: 0 });
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
