import assert from "node:assert/strict";
import test from "node:test";
import type { CloudflareEnv } from "./cloudflare-config.js";
import { handleOnboardingRequest, loadOnboardingConfig, type OnboardingDependencies } from "./onboarding.js";

const secret = (byte: number): string => Buffer.alloc(32, byte).toString("base64url");
const env: CloudflareEnv = {
  MCP_CREDENTIAL_ONBOARDING_ENABLED: "true",
  MCP_CREDENTIAL_RATE_LIMIT: "3",
  MCP_CREDENTIAL_GLOBAL_RATE_LIMIT: "10",
  NEMLIG_MCP_AUTH0_ISSUER: "https://tenant.example.test/",
  NEMLIG_MCP_PUBLIC_URL: "https://mcp.example.test/mcp",
  NEMLIG_MCP_AUTH0_ORGANIZATION_ID: "org_abcdefgh",
  NEMLIG_MCP_ONBOARDING_CLIENT_ID: "client_abcdefgh",
  NEMLIG_MCP_ONBOARDING_CLIENT_SECRET: "client-secret-value",
  NEMLIG_MCP_ONBOARDING_SESSION_KEY: secret(1),
  NEMLIG_MCP_CREDENTIAL_KEY: secret(2),
  NEMLIG_MCP_CREDENTIAL_KEY_VERSION: "one",
  NEMLIG_MCP_PRINCIPALS: JSON.stringify({
    schema_version: 2,
    revision: "family-v2",
    budgets: {
      principal_minute_limits: { "0": 20, "1": 20, "2": 20 },
      tier0_reserve: { minute: 20, month: 30_000 }, guest_limit: { minute: 20, month: 30_000 },
      tier1_shed_at: { minute: 20, month: 30_000 }, tier2_shed_at: { minute: 20, month: 30_000 },
    },
    organization: { id: "org_abcdefgh" }, invitation: { default_tier: 1 },
    owner: { subject: "auth0|owner", principal_key: "a".repeat(32), tier: 0, enabled: true },
  }),
};

const state = new Map<string, "owner" | "pending" | "enabled" | "disabled" | "revoked">([["auth0|owner", "owner"]]);
const connected = new Set<string>();
let registrations = 0;
let replacements = 0;
let revocations = 0;
const consumedCsrf = new Set<string>();
const dependencies: OnboardingDependencies = {
  exchangeCode: async ({ code, organizationId }) => {
    if (code !== "valid-code") throw new Error("invalid code");
    return { subject: "auth0|guest", emailVerified: true, organizationId };
  },
  principalStatus: async (subject) => {
    const status = state.get(subject);
    return status === "disabled" || status === "revoked" ? undefined : status;
  },
  register: async ({ subject }) => { registrations += 1; state.set(subject, "pending"); },
  connectionStatus: async (subject) => connected.has(subject),
  replace: async (subject, credentials) => {
    replacements += 1;
    assert.deepEqual(credentials, { username: "guest@example.test", password: "private-password" });
    connected.add(subject);
    state.set(subject, "enabled");
    return "connected";
  },
  revoke: async (subject) => { revocations += 1; connected.delete(subject); },
  listPrincipals: async () => [...state].filter(([subject]) => subject !== "auth0|owner").map(([subject, status]) => ({ subject, status: status === "owner" ? "enabled" as const : status })),
  setPrincipalStatus: async (subject, status) => { state.set(subject, status); },
  consumeCsrf: async (subject, csrf) => {
    const key = `${subject}:${csrf}`;
    if (consumedCsrf.has(key)) return false;
    consumedCsrf.add(key);
    return true;
  },
};

const cookieValue = (response: Response, name: string): string => {
  const match = response.headers.get("set-cookie")?.match(new RegExp(`${name}=([^;,]+)`, "u"));
  assert.ok(match?.[1]);
  return `${name}=${match[1]}`;
};

