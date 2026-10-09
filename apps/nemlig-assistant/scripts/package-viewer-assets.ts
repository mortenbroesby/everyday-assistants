import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createViewerAssets } from "./viewer-assets.js";

const root = new URL("../dist/", import.meta.url);
const input = new URL("picker.html", root);
const output = new URL("ui-static/ui/nemlig/", root);
const html = await readFile(input, "utf8");
const { manifest, files } = createViewerAssets(html);
await mkdir(new URL("assets/", output), { recursive: true });
for (const [url, source] of files) {
  await writeFile(new URL(url.slice("/ui/nemlig/".length), output), source);
}
await writeFile(
  new URL("manifest.json", output),
  `${JSON.stringify(manifest)}\n`,
);
await writeFile(
  new URL("../../_headers", output),
  "/ui/nemlig/manifest.json\n  Cache-Control: no-store, max-age=0\n  Access-Control-Allow-Origin: *\n\n/ui/nemlig/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n  Access-Control-Allow-Origin: *\n",
);
await rm(input);
