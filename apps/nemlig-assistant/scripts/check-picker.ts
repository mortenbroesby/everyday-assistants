import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const html = await readFile(new URL("../dist/picker.html", import.meta.url), "utf8");

assert.ok(Buffer.byteLength(html) <= 1_500_000, "picker exceeds 1,500,000-byte raw budget");
assert.ok(gzipSync(html).byteLength <= 350_000, "picker exceeds 350,000-byte gzip budget");
assert.doesNotMatch(html, /<script[^>]+\bsrc=/iu, "picker contains an external script");
assert.doesNotMatch(html, /<link[^>]+\brel=["']?stylesheet/iu, "picker contains an external stylesheet");
assert.doesNotMatch(html, /\bimport\s*\(/u, "picker contains a dynamic import");
assert.doesNotMatch(html, /\bfetch\s*\(/u, "picker contains an application fetch");
assert.doesNotMatch(html, /No Nemlig service is contacted/u, "picker contains the local showcase");
assert.doesNotMatch(html, /showcase-stage/u, "picker contains showcase-only styling");
