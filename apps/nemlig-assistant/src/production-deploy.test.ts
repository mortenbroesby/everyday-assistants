import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  deployProduction,
  commandFailureDiagnostic,
  defaultRunner,
  finalizeDeploymentRecovery,
  inspectDeploymentRecovery,
  reconcilePendingRollback,
  instancesInactive,
  parseContainer,
  parseDeployCli,
  parseProductionDeployCli,
  parseCurrentDeployment,
  parseDeployArgs,
  parseDeploymentJournal,
  parseVersionState,
  preflightProductionDeploy,
  productionDeployUsage,
  verifyCandidateVersion,
  type CommandRunner,
  type DeployDependencies,
} from "../scripts/production-deploy.js";

const commit = "7bdf94cbea0a1c3c63a5b64c97fbb05ad3b71b73";
const previousCommit = "2c952d20999b8ac47f7b060be97f2f84445defcb";
const startingId = "958ad415-2395-40c1-8baf-b394dafce67f";
const disabledId = "11111111-1111-4111-8111-111111111111";
const enabledId = "22222222-2222-4222-8222-222222222222";
const thirdPartyId = "33333333-3333-4333-8333-333333333333";
const applicationId = "a03ce8c9-3543-4505-866e-14d2e66007ca";
const image = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const candidateImage = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const accountId = "0123456789abcdef0123456789abcdef";
const configDigest = "97844eb211bcad40d0ecb550858a0f487e2c00e3fba748c45b5536cc65e73968";
const execFileAsync = promisify(execFile);
const obsoleteAdmissionVars = ["MCP_RATE_LIMIT", "MCP_EXPENSIVE_RATE_LIMIT", "MCP_CREDENTIAL_RATE_LIMIT", "MCP_CREDENTIAL_GLOBAL_RATE_LIMIT", "MCP_EXPENSIVE_DAILY_LIMIT", "MCP_DAILY_LIMIT"];

const version = (id: string, revision: string, enabled: boolean) => JSON.stringify({
  id,
  resources: {
    script_runtime: {
      limits: { cpu_ms: 100, subrequests: 8 },
      containers: [{ class_name: "NemligMcpContainer", name: "nemlig-production" }],
    },
    bindings: [
      ...[
      ["MCP_AUTH_TIMEOUT_MS", "5000"],
      ["MCP_BACKEND_TIMEOUT_MS", "85000"],
      ["MCP_CREDENTIAL_ONBOARDING_ENABLED", "false"],
      ["MCP_CONTROL_TIMEOUT_MS", "3000"],
      ["MCP_ENABLED", String(enabled)],
      ["MCP_TOTAL_TIMEOUT_MS", "90000"],
      ["NEMLIG_MCP_CREDENTIAL_KEY_VERSION", "one"],
      ["NEMLIG_MCP_AUTH0_AUDIENCE", "https://nemlig-mcp.broesby.dk/mcp"],
      ["NEMLIG_MCP_AUTH0_ISSUER", "https://everyday-assistants.eu.auth0.com/"],
      ["NEMLIG_MCP_HTTP_HOST", "0.0.0.0"],
      ["NEMLIG_MCP_HTTP_PORT", "8080"],
      ["NEMLIG_MCP_PUBLIC_URL", "https://nemlig-mcp.broesby.dk/mcp"],
      ["NEMLIG_MCP_REVISION", revision],
      ["NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED", "true"],
      ["NEMLIG_MCP_SERVICE_CLIENT_ID", "service-client"],
      ].map(([name, text]) => ({ name, text, type: "plain_text" })),
      { name: "NEMLIG_MCP_CONTAINER", type: "durable_object_namespace", class_name: "NemligMcpContainer" },
      { name: "NEMLIG_PLAN_STORAGE", type: "durable_object_namespace", class_name: "PlanStorage" },
      { name: "NEMLIG_MCP_PRINCIPALS", type: "secret_text" },
    ],
  },
});

const deployment = (id: string) => JSON.stringify([{
  id: `deployment-${id}`,
  created_on: "2026-09-05T12:00:00Z",
  versions: [{ version_id: id, percentage: 100 }],
}]);

const config = (path: string) => ({
  configPath: path, userConfigPath: path, name: "nemlig-mcp-cloudflare-production", keep_vars: false,
  limits: { cpu_ms: 100, subrequests: 8 },
  vars: {
    MCP_ENABLED: "false",
    MCP_AUTH_TIMEOUT_MS: "5000", MCP_CONTROL_TIMEOUT_MS: "3000", MCP_TOTAL_TIMEOUT_MS: "90000", MCP_BACKEND_TIMEOUT_MS: "85000",
    MCP_CREDENTIAL_ONBOARDING_ENABLED: "false",
    NEMLIG_MCP_CREDENTIAL_KEY_VERSION: "one",
    NEMLIG_MCP_HTTP_HOST: "0.0.0.0", NEMLIG_MCP_HTTP_PORT: "8080", NEMLIG_MCP_AUTH0_ISSUER: "https://everyday-assistants.eu.auth0.com/",
    NEMLIG_MCP_AUTH0_AUDIENCE: "https://nemlig-mcp.broesby.dk/mcp", NEMLIG_MCP_PUBLIC_URL: "https://nemlig-mcp.broesby.dk/mcp",
    NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED: "true", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client",
  },
  containers: [{ class_name: "NemligMcpContainer", instance_type: "lite", max_instances: 1, constraints: { jurisdiction: "eu" } }],
  durable_objects: { bindings: [{ name: "NEMLIG_MCP_CONTAINER", class_name: "NemligMcpContainer" }, { name: "NEMLIG_PLAN_STORAGE", class_name: "PlanStorage" }] },
});

const recoveryDeps = (journal: Record<string, unknown>, currentVersion: string, currentEnabled: boolean, options: { image?: string; applicationVersion?: number; active?: boolean; revision?: string; configDrift?: boolean; rollbackTo?: { version: string; enabled: boolean } } = {}): DeployDependencies => {
  let liveVersion = currentVersion;
  let liveEnabled = currentEnabled;
  let remoteParent = typeof journal.remoteCommit === "string" ? journal.remoteCommit : "cccccccccccccccccccccccccccccccccccccccc";
  let remoteHead = "dddddddddddddddddddddddddddddddddddddddd";
  let nextCommit = 14;
  let currentJournal = JSON.stringify(journal);
  const tree = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const blob = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const run: CommandRunner = async (command, args, runOptions) => {
    if (command === "git" && args.includes("--git-common-dir")) return "/tmp";
    if (command === "pnpm" && args.includes("rollback") && options.rollbackTo) {
      liveVersion = options.rollbackTo.version;
      liveEnabled = options.rollbackTo.enabled;
      return "rollback accepted";
    }
    if (command === "pnpm" && args.includes("deployments")) return deployment(liveVersion);
    if (command === "pnpm" && args.includes("versions")) {
      const raw = version(liveVersion, options.revision ?? commit, liveEnabled);
      return options.configDrift ? raw.replace('"name":"MCP_TOTAL_TIMEOUT_MS","text":"90000"', '"name":"MCP_TOTAL_TIMEOUT_MS","text":"90001"') : raw;
    }
    if (command === "pnpm" && args.includes("instances")) return JSON.stringify([{ id: "durable-object", name: "nemlig-production", state: options.active ? "running" : "inactive", version: options.active ? options.applicationVersion ?? 25 : null }]);
    if (command === "pnpm" && args.includes("info")) return JSON.stringify({
      id: applicationId, name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production", instances: 1,
      configuration: { image: options.image ?? image }, version: options.applicationVersion ?? 25,
    });
    if (command === "pnpm" && args.includes("registries")) return JSON.stringify({ username: "v1", password: "pull-credential" });
    if (command === "pnpm" && args.includes("containers")) return JSON.stringify([{
      id: applicationId, name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production", instances: 1, image: options.image ?? image, version: options.applicationVersion ?? 25,
    }]);
    if (command === "docker") return JSON.stringify({ Descriptor: { digest: candidateImage } });
    if (command !== "gh") throw new Error("unexpected command");
    if (args[0] === "repo") return JSON.stringify({ nameWithOwner: "mortenbroesby/everyday-assistants", url: "https://github.com/mortenbroesby/everyday-assistants" });
    if (args[0] === "api" && args[1] === "--method" && args[2] === "DELETE") { remoteHead = ""; return ""; }
    const path = args.find((value) => value.startsWith("repos/")) ?? "";
    if (args[0] === "api" && args[1] === "--method" && args[2] === "POST" && path.endsWith("git/blobs")) {
      currentJournal = Buffer.from(JSON.parse(runOptions?.input ?? "{}").content, "base64").toString("utf8");
      return JSON.stringify({ sha: blob });
    }
    if (args[0] === "api" && args[1] === "--method" && args[2] === "POST" && path.endsWith("git/trees")) return JSON.stringify({ sha: tree });
    if (args[0] === "api" && args[1] === "--method" && args[2] === "POST" && path.endsWith("git/commits")) return JSON.stringify({ sha: (nextCommit++).toString(16).padStart(40, "0") });
    if (args[0] === "api" && args[1] === "--method" && args[2] === "PATCH" && path.includes("git/refs/heads/codex-lock/nemlig-production")) {
      remoteParent = remoteHead;
      remoteHead = JSON.parse(runOptions?.input ?? "{}").sha;
      return JSON.stringify({ object: { sha: remoteHead } });
    }
    if (path.includes("git/ref/")) return remoteHead;
    if (path.includes("git/commits/")) return JSON.stringify({ tree: { sha: tree }, parents: remoteParent ? [{ sha: remoteParent }] : [] });
    if (path.includes("git/trees/")) return JSON.stringify({ tree: [{ path: "journal.json", type: "blob", mode: "100644", sha: blob }] });
    if (path.includes("git/blobs/")) return JSON.stringify({ encoding: "base64", content: Buffer.from(currentJournal).toString("base64") });
    throw new Error("unexpected gh api");
  };
  return { repoRoot: ".", packageRoot: ".", env: { CLOUDFLARE_ACCOUNT_ID: accountId }, run,
    fetcher: async () => new Response("MCP temporarily disabled", { status: 503 }),
    registryFetcher: async () => new Response(null, { status: 200, headers: { "docker-content-digest": candidateImage } }),
    sleep: async () => undefined, now: () => new Date() };
};

const terminalJournal = (extra: Record<string, unknown> = {}) => ({
  schema: 2, operationId: "44444444-4444-4444-8444-444444444444", commit, ciRunId: 456, releaseRunId: "local", releaseRunAttempt: "local", startedAt: "2026-09-05T12:00:00.000Z",
  completedAt: "2026-09-05T12:00:06.000Z", startingVersion: startingId, startingContainerId: applicationId, startingImage: image,
  startingApplicationVersion: 25, startingConfigDigest: configDigest, startingEnabled: true, checks: ["starting_version_restored"], rollback: "restored",
  outcome: "failed", lastVerifiedState: "restored", transitions: [
    { phase: "disabled_deploy", kind: "intent", at: "2026-09-05T12:00:00.000Z", version: startingId },
    { phase: "disabled_deploy", kind: "result", at: "2026-09-05T12:00:01.000Z", version: disabledId },
    { phase: "enable_deploy", kind: "intent", at: "2026-09-05T12:00:02.000Z", version: disabledId },
    { phase: "enable_deploy", kind: "result", at: "2026-09-05T12:00:03.000Z", version: enabledId },
    { phase: "rollback", kind: "intent", at: "2026-09-05T12:00:04.000Z", version: startingId },
    { phase: "rollback", kind: "result", at: "2026-09-05T12:00:05.000Z", version: startingId },
  ], ...extra,
});

const interruptedContainerRestoreJournal = (extra: Record<string, unknown> = {}) => ({
  ...terminalJournal(),
  completedAt: "2026-10-05T13:58:48.863Z", remoteCommit: "cccccccccccccccccccccccccccccccccccccccc", startingRevision: commit,
  startingApplicationVersion: 25, enabledApplicationVersion: 26, disabledApplicationVersion: 26,
  enabledVersion: enabledId, enabledImage: candidateImage, disabledVersion: disabledId, disabledImage: candidateImage,
  failure: "container_instance_timeout", rollback: "failed", lastVerifiedState: "unknown",
  checks: ["starting_state_recorded", "disabled_version", "enabled_version", "container_rollout"],
  transitions: [
    { phase: "enable_deploy", kind: "intent", at: "2026-10-05T13:50:00.000Z", version: startingId },
    { phase: "enable_deploy", kind: "result", at: "2026-10-05T13:51:00.000Z", version: enabledId },
    { phase: "rollback", kind: "intent", at: "2026-10-05T13:56:00.000Z", version: enabledId },
    { phase: "rollback", kind: "result", at: "2026-10-05T13:57:00.000Z", version: disabledId },
    { phase: "container_restore", kind: "intent", at: "2026-10-05T13:58:00.000Z", version: disabledId },
  ],
  ...extra,
});

const directInterruptedContainerRestoreJournal = (extra: Record<string, unknown> = {}) => interruptedContainerRestoreJournal({
  disabledVersion: null, disabledImage: null, disabledApplicationVersion: null,
  failure: "service_fixture_acceptance_failed",
  transitions: [
    { phase: "enable_deploy", kind: "intent", at: "2026-10-05T13:50:00.000Z", version: startingId },
    { phase: "enable_deploy", kind: "result", at: "2026-10-05T13:51:00.000Z", version: enabledId },
    { phase: "container_restore", kind: "intent", at: "2026-10-05T13:58:00.000Z", version: enabledId },
  ],
  ...extra,
});

