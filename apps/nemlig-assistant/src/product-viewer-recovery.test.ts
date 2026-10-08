import assert from "node:assert/strict";
import test from "node:test";
import { renderProductViewerHtml } from "./product-viewer.js";

test("viewer opens products directly, offers in-place refresh, and rejects obsolete widget actions", () => {
  const html = renderProductViewerHtml();
  for (const feature of ["This Draft list card is out of date", "This Draft list card is inactive", "Make this card current", "The current Draft list is shown read-only", "This temporary Draft list is no longer available", "Ask in chat", "What should we shop for?", "To decide", "Ready", "Choose alternative", "Review exact Nemlig change", "Add to Nemlig basket", "We could not verify the addition", "update_product_review", "submit_product_review", "toolcancelled"]) {
    assert.ok(html.includes(feature), `built resource is missing ${feature}`);
  }
  assert.ok(!html.includes("Interactive local review is not implemented"), "candidate-only placeholder remains in the production resource");
});
