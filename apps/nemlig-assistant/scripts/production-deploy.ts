import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { open, mkdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const fullSha = /^[0-9a-f]{40}$/u;
const versionId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const remoteLeaseRef = "refs/heads/codex-lock/nemlig-production";
const productionRepository = "mortenbroesby/everyday-assistants";
const ciWorkflowName = "CI";
const ciWorkflowPath = ".github/workflows/ci.yml";
const customMcp = new URL("https://nemlig-mcp.broesby.dk/mcp");
const workersMcp = new URL("https://nemlig-mcp-cloudflare-production.mortenbroesby.workers.dev/mcp");
export const productionDeployUsage = "pnpm --filter nemlig-assistant production:deploy -- <40-character-main-commit>";

export type VerifiedState = "unchanged" | "disabled" | "enabled" | "restored" | "unknown";

export interface DeploymentJournal {
  schema: 2;
  operationId: string;
  commit: string;
  ciRunId: number;
  startedAt: string;
  completedAt?: string;
  startingVersion?: string;
  disabledVersion?: string;
  enabledVersion?: string;
  startingContainerId?: string;
  startingImage?: string;
  disabledImage?: string;
  enabledImage?: string;
  checks: string[];
  lastVerifiedState: VerifiedState;
  rollback: "not_needed" | "attempted" | "restored" | "failed";
  outcome: "running" | "success" | "failed";
  failure?: string;
  remoteCommit?: string;
  transitions: JournalTransition[];
}

type JournalPhase = "disabled_deploy" | "enable_deploy" | "rollback";
type JournalKind = "intent" | "result";
interface JournalTransition {
  phase: JournalPhase;
  kind: JournalKind;
  at: string;
  version?: string;
}

interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  input?: string;
  signal?: AbortSignal;
}

export type CommandRunner = (command: string, args: readonly string[], options?: RunOptions) => Promise<string>;

export interface DeployDependencies {
  repoRoot: string;
  packageRoot: string;
  env: NodeJS.ProcessEnv;
  run: CommandRunner;
  fetcher: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => Date;
  operationId?: () => string;
  stateRoot?: string;
  signal?: AbortSignal;
}

interface CurrentDeployment {
  id: string;
  version: string;
}

interface VersionState {
  id: string;
  enabled: boolean;
  revision: string;
}

interface ContainerState {
  id: string;
  image: string;
}

class DeployFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const fail = (code: string): never => { throw new DeployFailure(code); };

const json = (raw: string, code: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return fail(code);
  }
};

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

const operationId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const journalPhases = new Set<JournalPhase>(["disabled_deploy", "enable_deploy", "rollback"]);
const journalKinds = new Set<JournalKind>(["intent", "result"]);
const journalLimit = 8 * 1024;
const isoTime = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const imageDigest = /^sha256:[0-9a-f]{64}$/u;
const journalChecks = new Set(["source_and_auth_preflight", "exclusive_lease", "starting_state_recorded", "disabled_version", "disabled_routes", "container_inactive", "enabled_version", "image_reused", "edge_acceptance", "authenticated_read_only_acceptance", "starting_version_restored"]);
const journalFailures = new Set(["owner_access_token_required", "github_repository_invalid", "source_revision_mismatch", "github_ci_workflow_invalid", "github_ci_invalid", "exact_head_ci_not_green", "local_deployment_lease_unavailable", "remote_deployment_lease_unavailable", "remote_journal_invalid", "remote_journal_append_failed", "remote_journal_parent_invalid", "remote_deployment_lease_changed", "deployment_journal_invalid", "deployment_journal_oversized", "deployment_journal_write_failed", "cloudflare_deployment_drift", "cloudflare_upload_version_missing", "disabled_route_unavailable", "disabled_route_mismatch", "container_inactive_timeout", "container_image_changed_during_enable", "command_failed", "command_cancelled", "unexpected_failure"]);

