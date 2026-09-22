import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "./client.js";
import { createProductView } from "./product-presentation.js";

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 7, name: "Mælk", price: 12, unit: "12 kr/l", unitPrice: 12, unitSize: "1 l", brand: "Test",
  category: "Køl", subcategory: "Mælk", imageUrl: "https://nemlig.com/images/milk.jpg", available: true,
  labels: [], isOrganic: false, isFrozen: false, isRefrigerated: true, isDairy: true,
  isLactoseFree: false, isGlutenFree: false, isVegan: false, isOnDiscount: false, ...overrides,
});

test("shared product view carries context without creating a second product or basket model", () => {
  const view = createProductView(product(), { kind: "review", quantity: 2, line_total: 24, approved: false });

  assert.equal(view.status, "complete");
  assert.equal(view.context, "review");
  if (view.status !== "complete") return;
  assert.equal(view.product.id, 7);
  assert.deepEqual(view.review, { kind: "review", quantity: 2, line_total: 24, approved: false });
  assert.equal("basket" in view, false);
});

test("shared product view sanitizes images and represents detail failures explicitly", () => {
  const unsafe = createProductView(product({ imageUrl: "https://tracking.example.test/image" }), { kind: "search" });
  assert.equal(unsafe.status, "complete");
  if (unsafe.status === "complete") assert.equal(unsafe.product.image_url, undefined);

  const unavailable = createProductView({ status: "unavailable", productId: 9 }, { kind: "search" });
  assert.deepEqual(unavailable, { context: "search", status: "unavailable", product_id: 9 });
});

test("shared product view never needs a provider client for rendering", () => {
  const invalid = createProductView({ status: "invalid", productId: undefined }, { kind: "result" });
  assert.deepEqual(invalid, { context: "result", status: "unavailable" });
});
