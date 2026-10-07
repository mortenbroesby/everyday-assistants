import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const html = await readFile(new URL("../.candidate-dist/picker.html", import.meta.url), "utf8");

assert.ok(Buffer.byteLength(html) <= 1_500_000, "React candidate exceeds the raw HTML budget");
assert.ok(gzipSync(html).byteLength <= 350_000, "React candidate exceeds the gzip HTML budget");
assert.doesNotMatch(html, /<script[^>]+\bsrc=/iu, "candidate contains an external script");
assert.doesNotMatch(html, /<link[^>]+\brel=["']?stylesheet/iu, "candidate contains an external stylesheet");
assert.doesNotMatch(html, /\bimport\s*\(/u, "candidate contains a dynamic import");
assert.doesNotMatch(html, /\bfetch\s*\(/u, "candidate contains an application fetch");
assert.match(html, /Interactive local review is not implemented in this candidate/u);

console.log(`React candidate artifact: ${Buffer.byteLength(html)} bytes raw, ${gzipSync(html).byteLength} bytes gzip.`);