const journalJson = (journal: DeploymentJournal): string => {
  if (!operationId.test(journal.operationId) || !fullSha.test(journal.commit) || !Number.isSafeInteger(journal.ciRunId) || journal.ciRunId < 1
    || !isoTime(journal.startedAt) || (journal.completedAt !== undefined && !isoTime(journal.completedAt))
    || journal.transitions.length > 32
    || (journal.remoteCommit !== undefined && !fullSha.test(journal.remoteCommit))
    || (journal.startingVersion !== undefined && !versionId.test(journal.startingVersion))
    || (journal.disabledVersion !== undefined && !versionId.test(journal.disabledVersion))
    || (journal.enabledVersion !== undefined && !versionId.test(journal.enabledVersion))
    || (journal.startingContainerId !== undefined && !versionId.test(journal.startingContainerId))
    || (journal.startingImage !== undefined && !imageDigest.test(journal.startingImage))
    || (journal.disabledImage !== undefined && !imageDigest.test(journal.disabledImage))
    || (journal.enabledImage !== undefined && !imageDigest.test(journal.enabledImage))) fail("deployment_journal_invalid");
  if (journal.checks.some((check) => !journalChecks.has(check)) || (journal.failure !== undefined && !journalFailures.has(journal.failure))) fail("deployment_journal_invalid");
  let nextPhase = 0;
  let expecting: JournalKind = "intent";
  for (const transition of journal.transitions) {
    if (!journalPhases.has(transition.phase) || !journalKinds.has(transition.kind)
      || !isoTime(transition.at) || (transition.version !== undefined && !versionId.test(transition.version))
      || Object.keys(transition).some((key) => !["phase", "kind", "at", "version"].includes(key))
      || transition.phase !== ["disabled_deploy", "enable_deploy", "rollback"][nextPhase]
      || transition.kind !== expecting) fail("deployment_journal_invalid");
    if (expecting === "intent") expecting = "result";
    else { expecting = "intent"; nextPhase += 1; }
  }
  const serialized = JSON.stringify(journal);
  if (Buffer.byteLength(serialized, "utf8") > journalLimit) fail("deployment_journal_oversized");
  return serialized;
};

export function parseDeploymentJournal(raw: string): DeploymentJournal {
  const value = object(json(raw, "deployment_journal_invalid"));
  const allowed = new Set(["schema", "operationId", "commit", "ciRunId", "startedAt", "completedAt", "startingVersion", "disabledVersion", "enabledVersion", "startingContainerId", "startingImage", "disabledImage", "enabledImage", "checks", "lastVerifiedState", "rollback", "outcome", "failure", "remoteCommit", "transitions"]);
  if (!value || Object.keys(value).some((key) => !allowed.has(key)) || value.schema !== 2
    || typeof value.operationId !== "string" || typeof value.commit !== "string" || typeof value.ciRunId !== "number" || typeof value.startedAt !== "string"
    || !Array.isArray(value.checks) || !Array.isArray(value.transitions)
    || !["unchanged", "disabled", "enabled", "restored", "unknown"].includes(value.lastVerifiedState as string)
    || !["not_needed", "attempted", "restored", "failed"].includes(value.rollback as string)
    || !["running", "success", "failed"].includes(value.outcome as string)) fail("deployment_journal_invalid");
  const journal = value as unknown as DeploymentJournal;
  journalJson(journal);
  return journal;
}

export function parseDeployArgs(argv: readonly string[]): string {
  const values = argv[0] === "--" ? argv.slice(1) : argv;
  if (values.length !== 1 || !fullSha.test(values[0] ?? "")) {
    fail(`usage: ${productionDeployUsage}`);
  }
  return values[0];
}

export function parseDeployCli(argv: readonly string[]): { help: true } | { help: false; commit: string } {
  const values = argv[0] === "--" ? argv.slice(1) : argv;
  return values.length === 1 && (values[0] === "--help" || values[0] === "-h")
    ? { help: true }
    : { help: false, commit: parseDeployArgs(values) };
}

