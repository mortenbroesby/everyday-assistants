import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  deployProduction,
  defaultRunner,
  finalizeDeploymentRecovery,
  inspectDeploymentRecovery,
  instancesInactive,
  parseContainer,
  parseDeployCli,
  parseProductionDeployCli,
  parseCurrentDeployment,
  parseDeployArgs,
  parseDeploymentJournal,
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
const configDigest = "c84479ec8eb4749a359bb2e3ea00853233987d202a116d16a24ec3f5152a0c0c";
const execFileAsync = promisify(execFile);

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
      ["MCP_CREDENTIAL_GLOBAL_RATE_LIMIT", "10"],
      ["MCP_CREDENTIAL_ONBOARDING_ENABLED", "false"],
      ["MCP_CREDENTIAL_RATE_LIMIT", "3"],
      ["MCP_CONTROL_TIMEOUT_MS", "3000"],
      ["MCP_DAILY_LIMIT", "5000"],
      ["MCP_ENABLED", String(enabled)],
      ["MCP_EXPENSIVE_DAILY_LIMIT", "500"],
      ["MCP_EXPENSIVE_RATE_LIMIT", "10"],
      ["MCP_RATE_LIMIT", "60"],
      ["MCP_TOTAL_TIMEOUT_MS", "90000"],
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
  configPath: path, userConfigPath: path, name: "nemlig-mcp-cloudflare-production", keep_vars: true,
  limits: { cpu_ms: 100, subrequests: 8 },
  vars: {
    MCP_ENABLED: "false", MCP_DAILY_LIMIT: "5000", MCP_EXPENSIVE_DAILY_LIMIT: "500", MCP_RATE_LIMIT: "60", MCP_EXPENSIVE_RATE_LIMIT: "10",
    MCP_AUTH_TIMEOUT_MS: "5000", MCP_CONTROL_TIMEOUT_MS: "3000", MCP_TOTAL_TIMEOUT_MS: "90000", MCP_BACKEND_TIMEOUT_MS: "85000",
    MCP_CREDENTIAL_ONBOARDING_ENABLED: "false", MCP_CREDENTIAL_RATE_LIMIT: "3", MCP_CREDENTIAL_GLOBAL_RATE_LIMIT: "10",
    NEMLIG_MCP_HTTP_HOST: "0.0.0.0", NEMLIG_MCP_HTTP_PORT: "8080", NEMLIG_MCP_AUTH0_ISSUER: "https://everyday-assistants.eu.auth0.com/",
    NEMLIG_MCP_AUTH0_AUDIENCE: "https://nemlig-mcp.broesby.dk/mcp", NEMLIG_MCP_PUBLIC_URL: "https://nemlig-mcp.broesby.dk/mcp",
    NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED: "true", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client",
  },
  containers: [{ class_name: "NemligMcpContainer", instance_type: "lite", max_instances: 1, constraints: { jurisdiction: "eu" } }],
  durable_objects: { bindings: [{ name: "NEMLIG_MCP_CONTAINER", class_name: "NemligMcpContainer" }, { name: "NEMLIG_PLAN_STORAGE", class_name: "PlanStorage" }] },
});

