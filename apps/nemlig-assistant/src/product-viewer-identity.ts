/**
 * Versioned MCP Apps resource identity shared by the viewer and the edge
 * allow-list. Hosts may cache an MCP Apps resource by URI across an already-
 * open conversation, so reusing the old stable URI can pair a fresh tool
 * result with stale viewer JavaScript after a deployment. Bump this version
 * whenever the self-contained viewer changes.
 *
 * Keep this module renderer-free so the Cloudflare gateway does not bundle the
 * self-contained browser program merely to validate a resource URI.
 */
export const PRODUCT_VIEWER_RESOURCE_VERSION = "10";
export const PRODUCT_VIEWER_RESOURCE_URI = `ui://nemlig/product-viewer-v${PRODUCT_VIEWER_RESOURCE_VERSION}.html`;

/** Previously published identities stay readable so cached clients get a safe migration page. */
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
] as const;