test("onboarding configuration and disabled switch fail closed", async () => {
  assert.equal(loadOnboardingConfig(env).organizationId, "org_abcdefgh");
  for (const changed of [
    { ...env, NEMLIG_MCP_ONBOARDING_SESSION_KEY: "short" },
    { ...env, NEMLIG_MCP_AUTH0_ORGANIZATION_ID: "org_wrongorg" },
    { ...env, MCP_CREDENTIAL_GLOBAL_RATE_LIMIT: "100" },
    { ...env, MCP_CREDENTIAL_RATE_LIMIT: "4", MCP_CREDENTIAL_GLOBAL_RATE_LIMIT: "3" },
  ]) assert.throws(() => loadOnboardingConfig(changed), /configuration is invalid/u);
  let called = false;
  const disabled = await handleOnboardingRequest(new Request("https://mcp.example.test/connect"), {
    ...env, MCP_CREDENTIAL_ONBOARDING_ENABLED: "false",
  }, { ...dependencies, principalStatus: async () => { called = true; return undefined; } });
  assert.equal(disabled.status, 503);
  assert.equal(called, false);
});

test("native invitation login binds a session without persisting the ticket", async () => {
  registrations = 0;
  const ticket = "private-auth0-invitation-ticket";
  const login = await handleOnboardingRequest(new Request(`https://mcp.example.test/connect?invitation=${ticket}&organization=org_abcdefgh`), env, dependencies);
  assert.equal(login.status, 303);
  const location = new URL(login.headers.get("location")!);
  assert.equal(location.origin, "https://tenant.example.test");
  assert.equal(location.searchParams.get("invitation"), ticket);
  assert.equal(location.searchParams.get("organization"), "org_abcdefgh");
  assert.doesNotMatch(login.headers.get("set-cookie") ?? "", new RegExp(ticket, "u"));
  const flowCookie = cookieValue(login, "__Host-nemlig-flow");
  const callback = await handleOnboardingRequest(new Request(
    `https://mcp.example.test/connect/callback?code=valid-code&state=${location.searchParams.get("state")}`,
    { headers: { cookie: flowCookie } },
  ), env, dependencies);
  assert.equal(callback.status, 303);
  assert.equal(registrations, 1);
  const sessionCookie = cookieValue(callback, "__Host-nemlig-session");
  const portal = await handleOnboardingRequest(new Request("https://mcp.example.test/connect", { headers: { cookie: sessionCookie } }), env, dependencies);
  const html = await portal.text();
  assert.equal(portal.status, 200);
  assert.match(html, /autocomplete="username"/u);
  assert.match(html, /autocomplete="current-password"/u);
  assert.doesNotMatch(html, /private-auth0|guest@example|private-password/u);
  assert.match(portal.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/u);
  assert.equal(portal.headers.get("cache-control"), "no-store");

  const csrf = html.match(/name="csrf" value="([^"]+)"/u)?.[1];
  assert.ok(csrf);
  const body = new URLSearchParams({ csrf, action: "replace", username: "guest@example.test", password: "private-password" });
  const saved = await handleOnboardingRequest(new Request("https://mcp.example.test/connect", {
    method: "POST", headers: { cookie: sessionCookie, origin: "https://mcp.example.test", "content-type": "application/x-www-form-urlencoded" }, body,
  }), env, dependencies);
  assert.equal(saved.status, 200);
  assert.equal(replacements, 1);
  assert.doesNotMatch(await saved.text(), /guest@example|private-password/u);
  const renewedSessionCookie = cookieValue(saved, "__Host-nemlig-session");

  const replayed = await handleOnboardingRequest(new Request("https://mcp.example.test/connect", {
    method: "POST", headers: { cookie: sessionCookie, origin: "https://mcp.example.test", "content-type": "application/x-www-form-urlencoded" }, body,
  }), env, dependencies);
  assert.equal(replayed.status, 403);
  assert.equal(replacements, 1);

  const denied = await handleOnboardingRequest(new Request("https://mcp.example.test/connect", {
    method: "POST", headers: { cookie: sessionCookie, origin: "https://evil.test", "content-type": "application/x-www-form-urlencoded" }, body,
  }), env, dependencies);
  assert.equal(denied.status, 403);
  assert.equal(replacements, 1);

  const renewedPortal = await handleOnboardingRequest(new Request("https://mcp.example.test/connect", { headers: { cookie: renewedSessionCookie } }), env, dependencies);
  const renewedHtml = await renewedPortal.text();
  const renewedCsrf = renewedHtml.match(/name="csrf" value="([^"]+)"/u)?.[1];
  assert.ok(renewedCsrf);
  const revokeBody = new URLSearchParams({ csrf: renewedCsrf, action: "revoke" });
  const revoked = await handleOnboardingRequest(new Request("https://mcp.example.test/connect", {
    method: "POST", headers: { cookie: renewedSessionCookie, origin: "https://mcp.example.test", "content-type": "application/x-www-form-urlencoded" }, body: revokeBody,
  }), env, dependencies);
  assert.equal(revoked.status, 200);
  assert.equal(revocations, 1);

});

