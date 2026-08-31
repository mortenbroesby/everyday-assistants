import assert from "node:assert/strict";
import test from "node:test";
import type { CloudflareEnv } from "./cloudflare-config.js";
import { classifyMcpMessage, handleGatewayRequest, type GatewayDependencies, type OperationClass } from "./cloudflare-gateway.js";
import { emptyUsageState } from "./cloudflare-usage.js";

const env: CloudflareEnv = {
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

const mcpRequest = (body: unknown, token = "owner-token") => new Request("https://mcp.example.test/mcp", {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("disabled Cloudflare MCP rejects before configuration, authentication, and backend access", async () => {
  let calls = 0;
  const dependencies: GatewayDependencies = {
    authenticate: async () => { calls += 1; },
    admit: async () => { calls += 1; throw new Error("unexpected"); },
    forward: async () => { calls += 1; return new Response("unexpected"); },
  };
  const response = await handleGatewayRequest(mcpRequest({ method: "initialize" }), { MCP_ENABLED: "false" }, dependencies);
  assert.equal(response.status, 503);
  assert.equal(await response.text(), "MCP temporarily disabled");
  assert.equal(calls, 0);
});

test("unauthenticated requests never reach authentication backends or the Container", async () => {
  let calls = 0;
  const response = await handleGatewayRequest(mcpRequest({ method: "initialize" }, ""), env, {
    authenticate: async () => { calls += 1; },
    admit: async () => { calls += 1; throw new Error("unexpected"); },
    forward: async () => { calls += 1; return new Response("unexpected"); },
  });
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("authenticated normal requests forward once and unknown tools fail into the expensive class", async () => {
  const forwarded: OperationClass[] = [];
  let authenticated = 0;
  const dependencies: GatewayDependencies = {
    authenticate: async (token) => { assert.equal(token, "owner-token"); authenticated += 1; },
    admit: async () => ({ admitted: true, state: {
      period: "2026-08-31", normalCount: 0, expensiveCount: 0, breakerOpen: false,
      normalMinute: "2026-08-31T12:00", normalMinuteCount: 0,
      expensiveMinute: "2026-08-31T12:00", expensiveMinuteCount: 0,
    } }),
    forward: async (_request, operation) => { forwarded.push(operation); return new Response("ok"); },
  };
  const normal = await handleGatewayRequest(mcpRequest({ method: "tools/call", params: { name: "view_cart" } }), env, dependencies);
  const unknown = await handleGatewayRequest(mcpRequest({ method: "tools/call", params: { name: "future_tool" } }), env, dependencies);
  assert.equal(await normal.text(), "ok");
  assert.equal(await unknown.text(), "ok");
  assert.equal(authenticated, 2);
  assert.deepEqual(forwarded, ["normal", "expensive"]);
  assert.equal(classifyMcpMessage({ method: "notifications/initialized" }), "protocol");
  assert.equal(classifyMcpMessage({ method: "future/protocol-method" }), "protocol");
  assert.equal(classifyMcpMessage({ method: "tools/call", params: { name: "apply_cart_additions" } }), "expensive");
});

test("unauthorized, rate-limited, and open-breaker requests never reach the Container", async () => {
  let forwarded = 0;
  const base = {
    forward: async () => { forwarded += 1; return new Response("unexpected"); },
  };
  const unauthorized = await handleGatewayRequest(mcpRequest({ method: "ping" }, "bad"), env, {
    ...base,
    authenticate: async () => { throw new Error("invalid"); },
    admit: async () => { throw new Error("unexpected"); },
  });
  const rateLimited = await handleGatewayRequest(mcpRequest({ method: "tools/call", params: { name: "view_cart" } }), env, {
    ...base,
    authenticate: async () => {},
    admit: async () => ({ admitted: false, status: 429, reason: "rate_limit", state: emptyUsageState(new Date()) }),
  });
  const tripped = await handleGatewayRequest(mcpRequest({ method: "initialize" }), env, {
    ...base,
    authenticate: async () => {},
    admit: async () => ({ admitted: false, status: 503, reason: "breaker_open", state: emptyUsageState(new Date()) }),
  });
  assert.deepEqual([unauthorized.status, rateLimited.status, tripped.status], [401, 429, 503]);
  assert.equal(forwarded, 0);
});

test("manual reset requires owner authentication and backend timeout is returned without retry", async () => {
  let reset = 0;
  let attempts = 0;
  const adminRequest = (token: string) => new Request("https://mcp.example.test/admin/reset-breaker", {
    method: "POST", headers: { authorization: `Bearer ${token}` },
  });
  const dependencies: GatewayDependencies = {
    authenticate: async (token) => { if (token !== "owner-token") throw new Error("invalid"); },
    admit: async () => ({ admitted: true, state: emptyUsageState(new Date()) }),
    resetUsage: async () => { reset += 1; return emptyUsageState(new Date("2026-09-01T00:00:00Z")); },
    forward: async () => {
      attempts += 1;
      throw new DOMException("timed out", "TimeoutError");
    },
  };
  assert.equal((await handleGatewayRequest(adminRequest("bad"), env, dependencies)).status, 401);
  assert.equal(reset, 0);
  assert.equal((await handleGatewayRequest(adminRequest("owner-token"), env, dependencies)).status, 200);
  assert.equal(reset, 1);
  const timeout = await handleGatewayRequest(mcpRequest({ method: "ping" }), env, dependencies);
  assert.equal(timeout.status, 504);
  assert.equal(attempts, 1);
});

test("requests without content length are still capped at one MiB", async () => {
  let calls = 0;
  const response = await handleGatewayRequest(new Request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(1_048_576) }),
  }), env, {
    authenticate: async () => { calls += 1; },
    admit: async () => { calls += 1; throw new Error("unexpected"); },
    forward: async () => { calls += 1; return new Response("unexpected"); },
  });
  assert.equal(response.status, 413);
  assert.equal(calls, 0);
});
