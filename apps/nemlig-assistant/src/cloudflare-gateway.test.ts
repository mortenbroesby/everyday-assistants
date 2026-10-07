import assert from "node:assert/strict";
import test from "node:test";
import type { CloudflareEnv } from "./cloudflare-config.js";
import { attachAdmissionCredential, classifyMcpMessage, handleGatewayRequest, type GatewayDependencies, type OperationClass } from "./cloudflare-gateway.js";
import type { GatewayRequestEvent } from "./cloudflare-observability.js";
import { parsePrincipalPolicy } from "./principal-policy.js";
import { Auth0InfrastructureError } from "./auth0.js";
import { PRODUCT_VIEWER_RESOURCE_URI } from "./product-viewer.js";

const policy = parsePrincipalPolicy(JSON.stringify({
  schema_version: 3, revision: "family", owner_subject: "auth0|owner",
  principals: [{ subject: "auth0|owner", principal_key: "a".repeat(32), enabled: true }],
}));
const principal = policy.principals[0]!;

const env: CloudflareEnv = {
  MCP_ENABLED: "true",
  MCP_AUTH_TIMEOUT_MS: "5000",
  MCP_CONTROL_TIMEOUT_MS: "3000",
  MCP_TOTAL_TIMEOUT_MS: "30000",
  MCP_BACKEND_TIMEOUT_MS: "25000",
  NEMLIG_MCP_AUTH0_ISSUER: "https://tenant.example.test",
  NEMLIG_MCP_AUTH0_AUDIENCE: "https://mcp.example.test/mcp",
  NEMLIG_MCP_PRINCIPALS: JSON.stringify(policy),
  NEMLIG_MCP_PUBLIC_URL: "https://mcp.example.test/mcp",
  NEMLIG_MCP_CREDENTIAL_KEY: "a".repeat(43),
  NEMLIG_MCP_CREDENTIAL_KEY_VERSION: "one",
};

const mcpRequest = (body: unknown, token = "owner-token") => new Request("https://mcp.example.test/mcp", {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("only controller-returned credential headers cross the internal boundary", () => {
  const spoofed = new Request("https://mcp.example.test/mcp", { headers: {
    "x-nemlig-credential-envelope": "attacker",
    "x-nemlig-principal-key": "attacker",
    "x-nemlig-policy-revision": "attacker",
    "x-nemlig-credential-generation": "999",
  } });
  const withoutCredential = attachAdmissionCredential(spoofed, {
    admitted: true,
  });
  assert.equal(withoutCredential.headers.get("x-nemlig-credential-envelope"), null);
  const envelope = {
    schema_version: 1 as const,
    principal_key: "a".repeat(32),
    policy_revision: "family-v2",
    key_version: "one",
    generation: 1,
    nonce: "A".repeat(16),
    ciphertext: "B".repeat(24),
  };
  const attached = attachAdmissionCredential(spoofed, {
    admitted: true,
    credential: envelope,
  });
  assert.equal(attached.headers.get("x-nemlig-principal-key"), envelope.principal_key);
  assert.deepEqual(JSON.parse(atob(attached.headers.get("x-nemlig-credential-envelope")!)), envelope);
});

test("disabled Cloudflare MCP rejects before configuration, authentication, and backend access", async () => {
  let calls = 0;
  const dependencies: GatewayDependencies = {
    authenticate: async () => { calls += 1; return undefined; },
    admit: async () => { calls += 1; throw new Error("unexpected"); },
    forward: async () => { calls += 1; return new Response("unexpected"); },
  };
  const response = await handleGatewayRequest(mcpRequest({ method: "server/discover" }), { MCP_ENABLED: "false" }, dependencies);
  assert.equal(response.status, 503);
  assert.equal(await response.text(), "MCP temporarily disabled");
  assert.equal(calls, 0);
});

test("unauthenticated requests never reach authentication backends or the Container", async () => {
  let calls = 0;
  const response = await handleGatewayRequest(mcpRequest({ method: "server/discover" }, ""), env, {
    authenticate: async () => { calls += 1; return undefined; },
    admit: async () => { calls += 1; throw new Error("unexpected"); },
    forward: async () => { calls += 1; return new Response("unexpected"); },
  });
  assert.equal(response.status, 401);
  assert.match(response.headers.get("www-authenticate") ?? "", /^Bearer resource_metadata="https:\/\/mcp\.example\.test\/\.well-known\/oauth-protected-resource\/mcp", error="invalid_token", error_description="Reconnect MoJo Shopper to continue"$/u);
  assert.equal(calls, 0);
});

test("public OAuth metadata advertises only the human connector scope", async () => {
  const response = await handleGatewayRequest(new Request("https://mcp.example.test/.well-known/oauth-protected-resource/mcp"), {
    ...env,
    NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED: "true",
    NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client",
  }, {
    authenticate: async () => undefined,
    admit: async () => { throw new Error("unexpected admission"); },
    forward: async () => new Response("unexpected"),
  });
  assert.equal(response.status, 200);
  const metadata = await response.json() as { scopes_supported: string[] };
  assert.deepEqual(metadata.scopes_supported, ["use:nemlig-assistant"]);
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
    const response = await handleGatewayRequest(mcpRequest({ method: "server/discover" }, token), env, dependencies);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "principal_not_allowed" });
  }
  const malformed = await handleGatewayRequest(mcpRequest({ method: "server/discover" }), {
    ...env,
    NEMLIG_MCP_PRINCIPALS: "not-json",
  }, dependencies);
  assert.equal(malformed.status, 503);
  assert.equal(admissionCalls, 0);
  assert.equal(forwardCalls, 0);
});

