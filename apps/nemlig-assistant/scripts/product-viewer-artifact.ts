import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";

export function validateProductViewerArtifact(html: string): { rawBytes: number; gzipBytes: number } {
  const rawBytes = Buffer.byteLength(html);
  assert.ok(rawBytes <= 1_500_000, "React viewer exceeds the raw HTML budget");

  const gzipBytes = gzipSync(html).byteLength;
  assert.ok(gzipBytes <= 350_000, "React viewer exceeds the gzip HTML budget");
  assert.doesNotMatch(html, /<script[^>]+\bsrc=/iu, "viewer contains an external script");
  assert.doesNotMatch(html, /<link[^>]+\brel=["']?stylesheet/iu, "viewer contains an external stylesheet");
  assert.doesNotMatch(html, /\bimport\s*\(/u, "viewer contains a dynamic import");
  assert.doesNotMatch(html, /\bfetch\s*\(/u, "viewer contains an application fetch");
  assert.doesNotMatch(html, /Interactive local review is not implemented/u, "candidate placeholder remains in the production viewer");

  return { rawBytes, gzipBytes };
}
