import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { z } from "zod";
import {
  VIEWER_ASSET_ORIGIN,
  VIEWER_GENERATION_GZIP_LIMIT,
  VIEWER_GENERATION_RAW_LIMIT,
  VIEWER_MANIFEST_LIMIT,
  VIEWER_MANIFEST_PATH,
} from "./viewer-asset-contract.js";

export {
  VIEWER_ASSET_ORIGIN,
  VIEWER_GENERATION_GZIP_LIMIT,
  VIEWER_GENERATION_RAW_LIMIT,
  VIEWER_MANIFEST_PATH,
};

const sha256Hex = /^[a-f0-9]{64}$/u;
const sha256Sri = /^sha256-([A-Za-z0-9+/]{43}=)$/u;

const assetSchema = (extension: "js" | "css") =>
  z
    .object({
      url: z
        .string()
        .regex(
          new RegExp(`^/ui/nemlig/assets/([a-f0-9]{64})\\.${extension}$`, "u"),
        ),
      integrity: z.string().regex(sha256Sri),
    })
    .strict()
    .superRefine(({ url, integrity }, context) => {
      const match = /\/assets\/([a-f0-9]{64})\./u.exec(url);
      const encoded = sha256Sri.exec(integrity)?.[1];
      const bytes = encoded ? Buffer.from(encoded, "base64") : undefined;
      if (
        !match ||
        !encoded ||
        bytes?.byteLength !== 32 ||
        bytes.toString("base64") !== encoded ||
        bytes.toString("hex") !== match[1]
      ) {
        context.addIssue({
          code: "custom",
          message: "Invalid viewer asset digest",
        });
      }
    });

const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const viewerAssetManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    build: z.string().regex(sha256Hex),
    js: assetSchema("js"),
    css: assetSchema("css"),
  })
  .strict()
  .superRefine(({ build, js, css }, context) => {
    if (build !== digest(`${js.integrity}\n${css.integrity}`)) {
      context.addIssue({
        code: "custom",
        message: "Invalid viewer build digest",
      });
    }
  });

export type ViewerAssetManifest = z.infer<typeof viewerAssetManifestSchema>;

export interface ViewerGeneration {
  readonly manifest: ViewerAssetManifest;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}

export function parseViewerManifest(bytes: Uint8Array): ViewerAssetManifest {
  if (bytes.byteLength > VIEWER_MANIFEST_LIMIT) {
    throw new Error("Viewer manifest exceeds its byte limit");
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("Viewer manifest is invalid");
  }
  const result = viewerAssetManifestSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Viewer manifest is invalid");
  }
  return result.data;
}

export function createViewerGeneration(
  javascript: Uint8Array,
  stylesheet: Uint8Array,
): ViewerGeneration {
  const javascriptWithGuard = Buffer.concat([
    Buffer.from(
      'if(new URL(import.meta.url).searchParams.get("attempt")!==window.__nemligViewerAttempt)throw Error("Stale viewer bundle");\n',
    ),
    javascript,
  ]);
  const asset = (
    bytes: Uint8Array,
    extension: "js" | "css",
  ): { url: string; integrity: string } => {
    const sha = createHash("sha256").update(bytes).digest();
    return {
      url: `/ui/nemlig/assets/${Buffer.from(sha).toString("hex")}.${extension}`,
      integrity: `sha256-${Buffer.from(sha).toString("base64")}`,
    };
  };
  const js = asset(javascriptWithGuard, "js");
  const css = asset(stylesheet, "css");
  const manifest = viewerAssetManifestSchema.parse({
    schemaVersion: 1,
    build: digest(`${js.integrity}\n${css.integrity}`),
    js,
    css,
  });
  const generation = {
    manifest,
    assets: new Map<string, Uint8Array>([
      [js.url, javascriptWithGuard],
      [css.url, Buffer.from(stylesheet)],
    ]),
  };
  verifyViewerGeneration(generation);
  return generation;
}

export function verifyViewerAssetBytes(
  asset: ViewerAssetManifest["js"] | ViewerAssetManifest["css"],
  bytes: Uint8Array,
): void {
  const digest = createHash("sha256").update(bytes).digest();
  if (
    asset.url !==
      `/ui/nemlig/assets/${Buffer.from(digest).toString("hex")}.${asset.url.endsWith(".js") ? "js" : "css"}` ||
    asset.integrity !== `sha256-${Buffer.from(digest).toString("base64")}`
  ) {
    throw new Error("Viewer asset bytes do not match the manifest");
  }
}

