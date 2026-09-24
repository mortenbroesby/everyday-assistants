import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCurrentDeployment, parseDeploymentJournal } from "./production-deploy.js";

const ownerRepository = "mortenbroesby/everyday-assistants";
const workerName = "nemlig-mcp-cloudflare-production";
const sharedLockBranch = "codex-lock/nemlig-production";
const reportPath = "worker-version-retention.json";
const versionId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const fullSha = /^[0-9a-f]{40}$/u;
const maxPages = 100;
const reportTailLimit = 32;
const maxCommandOutput = 4 * 1024 * 1024;

export interface WorkerVersion {
  id: string;
  createdOn: string;
}

export interface WorkerVersionRetentionPlan {
  cutoff: string;
  protectedIds: string[];
  candidates: WorkerVersion[];
}

export interface WorkerVersionRetentionReport {
  policy: "worker-version-age";
  cutoff: string;
  listed: number;
  protected: string[];
  deleted: string[];
  alreadyAbsent: string[];
  cleanupComplete: boolean;
}

interface DurableWorkerRetentionReport {
  schema: 1;
  kind: "worker-version-retention";
  operationId: string;
  runId: number;
  runAttempt: number;
  commit: string;
  cutoff: string;
  state: "running" | "uncertain" | "complete";
  listed: number;
  candidateCount: number;
  protected: string[];
  deletedCount: number;
  deletedTail: string[];
  alreadyAbsentCount: number;
  alreadyAbsentTail: string[];
  pending?: string;
  failure?: string;
}

interface GithubResponse {
  status: number;
  value?: Record<string, unknown>;
}

interface WorkerLease {
  head: string;
}

const fail = (reason: string): never => { throw new Error(`worker_version_retention_${reason}`); };

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

const validTimestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

const tail = (values: readonly string[]): string[] => values.slice(-reportTailLimit);

export function parseWorkerVersionsPage(raw: unknown): { versions: WorkerVersion[]; page: number; totalPages: number } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("page_invalid");
  const root = raw as Record<string, unknown>;
  if (root.success !== true || !Array.isArray(root.result) || !root.result_info
    || typeof root.result_info !== "object" || Array.isArray(root.result_info)) return fail("page_invalid");
  const info = root.result_info as Record<string, unknown>;
  if (!Number.isSafeInteger(info.page) || !Number.isSafeInteger(info.total_pages)
    || (info.page as number) < 1 || (info.total_pages as number) < (info.page as number)) return fail("pagination_invalid");
  const optionalCount = (key: string): number | undefined => {
    const value = info[key];
    if (value === undefined) return undefined;
    if (!Number.isSafeInteger(value) || (value as number) < 0) return fail("cardinality_invalid");
    return value as number;
  };
  const count = optionalCount("count");
  const perPage = optionalCount("per_page");
  const totalCount = optionalCount("total_count");
  if (count !== undefined && count !== root.result.length) return fail("cardinality_invalid");
  if (perPage !== undefined && perPage < 1) return fail("cardinality_invalid");
  if (totalCount !== undefined && perPage !== undefined
    && (info.total_pages as number) !== Math.max(1, Math.ceil(totalCount / perPage))) return fail("cardinality_invalid");
  const versions = (root.result as unknown[]).map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail("version_invalid");
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || !versionId.test(item.id) || !validTimestamp(item.created_on)) return fail("version_invalid");
    return { id: item.id, createdOn: new Date(item.created_on).toISOString() };
  });
  return { versions, page: info.page as number, totalPages: info.total_pages as number };
}

export function parseProtectedVersionIds(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
  if (values.some((value) => !versionId.test(value))) return fail("protected_id_invalid");
  return [...new Set(values)];
}

export function recoveryVersionIdsFromJournal(raw: string): string[] {
  const journal = parseDeploymentJournal(raw);
  return [...new Set([journal.startingVersion, journal.disabledVersion, journal.enabledVersion].filter(
    (value): value is string => typeof value === "string",
  ))];
}

