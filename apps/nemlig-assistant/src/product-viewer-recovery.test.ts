import assert from "node:assert/strict";
import test from "node:test";
import { renderProductViewerHtml } from "./product-viewer.js";

test("v10 build opens products directly and rejects obsolete widget actions", () => {
  const html = renderProductViewerHtml();
  for (const feature of ["This Draft list card is out of date", "To decide", "Ready", "Choose alternative", "Prepare exact change", "Review exact change", "update_product_review", "submit_product_review", "toolcancelled"]) {
    assert.ok(html.includes(feature), `built resource is missing ${feature}`);
  }
  assert.ok(!html.includes("Open current Draft list"), "new cards still require a click before showing products");
  assert.ok(!html.includes("Interactive local review is not implemented"), "candidate-only placeholder remains in the production resource");
});
