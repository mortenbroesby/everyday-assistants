import assert from "node:assert/strict";
import test from "node:test";
import {
  assessVersionBump,
  decideRelease,
  decideTransaction,
  nextVersion,
  parseBaselineVersion,
  parseVersion,
  validateRetry,
  versionSatisfies,
} from "./policy.js";

test("strict versions and the legacy bootstrap preserve a monotonic alpha increment", () => {
  assert.deepEqual(parseVersion("1.2.3-alpha.4"), { major: 1, minor: 2, patch: 3, increment: 4 });
  for (const invalid of ["1.2.3", "01.2.3-alpha.4", "1.2.3-beta.4", "1.2.3-alpha.-1"]) {
    assert.throws(() => parseVersion(invalid));
  }
  assert.equal(versionSatisfies("0.1.0", "0.1.0-alpha.0", "minor"), true);
  assert.equal(nextVersion("0.1.0", "0.1.0-alpha.0", "minor"), "0.1.0-alpha.0");
  assert.deepEqual(
    assessVersionBump(parseVersion("0.3.0-alpha.8"), parseVersion("0.4.0-alpha.9")),
    { ok: true, kind: "minor", reason: "Minor bump accepted." },
  );
  assert.equal(
    assessVersionBump(parseVersion("0.3.0-alpha.8"), parseVersion("0.4.0-alpha.8")).ok,
    false,
  );
  assert.equal(parseBaselineVersion("0.1.0").increment, -1);
});

test("package paths and conventional commits produce scoped release decisions", () => {
  const cases = [
    ["docs", ["README.md", "openspec/config.yaml"], [{ subject: "docs: clarify" }], "none"],
    ["other assistants", ["apps/other-assistant/src/index.ts"], [{ subject: "feat: other" }], "none"],
    ["internal", ["apps/nemlig-assistant/release/policy.test.ts"], [{ subject: "test: policy" }], "increment"],
    ["runtime fix", ["apps/nemlig-assistant/src/client.ts"], [{ subject: "fix: client" }], "patch"],
    ["runtime feature", ["apps/nemlig-assistant/src/client.ts"], [{ subject: "feat: client" }], "minor"],
    ["runtime break", ["apps/nemlig-assistant/src/client.ts"], [{ subject: "feat!: client" }], "major"],
    ["lock only", ["pnpm-lock.yaml"], [{ subject: "chore: lock" }], "none"],
  ] as const;
  for (const [name, changedFiles, commits, expected] of cases) {
    assert.equal(decideRelease({ changedFiles, commits }).kind, expected, name);
  }
  assert.deepEqual(
    decideRelease({
      changedFiles: ["apps/nemlig-assistant/package.json", "pnpm-lock.yaml"],
      commits: [{ subject: "fix: dependencies" }],
    }).releaseFiles,
    ["apps/nemlig-assistant/package.json", "pnpm-lock.yaml"],
  );
  assert.equal(decideRelease({
    changedFiles: ["apps/nemlig-assistant/src/client.ts"],
    commits: [{ subject: "fix: metadata", body: "Nemlig-Release: none" }],
  }).kind, "none");
});

test("publication retry accepts only an existing matching unpublished tag", () => {
  const accepted = validateRetry({
    tag: "nemlig-assistant-v0.1.0-alpha.0",
    manifestVersion: "0.1.0-alpha.0",
    tagExists: true,
    registry: { status: "unpublished" },
  });
  assert.equal(accepted.version, "0.1.0-alpha.0");
  for (const input of [
    { tag: "v0.1.0-alpha.0", manifestVersion: "0.1.0-alpha.0", tagExists: true, registry: { status: "unpublished" } as const },
    { tag: "nemlig-assistant-v0.1.0-alpha.0", manifestVersion: "0.1.0-alpha.0", tagExists: false, registry: { status: "unpublished" } as const },
    { tag: "nemlig-assistant-v0.1.0-alpha.1", manifestVersion: "0.1.0-alpha.0", tagExists: true, registry: { status: "unpublished" } as const },
    { tag: "nemlig-assistant-v0.1.0-alpha.0", manifestVersion: "0.1.0-alpha.0", tagExists: true, registry: { status: "published", version: "0.1.0-alpha.0" } as const },
  ]) {
    assert.throws(() => validateRetry(input));
  }
});

test("release transactions accept only verified first or forward publications", () => {
  assert.equal(decideTransaction({
    candidateVersion: "0.1.0-alpha.0",
    mainVersion: "0.1.0",
    registry: { status: "unpublished" },
    tagState: "missing",
  }).action, "apply");
  assert.equal(decideTransaction({
    candidateVersion: "0.2.0-alpha.2",
    mainVersion: "0.2.0-alpha.1",
    registry: { status: "published", version: "0.1.0-alpha.0" },
    tagState: "missing",
  }).action, "apply");
  assert.equal(decideTransaction({
    candidateVersion: "0.2.0-alpha.2",
    mainVersion: "0.2.0-alpha.2",
    registry: { status: "published", version: "0.1.0-alpha.0" },
    tagState: "matching",
  }).action, "no-op");
  assert.throws(() => decideTransaction({
    candidateVersion: "0.2.0",
    mainVersion: "0.1.0-alpha.0",
    registry: { status: "unpublished" },
    tagState: "missing",
  }));

  const rejected = [
    { mainVersion: "0.2.0-alpha.3", registry: { status: "unpublished" } as const, tagState: "missing" as const },
    { mainVersion: "0.2.0-alpha.1", registry: { status: "published", version: "0.2.0-alpha.2" } as const, tagState: "missing" as const },
    { mainVersion: "0.2.0-alpha.1", registry: { status: "published", version: "0.2.0-alpha.3" } as const, tagState: "missing" as const },
    { mainVersion: "0.2.0-alpha.1", registry: { status: "unavailable", reason: "offline" } as const, tagState: "missing" as const },
    { mainVersion: null, registry: { status: "unpublished" } as const, tagState: "missing" as const },
    { mainVersion: "0.2.0-alpha.1", registry: { status: "unpublished" } as const, tagState: "conflicting" as const },
  ];
  for (const state of rejected) {
    assert.equal(decideTransaction({ candidateVersion: "0.2.0-alpha.2", ...state }).action, "reject");
  }
});
