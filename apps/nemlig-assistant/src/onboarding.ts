import type { CloudflareEnv } from "./cloudflare-config.js";
import { parsePrincipalPolicy, type PrincipalPolicy } from "./principal-policy.js";
import type { Credentials } from "./config.js";
import { oauthReconnectChallenge } from "./auth0.js";
import { auth, discoverAuthorizationServerMetadata, type OAuthClientProvider } from "@modelcontextprotocol/client";

/** Existing credential portal settings; browser OAuth stays in its adapter. */
export interface OnboardingConfig {
  publicUrl: URL;
  origin: string;
  sessionKey: string;
  credentialKey: string;
  credentialKeyVersion: string;
  principalPolicy: PrincipalPolicy;
}

export interface OnboardingDependencies {
  oauthFetch?: typeof fetch;
  /** Verifies a standard resource-server access token and returns its subject. */
  authenticate(token: string): Promise<string | undefined>;
  principalStatus(subject: string): Promise<"owner" | "pending" | "enabled" | undefined>;
  connectionStatus(subject: string): Promise<boolean>;
  replace(subject: string, credentials: Credentials): Promise<"connected" | "invalid">;
  revoke(subject: string): Promise<void>;
  listPrincipals(): Promise<Array<{ subject: string; status: "pending" | "enabled" | "disabled" | "revoked" }>>;
  setPrincipalStatus(subject: string, status: "disabled" | "revoked"): Promise<void>;
  consumeCsrf(subject: string, csrf: string, expiresAt: number): Promise<boolean>;
}

interface SessionCookie { kind: "session"; subject: string; csrf: string; expiresAt: number }
interface LoginCookie { kind: "login"; state: string; codeVerifier: string; issuer: string; clientId: string; expiresAt: number }

const SESSION_COOKIE = "__Host-nemlig-session";
const LOGIN_COOKIE = "__Host-nemlig-login";
const encoder = new TextEncoder();
const invalidConfig = (): never => { throw new Error("Credential onboarding configuration is invalid."); };
const required = (env: CloudflareEnv, name: keyof CloudflareEnv): string => env[name]?.trim() || invalidConfig();

export function loadOnboardingConfig(env: CloudflareEnv): OnboardingConfig {
  const publicUrl = new URL(required(env, "NEMLIG_MCP_PUBLIC_URL"));
  const sessionKey = required(env, "NEMLIG_MCP_ONBOARDING_SESSION_KEY");
  const credentialKey = required(env, "NEMLIG_MCP_CREDENTIAL_KEY");
  const credentialKeyVersion = required(env, "NEMLIG_MCP_CREDENTIAL_KEY_VERSION");
  const principalPolicy = parsePrincipalPolicy(env.NEMLIG_MCP_PRINCIPALS);
  if (publicUrl.protocol !== "https:" || publicUrl.pathname !== "/mcp" || publicUrl.search || publicUrl.hash
    || !/^[A-Za-z0-9_-]{43}$/u.test(sessionKey)
    || !/^[A-Za-z0-9_-]{43}$/u.test(credentialKey)
    || !/^[A-Za-z0-9._-]{1,32}$/u.test(credentialKeyVersion)) invalidConfig();
  return { publicUrl, origin: publicUrl.origin, sessionKey, credentialKey, credentialKeyVersion, principalPolicy };
}

