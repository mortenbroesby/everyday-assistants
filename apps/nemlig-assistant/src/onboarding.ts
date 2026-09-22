import type { CloudflareEnv } from "./cloudflare-config.js";
import { parsePrincipalPolicy, type PrincipalPolicy } from "./principal-policy.js";
import type { Credentials } from "./config.js";
import { oauthReconnectChallenge } from "./auth0.js";

/** Provider credential portal settings. OAuth is deliberately absent here. */
export interface OnboardingConfig {
  publicUrl: URL;
  origin: string;
  sessionKey: string;
  credentialKey: string;
  credentialKeyVersion: string;
  perPrincipalRate: number;
  globalRate: number;
  principalPolicy: PrincipalPolicy;
}

export interface OnboardingDependencies {
  /** Verifies a standard resource-server access token and returns its subject. */
  authenticate(token: string): Promise<string | undefined>;
  principalStatus(subject: string): Promise<"owner" | "pending" | "enabled" | undefined>;
  connectionStatus(subject: string): Promise<boolean>;
  replace(subject: string, credentials: Credentials): Promise<"connected" | "invalid" | "limited">;
  revoke(subject: string): Promise<void>;
  listPrincipals(): Promise<Array<{ subject: string; status: "pending" | "enabled" | "disabled" | "revoked" }>>;
  setPrincipalStatus(subject: string, status: "disabled" | "revoked"): Promise<void>;
  consumeCsrf(subject: string, csrf: string, expiresAt: number): Promise<boolean>;
}

interface SessionCookie { kind: "session"; subject: string; csrf: string; expiresAt: number }

const SESSION_COOKIE = "__Host-nemlig-session";
const encoder = new TextEncoder();
const invalidConfig = (): never => { throw new Error("Credential onboarding configuration is invalid."); };
const required = (env: CloudflareEnv, name: keyof CloudflareEnv): string => env[name]?.trim() || invalidConfig();
const bounded = (env: CloudflareEnv, name: keyof CloudflareEnv, maximum: number): number => {
  const value = Number(required(env, name));
  return Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : invalidConfig();
};

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
  const perPrincipalRate = bounded(env, "MCP_CREDENTIAL_RATE_LIMIT", 10);
  const globalRate = bounded(env, "MCP_CREDENTIAL_GLOBAL_RATE_LIMIT", 60);
  if (globalRate < perPrincipalRate) invalidConfig();
  return { publicUrl, origin: publicUrl.origin, sessionKey, credentialKey, credentialKeyVersion, perPrincipalRate, globalRate, principalPolicy };
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
const signCookie = async (value: SessionCookie, key: string): Promise<string> => {
  const payload = base64url(encoder.encode(JSON.stringify(value)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(key), encoder.encode(payload));
  return `${payload}.${base64url(new Uint8Array(signature))}`;
};
const verifyCookie = async (value: string | undefined, key: string): Promise<SessionCookie | undefined> => {
  try {
    const [payload, signature, extra] = value?.split(".") ?? [];
    if (!payload || !signature || extra || !await crypto.subtle.verify("HMAC", await hmacKey(key), decode(signature), encoder.encode(payload))) return undefined;
    const parsed = JSON.parse(new TextDecoder().decode(decode(payload))) as SessionCookie;
    return parsed.kind === "session" && typeof parsed.subject === "string" && Number.isSafeInteger(parsed.expiresAt) && parsed.expiresAt > Date.now() ? parsed : undefined;
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
  "referrer-policy": "no-referrer",
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

/**
 * Provider credential management only. The caller arrives with a standard
 * resource-server token; this module does not implement Auth0 login, code
 * exchange, refresh, organization, invitation, or identity management.
 */
export async function handleOnboardingRequest(request: Request, env: CloudflareEnv, dependencies: OnboardingDependencies): Promise<Response> {
  if (env.MCP_CREDENTIAL_ONBOARDING_ENABLED !== "true") return response("Credential onboarding is disabled.", 503);
  let config: OnboardingConfig;
  try { config = loadOnboardingConfig(env); } catch { return response("Credential onboarding configuration is invalid.", 503); }
  const url = new URL(request.url);
  if (url.pathname !== "/connect") return response("Not found.", 404);
  let session = await verifyCookie(cookie(request, SESSION_COOKIE), config.sessionKey);
  if (!session) {
    if (request.method !== "GET") return authRequired(config);
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
      : render(page(renewed.csrf, await dependencies.connectionStatus(session.subject), result === "limited" ? "Try again later." : "Connection failed."), result === "limited" ? 429 : 400);
  } catch {
    return render(page(renewed.csrf, false, "Request failed."), 500);
  }
}
