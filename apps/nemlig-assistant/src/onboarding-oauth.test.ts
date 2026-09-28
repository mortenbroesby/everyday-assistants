import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import { handleOnboardingRequest, type OnboardingDependencies } from "./onboarding.js";
import type { CloudflareEnv } from "./cloudflare-config.js";
import { consumePortalCsrf, type PrincipalStorage } from "./principal-records.js";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createAuth0Verifier, loadAuth0Config } from "./auth0.js";

const issuer = "https://identity.example.test/";
const origin = "https://mcp.example.test";
const env: CloudflareEnv = {
  MCP_ENABLED: "false", MCP_CREDENTIAL_ONBOARDING_ENABLED: "true", MCP_AUTH_TIMEOUT_MS: "5000",
  NEMLIG_MCP_PUBLIC_URL: `${origin}/mcp`, NEMLIG_MCP_AUTH0_ISSUER: issuer,
  NEMLIG_MCP_AUTH0_AUDIENCE: `${origin}/mcp`,
  NEMLIG_MCP_ONBOARDING_CLIENT_ID: "owner-browser-client",
  NEMLIG_MCP_ONBOARDING_SESSION_KEY: Buffer.alloc(32, 1).toString("base64url"),
  NEMLIG_MCP_CREDENTIAL_KEY: Buffer.alloc(32, 2).toString("base64url"),
  NEMLIG_MCP_CREDENTIAL_KEY_VERSION: "one",
  NEMLIG_MCP_PRINCIPALS: JSON.stringify({ schema_version: 3, revision: "family-v3", owner_subject: "owner",
    principals: [{ subject: "owner", principal_key: "a".repeat(32), enabled: true }] }),
};
const cookie = (response: Response, name = "__Host-nemlig-login"): string => {
  const match = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  assert.ok(match);
  return match.split(";")[0]!;
};

