import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FIXED_CONTAINER_NAME, loadGatewayConfig, type CloudflareEnv } from "./cloudflare-config.js";

const validEnv: CloudflareEnv = {
  MCP_ENABLED: "true",
  MCP_DAILY_LIMIT: "5000",
  MCP_EXPENSIVE_DAILY_LIMIT: "500",
  MCP_RATE_LIMIT: "60",
  MCP_EXPENSIVE_RATE_LIMIT: "10",
  MCP_AUTH_TIMEOUT_MS: "5000",
  MCP_BACKEND_TIMEOUT_MS: "35000",
  NEMLIG_MCP_AUTH0_ISSUER: "https://tenant.example.test",
  NEMLIG_MCP_AUTH0_AUDIENCE: "https://mcp.example.test/mcp",
  NEMLIG_MCP_AUTH0_OWNER_SUBJECT: "auth0|owner",
  NEMLIG_MCP_PUBLIC_URL: "https://mcp.example.test/mcp",
};

interface WranglerDeployment {
  keep_vars?: boolean;
  vars: Record<string, string>;
  containers: Array<{ max_instances: number; instance_type: string; constraints: { jurisdiction: string } }>;
  durable_objects: { bindings: unknown[] };
}

test("Cloudflare safety configuration is explicit, bounded, and internally consistent", () => {
  const config = loadGatewayConfig(validEnv);
  assert.equal(config.dailyLimit, 5000);
  assert.equal(config.expensiveDailyLimit, 500);
  assert.equal(config.issuer.href, "https://tenant.example.test/");
  assert.equal(FIXED_CONTAINER_NAME, "nemlig-production");
  assert.throws(() => loadGatewayConfig({ ...validEnv, MCP_DAILY_LIMIT: undefined }), /MCP_DAILY_LIMIT is required/u);
  assert.throws(() => loadGatewayConfig({ ...validEnv, MCP_DAILY_LIMIT: "0" }), /MCP_DAILY_LIMIT/u);
  assert.throws(() => loadGatewayConfig({ ...validEnv, MCP_DAILY_LIMIT: "100001" }), /MCP_DAILY_LIMIT/u);
  assert.throws(() => loadGatewayConfig({ ...validEnv, MCP_EXPENSIVE_DAILY_LIMIT: "5001" }), /MCP_EXPENSIVE_DAILY_LIMIT/u);
  assert.throws(() => loadGatewayConfig({ ...validEnv, MCP_RATE_LIMIT: "20", MCP_EXPENSIVE_RATE_LIMIT: "21" }), /MCP_EXPENSIVE_RATE_LIMIT/u);
  assert.throws(() => loadGatewayConfig({ ...validEnv, MCP_BACKEND_TIMEOUT_MS: "60001" }), /MCP_BACKEND_TIMEOUT_MS/u);
  assert.throws(() => loadGatewayConfig({ ...validEnv, NEMLIG_MCP_PUBLIC_URL: "http://mcp.example.test/mcp" }), /HTTPS/u);
});

test("Wrangler configuration fixes both environments to one disabled EU lite Container", async () => {
  const raw = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const wrangler = JSON.parse(raw) as WranglerDeployment & {
    env: { production: WranglerDeployment };
    limits: { cpu_ms: number; subrequests: number };
  };
  for (const deployment of [wrangler, wrangler.env.production]) {
    assert.equal(deployment.vars.MCP_ENABLED, "false");
    assert.equal(deployment.containers.length, 1);
    assert.equal(deployment.containers[0].max_instances, 1);
    assert.equal(deployment.containers[0].instance_type, "lite");
    assert.equal(deployment.containers[0].constraints.jurisdiction, "eu");
    assert.equal(deployment.durable_objects.bindings.length, 2);
  }
  assert.equal(wrangler.keep_vars, true);
  assert.equal(wrangler.limits.cpu_ms, 100);
  assert.equal(wrangler.limits.subrequests, 8);
  assert.doesNotMatch(raw, /getRandom|autoscal|NEMLIG_(?:USERNAME|PASSWORD)|GH_TOKEN/u);
});

test("Container outbound handlers register through the SDK static setter", async () => {
  const worker = await readFile(new URL("./cloudflare-worker.ts", import.meta.url), "utf8");
  assert.match(worker, /NemligMcpContainer\.outboundByHost\s*=/u);
  assert.doesNotMatch(worker, /static\s+outboundByHost/u);
});