export function verifyViewerGeneration(generation: ViewerGeneration): void {
  const result = viewerAssetManifestSchema.safeParse(generation.manifest);
  if (!result.success) {
    throw new Error("Viewer manifest is invalid");
  }
  const manifest = result.data;
  const js = generation.assets.get(manifest.js.url);
  const css = generation.assets.get(manifest.css.url);
  if (!js || !css || generation.assets.size !== 2) {
    throw new Error(
      "Viewer generation must contain exactly its JS and CSS assets",
    );
  }
  verifyViewerAssetBytes(manifest.js, js);
  verifyViewerAssetBytes(manifest.css, css);
  const rawBytes = js.byteLength + css.byteLength;
  const gzipBytes = gzipSync(js).byteLength + gzipSync(css).byteLength;
  if (
    rawBytes > VIEWER_GENERATION_RAW_LIMIT ||
    gzipBytes > VIEWER_GENERATION_GZIP_LIMIT
  ) {
    throw new Error("Viewer generation exceeds its byte budget");
  }
}

export async function readBoundedBody(
  response: Response,
  limit: number,
): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limit) {
    await response.body?.cancel();
    throw new Error("Viewer response exceeds its byte limit");
  }
  if (!response.body) {
    throw new Error("Viewer response body is missing");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      byteLength += value.byteLength;
      if (byteLength > limit) {
        await reader.cancel();
        throw new Error("Viewer response exceeds its byte limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, byteLength);
}

async function requestViewerResource(
  fetcher: typeof fetch,
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(5_000)])
    : AbortSignal.timeout(5_000);
  try {
    const response = await fetcher(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: requestSignal,
    });
    if (
      !response.ok ||
      response.headers.get("access-control-allow-origin") !== "*"
    ) {
      throw new Error("Viewer resource unavailable");
    }
    return response;
  } catch {
    throw new Error("Viewer resource request failed");
  }
}

async function readViewerAsset(
  asset: ViewerAssetManifest["js"] | ViewerAssetManifest["css"],
  response: Response,
  limit: number,
): Promise<Uint8Array> {
  const expectedType = asset.url.endsWith(".js")
    ? /^(?:text|application)\/javascript(?:;|$)/iu
    : /^text\/css(?:;|$)/iu;
  if (!expectedType.test(response.headers.get("content-type") ?? "")) {
    throw new Error("Viewer asset content type is invalid");
  }
  if (!/\bimmutable\b/iu.test(response.headers.get("cache-control") ?? "")) {
    throw new Error("Viewer asset cache policy is invalid");
  }
  const bytes = await readBoundedBody(response, limit);
  verifyViewerAssetBytes(asset, bytes);
  return bytes;
}

export async function fetchViewerGeneration(
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<ViewerGeneration> {
  const manifestResponse = await requestViewerResource(
    fetcher,
    `${VIEWER_ASSET_ORIGIN}${VIEWER_MANIFEST_PATH}`,
    signal,
  );
  if (
    !/^application\/json(?:;|$)/iu.test(
      manifestResponse.headers.get("content-type") ?? "",
    )
  ) {
    throw new Error("Viewer manifest content type is invalid");
  }
  if (
    !/\bno-store\b/iu.test(manifestResponse.headers.get("cache-control") ?? "")
  ) {
    throw new Error("Viewer manifest cache policy is invalid");
  }
  const manifest = parseViewerManifest(
    await readBoundedBody(manifestResponse, VIEWER_MANIFEST_LIMIT),
  );
  const assets = new Map<string, Uint8Array>();
  let remaining = VIEWER_GENERATION_RAW_LIMIT;
  for (const asset of [manifest.js, manifest.css]) {
    const response = await requestViewerResource(
      fetcher,
      `${VIEWER_ASSET_ORIGIN}${asset.url}`,
      signal,
    );
    const bytes = await readViewerAsset(asset, response, remaining);
    remaining -= bytes.byteLength;
    assets.set(asset.url, bytes);
  }
  const generation = { manifest, assets };
  verifyViewerGeneration(generation);
  return generation;
}

export async function verifyViewerAssets(
  generation: ViewerGeneration,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<void> {
  for (const asset of [generation.manifest.js, generation.manifest.css]) {
    const response = await requestViewerResource(
      fetcher,
      `${VIEWER_ASSET_ORIGIN}${asset.url}`,
      signal,
    );
    const expected = generation.assets.get(asset.url);
    const actual = await readViewerAsset(
      asset,
      response,
      expected?.byteLength ?? 0,
    );
    if (!expected || !Buffer.from(actual).equals(Buffer.from(expected))) {
      throw new Error("Viewer asset acceptance failed");
    }
  }
}
