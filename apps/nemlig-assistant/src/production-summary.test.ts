import assert from "node:assert/strict";
import test from "node:test";
import { formatProductionSummary, projectProductionSummary } from "../scripts/production-summary.js";

const commit = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;

const acceptedRelease = {
  schema: 2,
  commit,
  outcome: "success",
  lastVerifiedState: "enabled",
  checks: ["edge_acceptance", "service_fixture_acceptance"],
};

const completeCleanup = { commit, cleanupComplete: true, protected: [] };

test("summary separates deployment, technical acceptance, owner acceptance, and complete cleanup", () => {
  const summary = projectProductionSummary({
    commit,
    release: acceptedRelease,
    retention: { ...completeCleanup, deletedTags: 2 },
  });
  assert.deepEqual(summary, {
    commit,
    verifiedLiveRevision: commit,
    deployment: "passed",
    technicalAcceptance: "passed",
    ownerAcceptance: "not_run",
    cleanup: {
      status: "complete", reasons: [], protected: [], protectedInventory: "known", protectedTotal: 0,
      protectedOmitted: 0, protectedReasonCounts: {}, nextAction: "No cleanup action is pending.",
    },
    traffic: "not_measured",
  });
  assert.match(formatProductionSummary(summary), /Owner acceptance: not run/u);
  assert.match(formatProductionSummary(summary), new RegExp("Verified live revision: `" + commit + "`"));
  assert.match(formatProductionSummary(summary), /Traffic allocation: configured state is not measured by this summary; request rate is not inferred/u);
});

test("summary exposes protected and untracked holds without calling cleanup complete", () => {
  const summary = projectProductionSummary({
    commit,
    release: acceptedRelease,
    retention: {
      commit,
      cleanupComplete: false,
      protected: [
        { digest, reason: "active", tags: ["current"] },
        { digest: `sha256:${"c".repeat(64)}`, reason: "untracked", tags: ["legacy"] },
      ],
    },
  });
  assert.equal(summary.cleanup.status, "held");
  assert.deepEqual(summary.cleanup.reasons, ["active", "untracked"]);
  assert.equal(summary.cleanup.protected.length, 2);
  assert.equal(summary.cleanup.protectedTotal, 2);
  assert.equal(summary.cleanup.protectedOmitted, 0);
  assert.match(formatProductionSummary(summary), /Cleanup: held\/incomplete \(active, untracked\)/u);
  assert.match(formatProductionSummary(summary), /next action: preserve holds and obtain bounded provenance\/reference evidence/u);
});

test("summary does not claim cleanup for wrong, missing, or contradictory evidence", () => {
  for (const retention of [
    { ...completeCleanup, commit: "c".repeat(40) },
    { cleanupComplete: true, protected: [] },
    { ...completeCleanup, outcome: "failed" },
  ]) {
    const summary = projectProductionSummary({ commit, release: acceptedRelease, retention });
    assert.equal(summary.cleanup.status, "uncertain");
    assert.notEqual(summary.cleanup.status, "complete");
  }
  const invalid = projectProductionSummary({ commit, release: acceptedRelease, retention: { ...completeCleanup, protected: [{ digest: "not-a-digest", reason: "untrusted" }] } });
  assert.equal(invalid.cleanup.status, "uncertain");
  assert.match(formatProductionSummary(invalid), /unknown\/invalid hold inventory/u);
});

test("summary counts bounded hold output without hiding later reasons", () => {
  const protectedImages = Array.from({ length: 25 }, (_, index) => ({
    digest: `sha256:${index.toString(16).padStart(64, "0")}`,
    reason: index < 23 ? "untracked" : "active",
    tags: [],
  }));
  const summary = projectProductionSummary({ commit, release: acceptedRelease, retention: { commit, cleanupComplete: false, protected: protectedImages } });
  assert.equal(summary.cleanup.protectedTotal, 25);
  assert.equal(summary.cleanup.protected.length, 20);
  assert.equal(summary.cleanup.protectedOmitted, 5);
  assert.deepEqual(summary.cleanup.protectedReasonCounts, { untracked: 23, active: 2 });
  assert.match(formatProductionSummary(summary), /untracked=23, active=2/u);
});