const recoveryDeps = (journal: Record<string, unknown>, currentVersion: string, currentEnabled: boolean): DeployDependencies => {
  const remoteCommit = "cccccccccccccccccccccccccccccccccccccccc";
  const tree = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const blob = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const encoded = Buffer.from(JSON.stringify(journal)).toString("base64");
  const run: CommandRunner = async (command, args) => {
    if (command === "pnpm" && args.includes("deployments")) return deployment(currentVersion);
    if (command === "pnpm" && args.includes("versions")) return version(currentVersion, commit, currentEnabled);
    if (command === "pnpm" && args.includes("instances")) return JSON.stringify([{ id: "durable-object", name: "nemlig-production", state: "inactive", version: null }]);
    if (command === "pnpm" && args.includes("containers")) return JSON.stringify([{
      id: applicationId, name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production", instances: 1, image, version: 25,
    }]);
    if (command !== "gh") throw new Error("unexpected command");
    if (args[0] === "repo") return JSON.stringify({ nameWithOwner: "mortenbroesby/everyday-assistants", url: "https://github.com/mortenbroesby/everyday-assistants" });
    const path = args.find((value) => value.startsWith("repos/")) ?? "";
    if (path.includes("git/ref/")) return remoteCommit;
    if (path.includes("git/commits/")) return JSON.stringify({ tree: { sha: tree } });
    if (path.includes("git/trees/")) return JSON.stringify({ tree: [{ path: "journal.json", type: "blob", mode: "100644", sha: blob }] });
    if (path.includes("git/blobs/")) return JSON.stringify({ encoding: "base64", content: encoded });
    throw new Error("unexpected gh api");
  };
  return { repoRoot: ".", packageRoot: ".", env: {}, run, fetcher: fetch, sleep: async () => undefined, now: () => new Date() };
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
  failProbeOnce?: boolean;
  failCurrentRead?: boolean;
  externalEnabledDriftDuringRecovery?: boolean;
  enableApplicationVersionDrift?: boolean;
  candidateApplicationVersion?: number;
  disabledApplicationIdDrift?: boolean;
  restoredInstanceRows?: unknown[];
  rollbackApplicationVersionDrift?: boolean;
  enabledInstanceRows?: unknown[][];
  postProofWorkerDrift?: boolean;
  postProofApplicationVersionDrift?: boolean;
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
  let rolledBack = false;
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
        protection_rules: [{ type: "required_reviewers", prevent_self_review: false, reviewers: [{ type: "User", reviewer: { login: "mortenbroesby" } }] }, { type: "branch_policy" }],
      });
      if (path.endsWith("environments/nemlig-production/deployment-branch-policies")) return JSON.stringify({ branch_policies: [{ name: "main", type: "branch" }] });
      if (path.endsWith("environments/nemlig-production/variables")) return JSON.stringify({ variables: [{ name: "NEMLIG_CI_ACCEPTANCE_READY", value: "true" }] });
      if (path.endsWith("git/ref/heads/codex-lock/nemlig-production") || path.endsWith("git/refs/heads/codex-lock/nemlig-production")) {
        if (method === "GET") {
          if (!currentLease()) throw Object.assign(new Error("not found"), { status: 404 });
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
      if (commitSha) return JSON.stringify({ tree: { sha: commits.get(commitSha)?.tree } });
      const treeSha = path.match(/git\/trees\/([0-9a-f]{40})$/u)?.[1];
      if (treeSha) return JSON.stringify({ tree: [{ path: "journal.json", type: "blob", mode: "100644", sha: trees.get(treeSha) }] });
      const blobSha = path.match(/git\/blobs\/([0-9a-f]{40})$/u)?.[1];
      if (blobSha) return JSON.stringify({ encoding: "base64", content: Buffer.from(blobs.get(blobSha) ?? "").toString("base64") });
      throw new Error("unexpected gh api");
    }
    if (commandName === "gh") return "";
    if (commandName === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return options.head ?? commit;
    if (commandName === "git" && args[0] === "rev-parse" && args[1] === "origin/main") {
      remoteReads += 1;
      return options.remoteAfterPreflight && remoteReads > 1 ? previousCommit : commit;
    }
    if (commandName === "git" && args[0] === "status") return "";
    if (commandName === "git") return "";
    if (commandName !== "pnpm") throw new Error("unexpected command");
    if (args[0] === "production:probe") {
      probeReads += 1;
      if (options.failProbeOnce && probeReads === 1) throw new Error("edge not converged");
      return "edge ok";
    }
    if (args[0] === "production:test:features") {
      if (options.failFeatures) throw new Error("acceptance failed");
      if (options.localFinalMirrorFailure) {
        await rm(join(root, "nemlig-production-deploy", "latest.json"));
        await mkdir(join(root, "nemlig-production-deploy", "latest.json"));
      }
      return "features ok";
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
        const parsed = JSON.parse(version(id, id === startingId || id === thirdPartyId ? previousCommit : commit, id !== disabledId)) as { resources: { bindings: Record<string, unknown>[] } };
        if (options.versionBindings) parsed.resources.bindings = options.versionBindings(parsed.resources.bindings, id);
        return JSON.stringify(parsed);
      }
    }
    if (args.includes("containers") && args.includes("list")) return JSON.stringify([{
      id: options.disabledApplicationIdDrift && current === disabledId ? thirdPartyId : applicationId,
      name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production",
      instances: 1,
      image,
      version: options.postProofApplicationVersionDrift && enabledInstanceReads > 0 ? 26 : applicationVersion,
    }]);
    if (args.includes("containers") && args.includes("instances")) {
      if (rolledBack && options.restoredInstanceRows) return JSON.stringify(options.restoredInstanceRows);
      if (current === enabledId) {
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
      current = startingId;
      rolledBack = true;
      if (options.rollbackApplicationVersionDrift) applicationVersion = 26;
      return "rolled back";
    }
    if (args.includes("deploy") && args.includes("MCP_ENABLED:true")) {
      current = enabledId;
      if (options.enableApplicationVersionDrift) applicationVersion = 26;
      return `Current Version ID: ${enabledId}`;
    }
    if (args.includes("deploy")) {
      if (options.failDisabledDeploy) throw new Error("timed out");
      current = disabledId;
      applicationVersion = options.candidateApplicationVersion ?? applicationVersion;
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
      env: { NEMLIG_MCP_ACCESS_TOKEN: "owner-token" },
      run,
      fetcher: async () => {
        if (options.disabledFetchFails) throw new Error("offline");
        return new Response(options.disabledResponse ?? "MCP temporarily disabled", { status: 503 });
      },
      sleep: async () => undefined,
      configReader: options.configReader ?? (async () => config(join(root, "wrangler.jsonc"))),
      now: () => new Date("2026-09-05T12:00:00Z"),
    },
  };
}

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
  assert.equal(verifyCandidateVersion(version(enabledId, commit, true), enabledId, commit, true).enabled, true);
  assert.throws(() => verifyCandidateVersion(version(enabledId, commit, false), enabledId, commit, true));
});

