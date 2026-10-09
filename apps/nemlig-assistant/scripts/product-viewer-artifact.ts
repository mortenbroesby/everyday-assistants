import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";

export function validateProductViewerArtifact(html: string): {
  rawBytes: number;
  gzipBytes: number;
} {
  const rawBytes = Buffer.byteLength(html);
  assert.ok(
    rawBytes <= 16_384,
    "stable viewer shell exceeds the raw HTML budget",
  );

  const gzipBytes = gzipSync(html).byteLength;
  assert.ok(gzipBytes <= 8_192, "stable viewer shell exceeds the gzip budget");
  assert.doesNotMatch(
    html,
    /<script[^>]+\bsrc=/iu,
    "stable shell contains a fixed external script",
  );
  assert.doesNotMatch(
    html,
    /<link[^>]+\brel=["']?stylesheet/iu,
    "stable shell contains a fixed external stylesheet",
  );
  assert.doesNotMatch(
    html,
    /\bimport\s*\(/u,
    "viewer contains a dynamic import",
  );
  assert.equal(
    [...html.matchAll(/\bfetch\s*\(/gu)].length,
    1,
    "stable shell may fetch only its current manifest",
  );
  assert.match(
    html,
    /fetch\(manifestUrl/u,
    "stable shell may fetch only its current manifest",
  );
  assert.match(html, /https:\/\/nemlig-mcp\.broesby\.dk/u);
  assert.match(html, /credentials:\s*["']omit["']/u);
  assert.match(html, /redirect:\s*["']error["']/u);
  assert.match(html, /cache:\s*["']no-store["']/u);
  assert.match(html, /AbortSignal\.timeout\(5000\)/u);
  assert.match(html, /\.integrity\s*=\s*(?:js|css)\.integrity/u);
  assert.match(html, /window\.__nemligViewerAttempt\s*=\s*currentAttempt/u);
  assert.match(html, /\+\s*["']\?attempt=["']\s*\+\s*currentAttempt/u);
  assert.doesNotMatch(
    html,
    /Interactive local review is not implemented/u,
    "candidate placeholder remains in the production viewer",
  );

  return { rawBytes, gzipBytes };
}