const interruptedContainerRestoreDeps = (journal: Record<string, unknown>, options: { updatedAt?: string; alreadyRestored?: boolean; restoreOutcomeUnknown?: boolean; direct?: boolean; workerRestored?: boolean; active?: boolean; candidateConfigDrift?: boolean } = {}) => {
  let applicationImage = options.alreadyRestored
    ? `registry.cloudflare.com/${accountId}/nemlig-mcp-cloudflare-production-nemligmcpcontainer-production@${image}`
    : `registry.cloudflare.com/${accountId}/nemlig-mcp-cloudflare-production-nemligmcpcontainer-production@${candidateImage}`;
  let applicationVersion = options.alreadyRestored ? 27 : 26;
  let running = false;
  let rollouts = 0;
  const deps = recoveryDeps(journal, options.direct && !options.workerRestored ? enabledId : options.direct ? startingId : disabledId, options.direct === true, {
    image: candidateImage, applicationVersion, rollbackTo: { version: startingId, enabled: true },
  });
  deps.env = { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: "test-token",
    NEMLIG_MCP_AUTH0_ISSUER: "https://everyday-assistants.eu.auth0.com/", NEMLIG_MCP_PUBLIC_URL: "https://nemlig-mcp.broesby.dk/mcp",
    NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client", NEMLIG_MCP_SERVICE_CLIENT_SECRET: "test-secret", NEMLIG_CI_ACCEPTANCE_READY: "true" };
  const originalRun = deps.run;
  deps.run = async (command, args, runOptions) => {
    if (command === "pnpm" && args.includes("info")) return JSON.stringify({
      id: applicationId, name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production", instances: 1,
      configuration: { image: applicationImage }, version: applicationVersion,
    });
    if (command === "pnpm" && args.includes("instances")) return JSON.stringify([{
      id: "durable-object", name: "nemlig-production", state: running ? "running" : "inactive", version: running ? applicationVersion : null,
    }]);
    if (command === "pnpm" && args.some((arg) => arg.startsWith("production:"))) {
      if (args.includes("initialize-only") || args.includes("production:probe")) running = true;
      return "";
    }
    const result = await originalRun(command, args, runOptions);
    return options.candidateConfigDrift && command === "pnpm" && args.includes("versions") && args.includes(enabledId)
      ? result.replace('"name":"NEMLIG_MCP_CREDENTIAL_KEY_VERSION","text":"one"', '"name":"NEMLIG_MCP_CREDENTIAL_KEY_VERSION","text":"two"')
      : result;
  };
  deps.fetcher = async (input, init) => {
    const url = String(input);
    if (url.includes("api.cloudflare.com") && url.endsWith("/rollouts") && init?.method === "POST") {
      rollouts += 1;
      if (options.restoreOutcomeUnknown) throw new Error("connection ended after request write");
      const body = JSON.parse(String(init.body)) as { target_configuration: { image: string } };
      applicationImage = body.target_configuration.image;
      applicationVersion += 1;
      return Response.json({ success: true, result: { id: "rollout-restore-test" } });
    }
    if (url.includes("api.cloudflare.com") && url.endsWith("/versions")) return Response.json({ success: true, result: [{
      version: 25,
      configuration: {
        image: `registry.cloudflare.com/${accountId}/nemlig-mcp-cloudflare-production-nemligmcpcontainer-production@${image}`,
        observability: { logs: { enabled: false } },
      },
    }] });
    if (url.includes("api.cloudflare.com")) return Response.json({ success: true, result: {
      id: applicationId, configuration: { image: applicationImage }, version: applicationVersion,
      scheduling_policy: "default", active_rollout_id: options.active ? "rollout-active" : null,
      updated_at: options.updatedAt ?? "2026-10-05T13:50:00.000Z",
    } });
    return new Response("MCP temporarily disabled", { status: 503 });
  };
  deps.issueServiceToken = async () => "test-machine-token";
  return { deps, get rollouts() { return rollouts; } };
};

interface Call {
  command: string;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
  input?: string;
}

interface SharedLeaseStore {
  ref?: string;
  objectNumber?: number;
  blobs?: Map<string, string>;
  trees?: Map<string, string>;
  commits?: Map<string, { tree: string; parents: string[] }>;
}

async function fixture(options: {
  head?: string;
  remoteMain?: string;
  recoveryAncestor?: boolean;
  startingRevision?: string;
  deployedRevisionNotAncestor?: boolean;
  remoteAfterPreflight?: boolean;
  remoteLeaseBlocked?: boolean;
  remoteLeaseChanges?: boolean;
  repository?: string;
  workflowId?: number;
  workflowPath?: string;
  run?: Record<string, unknown>;
  runs?: Array<Record<string, unknown>>;
  jobs?: Array<Record<string, unknown>>;
  disabledResponse?: string;
  disabledFetchFails?: boolean;
  driftBeforeEnable?: boolean;
  failDisabledDeploy?: boolean;
  failFeatures?: boolean;
  failCandidateFeatures?: boolean;
  failFeaturesOnce?: boolean;
  staleRuntimeReads?: number;
  staleRuntimeForever?: boolean;
  failProbe?: boolean;
  failProbeOnce?: boolean;
  failCurrentRead?: boolean;
  externalEnabledDriftDuringRecovery?: boolean;
  enableApplicationVersionDrift?: boolean;
  candidateApplicationVersion?: number;
  disabledApplicationIdDrift?: boolean;
  restoredInstanceRows?: unknown[];
  rollbackApplicationVersionDrift?: boolean;
  enabledInstanceRows?: unknown[][];
  candidateInstancesNeverStart?: boolean;
  postProofWorkerDrift?: boolean;
  postProofLeaseDrift?: boolean;
  postProofApplicationVersionDrift?: boolean;
  candidateContainerDelay?: number;
  candidateWrongImage?: boolean;
  candidateMatchesStarting?: boolean;
  restoreSchedulingPolicy?: string;
  malformedManifest?: boolean;
  remoteIntentFailure?: boolean;
  remoteResultFailure?: boolean;
  remoteEnableIntentFailure?: boolean;
  localResultMirrorFailure?: boolean;
  remoteObjectFailure?: "blob" | "tree" | "commit" | "patch";
  localFinalMirrorFailure?: boolean;
  sharedLease?: SharedLeaseStore;
  configReader?: DeployDependencies["configReader"];
  versionBindings?: (values: Record<string, unknown>[], id: string) => Record<string, unknown>[];
} = {}): Promise<{ deps: DeployDependencies; calls: Call[]; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "nemlig-production-deploy-"));
  await writeFile(join(root, "wrangler.jsonc"), "{}", "utf8");
  const calls: Call[] = [];
  let current = startingId;
  let applicationVersion = 25;
  let enabledInstanceReads = 0;
  let probeReads = 0;
  let featureReads = 0;
  let initializationReads = 0;
  let disabledContainerReads = 0;
  let rolledBack = false;
  let apiRestored = false;
  let appended = false;
  let resultWriteFailed = false;
  let remoteLease: string | undefined = options.sharedLease?.ref;
  const currentLease = () => options.sharedLease ? options.sharedLease.ref : remoteLease;
  const setRemoteLease = (value: string | undefined) => { remoteLease = value; if (options.sharedLease) options.sharedLease.ref = value; };
  const shared = options.sharedLease;
  let objectNumber = shared?.objectNumber ?? 0;
  const blobs = shared?.blobs ?? new Map<string, string>();
  const trees = shared?.trees ?? new Map<string, string>();
  const commits = shared?.commits ?? new Map<string, { tree: string; parents: string[] }>();
  if (shared) Object.assign(shared, { blobs, trees, commits });
  const nextSha = () => {
    if (shared) return (shared.objectNumber = (shared.objectNumber ?? 0) + 1).toString(16).padStart(40, "0");
    objectNumber += 1;
    return objectNumber.toString(16).padStart(40, "0");
  };
  let disabledReads = 0;
  let remoteReads = 0;
  let sourceAncestryReads = 0;
  const run: CommandRunner = async (commandName, args, runOptions) => {
    calls.push({ command: commandName, args: [...args], env: runOptions?.env, input: runOptions?.input });
    if (commandName === "gh" && args[0] === "repo") {
      return JSON.stringify({ nameWithOwner: options.repository ?? "mortenbroesby/everyday-assistants", url: `https://github.com/${options.repository ?? "mortenbroesby/everyday-assistants"}` });
    }
    if (commandName === "gh" && args[0] === "workflow") {
      return JSON.stringify([{ id: options.workflowId ?? 123, name: "CI", path: options.workflowPath ?? ".github/workflows/ci.yml", state: "active" }]);
    }
    if (commandName === "gh" && args[0] === "run") {
      if (args[1] === "view") return JSON.stringify({ jobs: options.jobs ?? [{ name: "verify", status: "completed", conclusion: "success" }] });
      const base = {
        databaseId: 456,
        workflowDatabaseId: options.workflowId ?? 123,
        workflowName: "CI",
        headSha: commit,
        headBranch: "main",
        event: "push",
        status: "completed",
        conclusion: "success",
        url: "https://example.test/ci",
        ...options.run,
      };
      return JSON.stringify(options.runs ?? [base]);
    }
    if (commandName === "gh" && args[0] === "api") {
      const method = args.includes("POST") ? "POST" : args.includes("PATCH") ? "PATCH" : args.includes("DELETE") ? "DELETE" : "GET";
      const path = args.find((arg) => arg.startsWith("repos/")) ?? "";
      const body = runOptions?.input ? JSON.parse(runOptions.input) as Record<string, unknown> : undefined;
      if (path.endsWith("environments/nemlig-production")) return JSON.stringify({
        can_admins_bypass: false,
        deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
        protection_rules: [{ type: "branch_policy" }],
      });
      if (path.endsWith("environments/nemlig-production/deployment-branch-policies")) return JSON.stringify({ branch_policies: [{ name: "main", type: "branch" }] });
      if (path.endsWith("environments/nemlig-production/variables")) return JSON.stringify({ variables: [{ name: "NEMLIG_CI_ACCEPTANCE_READY", value: "true" }] });
      if (path.endsWith("git/ref/heads/codex-lock/nemlig-production") || path.endsWith("git/refs/heads/codex-lock/nemlig-production")) {
        if (method === "GET") {
          if (!currentLease()) throw Object.assign(new Error("not found"), { status: 404 });
          if (options.postProofLeaseDrift && enabledInstanceReads > 0) return previousCommit;
          return currentLease()!;
        }
        if (method === "DELETE") { setRemoteLease(undefined); return ""; }
      }
      if (path.endsWith("git/blobs") && method === "POST") {
        const snapshot = Buffer.from(String(body?.content), "base64").toString("utf8");
        const transitionCount = JSON.parse(snapshot).transitions.length;
        if (options.remoteObjectFailure === "blob" && transitionCount % 2 === 1) throw new Error("blob failed");
        if (options.remoteIntentFailure && transitionCount % 2 === 1) throw new Error("intent write failed");
        if (options.remoteEnableIntentFailure && transitionCount === 3) throw new Error("enable intent write failed");
        if (options.remoteResultFailure && transitionCount > 0 && transitionCount % 2 === 0 && !resultWriteFailed) { resultWriteFailed = true; throw new Error("result write failed"); }
        if (options.localResultMirrorFailure && transitionCount === 2) {
          await rm(join(root, "nemlig-production-deploy", "latest.json"));
          await mkdir(join(root, "nemlig-production-deploy", "latest.json"));
        }
        const sha = nextSha(); blobs.set(sha, snapshot); return JSON.stringify({ sha });
      }
      if (path.endsWith("git/trees") && method === "POST") { const blobSha = String((body?.tree as Array<Record<string, unknown>>)?.[0]?.sha); if (options.remoteObjectFailure === "tree" && JSON.parse(blobs.get(blobSha) ?? "{}").transitions.length % 2 === 1) throw new Error("tree failed"); const sha = nextSha(); trees.set(sha, blobSha); return JSON.stringify({ sha }); }
      if (path.endsWith("git/commits") && method === "POST") { const tree = String(body?.tree); const blob = trees.get(tree); if (options.remoteObjectFailure === "commit" && JSON.parse(blobs.get(blob ?? "") ?? "{}").transitions.length % 2 === 1) throw new Error("commit failed"); const sha = nextSha(); commits.set(sha, { tree, parents: Array.isArray(body?.parents) ? body.parents.map(String) : [] }); return JSON.stringify({ sha }); }
      if (path.endsWith("git/refs") && method === "POST") {
        if (options.remoteLeaseBlocked || currentLease()) throw new Error("exists");
        setRemoteLease(String(body?.sha)); return "{}";
      }
      if (path.endsWith("git/refs/heads/codex-lock/nemlig-production") && method === "PATCH") {
        if (options.remoteObjectFailure === "patch") throw new Error("patch failed");
        if (!body || body.force !== false || !currentLease()) throw new Error("invalid patch");
        if (commits.get(String(body.sha))?.parents[0] !== currentLease()) throw new Error("non-fast-forward");
        if (options.remoteLeaseChanges && !appended) setRemoteLease(previousCommit);
        else setRemoteLease(String(body.sha));
        appended = true; return "{}";
      }
      const commitSha = path.match(/git\/commits\/([0-9a-f]{40})$/u)?.[1];
      if (commitSha) return JSON.stringify({
        tree: { sha: commits.get(commitSha)?.tree },
        parents: commits.get(commitSha)?.parents.map((sha) => ({ sha })) ?? [],
      });
      const treeSha = path.match(/git\/trees\/([0-9a-f]{40})$/u)?.[1];
      if (treeSha) return JSON.stringify({ tree: [{ path: "journal.json", type: "blob", mode: "100644", sha: trees.get(treeSha) }] });
      const blobSha = path.match(/git\/blobs\/([0-9a-f]{40})$/u)?.[1];
      if (blobSha) return JSON.stringify({ encoding: "base64", content: Buffer.from(blobs.get(blobSha) ?? "").toString("base64") });
      throw new Error("unexpected gh api");
    }
    if (commandName === "gh") return "";
    if (commandName === "docker") {
      if (options.malformedManifest) return JSON.stringify({ Descriptor: { digest: "latest" } });
      return JSON.stringify({ Descriptor: { digest: options.candidateMatchesStarting ? image : candidateImage } });
    }
    if (commandName === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return options.head ?? commit;
    if (commandName === "git" && args[0] === "rev-parse" && args[1] === "origin/main") {
      remoteReads += 1;
      return options.remoteAfterPreflight && remoteReads > 1 ? previousCommit : options.remoteMain ?? commit;
    }
    if (commandName === "git" && args[0] === "status") return "";
    if (commandName === "git" && args[0] === "merge-base") {
      if (args[3] === "origin/main") {
        sourceAncestryReads += 1;
        if (options.recoveryAncestor === false || (options.remoteAfterPreflight && sourceAncestryReads > 1)) throw new Error("candidate is not on main");
      }
      if (args[3] === commit && options.deployedRevisionNotAncestor) throw new Error("deployed revision is newer than candidate");
    }
    if (commandName === "git") return "";
    if (commandName !== "pnpm") throw new Error("unexpected command");
    if (args[0] === "production:probe") {
      probeReads += 1;
      if (options.failProbe) throw new Error("private edge failure detail");
      if (options.failProbeOnce && probeReads === 1) throw new Error("edge not converged");
      return "edge ok";
    }
    if (args[0] === "production:test:features") {
      const initializeOnly = args.includes("--initialize-only");
      const wakeOnly = args.includes("--wake-only");
      if (initializeOnly) {
        if (!wakeOnly) initializationReads += 1;
      } else featureReads += 1;
      if (initializeOnly && !wakeOnly && ((options.staleRuntimeReads ?? 0) >= initializationReads || options.staleRuntimeForever)) {
        throw Object.assign(new Error("previous runtime"), { acceptanceFailure: {
          stage: "read_only", profile: "service", category: "feature_failed",
          lastCompletedBoundary: "service_runtime_version_read", correlationIds: [],
        } });
      }
      if (!initializeOnly && options.failCandidateFeatures && current === enabledId) throw new Error("candidate acceptance failed");
      if (!initializeOnly && options.failFeaturesOnce && featureReads === 1) throw new Error("container not converged");
      if (!initializeOnly && options.failFeatures) throw new Error("acceptance failed");
      if (!initializeOnly && options.localFinalMirrorFailure) {
        await rm(join(root, "nemlig-production-deploy", "latest.json"));
        await mkdir(join(root, "nemlig-production-deploy", "latest.json"));
      }
      return initializeOnly ? "service initialized" : "features ok";
    }
    if (!args.includes("wrangler")) throw new Error("unexpected pnpm command");
    if (args.includes("deployments") && args.includes("list")) {
      if (options.failCurrentRead) throw new Error("not authenticated");
      if (options.postProofWorkerDrift && enabledInstanceReads > 0) return deployment(thirdPartyId);
      if (options.externalEnabledDriftDuringRecovery && options.failFeatures && current === enabledId) return deployment(thirdPartyId);
      if (current === disabledId) disabledReads += 1;
      return deployment(options.driftBeforeEnable && disabledReads >= 2 ? startingId : current);
    }
    if (args.includes("versions") && args.includes("view")) {
      const id = args[args.indexOf("view") + 1];
      if (id && [startingId, disabledId, enabledId, thirdPartyId].includes(id)) {
        const revision = id === startingId ? options.startingRevision ?? previousCommit : id === thirdPartyId ? previousCommit : commit;
        const parsed = JSON.parse(version(id, revision, id !== disabledId)) as { resources: { bindings: Record<string, unknown>[] } };
        if (options.versionBindings) parsed.resources.bindings = options.versionBindings(parsed.resources.bindings, id);
        return JSON.stringify(parsed);
      }
    }
    if (args.includes("containers") && args.includes("list")) return JSON.stringify([{
      id: applicationId, name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production", instances: 1, image, version: 25,
    }]);
    if (args.includes("containers") && args.includes("info")) {
      const candidate = current !== startingId;
      if (candidate) disabledContainerReads += 1;
      const converged = disabledContainerReads > (options.candidateContainerDelay ?? 0);
      return JSON.stringify({
      id: options.disabledApplicationIdDrift && current === disabledId ? thirdPartyId : applicationId,
      name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production",
      instances: 1,
        configuration: { image: apiRestored ? image : candidate && converged ? (options.candidateWrongImage ? `sha256:${"c".repeat(64)}` : options.candidateMatchesStarting ? image : candidateImage) : image },
        version: options.postProofApplicationVersionDrift && enabledInstanceReads > 0 ? applicationVersion + 1
        : apiRestored ? applicationVersion
        : candidate && converged ? applicationVersion : 25,
      });
    }
    if (args.includes("containers") && args.includes("instances")) {
      if (rolledBack && options.restoredInstanceRows) return JSON.stringify(options.restoredInstanceRows);
      if (current === enabledId && options.candidateInstancesNeverStart) return JSON.stringify([{
        id: "instance", name: "nemlig-production", state: "provisioning", version: null,
      }]);
      if (current === enabledId || (current === startingId && rolledBack && apiRestored)) {
        const rows = options.enabledInstanceRows?.[Math.min(enabledInstanceReads, options.enabledInstanceRows.length - 1)] ?? [{
          id: "instance", name: "nemlig-production", state: "running", version: applicationVersion,
        }];
        enabledInstanceReads += 1;
        return JSON.stringify(rows);
      }
      return JSON.stringify([{
        id: "durable-object",
        name: "nemlig-production",
        state: "inactive",
        version: null,
      }]);
    }
    if (args.includes("rollback")) {
      current = args[args.indexOf("rollback") + 1] ?? startingId;
      rolledBack = true;
      if (options.rollbackApplicationVersionDrift) applicationVersion += 1;
      return "rolled back";
    }
    if (args.includes("deploy") && args.includes("MCP_ENABLED:true")) {
      if (current === startingId) {
        applicationVersion = options.candidateApplicationVersion ?? (options.candidateMatchesStarting ? 25 : 26);
      }
      current = enabledId;
      if (options.enableApplicationVersionDrift) applicationVersion += 1;
      return `Current Version ID: ${enabledId}`;
    }
    if (args.includes("deploy")) {
      if (options.failDisabledDeploy) throw new Error("timed out");
      current = disabledId;
      applicationVersion = options.candidateApplicationVersion ?? (options.candidateMatchesStarting ? 25 : 26);
      return `Current Version ID: ${disabledId}`;
    }
    throw new Error(`unexpected pnpm args: ${args.join(" ")}`);
  };
  return {
    root,
    calls,
    deps: {
      repoRoot: root,
      packageRoot: root,
      stateRoot: root,
      env: { NEMLIG_MCP_ACCESS_TOKEN: "owner-token", CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: "test-cloudflare-token" },
      run,
      fetcher: async (input, init) => {
        const url = String(input);
        if (url.includes("api.cloudflare.com/client/v4/accounts/") && url.endsWith("/rollouts") && init?.method === "POST") {
          apiRestored = true;
          applicationVersion += 1;
          return Response.json({ success: true, result: { id: "rollout-1" } });
        }
        if (url.includes("api.cloudflare.com/client/v4/accounts/") && url.endsWith("/versions")) {
          return Response.json({ success: true, result: [{
            version: 25,
            configuration: {
              image: `registry.cloudflare.com/${accountId}/nemlig-mcp-cloudflare-production-nemligmcpcontainer-production@${image}`,
              observability: { logs: { enabled: false } },
            },
          }] });
        }
        if (url.includes("api.cloudflare.com/client/v4/accounts/") && url.includes("/containers/applications/")) {
          return Response.json({ success: true, result: {
            id: applicationId,
            scheduling_policy: options.restoreSchedulingPolicy ?? "default",
            configuration: { image: `registry.cloudflare.com/${accountId}/nemlig-mcp-cloudflare-production-nemligmcpcontainer-production@${apiRestored ? image : current === startingId ? image : candidateImage}` },
            version: current === startingId && !apiRestored ? 25 : applicationVersion,
          } });
        }
        if (options.disabledFetchFails) throw new Error("offline");
        return new Response(options.disabledResponse ?? "MCP temporarily disabled", { status: 503 });
      },
      sleep: async () => undefined,
      configReader: options.configReader ?? (async () => config(join(root, "wrangler.jsonc"))),
      now: () => new Date("2026-09-05T12:00:00Z"),
    },
  };
}

const useExplicitRecovery = (deps: DeployDependencies): void => {
  deps.acceptanceMode = "recovery";
  deps.env = {
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: "test-cloudflare-token",
    NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client",
    NEMLIG_MCP_SERVICE_CLIENT_SECRET: "machine-secret",
    NEMLIG_CI_ACCEPTANCE_READY: "true",
  };
  deps.issueServiceToken = async () => "machine-token";
};

test("deployment arguments and provider JSON fail closed", () => {
  assert.equal(parseDeployArgs([commit]), commit);
  assert.equal(parseDeployArgs(["--", commit]), commit);
  assert.deepEqual(parseDeployCli(["--help"]), { help: true });
  assert.deepEqual(parseDeployCli(["--", "--help"]), { help: true });
  assert.match(productionDeployUsage, /40-character-main-commit/u);
  for (const args of [[], ["main"], [commit.slice(0, 7)], [commit, commit]]) assert.throws(() => parseDeployArgs(args));
  assert.equal(parseCurrentDeployment(deployment(startingId)).version, startingId);
  assert.throws(() => parseCurrentDeployment("[]"));
  assert.throws(() => parseCurrentDeployment(JSON.stringify([{ id: "x", versions: [] }])));
  assert.equal(parseContainer(JSON.stringify([{
    id: applicationId,
    name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production",
    instances: 1,
    image,
      version: 25,
  }])).image, image);
  assert.throws(() => parseContainer("[]"));
  assert.equal(instancesInactive(JSON.stringify([{ id: "durable-object", name: "nemlig-production", state: "inactive", version: null }])), true);
  assert.equal(instancesInactive(JSON.stringify([{ state: "running" }])), false);
  assert.equal(parseVersionState(version(enabledId, commit.slice(0, 7), true), enabledId).revision, commit.slice(0, 7));
  assert.throws(() => parseVersionState(version(enabledId, "development", true), enabledId));
  assert.equal(verifyCandidateVersion(version(enabledId, commit, true), enabledId, commit, true).enabled, true);
  assert.throws(() => verifyCandidateVersion(version(enabledId, commit, false), enabledId, commit, true));
});