const setup = () => {
  const counts = { fetches: 0, exchanges: 0, auth: 0, consumed: 0, credentialWork: 0 };
  const values = new Map<string, unknown>();
  let pending = Promise.resolve();
  const storage: PrincipalStorage = {
    transaction: (callback) => {
      const next = pending.then(callback);
      pending = next.then(() => undefined, () => undefined);
      return next;
    }, get: async <T>(key: string) => values.get(key) as T | undefined,
    put: async (key, value) => { values.set(key, value); }, delete: async (key) => values.delete(key),
  };
  let authorizationUrl: URL;
  let tokenError: string | undefined;
  let identity: string | undefined = "owner";
  let endpointOrigin = issuer;
  let tokenOrigin = issuer;
  let metadataIssuer = issuer;
  let token = "private-owner-token";
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const dependencies: OnboardingDependencies = {
    oauthFetch: async (input, init) => {
      counts.fetches += 1;
      const url = new URL(input instanceof Request ? input.url : String(input));
      assert.equal(url.origin, new URL(issuer).origin);
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      if (url.pathname.startsWith("/.well-known/")) return json({ issuer: metadataIssuer,
        authorization_endpoint: `${endpointOrigin}authorize`, token_endpoint: `${tokenOrigin}token`,
        response_types_supported: ["code"], code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"], authorization_response_iss_parameter_supported: true });
      assert.equal(url.pathname, "/token");
      counts.exchanges += 1;
      const form = new URLSearchParams(String(init?.body));
      assert.equal(form.get("grant_type"), "authorization_code");
      assert.equal(form.get("redirect_uri"), `${origin}/connect/callback`);
      assert.equal(form.get("client_id"), "owner-browser-client");
      assert.equal(form.get("resource"), `${origin}/mcp`);
      assert.equal(createHash("sha256").update(form.get("code_verifier")!).digest("base64url"), authorizationUrl.searchParams.get("code_challenge"));
      return tokenError ? json({ error: tokenError, error_description: "private-provider-detail" }, 400)
        : json({ access_token: token, token_type: "Bearer", expires_in: 600 });
    },
    authenticate: async (token) => { counts.auth += 1; assert.equal(token, "private-owner-token"); return identity; },
    consumeCsrf: async (subject, state, expiry) => { counts.consumed += 1; return consumePortalCsrf(storage, subject, state, expiry); },
    principalStatus: async () => "owner", connectionStatus: async () => false,
    replace: async () => { counts.credentialWork += 1; return "invalid"; },
    revoke: async () => { counts.credentialWork += 1; }, listPrincipals: async () => [], setPrincipalStatus: async () => {},
  };
  const start = async () => {
    const response = await handleOnboardingRequest(new Request(`${origin}/connect/sign-in`), env, dependencies);
    assert.equal(response.status, 303);
    authorizationUrl = new URL(response.headers.get("location")!);
    return { response, authorizationUrl, transaction: cookie(response) };
  };
  const finish = (transaction: string, fields?: URLSearchParams, overrides: CloudflareEnv = {}) => handleOnboardingRequest(new Request(`${origin}/connect/callback`, {
    method: "POST", headers: { cookie: transaction, origin: new URL(issuer).origin, "content-type": "application/x-www-form-urlencoded" },
    body: fields ?? new URLSearchParams({ code: "private-code", state: authorizationUrl.searchParams.get("state")!, iss: issuer }),
  }), { ...env, ...overrides }, dependencies);
  return { counts, start, finish, dependencies, setIdentity: (value: string | undefined) => { identity = value; },
    setTokenError: (value = "invalid_grant") => { tokenError = value; }, setToken: (value: string) => { token = value; },
    setEndpointOrigin: (value: string) => { endpointOrigin = value; }, setTokenOrigin: (value: string) => { tokenOrigin = value; },
    setMetadataIssuer: (value: string) => { metadataIssuer = value; } };
};

test("real SDK owner PKCE POST sign-in establishes only the existing portal session", async () => {
  const run = setup();
  const { authorizationUrl, transaction } = await run.start();
  assert.equal(authorizationUrl.origin, new URL(issuer).origin);
  assert.equal(authorizationUrl.searchParams.get("response_mode"), "form_post");
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorizationUrl.searchParams.get("scope"), "use:nemlig-assistant");
  assert.equal(authorizationUrl.searchParams.get("resource"), `${origin}/mcp`);
  assert.equal(authorizationUrl.searchParams.get("audience"), `${origin}/mcp`);
  const response = await run.finish(transaction);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/connect");
  const sessionCookie = response.headers.getSetCookie().find((value) => value.startsWith("__Host-nemlig-session="))!;
  assert.match(sessionCookie, /Secure; HttpOnly; SameSite=Lax/u);
  assert.ok(response.headers.getSetCookie().some((value) => value.startsWith("__Host-nemlig-login=") && value.includes("Max-Age=0")));
  assert.doesNotMatch(await response.text(), /private-code|private-owner-token/u);
  assert.equal(run.counts.exchanges, 1);
  assert.equal(run.counts.consumed, 1);
  assert.equal(run.counts.credentialWork, 0);
  // Even if an AS issued another code, the signed transaction is consumed once.
  assert.equal((await run.finish(transaction)).status, 401);
  assert.equal(env.MCP_ENABLED, "false");
});

test("RFC7636 dot and tilde verifier survives signed browser transaction", async () => {
  const run = setup(); const { transaction, authorizationUrl } = await run.start();
  const saved = JSON.parse(Buffer.from(transaction.split("=")[1]!.split(".")[0]!, "base64url").toString());
  saved.codeVerifier = ".~".repeat(22);
  const payload = Buffer.from(JSON.stringify(saved)).toString("base64url");
  const signature = createHmac("sha256", Buffer.from(env.NEMLIG_MCP_ONBOARDING_SESSION_KEY!, "base64url")).update(payload).digest("base64url");
  authorizationUrl.searchParams.set("code_challenge", createHash("sha256").update(saved.codeVerifier).digest("base64url"));
  assert.equal((await run.finish(`__Host-nemlig-login=${payload}.${signature}`)).status, 303);
});

test("owner callback uses the existing RS256 resource verifier, not unverified token claims", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const key = { ...await exportJWK(publicKey), kid: "owner-test", alg: "RS256" };
  const verifier = createAuth0Verifier(loadAuth0Config({ ...env }), new URL(`${issuer}.well-known/jwks.json`), createLocalJWKSet({ keys: [key] }));
  for (const fault of ["none", "audience", "issuer", "expiry", "scope"]) {
    const run = setup(); const { transaction } = await run.start();
    run.setToken(await new SignJWT({ scope: fault === "scope" ? "" : "use:nemlig-assistant" })
      .setProtectedHeader({ alg: "RS256", kid: "owner-test" }).setSubject("owner")
      .setIssuer(fault === "issuer" ? "https://different.example.test/" : issuer)
      .setAudience(fault === "audience" ? "https://different.example.test/mcp" : `${origin}/mcp`)
      .setExpirationTime(fault === "expiry" ? 1 : "5m").sign(privateKey));
    run.dependencies.authenticate = async (token) => {
      try { return (await verifier.verifyAccessToken(token)).extra?.subject as string; }
      catch { return undefined; }
    };
    const response = await run.finish(transaction);
    assert.equal(response.status, fault === "none" ? 303 : 401, fault);
    assert.equal(run.counts.consumed, fault === "none" ? 1 : 0, fault);
  }
});

