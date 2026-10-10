import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FIXED_CONTAINER_NAME,
  loadGatewayConfig,
  type CloudflareEnv,
} from "./cloudflare-config.js";

const validEnv: CloudflareEnv = {
  MCP_ENABLED: "true",
  MCP_AUTH_TIMEOUT_MS: "5000",
  MCP_CONTROL_TIMEOUT_MS: "3000",
  MCP_TOTAL_TIMEOUT_MS: "90000",
  MCP_BACKEND_TIMEOUT_MS: "85000",
  NEMLIG_MCP_AUTH0_ISSUER: "https://tenant.example.test",
  NEMLIG_MCP_AUTH0_AUDIENCE: "https://mcp.example.test/mcp",
  NEMLIG_MCP_PRINCIPALS: JSON.stringify({
    schema_version: 3,
    revision: "family-v3",
    owner_subject: "auth0|owner",
    principals: [
      { subject: "auth0|owner", principal_key: "a".repeat(32), enabled: true },
    ],
  }),
  NEMLIG_MCP_PUBLIC_URL: "https://mcp.example.test/mcp",
  NEMLIG_MCP_CREDENTIAL_KEY: Buffer.alloc(32, 1).toString("base64url"),
  NEMLIG_MCP_CREDENTIAL_KEY_VERSION: "one",
};

interface WranglerDeployment {
  keep_vars?: boolean;
  observability: { enabled: boolean; head_sampling_rate: number };
  vars: Record<string, string>;
  containers: Array<{
    max_instances: number;
    instance_type: string;
    constraints: { jurisdiction: string };
  }>;
  durable_objects: { bindings: unknown[] };
  migrations: Array<{
    tag: string;
    new_sqlite_classes?: string[];
    deleted_classes?: string[];
  }>;
}

test("Cloudflare safety configuration is explicit, bounded, and internally consistent", () => {
  const config = loadGatewayConfig(validEnv);
  assert.equal("dailyLimit" in config, false);
  assert.equal("expensiveDailyLimit" in config, false);
  assert.equal(config.totalTimeoutMs, 90_000);
  assert.equal(config.controlTimeoutMs, 3_000);
  assert.equal(config.authTimeoutMs, 5_000);
  assert.equal(config.backendTimeoutMs, 85_000);
  assert.equal(config.issuer.href, "https://tenant.example.test/");
  assert.equal(config.principalPolicy.principals[0]?.subject, "auth0|owner");
  assert.equal(FIXED_CONTAINER_NAME, "nemlig-production");
  assert.throws(
    () => loadGatewayConfig({ ...validEnv, MCP_TOTAL_TIMEOUT_MS: undefined }),
    /MCP_TOTAL_TIMEOUT_MS is required/u,
  );
  assert.throws(
    () => loadGatewayConfig({ ...validEnv, MCP_CONTROL_TIMEOUT_MS: undefined }),
    /MCP_CONTROL_TIMEOUT_MS is required/u,
  );
  assert.throws(
    () => loadGatewayConfig({ ...validEnv, MCP_BACKEND_TIMEOUT_MS: "120001" }),
    /MCP_BACKEND_TIMEOUT_MS/u,
  );
  assert.throws(
    () => loadGatewayConfig({ ...validEnv, MCP_TOTAL_TIMEOUT_MS: "5000" }),
    /MCP_AUTH_TIMEOUT_MS/u,
  );
  assert.throws(
    () => loadGatewayConfig({ ...validEnv, MCP_CONTROL_TIMEOUT_MS: "30000" }),
    /MCP_CONTROL_TIMEOUT_MS/u,
  );
  assert.throws(
    () =>
      loadGatewayConfig({
        ...validEnv,
        NEMLIG_MCP_PUBLIC_URL: "http://mcp.example.test/mcp",
      }),
    /HTTPS/u,
  );
  assert.throws(
    () => loadGatewayConfig({ ...validEnv, NEMLIG_MCP_PRINCIPALS: undefined }),
    /NEMLIG_MCP_PRINCIPALS/u,
  );
});

