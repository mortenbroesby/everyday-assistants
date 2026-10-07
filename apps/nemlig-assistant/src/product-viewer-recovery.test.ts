import assert from "node:assert/strict";
import test from "node:test";
import { renderProductViewerHtml } from "./product-viewer.js";

test("v8 build carries the interaction path exercised by the browser smoke", () => {
  const html = renderProductViewerHtml();
  for (const feature of ["Open current Draft list", "To decide", "Ready", "Choose alternative", "Prepare exact change", "Review exact change", "submit_product_review", "toolcancelled"]) {
    assert.ok(html.includes(feature), `built resource is missing ${feature}`);
  }
  assert.ok(!html.includes("Interactive local review is not implemented"), "candidate-only placeholder remains in the production resource");
});
