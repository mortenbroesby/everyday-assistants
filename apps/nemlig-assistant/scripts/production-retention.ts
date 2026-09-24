import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  executeImageRetention,
  acceptedImageDigests,
  parseImageRetentionLedger,
  recordAcceptedImageRelease,
  resolveRetentionDeleteIntent,
  planImageRetention,
  parseRetentionCount,
  retentionDryRunFingerprint,
  readRegistryInventory,
  registryOrigin,
  productionImageName,
  type ImageRetentionLedger,
  type RegistryInventory,
} from "./container-image-retention.js";
import { parseContainer } from "./production-deploy.js";

const ownerRepository = "mortenbroesby/everyday-assistants";
const ledgerBranch = "codex-retention/nemlig-production";
const lockBranch = "codex-lock/nemlig-production";
const acceptanceChecks = ["edge_acceptance", "service_fixture_acceptance", "authenticated_read_only_acceptance"];
const fullSha = /^[0-9a-f]{40}$/u;
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const fail = (reason: string): never => { throw new Error(`production_retention_${reason}`); };

interface RetentionLease {
  schema: 1;
  kind: "image-retention";
  operationId: string;
  runId: number;
  runAttempt: number;
  commit: string;
  startedAt: string;
}

interface GithubResponse {
  status: number;
  value?: Record<string, unknown>;
}

const jsonObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export function parseRegistryCredentialOutput(raw: string): { authorization: string } {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail("credentials_invalid"); }
  const credentials = jsonObject(value);
  const password = credentials?.password;
  if (typeof password !== "string" || password.length === 0
    || (credentials?.username !== undefined && credentials.username !== "v1")) fail("credentials_invalid");
  return { authorization: `Basic ${Buffer.from(`v1:${password as string}`).toString("base64")}` };
}

export function parseRetentionLease(raw: string): RetentionLease {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail("lease_invalid"); }
  const lease = jsonObject(value);
  if (!lease || Object.keys(lease).length !== 7 || lease.schema !== 1 || lease.kind !== "image-retention"
    || typeof lease.operationId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(lease.operationId)
    || !Number.isSafeInteger(lease.runId) || (lease.runId as number) < 1
    || !Number.isSafeInteger(lease.runAttempt) || (lease.runAttempt as number) < 1
    || typeof lease.commit !== "string" || !fullSha.test(lease.commit)
    || typeof lease.startedAt !== "string" || !Number.isFinite(Date.parse(lease.startedAt))
    || new Date(lease.startedAt).toISOString() !== lease.startedAt) fail("lease_invalid");
  return {
    schema: 1,
    kind: "image-retention",
    operationId: lease!.operationId as string,
    runId: lease!.runId as number,
    runAttempt: lease!.runAttempt as number,
    commit: lease!.commit as string,
    startedAt: lease!.startedAt as string,
  };
}

export function retentionLeaseCanBeReclaimed(lease: RetentionLease, run: {
  status?: unknown;
  runAttempt?: unknown;
  path?: unknown;
}): boolean {
  return run.status === "completed" && Number.isSafeInteger(run.runAttempt)
    && (run.runAttempt as number) >= lease.runAttempt
    && run.path === ".github/workflows/nemlig-production.yml";
}

export function retentionLeaseMatchesOperation(leaseCommit: string, latestAcceptedCommit: string | undefined, requestedCommit: string, mode: "accept" | "resume"): boolean {
  return leaseCommit === latestAcceptedCommit || (mode === "accept" && leaseCommit === requestedCommit);
}

export async function assertRetentionLeaseForMutation(
  mode: "plan" | "accept" | "resume",
  guards: { assertUnowned(): Promise<void>; assertOwned(): Promise<void> },
): Promise<void> {
  if (mode === "plan") await guards.assertUnowned();
  else await guards.assertOwned();
}

export function assertNoContainerRollout(raw: string, expectedApplicationVersion: number): void {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail("active_container_invalid"); }
  if (!Array.isArray(value) || value.length > 1) fail("active_container_rollout_uncertain");
  for (const item of value as unknown[]) {
    const instance = jsonObject(item);
    if (!instance || typeof instance.id !== "string" || instance.id.length === 0 || typeof instance.state !== "string") fail("active_container_invalid");
    if (instance!.state === "inactive" && instance!.version === null) continue;
    if ((instance!.state === "running" || instance!.state === "healthy") && instance!.version === expectedApplicationVersion) continue;
    fail("active_container_rollout_uncertain");
  }
}

