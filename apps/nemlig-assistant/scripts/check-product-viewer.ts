import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const html = await readFile(new URL("../dist/picker.html", import.meta.url), "utf8");

assert.ok(Buffer.byteLength(html) <= 1_500_000, "React viewer exceeds the raw HTML budget");
assert.ok(gzipSync(html).byteLength <= 350_000, "React viewer exceeds the gzip HTML budget");
assert.doesNotMatch(html, /<script[^>]+\bsrc=/iu, "viewer contains an external script");
assert.doesNotMatch(html, /<link[^>]+\brel=["']?stylesheet/iu, "viewer contains an external stylesheet");
assert.doesNotMatch(html, /\bimport\s*\(/u, "viewer contains a dynamic import");
assert.doesNotMatch(html, /\bfetch\s*\(/u, "viewer contains an application fetch");
assert.doesNotMatch(html, /Interactive local review is not implemented/u, "candidate placeholder remains in the production viewer");

console.log(`React product viewer artifact: ${Buffer.byteLength(html)} bytes raw, ${gzipSync(html).byteLength} bytes gzip.`);
