import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyReleasePlan, createReleasePlan, packagePath, ledgerPath, parseArgs } from "./agent.js";
import { checkVersionBump, checkVersionEligibility } from "./check-version-bump.js";

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

async function ledger(repo: string, version: string, codename: string): Promise<void> {
  await mkdir(path.dirname(path.join(repo, ledgerPath)), { recursive: true });
  const previous = await readFile(path.join(repo, ledgerPath), "utf8").catch(() => "version,codename\n");
  const rows = previous.trimEnd().split("\n").filter((row) => !row.startsWith(version + ","));
  await writeFile(path.join(repo, ledgerPath), rows.join("\n") + "\n" + version + "," + codename + "\n");
}

async function manifest(repo: string, version: string, codename?: string): Promise<void> {
  await writeFile(
    path.join(repo, packagePath),
    `${JSON.stringify({ name: "nemlig-assistant", version, ...(codename ? { nemligRelease: { codename } } : {}) }, null, 2)}\n`,
  );
  if (codename) await ledger(repo, version, codename);
}

async function fixture(): Promise<{ repo: string; base: string }> {
  const repo = await mkdtemp(path.join(tmpdir(), "nemlig-release-"));
  await mkdir(path.join(repo, "apps/nemlig-assistant/src"), { recursive: true });
  await manifest(repo, "0.1.0");
  await mkdir(path.dirname(path.join(repo, ledgerPath)), { recursive: true });
  await writeFile(path.join(repo, ledgerPath), "version,codename\n");
  await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 1;\n");
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "release-test@example.invalid");
  git(repo, "config", "user.name", "Release Test");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "chore: baseline");
  return { repo, base: git(repo, "rev-parse", "HEAD") };
}

