import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const check = resolve(import.meta.dirname, "check-public-tree.mjs");

test("public-tree check rejects and then clears a synthetic private fixture", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "public-tree-check-"));
  const fixture = resolve(directory, "fixture.txt");
  try {
    writeFileSync(fixture, "person@" + "gmail.com\n");
    assert.notEqual(spawnSync(process.execPath, [check, directory]).status, 0);
    rmSync(fixture);
    assert.match(execFileSync(process.execPath, [check, directory], { encoding: "utf8" }), /passed \(0 files\)/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
