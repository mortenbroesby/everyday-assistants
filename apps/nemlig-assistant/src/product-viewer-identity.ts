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
export const PRODUCT_VIEWER_RESOURCE_VERSION = "3";
export const PRODUCT_VIEWER_RESOURCE_URI = `ui://nemlig/product-viewer-v${PRODUCT_VIEWER_RESOURCE_VERSION}.html`;
