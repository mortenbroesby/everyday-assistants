import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  VIEWER_GENERATION_GZIP_LIMIT,
  VIEWER_GENERATION_RAW_LIMIT,
  parseViewerManifest,
  verifyViewerGeneration,
  type ViewerGeneration,
} from "../src/viewer-assets.js";

export async function readLocalViewerGeneration(
  staticRoot: string,
): Promise<ViewerGeneration> {
  const manifestBytes = await readFile(
    join(staticRoot, "ui/nemlig/manifest.json"),
  );
  const manifest = parseViewerManifest(manifestBytes);
  const assets = new Map<string, Uint8Array>();
  for (const asset of [manifest.js, manifest.css]) {
    assets.set(asset.url, await readFile(join(staticRoot, asset.url.slice(1))));
  }
  const generation = { manifest, assets };
  verifyViewerGeneration(generation);
  return generation;
}

export function mergeViewerGenerations(
  ...generations: readonly ViewerGeneration[]
): ReadonlyMap<string, Uint8Array> {
  const assets = new Map<string, Uint8Array>();
  for (const generation of generations) {
    verifyViewerGeneration(generation);
    for (const [url, bytes] of generation.assets) {
      const existing = assets.get(url);
      if (existing && !Buffer.from(existing).equals(bytes)) {
        throw new Error("Conflicting viewer assets share a content hash");
      }
      assets.set(url, bytes);
    }
  }
  const rawBytes = [...assets.values()].reduce(
    (total, bytes) => total + bytes.byteLength,
    0,
  );
  const gzipBytes = [...assets.values()].reduce(
    (total, bytes) => total + gzipSync(bytes).byteLength,
    0,
  );
  if (
    rawBytes > VIEWER_GENERATION_RAW_LIMIT * 2 ||
    gzipBytes > VIEWER_GENERATION_GZIP_LIMIT * 2
  ) {
    throw new Error("Retained viewer assets exceed their byte budget");
  }
  return assets;
}

export async function writeViewerGenerationFiles(
  staticRoot: string,
  candidate: ViewerGeneration,
  retained: readonly ViewerGeneration[] = [],
): Promise<void> {
  const assets = mergeViewerGenerations(candidate, ...retained);
  const assetsDirectory = join(staticRoot, "ui/nemlig/assets");
  await rm(assetsDirectory, { recursive: true, force: true });
  await mkdir(assetsDirectory, { recursive: true });
  for (const [url, bytes] of assets) {
    await writeFile(join(staticRoot, url.slice(1)), bytes);
  }
  await writeFile(
    join(staticRoot, "ui/nemlig/manifest.json"),
    `${JSON.stringify(candidate.manifest)}\n`,
  );
  await writeFile(
    join(staticRoot, "_headers"),
    "/ui/nemlig/manifest.json\n  Cache-Control: no-store, max-age=0\n  Access-Control-Allow-Origin: *\n\n/ui/nemlig/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n  Access-Control-Allow-Origin: *\n",
  );
}
