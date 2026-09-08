import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyReleasePlan, createReleasePlan, packagePath, parseArgs } from "./agent.js";
import { checkVersionBump } from "./check-version-bump.js";

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

async function manifest(repo: string, version: string): Promise<void> {
  await writeFile(
    path.join(repo, packagePath),
    `${JSON.stringify({ name: "nemlig-assistant", version }, null, 2)}\n`,
  );
}

async function fixture(): Promise<{ repo: string; base: string }> {
  const repo = await mkdtemp(path.join(tmpdir(), "nemlig-release-"));
  await mkdir(path.join(repo, "apps/nemlig-assistant/src"), { recursive: true });
  await manifest(repo, "0.1.0");
  await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 1;\n");
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "release-test@example.invalid");
  git(repo, "config", "user.name", "Release Test");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "chore: baseline");
  return { repo, base: git(repo, "rev-parse", "HEAD") };
}

test("release arguments preserve defaults, flags, repeated values, and no-release semantics", () => {
  assert.deepEqual(parseArgs([]), { baseRef: "origin/main" });
  assert.deepEqual(parseArgs(["--apply", "--apply", "--merged-candidate", "--merged-candidate"]), {
    baseRef: "origin/main",
    apply: true,
    mergedCandidate: true,
  });
  assert.deepEqual(parseArgs(["--base", "first", "--base", "last", "--main-ref", "first-main", "--main-ref", "main"]), {
    baseRef: "last",
    mainRef: "main",
  });
  assert.deepEqual(parseArgs(["--no-release", "--no-release"]), { baseRef: "origin/main", noRelease: true });
  assert.equal("noRelease" in parseArgs([]), false);
});

test("release arguments reject missing values, unknown options, and positionals", () => {
  for (const argv of [["--base"], ["--main-ref"], ["--base", "--apply"], ["--main-ref", "--apply"], ["--base="], ["--main-ref="], ["--unknown"], ["--help"], ["value"]]) {
    assert.throws(() => parseArgs(argv), /argument|option|unknown|unexpected/i, argv.join(" "));
  }
});

test("release parser keeps diagnostics silent", () => {
  let stdout = "";
  let stderr = "";
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  process.stdout.write = ((chunk: string | Uint8Array) => { stdout += chunk.toString(); return true; }) as typeof originalStdout;
  process.stderr.write = ((chunk: string | Uint8Array) => { stderr += chunk.toString(); return true; }) as typeof originalStderr;
  try {
    assert.throws(() => parseArgs(["--unknown"]));
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
  assert.equal(stdout, "");
  assert.equal(stderr, "");
});

test("release plan is read-only and apply changes only the Nemlig manifest", async () => {
  const { repo, base } = await fixture();
  try {
    await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
    const beforePlan = git(repo, "status", "--short");
    const plan = await createReleasePlan({
      repoRoot: repo,
      baseRef: base,
      mainRef: base,
      registry: { status: "unpublished" },
    });
    assert.equal(plan.releaseKind, "patch");
    assert.equal(plan.targetVersion, "0.1.1-alpha.0");
    assert.equal(git(repo, "status", "--short"), beforePlan);
    applyReleasePlan(repo, plan);
    assert.equal(JSON.parse(await readFile(path.join(repo, packagePath), "utf8")).version, "0.1.1-alpha.0");
    assert.deepEqual(git(repo, "status", "--short").split("\n").map((line) => line.trim()).sort(), [
      "M apps/nemlig-assistant/package.json",
      "M apps/nemlig-assistant/src/client.ts",
    ]);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("version gate ignores unrelated changes and rejects an unbumped runtime", async () => {
  const { repo, base } = await fixture();
  try {
    await mkdir(path.join(repo, "apps/other-assistant"), { recursive: true });
    await writeFile(path.join(repo, "apps/other-assistant/README.md"), "docs\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "docs: other assistant");
    assert.match(checkVersionBump(repo, base), /not applicable/);

    await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "fix: client");
    assert.throws(() => checkVersionBump(repo, base), /require a forward/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("version gate uses explicit immutable revisions and rejects unavailable comparisons", async () => {
  const { repo, base } = await fixture();
  try {
    await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
    await manifest(repo, "0.1.1-alpha.0");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "fix: first runtime change");
    const head = git(repo, "rev-parse", "HEAD");
    await manifest(repo, "0.1.0");
    assert.match(checkVersionBump(repo, base, head), /passed/);
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "chore: later checkout must not alter tested head");
    assert.match(checkVersionBump(repo, base, head), /passed/);
    assert.throws(() => checkVersionBump(repo, "missing-base", head), /Cannot resolve/);
    assert.throws(() => checkVersionBump(repo, base, "missing-head"), /Cannot resolve/);
    assert.throws(() => checkVersionBump(repo, head, base), /ancestor/);
    git(repo, "rm", packagePath); git(repo, "commit", "-qm", "chore: missing manifest fixture");
    assert.throws(() => checkVersionBump(repo, base, "HEAD"), /Cannot read/);
  } finally { await rm(repo, { recursive: true, force: true }); }
});

test("version gate covers all commits and patch minor major or explicit no-release policy", async () => {
  for (const [message, version] of [
    ["fix: patch", "0.1.1-alpha.0"],
    ["feat: capability", "0.2.0-alpha.0"],
    ["feat!: breaking interface", "1.0.0-alpha.0"],
  ]) {
    const { repo, base } = await fixture();
    try {
      await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
      git(repo, "add", "."); git(repo, "commit", "-qm", message!);
      assert.throws(() => checkVersionBump(repo, base, "HEAD"), /require a forward/);
      await manifest(repo, version!);
      git(repo, "add", "."); git(repo, "commit", "-qm", "chore: record release metadata");
      assert.match(checkVersionBump(repo, base, "HEAD"), /passed/);
    } finally { await rm(repo, { recursive: true, force: true }); }
  }
  const { repo, base } = await fixture();
  try {
    await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
    git(repo, "add", "."); git(repo, "commit", "-qm", "refactor: no release\n\nNemlig-Release: none");
    assert.match(checkVersionBump(repo, base, "HEAD"), /not applicable/);
  } finally { await rm(repo, { recursive: true, force: true }); }
});

test("merged documentation candidates are no-ops without registry access", async () => {
  const { repo, base } = await fixture();
  try {
    await writeFile(path.join(repo, "README.md"), "docs\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "docs: clarify");
    const plan = await createReleasePlan({ repoRoot: repo, baseRef: base, mainRef: "HEAD", mergedCandidate: true });
    assert.equal(plan.releaseKind, "none");
    assert.equal(plan.transactionAction, "no-op");
    assert.equal(plan.shouldRelease, false);
    assert.match(plan.registry.status === "unavailable" ? plan.registry.reason : "", /not required/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
