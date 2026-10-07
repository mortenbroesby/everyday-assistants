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
  ]);
});

test("retired viewer is inert and offers a conversation route to the current draft list", () => {
  const html = renderRetiredProductViewerHtml();
  assert.match(html, /This draft list card is retired/u);
  assert.match(html, /Open current draft list/u);
  assert.match(html, /ui\/message/u);
  assert.match(html, /sendFollowUpMessage/u);
  assert.match(html, /Open my current Draft list/u);
  assert.doesNotMatch(html, /tools\/call|callTool|hydrate|fetch\(/u);
});
