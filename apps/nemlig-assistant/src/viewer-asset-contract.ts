declare const __NEMLIG_JOURNEY_BUILD__: boolean;

export const VIEWER_ASSET_ORIGIN =
  typeof __NEMLIG_JOURNEY_BUILD__ !== "undefined" && __NEMLIG_JOURNEY_BUILD__
    ? new URL(process.env.NEMLIG_MCP_PUBLIC_URL!).origin
    : "https://nemlig-mcp.broesby.dk";
export const VIEWER_MANIFEST_PATH = "/ui/nemlig/manifest.json";
export const VIEWER_MANIFEST_LIMIT = 16 * 1024;
export const VIEWER_GENERATION_RAW_LIMIT = 1_500_000;
export const VIEWER_GENERATION_GZIP_LIMIT = 350_000;
