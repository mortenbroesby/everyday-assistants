import assert from "node:assert/strict";
import test from "node:test";
import { assertNoContainerRollout, assertRetentionLeaseForMutation, parseAcceptedReleaseJournal, parseRegistryCredentialOutput, parseRetentionDeletionEnabled, parseRetentionLease, retentionLeaseCanBeReclaimed } from "../scripts/production-retention.js";

const commit = "a".repeat(40);
const image = `sha256:${"b".repeat(64)}`;

test("registry credential output becomes Basic auth without surfacing its secret", () => {
  const authorization = parseRegistryCredentialOutput(JSON.stringify({ username: "v1", password: "credential-value-long-enough" })).authorization;
  assert.equal(authorization, `Basic ${Buffer.from("v1:credential-value-long-enough").toString("base64")}`);
  assert.throws(() => parseRegistryCredentialOutput("not-json"), /production_retention_credentials_invalid/u);
  assert.throws(() => parseRegistryCredentialOutput(JSON.stringify({ username: "other", password: "credential-value-long-enough" })), /production_retention_credentials_invalid/u);
  assert.throws(() => parseRegistryCredentialOutput(JSON.stringify({ password: "" })), /production_retention_credentials_invalid/u);
});

test("retention lease is a strict, run-bound owner marker", () => {
  const lease = {
    schema: 1,
    kind: "image-retention",
    operationId: "11111111-2222-4333-8444-555555555555",
    runId: 123,
    runAttempt: 2,
    commit,
    startedAt: "2026-09-23T08:00:00.000Z",
  };
  const parsed = parseRetentionLease(JSON.stringify(lease));
  assert.deepEqual(parsed, lease);
  assert.equal(retentionLeaseCanBeReclaimed(parsed, { status: "completed", runAttempt: 2, path: ".github/workflows/nemlig-production.yml" }), true);
  assert.equal(retentionLeaseCanBeReclaimed(parsed, { status: "in_progress", runAttempt: 2, path: ".github/workflows/nemlig-production.yml" }), false);
  assert.equal(retentionLeaseCanBeReclaimed(parsed, { status: "completed", runAttempt: 1, path: ".github/workflows/nemlig-production.yml" }), false);
  assert.equal(retentionLeaseCanBeReclaimed(parsed, { status: "completed", runAttempt: 2, path: ".github/workflows/other.yml" }), false);
  assert.throws(() => parseRetentionLease(JSON.stringify({ ...lease, runAttempt: 0 })), /production_retention_lease_invalid/u);
  assert.throws(() => parseRetentionLease(JSON.stringify({ ...lease, kind: "deployment" })), /production_retention_lease_invalid/u);
});

test("running image references must match the active application version before retention can plan deletion", () => {
  assert.doesNotThrow(() => assertNoContainerRollout(JSON.stringify([
    { id: "instance-1", state: "running", version: 84 },
  ]), 84));
  assert.doesNotThrow(() => assertNoContainerRollout(JSON.stringify([
    { id: "instance-1", state: "inactive", version: null },
  ]), 84));
  assert.doesNotThrow(() => assertNoContainerRollout("[]", 84));
  for (const raw of [
    JSON.stringify([{ id: "old", state: "running", version: 83 }]),
    JSON.stringify([{ id: "new", state: "provisioning", version: 84 }]),
    JSON.stringify([{ id: "old", state: "stopping", version: 83 }]),
    JSON.stringify([{ id: "one", state: "running", version: 84 }, { id: "two", state: "running", version: 83 }]),
    "not-json",
  ]) assert.throws(() => assertNoContainerRollout(raw, 84), /production_retention_active_container_/u);
});

test("retention readbacks under an owned lease do not mistake that lease for a competing deployment", async () => {
  const calls: string[] = [];
  const guards = {
    assertUnowned: async () => { calls.push("unowned"); },
    assertOwned: async () => { calls.push("owned"); },
  };
  await assertRetentionLeaseForMutation("resume", guards);
  assert.deepEqual(calls, ["owned"]);
  await assertRetentionLeaseForMutation("accept", guards);
  await assertRetentionLeaseForMutation("plan", guards);
  assert.deepEqual(calls, ["owned", "unowned", "unowned"]);
});

test("image deletion stays disabled until the one-time dry-run review gate is enabled", () => {
  assert.equal(parseRetentionDeletionEnabled(undefined), false);
  assert.equal(parseRetentionDeletionEnabled(""), false);
  assert.equal(parseRetentionDeletionEnabled("false"), false);
  assert.equal(parseRetentionDeletionEnabled("true"), true);
  assert.throws(() => parseRetentionDeletionEnabled("yes"), /production_retention_policy_invalid/u);
});

test("only exact successful read-only runtime acceptance can seed the cleanup ledger", () => {
  const journal = {
    schema: 2,
    commit,
    outcome: "success",
    lastVerifiedState: "enabled",
    enabledImage: image,
    completedAt: "2026-09-23T08:00:00.000Z",
    checks: ["edge_acceptance", "service_fixture_acceptance"],
  };
  assert.deepEqual(parseAcceptedReleaseJournal(JSON.stringify(journal), commit), {
    commit, digest: image, acceptedAt: journal.completedAt,
  });
  assert.throws(() => parseAcceptedReleaseJournal(JSON.stringify({ ...journal, outcome: "failed" }), commit), /production_retention_acceptance_evidence_invalid/u);
  assert.throws(() => parseAcceptedReleaseJournal(JSON.stringify({ ...journal, checks: ["edge_acceptance"] }), commit), /production_retention_acceptance_evidence_invalid/u);
  assert.throws(() => parseAcceptedReleaseJournal(JSON.stringify(journal), "c".repeat(40)), /production_retention_acceptance_evidence_invalid/u);
});
