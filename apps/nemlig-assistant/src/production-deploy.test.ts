import assert from 'node:assert/strict';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  deployProduction,
  instancesInactive,
  parseContainer,
  parseCurrentDeployment,
  parseDeployArgs,
  parseVersionState,
  preflightProductionDeploy,
  productionDeployUsage,
  verifyCandidateVersion,
  type CommandRunner,
  type DeployDependencies,
} from '../scripts/production-deploy.js';

const commit = '7bdf94cbea0a1c3c63a5b64c97fbb05ad3b71b73';
const previousCommit = '2c952d20999b8ac47f7b060be97f2f84445defcb';
const startingId = '958ad415-2395-40c1-8baf-b394dafce67f';
const enabledId = '22222222-2222-4222-8222-222222222222';
const applicationId = 'a03ce8c9-3543-4505-866e-14d2e66007ca';
const image =
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const candidateImage =
  'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const accountId = '0123456789abcdef0123456789abcdef';

const version = (id: string, revision: string, enabled: boolean) =>
  JSON.stringify({
    id,
    resources: {
      script_runtime: {
        limits: { cpu_ms: 100, subrequests: 8 },
        containers: [
          { class_name: 'NemligMcpContainer', name: 'nemlig-production' },
        ],
      },
      bindings: [
        ...[
          ['MCP_AUTH_TIMEOUT_MS', '5000'],
          ['MCP_BACKEND_TIMEOUT_MS', '85000'],
          ['MCP_CREDENTIAL_ONBOARDING_ENABLED', 'false'],
          ['MCP_CONTROL_TIMEOUT_MS', '3000'],
          ['MCP_ENABLED', String(enabled)],
          ['MCP_TOTAL_TIMEOUT_MS', '90000'],
          ['NEMLIG_MCP_CREDENTIAL_KEY_VERSION', 'one'],
          ['NEMLIG_MCP_AUTH0_AUDIENCE', 'https://nemlig-mcp.broesby.dk/mcp'],
          [
            'NEMLIG_MCP_AUTH0_ISSUER',
            'https://everyday-assistants.eu.auth0.com/',
          ],
          ['NEMLIG_MCP_HTTP_HOST', '0.0.0.0'],
          ['NEMLIG_MCP_HTTP_PORT', '8080'],
          ['NEMLIG_MCP_PUBLIC_URL', 'https://nemlig-mcp.broesby.dk/mcp'],
          ['NEMLIG_MCP_REVISION', revision],
          ['NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED', 'true'],
          ['NEMLIG_MCP_SERVICE_CLIENT_ID', 'service-client'],
        ].map(([name, text]) => ({ name, text, type: 'plain_text' })),
        {
          name: 'NEMLIG_MCP_CONTAINER',
          type: 'durable_object_namespace',
          class_name: 'NemligMcpContainer',
        },
        {
          name: 'NEMLIG_PLAN_STORAGE',
          type: 'durable_object_namespace',
          class_name: 'PlanStorage',
        },
        { name: 'NEMLIG_MCP_PRINCIPALS', type: 'secret_text' },
      ],
    },
  });

const deployment = (id: string) =>
  JSON.stringify([
    {
      id: `deployment-${id}`,
      created_on: '2026-09-05T12:00:00Z',
      versions: [{ version_id: id, percentage: 100 }],
    },
  ]);

const config = (path: string) => ({
  configPath: path,
  userConfigPath: path,
  name: 'nemlig-mcp-cloudflare-production',
  keep_vars: false,
  limits: { cpu_ms: 100, subrequests: 8 },
  vars: {
    MCP_ENABLED: 'false',
    MCP_AUTH_TIMEOUT_MS: '5000',
    MCP_CONTROL_TIMEOUT_MS: '3000',
    MCP_TOTAL_TIMEOUT_MS: '90000',
    MCP_BACKEND_TIMEOUT_MS: '85000',
    MCP_CREDENTIAL_ONBOARDING_ENABLED: 'false',
    NEMLIG_MCP_CREDENTIAL_KEY_VERSION: 'one',
    NEMLIG_MCP_HTTP_HOST: '0.0.0.0',
    NEMLIG_MCP_HTTP_PORT: '8080',
    NEMLIG_MCP_AUTH0_ISSUER: 'https://everyday-assistants.eu.auth0.com/',
    NEMLIG_MCP_AUTH0_AUDIENCE: 'https://nemlig-mcp.broesby.dk/mcp',
    NEMLIG_MCP_PUBLIC_URL: 'https://nemlig-mcp.broesby.dk/mcp',
    NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED: 'true',
    NEMLIG_MCP_SERVICE_CLIENT_ID: 'service-client',
  },
  containers: [
    {
      class_name: 'NemligMcpContainer',
      instance_type: 'lite',
      max_instances: 1,
      constraints: { jurisdiction: 'eu' },
    },
  ],
  durable_objects: {
    bindings: [
      { name: 'NEMLIG_MCP_CONTAINER', class_name: 'NemligMcpContainer' },
      { name: 'NEMLIG_PLAN_STORAGE', class_name: 'PlanStorage' },
    ],
  },
});

