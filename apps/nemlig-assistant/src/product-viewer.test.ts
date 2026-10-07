import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import type { ProductView } from "./product-presentation.js";
import {
  PRODUCT_VIEWER_MIME_TYPE,
  PRODUCT_VIEWER_RESOURCE_METADATA,
  PRODUCT_VIEWER_RESOURCE_URI,
  productViewsToText,
  renderProductViewerHtml,
} from "./product-viewer.js";

const complete: ProductView = {
  context: "review", status: "complete", product: {
    id: 7, name: "Mælk", price: 12, unit_price: 12, unit: "12 kr/l", unit_size: "1 l",
    currency: "DKK", brand: "Fresh", available: true, is_organic: false, is_frozen: false,
    is_on_discount: false, image_url: undefined, labels: [], tags: [], details: [{ key: "Fat", value: "1.5%" }],
  }, review: { kind: "review", quantity: 2, approved: false },
};

test("stable viewer identity and complete headless fallback stay in sync", () => {
  assert.equal(PRODUCT_VIEWER_RESOURCE_URI, "ui://nemlig/product-viewer.html");
  assert.equal(PRODUCT_VIEWER_MIME_TYPE, "text/html;profile=mcp-app");
  assert.deepEqual(PRODUCT_VIEWER_RESOURCE_METADATA, {
    ui: { resourceUri: PRODUCT_VIEWER_RESOURCE_URI },
    "openai/outputTemplate": PRODUCT_VIEWER_RESOURCE_URI,
  });
  const text = productViewsToText([complete]);
  for (const fact of ["Mælk", "Fresh", "approved no", "12 kr/l", "Fat: 1.5%", "draft list quantity 2"]) assert.match(text, new RegExp(fact, "u"));
  assert.match(productViewsToText([{ context: "search", status: "unavailable", product_id: 9 }]), /9/u);
  assert.equal(productViewsToText([]), "No products found.");
});

test("served resource is the bounded self-contained React build", () => {
  const html = renderProductViewerHtml();
  assert.match(html, /<html lang="en">/u);
  assert.match(html, /Your Nemlig Draft list/u);
  assert.match(html, /react-dom/u);
  assert.doesNotMatch(html, /<script\s+src=/u);
  assert.doesNotMatch(html, /<link[^>]+rel=["']?stylesheet/u);
  assert.doesNotMatch(html, /\bfetch\s*\(/u);
  assert.ok(Buffer.byteLength(html) <= 1_500_000, "viewer exceeds its project raw-size budget");
  assert.ok(gzipSync(html).byteLength <= 350_000, "viewer exceeds its project gzip-size budget");
});
