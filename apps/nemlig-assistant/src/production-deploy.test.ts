import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  deployProduction,
  instancesInactive,
  parseContainer,
  parseDeployCli,
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
const image = "registry.cloudflare.test/nemlig@sha256:abc";

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

interface Call {
  command: string;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
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
  disabledResponse?: string;
  disabledFetchFails?: boolean;
  driftBeforeEnable?: boolean;
  failDisabledDeploy?: boolean;
  failFeatures?: boolean;
  externalEnabledDriftDuringRecovery?: boolean;
} = {}): Promise<{ deps: DeployDependencies; calls: Call[]; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "nemlig-production-deploy-"));
  const calls: Call[] = [];
  let current = startingId;
  let remoteLease = false;
  const journalSha = "cccccccccccccccccccccccccccccccccccccccc";
  let disabledReads = 0;
  let remoteReads = 0;
  const run: CommandRunner = async (commandName, args, runOptions) => {
    calls.push({ command: commandName, args: [...args], env: runOptions?.env });
    if (commandName === "gh" && args[0] === "repo") {
      return JSON.stringify({ nameWithOwner: options.repository ?? "mortenbroesby/everyday-assistants", url: `https://github.com/${options.repository ?? "mortenbroesby/everyday-assistants"}` });
    }
    if (commandName === "gh" && args[0] === "workflow") {
      return JSON.stringify([{ id: options.workflowId ?? 123, name: "CI", path: options.workflowPath ?? ".github/workflows/ci.yml", state: "active" }]);
    }
    if (commandName === "gh" && args[0] === "run") {
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
    if (commandName === "gh" && args[0] === "api" && args.some((arg) => arg.includes("git/blobs"))) return JSON.stringify({ sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
    if (commandName === "gh" && args[0] === "api" && args.some((arg) => arg.includes("git/trees"))) return JSON.stringify({ sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" });
    if (commandName === "gh" && args[0] === "api" && args.some((arg) => arg.includes("git/commits"))) return JSON.stringify({ sha: journalSha });
    if (commandName === "gh" && args[0] === "api" && args.includes("POST")) {
      if (options.remoteLeaseBlocked) throw new Error("exists");
      remoteLease = true;
      return "{}";
    }
    if (commandName === "gh" && args[0] === "api" && args.includes("PATCH")) return "{}";
    if (commandName === "gh" && args[0] === "api" && args.includes("DELETE")) {
      remoteLease = false;
      return "";
    }
    if (commandName === "gh" && args[0] === "api") return remoteLease ? (options.remoteLeaseChanges ? previousCommit : journalSha) : "";
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

test("only the exact trusted main CI provenance may reach Wrangler", async () => {
  const rejected = [
    { repository: "owner/repository" },
    { workflowPath: ".github/workflows/other.yml" },
    { run: { workflowDatabaseId: 999 } },
    { run: { workflowName: "Other" } },
    { run: { headBranch: "feature" } },
    { run: { event: "pull_request" } },
    { run: { headSha: previousCommit } },
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
    const journal = await readFile(join(root, "nemlig-production-deploy", "latest.json"), "utf8");
    assert.deepEqual(JSON.parse(journal), report);
    assert.doesNotMatch(journal, /owner-token|authorization|cookie|basket|favorite|saved-list/iu);
    await access(join(root, "nemlig-production-deploy.lock"));
  } finally {
    await rm(root, { recursive: true, force: true });
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
