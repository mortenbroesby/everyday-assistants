import { readFile } from "node:fs/promises";
import { validateProductViewerArtifact } from "./product-viewer-artifact.js";

const html = await readFile(new URL("../dist/picker.html", import.meta.url), "utf8");
const { rawBytes, gzipBytes } = validateProductViewerArtifact(html);

console.log(`React product viewer artifact: ${rawBytes} bytes raw, ${gzipBytes} bytes gzip.`);