export function planWorkerVersionRetention(
  versions: readonly WorkerVersion[],
  now: string,
  protectedIds: readonly string[],
): WorkerVersionRetentionPlan {
  if (!validTimestamp(now)) return fail("cutoff_invalid");
  const seen = new Set<string>();
  const normalized = versions.map((version) => ({ ...version, createdOn: validTimestamp(version.createdOn) ? new Date(version.createdOn).toISOString() : version.createdOn }));
  for (const version of normalized) {
    if (!versionId.test(version.id) || !validTimestamp(version.createdOn) || seen.has(version.id)) return fail("version_invalid");
    seen.add(version.id);
  }
  const cutoff = new Date(Date.parse(now) - 48 * 60 * 60 * 1000).toISOString();
  const protectedSet = new Set(protectedIds);
  if ([...protectedSet].some((id) => !versionId.test(id))) return fail("protected_id_invalid");
  return {
    cutoff,
    protectedIds: [...protectedSet].sort(),
    candidates: normalized
      .filter((version) => !protectedSet.has(version.id) && version.createdOn < cutoff)
      .sort((left, right) => left.createdOn.localeCompare(right.createdOn) || left.id.localeCompare(right.id)),
  };
}

export async function executeWorkerVersionRetention(
  plan: WorkerVersionRetentionPlan,
  dependencies: {
    list: () => Promise<readonly WorkerVersion[]>;
    protectedIds: () => Promise<readonly string[]>;
    delete: (id: string) => Promise<void>;
    beforeDelete?: (id: string) => Promise<void>;
    afterDelete?: (id: string) => Promise<void>;
    onAlreadyAbsent?: (id: string) => Promise<void>;
  },
): Promise<WorkerVersionRetentionReport> {
  const deleted: string[] = [];
  const alreadyAbsent: string[] = [];
  for (const candidate of plan.candidates) {
    const current = await dependencies.list();
    const currentProtected = new Set(await dependencies.protectedIds());
    const fresh = current.find(({ id }) => id === candidate.id);
    if (!fresh) {
      alreadyAbsent.push(candidate.id);
      await dependencies.onAlreadyAbsent?.(candidate.id);
      continue;
    }
    if (currentProtected.has(candidate.id) || fresh.createdOn >= plan.cutoff) return fail("state_changed");
    await dependencies.beforeDelete?.(candidate.id);
    await dependencies.delete(candidate.id);
    const after = await dependencies.list();
    if (after.some(({ id }) => id === candidate.id)) return fail("delete_readback_uncertain");
    deleted.push(candidate.id);
    await dependencies.afterDelete?.(candidate.id);
  }
  const remaining = await dependencies.list();
  const finalProtected = new Set(await dependencies.protectedIds());
  const incomplete = remaining.some(({ id, createdOn }) => !finalProtected.has(id) && createdOn < plan.cutoff);
  return {
    policy: "worker-version-age",
    cutoff: plan.cutoff,
    listed: remaining.length,
    protected: [...finalProtected].sort(),
    deleted,
    alreadyAbsent,
    cleanupComplete: !incomplete,
  };
}

interface ApiPage {
  versions: WorkerVersion[];
  page: number;
  totalPages: number;
}

