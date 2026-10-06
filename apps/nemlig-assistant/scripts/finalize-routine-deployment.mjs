import { existsSync, readFileSync, statSync } from "node:fs";
import process from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const operationIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

const getRoutineFinalizationTarget = ({ journalPath, leasePath, candidateSha, runId, runAttempt }) => {
  if (!statSync(journalPath, { throwIfNoEntry: false })?.isFile()) return "no-journal";

  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  if (typeof journal.operationId !== "string" || !operationIdPattern.test(journal.operationId)) {
    throw new Error("Invalid deployment operation ID");
  }
  if (journal.commit !== candidateSha
    || journal.releaseRunId !== Number(runId)
    || journal.releaseRunAttempt !== Number(runAttempt)) {
    throw new Error("Deployment journal does not match this workflow run");
  }

  const alreadyReleasedPreMutationLease = journal.outcome === "failed"
    && journal.lastVerifiedState === "unchanged"
    && Array.isArray(journal.transitions) && journal.transitions.length === 0
    && !existsSync(leasePath);
  return alreadyReleasedPreMutationLease ? "released-pre-mutation-lease" : journal.operationId;
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [journalPath, leasePath] = process.argv.slice(2);
    if (!journalPath || !leasePath) throw new Error("Expected journal and lease paths");
    const target = getRoutineFinalizationTarget({
      journalPath,
      leasePath,
      candidateSha: process.env.CANDIDATE_SHA,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    });
    process.stdout.write(target);
  } catch {
    process.exitCode = 1;
  }
}
