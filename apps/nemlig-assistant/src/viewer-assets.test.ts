import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  mergeViewerGenerations,
  readLocalViewerGeneration,
  writeViewerGenerationFiles,
} from "../scripts/viewer-generation.js";
import {
  createViewerGeneration,
  parseViewerManifest,
  readBoundedBody,
  verifyViewerAssetBytes,
  verifyViewerGeneration,
} from "./viewer-assets.js";

test("viewer generations bind each asset and build digest to their bytes", () => {
  const generation = createViewerGeneration(
    Buffer.from("window.viewer = true;"),
    Buffer.from("body { color: green; }"),
  );
  verifyViewerGeneration(generation);
  assert.equal(generation.assets.size, 2);
  assert.throws(() =>
    parseViewerManifest(
      Buffer.from(
        JSON.stringify({ ...generation.manifest, build: "0".repeat(64) }),
      ),
    ),
  );
  const [asset, bytes] = [...generation.assets][0]!;
  assert.throws(() =>
    verifyViewerAssetBytes(
      asset.endsWith(".js") ? generation.manifest.js : generation.manifest.css,
      Buffer.concat([bytes, Buffer.from("changed")]),
    ),
  );
});

test("bounded viewer response reads reject oversized declared and streamed bodies", async () => {
  await assert.rejects(
    readBoundedBody(
      new Response("12345", { headers: { "content-length": "5" } }),
      4,
    ),
    /byte limit/u,
  );
  const streamed = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Buffer.from("12345"));
      controller.close();
    },
  });
  await assert.rejects(
    readBoundedBody(new Response(streamed), 4),
    /byte limit/u,
  );
  assert.deepEqual(
    await readBoundedBody(new Response("1234"), 4),
    Buffer.from("1234"),
  );
});

test("retained viewer generations keep the candidate manifest and both asset pairs", async () => {
  const candidate = createViewerGeneration(
    Buffer.from("candidate"),
    Buffer.from("body { color: red; }"),
  );
  const predecessor = createViewerGeneration(
    Buffer.from("previous"),
    Buffer.from("body { color: blue; }"),
  );
  assert.equal(mergeViewerGenerations(candidate, predecessor).size, 4);
  const next = createViewerGeneration(
    Buffer.from("next"),
    Buffer.from("body { color: green; }"),
  );
  assert.equal(mergeViewerGenerations(next, candidate).size, 4);
  assert.equal(mergeViewerGenerations(candidate, candidate).size, 2);
  const root = await mkdtemp(join(tmpdir(), "viewer-generation-"));
  try {
    await writeViewerGenerationFiles(root, candidate, [predecessor]);
    const saved = await readLocalViewerGeneration(root);
    assert.deepEqual(saved.manifest, candidate.manifest);
    assert.equal(saved.assets.size, 2);
    assert.equal(
      await readFile(join(root, predecessor.manifest.js.url.slice(1)), "utf8"),
      Buffer.from(
        predecessor.assets.get(predecessor.manifest.js.url)!,
      ).toString(),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