test("summary covers unstable, dry-run, skipped, failed, uncertain, and missing evidence", () => {
  const cases = [
    [{ commit, release: acceptedRelease, retention: { commit, stable: false, cleanupStarted: false } }, "held", "inventory_unstable"],
    [{ commit, release: acceptedRelease, retention: { commit, dryRun: true, cleanupStarted: false } }, "not_run", "dry_run"],
    [{ commit, release: acceptedRelease, retention: { commit, cleanupComplete: true, skipped: true } }, "complete", "already_complete"],
    [{ commit, release: acceptedRelease, retention: { commit, outcome: "failed", failure: "ledger_missing" } }, "failed", "ledger_missing"],
    [{ commit, release: acceptedRelease, retention: { commit, outcome: "failed", failure: "registry_delete_uncertain" } }, "uncertain", "registry_delete_uncertain"],
    [{ commit, release: acceptedRelease, retention: { commit, outcome: "failed", failure: "deployment_not_accepted" } }, "uncertain", "deployment_not_accepted"],
    [{ commit, release: undefined, retention: undefined }, "uncertain", "retention_report_missing"],
  ] as const;
  for (const [input, status, reason] of cases) {
    const summary = projectProductionSummary(input);
    assert.equal(summary.cleanup.status, status);
    assert.deepEqual(summary.cleanup.reasons, [reason]);
  }
  const missing = projectProductionSummary({ commit, release: undefined, retention: undefined });
  assert.equal(missing.deployment, "unknown");
  assert.equal(missing.technicalAcceptance, "unknown");
  assert.equal(missing.ownerAcceptance, "not_run");
});

test("a failed deployment reports cleanup as intentionally not run", () => {
  const summary = projectProductionSummary({
    commit,
    release: { ...acceptedRelease, outcome: "failed", lastVerifiedState: "unchanged" },
    retention: { commit, outcome: "not_run", reason: "deployment_not_accepted" },
  });
  assert.equal(summary.deployment, "failed");
  assert.equal(summary.cleanup.status, "not_run");
  assert.deepEqual(summary.cleanup.reasons, ["deployment_not_accepted"]);
  assert.match(formatProductionSummary(summary), /Verified live revision: not proven/u);
  assert.match(formatProductionSummary(summary), /Cleanup next action: resolve the bounded deployment failure; cleanup is intentionally not run\./u);
});

test("failed deployments expose only a bounded reason and state-appropriate next action", () => {
  const disabled = projectProductionSummary({
    commit,
    release: { ...acceptedRelease, outcome: "failed", failure: "container_instance_timeout", lastVerifiedState: "disabled" },
    retention: { commit, outcome: "not_run", reason: "deployment_not_accepted" },
  });
  assert.equal(disabled.deploymentFailure, "container_instance_timeout");
  assert.match(disabled.deploymentNextAction ?? "", /protected recovery; do not retry this candidate/u);
  assert.match(formatProductionSummary(disabled), /Deployment failure: `container_instance_timeout`/u);
  assert.match(formatProductionSummary(disabled), /Deployment next action: Restore a previously accepted main revision/u);

  const unknown = projectProductionSummary({
    commit,
    release: { ...acceptedRelease, outcome: "failed", failure: "this_is_not_a_known_failure", lastVerifiedState: "unknown" },
    retention: { commit, outcome: "not_run", reason: "deployment_not_accepted" },
  });
  assert.equal(unknown.deploymentFailure, "unknown_failure");
  assert.match(unknown.deploymentNextAction ?? "", /reconcile the exact operation and provider state/u);
  assert.doesNotMatch(formatProductionSummary(unknown), /this_is_not_a_known_failure/u);
});

