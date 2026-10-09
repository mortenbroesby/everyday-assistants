import assert from "node:assert/strict";
import test from "node:test";
import { RETIRED_PRODUCT_VIEWER_RESOURCE_URIS } from "./product-viewer-identity.js";
import { renderRetiredProductViewerHtml } from "./retired-product-viewer.js";

test("retired viewer identities cover every previously published viewer URI", () => {
  assert.deepEqual(RETIRED_PRODUCT_VIEWER_RESOURCE_URIS, [
    "ui://nemlig/product-viewer.html",
    ...Array.from(
      { length: 16 },
      (_, index) => `ui://nemlig/product-viewer-v${index + 1}.html`,
    ),
  ]);
});

test("retired viewer is inert and directs users to the current selection", () => {
  const html = renderRetiredProductViewerHtml();
  assert.match(html, /out of date/u);
  assert.match(html, /read-only/u);
  assert.match(html, /current selection/u);
  assert.doesNotMatch(
    html,
    /<button|sendFollowUpMessage|ui\/message|tools\/call|callTool|hydrate|fetch\(/u,
  );
});
