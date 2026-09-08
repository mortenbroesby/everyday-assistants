import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
      ["MCP_CONTROL_TIMEOUT_MS", "3000"],
      ["MCP_DAILY_LIMIT", "5000"],
      ["MCP_ENABLED", String(enabled)],
      ["MCP_EXPENSIVE_DAILY_LIMIT", "500"],
      ["MCP_EXPENSIVE_RATE_LIMIT", "10"],
      ["MCP_RATE_LIMIT", "60"],
      ["MCP_TOTAL_TIMEOUT_MS", "90000"],
      ["NEMLIG_MCP_REVISION", revision],
      ].map(([name, text]) => ({ name, text, type: "plain_text" })),
      { name: "NEMLIG_MCP_CONTAINER", type: "durable_object_namespace" },
      { name: "NEMLIG_PLAN_STORAGE", type: "durable_object_namespace" },
      { name: "NEMLIG_MCP_PRINCIPALS", type: "secret_text" },
    ],
  },
});

const deployment = (id: string) => JSON.stringify([{
  id: `deployment-${id}`,
  created_on: "2026-09-05T12:00:00Z",
  versions: [{ version_id: id, percentage: 100 }],
}]);

const recoveryDeps = (journal: Record<string, unknown>, currentVersion: string, currentEnabled: boolean): DeployDependencies => {
  const remoteCommit = "cccccccccccccccccccccccccccccccccccccccc";
  const tree = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const blob = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const encoded = Buffer.from(JSON.stringify(journal)).toString("base64");
  const run: CommandRunner = async (command, args) => {
    if (command === "pnpm" && args.includes("deployments")) return deployment(currentVersion);
    if (command === "pnpm" && args.includes("versions")) return version(currentVersion, commit, currentEnabled);
    if (command === "pnpm" && args.includes("containers")) return JSON.stringify([{
      id: applicationId, name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production", instances: 1, image,
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
  startingVersion: startingId, startingContainerId: applicationId, startingImage: image, checks: [], rollback: "restored",
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

interface SharedLeaseStore { ref?: string }

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
  externalEnabledDriftDuringRecovery?: boolean;
  remoteIntentFailure?: boolean;
  sharedLease?: SharedLeaseStore;
} = {}): Promise<{ deps: DeployDependencies; calls: Call[]; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "nemlig-production-deploy-"));
  const calls: Call[] = [];
  let current = startingId;
  let appended = false;
  let remoteLease: string | undefined = options.sharedLease?.ref;
  const currentLease = () => options.sharedLease?.ref ?? remoteLease;
  const setRemoteLease = (value: string | undefined) => { remoteLease = value; if (options.sharedLease) options.sharedLease.ref = value; };
  let objectNumber = 0;
  const blobs = new Map<string, string>();
  const trees = new Map<string, string>();
  const commits = new Map<string, { tree: string; parents: string[] }>();
  const nextSha = () => (++objectNumber).toString(16).padStart(40, "0");
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
      if (path.endsWith("git/ref/heads/codex-lock/nemlig-production") || path.endsWith("git/refs/heads/codex-lock/nemlig-production")) {
        if (method === "GET") {
          if (!currentLease()) throw Object.assign(new Error("not found"), { status: 404 });
          return currentLease()!;
        }
        if (method === "DELETE") { setRemoteLease(undefined); return ""; }
      }
      if (path.endsWith("git/blobs") && method === "POST") {
        const snapshot = Buffer.from(String(body?.content), "base64").toString("utf8");
        if (options.remoteIntentFailure && JSON.parse(snapshot).transitions.length % 2 === 1) throw new Error("intent write failed");
        const sha = nextSha(); blobs.set(sha, snapshot); return JSON.stringify({ sha });
      }
      if (path.endsWith("git/trees") && method === "POST") { const sha = nextSha(); trees.set(sha, String((body?.tree as Array<Record<string, unknown>>)?.[0]?.sha)); return JSON.stringify({ sha }); }
      if (path.endsWith("git/commits") && method === "POST") { const sha = nextSha(); commits.set(sha, { tree: String(body?.tree), parents: Array.isArray(body?.parents) ? body.parents.map(String) : [] }); return JSON.stringify({ sha }); }
      if (path.endsWith("git/refs") && method === "POST") {
        if (options.remoteLeaseBlocked || currentLease()) throw new Error("exists");
        setRemoteLease(String(body?.sha)); return "{}";
      }
      if (path.endsWith("git/refs/heads/codex-lock/nemlig-production") && method === "PATCH") {
        if (!body || body.force !== false || !currentLease()) throw new Error("invalid patch");
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
    if (args[0] === "production:probe") return "edge ok";
    if (args[0] === "production:test:features") {
      if (options.failFeatures) throw new Error("acceptance failed");
      return "features ok";
    }
    if (!args.includes("wrangler")) throw new Error("unexpected pnpm command");
    if (args.includes("deployments") && args.includes("list")) {
      if (options.externalEnabledDriftDuringRecovery && options.failFeatures && current === enabledId) return deployment(thirdPartyId);
      if (current === disabledId) disabledReads += 1;
      return deployment(options.driftBeforeEnable && disabledReads >= 2 ? startingId : current);
    }
    if (args.includes("versions") && args.includes("view")) {
      const id = args[args.indexOf("view") + 1];
      if (id === startingId) return version(id, previousCommit, true);
      if (id === disabledId) return version(id, commit, false);
      if (id === enabledId) return version(id, commit, true);
      if (id === thirdPartyId) return version(id, previousCommit, true);
    }
    if (args.includes("containers") && args.includes("list")) return JSON.stringify([{
      id: applicationId,
      name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production",
      instances: 1,
      image,
    }]);
    if (args.includes("containers") && args.includes("instances")) return JSON.stringify([{
      id: "instance",
      name: "nemlig-production",
      state: "inactive",
    }]);
    if (args.includes("rollback")) {
      current = startingId;
      return "rolled back";
    }
    if (args.includes("deploy") && args.includes("MCP_ENABLED:true")) {
      current = enabledId;
      return `Current Version ID: ${enabledId}`;
    }
    if (args.includes("deploy")) {
      if (options.failDisabledDeploy) throw new Error("timed out");
      current = disabledId;
      return `Current Version ID: ${disabledId}`;
    }
    if (args.includes("whoami")) return "authenticated";
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
  }])).image, image);
  assert.throws(() => parseContainer("[]"));
  assert.equal(instancesInactive(JSON.stringify([{ state: "inactive" }])), true);
  assert.equal(instancesInactive(JSON.stringify([{ state: "running" }])), false);
  assert.equal(verifyCandidateVersion(version(enabledId, commit, true), enabledId, commit, true).enabled, true);
  assert.throws(() => verifyCandidateVersion(version(enabledId, commit, false), enabledId, commit, true));
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
  assert.throws(() => parseDeploymentJournal(JSON.stringify({ ...journal, checks: ["x".repeat(9000)] })));
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