test("release arguments preserve defaults, flags, repeated values, and no-release semantics", () => {
  assert.deepEqual(parseArgs(["--codename", "Callsign"]), { baseRef: "origin/main", codename: "Callsign" });
  assert.throws(() => parseArgs(["--codename", "Callsign-2"]), /codename/i);
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

test("release planning is read-only and apply persists only the manifest and ledger", async () => {
  const { repo, base } = await fixture();
  try {
    await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
    const beforePlan = git(repo, "status", "--short");
    const plan = await createReleasePlan({ codename: "Callsign",
      repoRoot: repo,
      baseRef: base,
      mainRef: base,
      registry: { status: "unpublished" },
    });
    assert.equal(plan.releaseKind, "patch");
    assert.equal(plan.targetVersion, "0.1.1");
    assert.equal(plan.currentCodename, null);
    assert.equal(plan.targetCodename, "Callsign");
    await assert.rejects(createReleasePlan({ repoRoot: repo, baseRef: base, mainRef: base, registry: { status: "unpublished" } }), /--codename/);
    assert.equal(git(repo, "status", "--short"), beforePlan);
    applyReleasePlan(repo, plan);
    assert.equal(JSON.parse(await readFile(path.join(repo, packagePath), "utf8")).version, "0.1.1");
    assert.equal(JSON.parse(await readFile(path.join(repo, packagePath), "utf8")).nemligRelease.codename, "Callsign");
    assert.equal(await readFile(path.join(repo, ledgerPath), "utf8"), "version,codename\n0.1.1,Callsign\n");
    applyReleasePlan(repo, plan);
    const applied = await createReleasePlan({ codename: "Callsign", repoRoot: repo, baseRef: base, mainRef: base, registry: { status: "unpublished" } });
    assert.equal(applied.targetCodename, "Callsign");
    assert.equal(applied.codenameValid, true);
    assert.deepEqual(git(repo, "status", "--short").split("\n").map((line) => line.trim()).sort(), [
      "M apps/nemlig-assistant/package.json",
      "M apps/nemlig-assistant/release/codenames.csv",
      "M apps/nemlig-assistant/src/client.ts",
    ]);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("ledger-only changes cannot allocate a name and stale ledger edits cannot be overwritten", async () => {
  const { repo, base } = await fixture();
  try {
    await ledger(repo, "0.1.1", "Callsign");
    git(repo, "add", "."); git(repo, "commit", "-qm", "chore: ledger only");
    assert.throws(() => checkVersionEligibility(repo, base), /Non-release.*ledger/i);
    const rejected = await createReleasePlan({ repoRoot: repo, baseRef: base, mainRef: base });
    assert.equal(rejected.transactionAction, "reject");
    await writeFile(path.join(repo, ledgerPath), "version,codename\n");
    await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
    const plan = await createReleasePlan({ codename: "Callsign", repoRoot: repo, baseRef: base, mainRef: base, registry: { status: "unpublished" } });
    await ledger(repo, "0.1.2", "Pantry");
    assert.throws(() => applyReleasePlan(repo, plan), /stale.*ledger/i);
  } finally { await rm(repo, { recursive: true, force: true }); }
});

test("apply restores the ledger when committing the manifest fails", async () => {
  const { repo, base } = await fixture();
  const rename = fs.renameSync;
  try {
    await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
    const plan = await createReleasePlan({ codename: "Callsign", repoRoot: repo, baseRef: base, mainRef: base, registry: { status: "unpublished" } });
    const beforeManifest = await readFile(path.join(repo, packagePath), "utf8");
    const beforeLedger = await readFile(path.join(repo, ledgerPath), "utf8");
    fs.renameSync = (source, destination) => {
      if (destination === path.join(repo, packagePath)) throw new Error("Injected manifest rename failure");
      rename(source, destination);
    };
    syncBuiltinESMExports();
    assert.throws(() => applyReleasePlan(repo, plan), /Injected manifest rename failure/);
    assert.equal(await readFile(path.join(repo, packagePath), "utf8"), beforeManifest);
    assert.equal(await readFile(path.join(repo, ledgerPath), "utf8"), beforeLedger);
  } finally {
    fs.renameSync = rename;
    syncBuiltinESMExports();
    await rm(repo, { recursive: true, force: true });
  }
});

test("internal-only changes leave the manifest unchanged", async () => {
  const { repo, base } = await fixture();
  try {
    await mkdir(path.join(repo, "apps/nemlig-assistant/release"), { recursive: true });
    await writeFile(path.join(repo, "apps/nemlig-assistant/release/check.ts"), "export const value = 2;\n");
    git(repo, "add", "apps/nemlig-assistant/release/check.ts");
    const plan = await createReleasePlan({ codename: "Callsign", repoRoot: repo, baseRef: base, mainRef: base });
    assert.equal(plan.releaseKind, "none");
    assert.equal(plan.targetVersion, "0.1.0");
    const before = await readFile(path.join(repo, packagePath), "utf8");
    applyReleasePlan(repo, plan);
    assert.equal(await readFile(path.join(repo, packagePath), "utf8"), before);

    const applied = await createReleasePlan({ codename: "Callsign", repoRoot: repo, baseRef: base, mainRef: base });
    assert.equal(applied.releaseKind, "none");
    assert.equal(applied.currentVersion, "0.1.0");
    assert.equal(applied.targetVersion, "0.1.0");
    assert.equal(applied.versionValid, true);
    assert.equal(applied.shouldRelease, false);
    assert.equal(applied.targetCodename, null);
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

test("machine-readable version eligibility releases only versioned runtime changes", async () => {
  const { repo, base } = await fixture();
  try {
    await writeFile(path.join(repo, "README.md"), "docs\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "docs: clarify");
    assert.deepEqual(checkVersionEligibility(repo, base), {
      eligible: false,
      kind: "none",
      previous: "0.1.0",
      current: "0.1.0",
      reason: "No Nemlig package files changed.",
    });

    await mkdir(path.join(repo, "apps/nemlig-assistant/release"), { recursive: true });
    await writeFile(path.join(repo, "apps/nemlig-assistant/release/check.ts"), "export const value = 2;\n");
    await manifest(repo, "0.1.0");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "chore: release check");
    assert.deepEqual(checkVersionEligibility(repo, base), {
      eligible: false,
      kind: "none",
      previous: "0.1.0",
      current: "0.1.0",
      reason: "Only Nemlig tests or release internals changed.",
    });

    await writeFile(path.join(repo, packagePath), `${JSON.stringify({
      name: "nemlig-assistant",
      version: "0.1.1",
      nemligRelease: { codename: "Callsign" },
      dependencies: { "example-dependency": "1.0.0" },
    }, null, 2)}\n`);
    await ledger(repo, "0.1.1", "Callsign");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "fix: package configuration");
    assert.deepEqual(checkVersionEligibility(repo, base), {
      eligible: true,
      kind: "patch",
      previous: "0.1.0",
      current: "0.1.1",
      reason: "The Nemlig package changed without a feature or breaking marker.",
    });

    await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
    await manifest(repo, "0.1.1", "Callsign");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "fix: runtime");
    assert.deepEqual(checkVersionEligibility(repo, base), {
      eligible: true,
      kind: "patch",
      previous: "0.1.0",
      current: "0.1.1",
      reason: "The Nemlig package changed without a feature or breaking marker.",
    });
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("version gate uses explicit immutable revisions and rejects unavailable comparisons", async () => {
  const { repo, base } = await fixture();
  try {
    await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
    await manifest(repo, "0.1.1", "Callsign");
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
    ["fix: patch", "0.1.1"],
    ["feat: capability", "0.2.0"],
    ["feat!: breaking interface", "1.0.0"],
  ]) {
    const { repo, base } = await fixture();
    try {
      await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
      git(repo, "add", "."); git(repo, "commit", "-qm", message!);
      assert.throws(() => checkVersionBump(repo, base, "HEAD"), /require a forward/);
      await manifest(repo, version!, "Callsign");
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
    const plan = await createReleasePlan({ codename: "Callsign", repoRoot: repo, baseRef: base, mainRef: "HEAD", mergedCandidate: true });
    assert.equal(plan.releaseKind, "none");
    assert.equal(plan.transactionAction, "no-op");
    assert.equal(plan.shouldRelease, false);
    assert.match(plan.registry.status === "unavailable" ? plan.registry.reason : "", /not required/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("release identity gate rejects reused names and mismatched ledger candidates", async () => {
  const { repo } = await fixture();
  try {
    await manifest(repo, "1.0.0", "Pantry");
    git(repo, "add", "."); git(repo, "commit", "-qm", "chore: prior release");
    const base = git(repo, "rev-parse", "HEAD");
    await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
    for (const codename of [undefined, "Pantry", "Callsign"]) {
      await manifest(repo, "1.0.1", codename);
      git(repo, "add", "."); git(repo, "commit", "-qm", "fix: candidate identity");
      if (codename === "Callsign") assert.equal(checkVersionEligibility(repo, base).eligible, true);
      else assert.throws(() => checkVersionEligibility(repo, base), /codename|ledger/i);
    }
  } finally { await rm(repo, { recursive: true, force: true }); }
});

test("codename-only and no-release overrides cannot allocate a release identity", async () => {
  for (const override of [false, true]) {
    const { repo, base } = await fixture();
    try {
      await manifest(repo, "0.1.0", "Callsign");
      git(repo, "add", "."); git(repo, "commit", "-qm", `chore: metadata${override ? "\n\nNemlig-Release: none" : ""}`);
      assert.throws(() => checkVersionEligibility(repo, base), /codename/i);
      const plan = await createReleasePlan({ codename: "Callsign", repoRoot: repo, baseRef: base, mainRef: base, noRelease: override });
      assert.equal(plan.transactionAction, "reject");
      assert.throws(() => applyReleasePlan(repo, plan), /codename/i);
    } finally { await rm(repo, { recursive: true, force: true }); }
  }
});

test("apply rejects changed manifests and a concurrent release on main", async () => {
  const { repo, base } = await fixture();
  try {
    git(repo, "branch", "release-main", base);
    await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
    const plan = await createReleasePlan({ codename: "Callsign", repoRoot: repo, baseRef: base, mainRef: "release-main", registry: { status: "unpublished" } });
    await manifest(repo, "0.1.2", "Pantry");
    const staleManifest = await readFile(path.join(repo, packagePath), "utf8");
    assert.throws(() => applyReleasePlan(repo, plan), /stale/i);
    assert.equal(await readFile(path.join(repo, packagePath), "utf8"), staleManifest);
    git(repo, "add", "."); git(repo, "commit", "-qm", "fix: concurrent release");
    git(repo, "branch", "-f", "release-main", "HEAD");
    await manifest(repo, "0.1.0");
    assert.throws(() => applyReleasePlan(repo, plan), /stale/i);
    const replanned = await createReleasePlan({ codename: "Callsign", repoRoot: repo, baseRef: base, mainRef: "release-main", registry: { status: "unpublished" } });
    assert.equal(replanned.transactionAction, "reject");
  } finally { await rm(repo, { recursive: true, force: true }); }
});

test("internal changes retain existing versions and codenames and other manifest metadata remains release-bearing", async () => {
  const { repo } = await fixture();
  try {
    await manifest(repo, "1.0.0", "Callsign");
    git(repo, "add", "."); git(repo, "commit", "-qm", "chore: prior release");
    const base = git(repo, "rev-parse", "HEAD");
    await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.test.ts"), "// fixture\n");
    git(repo, "add", ".");
    const plan = await createReleasePlan({ codename: "Callsign", repoRoot: repo, baseRef: base, mainRef: base });
    assert.equal(plan.releaseKind, "none");
    assert.equal(plan.targetCodename, "Callsign");
    applyReleasePlan(repo, plan);
    git(repo, "add", "."); git(repo, "commit", "-qm", "test: characterization");
    assert.equal(checkVersionEligibility(repo, base).eligible, false);

    const contents = JSON.parse(await readFile(path.join(repo, packagePath), "utf8"));
    contents.nemligRelease.extra = true;
    await writeFile(path.join(repo, packagePath), JSON.stringify(contents));
    const changed = await createReleasePlan({ codename: "Pantry", repoRoot: repo, baseRef: base, mainRef: base, registry: { status: "unpublished" } });
    assert.equal(changed.releaseKind, "patch");
    assert.equal(changed.targetCodename, "Pantry");
    applyReleasePlan(repo, changed);
    assert.deepEqual(JSON.parse(await readFile(path.join(repo, packagePath), "utf8")).nemligRelease, { codename: "Pantry", extra: true });
  } finally { await rm(repo, { recursive: true, force: true }); }
});

test("feature migration plans and applies 4.8.0 Callsign from the historical alpha baseline", async () => {
  const { repo } = await fixture();
  try {
    await manifest(repo, "4.7.0-alpha.71");
    git(repo, "add", "."); git(repo, "commit", "-qm", "chore: historical release");
    const base = git(repo, "rev-parse", "HEAD");
    await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
    git(repo, "add", "."); git(repo, "commit", "-qm", "feat: release identity");
    const plan = await createReleasePlan({ codename: "Callsign", repoRoot: repo, baseRef: base, mainRef: base, registry: { status: "unpublished" } });
    assert.equal(plan.targetVersion, "4.8.0");
    assert.equal(plan.targetCodename, "Callsign");
    assert.equal(plan.targetTag, "nemlig-assistant-v4.8.0");
    applyReleasePlan(repo, plan);
    git(repo, "add", "."); git(repo, "commit", "-qm", "chore: release identity");
    assert.equal(checkVersionEligibility(repo, base).eligible, true);
    await manifest(repo, "4.8.0-alpha.72", "Callsign");
    git(repo, "add", "."); git(repo, "commit", "-qm", "chore: reject suffix");
    assert.throws(() => checkVersionEligibility(repo, base), /plain|forward/);
  } finally { await rm(repo, { recursive: true, force: true }); }
});

test("internal and explicit no-release candidates reject version-only movement", async () => {
  for (const override of [false, true]) {
    const { repo, base } = await fixture();
    try {
      await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.test.ts"), "// fixture\n");
      await manifest(repo, "0.1.1");
      git(repo, "add", "."); git(repo, "commit", "-qm", `test: metadata${override ? "\n\nNemlig-Release: none" : ""}`);
      assert.throws(() => checkVersionEligibility(repo, base), /Non-release.*version/i);
      const plan = await createReleasePlan({ codename: "Callsign", repoRoot: repo, baseRef: base, mainRef: base, noRelease: override });
      assert.equal(plan.releaseKind, "none");
      assert.equal(plan.transactionAction, "reject");
      assert.throws(() => applyReleasePlan(repo, plan), /Non-release.*version/i);
    } finally { await rm(repo, { recursive: true, force: true }); }
  }
});
