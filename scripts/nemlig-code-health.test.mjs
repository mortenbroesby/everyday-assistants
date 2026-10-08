import assert from "node:assert/strict";
import test from "node:test";
import { compareFindings, findingsFrom, validateBaseline } from "./nemlig-code-health.mjs";

test("normalizes only supported Knip categories into stable identities", () => {
  const first = findingsFrom({ issues: [{ file: "apps/nemlig-assistant/src/example.ts", files: [{ name: "apps/nemlig-assistant/src/example.ts" }], exports: [{ name: "unusedExport" }], types: [{ name: "UnusedType" }], dependencies: ["unused-package"] }] });
  const second = findingsFrom({ issues: [{ file: "apps/nemlig-assistant/src/example.ts", files: [{ name: "apps/nemlig-assistant/src/example.ts" }], exports: [{ name: "unusedExport" }], types: [{ name: "UnusedType" }], dependencies: ["unused-package"] }] });
  assert.equal(first.length, 4);
  assert.deepEqual(first, second);
});

test("compares identities so equal counts cannot conceal a replacement", () => {
  const baseline = findingsFrom({ issues: [{ file: "apps/nemlig-assistant/src/old.ts", files: [{ name: "apps/nemlig-assistant/src/old.ts" }] }] });
  const current = findingsFrom({ issues: [{ file: "apps/nemlig-assistant/src/new.ts", files: [{ name: "apps/nemlig-assistant/src/new.ts" }] }] });
  const result = compareFindings(baseline, current);
  assert.equal(result.known.length, 0);
  assert.equal(result.new.length, 1);
  assert.equal(result.resolved.length, 1);
});

test("does not persist or report raw symbol and dependency names", () => {
  const findings = findingsFrom({ issues: [{ file: "apps/nemlig-assistant/src/example.ts", exports: [{ name: "synthetic-private-password" }] }] });
  assert.doesNotMatch(JSON.stringify(findings), /synthetic-private-password/);
});

test("rejects a finding that is outside the approved app scope", () => {
  assert.throws(() => findingsFrom({ issues: [{ file: "scripts/private.ts", files: [{ name: "scripts/private.ts" }] }] }), /outside Nemlig Assistant/);
});

test("fails closed for an incompatible Knip report and malformed baseline", () => {
  assert.throws(() => findingsFrom({}), /incompatible report/);
  assert.throws(() => validateBaseline({ schemaVersion: 1, tool: { name: "knip", version: "6.40.0" }, generatedFrom: "f".repeat(40), findings: [{ category: "files", file: "apps/nemlig-assistant/src/example.ts", id: "not-a-hash" }] }), /invalid finding/);
});