const base64url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};
const decode = (value: string): Uint8Array<ArrayBuffer> => {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length > 4_096) throw new Error("invalid cookie");
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4));
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) result[index] = binary.charCodeAt(index);
  return result;
};
const hmacKey = (encoded: string): Promise<CryptoKey> => crypto.subtle.importKey("raw", decode(encoded), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
const signCookie = async (value: SessionCookie | LoginCookie, key: string): Promise<string> => {
  const payload = base64url(encoder.encode(JSON.stringify(value)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(key), encoder.encode(payload));
  return `${payload}.${base64url(new Uint8Array(signature))}`;
};
const verifyCookie = async (value: string | undefined, key: string): Promise<SessionCookie | LoginCookie | undefined> => {
  try {
    const [payload, signature, extra] = value?.split(".") ?? [];
    if (!payload || !signature || extra || !await crypto.subtle.verify("HMAC", await hmacKey(key), decode(signature), encoder.encode(payload))) return undefined;
    const parsed = JSON.parse(new TextDecoder().decode(decode(payload))) as SessionCookie | LoginCookie;
    if (!Number.isSafeInteger(parsed.expiresAt) || parsed.expiresAt <= Date.now()) return undefined;
    if (parsed.kind === "session" && typeof parsed.subject === "string" && /^[A-Za-z0-9_-]{32}$/u.test(parsed.csrf)) return parsed;
    if (parsed.kind === "login" && /^[A-Za-z0-9_-]{32}$/u.test(parsed.state)
      && /^[A-Za-z0-9._~-]{43,128}$/u.test(parsed.codeVerifier)
      && typeof parsed.issuer === "string" && typeof parsed.clientId === "string") return parsed;
    return undefined;
  } catch { return undefined; }
};

const cookie = (request: Request, name: string): string | undefined => request.headers.get("cookie")?.split(";")
  .map((part) => part.trim().split("="))
  .find(([key]) => key === name)?.slice(1).join("=");
const setCookie = (name: string, value: string, maxAge: number): string => `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;
const random = (bytes = 32): string => base64url(crypto.getRandomValues(new Uint8Array(bytes)));
const securityHeaders = new Headers({
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  // Native form POSTs under no-referrer send Origin: null and fail our origin check.
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
});
const response = (body: string, status = 200, headers?: HeadersInit): Response => {
  const merged = new Headers(securityHeaders);
  merged.set("content-type", "text/html; charset=utf-8");
  for (const [name, value] of new Headers(headers)) merged.append(name, value);
  return new Response(body, { status, headers: merged });
};
const redirect = (location: string, cookies: string[]): Response => {
  const headers = new Headers(securityHeaders);
  headers.set("location", location);
  for (const value of cookies) headers.append("set-cookie", value);
  return new Response(null, { status: 303, headers });
};
const escape = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const page = (csrf: string, connected: boolean, message = "", principals: Array<{ subject: string; status: string }> = []): string => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect Nemlig</title><style>body{font:16px system-ui;max-width:34rem;margin:3rem auto;padding:0 1rem}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{font:inherit;padding:.7rem;margin:.35rem 0 1rem}</style></head><body><main><h1>Connect Nemlig</h1><p>${connected ? "Connected. You can replace or revoke this connection." : "Enter your own Nemlig login. It is sent only to this service."}</p>${message ? `<p role="status">${message}</p>` : ""}<form method="post" action="/connect"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="action" value="replace"><label for="username">Nemlig email</label><input id="username" name="username" type="email" autocomplete="username" maxlength="320" required><label for="password">Nemlig password</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="1024" required><button type="submit">Connect</button></form>${connected ? `<form method="post" action="/connect"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="action" value="revoke"><button type="submit">Revoke connection</button></form>` : ""}${principals.length ? `<section><h2>Invited users</h2>${principals.map((principal) => `<p>${escape(principal.subject)}: ${escape(principal.status)}</p><form method="post" action="/connect"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="subject" value="${escape(principal.subject)}"><button name="action" value="disable" type="submit">Disable access</button><button name="action" value="revoke-access" type="submit">Revoke access</button></form>`).join("")}</section>` : ""}</main></body></html>`;

const readForm = async (request: Request): Promise<URLSearchParams | undefined> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) return undefined;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared < 0 || declared > 4_096) return undefined;
  const reader = request.body?.getReader();
  if (!reader) return new URLSearchParams();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4_096) { await reader.cancel(); return undefined; }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new URLSearchParams(new TextDecoder().decode(joined));
};
const bearer = (request: Request): string | undefined => request.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/iu)?.[1];
const authRequired = (config: OnboardingConfig): Response => response("Authentication required.", 401, { "www-authenticate": oauthReconnectChallenge(config.publicUrl) });

const signInPage = (): Response => response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect Nemlig</title><main><h1>Connect Nemlig</h1><p>Sign in as the configured owner to manage your Nemlig connection.</p><a href="/connect/sign-in">Sign in</a></main></html>');
const loginCookie = (value: string, age = 600): string => `${LOGIN_COOKIE}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=None`;