interface Call {
  command: string;
  args: readonly string[];
}

async function fixture(
  options: {
    failFeatures?: boolean;
    failFeatureAttempts?: number;
    advanceMainBeforeDeploy?: boolean;
  } = {},
): Promise<{ deps: DeployDependencies; calls: Call[]; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'nemlig-production-deploy-'));
  await writeFile(join(root, 'wrangler.jsonc'), '{}', 'utf8');
  const calls: Call[] = [];
  let current = startingId;
  let applicationVersion = 25;
  let originMain = commit;
  let fetchCount = 0;
  let featureFailuresRemaining = options.failFeatureAttempts ?? 0;
  const run: CommandRunner = async (command, args, runOptions) => {
    calls.push({ command, args: [...args] });
    if (command === 'gh' && args[0] === 'repo') {
      return JSON.stringify({
        nameWithOwner: 'mortenbroesby/everyday-assistants',
        url: 'https://github.com/mortenbroesby/everyday-assistants',
      });
    }
    if (command === 'gh' && args[0] === 'workflow') {
      return JSON.stringify([
        {
          id: 123,
          name: 'CI',
          path: '.github/workflows/ci.yml',
          state: 'active',
        },
      ]);
    }
    if (command === 'gh' && args[0] === 'run' && args[1] === 'view') {
      return JSON.stringify({
        jobs: [{ name: 'verify', status: 'completed', conclusion: 'success' }],
      });
    }
    if (command === 'gh' && args[0] === 'run') {
      return JSON.stringify([
        {
          databaseId: 456,
          workflowDatabaseId: 123,
          workflowName: 'CI',
          headSha: commit,
          headBranch: 'main',
          event: 'push',
          status: 'completed',
          conclusion: 'success',
        },
      ]);
    }
    if (command === 'gh' && args[0] === 'api') {
      const path = args.find((value) => value.startsWith('repos/')) ?? '';
      if (path.endsWith('environments/nemlig-production')) {
        return JSON.stringify({
          can_admins_bypass: false,
          deployment_branch_policy: {
            protected_branches: false,
            custom_branch_policies: true,
          },
          protection_rules: [{ type: 'branch_policy' }],
        });
      }
      if (path.endsWith('deployment-branch-policies')) {
        return JSON.stringify({
          branch_policies: [{ name: 'main', type: 'branch' }],
        });
      }
      throw new Error('unexpected GitHub API request');
    }
    if (command === 'gh') {
      return '';
    }
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
      return commit;
    }
    if (
      command === 'git' &&
      args[0] === 'rev-parse' &&
      args[1] === 'origin/main'
    ) {
      return originMain;
    }
    if (command === 'git' && args[0] === 'status') {
      return '';
    }
    if (command === 'git' && args[0] === 'merge-base') {
      return '';
    }
    if (command === 'git' && args.includes('fetch')) {
      fetchCount += 1;
      if (options.advanceMainBeforeDeploy && fetchCount > 1) {
        originMain = previousCommit;
      }
      return '';
    }
    if (command === 'git') {
      return '';
    }
    if (command === 'docker') {
      return JSON.stringify({ Descriptor: { digest: candidateImage } });
    }
    if (command !== 'pnpm') {
      throw new Error(`unexpected command: ${command}`);
    }
    if (args.includes('deployments') && args.includes('list')) {
      return deployment(current);
    }
    if (args.includes('versions') && args.includes('view')) {
      const id = args[args.indexOf('view') + 1]!;
      return version(
        id,
        id === startingId ? previousCommit : commit,
        id !== startingId,
      );
    }
    if (args.includes('containers') && args.includes('list')) {
      return JSON.stringify([
        {
          id: applicationId,
          name: 'nemlig-mcp-cloudflare-production-nemligmcpcontainer-production',
          instances: 1,
          image,
          version: 25,
        },
      ]);
    }
    if (args.includes('containers') && args.includes('info')) {
      return JSON.stringify({
        id: applicationId,
        name: 'nemlig-mcp-cloudflare-production-nemligmcpcontainer-production',
        instances: 1,
        configuration: {
          image: current === startingId ? image : candidateImage,
        },
        version: applicationVersion,
      });
    }
    if (args.includes('containers') && args.includes('instances')) {
      return JSON.stringify([
        {
          id: 'instance',
          name: 'nemlig-production',
          state: 'running',
          version: applicationVersion,
        },
      ]);
    }
    if (args.includes('deploy') && args.includes('MCP_ENABLED:true')) {
      current = enabledId;
      applicationVersion = 26;
      return `Current Version ID: ${enabledId}`;
    }
    if (args[0] === 'production:probe') {
      return 'edge ok';
    }
    if (args[0] === 'production:test:features') {
      if (featureFailuresRemaining > 0 && !args.includes('--initialize-only')) {
        featureFailuresRemaining -= 1;
        const acceptanceReport = JSON.stringify({
          schema: 1,
          profile: 'service',
          failureCategory: 'feature_failed',
          failed: ['service_resource_inventory_mismatch'],
          lastCompletedBoundary:
            'service_resource_inventory_read_missing_18_unexpected_1',
          correlationIds: [],
        });
        const failure = new Error('candidate acceptance failed') as Error & {
          acceptanceFailure?: unknown;
        };
        failure.acceptanceFailure =
          runOptions?.captureFailureStdout?.(acceptanceReport);
        throw failure;
      }
      if (options.failFeatures && !args.includes('--initialize-only')) {
        throw new Error('candidate acceptance failed');
      }
      return 'features ok';
    }
    throw new Error(`unexpected pnpm args: ${args.join(' ')}`);
  };
  return {
    root,
    calls,
    deps: {
      repoRoot: root,
      packageRoot: root,
      env: {
        CLOUDFLARE_ACCOUNT_ID: accountId,
        CLOUDFLARE_API_TOKEN: 'test-cloudflare-token',
      },
      run,
      fetcher: async () =>
        Response.json({
          success: true,
          result: {
            id: applicationId,
            scheduling_policy: 'default',
            configuration: {
              image: `registry.cloudflare.com/${accountId}/nemlig-mcp-cloudflare-production-nemligmcpcontainer-production@${image}`,
            },
            version: 25,
          },
        }),
      sleep: async () => undefined,
      configReader: async () => config(join(root, 'wrangler.jsonc')),
      now: () => new Date('2026-09-05T12:00:00Z'),
      issueServiceToken: async () => 'machine-token',
    },
  };
}

