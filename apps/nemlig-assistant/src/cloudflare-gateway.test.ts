import assert from "node:assert/strict";
import test from "node:test";
import type { CloudflareEnv } from "./cloudflare-config.js";
import { classifyMcpMessage, handleGatewayRequest, type GatewayDependencies, type OperationClass } from "./cloudflare-gateway.js";
import type { GatewayRequestEvent } from "./cloudflare-observability.js";
import { emptyUsageState } from "./cloudflare-usage.js";
import { parsePrincipalPolicy } from "./principal-policy.js";

const policy = parsePrincipalPolicy(JSON.stringify({
  schema_version: 1, revision: "family-v1",
  budgets: {
    principal_minute_limits: { "0": 60, "1": 20, "2": 5 },
    tier0_reserve: { minute: 20, month: 30_000 }, guest_limit: { minute: 40, month: 125_000 },
    tier1_shed_at: { minute: 40, month: 125_000 }, tier2_shed_at: { minute: 20, month: 60_000 },
  },
  principals: [{ subject: "auth0|owner", principal_key: "a".repeat(32), tier: 0, enabled: true, nemlig: { username: "owner@example.test", password: "secret" } }],
}));
const principal = policy.principals[0]!;

const env: CloudflareEnv = {
  MCP_ENABLED: "true",
  MCP_DAILY_LIMIT: "5000",
  MCP_EXPENSIVE_DAILY_LIMIT: "500",
  MCP_RATE_LIMIT: "60",
  MCP_EXPENSIVE_RATE_LIMIT: "10",
  MCP_AUTH_TIMEOUT_MS: "5000",
  MCP_CONTROL_TIMEOUT_MS: "3000",
  MCP_TOTAL_TIMEOUT_MS: "30000",
  MCP_BACKEND_TIMEOUT_MS: "25000",
  NEMLIG_MCP_AUTH0_ISSUER: "https://tenant.example.test",
  NEMLIG_MCP_AUTH0_AUDIENCE: "https://mcp.example.test/mcp",
  NEMLIG_MCP_AUTH0_OWNER_SUBJECT: "auth0|owner",
  NEMLIG_MCP_PRINCIPALS: JSON.stringify(policy),
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
    authenticate: async () => { calls += 1; return undefined; },
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
    authenticate: async () => { calls += 1; return undefined; },
    admit: async () => { calls += 1; throw new Error("unexpected"); },
    forward: async () => { calls += 1; return new Response("unexpected"); },
  });
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("unknown, disabled, and malformed principals fail before admission or Container access", async () => {
  let admissionCalls = 0;
  let forwardCalls = 0;
  const dependencies: GatewayDependencies = {
    authenticate: async () => undefined,
    admit: async () => { admissionCalls += 1; throw new Error("unexpected"); },
    forward: async () => { forwardCalls += 1; return new Response("unexpected"); },
  };
  for (const token of ["unknown", "disabled"]) {
    const response = await handleGatewayRequest(mcpRequest({ method: "initialize" }, token), env, dependencies);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "principal_not_allowed" });
  }
  const malformed = await handleGatewayRequest(mcpRequest({ method: "initialize" }), {
    ...env,
    NEMLIG_MCP_PRINCIPALS: "not-json",
  }, dependencies);
  assert.equal(malformed.status, 503);
  assert.equal(admissionCalls, 0);
  assert.equal(forwardCalls, 0);
});

