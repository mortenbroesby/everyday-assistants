/**
 * The one forward-only viewer identity. It is deliberately stable: hosts may
 * cache a resource URI independently of tool metadata, so version churn makes
 * it easier to bind a current result to an obsolete card.
 */
export const PRODUCT_VIEWER_RESOURCE_URI = "ui://nemlig/shell.html";

/** Previously published identities remain readable, but never receive live shopping controls. */
export const RETIRED_PRODUCT_VIEWER_RESOURCE_URIS = [
  "ui://nemlig/draft-list.html",
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
  "ui://nemlig/product-viewer-v11.html",
  "ui://nemlig/product-viewer-v12.html",
  "ui://nemlig/product-viewer-v13.html",
  "ui://nemlig/product-viewer-v14.html",
  "ui://nemlig/product-viewer-v15.html",
  "ui://nemlig/product-viewer-v16.html",
] as const;
