import assert from "node:assert/strict";
import test from "node:test";
import { renderProductViewerHtml } from "./product-viewer.js";

test("stable viewer shell loads the current same-origin bundle and fails safely", () => {
  const html = renderProductViewerHtml();
  for (const feature of [
    "nemlig-viewer-shell",
    "/ui/nemlig/manifest.json",
    "Loading the current Local basket",
    "Nothing has been changed",
    "Try again",
  ]) {
    assert.ok(html.includes(feature), `built resource is missing ${feature}`);
  }
  assert.doesNotMatch(html, /submit_product_review|update_product_review/u);
});
