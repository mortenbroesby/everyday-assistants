/* global process, URL */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const script = fileURLToPath(new URL("./demo-product-discovery.ts", import.meta.url));
const packageRoot = path.resolve(path.dirname(script), "..");

const { stdout, stderr } = await execute(
  process.execPath,
  ["--import", "tsx/esm", script],
  { cwd: packageRoot, env: { PATH: process.env.PATH ?? "" }, timeout: 20_000 },
);

assert.equal(stderr, "");
const summary = JSON.parse(stdout);

assert.equal(summary.ok, true);
assert.deepEqual(summary.success, {
  lines: 24,
  uniqueCatalogueRequests: 12,
  maximumActive: 3,
  settled: 13,
  responseClosed: 13,
  outstanding: 0,
});
for (const scenario of [summary.basketFailure, summary.callerCancellation]) {
  assert.equal(scenario.initialCatalogueRequests, 3);
  assert.ok(scenario.maximumActive <= 3);
  assert.equal(scenario.queuedStartsAfterFatal, 0);
  assert.equal(scenario.outstanding, 0);
}