test("preflight requires the exact main-only production environment before any provider action", async () => {
  const { deps, calls, root } = await fixture();
  try {
    assert.deepEqual(await preflightProductionDeploy(commit, deps), { state: "ready", commit, ciRunId: 456 });
    assert.equal(calls.some(({ command }) => command === "pnpm"), false);
    assert.ok(calls.some(({ args }) => args.some((value) => value.endsWith("/environments/nemlig-production"))));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("recovery preflight accepts a previously green main ancestor and records the distinct source check", async () => {
  const newerMain = "b".repeat(40);
  const { deps, calls, root } = await fixture({ remoteMain: newerMain });
  try {
    assert.deepEqual(await preflightProductionDeploy(commit, deps, "recovery"), { state: "ready", commit, ciRunId: 456 });
    assert.ok(calls.some(({ command, args }) => command === "git" && args[0] === "merge-base" && args[1] === "--is-ancestor"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("routine preflight accepts a trusted green ancestor that remains in current main history", async () => {
  const newerMain = "b".repeat(40);
  const { deps, calls, root } = await fixture({ remoteMain: newerMain });
  try {
    assert.deepEqual(await preflightProductionDeploy(commit, deps), { state: "ready", commit, ciRunId: 456 });
    assert.ok(calls.some(({ command, args }) => command === "git" && args[0] === "merge-base" && args[2] === commit && args[3] === "origin/main"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("routine preflight reports an existing shared lease without issuing provider work", async () => {
  const { deps, calls, root } = await fixture({ sharedLease: { ref: previousCommit } });
  try {
    assert.deepEqual(await preflightProductionDeploy(commit, deps), {
      state: "blocked_by_existing_lease", commit, ciRunId: 456, leaseHead: previousCommit,
    });
    assert.equal(calls.some(({ command }) => command === "pnpm" || command === "docker"), false);
    assert.equal(calls.some(({ command, args }) => command === "gh" && args[0] === "api" && args.includes("POST")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("routine preflight fails closed when the shared lease cannot be read", async () => {
  const { deps, root } = await fixture();
  const run = deps.run;
  deps.run = async (command, args, options) => {
    if (command === "gh" && args[0] === "api" && args.some((value) => value.includes("git/ref/heads/codex-lock/nemlig-production"))) {
      throw new Error("unavailable");
    }
    return await run(command, args, options);
  };
  try {
    await assert.rejects(preflightProductionDeploy(commit, deps), /remote_journal_invalid/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("routine preflight rejects a trusted SHA outside current main history", async () => {
  const { deps, root } = await fixture({ remoteMain: "b".repeat(40), recoveryAncestor: false });
  try {
    await assert.rejects(preflightProductionDeploy(commit, deps), /source_revision_mismatch/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("recovery preflight rejects a SHA outside main history", async () => {
  const { deps, root } = await fixture({ remoteMain: "b".repeat(40), recoveryAncestor: false });
  try {
    await assert.rejects(preflightProductionDeploy(commit, deps, "recovery"), /recovery_source_invalid/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("preflight fails closed for malformed native environment metadata", async () => {
  const { deps, root } = await fixture();
  const run = deps.run;
  deps.run = async (command, args, options) => command === "gh" && args[0] === "api" && args.some((value) => value.endsWith("/environments/nemlig-production"))
    ? JSON.stringify({ can_admins_bypass: true }) : await run(command, args, options);
  try {
    await assert.rejects(preflightProductionDeploy(commit, deps), /github_environment_not_ready/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Container metadata distinguishes numeric application versions from Worker UUIDs", () => {
  const app = { id: applicationId, name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production", instances: 1, image, version: 25 };
  for (const invalid of [{ id: "invalid" }, { image: "image:latest" }, { version: undefined }, { version: startingId }, { version: "25" }, { version: 0 }, { version: 1.5 }, { version: Number.MAX_SAFE_INTEGER + 1 }, { instances: 2 }]) {
    assert.throws(() => parseContainer(JSON.stringify([{ ...app, ...invalid }])), JSON.stringify(invalid));
  }
  assert.deepEqual(parseContainer(JSON.stringify([app])), { id: applicationId, image, version: 25 });
  assert.deepEqual(parseContainer(JSON.stringify([{ ...app, image: `registry.cloudflare.com/example@${image}` }])), { id: applicationId, image, version: 25 });
  const inactive = { id: "durable-object", name: "nemlig-production", state: "inactive", version: null };
  assert.equal(instancesInactive(JSON.stringify([inactive])), true);
  for (const invalid of [{ id: "" }, { id: undefined }, { name: "other" }, { state: "running" }, { version: 25 }, { version: undefined }]) {
    assert.equal(instancesInactive(JSON.stringify([{ ...inactive, ...invalid }])), false, JSON.stringify(invalid));
  }
  assert.equal(instancesInactive(JSON.stringify({ instances: [inactive], result_info: {} })), false);
  assert.equal(instancesInactive(JSON.stringify([inactive, inactive])), false);
});

test("schema-2 recovery journals reject unknown, malformed, oversized, and excessive transitions", () => {
  const journal = {
    schema: 2,
    operationId: "44444444-4444-4444-8444-444444444444",
    commit,
    ciRunId: 456,
    releaseRunId: "local",
    releaseRunAttempt: "local",
    startedAt: "2026-09-05T12:00:00.000Z",
    checks: [],
    lastVerifiedState: "unchanged",
    rollback: "not_needed",
    outcome: "running",
    transitions: [],
  };
  assert.equal(parseDeploymentJournal(JSON.stringify(journal)).operationId, journal.operationId);
  const snapshot = { ...journal, startingApplicationVersion: 25, disabledApplicationVersion: 26, enabledApplicationVersion: 26, startingConfigDigest: "a".repeat(64) };
  assert.deepEqual(parseDeploymentJournal(JSON.stringify(snapshot)), snapshot);
  assert.equal(parseDeploymentJournal(JSON.stringify({ ...journal, disabledVersion: null, disabledImage: null, disabledApplicationVersion: null })).disabledVersion, undefined);
  for (const field of ["startingApplicationVersion", "disabledApplicationVersion", "enabledApplicationVersion"]) {
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "25", ...(field === "disabledApplicationVersion" ? [] : [null])]) assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, [field]: value })));
  }
  for (const value of ["A".repeat(64), "a".repeat(63), 12, null]) assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, startingConfigDigest: value })));
  for (const value of ["true", 1, null]) assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, startingEnabled: value })));
  for (const value of [true, false]) assert.equal(parseDeploymentJournal(JSON.stringify({ ...journal, startingEnabled: value })).startingEnabled, value);
  assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, token: "secret" })));
  assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, operationId: commit })));
  assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, startedAt: "2026-09-05T12:00:00Z" })));
  assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, completedAt: "2026-02-30T12:00:00.000Z" })));
  assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, transitions: null })));
  assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, transitions: [null] })));
  assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, startingVersion: [startingId] })));
  assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, startingImage: [image] })));
  assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, transitions: [{ phase: "disabled_deploy", kind: "intent", at: journal.startedAt, token: "no" }] })));
  assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, transitions: [{ phase: "enable_deploy", kind: "result", at: journal.startedAt }] })));
  assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, transitions: Array.from({ length: 33 }, () => ({ phase: "disabled_deploy", kind: "intent", at: journal.startedAt })) })));
  assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, checks: Array.from({ length: 2_000 }, () => "disabled_routes") })));
});