test("preflight requires the exact protected production environment before any provider action", async () => {
  const { deps, calls, root } = await fixture();
  try {
    assert.deepEqual(await preflightProductionDeploy(commit, deps), { commit, ciRunId: 456 });
    assert.equal(calls.some(({ command }) => command === "pnpm"), false);
    assert.ok(calls.some(({ args }) => args.some((value) => value.endsWith("/environments/nemlig-production"))));
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
  for (const field of ["startingApplicationVersion", "disabledApplicationVersion", "enabledApplicationVersion"]) {
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "25", null]) assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, [field]: value })));
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
  assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, transitions: [{ phase: "enable_deploy", kind: "intent", at: journal.startedAt }] })));
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

test("successful deployment builds once, reuses the image, and journals only redacted state", async () => {
  const { deps, calls, root } = await fixture();
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    assert.equal(report.lastVerifiedState, "enabled");
    assert.deepEqual([report.startingVersion, report.disabledVersion, report.enabledVersion], [startingId, disabledId, enabledId]);
    const deploys = calls.filter(({ args }) => args.includes("deploy"));
    assert.equal(deploys.length, 2);
    assert.equal(deploys[0].args.includes("--containers-rollout"), false);
    const rollout = deploys[1].args.indexOf("--containers-rollout");
    assert.deepEqual(deploys[1].args.slice(rollout, rollout + 2), ["--containers-rollout", "none"]);
    assert.equal(calls.some(({ args }) => args[0] === "production:test:features"), true);
    assert.doesNotMatch(JSON.stringify(calls.map(({ command, args }) => ({ command, args }))), /add_approved|remove_approved|make_approved|empty_approved/u);
    const ref = calls.findIndex(({ command, args }) => command === "gh" && args.includes("POST") && args.some((arg) => arg.endsWith("git/refs")));
    const firstProviderRead = calls.findIndex(({ command, args }) => command === "pnpm" && args.includes("wrangler"));
    assert.ok(ref >= 0 && ref < firstProviderRead, "remote lease must exist before provider access");
    const remoteSnapshots = calls.filter(({ command, args }) => command === "gh" && args.some((arg) => arg.endsWith("git/blobs")))
      .map(({ input }) => JSON.parse(Buffer.from(JSON.parse(input ?? "{}").content, "base64").toString("utf8")) as { operationId: string; releaseRunId: number | "local"; releaseRunAttempt: number | "local"; transitions: Array<{ phase: string; kind: string }> });
    assert.ok(remoteSnapshots.length >= 5);
    assert.match(remoteSnapshots[0]?.operationId ?? "", /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
    assert.deepEqual([remoteSnapshots[0]?.releaseRunId, remoteSnapshots[0]?.releaseRunAttempt], ["local", "local"]);
    assert.deepEqual(remoteSnapshots.at(-2)?.transitions.map(({ phase, kind }) => `${phase}:${kind}`), [
      "disabled_deploy:intent", "disabled_deploy:result", "enable_deploy:intent", "enable_deploy:result",
    ]);
    const journal = await readFile(join(root, "nemlig-production-deploy", "latest.json"), "utf8");
    assert.deepEqual(JSON.parse(journal), report);
    assert.doesNotMatch(journal, /owner-token|authorization|cookie|basket|favorite|saved-list/iu);
    await access(join(root, "nemlig-production-deploy.lock"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
    assert.equal(snapshots.find((snapshot) => snapshot.transitions.length === 2)!.disabledApplicationVersion, 26);
    assert.equal(snapshots.find((snapshot) => snapshot.transitions.length === 4)!.enabledApplicationVersion, 26);
    const local = parseDeploymentJournal(await readFile(join(root, "nemlig-production-deploy", "latest.json"), "utf8"));
    for (const snapshot of [report, local, snapshots.at(-1)!]) {
      assert.equal(snapshot.startingApplicationVersion, 25);
      assert.equal(snapshot.disabledApplicationVersion, 26);
      assert.equal(snapshot.enabledApplicationVersion, 26);
      assert.equal(snapshot.startingConfigDigest, configDigest);
      assert.equal(JSON.stringify(snapshot).includes("MCP_CREDENTIAL_ONBOARDING_ENABLED"), false);
      assert.equal(JSON.stringify(snapshot).includes("owner-token"), false);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("disabled application identity drift never reaches enablement", async () => {
  const { deps, calls, root } = await fixture({ disabledApplicationIdDrift: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "cloudflare_deployment_drift");
    assert.equal(calls.some(({ args }) => args.includes("MCP_ENABLED:true")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
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

test("live onboarding survives the repository false default and both deployment readbacks", async () => {
  const { deps, calls, root } = await fixture({ versionBindings: (values) => values.map((value) =>
    value.name === "MCP_CREDENTIAL_ONBOARDING_ENABLED" ? { ...value, text: "true" } : value) });
  try {
    assert.equal((await deployProduction(commit, deps)).outcome, "success");
    const deploys = calls.filter(({ args }) => args.includes("deploy"));
    assert.equal(deploys.length, 2);
    for (const { args } of deploys) {
      assert.ok(args.includes("MCP_CREDENTIAL_ONBOARDING_ENABLED:true"));
      assert.equal(args.includes("MCP_CREDENTIAL_ONBOARDING_ENABLED:false"), false);
      for (const [name, value] of Object.entries(config("").vars)) {
        if (name !== "MCP_ENABLED" && name !== "MCP_CREDENTIAL_ONBOARDING_ENABLED") assert.ok(args.includes(`${name}:${value}`));
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
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

test("malformed bindings and starting safety or DO drift stop before deployment", async () => {
  const transforms: Array<(values: Record<string, unknown>[]) => Record<string, unknown>[]> = [
    (values) => [...values, { ...values[0] }],
    (values) => [...values, {}],
    (values) => values.map((value) => value.name === "MCP_RATE_LIMIT" ? { ...value, type: "json" } : value),
    (values) => values.map((value) => value.name === "MCP_RATE_LIMIT" ? { ...value, text: "61" } : value),
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
          if (mutation === "safety" && value.name === "MCP_CREDENTIAL_RATE_LIMIT") return { ...value, text: "4" };
          if (mutation === "do" && value.name === "NEMLIG_MCP_CONTAINER") return { ...value, class_name: "Wrong" };
          if (mutation === "wrong-type" && value.name === "legacy_secret") return { ...value, type: "plain_text", text: "wrong" };
          return value;
        });
      } });
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
      if (field === "keep_vars") return { ...local, keep_vars: false };
      if (field === "limits") return { ...local, limits: { cpu_ms: 200, subrequests: 8 } };
      return { ...local, vars: { ...local.vars, MCP_CREDENTIAL_RATE_LIMIT: "4" } };
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
      name: "test-local", compatibility_date: "2026-08-31", keep_vars: true,
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
    ["MCP_CREDENTIAL_RATE_LIMIT", "0"], ["MCP_CREDENTIAL_GLOBAL_RATE_LIMIT", "9007199254740992"],
    ["MCP_CREDENTIAL_ONBOARDING_ENABLED", "yes"], ["NEMLIG_MCP_HTTP_PORT", "65536"],
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

test("enabled acceptance waits for one matching running Container instance", async () => {
  const { deps, calls, root } = await fixture();
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    assert.equal(calls.filter(({ args }) => args.includes("containers") && args.includes("instances")).length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("enabled acceptance converges from provisioning and an older running Container application version", async () => {
  const { deps, calls, root } = await fixture({ enabledInstanceRows: [
    [{ id: "instance", name: "nemlig-production", state: "provisioning", version: null }],
    [{ id: "instance", name: "nemlig-production", state: "running", version: 24 }],
    [{ id: "instance", name: "nemlig-production", state: "running", version: 25 }],
  ] });
  try {
    assert.equal((await deployProduction(commit, deps)).outcome, "success");
    assert.equal(calls.filter(({ args }) => args.includes("containers") && args.includes("instances")).length, 4);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("enabled acceptance rejects malformed, wrong, or ambiguous Container instance rows", async () => {
  for (const enabledInstanceRows of [
    [["not-an-instance"]],
    [[{ id: "instance", name: "other", state: "running", version: 25 }]],
    [[{ id: "one", name: "nemlig-production", state: "running", version: 25 }, { id: "two", name: "nemlig-production", state: "running", version: 25 }]],
    [[{ id: "instance", name: "nemlig-production", state: "failed", version: 25 }]],
    [[{ id: "instance", name: "nemlig-production", state: "stopping", version: 25 }]],
    [[{ id: "instance", name: "nemlig-production", state: "stopped", version: 25 }]],
    [[{ id: "instance", name: "nemlig-production", state: "unhealthy", version: 25 }]],
    [[{ id: "instance", name: "nemlig-production", state: "unknown", version: 25 }]],
  ]) {
    const { deps, root } = await fixture({ enabledInstanceRows });
    try {
      assert.equal((await deployProduction(commit, deps)).outcome, "failed");
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("enabled acceptance bounds Container instance convergence at 36 reads", async () => {
  const { deps, calls, root } = await fixture({ enabledInstanceRows: [[{
    id: "instance", name: "nemlig-production", state: "provisioning", version: null,
  }]] });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "container_instance_timeout");
    // One disabled read, 36 convergence reads, one rollback proof read.
    assert.equal(calls.filter(({ args }) => args.includes("containers") && args.includes("instances")).length, 38);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a newer running Container application version is immediate deployment drift", async () => {
  const { deps, calls, root } = await fixture({ enabledInstanceRows: [[{
    id: "instance", name: "nemlig-production", state: "running", version: 26,
  }]] });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "cloudflare_deployment_drift");
    assert.equal(calls.filter(({ args }) => args.includes("containers") && args.includes("instances")).length, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("cancelling Container instance convergence stops further reads", async () => {
  const { deps, calls, root } = await fixture({ enabledInstanceRows: [[{
    id: "instance", name: "nemlig-production", state: "provisioning", version: null,
  }]] });
  const controller = new AbortController();
  deps.signal = controller.signal;
  deps.sleep = async () => controller.abort();
  try {
    assert.equal((await deployProduction(commit, deps)).outcome, "failed");
    assert.equal(calls.filter(({ args }) => args.includes("containers") && args.includes("instances")).length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("post-instance Worker or Container application drift rejects enabled acceptance", async () => {
  for (const options of [{ postProofWorkerDrift: true }, { postProofApplicationVersionDrift: true }]) {
    const { deps, root } = await fixture(options);
    try {
      assert.equal((await deployProduction(commit, deps)).outcome, "failed");
    } finally { await rm(root, { recursive: true, force: true }); }
  }
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
    try {
      const report = await deployProduction(commit, deps);
      assert.equal(report.outcome, "failed");
      assert.equal(calls.some(({ args }) => args.includes("MCP_ENABLED:true")), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("enablement rejects a changed Container application version despite the same image", async () => {
  const { deps, root } = await fixture({ enableApplicationVersionDrift: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.lastVerifiedState, "unknown");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("incomplete disabled evidence remains unknown, while completed disabled proof survives a later safe failure", async () => {
  for (const options of [{ disabledResponse: "wrong" }, { disabledFetchFails: true }]) {
    const { deps, root } = await fixture(options);
    try {
      assert.equal((await deployProduction(commit, deps)).lastVerifiedState, "unknown");
    } finally { await rm(root, { recursive: true, force: true }); }
  }
  const { deps, root } = await fixture({ remoteEnableIntentFailure: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.lastVerifiedState, "disabled");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("enabled acceptance failure restores and verifies the exact starting version", async () => {
  const { deps, calls, root } = await fixture({ failFeatures: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.rollback, "restored");
    assert.equal(report.lastVerifiedState, "restored");
    const rollbackCall = calls.find(({ args }) => args.includes("rollback"));
    assert.ok(rollbackCall?.args.includes(startingId));
    assert.equal(calls.filter(({ args }) => args[0] === "production:probe").length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rollback with a changed Container application version is not reported restored", async () => {
  const { deps, root } = await fixture({ failFeatures: true, rollbackApplicationVersionDrift: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.notEqual(report.lastVerifiedState, "restored");
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
  const first = await fixture({ sharedLease, failDisabledDeploy: true });
  const second = await fixture({ sharedLease });
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

test("ambiguous deploy failure retains both leases and reports unknown state", async () => {
  const { deps, calls, root } = await fixture({ failDisabledDeploy: true });
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
    if (command === "pnpm" && args.includes("containers")) return JSON.stringify([{
      id: applicationId, name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production", instances: 1, image: currentImage,
      version: 25,
    }]);
    if (command !== "gh") throw new Error("unexpected command");
    if (args[0] === "repo") return JSON.stringify({ nameWithOwner: "mortenbroesby/everyday-assistants", url: "https://github.com/mortenbroesby/everyday-assistants" });
    if (args.includes("DELETE")) { head = ""; return ""; }
    const path = args.find((value) => value.startsWith("repos/")) ?? "";
    if (path.includes("git/ref/")) return head;
    if (path.includes("git/commits/")) return JSON.stringify({ tree: { sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } });
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
  assert.throws(() => parseProductionDeployCli(["finalize", operation, "--evidence-saved"]));
  assert.deepEqual(parseProductionDeployCli(["inspect-recovery", "44444444-4444-4444-8444-444444444444"]), {
    help: false, command: "inspect-recovery", operation: "44444444-4444-4444-8444-444444444444", originalRunnerStopped: false,
  });
  for (const argv of [["finalize", "44444444-4444-4444-8444-444444444444"], ["finalize", commit, "--evidence-saved"], ["inspect-recovery", commit]]) {
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
      if (drift === "config" && args.includes("versions")) return raw.replace('"text":"3"', '"text":"4"');
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

test("rollback cannot claim restoration with changed configuration or a stale running instance", async () => {
  for (const mode of ["config", "instance"]) {
    let startingReads = 0;
    const { deps, root } = await fixture({ failFeatures: true,
      ...(mode === "instance" ? { restoredInstanceRows: [{ id: "instance", name: "nemlig-production", state: "running", version: 24 }] } : {}),
      versionBindings: (values, id) => {
        if (id === startingId && ++startingReads > 1 && mode === "config") return values.map((value) => value.name === "MCP_CREDENTIAL_RATE_LIMIT" ? { ...value, text: "4" } : value);
        return values;
      },
    });
    try {
      const report = await deployProduction(commit, deps);
      assert.equal(report.lastVerifiedState, "unknown");
      assert.notEqual(report.rollback, "restored");
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("failure recovery rechecks earlier disabled or starting configuration before claiming known state", async () => {
  for (const target of [disabledId, startingId]) {
    let reads = 0;
    const { deps, root } = await fixture({
      ...(target === disabledId ? { remoteEnableIntentFailure: true } : { driftBeforeEnable: true }),
      versionBindings: (values, id) => id === target && ++reads > 1
        ? values.map((value) => value.name === "MCP_CREDENTIAL_RATE_LIMIT" ? { ...value, text: "4" } : value) : values,
    });
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

test("incomplete or contradictory terminal journals never become cleanup-eligible", async () => {
  const operation = "44444444-4444-4444-8444-444444444444";
  for (const journal of [
    terminalJournal({ completedAt: undefined }),
    terminalJournal({ checks: [] }),
    terminalJournal({ lastVerifiedState: "enabled" }),
    terminalJournal({ transitions: [...terminalJournal().transitions.slice(0, -1), { phase: "rollback", kind: "result", at: "2026-09-05T12:00:05.000Z", version: enabledId }] }),
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
    await assert.rejects(defaultRunner(process.execPath, ["-e", script, pidPath], { timeoutMs: 500 }), /command_cancelled/u);
    const descendant = Number(await readFile(pidPath, "utf8"));
    const status = await execFileAsync("ps", ["-o", "stat=", "-p", String(descendant)]).then(({ stdout }) => stdout.trim(), () => "");
    assert.ok(status === "" || status.startsWith("Z"), `descendant remains running: ${status}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cancellation after remote intent retains the lease and suppresses rollback and later mutations", async () => {
  const { deps, calls, root } = await fixture();
  const controller = new AbortController();
  const baseRun = deps.run;
  deps.signal = controller.signal;
  deps.run = async (command, args, options) => {
    if (command === "pnpm" && args.includes("deploy") && args.includes("MCP_ENABLED:false")) {
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
    if (args.includes("deploy") && args.includes("MCP_ENABLED:false")) {
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
  await mkdir(join(root, "release"));
  await writeFile(join(root, "release", "production-cutover.json"), JSON.stringify({ schema: 1, acceptedRevision: previousCommit }));
  let issues = 0;
  const serviceEnv: NodeJS.ProcessEnv = { NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client", NEMLIG_MCP_SERVICE_CLIENT_SECRET: "machine-secret", NEMLIG_CI_ACCEPTANCE_READY: "true" };
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
    const acceptance = calls.find(({ args }) => args.includes("--service"));
    assert.ok(acceptance);
    assert.equal(acceptance.env?.NEMLIG_MCP_SERVICE_ACCESS_TOKEN, "machine-token");
    for (const call of calls) {
      assert.equal(call.env?.NEMLIG_MCP_ACCESS_TOKEN, undefined);
      assert.equal(call.env?.NEMLIG_MCP_SERVICE_CLIENT_SECRET, undefined);
      if (call !== acceptance) assert.equal(call.env?.NEMLIG_MCP_SERVICE_ACCESS_TOKEN, undefined);
    }
    assert.doesNotMatch(JSON.stringify(report), /machine-token|machine-secret/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CI never falls back to owner authentication or issues a service token before source verification", async () => {
  for (const badSource of [false, true]) {
    const { deps, calls, root } = await fixture(badSource ? { head: previousCommit } : {});
    deps.env = { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "1", GITHUB_RUN_ATTEMPT: "1", NEMLIG_MCP_ACCESS_TOKEN: "owner-token" };
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

test("routine service releases require recorded cutover and reject unreviewed runtime changes", async () => {
  for (const change of ["missing", "apps/nemlig-assistant/src/http.ts", "unknown/config.json"]) {
    const { deps, calls, root } = await fixture();
    deps.env = { NEMLIG_CI_ACCEPTANCE_READY: "true" };
    deps.acceptanceMode = "service";
    await mkdir(join(root, "release"));
    await writeFile(join(root, "release", "production-cutover.json"), JSON.stringify({ schema: 1, acceptedRevision: change === "missing" ? null : previousCommit }));
    const run = deps.run;
    deps.run = (command, args, options) => command === "git" && args[0] === "diff" ? Promise.resolve(change + "\0") : run(command, args, options);
    let issued = false;
    deps.issueServiceToken = async () => { issued = true; return "machine-token"; };
    try {
      const report = await deployProduction(commit, deps);
      assert.equal(report.outcome, "failed");
      assert.equal(report.failure, change === "missing" ? "service_cutover_required" : "live_acceptance_required");
      assert.equal(issued, false);
      assert.equal(calls.some(({ command }) => command === "pnpm"), false);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("supervised service cutover reports pending live acceptance and retains recovery ownership", async () => {
  const { deps, root } = await fixture();
  deps.env = { NEMLIG_CI_ACCEPTANCE_READY: "true", NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client" };
  deps.acceptanceMode = "service-cutover";
  deps.issueServiceToken = async () => "service-token";
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    assert.ok(report.checks.includes("live_acceptance_pending"));
    assert.equal(await finalizeDeploymentRecovery(report.operationId, deps, true, true), false);
    await mkdir(join(root, "release"));
    await writeFile(join(root, "release", "production-cutover.json"), JSON.stringify({ schema: 1, acceptedRevision: commit }));
    assert.equal(await finalizeDeploymentRecovery(report.operationId, deps, true, true), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