test("shopping and unknown tool requests receive the same useful classification", async () => {
  const forwarded: OperationClass[] = [];
  const events: GatewayRequestEvent[] = [];
  let authenticated = 0;
  const dependencies: GatewayDependencies = {
    authenticate: async (token) => { assert.equal(token, "owner-token"); authenticated += 1; return principal; },
    admit: async () => ({ admitted: true }),
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
  assert.deepEqual(forwarded, ["useful", "useful"]);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.outcome), ["completed", "completed"]);
  assert.equal(normal.headers.get("x-nemlig-request-id"), "10000000-0000-4000-8000-000000000000");
  assert.equal(classifyMcpMessage({ method: "server/discover" }), "protocol");
  assert.equal(classifyMcpMessage({ method: "future/protocol-method" }), "protocol");
  assert.equal(classifyMcpMessage({ method: "tools/call", params: { name: "get_profile" } }), "useful");
  assert.equal(classifyMcpMessage({ method: "tools/call", params: { name: "add_approved_items" } }), "useful");
});

test("forwarded MCP handshake failures are logged as backend rejections", async () => {
  const events: GatewayRequestEvent[] = [];
  const response = await handleGatewayRequest(mcpRequest({ method: "initialize" }), env, {
    authenticate: async () => principal,
    admit: async () => ({ admitted: true }),
    forward: async () => new Response("Unsupported protocol version", { status: 400 }),
    event: (event) => events.push(event),
  });
  assert.equal(response.status, 400);
  assert.equal(events[0]?.outcome, "backend_rejected");
  assert.equal(events[0]?.status, 400);
  assert.equal(events[0]?.denial_reason, "none");
});

test("retired tool names receive no special usage class", () => {
  for (const name of [
    "save_my_shopping_plan",
    "continue_my_shopping_plan",
    "show_my_shopping_lists",
    "save_my_shopping_list",
    "copy_my_shopping_list",
    "set_my_shopping_list_status",
    "shop_from_my_list",
    "migrate_my_saved_plan",
  ]) {
    assert.equal(classifyMcpMessage({ method: "tools/call", params: { name } }), "useful");
  }
});

test("service acceptance denies forbidden calls before admission and Container forwarding", async () => {
  let admitted = 0;
  let forwarded = 0;
  const service = { subject: "service-client@clients", principal_key: "s".repeat(32), enabled: true };
  const response = await handleGatewayRequest(mcpRequest({ method: "tools/call", params: { name: "submit_product_review_conversation" } }), {
    ...env,
    NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED: "true",
    NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client",
  }, {
    authenticate: async () => service,
    admit: async () => { admitted += 1; throw new Error("unexpected admission"); },
    forward: async () => { forwarded += 1; return new Response("unexpected"); },
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "principal_not_allowed" });
  assert.equal(admitted, 0);
  assert.equal(forwarded, 0);
});

test("service acceptance permits retained read-only tools and rejects the legacy raw chooser", async () => {
  let admitted = 0;
  let forwarded = 0;
  const service = { subject: "service-client@clients", principal_key: "s".repeat(32), enabled: true };
  const serviceEnv = {
    ...env,
    NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED: "true",
    NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client",
  };
  const dependencies: GatewayDependencies = {
    authenticate: async () => service,
    admit: async () => { admitted += 1; return { admitted: true }; },
    forward: async () => { forwarded += 1; return new Response("ok"); },
  };
  const discovery = await handleGatewayRequest(mcpRequest({ method: "server/discover" }), serviceEnv, dependencies);
  const details = await handleGatewayRequest(mcpRequest({ method: "tools/call", params: { name: "show_my_basket" } }), serviceEnv, dependencies);
  const legacy = await handleGatewayRequest(mcpRequest({ method: "tools/call", params: { name: "choose_products_visually" } }), serviceEnv, dependencies);
  assert.equal(discovery.status, 200);
  assert.equal(details.status, 200);
  assert.equal(legacy.status, 403);
  assert.equal(admitted, 2);
  assert.equal(forwarded, 2);
});