test("successful deployment finalizes from its stateful remote journal chain", async () => {
  const { deps, calls, root } = await fixture();
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "success");
    assert.equal(await finalizeDeploymentRecovery(report.operationId, deps, true), true);
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
    startingVersion: startingId, enabledVersion: enabledId, startingContainerId: applicationId, enabledImage: image, checks: [], lastVerifiedState: "enabled",
    rollback: "not_needed", outcome: "success", remoteCommit: "dddddddddddddddddddddddddddddddddddddddd",
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
    if (command === "pnpm" && args.includes("containers")) return JSON.stringify([{
      id: applicationId, name: "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production", instances: 1, image: currentImage,
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
    }, true), false);
    assert.equal(head, remoteCommit, "image drift retains the remote lease");
    currentImage = image;
    assert.equal(await finalizeDeploymentRecovery(operation, {
      repoRoot: root, packageRoot: root, stateRoot: root, env: {}, run, fetcher: fetch,
      sleep: async () => undefined, now: () => new Date(),
    }, true), true);
    assert.equal(head, "");
    await assert.rejects(access(join(root, "nemlig-production-deploy.lock")));
    assert.equal(calls.filter(({ args }) => args.includes("DELETE")).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recovery commands reject forged arguments before I/O", () => {
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

test("inspection accepts either enabled or disabled restored starting state only with stopped-runner attestation", async () => {
  for (const enabled of [true, false]) {
    const inspected = await inspectDeploymentRecovery("44444444-4444-4444-8444-444444444444", recoveryDeps(terminalJournal(), startingId, enabled), true);
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
    rollback: "not_needed", lastVerifiedState: "disabled", disabledVersion: disabledId, disabledImage: image,
    transitions: [
      { phase: "disabled_deploy", kind: "intent", at: "2026-09-05T12:00:00.000Z", version: startingId },
      { phase: "disabled_deploy", kind: "result", at: "2026-09-05T12:00:01.000Z", version: disabledId },
    ],
  });
  assert.deepEqual(await inspectDeploymentRecovery(operation, recoveryDeps(disabled, disabledId, false), true), {
    operation, originalRunnerStopped: true, cleanupEligible: true, reason: "eligible", state: "disabled",
  });
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
