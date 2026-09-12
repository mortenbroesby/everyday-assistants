import assert from "node:assert/strict";
import test from "node:test";
import {
  assessVersionBump,
  compareRegistryVersions,
  decideRelease,
  decideTransaction,
  nextVersion,
  parseCodenameLedger,
  validateCodenameLedger,
  parseCodename,
  readPackageIdentity,
  parseBaselineVersion,
  parseVersion,
  validateRetry,
  versionSatisfies,
} from "./policy.js";

test("theme codenames are short title-case ASCII words without a sequence", () => {
  for (const word of ["Callsign", "Pantry", "Alpha", "Ab"]) assert.equal(parseCodename(word), word);
  for (const invalid of ["", "A", "callsign", "CALLSIGN", "CallSign", "Alpha-2", "Two Words", "Café", "Callsign\n", "A".repeat(25)]) {
    assert.throws(() => parseCodename(invalid), /codename/i);
  }
});

test("codename ledgers preserve one unique name and version per release", () => {
  const base = "version,codename\n4.8.0,Callsign";
  const next = base + "\n4.8.1,Pantry";
  assert.deepEqual(parseCodenameLedger(base), [{ version: "4.8.0", codename: "Callsign" }]);
  assert.doesNotThrow(() => validateCodenameLedger(base, next, { version: "4.8.1", codename: "Pantry" }, true));
  for (const invalid of ["codename,version", base + "\n4.8.1,Callsign", base + "\n4.8.0,Pantry", base + "\n4.8.1,callsign", base + "\n4.8.1-alpha.1,Pantry", base + "\n4.8.1,Pantry,extra"]) {
    assert.throws(() => parseCodenameLedger(invalid));
  }
  for (const invalid of [base, next + "\n4.8.2,Basket", "version,codename\n4.8.0,Changed\n4.8.1,Pantry"]) {
    assert.throws(() => validateCodenameLedger(base, invalid, { version: "4.8.1", codename: "Pantry" }, true), /ledger/i);
  }
  assert.throws(() => validateCodenameLedger(base, next, { version: "4.8.0", codename: "Callsign" }, false), /Non-release/i);
});

test("manifest identities permit absent historical metadata but reject malformed candidate metadata", () => {
  const version = "1.2.3-alpha.4";
  assert.deepEqual(readPackageIdentity(JSON.stringify({ version }), "fixture"), { version, codename: null });
  assert.deepEqual(readPackageIdentity(JSON.stringify({ version, nemligRelease: { codename: "Alpha" } }), "fixture"), { version, codename: "Alpha" });
  for (const nemligRelease of [null, [], {}, { codename: null }, { codename: 1 }, { codename: "alpha" }]) {
    assert.throws(() => readPackageIdentity(JSON.stringify({ version, nemligRelease }), "fixture"), /codename/i);
  }
  assert.throws(() => readPackageIdentity('{"version":42}', "fixture"), /version/i);
});

test("new releases use strict plain SemVer and historical alpha versions are baseline-only", () => {
  assert.deepEqual(parseVersion("1.2.3"), { major: 1, minor: 2, patch: 3 });
  assert.deepEqual(parseBaselineVersion("4.7.0-alpha.71"), { major: 4, minor: 7, patch: 0 });
  for (const invalid of ["01.2.3", "1.2.3-alpha.4", "1.2.3-beta.4", "1.2.3+build", "1.2", "1.2.3\n", "1.2.9007199254740992"]) {
    assert.throws(() => parseVersion(invalid), /version/i);
  }
  for (const invalid of ["1.2.3-alpha.01", "1.2.3-alpha.-1", "1.2.3-beta.4", "1.2.3+build", "1.2.3-alpha.4\n"]) {
    assert.throws(() => parseBaselineVersion(invalid), /version/i);
  }
  assert.equal(nextVersion("4.7.0-alpha.71", "4.7.0-alpha.71", "minor"), "4.8.0");
  for (const [kind, target] of [["patch", "4.8.1"], ["minor", "4.9.0"], ["major", "5.0.0"]] as const) {
    assert.equal(nextVersion("4.8.0", "4.8.0", kind), target);
    assert.equal(nextVersion("4.8.0", target, kind), target);
    assert.equal(versionSatisfies("4.8.0", target, kind), true);
  }
  assert.equal(versionSatisfies("4.8.0", "4.8.0", "patch"), false);
  assert.equal(versionSatisfies("4.7.0-alpha.71", "4.7.0", "patch"), false);
  assert.equal(versionSatisfies("4.8.0", "4.8.1-alpha.72", "patch"), false);
  assert.equal(versionSatisfies("4.8.0", "4.8.1", "none"), false);
  assert.deepEqual(assessVersionBump(parseVersion("4.8.0"), parseVersion("4.9.0")), {
    ok: true, kind: "minor", reason: "Minor bump accepted.",
  });
  assert.equal(assessVersionBump(parseVersion("4.8.0"), parseVersion("5.1.0")).ok, false);
  assert.equal(assessVersionBump(parseVersion("4.8.0"), parseVersion("4.9.1")).ok, false);
});

