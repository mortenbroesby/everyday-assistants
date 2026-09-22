import assert from "node:assert/strict";
import test from "node:test";
import { handleMinimalMcpRequest, loadMinimalConfig } from "./cloudflare-minimal.js";
import type { CloudflareEnv } from "./cloudflare-config.js";

const principalKey = "a".repeat(32);
const policy = JSON.stringify({
  schema_version: 2,
  revision: "recovery-v1",
  budgets: {
    principal_minute_limits: { "0": 20, "1": 20, "2": 20 },
    tier0_reserve: { minute: 20, month: 30_000 },
    guest_limit: { minute: 20, month: 30_000 },
    tier1_shed_at: { minute: 20, month: 30_000 },
    tier2_shed_at: { minute: 20, month: 30_000 },
  },
  organization: { id: "org_recovery01" },
  invitation: { default_tier: 1 },
  owner: { subject: "auth0|owner", principal_key: principalKey, tier: 0, enabled: true },
});

const env: CloudflareEnv = {
  MCP_ENABLED: "true",
  MCP_AUTH_TIMEOUT_MS: "5000",
  NEMLIG_MCP_AUTH0_ISSUER: "https://everyday-assistants.eu.auth0.com/",
  NEMLIG_MCP_AUTH0_AUDIENCE: "https://nemlig-mcp.broesby.dk/mcp",
  NEMLIG_MCP_REQUIRED_SCOPE: "use:nemlig-assistant",
  NEMLIG_MCP_PUBLIC_URL: "https://nemlig-mcp.broesby.dk/mcp",
  NEMLIG_MCP_PRINCIPALS: policy,
  NEMLIG_MCP_REVISION: "test-revision",
};

const request = (body: unknown, token?: string): Request => new Request("https://nemlig-mcp.broesby.dk/mcp", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

const deps = (events: string[]) => ({
  authenticate: async (token: string) => token === "valid" ? {
    subject: "auth0|owner", principal_key: principalKey, tier: 0 as const, enabled: true,
  } : undefined,
  event: (entry: { boundary: string; outcome: string }) => events.push(`${entry.boundary}:${entry.outcome}`),
});

test("minimal path challenges anonymous MCP requests without waking application backends", async () => {
  const events: string[] = [];
  const response = await handleMinimalMcpRequest(request({ jsonrpc: "2.0", id: 1, method: "initialize" }), loadMinimalConfig(env), deps(events));
  assert.equal(response.status, 401);
  assert.match(response.headers.get("www-authenticate") ?? "", /resource_metadata=/u);
  assert.deepEqual(events.slice(0, 3), ["request_received:started", "bearer:missing"]);
});

test("minimal local configuration permits only loopback HTTP as the development TLS exception", () => {
  const config = loadMinimalConfig({ ...env, NEMLIG_MCP_PUBLIC_URL: "http://127.0.0.1:8789/mcp", NEMLIG_MCP_AUTH0_AUDIENCE: "http://127.0.0.1:8789/mcp" });
  assert.equal(config.publicUrl.protocol, "http:");
  assert.throws(() => loadMinimalConfig({ ...env, NEMLIG_MCP_PUBLIC_URL: "http://mcp.example.test/mcp", NEMLIG_MCP_AUTH0_AUDIENCE: "http://mcp.example.test/mcp" }), /Invalid MCP resource URL/u);
});

test("minimal authenticated MCP reaches only the shared stable get_profile", async () => {
  const events: string[] = [];
  const config = loadMinimalConfig(env);
  const initialize = await handleMinimalMcpRequest(request({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } }, "valid"), config, deps(events));
  assert.equal(initialize.status, 200);

  const list = await handleMinimalMcpRequest(request({ jsonrpc: "2.0", id: 2, method: "tools/list" }, "valid"), config, deps(events));
  const tools = await list.json() as { result?: { tools?: Array<{ name?: string; _meta?: Record<string, unknown> }> } };
  assert.deepEqual(tools.result?.tools?.map((tool) => tool.name), ["get_profile"]);
  assert.equal(tools.result?.tools?.[0]?._meta?.["openai/profile"], true);

  const call = await handleMinimalMcpRequest(request({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_profile", arguments: {} } }, "valid"), config, deps(events));
  const result = await call.json() as { result?: { structuredContent?: { id?: string } } };
  assert.equal(call.status, 200);
  assert.equal(result.result?.structuredContent?.id, principalKey);
  assert.ok(events.includes("token:accepted"));
  assert.ok(events.includes("principal:authorized"));
  assert.ok(events.includes("mcp:reached"));
  assert.ok(events.includes("get_profile:called"));
  assert.ok(events.includes("get_profile:completed"));
});
