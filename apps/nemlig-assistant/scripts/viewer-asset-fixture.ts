import type { Server } from "node:http";
import type { BrowserContext, Route } from "playwright";
import {
  VIEWER_ASSET_ORIGIN,
  VIEWER_MANIFEST_PATH,
  type ViewerGeneration,
} from "../src/viewer-assets.js";

const manifestPath = VIEWER_MANIFEST_PATH;

export async function closeViewerSmokeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

export interface ViewerAssetOverride {
  status?: number;
  body?: string | Uint8Array;
  delayMs?: number;
}

const allowsAssetRequest = (
  url: URL,
  paths: ReadonlySet<string>,
  overrides: ReadonlyMap<string, ViewerAssetOverride>,
): boolean =>
  url.origin === VIEWER_ASSET_ORIGIN &&
  (paths.has(url.pathname) || overrides.has(url.pathname));

const responseStatus = (
  override: ViewerAssetOverride | undefined,
  body: string | Uint8Array | undefined,
): number => override?.status ?? (body ? 200 : 404);

const responseHeaders = (pathname: string) => ({
  "access-control-allow-origin": "*",
  "cache-control":
    pathname === manifestPath
      ? "no-store"
      : "public, max-age=31536000, immutable",
  "content-type":
    pathname === manifestPath
      ? "application/json; charset=utf-8"
      : pathname.endsWith(".js")
        ? "text/javascript; charset=utf-8"
        : "text/css; charset=utf-8",
});

interface ViewerAssetRouteState {
  manifest: Buffer;
  bodies: Map<string, Uint8Array>;
  paths: Set<string>;
  overrides: ReadonlyMap<string, ViewerAssetOverride>;
  externalRequests: string[];
}

const serveViewerAsset = async (
  route: Route,
  url: URL,
  state: ViewerAssetRouteState,
): Promise<void> => {
  const override = state.overrides.get(url.pathname);
  if (override?.delayMs) {
    await new Promise((resolve) => setTimeout(resolve, override.delayMs));
  }
  const body =
    override?.body ??
    (url.pathname === manifestPath
      ? state.manifest
      : state.bodies.get(url.pathname));
  const status = responseStatus(override, body);
  await route.fulfill({
    status,
    body: body ?? "missing",
    ...(status === 200 && body
      ? { headers: responseHeaders(url.pathname) }
      : {}),
  });
};

const routeViewerAsset = async (
  route: Route,
  state: ViewerAssetRouteState,
): Promise<void> => {
  const requestUrl = route.request().url();
  if (requestUrl.startsWith("http://127.0.0.1:")) {
    await route.continue();
    return;
  }
  const url = new URL(requestUrl);
  if (!allowsAssetRequest(url, state.paths, state.overrides)) {
    state.externalRequests.push(url.href);
    await route.abort();
    return;
  }
  await serveViewerAsset(route, url, state);
};

export async function installViewerAssetFixture(
  context: BrowserContext,
  generation: ViewerGeneration,
  overrides: ReadonlyMap<string, ViewerAssetOverride> = new Map(),
): Promise<string[]> {
  const manifest = Buffer.from(`${JSON.stringify(generation.manifest)}\n`);
  const bodies = new Map(generation.assets);
  const paths = new Set([manifestPath, ...bodies.keys()]);
  const externalRequests: string[] = [];
  await context.route("**/*", (route) =>
    routeViewerAsset(route, {
      manifest,
      bodies,
      paths,
      overrides,
      externalRequests,
    }),
  );
  return externalRequests;
}