export async function collectWorkerVersions(
  fetcher: (page: number) => Promise<unknown>,
): Promise<WorkerVersion[]> {
  const all: WorkerVersion[] = [];
  const seen = new Set<string>();
  let totalPages = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const current: ApiPage = parseWorkerVersionsPage(await fetcher(page));
    if (current.page !== page || (totalPages !== 0 && current.totalPages !== totalPages)) return fail("pagination_changed");
    totalPages = current.totalPages;
    for (const version of current.versions) {
      if (seen.has(version.id)) return fail("pagination_duplicate");
      seen.add(version.id);
      all.push(version);
    }
    if (page === totalPages) return all;
  }
  return fail("pagination_incomplete");
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const runWranglerCommand = (args: string[], env: NodeJS.ProcessEnv, signal: AbortSignal, timeoutMs = 120_000): Promise<string> =>
  new Promise((resolvePromise, reject) => {
    if (signal.aborted) {
      reject(new Error("worker_version_retention_command_cancelled"));
      return;
    }
    const child = spawn("pnpm", ["exec", "wrangler", ...args], {
      cwd: packageRoot,
      env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    let failure: Error | undefined;
    let finished = false;
    let killTimer: NodeJS.Timeout | undefined;
    const finish = (error?: Error): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolvePromise(output);
    };
    const terminate = (error: Error): void => {
      if (failure || finished) return;
      failure = error;
      try { process.kill(process.platform === "win32" ? child.pid! : -child.pid!, "SIGTERM"); } catch { /* already exited */ }
      killTimer = setTimeout(() => {
        try { process.kill(process.platform === "win32" ? child.pid! : -child.pid!, "SIGKILL"); } catch { /* already exited */ }
      }, 5_000);
    };
    const abort = (): void => terminate(new Error("worker_version_retention_command_cancelled"));
    const timeout = setTimeout(() => terminate(new Error("worker_version_retention_command_timeout")), timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      if (Buffer.byteLength(output, "utf8") + chunk.length > maxCommandOutput) terminate(new Error("worker_version_retention_command_output_oversized"));
      else output += chunk.toString();
    });
    child.once("error", () => finish(new Error("worker_version_retention_command_failed")));
    child.once("close", (code) => code === 0 && !failure ? finish() : finish(failure ?? new Error("worker_version_retention_command_failed")));
  });

const parseDurableReport = (value: unknown): DurableWorkerRetentionReport => {
  const report = record(value);
  if (!report || report.schema !== 1 || report.kind !== "worker-version-retention"
    || typeof report.operationId !== "string" || !versionId.test(report.operationId)
    || !Number.isSafeInteger(report.runId) || (report.runId as number) < 1
    || !Number.isSafeInteger(report.runAttempt) || (report.runAttempt as number) < 1
    || typeof report.commit !== "string" || !fullSha.test(report.commit)
    || typeof report.cutoff !== "string" || !validTimestamp(report.cutoff)
    || !["running", "uncertain", "complete"].includes(report.state as string)
    || !Number.isSafeInteger(report.listed) || !Number.isSafeInteger(report.candidateCount)
    || !Array.isArray(report.protected) || report.protected.some((id) => typeof id !== "string" || !versionId.test(id))
    || !Number.isSafeInteger(report.deletedCount) || !Array.isArray(report.deletedTail)
    || report.deletedTail.some((id) => typeof id !== "string" || !versionId.test(id))
    || !Number.isSafeInteger(report.alreadyAbsentCount) || !Array.isArray(report.alreadyAbsentTail)
    || report.alreadyAbsentTail.some((id) => typeof id !== "string" || !versionId.test(id))
    || (report.pending !== undefined && (typeof report.pending !== "string" || !versionId.test(report.pending)))
    || (report.failure !== undefined && (typeof report.failure !== "string" || !/^worker_version_retention_[a-z0-9_]+$/u.test(report.failure)))) {
    return fail("durable_report_invalid");
  }
  return report as unknown as DurableWorkerRetentionReport;
};

const parseRunNumber = (value: string | undefined, reason: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fail(reason);
  return parsed;
};