test("package paths and conventional commits produce scoped release decisions", () => {
  const cases = [
    ["docs", ["README.md", "openspec/config.yaml"], [{ subject: "docs: clarify" }], "none"],
    ["other assistants", ["apps/other-assistant/src/index.ts"], [{ subject: "feat: other" }], "none"],
    ["internal", ["apps/nemlig-assistant/release/policy.test.ts"], [{ subject: "test: policy" }], "none"],
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
    tag: "nemlig-assistant-v0.1.0",
    manifestVersion: "0.1.0",
    tagExists: true,
    registry: { status: "unpublished" },
  });
  assert.equal(accepted.version, "0.1.0");
  for (const suffix of ["-alpha.72", "-beta.1", "+build", "\n"]) {
    assert.throws(() => validateRetry({ tag: `nemlig-assistant-v4.8.0${suffix}`, manifestVersion: `4.8.0${suffix}`, tagExists: true, registry: { status: "unpublished" } }));
  }
  for (const input of [
    { tag: "v0.1.0", manifestVersion: "0.1.0", tagExists: true, registry: { status: "unpublished" } as const },
    { tag: "nemlig-assistant-v0.1.0", manifestVersion: "0.1.0", tagExists: false, registry: { status: "unpublished" } as const },
    { tag: "nemlig-assistant-v0.1.1", manifestVersion: "0.1.0", tagExists: true, registry: { status: "unpublished" } as const },
    { tag: "nemlig-assistant-v0.1.0", manifestVersion: "0.1.0", tagExists: true, registry: { status: "published", version: "0.1.0" } as const },
  ]) {
    assert.throws(() => validateRetry(input));
  }
});

test("release transactions accept only verified first or forward publications", () => {
  assert.equal(compareRegistryVersions("4.8.0", "4.7.0-alpha.71") > 0, true);
  assert.equal(decideTransaction({ candidateVersion: "4.8.0", mainVersion: "4.7.0-alpha.71", registry: { status: "published", version: "4.7.0-alpha.71" }, tagState: "missing" }).action, "apply");
  assert.equal(decideTransaction({
    candidateVersion: "0.1.0",
    mainVersion: "0.1.0",
    registry: { status: "unpublished" },
    tagState: "missing",
  }).action, "apply");
  assert.equal(decideTransaction({
    candidateVersion: "0.2.1",
    mainVersion: "0.2.0",
    registry: { status: "published", version: "0.1.0" },
    tagState: "missing",
  }).action, "apply");
  assert.equal(decideTransaction({
    candidateVersion: "0.2.1",
    mainVersion: "0.2.1",
    registry: { status: "published", version: "0.1.0" },
    tagState: "matching",
  }).action, "no-op");
  assert.throws(() => decideTransaction({
    candidateVersion: "0.2.0-alpha.3",
    mainVersion: "0.1.0",
    registry: { status: "unpublished" },
    tagState: "missing",
  }));

  const rejected = [
    { mainVersion: "0.2.2", registry: { status: "unpublished" } as const, tagState: "missing" as const },
    { mainVersion: "0.2.0", registry: { status: "published", version: "0.2.1" } as const, tagState: "missing" as const },
    { mainVersion: "0.2.0", registry: { status: "published", version: "0.2.2" } as const, tagState: "missing" as const },
    { mainVersion: "0.2.0", registry: { status: "unavailable", reason: "offline" } as const, tagState: "missing" as const },
    { mainVersion: null, registry: { status: "unpublished" } as const, tagState: "missing" as const },
    { mainVersion: "0.2.0", registry: { status: "unpublished" } as const, tagState: "conflicting" as const },
  ];
  for (const state of rejected) {
    assert.equal(decideTransaction({ candidateVersion: "0.2.1", ...state }).action, "reject");
  }
});