export function parseCurrentDeployment(raw: string): CurrentDeployment {
  const parsed = json(raw, "cloudflare_deployments_invalid");
  if (!Array.isArray(parsed) || parsed.length === 0) throw new DeployFailure("cloudflare_deployments_missing");
  const latest = [...parsed].map(object).filter((value): value is Record<string, unknown> => Boolean(value))
    .sort((left, right) => String(left.created_on ?? "").localeCompare(String(right.created_on ?? ""))).at(-1);
  if (!latest) throw new DeployFailure("cloudflare_deployment_ambiguous");
  const id = latest.id;
  const versions = latest.versions;
  if (typeof id !== "string" || !Array.isArray(versions) || versions.length !== 1) {
    throw new DeployFailure("cloudflare_deployment_ambiguous");
  }
  const deployed = object(versions[0]);
  const deployedId = deployed?.version_id;
  if (typeof deployedId !== "string" || !versionId.test(deployedId) || deployed?.percentage !== 100) {
    throw new DeployFailure("cloudflare_deployment_ambiguous");
  }
  return { id, version: deployedId };
}

const bindings = (resource: Record<string, unknown>): Map<string, Record<string, unknown>> => {
  const resources = object(resource.resources);
  const values = resources?.bindings;
  if (!Array.isArray(values)) throw new DeployFailure("cloudflare_version_bindings_invalid");
  return new Map(values.map(object).filter((value): value is Record<string, unknown> =>
    value !== undefined && typeof value.name === "string").map((value) => [value.name as string, value]));
};

export function parseVersionState(raw: string, expectedId?: string): VersionState {
  const parsed = object(json(raw, "cloudflare_version_invalid"));
  if (!parsed) throw new DeployFailure("cloudflare_version_mismatch");
  const id = parsed.id;
  if (typeof id !== "string" || !versionId.test(id) || (expectedId && id !== expectedId)) {
    throw new DeployFailure("cloudflare_version_mismatch");
  }
  const values = bindings(parsed);
  const enabled = values.get("MCP_ENABLED")?.text;
  const revision = values.get("NEMLIG_MCP_REVISION")?.text;
  if ((enabled !== "true" && enabled !== "false") || typeof revision !== "string" || !fullSha.test(revision)) {
    throw new DeployFailure("cloudflare_version_state_invalid");
  }
  return { id, enabled: enabled === "true", revision };
}

export function verifyCandidateVersion(raw: string, expectedId: string, commit: string, enabled: boolean): VersionState {
  const parsed = object(json(raw, "cloudflare_version_invalid"));
  if (!parsed) throw new DeployFailure("cloudflare_version_invalid");
  const state = parseVersionState(raw, expectedId);
  if (state.revision !== commit || state.enabled !== enabled) fail("cloudflare_candidate_state_mismatch");
  const resources = object(parsed.resources);
  const runtime = object(resources?.script_runtime);
  const limits = object(runtime?.limits);
  const containers = runtime?.containers;
  if (limits?.cpu_ms !== 100 || limits.subrequests !== 8 || !Array.isArray(containers) || containers.length !== 1
    || object(containers[0])?.class_name !== "NemligMcpContainer") fail("cloudflare_runtime_safety_mismatch");
  const values = bindings(parsed);
  const expectedText: Record<string, string> = {
    MCP_AUTH_TIMEOUT_MS: "5000",
    MCP_BACKEND_TIMEOUT_MS: "85000",
    MCP_CONTROL_TIMEOUT_MS: "3000",
    MCP_DAILY_LIMIT: "5000",
    MCP_EXPENSIVE_DAILY_LIMIT: "500",
    MCP_EXPENSIVE_RATE_LIMIT: "10",
    MCP_RATE_LIMIT: "60",
    MCP_TOTAL_TIMEOUT_MS: "90000",
  };
  for (const [name, text] of Object.entries(expectedText)) {
    if (values.get(name)?.text !== text) fail("cloudflare_runtime_safety_mismatch");
  }
  for (const name of ["NEMLIG_MCP_CONTAINER", "NEMLIG_PLAN_STORAGE", "NEMLIG_MCP_PRINCIPALS"]) {
    if (!values.has(name)) fail("cloudflare_runtime_safety_mismatch");
  }
  return state;
}