export function parseAcceptedReleaseJournal(raw: string, expectedCommit: string): {
  commit: string;
  digest: string;
  acceptedAt: string;
} {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail("acceptance_evidence_invalid"); }
  const journal = jsonObject(value);
  const checks = journal?.checks;
  const hasRuntimeAcceptance = Array.isArray(checks) && checks.includes("edge_acceptance")
    && acceptanceChecks.slice(1).some((check) => checks.includes(check));
  if (!journal || journal.schema !== 2 || journal.outcome !== "success" || journal.lastVerifiedState !== "enabled"
    || journal.commit !== expectedCommit || !fullSha.test(expectedCommit) || !hasRuntimeAcceptance
    || typeof journal.enabledImage !== "string" || !digestPattern.test(journal.enabledImage)
    || typeof journal.completedAt !== "string" || !Number.isFinite(Date.parse(journal.completedAt))
    || new Date(journal.completedAt).toISOString() !== journal.completedAt) fail("acceptance_evidence_invalid");
  return { commit: expectedCommit, digest: journal!.enabledImage as string, acceptedAt: journal!.completedAt as string };
}

export type ProductionRetentionCli =
  | { mode: "accept"; commit: string; acceptancePath: string }
  | { mode: "plan" | "resume"; commit: string };

export function parseProductionRetentionCli(argv: readonly string[]): ProductionRetentionCli {
  const values = argv[0] === "--" ? argv.slice(1) : argv;
  const mode = values[0];
  const commit = values[1];
  if (!commit || !fullSha.test(commit)) fail("input_invalid");
  if (mode === "accept" && values.length === 3 && values[2]) {
    return { mode, commit, acceptancePath: values[2] };
  }
  if ((mode === "plan" || mode === "resume") && values.length === 2) return { mode, commit };
  return fail("input_invalid");
}

const run = async (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<string> =>
  await new Promise<string>((resolvePromise, reject) => {
    if (signal.aborted) { reject(new Error("production_retention_deadline_exceeded")); return; }
    const child = spawn(command, args, { cwd, env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    let done = false;
    let abortError: Error | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolvePromise(output);
    };
    const terminate = (error: Error) => {
      if (abortError) return;
      abortError = error;
      try { process.kill(process.platform === "win32" ? child.pid! : -child.pid!, "SIGTERM"); } catch { /* process already exited */ }
      killTimer = setTimeout(() => {
        try { process.kill(process.platform === "win32" ? child.pid! : -child.pid!, "SIGKILL"); } catch { /* process group already exited */ }
      }, 5_000);
    };
    const abort = () => terminate(new Error("production_retention_command_failed"));
    const timeout = setTimeout(abort, 120_000);
    signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      if (output.length + chunk.length > 4 * 1024 * 1024) terminate(new Error("production_retention_command_failed"));
      else output += chunk.toString();
    });
    child.on("error", () => finish(new Error("production_retention_command_failed")));
    child.on("close", (code) => code === 0 && !abortError ? finish() : finish(abortError ?? new Error("production_retention_command_failed")));
  });

const responseObject = async (response: Response): Promise<Record<string, unknown> | undefined> => {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) fail("github_response_oversized");
  if (!text) return undefined;
  try { return jsonObject(JSON.parse(text)); } catch { return fail("github_response_invalid"); }
};