test("service acceptance may read only the current stable product viewer resource", async () => {
  let forwarded = 0;
  const service = { subject: "service-client@clients", principal_key: "s".repeat(32), enabled: true };
  const serviceEnv = {
    ...env,
    NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED: "true",
    NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client",
  };
  const dependencies: GatewayDependencies = {
    authenticate: async () => service,
    admit: async () => ({ admitted: true }),
    forward: async () => { forwarded += 1; return new Response("ok"); },
  };
  const allowed = await handleGatewayRequest(mcpRequest({
    method: "resources/read",
    params: { uri: PRODUCT_VIEWER_RESOURCE_URI },
  }), serviceEnv, dependencies);
  const forbidden = await handleGatewayRequest(mcpRequest({
    method: "resources/read",
    params: { uri: "file:///etc/passwd" },
  }), serviceEnv, dependencies);
  const stale = await handleGatewayRequest(mcpRequest({
    method: "resources/read",
    params: { uri: "ui://nemlig/obsolete-product-viewer.html" },
  }), serviceEnv, dependencies);
  assert.equal(allowed.status, 200);
  assert.equal(forbidden.status, 403);
  assert.equal(stale.status, 403);
  assert.equal(forwarded, 1);
});

test("unauthorized and credential-required requests never reach the Container", async () => {
  let forwarded = 0;
  const base = {
    forward: async () => { forwarded += 1; return new Response("unexpected"); },
  };
  const unauthorized = await handleGatewayRequest(mcpRequest({ method: "ping" }, "bad"), env, {
    ...base,
    authenticate: async () => { throw new Error("invalid"); },
    admit: async () => { throw new Error("unexpected"); },
  });
  const connectionRequired = await handleGatewayRequest(mcpRequest({ method: "server/discover" }), env, {
    ...base,
    authenticate: async () => principal,
    admit: async () => ({ admitted: false, status: 409, reason: "credential_required" }),
  });
  assert.deepEqual(await connectionRequired.json(), {
    error: "connection_required", connection_url: "https://nemlig-mcp.broesby.dk/connect",
  });
  assert.match(unauthorized.headers.get("www-authenticate") ?? "", /error="invalid_token"/u);
  assert.deepEqual([unauthorized.status, connectionRequired.status], [401, 409]);
  assert.equal(forwarded, 0);
});

test("stalled authentication, control, and backend boundaries fail with one sanitized terminal event", async () => {
  const shortEnv = {
    ...env,
    MCP_AUTH_TIMEOUT_MS: "5",
    MCP_CONTROL_TIMEOUT_MS: "5",
    MCP_TOTAL_TIMEOUT_MS: "500",
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
      admit: boundary === "control" ? never : async () => ({ admitted: true }),
      forward: boundary === "backend" ? never : async () => new Response("ok"),
      event: (event) => events.push(event),
      requestId: () => "10000000-0000-4000-8000-000000000000",
    });
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), { error: expected });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.outcome, expected);
    assert.deepEqual(Object.keys(events[0] ?? {}).sort(), [
      "denial_reason", "elapsed_ms", "event", "method", "operation", "outcome", "request_id", "revision", "route", "schema_version", "status",
    ]);
  }
});

test("Auth0 verifier infrastructure failures do not return a reconnect challenge or wake the Container", async () => {
  for (const [kind, status, outcome] of [
    ["unavailable", 503, "authentication_unavailable"],
    ["timeout", 504, "authentication_timeout"],
  ] as const) {
    let forwarded = 0;
    const events: GatewayRequestEvent[] = [];
    const response = await handleGatewayRequest(mcpRequest({ method: "ping" }), env, {
      authenticate: async () => { throw new Auth0InfrastructureError(kind); },
      admit: async () => { throw new Error("unexpected"); },
      forward: async () => { forwarded += 1; return new Response("unexpected"); },
      event: (event) => events.push(event),
    });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: outcome });
    assert.equal(response.headers.get("www-authenticate"), null);
    assert.equal(forwarded, 0);
    assert.equal(events[0]?.outcome, outcome);
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
    admit: async () => ({ admitted: true }),
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
    MCP_TOTAL_TIMEOUT_MS: "250",
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

test("local review and actual submission share useful admission", () => {
  for (const name of ["start_product_review", "update_product_review_conversation"]) {
    assert.equal(classifyMcpMessage({ method: "tools/call", params: { name } }), "useful");
  }
  assert.equal(classifyMcpMessage({ method: "tools/call", params: { name: "submit_product_review_conversation" } }), "useful");
});

test("backend timeout is returned without retry", async () => {
  let attempts = 0;
  const response = await handleGatewayRequest(mcpRequest({ method: "ping" }), env, {
    authenticate: async () => principal,
    admit: async () => ({ admitted: true }),
    forward: async () => { attempts += 1; throw new DOMException("timed out", "TimeoutError"); },
  });
  assert.equal(response.status, 504);
  assert.equal(attempts, 1);
});

test("removed usage/reset routes are absent even for the owner", async () => {
  for (const path of ["/admin/usage", "/admin/reset-breaker"]) {
    const response = await handleGatewayRequest(new Request("https://mcp.example.test" + path), env, {
      authenticate: async () => { throw new Error("unexpected authentication"); },
      admit: async () => { throw new Error("unexpected control"); },
      forward: async () => { throw new Error("unexpected forwarding"); },
    });
    assert.equal(response.status, 404);
  }
});