test("source mismatch and unavailable leases stop before Cloudflare", async () => {
  for (const options of [{ head: previousCommit }, { remoteLeaseBlocked: true }]) {
    const { deps, calls, root } = await fixture(options);
    try {
      const report = await deployProduction(commit, deps);
      assert.equal(report.outcome, "failed");
      assert.equal(calls.some(({ args }) => args.includes("wrangler")), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  const { deps, calls, root } = await fixture();
  try {
    await writeFile(join(root, "nemlig-production-deploy.lock"), "occupied\n");
    const report = await deployProduction(commit, deps);
    assert.equal(report.failure, "local_deployment_lease_unavailable");
    assert.equal(calls.some(({ args }) => args.includes("wrangler")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("routine release proves failback API support and the exact starting image before any Worker mutation", async () => {
  const { deps, calls, root } = await fixture({ restoreSchedulingPolicy: "durable_object" });
  deps.acceptanceMode = "service";
  deps.env = { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: "test-cloudflare-token", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client", NEMLIG_MCP_SERVICE_CLIENT_SECRET: "machine-secret", NEMLIG_CI_ACCEPTANCE_READY: "true" };
  deps.issueServiceToken = async () => "machine-token";
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "cloudflare_container_restore_unavailable");
    assert.equal(calls.some(({ args }) => args.includes("deploy") || args.includes("rollback")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("same source uses distinct operation ownership and never replaces an existing or legacy remote ref", async () => {
  const sharedLease: SharedLeaseStore = {};
  const first = await fixture({ sharedLease });
  const second = await fixture({ sharedLease });
  try {
    first.deps.operationId = () => "44444444-4444-4444-8444-444444444444";
    second.deps.operationId = () => "55555555-5555-4555-8555-555555555555";
    assert.equal((await deployProduction(commit, first.deps)).operationId, "44444444-4444-4444-8444-444444444444");
    const blocked = await deployProduction(commit, second.deps);
    assert.equal(blocked.operationId, "55555555-5555-4555-8555-555555555555");
    assert.equal(blocked.failure, "remote_deployment_lease_unavailable");
    assert.equal(second.calls.some(({ args }) => args.includes("wrangler")), false);
  } finally {
    await rm(first.root, { recursive: true, force: true });
    await rm(second.root, { recursive: true, force: true });
  }
  const legacy = await fixture({ sharedLease: { ref: commit } });
  try {
    const blocked = await deployProduction(commit, legacy.deps);
    assert.equal(blocked.failure, "remote_deployment_lease_unavailable");
    assert.equal(legacy.calls.some(({ args }) => args.includes("wrangler")), false);
  } finally {
    await rm(legacy.root, { recursive: true, force: true });
  }
});

test("only the exact trusted main CI provenance may reach Wrangler", async () => {
  const rejected = [
    { repository: "owner/repository" },
    { workflowPath: ".github/workflows/other.yml" },
    { run: { workflowDatabaseId: 999 } },
    { run: { workflowName: "Other" } },
    { run: { headBranch: "feature" } },
    { run: { event: "pull_request" } },
    { run: { headSha: previousCommit } },
    { jobs: [{ name: "verify", status: "completed", conclusion: "skipped" }] },
    { jobs: [{ name: "other", status: "completed", conclusion: "success" }] },
    { head: previousCommit },
  ];
  for (const options of rejected) {
    const { deps, calls, root } = await fixture(options);
    try {
      const report = await deployProduction(commit, deps);
      assert.equal(report.outcome, "failed");
      assert.equal(calls.some(({ args }) => args.includes("wrangler")), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
  for (const unsafe of ["A".repeat(40), `${commit};wrangler deploy`, commit.slice(0, 39)]) {
    const { deps, calls, root } = await fixture();
    try {
      await assert.rejects(deployProduction(unsafe, deps), /invalid_commit/u);
      assert.equal(calls.length, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("a green workflow requires exactly one completed successful verify job", async () => {
  for (const jobs of [
    [],
    [{ name: "other", status: "completed", conclusion: "success" }],
    [{ name: "verify", status: "completed", conclusion: "skipped" }],
    [{ name: "verify", status: "completed", conclusion: "failure" }],
    [{ name: "verify", status: "in_progress", conclusion: "success" }],
    Array.from({ length: 2 }, () => ({ name: "verify", status: "completed", conclusion: "success" })),
  ]) {
    const { deps, calls, root } = await fixture({ jobs });
    try {
      const report = await deployProduction(commit, deps);
      assert.equal(report.failure, "exact_head_ci_not_green");
      assert.equal(calls.some(({ args }) => args.includes("wrangler")), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("a newer failed trusted run cannot be masked by an older green run", async () => {
  const { deps, calls, root } = await fixture({ runs: [
    { databaseId: 457, workflowDatabaseId: 123, workflowName: "CI", headSha: commit, headBranch: "main", event: "push", status: "completed", conclusion: "failure" },
    { databaseId: 456, workflowDatabaseId: 123, workflowName: "CI", headSha: commit, headBranch: "main", event: "push", status: "completed", conclusion: "success" },
  ] });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(calls.some(({ args }) => args.includes("wrangler")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("main advancing after initial approval stops before provider mutation", async () => {
  const { deps, calls, root } = await fixture({ remoteAfterPreflight: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(calls.some(({ args }) => args.includes("deploy") || args.includes("rollback")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a merged queued candidate cannot overwrite a newer deployed runtime revision", async () => {
  const { deps, calls, root } = await fixture({ startingRevision: "b".repeat(40), deployedRevisionNotAncestor: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "candidate_does_not_supersede_runtime");
    assert.equal(calls.some(({ args }) => args.some((argument) => argument === "deploy" || argument === "rollback")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("ordinary local deployment stays enabled and journals only redacted state", async () => {
  const { deps, calls, root } = await fixture();
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    assert.equal(report.lastVerifiedState, "enabled");
    assert.deepEqual([report.startingVersion, report.disabledVersion, report.enabledVersion], [startingId, undefined, enabledId]);
    const deploys = calls.filter(({ args }) => args.includes("deploy"));
    assert.equal(deploys.length, 1);
    assert.ok(deploys[0]?.args.includes("MCP_ENABLED:true"));
    assert.equal(deploys.some(({ args }) => args.includes("MCP_ENABLED:false")), false);
    const manifest = calls.find(({ command }) => command === "docker");
    assert.deepEqual(manifest?.args, ["manifest", "inspect", "-v", `registry.cloudflare.com/${accountId}/nemlig-mcp-cloudflare-production-nemligmcpcontainer-production:${enabledId.split("-")[0]}`]);
    assert.equal(calls.some(({ args }) => args[0] === "production:test:features"), true);
    assert.doesNotMatch(JSON.stringify(calls.map(({ command, args }) => ({ command, args }))), /add_approved|remove_approved|make_approved|empty_approved/u);
    const ref = calls.findIndex(({ command, args }) => command === "gh" && args.includes("POST") && args.some((arg) => arg.endsWith("git/refs")));
    const firstProviderRead = calls.findIndex(({ command, args }) => command === "pnpm" && args.includes("wrangler"));
    assert.ok(ref >= 0 && ref < firstProviderRead, "remote lease must exist before provider access");
    const remoteSnapshots = calls.filter(({ command, args }) => command === "gh" && args.some((arg) => arg.endsWith("git/blobs")))
      .map(({ input }) => JSON.parse(Buffer.from(JSON.parse(input ?? "{}").content, "base64").toString("utf8")) as { operationId: string; releaseRunId: number | "local"; releaseRunAttempt: number | "local"; transitions: Array<{ phase: string; kind: string }> });
    assert.ok(remoteSnapshots.length >= 3);
    assert.match(remoteSnapshots[0]?.operationId ?? "", /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
    assert.deepEqual([remoteSnapshots[0]?.releaseRunId, remoteSnapshots[0]?.releaseRunAttempt], ["local", "local"]);
    assert.deepEqual(remoteSnapshots.at(-1)?.transitions.map(({ phase, kind }) => `${phase}:${kind}`), [
      "enable_deploy:intent", "enable_deploy:result",
    ]);
    const journal = await readFile(join(root, "nemlig-production-deploy", "latest.json"), "utf8");
    assert.deepEqual(JSON.parse(journal), report);
    assert.doesNotMatch(journal, /owner-token|authorization|cookie|basket|favorite|saved-list/iu);
    await access(join(root, "nemlig-production-deploy.lock"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("disabled-route verification retries transient edge failures within a fixed bound", async () => {
  const { deps, root } = await fixture();
  useExplicitRecovery(deps);
  const fetcher = deps.fetcher;
  let routeReads = 0;
  let sleeps = 0;
  deps.fetcher = async (url, init) => {
    routeReads += 1;
    if (routeReads === 1) throw new Error("temporary edge transport failure");
    return await fetcher(url, init);
  };
  deps.sleep = async () => { sleeps += 1; };
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    assert.equal(routeReads, 4);
    assert.equal(sleeps, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("config preflight supplies every validated plain production value to both deploys", async () => {
  const { deps, calls, root } = await fixture();
  try {
    assert.equal((await deployProduction(commit, deps)).outcome, "success");
    const deploys = calls.filter(({ args }) => args.includes("deploy"));
    for (const deploy of deploys) {
      assert.ok(deploy.args.includes("MCP_CREDENTIAL_ONBOARDING_ENABLED:false"));
      assert.ok(deploy.args.includes("NEMLIG_MCP_AUTH0_ISSUER:https://everyday-assistants.eu.auth0.com/"));
      assert.ok(deploy.args.includes("NEMLIG_MCP_PUBLIC_URL:https://nemlig-mcp.broesby.dk/mcp"));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("enabled acceptance retries while the edge deployment converges", async () => {
  const { deps, calls, root } = await fixture({ failProbeOnce: true });
  try {
    assert.equal((await deployProduction(commit, deps)).outcome, "success");
    assert.equal(calls.filter(({ args }) => args[0] === "production:probe").length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("enabled acceptance retries while the Container service converges", async () => {
  const { deps, calls, root } = await fixture({ failFeaturesOnce: true });
  deps.acceptanceMode = "service";
  deps.env = { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: "test-cloudflare-token", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client", NEMLIG_MCP_SERVICE_CLIENT_SECRET: "machine-secret", NEMLIG_CI_ACCEPTANCE_READY: "true" };
  deps.issueServiceToken = async () => "machine-token";
  try {
    assert.equal((await deployProduction(commit, deps)).outcome, "success");
    const acceptanceCalls = calls.filter(({ args }) => args[0] === "production:test:features");
    assert.equal(acceptanceCalls.filter(({ args }) => args.includes("--initialize-only")).length, 2);
    assert.equal(acceptanceCalls.filter(({ args }) => !args.includes("--initialize-only")).length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("previous backend version is bounded and cannot authorize release or cleanup", async () => {
  const { deps, calls, root } = await fixture({ staleRuntimeForever: true });
  deps.acceptanceMode = "service";
  deps.env = { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: "test-cloudflare-token", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client", NEMLIG_MCP_SERVICE_CLIENT_SECRET: "machine-secret", NEMLIG_CI_ACCEPTANCE_READY: "true" };
  deps.issueServiceToken = async () => "machine-token";
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "service_fixture_acceptance_failed");
    assert.equal(report.rollback, "restored");
    assert.equal(report.lastVerifiedState, "restored");
    assert.equal(report.acceptanceFailure?.lastCompletedBoundary, "service_runtime_version_read");
    assert.equal(calls.filter(({ args }) => args[0] === "production:test:features" && args.includes("--wake-only")).length, 1,
      "the candidate gets one connection-only wake before the bounded strict version checks");
    assert.equal(calls.filter(({ args }) => args[0] === "production:test:features" && args.includes("--initialize-only")).length, 182,
      "the restore performs one bounded strict initialize after 180 candidate convergence reads and one connection-only wake");
    assert.equal(calls.filter(({ args }) => args[0] === "production:test:features" && !args.includes("--initialize-only")).length, 0);
    assert.equal(report.checks.includes("service_fixture_acceptance"), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("stale runtime followed by transport timeouts preserves the rollback reserve", async () => {
  const { deps, root } = await fixture();
  deps.acceptanceMode = "service";
  deps.env = { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: "test-cloudflare-token", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client", NEMLIG_MCP_SERVICE_CLIENT_SECRET: "machine-secret", NEMLIG_CI_ACCEPTANCE_READY: "true" };
  deps.issueServiceToken = async () => "machine-token";
  const started = Date.parse("2026-09-05T12:00:00.000Z");
  let now = started;
  deps.now = () => new Date(now);
  deps.sleep = async (milliseconds) => { now += milliseconds; };
  const run = deps.run;
  let features = 0;
  deps.run = async (command, args, options) => {
    if (command === "pnpm" && args[0] === "production:test:features") {
      features += 1;
      if (features === 1) throw Object.assign(new Error("previous runtime"), { acceptanceFailure: {
        stage: "read_only", profile: "service", category: "feature_failed",
        lastCompletedBoundary: "service_runtime_version_read", correlationIds: [],
      } });
      now += options?.timeoutMs ?? 0;
      throw new Error("transport timed out");
    }
    return await run(command, args, options);
  };
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.rollback, "restored");
    assert.equal(report.lastVerifiedState, "restored");
    assert.ok(features < 12, "ordinary retries continued beyond the acceptance cutoff");
    assert.ok(now <= started + 25 * 60_000, "acceptance and bounded restoration stay inside the operation deadline");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("durable snapshots record distinct starting and candidate versions before their transitions", async () => {
  const { deps, calls, root } = await fixture({ candidateApplicationVersion: 26 });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    const snapshots = calls.filter(({ args }) => args.some((arg) => arg.endsWith("git/blobs")) && args.includes("POST"))
      .map(({ input }) => parseDeploymentJournal(Buffer.from((JSON.parse(input!) as { content: string }).content, "base64").toString("utf8")));
    const intent = snapshots.find((snapshot) => snapshot.transitions.length === 1)!;
    assert.equal(intent.startingApplicationVersion, 25);
    assert.equal(intent.startingEnabled, true);
    assert.equal(intent.startingConfigDigest, configDigest);
    assert.equal(intent.enabledApplicationVersion, undefined);
    assert.equal(snapshots.find((snapshot) => snapshot.transitions.length === 2)!.enabledApplicationVersion, 26);
    const local = parseDeploymentJournal(await readFile(join(root, "nemlig-production-deploy", "latest.json"), "utf8"));
    for (const snapshot of [report, local, snapshots.at(-1)!]) {
      assert.equal(snapshot.startingApplicationVersion, 25);
      assert.equal(snapshot.disabledApplicationVersion, undefined);
      assert.equal(snapshot.enabledApplicationVersion, 26);
      assert.equal(snapshot.startingConfigDigest, configDigest);
      assert.equal(JSON.stringify(snapshot).includes("MCP_CREDENTIAL_ONBOARDING_ENABLED"), false);
      assert.equal(JSON.stringify(snapshot).includes("owner-token"), false);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("disabled application identity drift never reaches enablement", async () => {
  const { deps, calls, root } = await fixture({ disabledApplicationIdDrift: true });
  useExplicitRecovery(deps);
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "cloudflare_deployment_drift");
    assert.equal(calls.some(({ args }) => args.includes("MCP_ENABLED:true")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("wrong candidate digest or malformed registry manifest never reaches enablement", async () => {
  for (const options of [{ candidateWrongImage: true }, { malformedManifest: true }]) {
    const { deps, calls, root } = await fixture(options);
    useExplicitRecovery(deps);
    try {
      assert.equal((await deployProduction(commit, deps)).outcome, "failed");
      assert.equal(calls.some(({ args }) => args.includes("MCP_ENABLED:true")), false);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("invalid local config reader stops before either deploy", async () => {
  const { deps, calls, root } = await fixture({ configReader: async () => { throw new Error("private path"); } });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "cloudflare_config_invalid");
    assert.equal(calls.some(({ args }) => args.includes("deploy")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("live onboarding survives the repository false default and the enabled deployment readback", async () => {
  const { deps, calls, root } = await fixture({ versionBindings: (values) => [
    ...values.map((value) => value.name === "MCP_CREDENTIAL_ONBOARDING_ENABLED" ? { ...value, text: "true" } : value),
    { name: "NEMLIG_MCP_ONBOARDING_CLIENT_ID", type: "plain_text", text: "owner-browser-client" },
    { name: "NEMLIG_MCP_ONBOARDING_SESSION_KEY", type: "secret_text" },
    { name: "NEMLIG_MCP_CREDENTIAL_KEY", type: "secret_text" },
  ] });
  try {
    assert.equal((await deployProduction(commit, deps)).outcome, "success");
    const deploys = calls.filter(({ args }) => args.includes("deploy"));
    assert.equal(deploys.length, 1);
    for (const { args } of deploys) {
      assert.ok(args.includes("MCP_CREDENTIAL_ONBOARDING_ENABLED:true"));
      assert.ok(args.includes("NEMLIG_MCP_ONBOARDING_CLIENT_ID:owner-browser-client"));
      assert.equal(args.includes("MCP_CREDENTIAL_ONBOARDING_ENABLED:false"), false);
      for (const [name, value] of Object.entries(config("").vars)) {
        if (name !== "MCP_ENABLED" && name !== "MCP_CREDENTIAL_ONBOARDING_ENABLED") assert.ok(args.includes(`${name}:${value}`));
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("incomplete or malformed enabled browser sign-in stops before deployment", async () => {
  for (const fault of ["client", "session", "credential", "malformed"]) {
    const { deps, calls, root } = await fixture({ versionBindings: (values) => [
      ...values.map((value) => value.name === "MCP_CREDENTIAL_ONBOARDING_ENABLED" ? { ...value, text: "true" } : value),
      ...(fault === "client" ? [] : [{ name: "NEMLIG_MCP_ONBOARDING_CLIENT_ID", type: "plain_text", text: fault === "malformed" ? "bad client" : "owner-browser-client" }]),
      ...(fault === "session" ? [] : [{ name: "NEMLIG_MCP_ONBOARDING_SESSION_KEY", type: "secret_text" }]),
      ...(fault === "credential" ? [] : [{ name: "NEMLIG_MCP_CREDENTIAL_KEY", type: "secret_text" }]),
    ] });
    try {
      const result = await deployProduction(commit, deps);
      assert.equal(result.outcome, "failed", fault);
      assert.equal(result.failure, "cloudflare_runtime_safety_mismatch", fault);
      assert.equal(calls.some(({ args }) => args.includes("deploy")), false, fault);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("checked-in local and production config omit operation caps and retain request deadlines", async () => {
  const checkedIn = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  for (const vars of [checkedIn.vars, checkedIn.env.production.vars]) {
    assert.equal(vars.MCP_TOTAL_TIMEOUT_MS, "90000");
    for (const name of obsoleteAdmissionVars) assert.equal(Object.hasOwn(vars, name), false, name);
  }
});

test("deployment candidates omit all obsolete application rate and category variables", async () => {
  const { deps, calls, root } = await fixture();
  try {
    assert.equal((await deployProduction(commit, deps)).outcome, "success");
    const deploys = calls.filter(({ args }) => args.includes("deploy"));
    assert.equal(deploys.length, 1);
    for (const { args } of deploys) {
      for (const name of obsoleteAdmissionVars) assert.equal(args.some((arg) => arg.startsWith(`${name}:`)), false, name);
      for (const name of ["MCP_TOTAL_TIMEOUT_MS", "NEMLIG_MCP_CREDENTIAL_KEY_VERSION"]) {
        assert.ok(args.some((arg) => arg.startsWith(`${name}:`)), name);
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("obsolete application rate and category variables fail closed in local config and starting/candidate readback", async () => {
  for (const name of obsoleteAdmissionVars) {
    const text = name === "MCP_DAILY_LIMIT" ? "5000" : name === "MCP_EXPENSIVE_DAILY_LIMIT" ? "500" : "60";
    for (const target of ["local", startingId, disabledId, enabledId]) {
      const { deps, calls, root } = await fixture({
        ...(target === "local" ? { configReader: ({ config: path }) => { const local = config(path); return { ...local, vars: { ...local.vars, [name]: text } }; } } : {}),
        versionBindings: (values, id) => id === target
          ? [...values.filter((value) => value.name !== name), { name, type: "plain_text", text }] : values,
      });
      if (target === disabledId) useExplicitRecovery(deps);
      try {
        const report = await deployProduction(commit, deps);
        assert.equal(report.outcome, "failed", `${target}: ${name}`);
        assert.equal(report.checks.includes("authenticated_read_only_acceptance"), false);
        if (target === "local" || target === startingId) assert.equal(calls.some(({ args }) => args.includes("deploy")), false);
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  }
});

test("reordered bindings and explicit self targets preserve legacy and arbitrary secret metadata", async () => {
  const secrets = ["NEMLIG_USERNAME", "NEMLIG_PASSWORD", "NEMLIG_MCP_CREDENTIAL_KEY", "lowercase_secret", "_private_key"];
  const { deps, calls, root } = await fixture({ versionBindings: (values, id) => {
    const updated = [...values.map((value) => value.type === "durable_object_namespace"
      ? { ...value, script_name: "nemlig-mcp-cloudflare-production", environment: "production" } : value),
    ...secrets.map((name) => ({ name, type: "secret_text", text: "never-copy-this-secret" }))];
    return id === disabledId ? updated.reverse() : updated;
  } });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    const saved = await readFile(join(root, "nemlig-production-deploy", "latest.json"), "utf8");
    for (const output of [JSON.stringify(report), saved, JSON.stringify(calls)]) assert.equal(output.includes("never-copy-this-secret"), false);
    for (const { args } of calls.filter(({ args }) => args.includes("deploy"))) {
      assert.equal(args.some((arg) => secrets.some((name) => arg.startsWith(`${name}:`))), false);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Cloudflare null self-target metadata is treated as an unset target", async () => {
  const { deps, calls, root } = await fixture({ versionBindings: (values) => values.map((value) =>
    value.type === "durable_object_namespace" ? { ...value, script_name: null, environment: null } : value) });
  try {
    assert.equal((await deployProduction(commit, deps)).outcome, "success");
    assert.equal(calls.filter(({ args }) => args.includes("deploy")).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("legacy starting auth aliases fail closed instead of being projected away", async () => {
  for (const [name, text] of [["NEMLIG_MCP_AUTH_CANARY", "false"], ["MCP_MINIMAL_AUTH_ENABLED", "true"]]) {
    const { deps, calls, root } = await fixture({ versionBindings: (values, id) => id === startingId
      ? [...values, { name, type: "plain_text", text }] : values });
    try {
      const report = await deployProduction(commit, deps);
      assert.equal(report.outcome, "failed", name);
      assert.equal(report.failure, "cloudflare_runtime_unexpected_binding", name);
      assert.equal(calls.some(({ args }) => args.includes("deploy")), false);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("unrecognized starting plaintext bindings fail closed with a bounded category", async () => {
  const privateValue = "never-log-this-value";
  const { deps, calls, root } = await fixture({ versionBindings: (values, id) => id === startingId
    ? [...values, { name: "UNRECOGNIZED_RUNTIME_VALUE", type: "plain_text", text: privateValue }]
    : values });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "cloudflare_runtime_unexpected_binding");
    assert.equal(JSON.stringify(report).includes(privateValue), false);
    assert.equal(calls.some(({ args }) => args.includes("deploy")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("an enabled legacy auth canary is rejected as an unexpected binding", async () => {
  const { deps, calls, root } = await fixture({ versionBindings: (values) => [
    ...values,
    { name: "NEMLIG_MCP_AUTH_CANARY", type: "plain_text", text: "true" },
  ] });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "cloudflare_runtime_unexpected_binding");
    assert.equal(calls.some(({ args }) => args.includes("deploy")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("malformed bindings and starting safety or DO drift stop before deployment", async () => {
  const transforms: Array<(values: Record<string, unknown>[]) => Record<string, unknown>[]> = [
    (values) => [...values, { ...values[0] }],
    (values) => [...values, {}],
    (values) => values.map((value) => value.name === "MCP_TOTAL_TIMEOUT_MS" ? { ...value, type: "json" } : value),
    (values) => values.map((value) => value.name === "MCP_TOTAL_TIMEOUT_MS" ? { ...value, text: "90001" } : value),
    (values) => values.map((value) => value.name === "NEMLIG_MCP_CREDENTIAL_KEY_VERSION" ? { ...value, text: "invalid version!" } : value),
    (values) => values.map((value) => value.name === "NEMLIG_MCP_CONTAINER" ? { ...value, class_name: "Other" } : value),
    (values) => values.map((value) => value.type === "durable_object_namespace" ? { ...value, script_name: "other-worker" } : value),
    (values) => values.map((value) => value.type === "durable_object_namespace" ? { ...value, environment: "staging" } : value),
  ];
  for (const versionBindings of transforms) {
    const { deps, calls, root } = await fixture({ versionBindings });
    try {
      assert.equal((await deployProduction(commit, deps)).outcome, "failed");
      assert.equal(calls.some(({ args }) => args.includes("deploy")), false);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("each candidate readback rejects changed safety, DO or secret metadata", async () => {
  for (const target of [disabledId, enabledId]) {
    for (const mutation of ["safety", "do", "added-secret", "removed-secret", "wrong-type"]) {
      const { deps, calls, root } = await fixture({ versionBindings: (values, id) => {
        const baseline = [...values, { name: "legacy_secret", type: "secret_text" }];
        if (id !== target) return baseline;
        if (mutation === "added-secret") return [...baseline, { name: "extra_secret", type: "secret_text" }];
        if (mutation === "removed-secret") return values;
        return baseline.map((value) => {
          if (mutation === "safety" && value.name === "MCP_TOTAL_TIMEOUT_MS") return { ...value, text: "90001" };
          if (mutation === "do" && value.name === "NEMLIG_MCP_CONTAINER") return { ...value, class_name: "Wrong" };
          if (mutation === "wrong-type" && value.name === "legacy_secret") return { ...value, type: "plain_text", text: "wrong" };
          return value;
        });
      } });
      if (target === disabledId) useExplicitRecovery(deps);
      try {
        const report = await deployProduction(commit, deps);
        assert.equal(report.outcome, "failed", `${target}: ${mutation}`);
        assert.equal(report.checks.includes("authenticated_read_only_acceptance"), false);
        if (target === disabledId) assert.equal(calls.some(({ args }) => args.includes("MCP_ENABLED:true")), false);
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  }
});

test("redirected paths and local safety changes fail without leaking reader errors", async () => {
  for (const field of ["configPath", "userConfigPath", "keep_vars", "limits", "vars", "reader-error"]) {
    const { deps, calls, root } = await fixture({ configReader: ({ config: path }) => {
      if (field === "reader-error") throw new Error("never-print-this-private-value");
      const local = config(path);
      if (field === "configPath" || field === "userConfigPath") return { ...local, [field]: `${path}.redirected` };
      if (field === "keep_vars") return { ...local, keep_vars: true };
      if (field === "limits") return { ...local, limits: { cpu_ms: 200, subrequests: 8 } };
      return { ...local, vars: { ...local.vars, MCP_TOTAL_TIMEOUT_MS: "90001" } };
    } });
    try {
      const report = await deployProduction(commit, deps);
      assert.equal(report.outcome, "failed");
      assert.equal(calls.some(({ args }) => args.includes("deploy")), false);
      assert.equal(JSON.stringify(report).includes("never-print-this-private-value"), false);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("the default pinned Wrangler reader handles the real production environment without credentials", async () => {
  const { deps, root } = await fixture();
  try {
    const local = config(join(root, "wrangler.jsonc"));
    await writeFile(join(root, "wrangler.jsonc"), JSON.stringify({
      name: "test-local", compatibility_date: "2026-08-31", keep_vars: false,
      limits: local.limits,
      env: { production: { name: local.name, vars: local.vars, durable_objects: local.durable_objects,
        containers: [{ ...local.containers[0], image: "./Dockerfile" }] } },
    }));
    await writeFile(join(root, "Dockerfile"), "FROM scratch\n");
    delete deps.configReader;
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success", JSON.stringify(report));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("invalid plain values cannot become matching config proof even when local and live agree", async () => {
  for (const [name, text] of [
    ["NEMLIG_MCP_AUTH0_ISSUER", "https://user:password@example.com/"], ["NEMLIG_MCP_HTTP_PORT", "8.08e3"],
    ["MCP_TOTAL_TIMEOUT_MS", "0"], ["MCP_TOTAL_TIMEOUT_MS", "9007199254740992"],
    ["MCP_CREDENTIAL_ONBOARDING_ENABLED", "yes"], ["NEMLIG_MCP_HTTP_PORT", "65536"],
    ["NEMLIG_MCP_CREDENTIAL_KEY_VERSION", "not/valid"], ["NEMLIG_MCP_CREDENTIAL_KEY_VERSION", ""],
    ["NEMLIG_MCP_AUTH0_ISSUER", "http://insecure.example/"], ["NEMLIG_MCP_PUBLIC_URL", ""],
  ] as const) {
    const { deps, calls, root } = await fixture({
      configReader: ({ config: path }) => { const local = config(path); return { ...local, vars: { ...local.vars, [name]: text } }; },
      versionBindings: (values) => values.map((value) => value.name === name ? { ...value, text } : value),
    });
    try {
      assert.equal((await deployProduction(commit, deps)).outcome, "failed");
      assert.equal(calls.some(({ args }) => args.includes("deploy")), false);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("routine candidate Container image convergence timeout remains enabled", async () => {
  const { deps, calls, root } = await fixture({ candidateContainerDelay: 40 });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "container_instance_timeout");
    assert.equal(calls.some(({ args }) => args.includes("MCP_ENABLED:true")), true);
    assert.equal(calls.some(({ args }) => args.includes("MCP_ENABLED:false")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("waits for candidate digest and numeric application version without disabled staging", async () => {
  const { deps, calls, root } = await fixture({ candidateContainerDelay: 2 });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    assert.equal(report.enabledApplicationVersion, 26);
    const enable = calls.findIndex(({ args }) => args.includes("MCP_ENABLED:true"));
    assert.equal(calls.filter(({ args }) => args.includes("containers") && args.includes("list")).length, 1);
    assert.ok(calls.slice(enable + 1).filter(({ args }) => args.includes("containers") && args.includes("info")).length >= 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("accepts an unchanged Container when the candidate digest matches the starting image", async () => {
  const { deps, root } = await fixture({ candidateMatchesStarting: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    assert.deepEqual([report.enabledImage, report.enabledApplicationVersion], [image, 25]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("accepts the short-lived Container becoming inactive after service acceptance", async () => {
  const { deps, calls, root } = await fixture({ enabledInstanceRows: [[{
    id: "durable-object", name: "nemlig-production", state: "inactive", version: null,
  }]] });
  try {
    assert.equal((await deployProduction(commit, deps)).outcome, "success");
    assert.equal(calls.some(({ args }) => args.includes("containers") && args.includes("instances")), false,
      "post-request instance liveness is not a release acceptance condition");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("release run identity is distinct from the trusted CI run and rejects malformed CI labels", async () => {
  const { deps, root } = await fixture();
  try {
    deps.env.GITHUB_RUN_ID = "789";
    deps.env.GITHUB_RUN_ATTEMPT = "2";
    const report = await deployProduction(commit, deps);
    assert.deepEqual([report.ciRunId, report.releaseRunId, report.releaseRunAttempt], [456, 789, 2]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  for (const env of [
    { GITHUB_RUN_ID: "not-a-number", GITHUB_RUN_ATTEMPT: "1" },
    { GITHUB_RUN_ID: "0x10", GITHUB_RUN_ATTEMPT: "1" },
    { GITHUB_RUN_ID: " 10", GITHUB_RUN_ATTEMPT: "1" },
    { GITHUB_RUN_ID: "10" },
  ]) {
    const malformed = await fixture();
    try {
      Object.assign(malformed.deps.env, env);
      await assert.rejects(deployProduction(commit, malformed.deps), /github_ci_invalid/u);
      assert.equal(malformed.calls.length, 0);
    } finally {
      await rm(malformed.root, { recursive: true, force: true });
    }
  }
});

test("disabled verification failures and provider drift never enable", async () => {
  for (const options of [{ disabledResponse: "wrong" }, { disabledFetchFails: true }, { driftBeforeEnable: true }]) {
    const { deps, calls, root } = await fixture(options);
    useExplicitRecovery(deps);
    try {
      const report = await deployProduction(commit, deps);
      assert.equal(report.outcome, "failed");
      assert.equal(calls.some(({ args }) => args.includes("MCP_ENABLED:true")), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("explicit recovery rejects a changed Container application version despite the same image", async () => {
  const { deps, root } = await fixture({ enableApplicationVersionDrift: true });
  useExplicitRecovery(deps);
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.lastVerifiedState, "unknown");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("incomplete disabled evidence remains unknown, while completed disabled proof survives a later safe failure", async () => {
  for (const options of [{ disabledResponse: "wrong" }, { disabledFetchFails: true }]) {
    const { deps, root } = await fixture(options);
    useExplicitRecovery(deps);
    try {
      assert.equal((await deployProduction(commit, deps)).lastVerifiedState, "unknown");
    } finally { await rm(root, { recursive: true, force: true }); }
  }
  const { deps, root } = await fixture({ remoteEnableIntentFailure: true });
  useExplicitRecovery(deps);
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.lastVerifiedState, "disabled");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("routine acceptance failure failbacks to the starting release without reporting the candidate accepted", async () => {
  const { deps, calls, root } = await fixture({ failFeatures: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "authenticated_read_only_acceptance_failed");
    assert.equal(report.rollback, "restored");
    assert.equal(report.lastVerifiedState, "restored");
    const rollbackCall = calls.find(({ args }) => args.includes("rollback"));
    assert.ok(rollbackCall?.args.includes(startingId));
    assert.equal(report.checks.includes("starting_version_restored"), false,
      "a prior release that also fails acceptance remains enabled but unaccepted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("edge acceptance failure has a bounded stage category and retains only proven rollback evidence", async () => {
  const { deps, calls, root } = await fixture({ failProbe: true });
  const run = deps.run;
  deps.run = async (command, args, options) => {
    if (command === "pnpm" && args[0] === "production:probe") {
      const report = {
        schema: 1, profile: "edge", failed: ["authentication_failed"], failureCategory: "authentication_failed",
        lastCompletedBoundary: "oauth_metadata", correlationIds: ["req_0123456789"],
      };
      const stdout = `pnpm banner\n${JSON.stringify(report)}\nprivate token-like marker`;
      throw Object.assign(new Error("private edge failure detail"), { acceptanceFailure: options?.captureFailureStdout?.(stdout) });
    }
    return await run(command, args, options);
  };
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "edge_acceptance_failed");
    assert.equal(report.lastVerifiedState, "restored");
    assert.equal(report.checks.includes("starting_version_restored"), false);
    assert.equal(report.rollback, "restored");
    assert.deepEqual(report.acceptanceFailure, {
      stage: "edge", profile: "edge", category: "authentication_failed",
      lastCompletedBoundary: "oauth_metadata", correlationIds: ["req_0123456789"],
    });
    assert.equal(JSON.stringify(report).includes("private edge failure detail"), false);
    assert.equal(JSON.stringify(report).includes("private token-like marker"), false);
    const latestBlob = calls.filter(({ command, args }) => command === "gh" && args.some((arg) => arg.endsWith("git/blobs"))).at(-1);
    const persisted = JSON.parse(Buffer.from((JSON.parse(latestBlob?.input ?? "{}") as { content: string }).content, "base64").toString("utf8")) as { acceptanceFailure?: unknown };
    assert.deepEqual(persisted.acceptanceFailure, report.acceptanceFailure);
    assert.equal(calls.some(({ args }) => args.includes("DELETE")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("service fixture typed failures retain their bounded boundary in the release journal", async () => {
  const { deps, root } = await fixture();
  deps.acceptanceMode = "service";
  deps.env.NEMLIG_CI_ACCEPTANCE_READY = "true";
  deps.env.NEMLIG_MCP_SERVICE_CLIENT_ID = "service-client";
  deps.issueServiceToken = async () => "machine-token";
  const run = deps.run;
  let attempts = 0;
  deps.run = async (command, args, options) => {
    if (command === "pnpm" && args.includes("production:test:features") && !args.includes("--initialize-only")) {
      attempts += 1;
      if (attempts > 1) throw new Error("later private fixture detail");
      const stdout = JSON.stringify({
        schema: 1, profile: "service", failed: ["service_resource_inventory_mismatch"], failureCategory: "feature_failed",
        lastCompletedBoundary: "service_resource_inventory_read", correlationIds: [],
      });
      throw Object.assign(new Error("private fixture detail"), { acceptanceFailure: options?.captureFailureStdout?.(stdout) });
    }
    return await run(command, args, options);
  };
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.failure, "service_fixture_acceptance_failed");
    assert.deepEqual(report.acceptanceFailure, {
      stage: "read_only", profile: "service", category: "feature_failed",
      lastCompletedBoundary: "service_resource_inventory_read", correlationIds: [],
    });
    assert.equal(attempts, 13, "restoration performs one additional read-only initialize against the starting revision");
    assert.doesNotMatch(JSON.stringify(report), /private fixture detail|machine-token/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("runtime-version failure report is parsed and retried without exposing server data", async (t) => {
  const diagnostics: string[] = [];
  t.mock.method(console, "error", (message: string) => { diagnostics.push(message); });
  const { deps, root } = await fixture();
  deps.acceptanceMode = "service";
  deps.env.NEMLIG_CI_ACCEPTANCE_READY = "true";
  deps.env.NEMLIG_MCP_SERVICE_CLIENT_ID = "service-client";
  deps.issueServiceToken = async () => "machine-token";
  const run = deps.run;
  let attempts = 0;
  deps.run = async (command, args, options) => {
    if (command === "pnpm" && args[0] === "production:test:features" && !args.includes("--initialize-only") && ++attempts === 1) {
      const stdout = JSON.stringify({
        schema: 1, profile: "service", failed: ["service_runtime_version_mismatch"], failureCategory: "feature_failed",
        lastCompletedBoundary: "service_runtime_version_read", correlationIds: [],
      });
      throw Object.assign(new Error("private old-server data"), { acceptanceFailure: options?.captureFailureStdout?.(stdout) });
    }
    return await run(command, args, options);
  };
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    assert.equal(attempts, 2);
    assert.deepEqual(diagnostics, ["acceptance_failure_code=service_runtime_version_mismatch"]);
    assert.doesNotMatch(JSON.stringify(report), /private old-server data|machine-token/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Worker rollback with changed Container metadata remains unknown", async () => {
  const { deps, root } = await fixture({ failFeatures: true, rollbackApplicationVersionDrift: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.lastVerifiedState, "unknown");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("unexpected enabled provider drift during recovery is retained without rollback", async () => {
  const { deps, calls, root } = await fixture({ failFeatures: true, externalEnabledDriftDuringRecovery: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "cloudflare_deployment_drift");
    assert.equal(report.lastVerifiedState, "unknown");
    assert.equal(calls.some(({ args }) => args.includes("rollback")), false);
    assert.equal(calls.some(({ args }) => args.includes("DELETE")), false);
    await access(join(root, "nemlig-production-deploy.lock"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("changed remote journal parent is never overwritten and leaves the local safety stop", async () => {
  const { deps, calls, root } = await fixture({ remoteLeaseChanges: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "remote_journal_append_failed");
    assert.equal(calls.some(({ args }) => args.includes("DELETE")), false);
    await access(join(root, "nemlig-production-deploy.lock"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("each failed remote intent write stops before its provider dispatch", async () => {
  const { deps, calls, root } = await fixture({ remoteIntentFailure: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(calls.some(({ args }) => args.includes("deploy") || args.includes("rollback")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a pre-mutation failure releases its remote and local deployment leases", async () => {
  const { deps, calls, root } = await fixture({ failCurrentRead: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.lastVerifiedState, "unchanged");
    assert.equal(calls.some(({ args }) => args.includes("deploy") || args.includes("rollback")), false);
    assert.equal(calls.filter(({ command, args }) => command === "gh" && args.includes("DELETE")).length, 1);
    await assert.rejects(access(join(root, "nemlig-production-deploy.lock")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("every remote journal object write failure before intent dispatch stops provider work", async () => {
  for (const remoteObjectFailure of ["blob", "tree", "commit", "patch"] as const) {
    const { deps, calls, root } = await fixture({ remoteObjectFailure });
    try {
      const report = await deployProduction(commit, deps);
      assert.equal(report.outcome, "failed");
      assert.equal(calls.some(({ args }) => args.includes("deploy") || args.includes("rollback")), false);
      assert.equal(calls.some(({ args }) => args.includes("POST") && args.some((arg) => arg.endsWith("git/refs"))), true);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("remote result persistence failure after provider success retains unknown state without rollback", async () => {
  const { deps, calls, root } = await fixture({ remoteResultFailure: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.lastVerifiedState, "unknown");
    assert.equal(calls.filter(({ args }) => args.includes("deploy")).length, 1);
    assert.equal(calls.some(({ args }) => args.includes("rollback")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local mirror write failure prevents dispatch before intent and retains unknown after provider success", async () => {
  const before = await fixture();
  try {
    await mkdir(join(before.root, "nemlig-production-deploy", "latest.json"), { recursive: true });
    const report = await deployProduction(commit, before.deps);
    assert.equal(report.failure, "deployment_journal_write_failed");
    assert.equal(before.calls.some(({ args }) => args.includes("deploy")), false);
  } finally { await rm(before.root, { recursive: true, force: true }); }
  const after = await fixture({ localResultMirrorFailure: true });
  try {
    const report = await deployProduction(commit, after.deps);
    assert.equal(report.lastVerifiedState, "unknown");
    assert.equal(after.calls.filter(({ args }) => args.includes("deploy")).length, 1);
    assert.equal(after.calls.some(({ args }) => args.includes("rollback")), false);
  } finally { await rm(after.root, { recursive: true, force: true }); }
  const terminal = await fixture({ localFinalMirrorFailure: true });
  try {
    const report = await deployProduction(commit, terminal.deps);
    assert.equal(report.failure, "deployment_journal_write_failed");
    assert.equal(report.lastVerifiedState, "unknown");
  } finally { await rm(terminal.root, { recursive: true, force: true }); }
});

test("remote journal remains recoverable after losing the local mirror", async () => {
  const { deps, root } = await fixture();
  try {
    const report = await deployProduction(commit, deps);
    await rm(join(root, "nemlig-production-deploy", "latest.json"));
    assert.equal((await inspectDeploymentRecovery(report.operationId, deps, true)).cleanupEligible, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("remote journal reader rejects malformed blobs and extra tree entries before provider access", async () => {
  for (const corruption of ["base64", "oversized", "tree"] as const) {
    const deps = recoveryDeps(terminalJournal(), startingId, true);
    const run = deps.run;
    const calls: Call[] = [];
    deps.run = async (command, args, options) => {
      calls.push({ command, args });
      if (args.some((arg) => arg.includes("git/blobs/")) && corruption !== "tree") {
        return JSON.stringify({ encoding: "base64", content: corruption === "base64" ? "not!base64" : Buffer.alloc(8193, 32).toString("base64") });
      }
      const raw = await run(command, args, options);
      if (corruption === "tree" && args.some((arg) => arg.includes("git/trees/"))) {
        const parsed = JSON.parse(raw);
        parsed.tree.push({ ...parsed.tree[0], path: "unexpected.json" });
        return JSON.stringify(parsed);
      }
      return raw;
    };
    const operation = terminalJournal().operationId;
    assert.equal((await inspectDeploymentRecovery(operation, deps, true)).reason, "journal_invalid");
    await assert.rejects(finalizeDeploymentRecovery(operation, deps, true, true));
    assert.equal(calls.some(({ command, args }) => command === "pnpm" || args.includes("DELETE")), false);
  }
});

test("a second host recovers pending remote intent without the original local mirror", async () => {
  const sharedLease: SharedLeaseStore = {};
  const first = await fixture({ sharedLease });
  const second = await fixture({ sharedLease });
  const run = first.deps.run;
  first.deps.run = async (command, args, options) => {
    if (command === "pnpm" && args.includes("deploy") && args.includes("MCP_ENABLED:true")) throw new Error("runner stopped after deployment intent");
    return await run(command, args, options);
  };
  try {
    const report = await deployProduction(commit, first.deps);
    await rm(join(first.root, "nemlig-production-deploy", "latest.json"));
    const head = sharedLease.commits!.get(sharedLease.ref!)!;
    const snapshot = parseDeploymentJournal(sharedLease.blobs!.get(sharedLease.trees!.get(head.tree)!)!);
    assert.equal(snapshot.startingVersion, startingId);
    assert.equal(snapshot.transitions.at(-1)?.kind, "intent");
    const inspection = await inspectDeploymentRecovery(report.operationId, second.deps, true);
    assert.equal(inspection.reason, "pending_or_unknown");
    assert.equal(inspection.cleanupEligible, false);
    assert.equal(await finalizeDeploymentRecovery(report.operationId, second.deps, true, true), false);
    assert.equal(second.calls.some(({ command, args }) => command === "pnpm" || args.includes("DELETE") || args.includes("PATCH")), false);
  } finally {
    await rm(first.root, { recursive: true, force: true });
    await rm(second.root, { recursive: true, force: true });
  }
});

test("a competing journal child between read and PATCH is never overwritten", async () => {
  const sharedLease: SharedLeaseStore = {};
  const { deps, calls, root } = await fixture({ sharedLease });
  const run = deps.run;
  let competingHead: string | undefined;
  deps.run = async (command, args, options) => {
    if (args.includes("PATCH") && !competingHead) {
      competingHead = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
      const parent = sharedLease.ref!;
      sharedLease.commits!.set(competingHead, { tree: sharedLease.commits!.get(parent)!.tree, parents: [parent] });
      sharedLease.ref = competingHead;
    }
    return run(command, args, options);
  };
  try {
    assert.equal((await deployProduction(commit, deps)).outcome, "failed");
    assert.ok(competingHead);
    assert.equal(sharedLease.ref, competingHead);
    assert.equal(calls.some(({ args }) => args.includes("deploy") || args.includes("rollback") || args.includes("DELETE")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("finalization retains a lease whose owner changes during provider readback", async () => {
  const sharedLease: SharedLeaseStore = {};
  const { deps, calls, root } = await fixture({ sharedLease });
  try {
    const report = await deployProduction(commit, deps);
    const run = deps.run;
    let reads = 0;
    deps.run = async (command, args, options) => {
      if (args.some((arg) => arg.includes("git/ref/heads/")) && ++reads === 2) sharedLease.ref = previousCommit;
      return run(command, args, options);
    };
    assert.equal(await finalizeDeploymentRecovery(report.operationId, deps, true, true), false);
    assert.equal(sharedLease.ref, previousCommit);
    assert.equal(calls.some(({ args }) => args.includes("DELETE")), false);
    await access(join(root, "nemlig-production-deploy.lock"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("successful deployment finalizes from its stateful remote journal chain", async () => {
  const { deps, calls, root } = await fixture();
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    assert.equal(await finalizeDeploymentRecovery(report.operationId, deps, true, true), true);
    assert.equal(calls.filter(({ command, args }) => command === "gh" && args.includes("DELETE")).length, 1);
    await assert.rejects(access(join(root, "nemlig-production-deploy.lock")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed candidate and starting-release acceptance keep the lease held", async () => {
  const { deps, calls, root } = await fixture({ failFeatures: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.lastVerifiedState, "restored");
    assert.equal(report.rollback, "restored");
    const mutationsBefore = calls.filter(({ args }) => args.includes("deploy") || args.includes("rollback")).length;
    assert.equal(await finalizeDeploymentRecovery(report.operationId, deps, true, true), false);
    assert.equal(calls.filter(({ command, args }) => command === "gh" && args.includes("DELETE")).length, 0);
    assert.equal(calls.filter(({ args }) => args.includes("deploy") || args.includes("rollback")).length, mutationsBefore);
    await access(join(root, "nemlig-production-deploy.lock"));
    assert.equal(report.outcome, "failed");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("ambiguous deploy failure retains both leases and reports unknown state", async () => {
  const { deps, calls, root } = await fixture();
  const run = deps.run;
  deps.run = async (command, args, options) => {
    if (command === "pnpm" && args.includes("deploy") && args.includes("MCP_ENABLED:true")) throw new Error("timed out");
    return await run(command, args, options);
  };
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.lastVerifiedState, "unknown");
    assert.equal(calls.some(({ args }) => args.includes("DELETE")), false);
    await access(join(root, "nemlig-production-deploy.lock"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("finalize accepts GitHub's empty successful DELETE only after the exact remote journal head", async () => {
  const root = await mkdtemp(join(tmpdir(), "nemlig-production-finalize-"));
  const operation = "44444444-4444-4444-8444-444444444444";
  const remoteCommit = "cccccccccccccccccccccccccccccccccccccccc";
  const journal = JSON.stringify({
    schema: 2, operationId: operation, commit, ciRunId: 456, releaseRunId: "local", releaseRunAttempt: "local", startedAt: "2026-09-05T12:00:00.000Z",
    completedAt: "2026-09-05T12:00:04.000Z", startingVersion: startingId, enabledVersion: enabledId, startingContainerId: applicationId, enabledImage: image, checks: ["enabled_version", "image_reused", "edge_acceptance", "authenticated_read_only_acceptance"], lastVerifiedState: "enabled",
    rollback: "not_needed", outcome: "success", remoteCommit: "dddddddddddddddddddddddddddddddddddddddd",
    enabledApplicationVersion: 25, startingConfigDigest: configDigest, startingEnabled: true,
    transitions: [
      { phase: "disabled_deploy", kind: "intent", at: "2026-09-05T12:00:00.000Z", version: startingId },
      { phase: "disabled_deploy", kind: "result", at: "2026-09-05T12:00:01.000Z", version: disabledId },
      { phase: "enable_deploy", kind: "intent", at: "2026-09-05T12:00:02.000Z", version: disabledId },
      { phase: "enable_deploy", kind: "result", at: "2026-09-05T12:00:03.000Z", version: enabledId },
    ],
  });
  let head = remoteCommit;
  let currentImage = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const calls: Call[] = [];
  const run: CommandRunner = async (command, args) => {
    calls.push({ command, args: [...args] });
    if (command === "git" && args[0] === "rev-parse") return root;
    if (command === "pnpm" && args.includes("deployments")) return deployment(enabledId);
    if (command === "pnpm" && args.includes("versions")) return version(enabledId, commit, true);
    if (command === "pnpm" && args.includes("instances")) return JSON.stringify([{ id: "instance", name: "nemlig-production", state: "running", version: 25 }]);
    if (command === "pnpm" && args.includes("info")) return JSON.stringify({
      id: applicationId, name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production", instances: 1, image: currentImage,
      configuration: { image: currentImage },
      version: 25,
    });
    if (command === "pnpm" && args.includes("containers")) return JSON.stringify([{
      id: applicationId, name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production", instances: 1, image: currentImage, version: 25,
    }]);
    if (command !== "gh") throw new Error("unexpected command");
    if (args[0] === "repo") return JSON.stringify({ nameWithOwner: "mortenbroesby/everyday-assistants", url: "https://github.com/mortenbroesby/everyday-assistants" });
    if (args.includes("DELETE")) { head = ""; return ""; }
    const path = args.find((value) => value.startsWith("repos/")) ?? "";
    if (path.includes("git/ref/")) return head;
    if (path.includes("git/commits/")) return JSON.stringify({ tree: { sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }, parents: [{ sha: "dddddddddddddddddddddddddddddddddddddddd" }] });
    if (path.includes("git/trees/")) return JSON.stringify({ tree: [{ path: "journal.json", type: "blob", mode: "100644", sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }] });
    if (path.includes("git/blobs/")) {
      const encoded = Buffer.from(journal).toString("base64");
      return JSON.stringify({ encoding: "base64", content: `${encoded.slice(0, 76)}\n${encoded.slice(76)}` });
    }
    throw new Error("unexpected gh api");
  };
  try {
    await writeFile(join(root, "nemlig-production-deploy.lock"), JSON.stringify({ operation, commit }));
    assert.equal(await finalizeDeploymentRecovery(operation, {
      repoRoot: root, packageRoot: root, stateRoot: root, env: {}, run, fetcher: fetch,
      sleep: async () => undefined, now: () => new Date(),
    }, true, true), false);
    assert.equal(head, remoteCommit, "image drift retains the remote lease");
    currentImage = image;
    assert.equal(await finalizeDeploymentRecovery(operation, {
      repoRoot: root, packageRoot: root, stateRoot: root, env: {}, run, fetcher: fetch,
      sleep: async () => undefined, now: () => new Date(),
    }, true, true), true);
    assert.equal(head, "");
    await assert.rejects(access(join(root, "nemlig-production-deploy.lock")));
    assert.equal(calls.filter(({ args }) => args.includes("DELETE")).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recovery commands reject forged arguments before I/O", () => {
  const operation = "44444444-4444-4444-8444-444444444444";
  assert.deepEqual(parseProductionDeployCli(["finalize", operation, "--evidence-saved", "--original-runner-stopped"]), {
    help: false, command: "finalize", operation, evidenceSaved: true, originalRunnerStopped: true,
  });
  assert.deepEqual(parseProductionDeployCli(["reconcile-recovery", operation, "--evidence-saved", "--original-runner-stopped"]), {
    help: false, command: "reconcile-recovery", operation, evidenceSaved: true, originalRunnerStopped: true, authorizeOneContainerRestore: false,
  });
  assert.deepEqual(parseProductionDeployCli(["reconcile-recovery", operation, "--evidence-saved", "--original-runner-stopped", "--authorize-one-container-restore"]), {
    help: false, command: "reconcile-recovery", operation, evidenceSaved: true, originalRunnerStopped: true, authorizeOneContainerRestore: true,
  });
  assert.throws(() => parseProductionDeployCli(["finalize", operation, "--evidence-saved"]));
  assert.deepEqual(parseProductionDeployCli(["inspect-recovery", "44444444-4444-4444-8444-444444444444"]), {
    help: false, command: "inspect-recovery", operation: "44444444-4444-4444-8444-444444444444", originalRunnerStopped: false,
  });
  assert.deepEqual(parseProductionDeployCli(["preflight", "--recovery", commit]), {
    help: false, command: "preflight", commit, recovery: true,
  });
  assert.deepEqual(parseProductionDeployCli(["--recovery", commit]), {
    help: false, command: "deploy", commit, acceptanceMode: "recovery",
  });
  for (const argv of [["finalize", "44444444-4444-4444-8444-444444444444"], ["finalize", commit, "--evidence-saved"], ["reconcile-recovery", operation, "--evidence-saved"], ["reconcile-recovery", operation, "--evidence-saved", "--original-runner-stopped", "--unknown"], ["inspect-recovery", commit], ["--service-cutover", commit]]) {
    assert.throws(() => parseProductionDeployCli(argv));
  }
});

test("inspection is read-only and denies malformed operation without a runner call", async () => {
  let calls = 0;
  const inspection = await inspectDeploymentRecovery("forged", {
    repoRoot: ".", packageRoot: ".", env: {}, run: async () => { calls += 1; return ""; }, fetcher: fetch,
    sleep: async () => undefined, now: () => new Date(),
  });
  assert.deepEqual(inspection, { operation: "forged", originalRunnerStopped: false, cleanupEligible: false, reason: "operation_mismatch", state: "unknown" });
  assert.equal(calls, 0);
});

test("missing artifact attestation denies finalization before any recovery reads", async () => {
  let calls = 0;
  assert.equal(await finalizeDeploymentRecovery("44444444-4444-4444-8444-444444444444", {
    repoRoot: ".", packageRoot: ".", env: {}, run: async () => { calls += 1; return ""; }, fetcher: fetch,
    sleep: async () => undefined, now: () => new Date(),
  }, false), false);
  assert.equal(calls, 0);
});

test("finalization also requires stopped-runner attestation before any reads", async () => {
  let reads = 0;
  const deps = recoveryDeps(terminalJournal(), startingId, true);
  deps.run = async () => { reads += 1; throw new Error("must not read"); };
  assert.equal(await finalizeDeploymentRecovery(terminalJournal().operationId, deps, true), false);
  assert.equal(reads, 0);
});

test("restored cleanup rejects an enabled-state mismatch with the starting snapshot", async () => {
  const journal = terminalJournal();
  const result = await inspectDeploymentRecovery(journal.operationId, recoveryDeps(journal, startingId, false), true);
  assert.equal(result.cleanupEligible, false);
});

test("recovery denies legacy terminal journals lacking snapshot proof", async () => {
  for (const missing of ["startingConfigDigest", "startingApplicationVersion", "startingEnabled"]) {
    const journal = terminalJournal({ startingConfigDigest: configDigest, startingApplicationVersion: 25, [missing]: undefined });
    let reads = 0;
    const deps = recoveryDeps(journal, startingId, true);
    const run = deps.run;
    deps.run = async (command, args, options) => { if (command === "pnpm") reads += 1; return run(command, args, options); };
    const result = await inspectDeploymentRecovery(journal.operationId, deps, true);
    assert.equal(result.cleanupEligible, false);
    assert.equal(reads, 0);
  }
});

test("four-read recovery proof rejects every provider drift dimension without deletion", async () => {
  for (const drift of ["worker", "image", "application", "config", "instance", "malformed-instance"]) {
    const journal = terminalJournal();
    const deps = recoveryDeps(journal, startingId, true);
    const run = deps.run;
    let reads = 0;
    let deletes = 0;
    deps.run = async (command, args, options) => {
      if (args.includes("DELETE")) { deletes += 1; return ""; }
      if (command === "pnpm") reads += 1;
      const raw = await run(command, args, options);
      if (command !== "pnpm") return raw;
      if (drift === "worker" && args.includes("deployments")) return deployment(thirdPartyId);
      if (drift === "config" && args.includes("versions")) return raw.replace('"name":"MCP_TOTAL_TIMEOUT_MS","text":"90000"', '"name":"MCP_TOTAL_TIMEOUT_MS","text":"90001"');
      if (args.includes("instances")) {
        if (drift === "malformed-instance") return "[]";
        if (drift === "instance") return JSON.stringify([{ id: "instance", name: "nemlig-production", state: "running", version: 24 }]);
      } else if (args.includes("containers")) {
        if (drift === "application") return raw.replace('"version":25', '"version":26');
        if (drift === "image") return raw.replace(image, `sha256:${"b".repeat(64)}`);
      }
      return raw;
    };
    const inspection = await inspectDeploymentRecovery(journal.operationId, deps, true);
    assert.equal(inspection.cleanupEligible, false, drift);
    assert.ok(reads <= 4);
    reads = 0;
    // Malformed provider records may throw; either result must deny deletion.
    assert.equal(await finalizeDeploymentRecovery(journal.operationId, deps, true, true).catch(() => false), false, drift);
    assert.ok(reads <= 4);
    assert.equal(deletes, 0);
  }
});

test("disabled recovery requires both exact public routes to remain disabled", async () => {
  const journal = terminalJournal({
    rollback: "not_needed", lastVerifiedState: "disabled", disabledVersion: disabledId, disabledImage: image,
    disabledApplicationVersion: 25, checks: ["disabled_routes", "container_inactive"],
    transitions: [
      { phase: "disabled_deploy", kind: "intent", at: "2026-09-05T12:00:00.000Z", version: startingId },
      { phase: "disabled_deploy", kind: "result", at: "2026-09-05T12:00:01.000Z", version: disabledId },
    ],
  });
  for (const bad of [new Response("enabled", { status: 200 }), new Response("wrong body", { status: 503 })]) {
    const deps = recoveryDeps(journal, disabledId, false);
    let routeReads = 0;
    deps.fetcher = async () => { routeReads += 1; return bad; };
    const result = await inspectDeploymentRecovery(journal.operationId, deps, true);
    assert.equal(result.cleanupEligible, false);
    assert.equal(result.reason, "provider_drift");
    assert.equal(routeReads, 12);
    assert.equal(await finalizeDeploymentRecovery(journal.operationId, deps, true, true), false);
    assert.equal(routeReads, 24);
  }
});

test("enabled recovery accepts matching running or inactive instances but disabled recovery only inactive", async () => {
  for (const enabled of [true, false]) {
    for (const running of [true, false]) {
      const journal = terminalJournal({ startingEnabled: enabled });
      const deps = recoveryDeps(journal, startingId, enabled);
      const run = deps.run;
      let reads = 0;
      deps.run = async (command, args, options) => {
        if (command === "pnpm") reads += 1;
        if (args.includes("instances") && running) return JSON.stringify([{ id: "instance", name: "nemlig-production", state: "running", version: 25 }]);
        return run(command, args, options);
      };
      const result = await inspectDeploymentRecovery(journal.operationId, deps, true);
      assert.equal(result.cleanupEligible, enabled || !running);
      assert.equal(reads, 4);
    }
  }
});

test("failure recovery rechecks earlier disabled or starting configuration before claiming known state", async () => {
  for (const target of [disabledId, startingId]) {
    let reads = 0;
    const { deps, root } = await fixture({
      ...(target === disabledId ? { remoteEnableIntentFailure: true } : { driftBeforeEnable: true }),
      versionBindings: (values, id) => id === target && ++reads > 1
        ? values.map((value) => value.name === "MCP_TOTAL_TIMEOUT_MS" ? { ...value, text: "90001" } : value) : values,
    });
    useExplicitRecovery(deps);
    try {
      const report = await deployProduction(commit, deps);
      assert.equal(report.outcome, "failed");
      assert.equal(report.lastVerifiedState, "unknown");
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("inspection accepts either enabled or disabled restored starting state only with stopped-runner attestation", async () => {
  for (const enabled of [true, false]) {
    const inspected = await inspectDeploymentRecovery("44444444-4444-4444-8444-444444444444", recoveryDeps(terminalJournal({ startingEnabled: enabled }), startingId, enabled), true);
    assert.deepEqual(inspected, { operation: "44444444-4444-4444-8444-444444444444", originalRunnerStopped: true, cleanupEligible: true, reason: "eligible", state: "restored" });
  }
  const denied = await inspectDeploymentRecovery("44444444-4444-4444-8444-444444444444", recoveryDeps(terminalJournal(), startingId, true));
  assert.equal(denied.reason, "runner_not_stopped");
  assert.equal(denied.cleanupEligible, false);
});

test("inspection denies wrong operation, pending work, and recognizes known disabled terminal state", async () => {
  const operation = "44444444-4444-4444-8444-444444444444";
  assert.equal((await inspectDeploymentRecovery("55555555-5555-4555-8555-555555555555", recoveryDeps(terminalJournal(), startingId, true), true)).reason, "operation_mismatch");
  assert.equal((await inspectDeploymentRecovery(operation, recoveryDeps(terminalJournal({ outcome: "running", lastVerifiedState: "unknown", transitions: [] }), startingId, true), true)).reason, "pending_or_unknown");
  const missingJournalDeps = recoveryDeps(terminalJournal(), startingId, true);
  const runWithJournal = missingJournalDeps.run;
  missingJournalDeps.run = async (command, args, options) => {
    if (command === "gh" && args.some((arg) => arg.includes("git/ref/heads/codex-lock/nemlig-production"))) {
      throw Object.assign(new Error("missing remote lease"), { status: 404 });
    }
    return runWithJournal(command, args, options);
  };
  assert.deepEqual(await inspectDeploymentRecovery(operation, missingJournalDeps, true), {
    operation, originalRunnerStopped: true, cleanupEligible: false, reason: "journal_missing", state: "unknown",
  });
  const disabled = terminalJournal({
    rollback: "not_needed", lastVerifiedState: "disabled", disabledVersion: disabledId, disabledImage: image, disabledApplicationVersion: 25, checks: ["disabled_routes", "container_inactive"],
    transitions: [
      { phase: "disabled_deploy", kind: "intent", at: "2026-09-05T12:00:00.000Z", version: startingId },
      { phase: "disabled_deploy", kind: "result", at: "2026-09-05T12:00:01.000Z", version: disabledId },
    ],
  });
  assert.deepEqual(await inspectDeploymentRecovery(operation, recoveryDeps(disabled, disabledId, false), true), {
    operation, originalRunnerStopped: true, cleanupEligible: true, reason: "eligible", state: "disabled",
  });
});

test("pending rollback reconciliation records only the observed exact disabled candidate", async () => {
  const terminal = terminalJournal();
  const pending = terminalJournal({
    outcome: "failed", rollback: "attempted", lastVerifiedState: "unknown", failure: "edge_acceptance_failed",
    remoteCommit: "cccccccccccccccccccccccccccccccccccccccc",
    disabledVersion: null, disabledImage: null, disabledApplicationVersion: null,
    enabledVersion: enabledId, enabledImage: candidateImage, enabledApplicationVersion: 25,
    transitions: [...terminal.transitions.slice(0, -2), { ...terminal.transitions.at(-2), version: enabledId }],
  });
  assert.equal((pending as Record<string, unknown>).disabledVersion, null);
  assert.equal((pending as Record<string, unknown>).disabledImage, null);
  assert.equal((pending as Record<string, unknown>).disabledApplicationVersion, null);
  const deps = recoveryDeps(pending, thirdPartyId, false, { image: candidateImage, applicationVersion: 25 });
  const calls: string[] = [];
  const run = deps.run;
  deps.run = async (command, args, options) => {
    calls.push(`${command} ${args.join(" ")}`);
    return await run(command, args, options);
  };
  assert.equal((await inspectDeploymentRecovery(pending.operationId, deps, true)).reason, "pending_or_unknown");
  assert.equal((await reconcilePendingRollback(pending.operationId, deps, true, false)).reason, "runner_not_stopped");
  const result = await reconcilePendingRollback(pending.operationId, deps, true, true);
  assert.deepEqual(result, { operation: pending.operationId, originalRunnerStopped: true, reconciled: true, reason: "eligible", state: "disabled" });
  assert.ok(calls.some((call) => call.includes("versions view " + thirdPartyId)));
  assert.equal(calls.some((call) => /wrangler deploy(?: |$)/u.test(call)), false);
  assert.equal(calls.some((call) => call.includes("containers delete")), false);
  assert.equal((await inspectDeploymentRecovery(pending.operationId, deps, true)).cleanupEligible, true);
});

test("interrupted disabled deploy is reconciled only from its exact disabled candidate", async () => {
  const pending = terminalJournal({
    outcome: "failed", rollback: "not_needed", lastVerifiedState: "unknown", failure: "disabled_route_unavailable",
    remoteCommit: "cccccccccccccccccccccccccccccccccccccccc", startingEnabled: false,
    transitions: [{ phase: "disabled_deploy", kind: "intent", at: "2026-09-05T12:00:00.000Z", version: startingId }],
  });
  const root = await mkdtemp(join(tmpdir(), "nemlig-interrupted-disabled-deploy-"));
  const deps = recoveryDeps(pending, disabledId, false, { image: candidateImage, applicationVersion: 26 });
  deps.stateRoot = root;
  const run = deps.run;
  const calls: string[] = [];
  deps.run = async (command, args, options) => {
    calls.push(`${command} ${args.join(" ")}`);
    return await run(command, args, options);
  };
  try {
    assert.equal((await reconcilePendingRollback(pending.operationId, deps, true, false)).reason, "runner_not_stopped");
    const result = await reconcilePendingRollback(pending.operationId, deps, true, true);
    assert.deepEqual(result, { operation: pending.operationId, originalRunnerStopped: true, reconciled: true, reason: "eligible", state: "disabled" });
    assert.deepEqual(await inspectDeploymentRecovery(pending.operationId, deps, true), {
      operation: pending.operationId, originalRunnerStopped: true, cleanupEligible: true, reason: "eligible", state: "disabled",
    });
    assert.equal(await finalizeDeploymentRecovery(pending.operationId, deps, true, true), true);
    assert.ok(calls.some((call) => call.includes("registries credentials")));
    assert.equal(calls.some((call) => /wrangler (?:deploy|rollback)(?:\s|$)|wrangler containers delete/u.test(call)), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("interrupted disabled deploy drift retains the lease without provider mutation", async () => {
  const pending = terminalJournal({
    outcome: "failed", rollback: "not_needed", lastVerifiedState: "unknown", failure: "disabled_route_unavailable",
    remoteCommit: "cccccccccccccccccccccccccccccccccccccccc", startingEnabled: false,
    transitions: [{ phase: "disabled_deploy", kind: "intent", at: "2026-09-05T12:00:00.000Z", version: startingId }],
  });
  for (const drift of ["revision", "image", "application", "active", "config", "route"]) {
    const deps = recoveryDeps(pending, disabledId, false, {
      image: drift === "image" ? image : candidateImage,
      applicationVersion: drift === "application" ? 25 : 26,
      active: drift === "active",
      revision: drift === "revision" ? previousCommit : commit,
      configDrift: drift === "config",
    });
    if (drift === "route") deps.fetcher = async () => new Response("unexpected", { status: 200 });
    deps.sleep = async () => undefined;
    const run = deps.run;
    let writes = 0;
    deps.run = async (command, args, options) => {
      if (command === "gh" && args[0] === "api" && ["POST", "PATCH", "DELETE"].some((method) => args.includes(method))) writes += 1;
      if (command === "pnpm" && /(?:^|\s)(?:deploy|rollback)(?:\s|$)/u.test(args.join(" "))) writes += 1;
      return await run(command, args, options);
    };
    const result = await reconcilePendingRollback(pending.operationId, deps, true, true);
    assert.equal(result.reconciled, false, drift);
    assert.equal(result.reason, "provider_drift", drift);
    assert.equal(writes, 0, drift);
  }
});

test("interrupted Container restore reconciles only after readback proves the exact prior image is already restored", async () => {
  const journal = interruptedContainerRestoreJournal();
  const recovery = interruptedContainerRestoreDeps(journal, { alreadyRestored: true });
  const { deps } = recovery;
  let rollbacks = 0;
  const run = deps.run;
  deps.run = async (command, args, options) => {
    if (command === "pnpm" && args.includes("rollback")) rollbacks += 1;
    return run(command, args, options);
  };
  const result = await reconcilePendingRollback(journal.operationId, deps, true, true);
  assert.deepEqual(result, { operation: journal.operationId, originalRunnerStopped: true, reconciled: true, reason: "eligible", state: "restored" });
  assert.equal(recovery.rollouts, 0, "reconciliation must not create a second Container rollout");
  assert.equal(rollbacks, 1);
  const inspected = await inspectDeploymentRecovery(journal.operationId, deps, true);
  assert.deepEqual(inspected, { operation: journal.operationId, originalRunnerStopped: true, cleanupEligible: true, reason: "eligible", state: "restored" });
  assert.equal(await finalizeDeploymentRecovery(journal.operationId, deps, true, true), true);
  assert.equal(rollbacks, 1, "finalization performs no additional Worker mutation");
});

test("interrupted enabled restore reconciles the direct routine transcript after exact prior-image readback", async () => {
  const journal = directInterruptedContainerRestoreJournal();
  const recovery = interruptedContainerRestoreDeps(journal, { direct: true, alreadyRestored: true });
  const result = await reconcilePendingRollback(journal.operationId, recovery.deps, true, true);
  assert.deepEqual(result, { operation: journal.operationId, originalRunnerStopped: true, reconciled: true, reason: "eligible", state: "restored" });
  assert.equal(recovery.rollouts, 0, "readback of a completed restore must not create another Container rollout");
});

test("interrupted enabled restore resumes acceptance after its Worker restore was already recorded", async () => {
  const journal = directInterruptedContainerRestoreJournal({
    restoredApplicationVersion: 27,
    transitions: [
      { phase: "enable_deploy", kind: "intent", at: "2026-10-05T13:50:00.000Z", version: startingId },
      { phase: "enable_deploy", kind: "result", at: "2026-10-05T13:51:00.000Z", version: enabledId },
      { phase: "container_restore", kind: "intent", at: "2026-10-05T13:58:00.000Z", version: enabledId },
      { phase: "container_restore", kind: "result", at: "2026-10-05T13:59:00.000Z", version: enabledId },
      { phase: "worker_restore", kind: "intent", at: "2026-10-05T14:00:00.000Z", version: startingId },
      { phase: "worker_restore", kind: "result", at: "2026-10-05T14:01:00.000Z", version: startingId },
    ],
  });
  assert.doesNotThrow(() => parseDeploymentJournal(JSON.stringify(journal)));
  const recovery = interruptedContainerRestoreDeps(journal, { direct: true, alreadyRestored: true, workerRestored: true });
  const result = await reconcilePendingRollback(journal.operationId, recovery.deps, true, true);
  assert.deepEqual(result, { operation: journal.operationId, originalRunnerStopped: true, reconciled: true, reason: "eligible", state: "restored" });
  assert.equal(recovery.rollouts, 0, "resuming acceptance must not create another Container rollout");
});

test("a restored direct transcript resumes edge acceptance without another Container rollout", async () => {
  const journal = directInterruptedContainerRestoreJournal({
    failure: "edge_acceptance_failed",
    recoveryFailure: "edge_acceptance_failed",
    restoredApplicationVersion: 27,
    checks: ["starting_state_recorded", "enabled_version", "container_rollout", "container_restore_explicit_authorized_retry"],
    transitions: [
      { phase: "enable_deploy", kind: "intent", at: "2026-10-05T13:50:00.000Z", version: startingId },
      { phase: "enable_deploy", kind: "result", at: "2026-10-05T13:51:00.000Z", version: enabledId },
      { phase: "container_restore", kind: "intent", at: "2026-10-05T13:58:00.000Z", version: enabledId },
      { phase: "container_restore", kind: "result", at: "2026-10-05T13:59:00.000Z", version: enabledId },
      { phase: "worker_restore", kind: "intent", at: "2026-10-05T14:00:00.000Z", version: startingId },
      { phase: "worker_restore", kind: "result", at: "2026-10-05T14:01:00.000Z", version: startingId },
    ],
  });
  const recovery = interruptedContainerRestoreDeps(journal, { direct: true, alreadyRestored: true, workerRestored: true });
  const result = await reconcilePendingRollback(journal.operationId, recovery.deps, true, true);
  assert.deepEqual(result, { operation: journal.operationId, originalRunnerStopped: true, reconciled: true, reason: "eligible", state: "restored" });
  assert.equal(recovery.rollouts, 0, "read-only acceptance recovery must not request another Container rollout");
  const run = recovery.deps.run;
  recovery.deps.run = async (command, args, options) => {
    if (command === "pnpm" && args.includes("instances")) throw new Error("terminal cleanup must not re-read Container lifecycle");
    return await run(command, args, options);
  };
  assert.deepEqual(await inspectDeploymentRecovery(journal.operationId, recovery.deps, true), {
    operation: journal.operationId, originalRunnerStopped: true, cleanupEligible: true, reason: "eligible", state: "restored",
  });
  assert.equal(await finalizeDeploymentRecovery(journal.operationId, recovery.deps, true, true), true);
});

test("direct enabled restore consumes one explicit authorization before an uncertain exact-image retry", async () => {
  const journal = directInterruptedContainerRestoreJournal({ recoveryFailure: "cloudflare_container_restore_uncertain" });
  const recovery = interruptedContainerRestoreDeps(journal, { direct: true, restoreOutcomeUnknown: true });
  const first = await reconcilePendingRollback(journal.operationId, recovery.deps, true, true, true);
  assert.deepEqual(first, { operation: journal.operationId, originalRunnerStopped: true, reconciled: false, reason: "provider_outcome_unknown", state: "unknown" });
  assert.equal(recovery.rollouts, 1);
  const second = await reconcilePendingRollback(journal.operationId, recovery.deps, true, true, true);
  assert.deepEqual(second, { operation: journal.operationId, originalRunnerStopped: true, reconciled: false, reason: "provider_outcome_unknown", state: "unknown" });
  assert.equal(recovery.rollouts, 1, "a consumed direct-restore authorization must never be replayed");
});

test("direct liveness-timeout restore recognizes the exact legacy transcript before consuming authorization", async () => {
  const journal = directInterruptedContainerRestoreJournal({
    failure: "container_instance_timeout",
    recoveryFailure: "cloudflare_container_restore_uncertain",
  });
  const recovery = interruptedContainerRestoreDeps(journal, { direct: true, restoreOutcomeUnknown: true });
  const result = await reconcilePendingRollback(journal.operationId, recovery.deps, true, true, true);
  assert.deepEqual(result, {
    operation: journal.operationId, originalRunnerStopped: true, reconciled: false, reason: "provider_outcome_unknown", state: "unknown",
  });
  assert.equal(recovery.rollouts, 1, "the explicitly authorized exact restore is issued once for the legacy transcript");
});

test("direct enabled restore permits a different candidate configuration while preserving exact candidate identity", async () => {
  const journal = directInterruptedContainerRestoreJournal({ recoveryFailure: "cloudflare_container_restore_uncertain" });
  const recovery = interruptedContainerRestoreDeps(journal, { direct: true, candidateConfigDrift: true });
  const result = await reconcilePendingRollback(journal.operationId, recovery.deps, true, true, true);
  assert.deepEqual(result, { operation: journal.operationId, originalRunnerStopped: true, reconciled: true, reason: "eligible", state: "restored" });
  assert.equal(recovery.rollouts, 1, "the approved restore is issued only after exact candidate Worker/image/application proof");
});

test("direct enabled restore refuses active rollout drift without a second provider mutation", async () => {
  const journal = directInterruptedContainerRestoreJournal({ recoveryFailure: "cloudflare_container_restore_uncertain" });
  const recovery = interruptedContainerRestoreDeps(journal, { direct: true, active: true });
  const result = await reconcilePendingRollback(journal.operationId, recovery.deps, true, true, true);
  assert.deepEqual(result, { operation: journal.operationId, originalRunnerStopped: true, reconciled: false, reason: "provider_drift", state: "unknown" });
  assert.equal(recovery.rollouts, 0);
});

test("ordinary reconciliation never retries an uncertain Container restore based on timestamps", async () => {
  for (const updatedAt of ["2026-10-05T13:50:00.000Z", "2026-10-05T14:05:00.000Z"]) {
    const journal = interruptedContainerRestoreJournal();
    const recovery = interruptedContainerRestoreDeps(journal, { updatedAt });
    const { deps } = recovery;
    const saved: Array<Record<string, unknown>> = [];
    const run = deps.run;
    deps.run = async (command, args, options) => {
      if (command === "gh" && args[0] === "api" && args[1] === "--method" && args[2] === "POST" && args.some((arg) => arg.endsWith("git/blobs"))) {
        const request = JSON.parse(options?.input ?? "{}") as { content?: string };
        if (request.content) saved.push(JSON.parse(Buffer.from(request.content, "base64").toString("utf8")) as Record<string, unknown>);
      }
      return run(command, args, options);
    };
    const first = await reconcilePendingRollback(journal.operationId, deps, true, true);
    assert.deepEqual(first, {
      operation: journal.operationId, originalRunnerStopped: true, reconciled: false,
      reason: "provider_outcome_unknown", state: "unknown",
    });
    assert.equal(recovery.rollouts, 0, `timestamp ${updatedAt} must not authorize another rollout`);
    assert.equal(saved.at(-1)?.recoveryFailure, "cloudflare_container_restore_uncertain");
    assert.equal(saved.some((value) => Array.isArray(value.checks) && value.checks.includes("container_restore_explicit_authorized_retry")), false);
    const persisted = await inspectDeploymentRecovery(journal.operationId, deps, true);
    assert.equal(persisted.cleanupEligible, false);
    assert.equal(persisted.reason, "provider_outcome_unknown");
    const journalWrites = saved.length;
    const second = await reconcilePendingRollback(journal.operationId, deps, true, true);
    assert.equal(second.reconciled, false);
    assert.equal(second.reason, "provider_outcome_unknown");
    assert.equal(recovery.rollouts, 0, "repeated reconciliation never retries an unresolved provider mutation");
    assert.equal(saved.length, journalWrites, "repeated inspection does not append identical uncertainty evidence");
  }
});

test("explicit one-shot restore authorization is durably consumed before one exact-image request", async () => {
  const journal = interruptedContainerRestoreJournal({ recoveryFailure: "cloudflare_container_restore_uncertain",
    checks: ["starting_state_recorded", "disabled_version", "enabled_version", "container_rollout", "container_restore_reconciliation_attempted"] });
  const recovery = interruptedContainerRestoreDeps(journal, { restoreOutcomeUnknown: true });
  const { deps } = recovery;
  const saved: Array<Record<string, unknown>> = [];
  const timeline: string[] = [];
  const run = deps.run;
  deps.run = async (command, args, options) => {
    if (command === "gh" && args[0] === "api" && args[1] === "--method" && args[2] === "POST" && args.some((arg) => arg.endsWith("git/blobs"))) {
      const request = JSON.parse(options?.input ?? "{}") as { content?: string };
      if (request.content) {
        const value = JSON.parse(Buffer.from(request.content, "base64").toString("utf8")) as Record<string, unknown>;
        saved.push(value);
        if (Array.isArray(value.checks) && value.checks.includes("container_restore_explicit_authorized_retry")) timeline.push("authorization_persisted");
      }
    }
    return run(command, args, options);
  };
  const fetcher = deps.fetcher;
  deps.fetcher = async (input, init) => {
    if (String(input).endsWith("/rollouts") && init?.method === "POST") timeline.push("provider_post");
    return fetcher(input, init);
  };
  const result = await reconcilePendingRollback(journal.operationId, deps, true, true, true);
  assert.deepEqual(result, { operation: journal.operationId, originalRunnerStopped: true, reconciled: false, reason: "provider_outcome_unknown", state: "unknown" });
  assert.equal(recovery.rollouts, 1, "explicit authorization is spent on at most one restore request");
  assert.ok(saved.some((value) => Array.isArray(value.checks) && value.checks.includes("container_restore_explicit_authorized_retry")),
    "the single-use authorization marker is persisted before the provider request");
  assert.ok(timeline.indexOf("authorization_persisted") >= 0 && timeline.indexOf("authorization_persisted") < timeline.indexOf("provider_post"));
  assert.equal(saved.at(-1)?.recoveryFailure, "cloudflare_container_restore_uncertain");
  const second = await reconcilePendingRollback(journal.operationId, deps, true, true, true);
  assert.equal(second.reconciled, false);
  assert.equal(second.reason, "provider_outcome_unknown");
  assert.equal(recovery.rollouts, 1, "a consumed authorization cannot issue another restore even when explicitly requested again");
});

test("failed enable intent can release its lease only after exact readback of the unchanged disabled start", async () => {
  const pending = terminalJournal({
    outcome: "failed", rollback: "not_needed", lastVerifiedState: "unknown", failure: "command_failed",
    remoteCommit: "cccccccccccccccccccccccccccccccccccccccc", startingEnabled: false,
    transitions: [{ phase: "enable_deploy", kind: "intent", at: "2026-09-05T12:00:00.000Z", version: startingId }],
  });
  const deps = recoveryDeps(pending, startingId, false);
  deps.stateRoot = "/tmp/nemlig-release-lock";
  const result = await reconcilePendingRollback(pending.operationId, deps, true, true);
  assert.deepEqual(result, { operation: pending.operationId, originalRunnerStopped: true, reconciled: true, reason: "eligible", state: "disabled" });
  assert.deepEqual(await inspectDeploymentRecovery(pending.operationId, deps, true), {
    operation: pending.operationId, originalRunnerStopped: true, cleanupEligible: true, reason: "eligible", state: "restored",
  });
  assert.equal(await finalizeDeploymentRecovery(pending.operationId, deps, true, true), true);

  const drifted = recoveryDeps(pending, startingId, false, { active: true });
  assert.equal((await reconcilePendingRollback(pending.operationId, drifted, true, true)).reason, "provider_drift");
});

test("interrupted enable is rolled back only from the exact candidate and unchanged inactive starting Container", async () => {
  const pending = terminalJournal({
    outcome: "failed", rollback: "not_needed", lastVerifiedState: "unknown", failure: "command_failed",
    remoteCommit: "cccccccccccccccccccccccccccccccccccccccc", startingEnabled: false,
    transitions: [{ phase: "enable_deploy", kind: "intent", at: "2026-09-05T12:00:00.000Z", version: startingId }],
  });
  const root = await mkdtemp(join(tmpdir(), "nemlig-interrupted-enable-"));
  const deps = recoveryDeps(pending, enabledId, true, { rollbackTo: { version: startingId, enabled: false } });
  deps.stateRoot = root;
  const run = deps.run;
  let rollbackCalls = 0;
  deps.run = async (command, args, options) => {
    if (args.includes("rollback")) rollbackCalls += 1;
    return run(command, args, options);
  };
  try {
    assert.deepEqual(await reconcilePendingRollback(pending.operationId, deps, true, true), {
      operation: pending.operationId, originalRunnerStopped: true, reconciled: true, reason: "eligible", state: "disabled",
    });
    assert.deepEqual(await inspectDeploymentRecovery(pending.operationId, deps, true), {
      operation: pending.operationId, originalRunnerStopped: true, cleanupEligible: true, reason: "eligible", state: "restored",
    });
    assert.equal(rollbackCalls, 1);
    assert.equal(await finalizeDeploymentRecovery(pending.operationId, deps, true, true), true);
    assert.equal(rollbackCalls, 1, "finalization must only release a previously verified terminal lease");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("interrupted enable drift retains the lease and never retries an uncertain rollback", async () => {
  const pending = terminalJournal({
    outcome: "failed", rollback: "not_needed", lastVerifiedState: "unknown", failure: "command_failed",
    remoteCommit: "cccccccccccccccccccccccccccccccccccccccc", startingEnabled: false,
    transitions: [{ phase: "enable_deploy", kind: "intent", at: "2026-09-05T12:00:00.000Z", version: startingId }],
  });
  for (const drift of ["revision", "image", "application_version", "active_instance", "config"]) {
    const deps = recoveryDeps(pending, enabledId, true, {
      image: drift === "image" ? candidateImage : image,
      applicationVersion: drift === "application_version" ? 26 : 25,
      active: drift === "active_instance",
    });
    const run = deps.run;
    let rollbackCalls = 0;
    let journalWrites = 0;
    deps.run = async (command, args, options) => {
      if (args.includes("rollback")) rollbackCalls += 1;
      if (command === "gh" && args[0] === "api" && args[1] === "--method" && ["POST", "PATCH"].includes(args[2] ?? "")) journalWrites += 1;
      const raw = await run(command, args, options);
      if (drift === "revision" && command === "pnpm" && args.includes("versions")) return raw.replace(commit, previousCommit);
      if (drift === "config" && command === "pnpm" && args.includes("versions")) return raw.replace('"name":"MCP_TOTAL_TIMEOUT_MS","text":"90000"', '"name":"MCP_TOTAL_TIMEOUT_MS","text":"90001"');
      return raw;
    };
    const result = await reconcilePendingRollback(pending.operationId, deps, true, true);
    assert.equal(result.reconciled, false, drift);
    assert.equal(result.reason, "provider_drift", drift);
    assert.equal(rollbackCalls, 0, drift);
    assert.equal(journalWrites, 0, drift);
  }

  const deps = recoveryDeps(pending, enabledId, true);
  const run = deps.run;
  let rollbackCalls = 0;
  deps.run = async (command, args, options) => {
    if (command === "pnpm" && args.includes("rollback")) {
      rollbackCalls += 1;
      throw new Error("uncertain provider result");
    }
    return run(command, args, options);
  };
  assert.equal((await reconcilePendingRollback(pending.operationId, deps, true, true)).reconciled, false);
  assert.equal((await reconcilePendingRollback(pending.operationId, deps, true, true)).reason, "provider_drift");
  assert.equal(rollbackCalls, 1, "an uncertain rollback is never retried");

  const appliedThenLost = recoveryDeps(pending, enabledId, true, { rollbackTo: { version: startingId, enabled: false } });
  const appliedRun = appliedThenLost.run;
  let appliedRollbackCalls = 0;
  appliedThenLost.run = async (command, args, options) => {
    if (command === "pnpm" && args.includes("rollback")) {
      appliedRollbackCalls += 1;
      await appliedRun(command, args, options);
      throw new Error("rollback applied but response was lost");
    }
    return appliedRun(command, args, options);
  };
  assert.equal((await reconcilePendingRollback(pending.operationId, appliedThenLost, true, true)).reconciled, false);
  assert.deepEqual(await reconcilePendingRollback(pending.operationId, appliedThenLost, true, true), {
    operation: pending.operationId, originalRunnerStopped: true, reconciled: true, reason: "eligible", state: "disabled",
  });
  assert.equal(appliedRollbackCalls, 1, "readback of an applied rollback completes evidence without retrying the mutation");
});

test("pending rollback reconciliation denies drift, a running Container, and a changed journal head", async () => {
  const terminal = terminalJournal();
  const pending = terminalJournal({
    outcome: "failed", rollback: "attempted", lastVerifiedState: "unknown", failure: "edge_acceptance_failed",
    remoteCommit: "cccccccccccccccccccccccccccccccccccccccc",
    disabledVersion: null, disabledImage: null, disabledApplicationVersion: null,
    enabledVersion: enabledId, enabledImage: candidateImage, enabledApplicationVersion: 25,
    transitions: [...terminal.transitions.slice(0, -2), { ...terminal.transitions.at(-2), version: enabledId }],
  });
  for (const drift of ["worker_revision", "config", "image", "application_version", "active_instance", "route", "journal_head"]) {
    const deps = recoveryDeps(pending, thirdPartyId, false, {
      image: drift === "image" ? image : candidateImage,
      applicationVersion: drift === "application_version" ? 26 : 25,
      active: drift === "active_instance",
    });
    const run = deps.run;
    let refReads = 0;
    let journalWrites = 0;
    deps.run = async (command, args, options) => {
      if (command === "gh" && args[0] === "api" && args[1] === "--method" && ["POST", "PATCH"].includes(args[2] ?? "")) journalWrites += 1;
      if (drift === "journal_head" && command === "gh" && args.some((arg) => arg.includes("git/ref/heads/codex-lock/nemlig-production"))) {
        refReads += 1;
        return refReads === 1 ? "dddddddddddddddddddddddddddddddddddddddd" : "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
      }
      const raw = await run(command, args, options);
      if (drift === "worker_revision" && command === "pnpm" && args.includes("versions")) return raw.replace(commit, previousCommit);
      if (drift === "config" && command === "pnpm" && args.includes("versions")) return raw.replace('"name":"MCP_TOTAL_TIMEOUT_MS","text":"90000"', '"name":"MCP_TOTAL_TIMEOUT_MS","text":"90001"');
      if (drift === "route" && command === "pnpm") return raw;
      return raw;
    };
    if (drift === "route") deps.fetcher = async () => new Response("enabled", { status: 200 });
    const result = await reconcilePendingRollback(pending.operationId, deps, true, true);
    assert.equal(result.reconciled, false, drift);
    assert.equal(result.reason, drift === "journal_head" ? "journal_head_changed" : "provider_drift", drift);
    assert.equal(journalWrites, 0, drift);
    assert.equal((await inspectDeploymentRecovery(pending.operationId, recoveryDeps(pending, thirdPartyId, false, {
      image: drift === "image" ? image : candidateImage,
      applicationVersion: drift === "application_version" ? 26 : 25,
      active: drift === "active_instance",
    }))).reason, "pending_or_unknown", drift);
  }
});

test("finalization refuses to delete a lease whose remote head changes during proof", async () => {
  const journal = terminalJournal({ startingEnabled: true });
  const deps = recoveryDeps(journal, startingId, true);
  const run = deps.run;
  let refReads = 0;
  let deletes = 0;
  deps.run = async (command, args, options) => {
    if (command === "gh" && args[0] === "api" && args.some((arg) => arg.includes("git/ref/heads/codex-lock/nemlig-production"))) {
      refReads += 1;
      return refReads === 1 ? "c".repeat(40) : "d".repeat(40);
    }
    if (command === "gh" && args.includes("DELETE")) deletes += 1;
    return await run(command, args, options);
  };
  assert.equal(await finalizeDeploymentRecovery(journal.operationId, deps, true, true), false);
  assert.equal(refReads, 2);
  assert.equal(deletes, 0);
});

test("incomplete or contradictory terminal journals never become cleanup-eligible", async () => {
  const operation = "44444444-4444-4444-8444-444444444444";
  const restoreMissingAcceptance = interruptedContainerRestoreJournal({
    restoredApplicationVersion: 27, rollback: "restored", lastVerifiedState: "restored",
    checks: ["container_restore_reconciliation_attempted", "starting_version_restored", "edge_acceptance"],
    transitions: [
      ...interruptedContainerRestoreJournal().transitions,
      { phase: "container_restore", kind: "result", at: "2026-10-05T14:00:00.000Z", version: enabledId },
      { phase: "worker_restore", kind: "intent", at: "2026-10-05T14:01:00.000Z", version: startingId },
      { phase: "worker_restore", kind: "result", at: "2026-10-05T14:02:00.000Z", version: startingId },
    ],
  });
  for (const journal of [
    terminalJournal({ completedAt: undefined }),
    terminalJournal({ checks: [] }),
    terminalJournal({ lastVerifiedState: "enabled" }),
    terminalJournal({ transitions: [...terminalJournal().transitions.slice(0, -1), { phase: "rollback", kind: "result", at: "2026-09-05T12:00:05.000Z", version: enabledId }] }),
    restoreMissingAcceptance,
  ]) {
    const inspection = await inspectDeploymentRecovery(operation, recoveryDeps(journal, startingId, true), true);
    assert.equal(inspection.cleanupEligible, false);
    assert.equal(inspection.reason, "pending_or_unknown");
  }
});

test("the runner rejects a pre-aborted command before spawning and kills a detached descendant after timeout", async () => {
  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(defaultRunner("definitely-not-a-command", [], { signal: preAborted.signal }), /command_cancelled/u);

  const root = await mkdtemp(join(tmpdir(), "nemlig-production-runner-"));
  const pidPath = join(root, "descendant.pid");
  const script = [
    "const { spawn } = require('node:child_process');",
    "const { writeFileSync } = require('node:fs');",
    "const child = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000)\"], { stdio: 'ignore' });",
    "writeFileSync(process.argv[1], String(child.pid));",
    "setInterval(() => {}, 1_000);",
  ].join(" ");
  try {
    await assert.rejects(defaultRunner(process.execPath, ["-e", script, pidPath], { timeoutMs: 2_000 }), /command_cancelled/u);
    const descendant = Number(await readFile(pidPath, "utf8"));
    const status = await execFileAsync("ps", ["-o", "stat=", "-p", String(descendant)]).then(({ stdout }) => stdout.trim(), () => "");
    assert.ok(status === "" || status.startsWith("Z"), `descendant remains running: ${status}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("command diagnostics preserve only a provider status or numeric code", () => {
  assert.equal(commandFailureDiagnostic("Request failed with HTTP 409 and private details"), "command_http_status=409");
  assert.equal(commandFailureDiagnostic("API error code: 10007 with private details"), "command_provider_error_code=10007");
  assert.equal(commandFailureDiagnostic("private detail without a recognized code"), undefined);
});

test("cancellation after remote intent retains the lease and suppresses rollback and later mutations", async () => {
  const { deps, calls, root } = await fixture();
  const controller = new AbortController();
  const baseRun = deps.run;
  deps.signal = controller.signal;
  deps.run = async (command, args, options) => {
    if (command === "pnpm" && args.includes("deploy") && args.includes("MCP_ENABLED:true")) {
      controller.abort();
      if (options?.signal?.aborted) throw new Error("cancelled");
      return await new Promise<string>((_resolvePromise, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
    }
    return await baseRun(command, args, options);
  };
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.lastVerifiedState, "unknown");
    assert.equal(calls.some(({ args }) => args.includes("MCP_ENABLED:true") || args.includes("rollback")), false);
    await access(join(root, "nemlig-production-deploy.lock"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deadline after accepted upload retains ownership even if the provider returns late success", async () => {
  const { deps, calls, root } = await fixture();
  const run = deps.run;
  deps.operationDeadlineMs = 500;
  deps.run = async (command, args, options) => {
    const output = await run(command, args, options);
    if (args.includes("deploy") && args.includes("MCP_ENABLED:true")) {
      await new Promise<void>((resolvePromise) => {
        if (options?.signal?.aborted) resolvePromise();
        else options?.signal?.addEventListener("abort", () => resolvePromise(), { once: true });
      });
    }
    return output;
  };
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.lastVerifiedState, "unknown");
    assert.equal(calls.filter(({ args }) => args.includes("deploy")).length, 1);
    assert.equal(calls.some(({ args }) => args.includes("rollback") || args.includes("DELETE")), false);
    await access(join(root, "nemlig-production-deploy.lock"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a bounded operation deadline aborts an in-flight command and suppresses later commands", async () => {
  const { deps, calls, root } = await fixture();
  const baseRun = deps.run;
  deps.operationDeadlineMs = 1;
  deps.run = async (command, args, options) => {
    if (command === "gh" && args[0] === "repo") {
      return await new Promise<string>((_resolvePromise, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new Error("deadline")), { once: true });
      });
    }
    return await baseRun(command, args, options);
  };
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(calls.some(({ args }) => args.includes("wrangler")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service deployment never reads owner credentials and issues one token before provider mutation", async () => {
  const { deps, calls, root } = await fixture();
  let issues = 0;
  const serviceEnv: NodeJS.ProcessEnv = { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: "test-cloudflare-token", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client", NEMLIG_MCP_SERVICE_CLIENT_SECRET: "machine-secret", NEMLIG_CI_ACCEPTANCE_READY: "true" };
  Object.defineProperty(serviceEnv, "NEMLIG_MCP_ACCESS_TOKEN", { enumerable: true, get() { throw new Error("owner credential read"); } });
  deps.env = serviceEnv;
  deps.acceptanceMode = "service";
  deps.issueServiceToken = async () => { issues += 1; assert.equal(calls.some(({ args }) => args.includes("deploy")), false); return "machine-token"; };
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    assert.equal(issues, 1);
    assert.ok(report.checks.includes("service_fixture_acceptance"));
    assert.equal(report.checks.includes("authenticated_read_only_acceptance"), false);
    const acceptance = calls.find(({ args }) => args.includes("--service") && !args.includes("--initialize-only"));
    assert.ok(acceptance);
    assert.deepEqual(acceptance.args, ["production:test:features", "--service"]);
    assert.equal(acceptance.env?.NEMLIG_MCP_SERVICE_ACCESS_TOKEN, "machine-token");
    const wake = calls.find(({ args }) => args.includes("--wake-only"));
    const initialization = calls.find(({ args }) => args.includes("--initialize-only") && !args.includes("--wake-only"));
    assert.deepEqual(wake?.args, ["production:test:features", "--service", "--initialize-only", "--wake-only"]);
    assert.deepEqual(initialization?.args, ["production:test:features", "--service", "--initialize-only"]);
    assert.equal(wake?.env?.NEMLIG_MCP_SERVICE_ACCESS_TOKEN, "machine-token");
    assert.equal(initialization?.env?.NEMLIG_MCP_SERVICE_ACCESS_TOKEN, "machine-token");
    for (const call of calls) {
      assert.equal(call.env?.NEMLIG_MCP_ACCESS_TOKEN, undefined);
      assert.equal(call.env?.NEMLIG_MCP_SERVICE_CLIENT_SECRET, undefined);
      if (call !== acceptance && call !== wake && call !== initialization) assert.equal(call.env?.NEMLIG_MCP_SERVICE_ACCESS_TOKEN, undefined);
    }
    assert.doesNotMatch(JSON.stringify(report), /machine-token|machine-secret/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("routine deployment accepts a legacy short starting revision and upgrades to the exact candidate SHA", async () => {
  const { deps, calls, root } = await fixture({
    versionBindings: (values, id) => id === startingId
      ? values.map((value) => value.name === "NEMLIG_MCP_REVISION" ? { ...value, text: commit.slice(0, 7) } : value)
      : values,
  });
  deps.acceptanceMode = "service";
  deps.env.NEMLIG_CI_ACCEPTANCE_READY = "true";
  deps.env.NEMLIG_MCP_SERVICE_CLIENT_ID = "service-client";
  deps.issueServiceToken = async () => "machine-token";
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success", JSON.stringify(report));
    assert.ok(calls.some(({ args }) => args.includes("MCP_ENABLED:true") && args.includes(`NEMLIG_MCP_REVISION:${commit}`)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CI never falls back to owner authentication or issues a service token before source verification", async () => {
  for (const badSource of [false, true]) {
    const { deps, calls, root } = await fixture(badSource ? { head: previousCommit } : {});
    deps.env = { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: "test-cloudflare-token", GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "1", GITHUB_RUN_ATTEMPT: "1", NEMLIG_MCP_ACCESS_TOKEN: "owner-token" };
    let issued = false;
    deps.issueServiceToken = async () => { issued = true; throw new Error("must not issue"); };
    try {
      const report = await deployProduction(commit, deps);
      assert.equal(report.outcome, "failed");
      assert.equal(report.failure, badSource ? "source_revision_mismatch" : "service_acceptance_not_ready");
      assert.equal(issued, false);
      assert.equal(calls.some(({ command }) => command === "pnpm"), false);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("routine service releases do not require historical cutover state", async () => {
  const { deps, calls, root } = await fixture();
  deps.env = { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: "test-cloudflare-token", NEMLIG_CI_ACCEPTANCE_READY: "true", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client" };
  deps.acceptanceMode = "service";
  let issued = false;
  deps.issueServiceToken = async () => { issued = true; return "machine-token"; };
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    assert.equal(issued, true);
    assert.equal(calls.some(({ command }) => command === "pnpm"), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("routine service releases keep the public routes enabled during the Container rollout", async () => {
  const { deps, calls, root } = await fixture();
  deps.env = { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: "test-cloudflare-token", NEMLIG_CI_ACCEPTANCE_READY: "true", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client" };
  deps.acceptanceMode = "service";
  deps.issueServiceToken = async () => "machine-token";
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    const deploys = calls.filter(({ args }) => args.includes("deploy"));
    assert.equal(deploys.length, 1);
    assert.ok(deploys[0]?.args.includes("MCP_ENABLED:true"));
    assert.deepEqual(deploys[0]?.args.slice(deploys[0]?.args.indexOf("--containers-rollout"), deploys[0]?.args.indexOf("--containers-rollout") + 2), ["--containers-rollout", "immediate"]);
    assert.equal(calls.some(({ args }) => args.includes("MCP_ENABLED:false")), false);
    assert.deepEqual(report.transitions.map(({ phase, kind }) => `${phase}:${kind}`), [
      "enable_deploy:intent", "enable_deploy:result",
    ]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("recovery service releases can deploy a green main ancestor without cutover state", async () => {
  const { deps, root } = await fixture({ remoteMain: "b".repeat(40) });
  deps.env = { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: "test-cloudflare-token", NEMLIG_CI_ACCEPTANCE_READY: "true", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client" };
  deps.acceptanceMode = "recovery";
  deps.issueServiceToken = async () => "machine-token";
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    assert.equal(report.deliveryMode, "recovery");
    assert.ok(report.checks.includes("recovery_source"));
    assert.equal(report.checks.includes("service_fixture_acceptance"), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a routine acceptance failure restores the exact prior Container configuration and Worker before the final lease record", async () => {
  const { deps, calls, root } = await fixture({ failCandidateFeatures: true });
  const fetch = deps.fetcher;
  let rolloutBody: unknown;
  deps.fetcher = async (input, init) => {
    if (String(input).endsWith("/rollouts") && init?.method === "POST") rolloutBody = JSON.parse(String(init.body));
    return await fetch(input, init);
  };
  deps.env = { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: "test-cloudflare-token", NEMLIG_CI_ACCEPTANCE_READY: "true", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client" };
  deps.acceptanceMode = "service";
  deps.issueServiceToken = async () => "machine-token";
  await mkdir(join(root, "release"));
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.lastVerifiedState, "restored");
    assert.equal(report.rollback, "restored");
    assert.equal(report.checks.includes("starting_version_restored"), true);
    const deploys = calls.filter(({ args }) => args.includes("deploy"));
    assert.equal(deploys.length, 1);
    assert.ok(deploys[0]?.args.includes("MCP_ENABLED:true"));
    assert.equal(deploys.some(({ args }) => args.includes("MCP_ENABLED:false")), false);
    assert.ok(calls.some(({ command, args }) => command === "pnpm" && args.includes("rollback") && args.includes(startingId)));
    assert.deepEqual(rolloutBody, {
      description: `Restore known accepted release after ${commit.slice(0, 7)} acceptance failure`,
      kind: "full_auto",
      step_percentage: 100,
      strategy: "rolling",
      target_configuration: {
        image: `registry.cloudflare.com/${accountId}/nemlig-mcp-cloudflare-production-nemligmcpcontainer-production@${image}`,
        instance_type: "lite",
        observability: { logs: { enabled: false } },
      },
    });
    assert.deepEqual(report.transitions.map(({ phase, kind }) => `${phase}:${kind}`), [
      "enable_deploy:intent", "enable_deploy:result",
      "container_restore:intent", "container_restore:result", "worker_restore:intent", "worker_restore:result",
    ]);
    assert.equal(await finalizeDeploymentRecovery(report.operationId, deps, true, true), true);
    assert.equal(report.outcome, "failed", "restoring a prior release does not turn the candidate into an accepted release");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a restored Worker whose own read-only acceptance fails stays enabled but cannot finalize the lease", async () => {
  const { deps, root } = await fixture({ failFeatures: true });
  deps.env = { ...deps.env, NEMLIG_CI_ACCEPTANCE_READY: "true", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client" };
  deps.acceptanceMode = "service";
  deps.issueServiceToken = async () => "machine-token";
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.lastVerifiedState, "restored");
    assert.equal(report.checks.includes("starting_version_restored"), false);
    assert.equal(await finalizeDeploymentRecovery(report.operationId, deps, true, true), false);
    await access(join(root, "nemlig-production-deploy.lock"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("an uncertain Container restore request is never retried or followed by speculative Worker rollback", async () => {
  const { deps, calls, root } = await fixture({ failCandidateFeatures: true });
  const fetch = deps.fetcher;
  let rolloutRequests = 0;
  deps.fetcher = async (input, init) => {
    if (String(input).endsWith("/rollouts") && init?.method === "POST") {
      rolloutRequests += 1;
      throw new Error("connection closed after request");
    }
    return await fetch(input, init);
  };
  deps.env = { ...deps.env, NEMLIG_CI_ACCEPTANCE_READY: "true", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client" };
  deps.acceptanceMode = "service";
  deps.issueServiceToken = async () => "machine-token";
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.lastVerifiedState, "unknown");
    assert.equal(report.rollback, "failed");
    assert.equal(report.recoveryFailure, "cloudflare_container_restore_uncertain");
    assert.equal(rolloutRequests, 1);
    assert.equal(calls.some(({ command, args }) => command === "pnpm" && args.includes("rollback") && args.includes(startingId)), false);
    assert.equal(calls.some(({ command, args }) => command === "gh" && args.includes("DELETE")), false);
    await access(join(root, "nemlig-production-deploy.lock"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a routine Container restore failure never disables the Worker or releases the recovery lease", async () => {
  const { deps, calls, root } = await fixture({ failCandidateFeatures: true });
  const fetch = deps.fetcher;
  let rolloutRequests = 0;
  deps.fetcher = async (input, init) => {
    if (String(input).endsWith("/rollouts") && init?.method === "POST") {
      rolloutRequests += 1;
      return Response.json({ success: false, errors: [{ code: 1000, message: "restore rejected" }] }, { status: 500 });
    }
    return await fetch(input, init);
  };
  deps.env = { ...deps.env, NEMLIG_CI_ACCEPTANCE_READY: "true", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client" };
  deps.acceptanceMode = "service";
  deps.issueServiceToken = async () => "machine-token";
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.lastVerifiedState, "unknown");
    assert.equal(report.rollback, "failed");
    assert.equal(report.recoveryFailure, "cloudflare_container_restore_uncertain");
    assert.equal(rolloutRequests, 1);
    const deploys = calls.filter(({ args }) => args.includes("deploy"));
    assert.equal(deploys.length, 1);
    assert.ok(deploys[0]?.args.includes("MCP_ENABLED:true"));
    assert.equal(deploys.some(({ args }) => args.includes("MCP_ENABLED:false")), false);
    assert.equal(calls.some(({ command, args }) => command === "pnpm" && args.includes("rollback")), false);
    assert.equal(calls.some(({ command, args }) => command === "gh" && args.includes("DELETE")), false);
    await access(join(root, "nemlig-production-deploy.lock"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