const main = async (): Promise<void> => {
  const values = process.argv.slice(2)[0] === "--" ? process.argv.slice(3) : process.argv.slice(2);
  let commit = "";
  let journalPath: string | undefined;
  let resume = false;
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === "--resume") resume = true;
    else if (flag === "--commit" && values[index + 1]) commit = values[++index]!;
    else if (flag === "--journal" && values[index + 1]) journalPath = values[++index]!;
    else return fail("input_invalid");
  }
  if (!fullSha.test(commit)) return fail("input_invalid");

  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const githubToken = process.env.GH_TOKEN;
  if (!account || !/^[0-9a-f]{32}$/u.test(account) || !token || !githubToken
    || process.env.GITHUB_REPOSITORY !== ownerRepository) return fail("environment_invalid");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600_000);
  let lease: WorkerLease | undefined;
  let durable: DurableWorkerRetentionReport | undefined;
  let github: ((method: string, path: string, body?: unknown) => Promise<GithubResponse>) | undefined;
  try {
    github = async (method, path, body) => {
      if (controller.signal.aborted) return fail("deadline_exceeded");
      let response: Response;
      try {
        response = await fetch(`https://api.github.com/repos/${ownerRepository}/${path}`, {
          method,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch { return fail("github_unavailable"); }
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > 512 * 1024) return fail("github_response_oversized");
      if (!text) return { status: response.status };
      try {
        const value = record(JSON.parse(text));
        return { status: response.status, ...(value ? { value } : {}) };
      } catch { return fail("github_response_invalid"); }
    };
    const requireValue = (response: GithubResponse, reason: string): Record<string, unknown> => {
      if (response.status < 200 || response.status >= 300 || !response.value) return fail(`${reason}_${response.status}`);
      return response.value;
    };
    const readHead = async (): Promise<string | undefined> => {
      const response = await github!("GET", `git/ref/heads/${sharedLockBranch}`);
      if (response.status === 404) return undefined;
      const sha = record(requireValue(response, "shared_lease_read_failed").object)?.sha;
      if (typeof sha !== "string" || !fullSha.test(sha)) return fail("shared_lease_invalid");
      return sha;
    };
    const commitReport = async (state: DurableWorkerRetentionReport, parent?: string): Promise<string> => {
      const serialized = JSON.stringify(state);
      if (Buffer.byteLength(serialized, "utf8") > 32 * 1024) return fail("durable_report_oversized");
      const blob = requireValue(await github!("POST", "git/blobs", { content: serialized, encoding: "utf-8" }), "shared_lease_write_failed");
      const blobSha = blob.sha;
      if (typeof blobSha !== "string" || !fullSha.test(blobSha)) return fail("shared_lease_write_failed");
      const tree = requireValue(await github!("POST", "git/trees", { tree: [{ path: reportPath, mode: "100644", type: "blob", sha: blobSha }] }), "shared_lease_write_failed");
      const treeSha = tree.sha;
      if (typeof treeSha !== "string" || !fullSha.test(treeSha)) return fail("shared_lease_write_failed");
      const commitValue = requireValue(await github!("POST", "git/commits", {
        message: `Nemlig Worker version retention ${state.operationId}`,
        tree: treeSha,
        ...(parent ? { parents: [parent] } : {}),
      }), "shared_lease_write_failed");
      const commitSha = commitValue.sha;
      if (typeof commitSha !== "string" || !fullSha.test(commitSha)) return fail("shared_lease_write_failed");
      return commitSha;
    };
    const readReport = async (): Promise<DurableWorkerRetentionReport> => {
      const response = requireValue(await github!("GET", `contents/${reportPath}?ref=${encodeURIComponent(sharedLockBranch)}`), "shared_lease_read_failed");
      if (typeof response.content !== "string") return fail("durable_report_invalid");
      try { return parseDurableReport(JSON.parse(Buffer.from(response.content.replace(/\s/gu, ""), "base64").toString("utf8"))); }
      catch { return fail("durable_report_invalid"); }
    };
    const update = async (): Promise<void> => {
      if (!lease || !durable) return fail("shared_lease_missing");
      if (await readHead() !== lease.head) return fail("shared_lease_lost");
      const next = await commitReport(durable, lease.head);
      const response = await github!("PATCH", `git/refs/heads/${sharedLockBranch}`, { sha: next, force: false });
      if (response.status < 200 || response.status >= 300) return fail("shared_lease_lost");
      lease.head = next;
    };
    const release = async (): Promise<void> => {
      if (!lease) return;
      if (await readHead() !== lease.head) return fail("shared_lease_lost");
      const response = await github!("DELETE", `git/refs/heads/${sharedLockBranch}`);
      if (response.status < 200 || response.status >= 300) {
        if (await readHead()) return fail("shared_lease_release_uncertain");
      }
      lease = undefined;
    };

    const runId = parseRunNumber(process.env.GITHUB_RUN_ID, "lease_environment_invalid");
    const runAttempt = parseRunNumber(process.env.GITHUB_RUN_ATTEMPT, "lease_environment_invalid");
    const existingHead = await readHead();
    if (existingHead) {
      if (!resume) return fail("shared_lease_unavailable");
      durable = await readReport();
      if (durable.commit !== commit) return fail("resume_state_invalid");
      lease = { head: existingHead };
      if (durable.state === "complete") {
        await release();
        console.log(JSON.stringify({
          policy: "worker-version-age",
          cutoff: durable.cutoff,
          listed: durable.listed,
          protected: durable.protected,
          deleted: durable.deletedTail,
          alreadyAbsent: durable.alreadyAbsentTail,
          deletedCount: durable.deletedCount,
          alreadyAbsentCount: durable.alreadyAbsentCount,
          cleanupComplete: true,
          operationId: durable.operationId,
          reconciled: true,
        }));
        return;
      }
    } else {
      if (resume) return fail("shared_lease_missing");
      const now = new Date().toISOString();
      durable = {
        schema: 1, kind: "worker-version-retention", operationId: randomUUID(), runId, runAttempt, commit,
        cutoff: new Date(Date.parse(now) - 48 * 60 * 60 * 1000).toISOString(), state: "running", listed: 0,
        candidateCount: 0, protected: [], deletedCount: 0, deletedTail: [], alreadyAbsentCount: 0, alreadyAbsentTail: [],
      };
      const initial = await commitReport(durable);
      const response = await github!("POST", "git/refs", { ref: `refs/heads/${sharedLockBranch}`, sha: initial });
      if (response.status < 200 || response.status >= 300) return fail("shared_lease_unavailable");
      lease = { head: initial };
    }

    const configuredRecoveryIds = parseProtectedVersionIds(process.env.NEMLIG_WORKER_VERSION_RECOVERY_IDS);
    const reviewedRecovery = process.env.NEMLIG_WORKER_VERSION_RECOVERY_REVIEWED === "true";
    let journalRecoveryIds: string[] = [];
    if (journalPath) journalRecoveryIds = recoveryVersionIdsFromJournal(await readFile(journalPath, "utf8"));
    else if (!reviewedRecovery) return fail("recovery_references_unavailable");
    if (configuredRecoveryIds.length > 0 && !reviewedRecovery) return fail("recovery_references_unreviewed");
    const recoveryIds = [...new Set([...journalRecoveryIds, ...(resume ? configuredRecoveryIds : [])])];
    const api = async (page: number): Promise<unknown> => {
      let response: Response;
      try {
        response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/workers/${workerName}/versions?page=${page}&per_page=100`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: controller.signal,
        });
      } catch { return fail("provider_read_failed"); }
      if (!response.ok) return fail("provider_read_failed");
      try { return await response.json(); } catch { return fail("provider_response_invalid"); }
    };
    const list = (): Promise<WorkerVersion[]> => collectWorkerVersions(api);
    const readActive = async (): Promise<string> => parseCurrentDeployment(await runWranglerCommand(["deployments", "list", "--env", "production", "--json"], process.env, controller.signal)).version;
    const versions = await list();
    const active = await readActive();
    const plan = planWorkerVersionRetention(versions, new Date().toISOString(), [active, ...recoveryIds]);
    if (durable.pending && versions.some(({ id }) => id === durable!.pending)) return fail("pending_delete_requires_reconciliation");
    durable = {
      ...durable,
      cutoff: plan.cutoff,
      listed: versions.length,
      candidateCount: plan.candidates.length,
      protected: plan.protectedIds,
      pending: undefined,
      failure: undefined,
    };
    await update();
    if (process.env.NEMLIG_WORKER_VERSION_RETENTION_DRY_RUN === "true") {
      await release();
      console.log(JSON.stringify({ policy: "worker-version-age", cutoff: plan.cutoff, listed: versions.length, protected: plan.protectedIds, candidates: plan.candidates.map(({ id }) => id), cleanupComplete: false, dryRun: true }));
      return;
    }
    const report = await executeWorkerVersionRetention(plan, {
      list,
      protectedIds: async () => [await readActive(), ...recoveryIds],
      beforeDelete: async (id) => { durable = { ...durable!, pending: id, state: "running" }; await update(); },
      onAlreadyAbsent: async (id) => { durable = { ...durable!, alreadyAbsentCount: durable!.alreadyAbsentCount + 1, alreadyAbsentTail: tail([...durable!.alreadyAbsentTail, id]) }; await update(); },
      delete: async (id) => {
        let response: Response;
        try {
          response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/workers/${workerName}/versions/${id}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: controller.signal,
          });
        } catch { return fail("delete_uncertain"); }
        if (!response.ok) return fail("delete_uncertain");
      },
      afterDelete: async (id) => { durable = { ...durable!, pending: undefined, deletedCount: durable!.deletedCount + 1, deletedTail: tail([...durable!.deletedTail, id]) }; await update(); },
    });
    durable = {
      ...durable,
      state: report.cleanupComplete ? "complete" : "uncertain",
      listed: report.listed,
      protected: report.protected,
      pending: undefined,
      deletedCount: report.deleted.length,
      deletedTail: tail(report.deleted),
      alreadyAbsentCount: report.alreadyAbsent.length,
      alreadyAbsentTail: tail(report.alreadyAbsent),
    };
    await update();
    await release();
    console.log(JSON.stringify({
      ...report,
      operationId: durable.operationId,
      deleted: tail(report.deleted),
      alreadyAbsent: tail(report.alreadyAbsent),
      deletedCount: report.deleted.length,
      alreadyAbsentCount: report.alreadyAbsent.length,
    }));
  } catch (error: unknown) {
    if (lease && durable && github) {
      try {
        durable = { ...durable, state: "uncertain", failure: error instanceof Error && /^worker_version_retention_[a-z0-9_]+$/u.test(error.message) ? error.message : "worker_version_retention_failed" };
        const head = await github("GET", `git/ref/heads/${sharedLockBranch}`);
        const currentHead = head.status === 200 ? record(head.value?.object)?.sha : undefined;
        if (currentHead === lease.head) {
          const serialized = JSON.stringify(durable);
          const blob = await github("POST", "git/blobs", { content: serialized, encoding: "utf-8" });
          const blobSha = blob.value?.sha;
          if (typeof blobSha === "string" && fullSha.test(blobSha)) {
            const tree = await github("POST", "git/trees", { tree: [{ path: reportPath, mode: "100644", type: "blob", sha: blobSha }] });
            const treeSha = tree.value?.sha;
            if (typeof treeSha === "string" && fullSha.test(treeSha)) {
              const saved = await github("POST", "git/commits", { message: `Record uncertain Nemlig Worker version retention ${durable.operationId}`, tree: treeSha, parents: [lease.head] });
              const savedSha = saved.value?.sha;
              if (typeof savedSha === "string" && fullSha.test(savedSha)) await github("PATCH", `git/refs/heads/${sharedLockBranch}`, { sha: savedSha, force: false });
            }
          }
        }
      } catch { /* preserve the original bounded failure */ }
    }
    const message = error instanceof Error && /^worker_version_retention_[a-z0-9_]+$/u.test(error.message)
      ? error.message : "worker_version_retention_failed";
    console.error(message);
    console.log(JSON.stringify({ policy: "worker-version-age", outcome: "failed", failure: message.replace(/^worker_version_retention_/u, ""), ...(durable?.pending ? { pending: durable.pending } : {}) }));
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