export function parseContainer(raw: string): ContainerState {
  const parsed = json(raw, "cloudflare_containers_invalid");
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new DeployFailure("cloudflare_container_ambiguous");
  const value = object(parsed[0]);
  if (!value) throw new DeployFailure("cloudflare_container_ambiguous");
  const id = value.id;
  const image = value.image;
  if (typeof id !== "string" || typeof image !== "string"
    || value.name !== "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production"
    || value.instances !== 1) throw new DeployFailure("cloudflare_container_ambiguous");
  return { id, image };
}

export function instancesInactive(raw: string): boolean {
  const parsed = json(raw, "cloudflare_instances_invalid");
  return Array.isArray(parsed) && parsed.length === 1 && object(parsed[0])?.state === "inactive";
}

const deployedVersionFromOutput = (raw: string): string => {
  const id = raw.match(/Current Version ID:\s*([0-9a-f-]{36})/u)?.[1];
  return id && versionId.test(id) ? id : fail("cloudflare_upload_version_missing");
};

const defaultRunner: CommandRunner = async (command, args, options = {}) => await new Promise<string>((resolvePromise, reject) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const child = spawn(command, args, {
    cwd: options.cwd, env: options.env, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let overflow = false;
  let terminated = false;
  let finished = false;
  const clean = () => {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", terminate);
  };
  const done = (error?: Error) => {
    if (finished) return;
    finished = true;
    clean();
    if (error) reject(error);
    else resolvePromise(output.trim());
  };
  const terminate = () => {
    if (terminated) return;
    terminated = true;
    try { process.kill(process.platform === "win32" ? child.pid! : -child.pid!, "SIGTERM"); } catch { /* already closed */ }
    setTimeout(() => {
      if (!finished) try { process.kill(process.platform === "win32" ? child.pid! : -child.pid!, "SIGKILL"); } catch { /* already closed */ }
    }, 5_000).unref();
  };
  controller.signal.addEventListener("abort", terminate, { once: true });
  child.stdout.on("data", (chunk: Buffer) => {
    if (output.length + chunk.length > 16 * 1024 * 1024) { overflow = true; controller.abort(); }
    else output += chunk.toString();
  });
  child.stderr.resume();
  child.on("error", () => done(new DeployFailure("command_failed")));
  child.on("close", (code) => {
    if (controller.signal.aborted) done(new DeployFailure(overflow ? "command_failed" : "command_cancelled"));
    else if (code === 0) done();
    else done(new DeployFailure("command_failed"));
  });
  if (options.input !== undefined) child.stdin.end(options.input);
  else child.stdin.end();
});

const runAt = (deps: DeployDependencies, cwd: string, command: string, args: readonly string[], options: RunOptions = {}) =>
  deps.run(command, args, { ...options, signal: options.signal ?? deps.signal, cwd, env: { ...deps.env, ...options.env } });

const wrangler = (deps: DeployDependencies, args: readonly string[], timeoutMs = 30_000) =>
  runAt(deps, deps.packageRoot, "pnpm", ["exec", "wrangler", ...args, "--env", "production"], { timeoutMs });

const readCurrent = async (deps: DeployDependencies): Promise<CurrentDeployment> =>
  parseCurrentDeployment(await wrangler(deps, ["deployments", "list", "--json"]));

const readVersion = async (deps: DeployDependencies, id: string): Promise<string> =>
  await wrangler(deps, ["versions", "view", id, "--json"]);

const readContainer = async (deps: DeployDependencies): Promise<ContainerState> =>
  parseContainer(await wrangler(deps, ["containers", "list", "--json"]));

const writeJournal = async (path: string, journal: DeploymentJournal): Promise<void> => {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${journalJson(journal)}\n`, { mode: 0o600 });
  await rename(temporary, path);
};

const acquireLocalLease = async (path: string, operation: string, commit: string): Promise<void> => {
  try {
    const handle = await open(path, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify({ operation, commit })}\n`);
    await handle.close();
  } catch {
    fail("local_deployment_lease_unavailable");
  }
};

const repoIdentity = async (deps: DeployDependencies): Promise<{ nameWithOwner: string; url: string }> => {
  const value = object(json(await runAt(deps, deps.repoRoot, "gh", ["repo", "view", "--json", "nameWithOwner,url"]), "github_repository_invalid"));
  if (!value || value.nameWithOwner !== productionRepository || typeof value.url !== "string") {
    throw new DeployFailure("github_repository_invalid");
  }
  return { nameWithOwner: value.nameWithOwner, url: value.url };
};