test("a failed candidate can report the exact accepted live revision only after restored-release acceptance", () => {
  const previous = "b".repeat(40);
  const restored = projectProductionSummary({
    commit,
    release: { ...acceptedRelease, outcome: "failed", failure: "service_fixture_acceptance_failed",
      lastVerifiedState: "restored", startingRevision: previous, checks: ["starting_version_restored"] },
    retention: { commit, outcome: "not_run", reason: "deployment_not_accepted" },
  });
  assert.equal(restored.deployment, "failed");
  assert.equal(restored.verifiedLiveRevision, previous);
  assert.match(restored.deploymentNextAction ?? "", /keep this candidate failed/u);
  assert.ok(formatProductionSummary(restored).includes(previous));

  const unaccepted = projectProductionSummary({
    commit,
    release: { ...acceptedRelease, outcome: "failed", failure: "service_fixture_acceptance_failed",
      lastVerifiedState: "restored", startingRevision: previous, checks: [] },
    retention: { commit, outcome: "not_run", reason: "deployment_not_accepted" },
  });
  assert.equal(unaccepted.verifiedLiveRevision, undefined);
  assert.match(unaccepted.deploymentNextAction ?? "", /acceptance was not proven/u);
});

test("an accepted deployment remains reported when artifact or finalization evidence is incomplete", () => {
  for (const reason of ["release_evidence_not_saved", "finalization_incomplete"]) {
    const summary = projectProductionSummary({
      commit,
      release: acceptedRelease,
      retention: { commit, outcome: "not_run", reason },
    });
    assert.equal(summary.deployment, "passed");
    assert.equal(summary.technicalAcceptance, "passed");
    assert.equal(summary.cleanup.status, "not_run");
    assert.deepEqual(summary.cleanup.reasons, [reason]);
    assert.match(formatProductionSummary(summary), new RegExp("Verified live revision: `" + commit + "`"));
    assert.match(summary.cleanup.nextAction, /reconcile the exact release journal/u);
  }
});

test("not-run cleanup cannot mask contradictory, failed, or unclassified evidence", () => {
  const cases = [
    [{ commit, outcome: "not_run", reason: "deployment_not_accepted", cleanupComplete: true }, "uncertain", "retention_report_contradictory"],
    [{ commit, outcome: "not_run", reason: "deployment_not_accepted", cleanupComplete: false }, "uncertain", "retention_report_contradictory"],
    [{ commit, outcome: "not_run", failure: "registry_delete_uncertain" }, "uncertain", "registry_delete_uncertain"],
    [{ commit, outcome: "not_run" }, "uncertain", "retention_report_invalid"],
  ] as const;
  for (const [retention, status, reason] of cases) {
    const summary = projectProductionSummary({ commit, release: acceptedRelease, retention });
    assert.equal(summary.cleanup.status, status);
    assert.deepEqual(summary.cleanup.reasons, [reason]);
  }
});

test("summary treats contradictory or partial same-commit retention evidence as uncertain", () => {
  for (const retention of [
    { ...completeCleanup, failure: "registry_delete_uncertain" },
    { commit },
  ]) {
    const summary = projectProductionSummary({ commit, release: acceptedRelease, retention });
    assert.equal(summary.cleanup.status, "uncertain");
  }
});

test("summary rejects untrusted multiline fields and wrong source commits", () => {
  const summary = projectProductionSummary({
    commit,
    release: { ...acceptedRelease, commit: "not-the-candidate\nsecret" },
    retention: { commit: "not-the-candidate\nsecret", outcome: "failed", failure: "evil\nvalue" },
  });
  assert.equal(summary.deployment, "unknown");
  assert.deepEqual(summary.cleanup.reasons, ["retention_commit_mismatch"]);
  assert.doesNotMatch(formatProductionSummary(summary), /not-the-candidate|secret|evil|value/u);
});
