import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserContext, Route } from "playwright";
import {
  createViewerGeneration,
  VIEWER_ASSET_ORIGIN,
  VIEWER_MANIFEST_PATH,
} from "./viewer-assets.js";
import {
  installViewerAssetFixture,
  type ViewerAssetOverride,
} from "../scripts/viewer-asset-fixture.js";

type FulfilledResponse = {
  status: number;
  body: string | Uint8Array;
  headers?: Record<string, string>;
};

async function createFixture(
  overrides = new Map<string, ViewerAssetOverride>(),
) {
  const generation = createViewerGeneration(
    Buffer.from("export {};"),
    Buffer.from("body {}"),
  );
  let handleRoute: ((route: Route) => Promise<void>) | undefined;
  const context = {
    route: async (_url: string, handler: typeof handleRoute) => {
      handleRoute = handler;
    },
  } as unknown as BrowserContext;
  const externalRequests = await installViewerAssetFixture(
    context,
    generation,
    overrides,
  );
  assert.ok(handleRoute);
  const request = async (url: string) => {
    let action: "continued" | "aborted" | "fulfilled" | undefined;
    let response: FulfilledResponse | undefined;
    await handleRoute!({
      request: () => ({ url: () => url }),
      continue: async () => {
        action = "continued";
      },
      abort: async () => {
        action = "aborted";
      },
      fulfill: async (value: FulfilledResponse) => {
        action = "fulfilled";
        response = value;
      },
    } as unknown as Route);
    return { action, response };
  };
  return { generation, externalRequests, request };
}

test("viewer asset fixture serves local assets and rejects unrelated requests", async () => {
  const fixture = await createFixture();
  assert.deepEqual(await fixture.request("http://127.0.0.1:8080/host"), {
    action: "continued",
    response: undefined,
  });
  const manifest = await fixture.request(
    `${VIEWER_ASSET_ORIGIN}${VIEWER_MANIFEST_PATH}`,
  );
  assert.equal(manifest.action, "fulfilled");
  assert.equal(manifest.response?.status, 200);
  assert.equal(manifest.response?.headers?.["cache-control"], "no-store");
  assert.equal(
    Buffer.from(manifest.response?.body ?? "").toString(),
    `${JSON.stringify(fixture.generation.manifest)}\n`,
  );
  const external = await fixture.request("https://example.test/unrelated");
  assert.equal(external.action, "aborted");
  assert.deepEqual(fixture.externalRequests, [
    "https://example.test/unrelated",
  ]);
});

test("viewer asset fixture injects explicit response failures", async () => {
  const fixture = await createFixture(
    new Map([["/ui/nemlig/missing.js", { status: 503, body: "offline" }]]),
  );
  const failure = await fixture.request(
    `${VIEWER_ASSET_ORIGIN}/ui/nemlig/missing.js`,
  );
  assert.equal(failure.action, "fulfilled");
  assert.equal(failure.response?.status, 503);
  assert.equal(failure.response?.body, "offline");
  assert.equal(failure.response?.headers, undefined);
});
