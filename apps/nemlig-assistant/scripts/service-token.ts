import { createRemoteJWKSet, customFetch, jwtVerify, type JWTVerifyGetKey } from "jose";
import { SERVICE_ACCEPTANCE_SCOPE } from "../src/auth0.js";

export { SERVICE_ACCEPTANCE_SCOPE } from "../src/auth0.js";

type Environment = Record<string, string | undefined>;

export interface ServiceTokenOptions {
  fetcher?: typeof fetch;
  key?: CryptoKey | JWTVerifyGetKey;
  now?: () => Date;
  signal?: AbortSignal;
}

const unavailable = (): never => { throw new Error("Service token unavailable."); };

const issuanceTimeoutMs = 5_000;
const maximumTokenResponseBytes = 16_384;

const canonicalIssuer = (value: string): URL | undefined => {
  try {
    const issuer = new URL(value);
    if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash) return undefined;
    if (!issuer.pathname.endsWith("/")) issuer.pathname += "/";
    return issuer.href === value ? issuer : undefined;
  } catch {
    return undefined;
  }
};

const canonicalAudience = (value: string): URL | undefined => {
  try {
    const audience = new URL(value);
    return audience.protocol === "https:" && !audience.username && !audience.password && !audience.search && !audience.hash
      && audience.pathname === "/mcp" && audience.href === value ? audience : undefined;
  } catch {
    return undefined;
  }
};

const beforeDeadline = async <T>(work: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) return unavailable();
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new Error("service token deadline exceeded"));
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
};

export async function issueServiceToken(env: Environment, options: ServiceTokenOptions = {}): Promise<string> {
  const issuerValue = env.NEMLIG_MCP_AUTH0_ISSUER?.trim();
  const audience = env.NEMLIG_MCP_PUBLIC_URL?.trim();
  const clientId = env.NEMLIG_MCP_SERVICE_CLIENT_ID?.trim();
  const clientSecret = env.NEMLIG_MCP_SERVICE_CLIENT_SECRET;
  if (!issuerValue || !audience || !clientId || !clientSecret) return unavailable();
  const issuer = canonicalIssuer(issuerValue);
  const publicUrl = canonicalAudience(audience);
  if (!issuer || !publicUrl) return unavailable();
  const tokenEndpoint = new URL("oauth/token", issuer);
  const now = options.now?.() ?? new Date();
  const deadline = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(issuanceTimeoutMs)]) : AbortSignal.timeout(issuanceTimeoutMs);
  try {
    const response = await beforeDeadline((options.fetcher ?? fetch)(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        audience,
        scope: SERVICE_ACCEPTANCE_SCOPE,
      }),
      redirect: "error",
      signal: deadline,
    }), deadline);
    if (!response.ok) return unavailable();
    const serialized = await beforeDeadline(response.text(), deadline);
    if (new TextEncoder().encode(serialized).byteLength > maximumTokenResponseBytes) return unavailable();
    const body = JSON.parse(serialized) as { access_token?: unknown; refresh_token?: unknown };
    if (typeof body.access_token !== "string" || !body.access_token || body.refresh_token !== undefined) return unavailable();
    const key = options.key ?? createRemoteJWKSet(new URL(".well-known/jwks.json", issuer), {
      timeoutDuration: issuanceTimeoutMs,
      [customFetch]: async (url, init) => await beforeDeadline((options.fetcher ?? fetch)(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.any([deadline, init.signal]),
      }), deadline),
    });
    const { payload } = await beforeDeadline(jwtVerify(body.access_token, key, {
      issuer: issuer.href,
      audience,
      algorithms: ["RS256"],
      currentDate: now,
    }), deadline);
    const scopes = typeof payload.scope === "string" ? payload.scope.split(/\s+/u).filter(Boolean) : [];
    if (payload.sub !== `${clientId}@clients` || payload.azp !== clientId || scopes.length !== 1 || scopes[0] !== SERVICE_ACCEPTANCE_SCOPE
      || typeof payload.exp !== "number" || payload.exp < Math.floor(now.getTime() / 1_000) + 27 * 60) return unavailable();
    return body.access_token;
  } catch {
    return unavailable();
  }
}
