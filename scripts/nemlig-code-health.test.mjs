import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { compareFindings, findingsFrom, pruneFindings, scan, validateBaseline } from "./nemlig-code-health.mjs";

const root = resolve(import.meta.dirname, "..");
const idFor = (category, file, name) => createHash("sha256").update(`${category}\0${file}\0${name}`).digest("hex");

test("normalizes supported Knip categories into stable identities", () => {
  const first = findingsFrom({ issues: [{ file: "apps/nemlig-assistant/src/example.ts", files: [{ name: "apps/nemlig-assistant/src/example.ts" }], dependencies: ["unused-runtime"], devDependencies: ["unused-development"], optionalPeerDependencies: ["optional-peer"], exports: [{ name: "unusedExport" }], types: [{ name: "UnusedType" }] }] });
  const second = findingsFrom({ issues: [{ file: "apps/nemlig-assistant/src/example.ts", files: [{ name: "apps/nemlig-assistant/src/example.ts" }], dependencies: ["unused-runtime"], devDependencies: ["unused-development"], optionalPeerDependencies: ["optional-peer"], exports: [{ name: "unusedExport" }], types: [{ name: "UnusedType" }] }] });
  assert.equal(first.length, 6);
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

test("pruning resolved findings makes a later reintroduction fail", () => {
  const finding = { category: "exports", file: "apps/nemlig-assistant/src/example.ts", id: idFor("exports", "apps/nemlig-assistant/src/example.ts", "removedExport") };
  const pruned = pruneFindings([finding], []);
  assert.deepEqual(pruned, []);
  assert.equal(compareFindings(pruned, [finding]).new.length, 1);
});

test("does not persist or report raw symbol and dependency names", () => {
  const findings = findingsFrom({ issues: [{ file: "apps/nemlig-assistant/src/example.ts", exports: [{ name: "synthetic-private-password" }], devDependencies: ["synthetic-private-token"] }] });
  assert.doesNotMatch(JSON.stringify(findings), /synthetic-private-(password|token)/);
});

test("fails closed for incompatible Knip reports and malformed baselines", () => {
  assert.throws(() => findingsFrom({}), /incompatible report/);
  assert.throws(() => validateBaseline({ schemaVersion: 1, tool: { name: "knip", version: "6.40.0" }, generatedFrom: "f".repeat(40), findings: [{ category: "files", file: "apps/nemlig-assistant/src/example.ts", id: "not-a-hash" }] }), /invalid finding/);
});

test("sanitizes scanner warnings, failures, and malformed output", () => {
  const marker = "synthetic-private-scanner-marker";
  const success = JSON.stringify({ issues: [{ file: "apps/nemlig-assistant/src/example.ts", exports: [{ name: marker }] }] });
  assert.doesNotMatch(JSON.stringify(scan({ runner: () => ({ status: 0, stdout: success, stderr: marker }) })), new RegExp(marker));
  for (const result of [
    { status: 1, stdout: "", stderr: marker },
    { status: 0, stdout: `{${marker}`, stderr: marker },
  ]) {
    let error;
    try {
      scan({ runner: () => result });
    } catch (caught) {
      error = caught;
    }
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, new RegExp(marker));
  }
});

test("real Knip reporter rejects synthetic unused runtime and development dependencies", () => {
  withFixture((fixture) => {
    const baseline = scan({ cwd: fixture });
    writeBaseline(fixture, baseline);
    addDependency(fixture, "dependencies", "synthetic-private-runtime-dependency");
    assert.ok(compareFindings(baseline, scan({ cwd: fixture })).new.length > 0, "real Knip must report the synthetic runtime dependency");
    assertCheckFailsWithoutMarker(fixture, "synthetic-private-runtime-dependency");
    removeDependency(fixture, "dependencies", "synthetic-private-runtime-dependency");
    assertCheckPasses(fixture);
    addDependency(fixture, "devDependencies", "synthetic-private-development-dependency");
    assert.ok(compareFindings(baseline, scan({ cwd: fixture })).new.length > 0, "real Knip must report the synthetic development dependency");
    assertCheckFailsWithoutMarker(fixture, "synthetic-private-development-dependency");
    removeDependency(fixture, "devDependencies", "synthetic-private-development-dependency");
    assertCheckPasses(fixture);
  });
});

test("real Knip reporter rejects a new unused export while baseline debt alone passes", () => {
  withFixture((fixture) => {
    const baseline = scan({ cwd: fixture });
    writeBaseline(fixture, baseline);
    const internal = join(fixture, "apps/nemlig-assistant/src/internal.ts");
    writeFileSync(internal, `${readFileSync(internal, "utf8")}\nexport const syntheticPrivateExport = true;\n`);
    assert.ok(compareFindings(baseline, scan({ cwd: fixture })).new.length > 0, "real Knip must report the synthetic export");
    assertCheckFailsWithoutMarker(fixture, "syntheticPrivateExport");
    writeFileSync(internal, "export const existing = true;\n");
    assertCheckPasses(fixture);
  });
});

test("baseline generation rejects modified, staged, and untracked inputs", () => {
  for (const state of ["modified", "staged", "untracked"]) {
    withGitFixture((fixture) => {
      const source = join(fixture, "apps/nemlig-assistant/src/index.ts");
      if (state === "untracked") writeFileSync(join(fixture, "apps/nemlig-assistant/src/untracked.ts"), "export const ignored = true;\n");
      else {
        writeFileSync(source, "export const changed = true;\n");
        if (state === "staged") execFileSync("git", ["add", source], { cwd: fixture });
      }
      const result = spawnSync(process.execPath, [join(fixture, "scripts/nemlig-code-health.mjs"), "baseline"], { cwd: fixture, encoding: "utf8" });
      assert.notEqual(result.status, 0, state);
      assert.match(`${result.stdout}\n${result.stderr}`, /clean working tree/);
      assert.throws(() => readFileSync(join(fixture, ".code-health/nemlig-assistant-baseline.json"), "utf8"));
    });
  }
});

test("wrapper command does not leak scanner stdout or stderr", () => {
  const marker = "synthetic-private-command-marker";
  withFixture((fixture) => {
    writeBaseline(fixture, []);
    const scanner = join(fixture, "node_modules/knip/bin/knip.js");
    rmSync(join(fixture, "node_modules/knip"), { force: true, recursive: true });
    mkdirSync(join(fixture, "node_modules/knip/bin"), { recursive: true });
    for (const source of [
      `process.stderr.write(${JSON.stringify(marker)}); process.exit(1);`,
      `process.stdout.write(${JSON.stringify(`{${marker}`)});`,
      `process.stdout.write(${JSON.stringify('{"issues":[]}')}); process.stderr.write(${JSON.stringify(marker)});`,
      `process.stdout.write(${JSON.stringify(`{"issues":[{"file":"apps/nemlig-assistant/src/example.ts","exports":[{"name":"${marker}"}]}]}`)});`,
    ]) {
      writeFileSync(scanner, source);
      const result = check(fixture);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(marker));
    }
  });
});

function withFixture(run) {
  const fixture = mkdtempSync(join(tmpdir(), "nemlig-code-health-"));
  try {
    mkdirSync(join(fixture, "apps/nemlig-assistant/src"), { recursive: true });
    mkdirSync(join(fixture, "scripts"), { recursive: true });
    writeFileSync(join(fixture, "package.json"), JSON.stringify({ private: true, packageManager: "pnpm@9.15.9" }));
    writeFileSync(join(fixture, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    writeFileSync(join(fixture, "apps/nemlig-assistant/package.json"), JSON.stringify({ name: "nemlig-assistant", private: true, version: "0.0.0", bin: { nemlig: "src/index.ts" } }));
    writeFileSync(join(fixture, "apps/nemlig-assistant/src/index.ts"), "import \"./internal.js\";\nexport const used = true;\n");
    writeFileSync(join(fixture, "apps/nemlig-assistant/src/internal.ts"), "export const existing = true;\n");
    writeFileSync(join(fixture, "scripts/nemlig-code-health.mjs"), readFileSync(join(root, "scripts/nemlig-code-health.mjs")));
    mkdirSync(join(fixture, "node_modules"));
    symlinkSync(join(root, "node_modules/knip"), join(fixture, "node_modules/knip"), "dir");
    for (const name of ["synthetic-private-runtime-dependency", "synthetic-private-development-dependency"]) {
      mkdirSync(join(fixture, "node_modules", name));
      writeFileSync(join(fixture, "node_modules", name, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
    }
    run(fixture);
  } finally {
    rmSync(fixture, { force: true, recursive: true });
  }
}

function withGitFixture(run) {
  withFixture((fixture) => {
    writeFileSync(join(fixture, ".gitignore"), "node_modules\n");
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: fixture });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: fixture });
    execFileSync("git", ["config", "user.name", "Code Health Test"], { cwd: fixture });
    execFileSync("git", ["add", "."], { cwd: fixture });
    execFileSync("git", ["commit", "-m", "fixture"], { cwd: fixture });
    execFileSync("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], { cwd: fixture });
    run(fixture);
  });
}

function writeBaseline(fixture, findings) {
  mkdirSync(join(fixture, ".code-health"), { recursive: true });
  writeFileSync(join(fixture, ".code-health/nemlig-assistant-baseline.json"), `${JSON.stringify({ schemaVersion: 1, tool: { name: "knip", version: "6.40.0" }, generatedFrom: "f".repeat(40), findings }, null, 2)}\n`);
}

function mutateManifest(fixture, mutate) {
  const path = join(fixture, "apps/nemlig-assistant/package.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  mutate(manifest);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function addDependency(fixture, field, name) {
  mutateManifest(fixture, (manifest) => { manifest[field] = { ...manifest[field], [name]: "1.0.0" }; });
}

function removeDependency(fixture, field, name) {
  mutateManifest(fixture, (manifest) => { delete manifest[field]?.[name]; });
}

function check(fixture) {
  return spawnSync(process.execPath, [join(fixture, "scripts/nemlig-code-health.mjs"), "check"], { cwd: fixture, encoding: "utf8" });
}

function assertCheckPasses(fixture) {
  const result = check(fixture);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function assertCheckFailsWithoutMarker(fixture, marker) {
  const result = check(fixture);
  if (result.status === 0) throw new Error(`Expected check to fail: ${result.stdout}`);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(marker));
}
