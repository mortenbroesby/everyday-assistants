import assert from "node:assert/strict";
import test from "node:test";
import { RETIRED_PRODUCT_VIEWER_RESOURCE_URIS } from "./product-viewer-identity.js";
import { renderRetiredProductViewerHtml } from "./retired-product-viewer.js";

test("retired viewer identities cover the stable and previous versioned URIs", () => {
  assert.deepEqual(RETIRED_PRODUCT_VIEWER_RESOURCE_URIS, [
    "ui://nemlig/product-viewer.html",
    "ui://nemlig/product-viewer-v1.html",
    "ui://nemlig/product-viewer-v2.html",
    "ui://nemlig/product-viewer-v3.html",
    "ui://nemlig/product-viewer-v4.html",
    "ui://nemlig/product-viewer-v5.html",
    "ui://nemlig/product-viewer-v6.html",
    "ui://nemlig/product-viewer-v7.html",
    "ui://nemlig/product-viewer-v8.html",
    "ui://nemlig/product-viewer-v9.html",
    "ui://nemlig/product-viewer-v10.html",
  ]);
});

test("retired viewer is inert and leaves recovery to the conversation", () => {
  const html = renderRetiredProductViewerHtml();
  assert.match(html, /This Draft list card is out of date/u);
  assert.match(html, /read-only/u);
  assert.doesNotMatch(html, /<button|sendFollowUpMessage|ui\/message/u);
  assert.doesNotMatch(html, /tools\/call|callTool|hydrate|fetch\(/u);
});