test("callback state, cookie, duplicate fields and configuration drift reject before exchange", async () => {
  for (const fault of ["state", "duplicate", "duplicate-issuer", "missing-state", "cookie", "missing-cookie", "cancel", "client", "issuer", "response-issuer"]) {
    const run = setup();
    const { authorizationUrl, transaction } = await run.start();
    const fields = new URLSearchParams({ code: "private-code", state: authorizationUrl.searchParams.get("state")!, iss: issuer });
    if (fault === "state") fields.set("state", "wrong-state");
    if (fault === "duplicate") fields.append("code", "second-code");
    if (fault === "duplicate-issuer") fields.append("iss", issuer);
    if (fault === "missing-state") fields.delete("state");
    if (fault === "response-issuer") fields.set("iss", "https://different.example.test/");
    if (fault === "cancel") fields.set("error", "access_denied");
    const overrides = fault === "client" ? { NEMLIG_MCP_ONBOARDING_CLIENT_ID: "different-client" }
      : fault === "issuer" ? { NEMLIG_MCP_AUTH0_ISSUER: "https://different.example.test/" } : {};
    assert.equal((await run.finish(fault === "cookie" ? `${transaction}tampered` : fault === "missing-cookie" ? "" : transaction, fields, overrides)).status, 401, fault);
    assert.equal(run.counts.exchanges, 0, fault);
    assert.equal(run.counts.auth, 0, fault);
    assert.equal(run.counts.consumed, 0, fault);
  }
});

test("invalid callback methods and origins stop before discovery or storage", async () => {
  for (const fault of ["method", "origin", "missing-origin"]) {
    const run = setup(); const { transaction, authorizationUrl } = await run.start();
    const before = run.counts.fetches;
    const headers = new Headers({ cookie: transaction, "content-type": "application/x-www-form-urlencoded" });
    if (fault !== "missing-origin") headers.set("origin", fault === "origin" ? "https://foreign.example.test" : new URL(issuer).origin);
    const result = await handleOnboardingRequest(new Request(`${origin}/connect/callback`, {
      method: fault === "method" ? "GET" : "POST", headers,
      ...(fault === "method" ? {} : { body: new URLSearchParams({ code: "private-code", state: authorizationUrl.searchParams.get("state")! }) }),
    }), env, run.dependencies);
    assert.equal(result.status, 401, fault);
    assert.equal(run.counts.fetches, before, fault);
    assert.equal(run.counts.consumed, 0, fault);
  }
});