test('deployment input and provider metadata fail closed', () => {
  assert.equal(parseDeployArgs([commit]), commit);
  assert.equal(parseDeployArgs(['--', commit]), commit);
  assert.match(productionDeployUsage, /40-character-main-commit/u);
  for (const args of [[], ['main'], [commit.slice(0, 7)], [commit, commit]]) {
    assert.throws(() => parseDeployArgs(args));
  }
  assert.equal(
    parseCurrentDeployment(deployment(startingId)).version,
    startingId,
  );
  assert.throws(() => parseCurrentDeployment('[]'));
  assert.equal(
    parseContainer(
      JSON.stringify([
        {
          id: applicationId,
          name: 'nemlig-mcp-cloudflare-production-nemligmcpcontainer-production',
          instances: 1,
          image,
          version: 25,
        },
      ]),
    ).version,
    25,
  );
  assert.throws(() => parseContainer('[]'));
  assert.equal(
    instancesInactive(
      JSON.stringify([
        {
          id: 'durable-object',
          name: 'nemlig-production',
          state: 'inactive',
          version: null,
        },
      ]),
    ),
    true,
  );
  assert.equal(
    parseVersionState(version(enabledId, commit.slice(0, 7), true), enabledId)
      .revision,
    commit.slice(0, 7),
  );
  assert.equal(
    verifyCandidateVersion(
      version(enabledId, commit, true),
      enabledId,
      commit,
      true,
    ).enabled,
    true,
  );
  assert.throws(() =>
    verifyCandidateVersion(
      version(enabledId, commit, false),
      enabledId,
      commit,
      true,
    ),
  );
});

