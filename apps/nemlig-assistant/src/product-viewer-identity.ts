/**
 * Hosts can cache an MCP Apps resource by URI independently of the tool
 * metadata. Bump this identity whenever the self-contained viewer changes so
 * a new card cannot pair a current tool result with stale viewer JavaScript.
 */
export const PRODUCT_VIEWER_RESOURCE_VERSION = "14";
export const PRODUCT_VIEWER_RESOURCE_URI = `ui://nemlig/product-viewer-v${PRODUCT_VIEWER_RESOURCE_VERSION}.html`;

/** Previously published identities remain readable, but never receive live shopping controls. */
export const RETIRED_PRODUCT_VIEWER_RESOURCE_URIS = [
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
] as const;
