import assert from "node:assert/strict";
import test from "node:test";
import { assertNoContainerRollout, assertRetentionLeaseForMutation, parseAcceptedReleaseJournal, parseProductionRetentionCli, parseRegistryCredentialOutput, parseRetentionLease, registryCredentialCommand, retentionLeaseCanBeReclaimed, retentionLeaseMatchesOperation } from "../scripts/production-retention.js";

const commit = "a".repeat(40);
const image = `sha256:${"b".repeat(64)}`;

test("retention CLI accepts direct and pnpm-forwarded argument forms", () => {
  const acceptancePath = "/tmp/latest.json";
  assert.deepEqual(parseProductionRetentionCli(["accept", commit, acceptancePath]), {
    mode: "accept", commit, acceptancePath,
  });
  assert.deepEqual(parseProductionRetentionCli(["--", "accept", commit, acceptancePath]), {
    mode: "accept", commit, acceptancePath,
  });
  assert.deepEqual(parseProductionRetentionCli(["--", "resume", commit]), { mode: "resume", commit });
  assert.deepEqual(parseProductionRetentionCli(["--", "plan", commit]), { mode: "plan", commit });
  assert.throws(() => parseProductionRetentionCli(["--", "accept", commit]), /production_retention_input_invalid/u);
  assert.throws(() => parseProductionRetentionCli(["--", "unknown", commit]), /production_retention_input_invalid/u);
});

test("registry credential output becomes Basic auth without surfacing its secret", () => {
  const authorization = parseRegistryCredentialOutput(JSON.stringify({ username: "v1", password: "credential-value-long-enough" })).authorization;
  assert.equal(authorization, `Basic ${Buffer.from("v1:credential-value-long-enough").toString("base64")}`);
  assert.throws(() => parseRegistryCredentialOutput("not-json"), /production_retention_credentials_invalid/u);
  assert.throws(() => parseRegistryCredentialOutput(JSON.stringify({ username: "other", password: "credential-value-long-enough" })), /production_retention_credentials_invalid/u);
  assert.throws(() => parseRegistryCredentialOutput(JSON.stringify({ password: "" })), /production_retention_credentials_invalid/u);
});

test("registry credential requests name the Cloudflare registry domain", () => {
  assert.deepEqual(registryCredentialCommand("pull"), ["exec", "wrangler", "containers", "registries", "credentials", "registry.cloudflare.com", "--pull", "--expiration-minutes", "5", "--json", "--env", "production"]);
  assert.deepEqual(registryCredentialCommand("push"), ["exec", "wrangler", "containers", "registries", "credentials", "registry.cloudflare.com", "--push", "--expiration-minutes", "5", "--json", "--env", "production"]);
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

test("only read-only plans run without a retention lease", async () => {
  const calls: string[] = [];
  const guards = {
    assertUnowned: async () => { calls.push("unowned"); },
    assertOwned: async () => { calls.push("owned"); },
  };
  await assertRetentionLeaseForMutation("resume", guards);
  await assertRetentionLeaseForMutation("accept", guards);
  await assertRetentionLeaseForMutation("plan", guards);
  assert.deepEqual(calls, ["owned", "owned", "unowned"]);
});

test("accept can reclaim its own interrupted lease without replacing a prior cleanup checkpoint first", () => {
  const priorCommit = "a".repeat(40);
  const acceptedCommit = "b".repeat(40);
  assert.equal(retentionLeaseMatchesOperation(priorCommit, priorCommit, acceptedCommit, "accept"), true,
    "an older completed retention run can be reconciled before accepting a new release");
  assert.equal(retentionLeaseMatchesOperation(acceptedCommit, priorCommit, acceptedCommit, "accept"), true,
    "a retry can reclaim a lease created before its acceptance checkpoint was persisted");
  assert.equal(retentionLeaseMatchesOperation(acceptedCommit, priorCommit, acceptedCommit, "resume"), false,
    "resume must still be tied to the latest accepted release");
  assert.equal(retentionLeaseMatchesOperation("c".repeat(40), priorCommit, acceptedCommit, "accept"), false);
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
