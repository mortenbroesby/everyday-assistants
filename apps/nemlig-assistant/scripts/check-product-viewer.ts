import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { validateProductViewerArtifact } from "./product-viewer-artifact.js";
import { readProductViewerArtifact } from "../src/product-viewer.js";

const shell = readProductViewerArtifact().html;
const { rawBytes: shellBytes, gzipBytes: shellGzipBytes } =
  validateProductViewerArtifact(shell);
const staticRoot = new URL("../dist/ui-static/ui/nemlig/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", staticRoot), "utf8"),
) as {
  schemaVersion: number;
  build: string;
  js: { url: string; integrity: string };
  css: { url: string; integrity: string };
};
assert.equal(manifest.schemaVersion, 1);
assert.match(manifest.build, /^[a-f0-9]{64}$/u);
assert.match(
  await readFile(new URL("../../_headers", staticRoot), "utf8"),
  /\/ui\/nemlig\/manifest\.json\n\x20{2}Cache-Control: no-store/u,
);
assert.match(
  await readFile(new URL("../../_headers", staticRoot), "utf8"),
  /Access-Control-Allow-Origin: \*/u,
);
for (const [asset, extension] of [
  [manifest.js, "js"],
  [manifest.css, "css"],
] as const) {
  assert.match(
    asset.url,
    new RegExp(`^/ui/nemlig/assets/[a-f0-9]{64}\\.${extension}$`, "u"),
  );
  const body = await readFile(
    new URL(asset.url.slice("/ui/nemlig/".length), staticRoot),
  );
  const digest = createHash("sha256").update(body).digest();
  assert.equal(
    asset.url,
    `/ui/nemlig/assets/${Buffer.from(digest).toString("hex")}.${extension}`,
  );
  assert.equal(
    asset.integrity,
    `sha256-${Buffer.from(digest).toString("base64")}`,
  );
}
await assert.rejects(access(new URL("../dist/picker.html", import.meta.url)));

console.log(
  `Stable viewer shell: ${shellBytes} bytes raw, ${shellGzipBytes} bytes gzip; manifest assets verified.`,
);
