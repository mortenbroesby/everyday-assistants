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
      { name: "NEMLIG_USERNAME", type: "secret_text" },
      { name: "NEMLIG_PASSWORD", type: "secret_text" },
      { name: "NEMLIG_MCP_AUTH0_OWNER_SUBJECT", type: "secret_text" },
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
  remoteLeaseBlocked?: boolean;
  remoteLeaseChanges?: boolean;
  disabledResponse?: string;
  disabledFetchFails?: boolean;
  driftBeforeEnable?: boolean;
  failDisabledDeploy?: boolean;
  failFeatures?: boolean;
} = {}): Promise<{ deps: DeployDependencies; calls: Call[]; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "nemlig-production-deploy-"));
  const calls: Call[] = [];
  let current = startingId;
  let remoteLease = false;
  let disabledReads = 0;
  const run: CommandRunner = async (commandName, args, runOptions) => {
    calls.push({ command: commandName, args: [...args], env: runOptions?.env });
    if (commandName === "gh" && args[0] === "repo") {
      return JSON.stringify({ nameWithOwner: "owner/repository", url: "https://github.com/owner/repository" });
    }
    if (commandName === "gh" && args[0] === "run") {
      return JSON.stringify([{ headSha: commit, status: "completed", conclusion: "success", url: "https://example.test/ci" }]);
    }
    if (commandName === "gh" && args[0] === "api" && args.includes("POST")) {
      if (options.remoteLeaseBlocked) throw new Error("exists");
      remoteLease = true;
      return "";
    }
    if (commandName === "gh" && args[0] === "api" && args.includes("DELETE")) {
      remoteLease = false;
      return "";
    }
    if (commandName === "gh" && args[0] === "api") return remoteLease ? (options.remoteLeaseChanges ? previousCommit : commit) : "";
    if (commandName === "gh") return "";
    if (commandName === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return options.head ?? commit;
    if (commandName === "git" && args[0] === "rev-parse" && args[1] === "origin/main") return commit;
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
      if (current === disabledId) disabledReads += 1;
      return deployment(options.driftBeforeEnable && disabledReads >= 2 ? startingId : current);
    }
    if (args.includes("versions") && args.includes("view")) {
      const id = args[args.indexOf("view") + 1];
      if (id === startingId) return version(id, previousCommit, true);
      if (id === disabledId) return version(id, commit, false);
      if (id === enabledId) return version(id, commit, true);
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
    await assert.rejects(access(join(root, "nemlig-production-deploy.lock")));
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

test("changed remote lease is never deleted and leaves the local safety stop", async () => {
  const { deps, calls, root } = await fixture({ remoteLeaseChanges: true });
  try {
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, "failed");
    assert.equal(report.failure, "remote_deployment_lease_release_failed");
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