test("current policy requires a versioned encryption secret and rejects old policy versions", () => {
  assert.equal(loadGatewayConfig(validEnv).principalPolicy.schema_version, 3);
  assert.throws(
    () =>
      loadGatewayConfig({ ...validEnv, NEMLIG_MCP_CREDENTIAL_KEY: undefined }),
    /encryption configuration/u,
  );
  assert.throws(
    () =>
      loadGatewayConfig({
        ...validEnv,
        NEMLIG_MCP_CREDENTIAL_KEY_VERSION: undefined,
      }),
    /encryption configuration/u,
  );
  const policy = JSON.parse(validEnv.NEMLIG_MCP_PRINCIPALS!);
  for (const schema_version of [1, 2]) {
    assert.throws(
      () =>
        loadGatewayConfig({
          ...validEnv,
          NEMLIG_MCP_PRINCIPALS: JSON.stringify({ ...policy, schema_version }),
        }),
      /NEMLIG_MCP_PRINCIPALS/u,
    );
  }
});

test("Wrangler configuration fixes both environments to one disabled EU lite Container", async () => {
  const raw = await readFile(
    new URL("../wrangler.jsonc", import.meta.url),
    "utf8",
  );
  const wrangler = JSON.parse(raw) as WranglerDeployment & {
    env: { production: WranglerDeployment };
    limits: { cpu_ms: number; subrequests: number };
  };
  for (const deployment of [wrangler, wrangler.env.production]) {
    assert.deepEqual(deployment.observability, {
      enabled: true,
      head_sampling_rate: 1,
    });
    assert.equal(deployment.vars.MCP_ENABLED, "false");
    assert.equal(deployment.vars.MCP_CREDENTIAL_ONBOARDING_ENABLED, "false");
    assert.equal(
      Object.keys(deployment.vars).some(
        (name) => name.endsWith("RATE_LIMIT") || name.includes("DAILY_LIMIT"),
      ),
      false,
    );
    assert.equal(deployment.vars.MCP_TOTAL_TIMEOUT_MS, "90000");
    assert.equal(deployment.vars.MCP_CONTROL_TIMEOUT_MS, "3000");
    assert.equal(deployment.vars.MCP_AUTH_TIMEOUT_MS, "5000");
    assert.equal(deployment.vars.MCP_BACKEND_TIMEOUT_MS, "85000");
    assert.equal(deployment.containers.length, 1);
    assert.equal(deployment.containers[0].max_instances, 1);
    assert.equal(deployment.containers[0].instance_type, "lite");
    assert.equal(deployment.containers[0].constraints.jurisdiction, "eu");
    assert.deepEqual(deployment.durable_objects.bindings, [
      { name: "NEMLIG_MCP_CONTAINER", class_name: "NemligMcpContainer" },
      {
        name: "NEMLIG_LOCAL_BASKET_STORAGE",
        class_name: "OwnerLocalBasketStorage",
      },
    ]);
    assert.deepEqual(deployment.migrations, [
      {
        tag: "v1",
        new_sqlite_classes: ["NemligMcpContainer", "PlanStorage"],
      },
      { tag: "v2", deleted_classes: ["PlanStorage"] },
      {
        tag: "v3",
        new_sqlite_classes: ["OwnerLocalBasketStorage"],
      },
    ]);
  }
  assert.equal(wrangler.keep_vars, false);
  assert.equal(wrangler.limits.cpu_ms, 100);
  assert.equal(wrangler.limits.subrequests, 8);
  assert.doesNotMatch(
    raw,
    /getRandom|autoscal|NEMLIG_(?:USERNAME|PASSWORD)|GH_TOKEN/u,
  );
});

test("Container has no Durable Object binding and uses only the local basket callback", async () => {
  const worker = await readFile(
    new URL("./cloudflare-worker.ts", import.meta.url),
    "utf8",
  );
  assert.match(worker, /outboundByHost/u);
  assert.match(worker, /local-basket-state\.internal/u);
  assert.doesNotMatch(worker, /nemlig-plan-storage\.internal/u);
  assert.doesNotMatch(worker, /GH_TOKEN|suggest_an_improvement/u);
  const container = worker.slice(
    worker.indexOf("export class NemligMcpContainer"),
    worker.indexOf("export class OwnerLocalBasketStorage"),
  );
  const containerEnvVars = container.slice(
    container.indexOf("envVars ="),
    container.indexOf("static outboundByHost"),
  );
  assert.doesNotMatch(containerEnvVars, /NEMLIG_LOCAL_BASKET_STORAGE/u);
  assert.doesNotMatch(containerEnvVars, /LOCAL_BASKET.*CAPABILITY/u);
  assert.match(worker, /Container<ContainerEnv>/u);
});

test("retired PlanStorage is absent from the Worker", async () => {
  const worker = await readFile(
    new URL("./cloudflare-worker.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(worker, /PlanStorage|NEMLIG_PLAN_STORAGE/u);
});