/** The SDK owns OAuth/PKCE; this adapter owns browser transaction/session binding. */
const browserLogin = async (request: Request, config: OnboardingConfig, env: CloudflareEnv, dependencies: OnboardingDependencies): Promise<Response> => {
  const failed = (): Response => response("Sign-in failed. Return to /connect and try again.", 401, { "set-cookie": loginCookie("", 0) });
  try {
    const issuer = new URL(required(env, "NEMLIG_MCP_AUTH0_ISSUER"));
    const clientId = required(env, "NEMLIG_MCP_ONBOARDING_CLIENT_ID");
    const audience = required(env, "NEMLIG_MCP_AUTH0_AUDIENCE");
    const timeout = Number(env.MCP_AUTH_TIMEOUT_MS ?? "5000");
    if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash
      || !/^[A-Za-z0-9_-]{8,128}$/u.test(clientId) || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 10_000) return failed();
    if (!issuer.pathname.endsWith("/")) issuer.pathname += "/";
    const callback = new URL("/connect/callback", config.origin);
    const completing = new URL(request.url).pathname === callback.pathname;
    if (request.method !== (completing ? "POST" : "GET")) return failed();
    const saved = await verifyCookie(cookie(request, LOGIN_COOKIE), config.sessionKey);
    let transaction: LoginCookie;
    let code: string | undefined;
    let iss: string | undefined;
    if (completing) {
      if (request.headers.get("origin") !== issuer.origin || saved?.kind !== "login"
        || saved.issuer !== issuer.href || saved.clientId !== clientId
        || !request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return failed();
      const form = await readForm(request);
      if (!form || ["code", "state"].some((name) => form.getAll(name).length !== 1)
        || form.getAll("iss").length > 1 || form.has("error") || form.get("state") !== saved.state) return failed();
      code = form.get("code") ?? undefined;
      iss = form.get("iss") ?? undefined;
      if (!code || code.length > 2048) return failed();
      transaction = saved;
    } else {
      transaction = { kind: "login", state: random(24), codeVerifier: "", issuer: issuer.href, clientId, expiresAt: Date.now() + 600_000 };
    }
    const signal = AbortSignal.timeout(timeout);
    let exchanges = 0;
    const fetchFn: typeof fetch = async (input, init) => {
      const target = new URL(input instanceof Request ? input.url : String(input));
      if (target.origin !== issuer.origin || target.username || target.password || target.hash) throw new Error("OAuth destination rejected.");
      if ((init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase() === "POST" && ++exchanges > 1) throw new Error("OAuth exchange already attempted.");
      // Workers supports manual redirects, not the browser/Node "error" mode.
      const fetched = await (dependencies.oauthFetch ?? fetch)(input, { ...init, signal, redirect: "manual" });
      if (fetched.status >= 300 && fetched.status < 400) throw new Error("OAuth redirect rejected.");
      return fetched;
    };
    const metadata = await discoverAuthorizationServerMetadata(issuer, { fetchFn });
    if (!metadata || metadata.issuer !== issuer.href) return failed();
    let authorizationUrl: URL | undefined;
    let accessToken: string | undefined;
    const provider: OAuthClientProvider = {
      redirectUrl: callback,
      clientMetadata: { redirect_uris: [callback.href], token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"], application_type: "web" },
      clientInformation: () => ({ client_id: clientId, issuer: issuer.href }),
      tokens: () => undefined,
      saveTokens: (tokens) => { accessToken = tokens.access_token; },
      state: () => transaction.state,
      saveCodeVerifier: (verifier) => { transaction.codeVerifier = verifier; },
      codeVerifier: () => transaction.codeVerifier,
      discoveryState: () => ({ authorizationServerUrl: issuer.href, authorizationServerMetadata: metadata,
        resourceMetadata: { resource: config.publicUrl.href, authorization_servers: [issuer.href] } }),
      // Never let SDK invalid-grant/client recovery repeat a code exchange.
      invalidateCredentials: () => { throw new Error("OAuth recovery requires a new sign-in."); },
      redirectToAuthorization: (url) => {
        if (url.origin !== issuer.origin) throw new Error("OAuth destination rejected.");
        url.searchParams.set("response_mode", "form_post");
        // Auth0 selects the resource-server JWT through audience, not resource.
        url.searchParams.set("audience", audience);
        authorizationUrl = url;
      },
    };
    const result = await auth(provider, { serverUrl: config.publicUrl, scope: env.NEMLIG_MCP_REQUIRED_SCOPE ?? "use:nemlig-assistant", fetchFn,
      ...(completing ? { authorizationCode: code, iss } : {}) });
    if (!completing && result === "REDIRECT" && authorizationUrl) {
      return redirect(authorizationUrl.href, [loginCookie(await signCookie(transaction, config.sessionKey))]);
    }
    if (!accessToken || result !== "AUTHORIZED") return failed();
    const subject = await dependencies.authenticate(accessToken);
    accessToken = undefined;
    if (subject !== config.principalPolicy.owner_subject
      || !config.principalPolicy.principals.some((member) => member.subject === subject && member.enabled)
      || !await dependencies.consumeCsrf(subject, transaction.state, transaction.expiresAt)) return failed();
    const session: SessionCookie = { kind: "session", subject, csrf: random(24), expiresAt: Date.now() + 900_000 };
    return redirect("/connect", [loginCookie("", 0), setCookie(SESSION_COOKIE, await signCookie(session, config.sessionKey), 900)]);
  } catch { return failed(); }
};

/**
 * Credential management with a maintained-client owner browser sign-in adapter.
 * No refresh, Organization, invitation, enrollment or alternate credential path.
 */
export async function handleOnboardingRequest(request: Request, env: CloudflareEnv, dependencies: OnboardingDependencies): Promise<Response> {
  if (env.MCP_CREDENTIAL_ONBOARDING_ENABLED !== "true") return response("Credential onboarding is disabled.", 503);
  let config: OnboardingConfig;
  try { config = loadOnboardingConfig(env); } catch { return response("Credential onboarding configuration is invalid.", 503); }
  const url = new URL(request.url);
  if (url.pathname === "/connect/sign-in" || url.pathname === "/connect/callback") return browserLogin(request, config, env, dependencies);
  if (url.pathname !== "/connect") return response("Not found.", 404);
  const verified = await verifyCookie(cookie(request, SESSION_COOKIE), config.sessionKey);
  let session = verified?.kind === "session" ? verified : undefined;
  if (!session) {
    if (request.method !== "GET") return authRequired(config);
    if (!request.headers.has("authorization")) return signInPage();
    const subject = await (async () => {
      const token = bearer(request);
      return token ? dependencies.authenticate(token) : undefined;
    })();
    if (!subject) return authRequired(config);
    session = { kind: "session", subject, csrf: random(24), expiresAt: Date.now() + 15 * 60_000 };
    return redirect("/connect", [setCookie(SESSION_COOKIE, await signCookie(session, config.sessionKey), 900)]);
  }
  const status = await dependencies.principalStatus(session.subject);
  if (!status) return response("Access revoked.", 403);
  if (request.method === "GET") return response(page(session.csrf, await dependencies.connectionStatus(session.subject), "", status === "owner" ? await dependencies.listPrincipals() : []));
  if (request.method !== "POST") return response("Method not allowed.", 405);
  if (request.headers.get("origin") !== config.origin) return response("Request rejected.", 403);
  const form = await readForm(request);
  if (!form || form.get("csrf") !== session.csrf) return response("Request rejected.", 403);
  if (!await dependencies.consumeCsrf(session.subject, session.csrf, session.expiresAt)) return response("Request rejected.", 403);
  const renewed: SessionCookie = { ...session, csrf: random(24), expiresAt: Date.now() + 15 * 60_000 };
  const render = async (body: string, statusCode = 200): Promise<Response> => response(body, statusCode, { "set-cookie": setCookie(SESSION_COOKIE, await signCookie(renewed, config.sessionKey), 900) });
  try {
    if (form.get("action") === "disable" || form.get("action") === "revoke-access") {
      const subject = form.get("subject");
      if (status !== "owner" || !subject || subject.length > 500 || subject === session.subject) return render("Request rejected.", 403);
      await dependencies.setPrincipalStatus(subject, form.get("action") === "disable" ? "disabled" : "revoked");
      return render(page(renewed.csrf, await dependencies.connectionStatus(session.subject), "Access updated.", await dependencies.listPrincipals()));
    }
    if (form.get("action") === "revoke") {
      await dependencies.revoke(session.subject);
      return render(page(renewed.csrf, false, "Connection revoked."));
    }
    if (form.get("action") !== "replace") return render("Request rejected.", 400);
    const username = form.get("username");
    const password = form.get("password");
    if (!username || username.trim().length < 1 || username.length > 320 || !password || password.length > 1_024) return render(page(renewed.csrf, await dependencies.connectionStatus(session.subject), "Connection failed."), 400);
    const result = await dependencies.replace(session.subject, { username: username.trim(), password });
    return result === "connected"
      ? render(page(renewed.csrf, true, "Connection saved."))
      : render(page(renewed.csrf, await dependencies.connectionStatus(session.subject), "Connection failed."), 400);
  } catch {
    return render(page(renewed.csrf, false, "Request failed."), 500);
  }
}