const ghJson = async (deps: DeployDependencies, repository: string, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> => {
  const args = ["api", "--method", method, `repos/${repository}/${path}`];
  const options: RunOptions = {};
  if (body !== undefined) {
    args.push("--input", "-");
    options.input = JSON.stringify(body);
  }
  return object(json(await runAt(deps, deps.repoRoot, "gh", args, options), "remote_journal_invalid")) ?? fail("remote_journal_invalid");
};

const journalCommit = async (deps: DeployDependencies, repository: string, journal: DeploymentJournal, parent?: string): Promise<string> => {
  const blob = await ghJson(deps, repository, "POST", "git/blobs", { content: Buffer.from(journalJson(journal)).toString("base64"), encoding: "base64" });
  if (typeof blob.sha !== "string" || !fullSha.test(blob.sha)) fail("remote_journal_invalid");
  const tree = await ghJson(deps, repository, "POST", "git/trees", { tree: [{ path: "journal.json", mode: "100644", type: "blob", sha: blob.sha }] });
  if (typeof tree.sha !== "string" || !fullSha.test(tree.sha)) fail("remote_journal_invalid");
  const commit = await ghJson(deps, repository, "POST", "git/commits", {
    message: `Nemlig production recovery ${journal.operationId}`,
    tree: tree.sha,
    ...(parent ? { parents: [parent] } : {}),
  });
  const commitSha = commit.sha;
  if (typeof commitSha !== "string" || !fullSha.test(commitSha)) fail("remote_journal_invalid");
  return commitSha as string;
};

const readRemoteHead = async (deps: DeployDependencies, repository: string): Promise<string | undefined> => {
  const value = await runAt(deps, deps.repoRoot, "gh", ["api", `repos/${repository}/git/ref/heads/codex-lock/nemlig-production`, "--jq", ".object.sha"]);
  if (value === "") return undefined;
  if (!fullSha.test(value)) fail("remote_journal_invalid");
  return value;
};

const acquireRemoteJournal = async (deps: DeployDependencies, repository: string, journal: DeploymentJournal): Promise<string> => {
  try {
    if (await readRemoteHead(deps, repository)) fail("remote_deployment_lease_unavailable");
  } catch (error) {
    if (error instanceof DeployFailure) throw error;
  }
  const root = await journalCommit(deps, repository, journal);
  try {
    await ghJson(deps, repository, "POST", "git/refs", { ref: remoteLeaseRef, sha: root });
    if (await readRemoteHead(deps, repository) !== root) fail("remote_deployment_lease_changed");
  } catch {
    fail("remote_deployment_lease_unavailable");
  }
  return root;
};

const appendRemoteJournal = async (deps: DeployDependencies, repository: string, journal: DeploymentJournal): Promise<void> => {
  const parent = journal.remoteCommit;
  if (!parent || !fullSha.test(parent)) fail("remote_journal_parent_invalid");
  if (await readRemoteHead(deps, repository) !== parent) fail("remote_journal_parent_invalid");
  const child = await journalCommit(deps, repository, journal, parent);
  try {
    await ghJson(deps, repository, "PATCH", "git/refs/heads/codex-lock/nemlig-production", { sha: child, force: false });
    const current = await readRemoteHead(deps, repository);
    if (current !== child) fail("remote_deployment_lease_changed");
  } catch {
    fail("remote_journal_append_failed");
  }
  journal.remoteCommit = child;
};

const verifySource = async (deps: DeployDependencies, commit: string, repo: { nameWithOwner: string; url: string }): Promise<number> => {
  await runAt(deps, deps.repoRoot, "gh", ["auth", "status", "-h", "github.com"]);
  await runAt(deps, deps.repoRoot, "git", ["-c", "credential.helper=!gh auth git-credential", "fetch", repo.url, "main:refs/remotes/origin/main"]);
  const [head, remote, status] = await Promise.all([
    runAt(deps, deps.repoRoot, "git", ["rev-parse", "HEAD"]),
    runAt(deps, deps.repoRoot, "git", ["rev-parse", "origin/main"]),
    runAt(deps, deps.repoRoot, "git", ["status", "--porcelain"]),
  ]);
  if (head !== commit || remote !== commit || status !== "") fail("source_revision_mismatch");
  const workflows = json(await runAt(deps, deps.repoRoot, "gh", [
    "workflow", "list", "--repo", repo.nameWithOwner, "--all", "--limit", "100", "--json", "id,name,path,state",
  ]), "github_ci_workflow_invalid");
  const matchingWorkflows = Array.isArray(workflows) ? workflows.map(object).filter((workflow) =>
    workflow?.name === ciWorkflowName && workflow.path === ciWorkflowPath && workflow.state === "active") : [];
  const workflowId = matchingWorkflows.length === 1 ? matchingWorkflows[0]?.id : undefined;
  if (typeof workflowId !== "number") fail("github_ci_workflow_invalid");
  const runs = json(await runAt(deps, deps.repoRoot, "gh", [
    "run", "list", "--repo", repo.nameWithOwner, "--commit", commit, "--workflow", String(workflowId), "--limit", "10",
    "--json", "conclusion,databaseId,event,headBranch,headSha,status,url,workflowDatabaseId,workflowName",
  ]), "github_ci_invalid");
  const trusted = Array.isArray(runs) ? runs.map(object).filter((run) =>
    run?.headSha === commit
    && run.event === "push"
    && run.headBranch === "main"
    && run.workflowName === ciWorkflowName
    && run.workflowDatabaseId === workflowId
    && typeof run.databaseId === "number").sort((left, right) => (right!.databaseId as number) - (left!.databaseId as number))[0] : undefined;
  if (!trusted) fail("exact_head_ci_not_green");
  const trustedRun = trusted as Record<string, unknown>;
  if (trustedRun.status !== "completed" || trustedRun.conclusion !== "success") {
    fail("exact_head_ci_not_green");
  }
  const run = object(json(await runAt(deps, deps.repoRoot, "gh", [
    "run", "view", String(trustedRun.databaseId), "--repo", repo.nameWithOwner, "--json", "jobs",
  ]), "github_ci_invalid"));
  const jobs = Array.isArray(run?.jobs) ? run.jobs.map(object).filter((job): job is Record<string, unknown> => Boolean(job)) : [];
  const verify = jobs.filter((job) => job.name === "verify");
  if (verify.length !== 1 || verify[0]?.status !== "completed" || verify[0]?.conclusion !== "success") fail("exact_head_ci_not_green");
  return trustedRun.databaseId as number;
};

const verifyDisabledRoutes = async (deps: DeployDependencies): Promise<void> => {
  for (const endpoint of [customMcp, workersMcp]) {
    const response = await deps.fetcher(endpoint, { signal: AbortSignal.timeout(10_000) })
      .catch(() => fail("disabled_route_unavailable"));
    if (response.status !== 503 || await response.text() !== "MCP temporarily disabled") fail("disabled_route_mismatch");
  }
};

const waitForInactive = async (deps: DeployDependencies, applicationId: string): Promise<void> => {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    if (instancesInactive(await wrangler(deps, ["containers", "instances", applicationId, "--json"]))) return;
    await deps.sleep(5_000);
  }
  fail("container_inactive_timeout");
};

