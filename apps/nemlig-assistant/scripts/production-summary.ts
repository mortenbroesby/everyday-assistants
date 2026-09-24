import { readFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";

const fullSha = /^[0-9a-f]{40}$/u;
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const tagPattern = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/u;
const holdReasons = new Set(["active", "recovery", "uncertain", "explicit", "retained_window", "untracked"]);
const failureReasons = new Set([
  "ledger_missing", "ledger_invalid", "acceptance_evidence_missing", "acceptance_evidence_invalid", "retention_not_authorized",
  "deployment_not_accepted",
  "cleanup_checkpoint_invalid", "inventory_incomplete", "active_image_missing", "active_container_invalid",
  "active_container_rollout_uncertain", "registry_unavailable", "registry_delete_uncertain", "registry_gc_uncertain",
  "registry_tag_mapping_changed", "delete_readback_still_present", "delete_readback_changed", "lease_lost",
  "lease_run_active_or_unknown", "lease_acquire_failed", "lease_release_uncertain", "deadline_exceeded",
  "command_failed", "github_unavailable", "github_response_invalid", "unknown_failure",
]);
const uncertainReasons = new Set([
  "registry_delete_uncertain", "registry_gc_uncertain", "delete_readback_still_present", "delete_readback_changed",
  "lease_lost", "lease_release_uncertain", "deadline_exceeded", "command_failed", "github_unavailable",
  "retention_commit_mismatch", "retention_report_invalid", "retention_report_missing", "retention_report_contradictory",
  "retention_report_incomplete", "unknown_failure", "deployment_not_accepted",
]);
const summaryFailureReasons = new Set([...failureReasons, "retention_commit_mismatch", "retention_report_invalid", "retention_report_missing", "retention_report_contradictory"]);

export type ProductionSummaryStatus = "passed" | "failed" | "unknown";
export type CleanupSummaryStatus = "complete" | "held" | "not_run" | "failed" | "uncertain";

export interface ProductionSummary {
  commit: string;
  deployment: ProductionSummaryStatus;
  technicalAcceptance: ProductionSummaryStatus;
  ownerAcceptance: "not_run";
  cleanup: {
    status: CleanupSummaryStatus;
    reasons: string[];
    protected: Array<{ digest: string; reason: string; tags: string[] }>;
    protectedInventory: "known" | "unknown";
    protectedTotal: number;
    protectedOmitted: number;
    protectedReasonCounts: Record<string, number>;
    nextAction: string;
  };
  traffic: "not_measured";
}

export interface ProductionSummaryInput {
  commit: string;
  release?: unknown;
  retention?: unknown;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

const safeFailure = (value: unknown): string => {
  if (typeof value !== "string") return "unknown_failure";
  const reason = value.replace(/^production_retention_/u, "");
  return summaryFailureReasons.has(reason) ? reason : "unknown_failure";
};

type Hold = { digest: string; reason: string; tags: string[] };
type HoldInventory = {
  known: boolean;
  holds: Hold[];
  total: number;
  omitted: number;
  reasonCounts: Record<string, number>;
};

const safeHolds = (value: unknown): HoldInventory => {
  if (!Array.isArray(value)) return { known: false, holds: [], total: 0, omitted: 0, reasonCounts: {} };
  const holds: Hold[] = [];
  const reasonCounts: Record<string, number> = {};
  let invalid = 0;
  for (const entry of value) {
    const item = record(entry);
    const digest = item?.digest;
    const reason = item?.reason;
    if (typeof digest !== "string" || !digestPattern.test(digest) || typeof reason !== "string" || !holdReasons.has(reason)) {
      invalid += 1;
      continue;
    }
    if (!item || !Array.isArray(item.tags) || item.tags.some((tag) => typeof tag !== "string" || !tagPattern.test(tag))) {
      invalid += 1;
      continue;
    }
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    const tags = item.tags.slice(0, 8) as string[];
    if (holds.length < 20) holds.push({ digest, reason, tags });
  }
  return { known: invalid === 0, holds, total: value.length, omitted: Math.max(0, value.length - holds.length), reasonCounts };
};

const cleanupNextAction = (status: CleanupSummaryStatus): string => {
  switch (status) {
    case "complete": return "No cleanup action is pending.";
    case "held": return "preserve holds and obtain bounded provenance/reference evidence before any cleanup resume.";
    case "not_run": return "do not infer cleanup from deployment success; run the protected retention path when its evidence is available.";
    case "uncertain": return "hold cleanup and reconcile the exact prior operation and provider state before retrying.";
    case "failed": return "keep the accepted deployment state unchanged and inspect the bounded retention failure before a protected retry.";
  }
};

export function projectProductionSummary(input: ProductionSummaryInput): ProductionSummary {
  const commit = fullSha.test(input.commit) ? input.commit : "unknown";
  const release = record(input.release);
  const releaseChecks = release?.checks;
  const releaseEvidenceValid = release?.schema === 2 && typeof release?.commit === "string"
    && fullSha.test(release.commit) && Array.isArray(releaseChecks);
  const releaseMatches = releaseEvidenceValid && release?.commit === commit && commit !== "unknown";
  const checks = Array.isArray(releaseChecks) ? releaseChecks.filter((check): check is string => typeof check === "string") : [];
  const deployment: ProductionSummaryStatus = releaseMatches && release?.outcome === "success" && release.lastVerifiedState === "enabled"
    ? "passed"
    : releaseMatches && release?.outcome === "failed" ? "failed" : "unknown";
  const technicalAcceptance: ProductionSummaryStatus = deployment === "passed"
    ? checks.includes("edge_acceptance") && (checks.includes("service_fixture_acceptance") || checks.includes("authenticated_read_only_acceptance"))
      ? "passed" : "unknown"
    : releaseMatches && record(release?.acceptanceFailure) ? "failed" : "unknown";

  const retention = record(input.retention);
  const retentionCommit = retention?.commit;
  const retentionCommitMatches = typeof retentionCommit === "string" && retentionCommit === commit && commit !== "unknown";
  const holdInventory = safeHolds(retention?.protected);
  let cleanupStatus: CleanupSummaryStatus;
  let reasons: string[];
  if (!retention) {
    cleanupStatus = "uncertain";
    reasons = ["retention_report_missing"];
  } else if (!retentionCommitMatches) {
    cleanupStatus = "uncertain";
    reasons = ["retention_commit_mismatch"];
  } else if (retention.cleanupComplete === true && (retention.outcome === "failed" || typeof retention.failure === "string"
    || (retention.outcome !== undefined && retention.outcome !== "success" && retention.skipped !== true))) {
    cleanupStatus = "uncertain";
    reasons = ["retention_report_contradictory"];
  } else if (retention.cleanupComplete === true && retention.skipped !== true && !holdInventory.known) {
    cleanupStatus = "uncertain";
    reasons = ["retention_report_invalid"];
  } else if (retention.cleanupComplete === true) {
    cleanupStatus = "complete";
    reasons = retention.skipped === true ? ["already_complete"] : [];
  } else if (retention.outcome === "failed" || typeof retention.failure === "string") {
    const reason = safeFailure(retention.failure);
    cleanupStatus = uncertainReasons.has(reason) ? "uncertain" : "failed";
    reasons = [reason];
  } else if (retention.stable === false) {
    cleanupStatus = "held";
    reasons = ["inventory_unstable"];
  } else if (retention.dryRun === true) {
    cleanupStatus = "not_run";
    reasons = ["dry_run"];
  } else if (retention.cleanupComplete === false) {
    cleanupStatus = "held";
    reasons = holdInventory.known ? Object.keys(holdInventory.reasonCounts) : ["protected_hold_inventory_unknown"];
    if (reasons.length === 0) reasons = ["protected_hold"];
  } else if (retention.outcome === "not_run") {
    cleanupStatus = "not_run";
    reasons = [safeFailure(retention.failure ?? retention.reason ?? "retention_report_missing")];
  } else {
    cleanupStatus = "uncertain";
    reasons = ["retention_report_incomplete"];
  }
  return {
    commit,
    deployment,
    technicalAcceptance,
    ownerAcceptance: "not_run",
    cleanup: {
      status: cleanupStatus,
      reasons,
      protected: holdInventory.holds,
      protectedInventory: holdInventory.known ? "known" : "unknown",
      protectedTotal: holdInventory.total,
      protectedOmitted: holdInventory.omitted,
      protectedReasonCounts: holdInventory.reasonCounts,
      nextAction: cleanupNextAction(cleanupStatus),
    },
    traffic: "not_measured",
  };
}

const statusLabel = (value: ProductionSummaryStatus | CleanupSummaryStatus): string => {
  if (value === "held") return "held/incomplete";
  return value.replaceAll("_", " ");
};

export function formatProductionSummary(summary: ProductionSummary): string {
  const cleanupReasons = summary.cleanup.reasons.length > 0 ? ` (${summary.cleanup.reasons.join(", ")})` : "";
  const holds = summary.cleanup.protected.length > 0
    ? summary.cleanup.protected.map(({ digest, reason, tags }) => `  - ${digest} — ${reason}${tags.length > 0 ? ` (${tags.length} tag${tags.length === 1 ? "" : "s"})` : ""}`).join("\n")
    : "  - none";
  return [
    "## Nemlig production release summary",
    `- Source SHA: \`${summary.commit}\``,
    `- Deployment: ${statusLabel(summary.deployment)}`,
    `- Technical acceptance: ${statusLabel(summary.technicalAcceptance)}`,
    "- Owner acceptance: not run (CI synthetic acceptance is not owner proof)",
    `- Cleanup: ${statusLabel(summary.cleanup.status)}${cleanupReasons}`,
    `- Cleanup next action: ${summary.cleanup.nextAction}`,
    "- Traffic allocation: configured state is not measured by this summary; request rate is not inferred",
    summary.cleanup.protectedInventory === "known"
      ? `- Protected hold inventory: ${summary.cleanup.protectedTotal} total; ${summary.cleanup.protected.length} shown; ${summary.cleanup.protectedOmitted} omitted${Object.keys(summary.cleanup.protectedReasonCounts).length > 0 ? `; reasons ${Object.entries(summary.cleanup.protectedReasonCounts).map(([reason, count]) => `${reason}=${count}`).join(", ")}` : ""}`
      : "- Protected holds: unknown/invalid hold inventory",
    ...(summary.cleanup.protectedInventory === "known" ? ["- Protected holds:", holds] : []),
    "",
  ].join("\n");
}

export function parseProductionSummaryCli(argv: readonly string[]): { commit: string; releasePath?: string; retentionPath?: string } {
  const values = argv[0] === "--" ? argv.slice(1) : argv;
  let commit = "";
  let releasePath: string | undefined;
  let retentionPath: string | undefined;
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    const value = values[index + 1];
    if (flag === "--commit" && value) { commit = value; index += 1; }
    else if (flag === "--release" && value) { releasePath = value; index += 1; }
    else if (flag === "--retention" && value) { retentionPath = value; index += 1; }
    else throw new Error("production_summary_input_invalid");
  }
  if (!fullSha.test(commit)) throw new Error("production_summary_input_invalid");
  return { commit, ...(releasePath ? { releasePath } : {}), ...(retentionPath ? { retentionPath } : {}) };
}

const readJson = async (path: string | undefined): Promise<{ state: "missing" | "invalid" | "valid"; value?: unknown }> => {
  if (!path) return { state: "missing" };
  try { return { state: "valid", value: JSON.parse(await readFile(path, "utf8")) }; }
  catch (error: unknown) {
    return error && typeof error === "object" && "code" in error && error.code === "ENOENT"
      ? { state: "missing" } : { state: "invalid" };
  }
};

const main = async (): Promise<void> => {
  const input = parseProductionSummaryCli(process.argv.slice(2));
  const [release, retention] = await Promise.all([readJson(input.releasePath), readJson(input.retentionPath)]);
  const summary = projectProductionSummary({
    commit: input.commit,
    release: release.state === "valid" ? release.value : undefined,
    retention: retention.state === "valid"
      ? retention.value
      : { commit: input.commit, outcome: "failed", failure: retention.state === "missing" ? "retention_report_missing" : "retention_report_invalid" },
  });
  process.stdout.write(formatProductionSummary(summary));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write("production_summary_failed\n");
    process.exitCode = 1;
  });
}