test("invalid organization, callback state, CSRF, method, and oversized body stop before writes", async () => {
  const wrongOrg = await handleOnboardingRequest(new Request("https://mcp.example.test/connect?invitation=abcdefgh&organization=org_wrongorg"), env, dependencies);
  assert.equal(wrongOrg.status, 403);
  const login = await handleOnboardingRequest(new Request("https://mcp.example.test/connect?invitation=abcdefgh&organization=org_abcdefgh"), env, dependencies);
  const flowCookie = cookieValue(login, "__Host-nemlig-flow");
  const callback = await handleOnboardingRequest(new Request("https://mcp.example.test/connect/callback?code=valid-code&state=wrong", { headers: { cookie: flowCookie } }), env, dependencies);
  assert.equal(callback.status, 403);
  assert.equal((await handleOnboardingRequest(new Request("https://mcp.example.test/connect", { method: "DELETE" }), env, dependencies)).status, 401);
  assert.equal(registrations, 1);
});

test("only the owner can disable an invited principal", async () => {
  state.set("auth0|guest", "enabled");
  const ownerDependencies: OnboardingDependencies = {
    ...dependencies,
    exchangeCode: async ({ organizationId }) => ({ subject: "auth0|owner", emailVerified: true, organizationId }),
  };
  const login = await handleOnboardingRequest(new Request("https://mcp.example.test/connect"), env, ownerDependencies);
  const location = new URL(login.headers.get("location")!);
  const callback = await handleOnboardingRequest(new Request(
    `https://mcp.example.test/connect/callback?code=owner-code&state=${location.searchParams.get("state")}`,
    { headers: { cookie: cookieValue(login, "__Host-nemlig-flow") } },
  ), env, ownerDependencies);
  const sessionCookie = cookieValue(callback, "__Host-nemlig-session");
  const portal = await handleOnboardingRequest(new Request("https://mcp.example.test/connect", { headers: { cookie: sessionCookie } }), env, ownerDependencies);
  const html = await portal.text();
  assert.match(html, /auth0\|guest: enabled/u);
  const csrf = html.match(/name="csrf" value="([^"]+)"/u)?.[1];
  assert.ok(csrf);
  const disabled = await handleOnboardingRequest(new Request("https://mcp.example.test/connect", {
    method: "POST",
    headers: { cookie: sessionCookie, origin: "https://mcp.example.test", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrf, action: "disable", subject: "auth0|guest" }),
  }), env, ownerDependencies);
  assert.equal(disabled.status, 200);
  assert.equal(state.get("auth0|guest"), "disabled");
  assert.equal(await ownerDependencies.principalStatus("auth0|guest"), undefined);
});