test("authenticated normal requests forward once and unknown tools fail into the expensive class", async () => {
  const forwarded: OperationClass[] = [];
  const events: GatewayRequestEvent[] = [];
  let authenticated = 0;
  const dependencies: GatewayDependencies = {
    authenticate: async (token) => { assert.equal(token, "owner-token"); authenticated += 1; return principal; },
    admit: async () => ({ admitted: true, state: emptyUsageState(new Date("2026-08-31T12:00:00Z")) }),
    forward: async (request, operation) => {
      assert.equal(request.headers.get("authorization"), "Bearer owner-token");
      forwarded.push(operation);
      return new Response("ok");
    },
    event: (event) => events.push(event),
    requestId: () => "10000000-0000-4000-8000-000000000000",
  };
  const normal = await handleGatewayRequest(mcpRequest({ method: "tools/call", params: { name: "show_my_basket" } }), env, dependencies);
  const unknown = await handleGatewayRequest(mcpRequest({ method: "tools/call", params: { name: "future_tool" } }), env, dependencies);
  assert.equal(await normal.text(), "ok");
  assert.equal(await unknown.text(), "ok");
  assert.equal(authenticated, 2);
  assert.deepEqual(forwarded, ["normal", "expensive"]);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.outcome), ["completed", "completed"]);
  assert.equal(normal.headers.get("x-nemlig-request-id"), "10000000-0000-4000-8000-000000000000");
  assert.equal(classifyMcpMessage({ method: "notifications/initialized" }), "protocol");
  assert.equal(classifyMcpMessage({ method: "future/protocol-method" }), "protocol");
  assert.equal(classifyMcpMessage({ method: "tools/call", params: { name: "add_approved_items" } }), "expensive");
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
  const rateLimited = await handleGatewayRequest(mcpRequest({ method: "tools/call", params: { name: "show_my_basket" } }), env, {
    ...base,
    authenticate: async () => principal,
    admit: async () => ({ admitted: false, status: 429, reason: "rate_limit", state: emptyUsageState(new Date()) }),
  });
  const tripped = await handleGatewayRequest(mcpRequest({ method: "initialize" }), env, {
    ...base,
    authenticate: async () => principal,
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
    authenticate: async (token) => { if (token !== "owner-token") throw new Error("invalid"); return principal; },
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

test("only Tier 0 receives aggregate usage and terminal events expose bounded tier denials", async () => {
  const events: GatewayRequestEvent[] = [];
  const usageState = emptyUsageState(new Date("2026-09-01T00:00:00Z"), policy.revision);
  usageState.principals[principal.principal_key] = { minute: "2026-09-01T00:00", minuteCount: 2, day: "2026-09-01", dayCount: 2, month: "2026-09", monthCount: 2 };
  const usageRequest = new Request("https://mcp.example.test/admin/usage", { headers: { authorization: "Bearer owner-token" } });
  const response = await handleGatewayRequest(usageRequest, env, {
    authenticate: async () => principal,
    admit: async () => { throw new Error("unexpected"); },
    usage: async () => usageState,
    forward: async () => { throw new Error("unexpected"); },
    event: (event) => events.push(event),
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.doesNotMatch(text, new RegExp(principal.principal_key, "u"));
  assert.doesNotMatch(text, /principals|username|password|subject/iu);
  assert.equal(events[0]?.tier, "0");
  assert.equal(events[0]?.denial_reason, "none");

  const deniedEvents: GatewayRequestEvent[] = [];
  const denied = await handleGatewayRequest(mcpRequest({ method: "tools/call", params: { name: "show_my_basket" } }), env, {
    authenticate: async () => ({ ...principal, tier: 2 }),
    admit: async () => ({ admitted: false, status: 429, reason: "tier_2_shed", state: usageState }),
    forward: async () => { throw new Error("unexpected"); },
    event: (event) => deniedEvents.push(event),
  });
  assert.equal(denied.status, 429);
  assert.equal(deniedEvents[0]?.tier, "2");
  assert.equal(deniedEvents[0]?.denial_reason, "tier_2_shed");
  assert.equal(deniedEvents[0]?.outcome, "capacity_rejected");
});

test("stalled authentication, control, and backend boundaries fail with one sanitized terminal event", async () => {
  const shortEnv = {
    ...env,
    MCP_AUTH_TIMEOUT_MS: "5",
    MCP_CONTROL_TIMEOUT_MS: "5",
    MCP_TOTAL_TIMEOUT_MS: "100",
    MCP_BACKEND_TIMEOUT_MS: "10",
  };
  const never = () => new Promise<never>(() => {});
  for (const [boundary, expected] of [
    ["authentication", "authentication_timeout"],
    ["control", "control_timeout"],
    ["backend", "backend_timeout"],
  ] as const) {
    const events: GatewayRequestEvent[] = [];
    const response = await handleGatewayRequest(mcpRequest({ method: "tools/call", params: { name: "show_my_basket" } }), shortEnv, {
      authenticate: boundary === "authentication" ? never : async () => principal,
      admit: boundary === "control" ? never : async () => ({ admitted: true, state: emptyUsageState(new Date()) }),
      forward: boundary === "backend" ? never : async () => new Response("ok"),
      event: (event) => events.push(event),
      requestId: () => "10000000-0000-4000-8000-000000000000",
    });
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), { error: expected });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.outcome, expected);
    assert.deepEqual(Object.keys(events[0] ?? {}).sort(), [
      "denial_reason", "elapsed_ms", "event", "method", "operation", "outcome", "request_id", "revision", "route", "schema_version", "status", "tier",
    ]);
  }
});

test("a shorter remaining total budget reports request timeout and aborts Container dispatch", async () => {
  const events: GatewayRequestEvent[] = [];
  let observedSignal: AbortSignal | undefined;
  let clock = 0;
  const response = await handleGatewayRequest(mcpRequest({ method: "tools/call", params: { name: "show_my_basket" } }), {
    ...env,
    MCP_AUTH_TIMEOUT_MS: "50",
    MCP_CONTROL_TIMEOUT_MS: "20",
    MCP_TOTAL_TIMEOUT_MS: "100",
    MCP_BACKEND_TIMEOUT_MS: "80",
  }, {
    authenticate: async () => { clock = 30; return principal; },
    admit: async () => ({ admitted: true, state: emptyUsageState(new Date()) }),
    forward: async (_request, _operation, _config, deadline) => {
      observedSignal = deadline.signal;
      return new Promise<never>(() => {});
    },
    event: (event) => events.push(event),
    requestId: () => "10000000-0000-4000-8000-000000000000",
    now: () => clock,
  });
  assert.equal(response.status, 504);
  assert.equal(events[0]?.outcome, "request_timeout");
  assert.equal(observedSignal?.aborted, true);
});

test("requests without content length are still capped at one MiB", async () => {
  let calls = 0;
  const response = await handleGatewayRequest(new Request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(1_048_576) }),
  }), env, {
    authenticate: async () => { calls += 1; return undefined; },
    admit: async () => { calls += 1; throw new Error("unexpected"); },
    forward: async () => { calls += 1; return new Response("unexpected"); },
  });
  assert.equal(response.status, 413);
  assert.equal(calls, 0);
});

test("a stalled request body is cancelled at the total deadline", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull: () => new Promise(() => {}),
    cancel: () => { cancelled = true; },
  });
  const request = new Request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const events: GatewayRequestEvent[] = [];
  const response = await handleGatewayRequest(request, {
    ...env,
    MCP_AUTH_TIMEOUT_MS: "2",
    MCP_CONTROL_TIMEOUT_MS: "2",
    MCP_TOTAL_TIMEOUT_MS: "10",
    MCP_BACKEND_TIMEOUT_MS: "5",
  }, {
    authenticate: async () => { throw new Error("unexpected"); },
    admit: async () => { throw new Error("unexpected"); },
    forward: async () => { throw new Error("unexpected"); },
    event: (event) => events.push(event),
    requestId: () => "10000000-0000-4000-8000-000000000000",
  });
  assert.equal(response.status, 504);
  assert.equal(events[0]?.outcome, "request_timeout");
  assert.equal(cancelled, true);
});
