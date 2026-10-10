import assert from "node:assert/strict";
import test from "node:test";
import type { ProductView } from "../../product-presentation.js";
import type { Review } from "../viewer-page.js";
import {
  alternativesFor,
  removeItem,
  replaceWithAlternative,
  updateQuantity,
} from "./visual-contract.fixture.js";

const milk: ProductView = {
  context: "review",
  status: "complete",
  product: {
    id: 1,
    name: "Milk",
    brand: "Fixture",
    price: 10,
    unit_price: 10,
    unit: "kr/L",
    unit_size: "1 L",
    currency: "DKK",
    image_url: undefined,
    available: true,
    is_organic: false,
    is_frozen: false,
    is_on_discount: false,
    labels: [],
    tags: [],
  },
};
const oats: ProductView = {
  context: "review",
  status: "complete",
  product: {
    id: 3,
    name: "Oats",
    brand: "Fixture",
    price: 10,
    unit_price: 10,
    unit: "kr/L",
    unit_size: "1 L",
    currency: "DKK",
    image_url: undefined,
    available: true,
    is_organic: false,
    is_frozen: false,
    is_on_discount: false,
    labels: [],
    tags: [],
  },
};
const preparedReview = (): Review => ({
  destination: "ready",
  items: [{ product_id: 1, quantity: 2, state: "ready", view: milk }],
  alternatives: { product_id: 1, query: "oats", views: [oats] },
  submission: {
    status: "prepared",
    submission_id: "storybook-submission",
    review: { lines: [], expected_products_price: 20 },
  },
});

test("fixture quantity and removal edits invalidate a prepared submission", () => {
  assert.equal(updateQuantity(preparedReview(), 1, 3).submission, undefined);
  assert.equal(removeItem(preparedReview(), 1).submission, undefined);
});

test("fixture replacement preserves quantity, changes identity, and can reopen alternatives", () => {
  const replaced = replaceWithAlternative(preparedReview(), 1, 3);
  assert.equal(replaced.submission, undefined);
  assert.equal(replaced.alternatives, undefined);
  assert.deepEqual(replaced.items[0], {
    product_id: 3,
    quantity: 2,
    state: "ready",
    view: oats,
  });

  assert.deepEqual(alternativesFor(replaced, 3, "milk", [milk]).alternatives, {
    product_id: 3,
    query: "milk",
    views: [milk],
  });
});
