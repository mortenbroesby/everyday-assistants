import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const check = resolve(import.meta.dirname, "check-public-tree.mjs");
const root = resolve(import.meta.dirname, "..");

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

test("public-tree denylist rejects synthetic principal and credential markers", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "public-tree-policy-check-"));
  const fixture = resolve(directory, "policy.txt");
  try {
    writeFileSync(fixture, "auth0|synthetic-private-principal\nsynthetic-private-password\n");
    const result = spawnSync(process.execPath, [check, directory], {
      env: { ...process.env, PUBLIC_RELEASE_DENYLIST: "auth0|synthetic-private-principal\nsynthetic-private-password" },
    });
    assert.notEqual(result.status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("retired Nemlig tunnel cannot return as a supported repository path", () => {
  assert.equal(existsSync(resolve(root, "scripts/nemlig-tunnel.zsh")), false);
  assert.equal(existsSync(resolve(root, "apps/nemlig-assistant/SECURE_MCP_TUNNEL.md")), false);
  assert.doesNotMatch(readFileSync(resolve(root, "package.json"), "utf8"), /nemlig:tunnel/);
  assert.doesNotMatch(readFileSync(resolve(root, ".husky/pre-push"), "utf8"), /tunnel|launchctl/);
});