test('preflight proves exact main CI and protected environment without Git ref writes', async () => {
  const { deps, calls, root } = await fixture();
  try {
    assert.deepEqual(await preflightProductionDeploy(commit, deps), {
      state: 'ready',
      commit,
      ciRunId: 456,
    });
    assert.equal(
      calls.some(({ args }) =>
        args.some(
          (value) =>
            value === 'POST' || value === 'PATCH' || value === 'DELETE',
        ),
      ),
      false,
    );
    assert.equal(
      calls.some(({ command }) => command === 'pnpm'),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('service deployment verifies the exact candidate without persistent deployment state', async () => {
  const { deps, calls, root } = await fixture();
  try {
    deps.acceptanceMode = 'service';
    deps.env = {
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: 'test-cloudflare-token',
      GITHUB_ACTIONS: 'true',
      NEMLIG_MCP_SERVICE_CLIENT_ID: 'service-client',
      NEMLIG_MCP_SERVICE_CLIENT_SECRET: 'machine-secret',
      NEMLIG_CI_ACCEPTANCE_READY: 'true',
    };
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, 'success');
    assert.equal(report.enabledVersion, enabledId);
    assert.ok(report.checks.includes('read_only_acceptance'));
    assert.equal(
      calls.some(({ args }) => args.includes('rollback')),
      false,
    );
    await assert.rejects(
      access(join(root, '.git', 'nemlig-production-deploy')),
    );
    await assert.rejects(
      access(join(root, '.git', 'nemlig-production-deploy.lock')),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('failed acceptance fails the run and does not start a rollback', async () => {
  const { deps, calls, root } = await fixture({ failFeatures: true });
  try {
    deps.acceptanceMode = 'service';
    deps.env = {
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: 'test-cloudflare-token',
      GITHUB_ACTIONS: 'true',
      NEMLIG_MCP_SERVICE_CLIENT_ID: 'service-client',
      NEMLIG_MCP_SERVICE_CLIENT_SECRET: 'machine-secret',
      NEMLIG_CI_ACCEPTANCE_READY: 'true',
    };
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, 'failed');
    assert.equal(report.failure, 'service_fixture_acceptance_failed');
    assert.equal(
      calls.some(({ args }) => args.includes('rollback')),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('acceptance retry exhaustion emits one bounded final diagnostic with attempts and boundary', async () => {
  const { deps, calls, root } = await fixture({ failFeatureAttempts: 12 });
  const diagnostics: string[] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => diagnostics.push(values.join(' '));
  try {
    deps.acceptanceMode = 'service';
    deps.env = {
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: 'test-cloudflare-token',
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'workflow_run',
      NEMLIG_MCP_SERVICE_CLIENT_ID: 'service-client',
      NEMLIG_MCP_SERVICE_CLIENT_SECRET: 'machine-secret',
      NEMLIG_CI_ACCEPTANCE_READY: 'true',
    };
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, 'failed');
    assert.equal(report.failure, 'service_fixture_acceptance_failed');
    assert.equal(
      report.acceptanceFailure?.failureCode,
      'service_resource_inventory_mismatch',
    );
    assert.equal(
      report.acceptanceFailure?.lastCompletedBoundary,
      'service_resource_inventory_read_missing_18_unexpected_1',
    );
    assert.equal(diagnostics.length, 1);
    assert.match(
      diagnostics[0]!,
      /acceptance_final_failure_code=service_resource_inventory_mismatch attempts=12 last_completed_boundary=service_resource_inventory_read_missing_18_unexpected_1/u,
    );
    assert.doesNotMatch(diagnostics[0]!, /private\.example|secret|token=/u);
    assert.equal(
      calls.filter(
        ({ args }) =>
          args[0] === 'production:test:features' &&
          !args.includes('--initialize-only'),
      ).length,
      12,
    );
  } finally {
    console.error = originalError;
    await rm(root, { recursive: true, force: true });
  }
});

test('acceptance succeeds after a retry without emitting a failure diagnostic', async () => {
  const { deps, calls, root } = await fixture({ failFeatureAttempts: 1 });
  const diagnostics: string[] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => diagnostics.push(values.join(' '));
  try {
    deps.acceptanceMode = 'service';
    deps.env = {
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: 'test-cloudflare-token',
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'workflow_run',
      NEMLIG_MCP_SERVICE_CLIENT_ID: 'service-client',
      NEMLIG_MCP_SERVICE_CLIENT_SECRET: 'machine-secret',
      NEMLIG_CI_ACCEPTANCE_READY: 'true',
    };
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, 'success');
    assert.equal(diagnostics.length, 0);
    assert.equal(
      calls.filter(
        ({ args }) =>
          args[0] === 'production:test:features' &&
          !args.includes('--initialize-only'),
      ).length,
      2,
    );
  } finally {
    console.error = originalError;
    await rm(root, { recursive: true, force: true });
  }
});

test('automatic workflow-run release rechecks current main before provider mutation', async () => {
  const { deps, calls, root } = await fixture({
    advanceMainBeforeDeploy: true,
  });
  try {
    deps.acceptanceMode = 'service';
    deps.env = {
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: 'test-cloudflare-token',
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'workflow_run',
      NEMLIG_MCP_SERVICE_CLIENT_ID: 'service-client',
      NEMLIG_MCP_SERVICE_CLIENT_SECRET: 'machine-secret',
      NEMLIG_CI_ACCEPTANCE_READY: 'true',
    };
    const report = await deployProduction(commit, deps);
    assert.equal(report.outcome, 'failed');
    assert.equal(report.failure, 'source_revision_mismatch');
    assert.equal(
      calls.some(
        ({ command, args }) =>
          command === 'pnpm' &&
          args[0] === 'exec' &&
          args[1] === 'wrangler' &&
          args[2] === 'deploy',
      ),
      false,
    );
    assert.equal(
      calls.filter(
        ({ command, args }) => command === 'git' && args.includes('fetch'),
      ).length,
      2,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
