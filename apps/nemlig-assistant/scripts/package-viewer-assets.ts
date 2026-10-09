import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createViewerGeneration } from "../src/viewer-assets.js";
import { writeViewerGenerationFiles } from "./viewer-generation.js";

interface ViteManifestEntry {
  file: string;
  isEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
  assets?: string[];
}

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const intermediate = join(root, "viewer-build");
const staticRoot = join(root, "ui-static");
const viteManifest = JSON.parse(
  await readFile(join(intermediate, ".vite/manifest.json"), "utf8"),
) as Record<string, ViteManifestEntry>;
assert.deepEqual(Object.keys(viteManifest).sort(), [
  "picker.html",
  "style.css",
]);
const entry = viteManifest["picker.html"];
const stylesheet = viteManifest["style.css"];
assert.ok(entry?.isEntry);
assert.ok(stylesheet);
assert.match(entry.file, /^assets\/.+\.js$/u);
assert.deepEqual(entry.imports ?? [], []);
assert.deepEqual(entry.dynamicImports ?? [], []);
assert.equal(entry.assets?.length ?? 0, 0);
assert.equal(entry.css?.length ?? 0, 0);
const stylesheetPath = stylesheet.file;
assert.match(stylesheetPath, /^assets\/.+\.css$/u);
const emittedFiles = [
  entry.file,
  stylesheetPath,
  "picker.html",
  ".vite/manifest.json",
];
const readTree = async (directory: string): Promise<string[]> => {
  const items = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    items.map((item) => {
      const path = join(directory, item.name);
      return item.isDirectory()
        ? readTree(path)
        : [relative(intermediate, path)];
    }),
  );
  return paths.flat().map((path) => path.split(sep).join("/"));
};
assert.deepEqual((await readTree(intermediate)).sort(), emittedFiles.sort());

const generation = createViewerGeneration(
  await readFile(join(intermediate, entry.file)),
  await readFile(join(intermediate, stylesheetPath)),
);
await writeViewerGenerationFiles(staticRoot, generation);
await rm(intermediate, { recursive: true, force: true });