test("disabled owner policy never starts OAuth or storage", async () => {
  const run = setup(); const policy = JSON.parse(env.NEMLIG_MCP_PRINCIPALS!);
  policy.principals[0].enabled = false;
  const result = await handleOnboardingRequest(new Request(`${origin}/connect/sign-in`), {
    ...env, NEMLIG_MCP_PRINCIPALS: JSON.stringify(policy),
  }, run.dependencies);
  assert.equal(result.status, 503);
  assert.equal(run.counts.fetches, 0);
  assert.equal(run.counts.consumed, 0);
});

test("expired transaction stops before OAuth work", async (context) => {
  const run = setup();
  const { transaction } = await run.start();
  const before = run.counts.fetches;
  const now = Date.now();
  context.mock.method(Date, "now", () => now + 700_000);
  assert.equal((await run.finish(transaction)).status, 401);
  assert.equal(run.counts.fetches, before);
});

test("unknown, service and wrong-owner identities never receive portal authority", async () => {
  for (const identity of [undefined, "service@clients", "other-family-member"]) {
    const run = setup(); run.setIdentity(identity);
    const { transaction } = await run.start();
    const response = await run.finish(transaction);
    assert.equal(response.status, 401);
    assert.equal(response.headers.getSetCookie().some((value) => value.startsWith("__Host-nemlig-session=")), false);
    assert.equal(run.counts.consumed, 0);
    assert.equal(run.counts.credentialWork, 0);
  }
});

test("SDK invalid grant/client makes one exchange and reveals no provider detail", async () => {
  for (const error of ["invalid_grant", "invalid_client"]) {
    const run = setup(); const { transaction } = await run.start(); run.setTokenError(error);
    const response = await run.finish(transaction);
    assert.equal(response.status, 401);
    assert.equal(run.counts.exchanges, 1);
    assert.equal(run.counts.auth, 0);
    assert.doesNotMatch(await response.text(), /private-provider-detail|private-code/u);
  }
});

test("foreign authorization endpoint is never followed", async () => {
  const run = setup(); run.setEndpointOrigin("https://foreign.example.test/");
  const response = await handleOnboardingRequest(new Request(`${origin}/connect/sign-in`), env, run.dependencies);
  assert.equal(response.status, 401);
  assert.equal(run.counts.exchanges, 0);
  assert.equal(run.counts.credentialWork, 0);
});

test("foreign token endpoint and wrong discovery issuer cannot exchange a code", async () => {
  for (const fault of ["token", "issuer"]) {
    const run = setup(); const { transaction } = await run.start();
    if (fault === "token") run.setTokenOrigin("https://foreign.example.test/");
    else run.setMetadataIssuer("https://foreign.example.test/");
    assert.equal((await run.finish(transaction)).status, 401);
    assert.equal(run.counts.exchanges, 0);
    assert.equal(run.counts.consumed, 0);
  }
});

test("concurrent replay establishes at most one session without repeating an exchange within a request", async () => {
  const run = setup(); const { transaction } = await run.start();
  const results = await Promise.all([run.finish(transaction), run.finish(transaction)]);
  assert.deepEqual(results.map((value) => value.status).sort(), [303, 401]);
  assert.equal(run.counts.exchanges, 2);
  assert.equal(run.counts.credentialWork, 0);
});

test("transport timeout/redirect errors and replay-storage failure never issue a session", async () => {
  for (const fault of ["discovery", "exchange", "storage"]) {
    const run = setup(); const { transaction } = await run.start();
    const fetchFn = run.dependencies.oauthFetch!;
    run.dependencies.oauthFetch = async (input, init) => {
      if (fault === "discovery" || (fault === "exchange" && init?.method === "POST")) throw new DOMException("private-transport-detail", "TimeoutError");
      return fetchFn(input, init);
    };
    if (fault === "storage") run.dependencies.consumeCsrf = async () => { throw new Error("private-storage-detail"); };
    const response = await run.finish(transaction);
    assert.equal(response.status, 401);
    assert.equal(response.headers.getSetCookie().some((value) => value.startsWith("__Host-nemlig-session=")), false);
    assert.doesNotMatch(await response.text(), /private-transport-detail|private-storage-detail/u);
  }
});