const verifyCurrent = async (deps: DeployDependencies, expected: string): Promise<void> => {
  if ((await readCurrent(deps)).version !== expected) fail("cloudflare_deployment_drift");
};

const rollback = async (deps: DeployDependencies, journal: DeploymentJournal, starting: VersionState, startingContainer: ContainerState): Promise<void> => {
  journal.rollback = "attempted";
  await wrangler(deps, ["rollback", starting.id, "--message", `Automated rollback after failed ${journal.commit.slice(0, 7)} release`, "--yes"], 120_000);
  await verifyCurrent(deps, starting.id);
  const currentContainer = await readContainer(deps);
  if (currentContainer.id !== startingContainer.id || currentContainer.image !== startingContainer.image) fail("cloudflare_deployment_drift");
  const restored = parseVersionState(await readVersion(deps, starting.id), starting.id);
  if (restored.enabled) {
    await runAt(deps, deps.packageRoot, "pnpm", ["production:probe"], {
      timeoutMs: 120_000,
      env: { NEMLIG_EXPECTED_REVISION: restored.revision },
    });
  } else {
    await verifyDisabledRoutes(deps);
  }
  journal.rollback = "restored";
  journal.lastVerifiedState = "restored";
  journal.checks.push("starting_version_restored");
};

export async function deployProduction(commit: string, deps: DeployDependencies): Promise<DeploymentJournal> {
  if (!fullSha.test(commit)) fail("invalid_commit");
  const journal: DeploymentJournal = {
    schema: 2,
    operationId: (deps.operationId ?? randomUUID)(),
    commit,
    ciRunId: 0,
    startedAt: deps.now().toISOString(),
    checks: [],
    lastVerifiedState: "unchanged",
    rollback: "not_needed",
    outcome: "running",
    transitions: [],
  };
  let providerMutation = false;
  let mutationUncertain = false;
  let starting: VersionState | undefined;
  let startingContainer: ContainerState | undefined;
  let repository = "";
  let journalPath = "";

  try {
    if (!deps.env.NEMLIG_MCP_ACCESS_TOKEN?.trim()) fail("owner_access_token_required");
    const repo = await repoIdentity(deps);
    repository = repo.nameWithOwner;
    journal.ciRunId = await verifySource(deps, commit, repo);
    const common = deps.stateRoot ?? await runAt(deps, deps.repoRoot, "git", ["rev-parse", "--git-common-dir"]);
    const stateRoot = isAbsolute(common) ? common : resolve(deps.repoRoot, common);
    await mkdir(join(stateRoot, "nemlig-production-deploy"), { recursive: true, mode: 0o700 });
    const lockPath = join(stateRoot, "nemlig-production-deploy.lock");
    journalPath = join(stateRoot, "nemlig-production-deploy", "latest.json");
    await acquireLocalLease(lockPath, journal.operationId, commit);
    journal.remoteCommit = await acquireRemoteJournal(deps, repository, journal);
    await writeJournal(journalPath, journal);

    if (await verifySource(deps, commit, repo) !== journal.ciRunId) fail("github_ci_invalid");
    await wrangler(deps, ["whoami"]);
    const start = await readCurrent(deps);
    starting = parseVersionState(await readVersion(deps, start.version), start.version);
    startingContainer = await readContainer(deps);
    journal.startingVersion = starting.id;
    journal.startingContainerId = startingContainer.id;
    journal.startingImage = startingContainer.image;
    journal.checks.push("source_and_auth_preflight", "exclusive_lease", "starting_state_recorded");
    await writeJournal(journalPath, journal);

    const transition = async (phase: JournalPhase, kind: JournalKind, version?: string): Promise<void> => {
      journal.transitions.push({ phase, kind, at: deps.now().toISOString(), ...(version ? { version } : {}) });
      await appendRemoteJournal(deps, repository, journal);
      await writeJournal(journalPath, journal);
    };

    await verifyCurrent(deps, starting.id);
    await transition("disabled_deploy", "intent", starting.id);
    providerMutation = true;
    mutationUncertain = true;
    const disabledOutput = await wrangler(deps, ["deploy", "--var", "MCP_ENABLED:false", "--var", `NEMLIG_MCP_REVISION:${commit}`,
      "--message", `Automated production release disabled gate at ${commit.slice(0, 7)}`], 600_000);
    mutationUncertain = false;
    const disabledId = deployedVersionFromOutput(disabledOutput);
    await verifyCurrent(deps, disabledId);
    verifyCandidateVersion(await readVersion(deps, disabledId), disabledId, commit, false);
    const disabledContainer = await readContainer(deps);
    if (disabledContainer.id !== startingContainer.id || disabledContainer.image !== startingContainer.image) fail("container_image_changed_during_enable");
    await verifyDisabledRoutes(deps);
    await waitForInactive(deps, disabledContainer.id);
    journal.disabledVersion = disabledId;
    journal.disabledImage = disabledContainer.image;
    journal.lastVerifiedState = "disabled";
    journal.checks.push("disabled_version", "disabled_routes", "container_inactive");
    await transition("disabled_deploy", "result", disabledId);

    await verifyCurrent(deps, disabledId);
    await transition("enable_deploy", "intent", disabledId);
    mutationUncertain = true;
    const enabledOutput = await wrangler(deps, ["deploy", "--var", "MCP_ENABLED:true", "--var",
      `NEMLIG_MCP_REVISION:${commit}`, "--containers-rollout", "none", "--message",
      `Automated production release enabled at ${commit.slice(0, 7)}`], 180_000);
    mutationUncertain = false;
    const enabledId = deployedVersionFromOutput(enabledOutput);
    journal.enabledVersion = enabledId;
    await verifyCurrent(deps, enabledId);
    verifyCandidateVersion(await readVersion(deps, enabledId), enabledId, commit, true);
    const enabledContainer = await readContainer(deps);
    if (enabledContainer.id !== disabledContainer.id || enabledContainer.image !== disabledContainer.image) {
      fail("container_image_changed_during_enable");
    }
    await runAt(deps, deps.packageRoot, "pnpm", ["production:probe"], {
      timeoutMs: 120_000,
      env: { NEMLIG_EXPECTED_REVISION: commit },
    });
    await runAt(deps, deps.packageRoot, "pnpm", ["production:test:features"], { timeoutMs: 120_000 });
    journal.enabledVersion = enabledId;
    journal.enabledImage = enabledContainer.image;
    journal.lastVerifiedState = "enabled";
    journal.checks.push("enabled_version", "image_reused", "edge_acceptance", "authenticated_read_only_acceptance");
    await transition("enable_deploy", "result", enabledId);
    journal.outcome = "success";
  } catch (error) {
    journal.outcome = "failed";
    journal.failure = error instanceof DeployFailure ? error.code : "unexpected_failure";
    if (mutationUncertain) {
      journal.lastVerifiedState = "unknown";
    } else if (providerMutation && starting) {
      try {
        const current = await readCurrent(deps);
        const state = parseVersionState(await readVersion(deps, current.version), current.version);
        const candidate = journal.enabledVersion ?? journal.disabledVersion;
        if (current.version !== candidate && current.version !== starting.id) {
          journal.failure = "cloudflare_deployment_drift";
          journal.lastVerifiedState = "unknown";
        } else if (!state.enabled) {
          journal.lastVerifiedState = "disabled";
        } else if (current.version === starting.id) {
          journal.lastVerifiedState = starting.enabled ? "enabled" : "disabled";
        } else if (startingContainer) {
          await rollback(deps, journal, starting, startingContainer);
        }
      } catch {
        journal.rollback = journal.rollback === "attempted" ? "failed" : journal.rollback;
        journal.lastVerifiedState = "unknown";
      }
    }
  } finally {
    journal.completedAt = deps.now().toISOString();
    if (journalPath) {
      try {
        await writeJournal(journalPath, journal);
      } catch {
        journal.outcome = "failed";
        journal.failure = "deployment_journal_write_failed";
      }
    }
  }
  return journal;
}

async function main(): Promise<void> {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = resolve(packageRoot, "../..");
  const input = parseDeployCli(process.argv.slice(2));
  if (input.help) {
    console.log(`Usage: ${productionDeployUsage}`);
    return;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  const report = await deployProduction(input.commit, {
    repoRoot, packageRoot, env: process.env, run: defaultRunner, fetcher: fetch, signal: controller.signal,
    sleep: async (milliseconds) => await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)), now: () => new Date(),
  });
  process.removeListener("SIGINT", abort);
  process.removeListener("SIGTERM", abort);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome !== "success") process.exitCode = 1;
}

if (process.argv[1] && basename(process.argv[1]).replace(/\.ts$/u, ".js") === "production-deploy.js") {
  main().catch((error) => {
    console.error(error instanceof DeployFailure ? error.code : "production_deploy_failed");
    process.exitCode = 1;
  });
}
