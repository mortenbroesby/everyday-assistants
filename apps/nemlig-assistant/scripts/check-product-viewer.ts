import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateProductViewerArtifact } from "./product-viewer-artifact.js";
import { readProductViewerArtifact } from "../src/product-viewer.js";
import { readLocalViewerGeneration } from "./viewer-generation.js";

const shell = readProductViewerArtifact().html;
const { rawBytes: shellBytes, gzipBytes: shellGzipBytes } =
  validateProductViewerArtifact(shell);
const headers = await readFile(
  new URL("../dist/ui-static/_headers", import.meta.url),
  "utf8",
);
const generation = await readLocalViewerGeneration(
  fileURLToPath(new URL("../dist/ui-static/", import.meta.url)),
);
assert.match(
  headers,
  /\/ui\/nemlig\/manifest\.json\n\x20{2}Cache-Control: no-store/u,
);
assert.match(headers, /Access-Control-Allow-Origin: \*/u);
await assert.rejects(access(new URL("../dist/picker.html", import.meta.url)));

console.log(
  `Stable viewer shell: ${shellBytes} bytes raw, ${shellGzipBytes} bytes gzip; ${generation.assets.size} assets verified.`,
);
