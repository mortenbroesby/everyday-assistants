import assert from "node:assert/strict";
import test from "node:test";
import type { CloudflareEnv } from "./cloudflare-config.js";
import { handleOnboardingRequest, loadOnboardingConfig, type OnboardingDependencies } from "./onboarding.js";

const secret = (byte: number): string => Buffer.alloc(32, byte).toString("base64url");
const env: CloudflareEnv = {
  MCP_CREDENTIAL_ONBOARDING_ENABLED: "true",
  MCP_CREDENTIAL_RATE_LIMIT: "3",
  MCP_CREDENTIAL_GLOBAL_RATE_LIMIT: "10",
  NEMLIG_MCP_PUBLIC_URL: "https://mcp.example.test/mcp",
  NEMLIG_MCP_ONBOARDING_SESSION_KEY: secret(1),
  NEMLIG_MCP_CREDENTIAL_KEY: secret(2),
  NEMLIG_MCP_CREDENTIAL_KEY_VERSION: "one",
  NEMLIG_MCP_PRINCIPALS: JSON.stringify({
    schema_version: 1,
    revision: "family-v1",
    budgets: {
      principal_minute_limits: { "0": 20, "1": 20, "2": 20 },
      tier0_reserve: { minute: 20, month: 30_000 }, guest_limit: { minute: 20, month: 30_000 },
      tier1_shed_at: { minute: 20, month: 30_000 }, tier2_shed_at: { minute: 20, month: 30_000 },
    },
    principals: [{ subject: "auth0|owner", principal_key: "a".repeat(32), tier: 0, enabled: true, nemlig: { username: "owner@example.test", password: "secret" } }],
  }),
};

let connected = false;
const dependencies: OnboardingDependencies = {
  authenticate: async (token) => token === "valid-access-token" ? "auth0|owner" : undefined,
  principalStatus: async (subject) => subject === "auth0|owner" ? "owner" : undefined,
  connectionStatus: async () => connected,
  replace: async (subject, credentials) => {
    assert.equal(subject, "auth0|owner");
    assert.deepEqual(credentials, { username: "owner@example.test", password: "private-password" });
    connected = true;
    return "connected";
  },
  revoke: async () => { connected = false; },
  listPrincipals: async () => [],
  setPrincipalStatus: async () => {},
  consumeCsrf: async () => true,
};

const cookieValue = (response: Response): string => {
  const match = response.headers.get("set-cookie")?.match(/(__Host-nemlig-session=[^;]+)/u);
  assert.ok(match?.[1]);
  return match[1];
};

test("credential portal has no Auth0 callback or configuration dependency", async () => {
  assert.equal(loadOnboardingConfig(env).publicUrl.href, "https://mcp.example.test/mcp");
  assert.throws(() => loadOnboardingConfig({ ...env, NEMLIG_MCP_ONBOARDING_SESSION_KEY: "short" }), /configuration is invalid/u);
  const callback = await handleOnboardingRequest(new Request("https://mcp.example.test/connect/callback?code=old"), env, dependencies);
  assert.equal(callback.status, 404);
});

test("credential portal accepts a standard bearer token and keeps provider state separate", async () => {
  connected = false;
  const anonymous = await handleOnboardingRequest(new Request("https://mcp.example.test/connect"), env, dependencies);
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get("www-authenticate") ?? "", /resource_metadata=/u);

  const login = await handleOnboardingRequest(new Request("https://mcp.example.test/connect", {
    headers: { authorization: "Bearer valid-access-token" },
  }), env, dependencies);
  assert.equal(login.status, 303);
  const sessionCookie = cookieValue(login);
  const portal = await handleOnboardingRequest(new Request("https://mcp.example.test/connect", { headers: { cookie: sessionCookie } }), env, dependencies);
  assert.equal(portal.status, 200);
  const html = await portal.text();
  assert.match(html, /autocomplete="current-password"/u);
  assert.doesNotMatch(html, /authorization_code|client_secret|organization|private-password/u);
  const csrf = html.match(/name="csrf" value="([^"]+)"/u)?.[1];
  assert.ok(csrf);
  const saved = await handleOnboardingRequest(new Request("https://mcp.example.test/connect", {
    method: "POST",
    headers: { cookie: sessionCookie, origin: "https://mcp.example.test", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrf, action: "replace", username: "owner@example.test", password: "private-password" }),
  }), env, dependencies);
  assert.equal(saved.status, 200);
  assert.equal(connected, true);
  assert.doesNotMatch(await saved.text(), /private-password/u);
});
