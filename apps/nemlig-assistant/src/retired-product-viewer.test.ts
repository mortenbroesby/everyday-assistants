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
  ]);
});

test("retired viewer is inert and offers a conversation route to the current review", () => {
  const html = renderRetiredProductViewerHtml();
  assert.match(html, /This review card is retired/u);
  assert.match(html, /Open the current review/u);
  assert.match(html, /ui\/message/u);
  assert.match(html, /sendFollowUpMessage/u);
  assert.match(html, /Open my current local shopping review/u);
  assert.doesNotMatch(html, /tools\/call|callTool|hydrate|fetch\(|Nemlig/u);
});
