import { execFile } from "node:child_process";
import { open, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const fullSha = /^[0-9a-f]{40}$/u;
const versionId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const remoteLeaseRef = "refs/heads/codex-lock/nemlig-production";
const customMcp = new URL("https://nemlig-mcp.broesby.dk/mcp");
const workersMcp = new URL("https://nemlig-mcp-cloudflare-production.mortenbroesby.workers.dev/mcp");
export const productionDeployUsage = "pnpm --filter nemlig-assistant production:deploy -- <40-character-main-commit>";

export type VerifiedState = "unchanged" | "disabled" | "enabled" | "restored" | "unknown";

export interface DeploymentJournal {
  schema: 1;
  commit: string;
  startedAt: string;
  completedAt?: string;
  startingVersion?: string;
  disabledVersion?: string;
  enabledVersion?: string;
  checks: string[];
  lastVerifiedState: VerifiedState;
  rollback: "not_needed" | "attempted" | "restored" | "failed";
  outcome: "running" | "success" | "failed";
  failure?: string;
}

interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
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
  stateRoot?: string;
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

const defaultRunner: CommandRunner = async (command, args, options = {}) => {
  try {
    const { stdout } = await execute(command, [...args], {
      cwd: options.cwd,
      encoding: "utf8",
      env: options.env,
      maxBuffer: 16 * 1024 * 1024,
      timeout: options.timeoutMs ?? 30_000,
    });
    return stdout.trim();
  } catch {
    return fail(`command_failed_${basename(command).replaceAll(/[^a-z0-9]/giu, "_").toLowerCase()}`);
  }
};

const runAt = (deps: DeployDependencies, cwd: string, command: string, args: readonly string[], options: RunOptions = {}) =>
  deps.run(command, args, { ...options, cwd, env: { ...deps.env, ...options.env } });

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
  await writeFile(temporary, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
};

const acquireLocalLease = async (path: string, commit: string): Promise<void> => {
  try {
    const handle = await open(path, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify({ commit })}\n`);
    await handle.close();
  } catch {
    fail("local_deployment_lease_unavailable");
  }
};

const repoIdentity = async (deps: DeployDependencies): Promise<{ nameWithOwner: string; url: string }> => {
  const value = object(json(await runAt(deps, deps.repoRoot, "gh", ["repo", "view", "--json", "nameWithOwner,url"]), "github_repository_invalid"));
  if (!value || typeof value.nameWithOwner !== "string" || typeof value.url !== "string") {
    throw new DeployFailure("github_repository_invalid");
  }
  return { nameWithOwner: value.nameWithOwner, url: value.url };
};

const verifySource = async (deps: DeployDependencies, commit: string, repo: { nameWithOwner: string; url: string }): Promise<void> => {
  await runAt(deps, deps.repoRoot, "gh", ["auth", "status", "-h", "github.com"]);
  await runAt(deps, deps.repoRoot, "git", ["-c", "credential.helper=!gh auth git-credential", "fetch", repo.url, "main:refs/remotes/origin/main"]);
  const [head, remote, status] = await Promise.all([
    runAt(deps, deps.repoRoot, "git", ["rev-parse", "HEAD"]),
    runAt(deps, deps.repoRoot, "git", ["rev-parse", "origin/main"]),
    runAt(deps, deps.repoRoot, "git", ["status", "--porcelain"]),
  ]);
  if (head !== commit || remote !== commit || status !== "") fail("source_revision_mismatch");
  const runs = json(await runAt(deps, deps.repoRoot, "gh", [
    "run", "list", "--repo", repo.nameWithOwner, "--commit", commit, "--workflow", "CI", "--limit", "10",
    "--json", "conclusion,headSha,status,url",
  ]), "github_ci_invalid");
  const latest = Array.isArray(runs) ? object(runs[0]) : undefined;
  if (!latest || latest.headSha !== commit || latest.status !== "completed" || latest.conclusion !== "success") {
    fail("exact_head_ci_not_green");
  }
};

const acquireRemoteLease = async (deps: DeployDependencies, repository: string, commit: string): Promise<void> => {
  try {
    await runAt(deps, deps.repoRoot, "gh", ["api", "--method", "POST", `repos/${repository}/git/refs`,
      "-f", `ref=${remoteLeaseRef}`, "-f", `sha=${commit}`]);
  } catch {
    fail("remote_deployment_lease_unavailable");
  }
};

const releaseRemoteLease = async (deps: DeployDependencies, repository: string, commit: string): Promise<void> => {
  const path = `repos/${repository}/git/ref/heads/codex-lock/nemlig-production`;
  const owner = await runAt(deps, deps.repoRoot, "gh", ["api", path, "--jq", ".object.sha"]);
  if (owner !== commit) fail("remote_deployment_lease_changed");
  await runAt(deps, deps.repoRoot, "gh", ["api", "--method", "DELETE", path]);
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

const rollback = async (deps: DeployDependencies, journal: DeploymentJournal, starting: VersionState): Promise<void> => {
  journal.rollback = "attempted";
  await wrangler(deps, ["rollback", starting.id, "--message", `Automated rollback after failed ${journal.commit.slice(0, 7)} release`, "--yes"], 120_000);
  await verifyCurrent(deps, starting.id);
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
    schema: 1,
    commit,
    startedAt: deps.now().toISOString(),
    checks: [],
    lastVerifiedState: "unchanged",
    rollback: "not_needed",
    outcome: "running",
  };
  let localLease = false;
  let remoteLease = false;
  let providerMutation = false;
  let mutationUncertain = false;
  let starting: VersionState | undefined;
  let repository = "";
  let journalPath = "";
  let lockPath = "";
  let safeToRelease = true;

  try {
    if (!deps.env.NEMLIG_MCP_ACCESS_TOKEN?.trim()) fail("owner_access_token_required");
    const repo = await repoIdentity(deps);
    repository = repo.nameWithOwner;
    await verifySource(deps, commit, repo);
    const common = deps.stateRoot ?? await runAt(deps, deps.repoRoot, "git", ["rev-parse", "--git-common-dir"]);
    const stateRoot = isAbsolute(common) ? common : resolve(deps.repoRoot, common);
    await mkdir(join(stateRoot, "nemlig-production-deploy"), { recursive: true, mode: 0o700 });
    lockPath = join(stateRoot, "nemlig-production-deploy.lock");
    journalPath = join(stateRoot, "nemlig-production-deploy", "latest.json");
    await acquireLocalLease(lockPath, commit);
    localLease = true;
    await acquireRemoteLease(deps, repository, commit);
    remoteLease = true;
    await writeJournal(journalPath, journal);

    await wrangler(deps, ["whoami"]);
    const start = await readCurrent(deps);
    starting = parseVersionState(await readVersion(deps, start.version), start.version);
    journal.startingVersion = starting.id;
    journal.checks.push("source_and_auth_preflight", "exclusive_lease", "starting_state_recorded");
    await writeJournal(journalPath, journal);

    await verifyCurrent(deps, starting.id);
    providerMutation = true;
    mutationUncertain = true;
    const disabledOutput = await wrangler(deps, ["deploy", "--var", "MCP_ENABLED:false", "--var", `NEMLIG_MCP_REVISION:${commit}`,
      "--message", `Automated production release disabled gate at ${commit.slice(0, 7)}`], 600_000);
    mutationUncertain = false;
    const disabledId = deployedVersionFromOutput(disabledOutput);
    journal.disabledVersion = disabledId;
    await verifyCurrent(deps, disabledId);
    verifyCandidateVersion(await readVersion(deps, disabledId), disabledId, commit, false);
    const disabledContainer = await readContainer(deps);
    await verifyDisabledRoutes(deps);
    await waitForInactive(deps, disabledContainer.id);
    journal.lastVerifiedState = "disabled";
    journal.checks.push("disabled_version", "disabled_routes", "container_inactive");
    await writeJournal(journalPath, journal);

    await verifyCurrent(deps, disabledId);
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
    journal.lastVerifiedState = "enabled";
    journal.checks.push("enabled_version", "image_reused", "edge_acceptance", "authenticated_read_only_acceptance");
    journal.outcome = "success";
  } catch (error) {
    journal.outcome = "failed";
    journal.failure = error instanceof DeployFailure ? error.code : "unexpected_failure";
    if (mutationUncertain) {
      journal.lastVerifiedState = "unknown";
      safeToRelease = false;
    } else if (providerMutation && starting) {
      try {
        const current = await readCurrent(deps);
        const state = parseVersionState(await readVersion(deps, current.version), current.version);
        if (!state.enabled) {
          journal.lastVerifiedState = "disabled";
        } else if (current.version === starting.id) {
          journal.lastVerifiedState = starting.enabled ? "enabled" : "disabled";
        } else {
          await rollback(deps, journal, starting);
        }
      } catch {
        journal.rollback = journal.rollback === "attempted" ? "failed" : journal.rollback;
        journal.lastVerifiedState = "unknown";
        safeToRelease = false;
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
        safeToRelease = false;
      }
    }
    if (remoteLease && safeToRelease) {
      try {
        await releaseRemoteLease(deps, repository, commit);
      } catch {
        journal.outcome = "failed";
        journal.failure = "remote_deployment_lease_release_failed";
        safeToRelease = false;
        if (journalPath) await writeJournal(journalPath, journal).catch(() => undefined);
      }
    }
    if (localLease && safeToRelease) {
      try {
        await unlink(lockPath);
      } catch {
        journal.outcome = "failed";
        journal.failure = "local_deployment_lease_release_failed";
        if (journalPath) await writeJournal(journalPath, journal).catch(() => undefined);
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
  const report = await deployProduction(input.commit, {
    repoRoot,
    packageRoot,
    env: process.env,
    run: defaultRunner,
    fetcher: fetch,
    sleep: async (milliseconds) => await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
    now: () => new Date(),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome !== "success") process.exitCode = 1;
}

if (process.argv[1] && basename(process.argv[1]).replace(/\.ts$/u, ".js") === "production-deploy.js") {
  main().catch((error) => {
    console.error(error instanceof DeployFailure ? error.code : "production_deploy_failed");
    process.exitCode = 1;
  });
}