const main = async (): Promise<void> => {
  const input = parseProductionRetentionCli(process.argv.slice(2));
  const { mode, commit } = input;
  const acceptancePath = input.mode === "accept" ? input.acceptancePath : undefined;

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const packageRoot = resolve(repoRoot, "apps/nemlig-assistant");
  const env = process.env;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const githubToken = env.GH_TOKEN;
  if (env.GITHUB_REPOSITORY !== ownerRepository || !accountId || !/^[0-9a-f]{32}$/u.test(accountId)
    || !apiToken || !githubToken) fail("environment_invalid");
  const repository = `${accountId}/${productionImageName}`;
  const retainAccepted = parseRetentionCount(env.NEMLIG_CONTAINER_IMAGE_RETENTION_COUNT);
  const controller = new AbortController();
  const overallTimeout = setTimeout(() => controller.abort(), 600_000);
  const signal = controller.signal;
  const githubUrl = (path: string): string => `https://api.github.com/repos/${ownerRepository}/${path}`;
  const github = async (method: string, path: string, body?: unknown): Promise<GithubResponse> => {
    if (signal.aborted) fail("deadline_exceeded");
    let response: Response;
    try {
      response = await fetch(githubUrl(path), {
        method,
        signal,
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch { return fail("github_unavailable"); }
    const value = await responseObject(response);
    return { status: response.status, ...(value ? { value } : {}) };
  };
  const requireGithub = (response: GithubResponse, category: string): Record<string, unknown> => {
    if (response.status < 200 || response.status >= 300 || !response.value) fail(`${category}_${response.status}`);
    return response.value as Record<string, unknown>;
  };

  try {
    let retentionLeaseHead: string | undefined;
    const readLeaseHead = async (): Promise<string | undefined> => {
      const response = await github("GET", "git/ref/heads/" + lockBranch);
      if (response.status === 404) return undefined;
      const reference = requireGithub(response, "lease_read_failed");
      const object = jsonObject(reference.object);
      const sha = object?.sha;
      if (typeof sha !== "string" || !fullSha.test(sha)) fail("lease_invalid");
      return sha as string;
    };
    const readExistingRetentionLease = async (head: string): Promise<RetentionLease> => {
      const response = await github("GET", "contents/retention-lease.json?ref=" + encodeURIComponent(lockBranch));
      const file = requireGithub(response, "lease_read_failed");
      const encoded = file.content;
      if (typeof encoded !== "string") fail("lease_invalid");
      let raw: string;
      try { raw = Buffer.from((encoded as string).replace(/\s/gu, ""), "base64").toString("utf8"); } catch { return fail("lease_invalid"); }
      const prior = parseRetentionLease(raw);
      const run = requireGithub(await github("GET", "actions/runs/" + prior.runId), "lease_run_status_unavailable");
      if (!retentionLeaseCanBeReclaimed(prior, { status: run.status, runAttempt: run.run_attempt, path: run.path })) fail("lease_run_active_or_unknown");
      if (await readLeaseHead() !== head) fail("lease_changed");
      return prior;
    };
    const retentionLeaseCommit = async (lease: RetentionLease, parent?: string): Promise<string> => {
      const blob = requireGithub(await github("POST", "git/blobs", { content: JSON.stringify(lease), encoding: "utf-8" }), "lease_write_failed");
      if (typeof blob.sha !== "string" || !fullSha.test(blob.sha)) fail("lease_write_failed");
      const tree = requireGithub(await github("POST", "git/trees", {
        tree: [{ path: "retention-lease.json", mode: "100644", type: "blob", sha: blob.sha }],
      }), "lease_write_failed");
      if (typeof tree.sha !== "string" || !fullSha.test(tree.sha)) fail("lease_write_failed");
      const commitResult = requireGithub(await github("POST", "git/commits", {
        message: "Nemlig image retention lease " + lease.operationId,
        tree: tree.sha,
        ...(parent ? { parents: [parent] } : {}),
      }), "lease_write_failed");
      if (typeof commitResult.sha !== "string" || !fullSha.test(commitResult.sha)) fail("lease_write_failed");
      return commitResult.sha as string;
    };
    const acquireRetentionLease = async (): Promise<void> => {
      const runId = Number(env.GITHUB_RUN_ID);
      const runAttempt = Number(env.GITHUB_RUN_ATTEMPT);
      if (!Number.isSafeInteger(runId) || runId < 1 || !Number.isSafeInteger(runAttempt) || runAttempt < 1) fail("lease_environment_invalid");
      const priorHead = await readLeaseHead();
      if (priorHead) {
        const prior = await readExistingRetentionLease(priorHead);
        if (!retentionLeaseMatchesOperation(prior.commit, ledger.accepted[0]?.commit, commit, mode === "accept" ? "accept" : "resume")) fail("lease_commit_mismatch");
      }
      const lease = parseRetentionLease(JSON.stringify({
        schema: 1, kind: "image-retention", operationId: randomUUID(), runId, runAttempt, commit,
        startedAt: new Date().toISOString(),
      }));
      const newHead = await retentionLeaseCommit(lease, priorHead);
      const response = priorHead
        ? await github("PATCH", "git/refs/heads/" + lockBranch, { sha: newHead, force: false })
        : await github("POST", "git/refs", { ref: "refs/heads/" + lockBranch, sha: newHead });
      if (response.status < 200 || response.status >= 300) {
        if (await readLeaseHead() !== newHead) fail("lease_acquire_failed");
      }
      retentionLeaseHead = newHead;
    };
    const assertRetentionLease = async (): Promise<void> => {
      if (!retentionLeaseHead || await readLeaseHead() !== retentionLeaseHead) fail("lease_lost");
    };
    const releaseRetentionLease = async (): Promise<void> => {
      await assertRetentionLease();
      const response = await github("DELETE", "git/refs/heads/" + lockBranch);
      if (response.status < 200 || response.status >= 300) {
        if (await readLeaseHead()) fail("lease_release_uncertain");
      }
      retentionLeaseHead = undefined;
    };

    let branchExists = false;
    const ensureLedgerBranch = async (): Promise<void> => {
      if (branchExists) return;
      const refPath = `git/ref/heads/${ledgerBranch}`;
      const ref = await github("GET", refPath);
      if (ref.status === 200) { branchExists = true; return; }
      if (ref.status !== 404 || mode !== "accept") fail("ledger_branch_unavailable");
      const create = await github("POST", "git/refs", { ref: `refs/heads/${ledgerBranch}`, sha: commit });
      if (create.status >= 200 && create.status < 300) { branchExists = true; return; }
      const reconcile = await github("GET", refPath);
      if (reconcile.status === 200) { branchExists = true; return; }
      fail("ledger_branch_create_failed");
    };

    const readLedgerFile = async (): Promise<{ ledger: ImageRetentionLedger; sha?: string }> => {
      await ensureLedgerBranch();
      const response = await github("GET", `contents/retention-ledger.json?ref=${encodeURIComponent(ledgerBranch)}`);
      if (response.status === 404) return { ledger: { schema: 1, repository, accepted: [] } };
      const file = requireGithub(response, "ledger_read_failed");
      if (typeof file.content !== "string" || typeof file.sha !== "string" || !/^[0-9a-f]{40}$/u.test(file.sha)) fail("ledger_read_failed");
      let raw: string;
      try { raw = Buffer.from((file.content as string).replace(/\s/gu, ""), "base64").toString("utf8"); } catch { return fail("ledger_read_failed"); }
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return fail("ledger_invalid"); }
      return { ledger: parseImageRetentionLedger(parsed, repository), sha: file.sha as string };
    };
    let fileState = await readLedgerFile();

    const saveLedger = async (ledger: ImageRetentionLedger): Promise<void> => {
      const content = Buffer.from(`${JSON.stringify(parseImageRetentionLedger(ledger, repository), null, 2)}\n`).toString("base64");
      const response = await github("PUT", "contents/retention-ledger.json", {
        message: `Record Nemlig image retention for ${ledger.accepted[0]?.commit.slice(0, 12) ?? "baseline"}`,
        branch: ledgerBranch,
        content,
        ...(fileState.sha ? { sha: fileState.sha } : {}),
      });
      if (response.status >= 200 && response.status < 300 && typeof response.value?.content === "object") {
        const file = jsonObject(response.value.content);
        if (typeof file?.sha !== "string" || !fullSha.test(file.sha)) fail("ledger_write_unverified");
        fileState = { ledger: parseImageRetentionLedger(ledger, repository), sha: file!.sha as string };
        return;
      }
      const observed = await readLedgerFile();
      if (JSON.stringify(observed.ledger) === JSON.stringify(parseImageRetentionLedger(ledger, repository))) {
        fileState = observed;
        return;
      }
      fail("ledger_write_uncertain");
    };

    let ledger = fileState.ledger;
    let acceptedRelease: ReturnType<typeof parseAcceptedReleaseJournal> | undefined;
    if (mode === "accept") {
      let raw: string;
      try { raw = await readFile(acceptancePath!, "utf8"); } catch { fail("acceptance_evidence_missing"); }
      acceptedRelease = parseAcceptedReleaseJournal(raw!, commit);
      if (ledger.accepted[0]?.commit === commit && ledger.cleanup?.completedAt) {
        console.log(JSON.stringify({ commit, cleanupComplete: true, skipped: true }));
        return;
      }
    } else {
      const cleanup = ledger.cleanup;
      if (ledger.accepted[0]?.commit !== commit || !cleanup || cleanup.commit !== commit || (mode === "plan" && cleanup.completedAt)) fail("cleanup_checkpoint_invalid");
    }

    let pullAuthorization = "";
    let pullExpires = 0;
    let pushAuthorization = "";
    let pushExpires = 0;
    const registryAuthorization = async (permission: "pull" | "push"): Promise<string> => {
      if (permission === "pull" && Date.now() < pullExpires) return pullAuthorization;
      if (permission === "push" && Date.now() < pushExpires) return pushAuthorization;
      const output = await run("pnpm", ["exec", "wrangler", "containers", "registries", "credentials", `--${permission}`, "--expiration-minutes", "5", "--json", "--env", "production"], packageRoot, env, signal);
      const generated = parseRegistryCredentialOutput(output).authorization;
      if (permission === "pull") { pullAuthorization = generated; pullExpires = Date.now() + 240_000; }
      else { pushAuthorization = generated; pushExpires = Date.now() + 240_000; }
      return generated;
    };

    const readInventory = async (inventorySignal: AbortSignal): Promise<RegistryInventory> => await readRegistryInventory({
      accountId,
      repository,
      authorization: await registryAuthorization("pull"),
      fetcher: fetch,
      signal: inventorySignal,
    });

    const assertNoRecoveryLease = async (): Promise<void> => {
      const lease = await github("GET", `git/ref/heads/${lockBranch}`);
      if (lease.status === 200) fail("recovery_lease_present");
      if (lease.status !== 404) fail("recovery_lease_unavailable");
    };

    const readActiveDigest = async (): Promise<string> => {
      const listed = await run("pnpm", ["exec", "wrangler", "containers", "list", "--json", "--env", "production"], packageRoot, env, signal);
      const initial = parseContainer(listed);
      const infoRaw = await run("pnpm", ["exec", "wrangler", "containers", "info", initial.id, "--json", "--env", "production"], packageRoot, env, signal);
      let info: unknown;
      try { info = JSON.parse(infoRaw); } catch { return fail("active_container_invalid"); }
      const app = jsonObject(info);
      const configuration = jsonObject(app?.configuration);
      const current = parseContainer(JSON.stringify([{
        id: app?.id,
        name: app?.name,
        instances: app?.instances,
        image: configuration?.image,
        version: app?.version,
      }]));
      if (current.id !== initial.id || current.image !== initial.image || current.version !== initial.version) fail("active_container_changed");
      const instances = await run("pnpm", ["exec", "wrangler", "containers", "instances", current.id, "--json", "--env", "production"], packageRoot, env, signal);
      assertNoContainerRollout(instances, current.version);
      return current.image;
    };

    const readDryRunSnapshot = async (): Promise<{
      inventory: RegistryInventory;
      holds: { digest: string; reason: "active" }[];
      plan: ReturnType<typeof planImageRetention>;
      fingerprint: string;
    }> => {
      await assertRetentionLeaseForMutation(mode, {
        assertOwned: assertRetentionLease,
        assertUnowned: assertNoRecoveryLease,
      });
      const inventory = await readInventory(signal);
      const activeDigest = await readActiveDigest();
      if (!inventory.tags.some(({ digest }) => digest === activeDigest)) fail("active_image_missing");
      const holds = [{ digest: activeDigest, reason: "active" as const }];
      const plan = planImageRetention({
        repository,
        expectedRepository: repository,
        inventoryComplete: inventory.inventoryComplete,
        tags: inventory.tags,
        acceptedDigests: acceptedImageDigests(ledger),
        holds,
        retainAccepted,
      });
      const fingerprint = retentionDryRunFingerprint({ repository, inventory, holds, plan });
      return { inventory, holds, plan, fingerprint };
    };

    if (mode === "plan") {
      const snapshot = await readDryRunSnapshot();
      console.log(JSON.stringify({ commit, dryRun: true, fingerprint: snapshot.fingerprint, inventory: snapshot.inventory, plan: snapshot.plan }));
      return;
    }

    await acquireRetentionLease();
    if (ledger.cleanup?.inFlight) {
      await assertRetentionLease();
      const recoveryInventory = await readInventory(signal);
      const tagStillPresent = recoveryInventory.tags.some(({ tag }) => tag === ledger.cleanup?.inFlight?.tag);
      ledger = resolveRetentionDeleteIntent(ledger, tagStillPresent);
      await saveLedger(ledger);
    }
    if (mode === "resume" && ledger.cleanup?.completedAt) {
      await releaseRetentionLease();
      console.log(JSON.stringify({ commit, cleanupComplete: true, recoveredLease: true, skipped: true }));
      return;
    }
    if (acceptedRelease) {
      ledger = recordAcceptedImageRelease(ledger, acceptedRelease);
      const cleanup = ledger.cleanup;
      if (!cleanup || cleanup.commit !== commit || cleanup.completedAt) fail("cleanup_checkpoint_invalid");
      await saveLedger(ledger);
    }

    const first = await readDryRunSnapshot();
    const second = await readDryRunSnapshot();
    if (first.fingerprint !== second.fingerprint) {
      await releaseRetentionLease();
      console.log(JSON.stringify({
        commit,
        dryRun: true,
        stable: false,
        firstFingerprint: first.fingerprint,
        secondFingerprint: second.fingerprint,
        firstPlan: first.plan,
        secondPlan: second.plan,
        cleanupStarted: false,
      }));
      return;
    }

    const deleteTag = async (tag: string, expectedDigest: string, deleteSignal: AbortSignal): Promise<void> => {
      await assertRetentionLease();
      const authorization = await registryAuthorization("push");
      const path = `/v2/${repository.split("/").map(encodeURIComponent).join("/")}/manifests/${encodeURIComponent(tag)}`;
      const url = `${registryOrigin}${path}`;
      const headers = {
        Authorization: authorization,
        Accept: "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
      };
      let head: Response;
      try { head = await fetch(url, { method: "HEAD", headers, signal: deleteSignal }); } catch { fail("registry_head_uncertain"); }
      if (!head!.ok || head!.headers.get("docker-content-digest") !== expectedDigest) fail("registry_tag_mapping_changed");
      let deleted: Response;
      try { deleted = await fetch(url, { method: "DELETE", headers, signal: deleteSignal }); } catch { fail("registry_delete_uncertain"); }
      if (!deleted!.ok) fail(`registry_delete_http_${deleted!.status}`);
    };

    const report = await executeImageRetention({ repository, expectedRepository: repository, ledger, retainAccepted, signal }, {
      readInventory,
      readHolds: async (holdSignal, inventory) => {
        if (holdSignal.aborted) fail("deadline_exceeded");
        await assertRetentionLeaseForMutation(mode, {
          assertOwned: assertRetentionLease,
          assertUnowned: assertNoRecoveryLease,
        });
        const activeDigest = await readActiveDigest();
        if (!inventory.tags.some(({ digest }) => digest === activeDigest)) fail("active_image_missing");
        return [{ digest: activeDigest, reason: "active" }];
      },
      deleteTag,
      collectGarbage: async (gcSignal) => {
        await assertRetentionLease();
        const authorization = await registryAuthorization("push");
        let response: Response;
        try { response = await fetch(`${registryOrigin}/v2/gc/layers`, {
          method: "PUT",
          headers: { Authorization: authorization, "Content-Type": "application/json" },
          signal: gcSignal,
        }); } catch { fail("registry_gc_uncertain"); }
        if (!response!.ok) fail(`registry_gc_http_${response!.status}`);
      },
      persistLedger: saveLedger,
      now: () => new Date(),
    });
    await releaseRetentionLease();
    console.log(JSON.stringify({ ...report, commit }));
  } finally {
    clearTimeout(overallTimeout);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error && /^production_retention_[a-z0-9_]+$/u.test(error.message)
      ? error.message
      : "production_retention_failed");
    process.exitCode = 1;
  });
}
