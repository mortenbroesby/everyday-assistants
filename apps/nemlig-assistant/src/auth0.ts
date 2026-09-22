import type { OAuthMetadata } from "@modelcontextprotocol/server";
import { OpenIdProviderDiscoveryMetadataSchema } from "@modelcontextprotocol/core";
import { OAuthError, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/server";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/express";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { parsePrincipalPolicy, type PrincipalPolicy } from "./principal-policy.js";

export interface Auth0Config {
  issuer: URL;
  audience: string;
  principalPolicy: PrincipalPolicy;
  requiredScope: string;
  publicUrl: URL;
  allowedOrigins: string[];
  revision: string;
  host: "127.0.0.1" | "0.0.0.0";
  port: number;
  credentialKey?: string;
  credentialKeyVersion?: string;
  serviceAcceptance?: { clientId: string };
}

export const SERVICE_ACCEPTANCE_SCOPE = "acceptance:nemlig-assistant";

export type Auth0InfrastructureKind = "unavailable" | "timeout";

/** A verifier or discovery dependency failed; this is not a token rejection. */
export class Auth0InfrastructureError extends Error {
  constructor(readonly kind: Auth0InfrastructureKind, message?: string) {
    super(message ?? (kind === "timeout" ? "Auth0 verification timed out." : "Auth0 verification unavailable."));
    this.name = "Auth0InfrastructureError";
  }
}

const errorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
};

const errorName = (error: unknown): string | undefined => error instanceof Error ? error.name : undefined;

const isAuth0Timeout = (error: unknown): boolean => {
  const code = errorCode(error);
  const name = errorName(error);
  return name === "JWKSTimeout" || code === "ERR_JWKS_TIMEOUT"
    || error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
};

const isJoseValidationError = (error: unknown): boolean => {
  const code = errorCode(error);
  return typeof code === "string" && code.startsWith("ERR_") && !code.startsWith("ERR_JWKS_");
};

export const oauthReconnectChallenge = (publicUrl: URL): string =>
  `Bearer resource_metadata="${getOAuthProtectedResourceMetadataUrl(publicUrl)}", error="invalid_token", error_description="Reconnect Nemlig Assistant to continue"`;

const invalidAccessToken = (): OAuthError => new OAuthError("invalid_token", "Invalid access token");

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

export function loadAuth0Config(env: NodeJS.ProcessEnv = process.env): Auth0Config {
  const issuer = new URL(required(env, "NEMLIG_MCP_AUTH0_ISSUER"));
  const publicUrl = new URL(required(env, "NEMLIG_MCP_PUBLIC_URL"));
  const host = env.NEMLIG_MCP_HTTP_HOST?.trim() || "127.0.0.1";
  const port = Number(env.NEMLIG_MCP_HTTP_PORT ?? "3333");
  if (issuer.protocol !== "https:" || issuer.search || issuer.hash) throw new Error("Auth0 issuer must be an HTTPS URL without query or fragment.");
  if (!issuer.pathname.endsWith("/")) issuer.pathname += "/";
  const loopbackUrl = publicUrl.protocol === "http:" && publicUrl.hostname === "127.0.0.1" && Number(publicUrl.port) === port;
  if ((publicUrl.protocol !== "https:" && !loopbackUrl) || publicUrl.pathname !== "/mcp" || publicUrl.search || publicUrl.hash) {
    throw new Error("MCP resource URL must be HTTPS or the configured loopback /mcp URL.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("NEMLIG_MCP_HTTP_PORT must be a valid port.");
  if (host !== "127.0.0.1" && host !== "0.0.0.0") throw new Error("NEMLIG_MCP_HTTP_HOST must be 127.0.0.1 or 0.0.0.0.");
  const principalPolicy = parsePrincipalPolicy(env.NEMLIG_MCP_PRINCIPALS);
  const credentialKey = env.NEMLIG_MCP_CREDENTIAL_KEY?.trim();
  const credentialKeyVersion = env.NEMLIG_MCP_CREDENTIAL_KEY_VERSION?.trim();
  const serviceAcceptanceEnabled = env.NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED === "true";
  if (principalPolicy.schema_version === 2
    && (!credentialKey || !/^[A-Za-z0-9_-]{43}$/u.test(credentialKey)
      || !credentialKeyVersion || !/^[A-Za-z0-9._-]{1,32}$/u.test(credentialKeyVersion))) {
    throw new Error("Schema-v2 credential encryption configuration is invalid.");
  }
  return {
    issuer,
    audience: required(env, "NEMLIG_MCP_AUTH0_AUDIENCE"),
    principalPolicy,
    requiredScope: env.NEMLIG_MCP_REQUIRED_SCOPE?.trim() || "use:nemlig-assistant",
    publicUrl,
    allowedOrigins: (env.NEMLIG_MCP_ALLOWED_ORIGINS ?? "https://chatgpt.com,https://chat.openai.com")
      .split(",").map((value) => value.trim()).filter(Boolean),
    revision: env.NEMLIG_MCP_REVISION?.trim() || "development",
    host,
    port,
    ...(credentialKey ? { credentialKey } : {}),
    ...(credentialKeyVersion ? { credentialKeyVersion } : {}),
    ...(serviceAcceptanceEnabled ? { serviceAcceptance: { clientId: required(env, "NEMLIG_MCP_SERVICE_CLIENT_ID") } } : {}),
  };
}

export async function fetchAuth0Metadata(
  config: Auth0Config,
  fetcher: typeof fetch = fetch,
  timeoutMs = 5_000,
): Promise<{ oauth: OAuthMetadata; jwksUrl: URL }> {
  try {
    const response = await fetcher(new URL(".well-known/openid-configuration", config.issuer), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Auth0InfrastructureError("unavailable", "Auth0 discovery failed.");
    const metadata = OpenIdProviderDiscoveryMetadataSchema.parse(await response.json());
    if (metadata.issuer !== config.issuer.href) throw new Auth0InfrastructureError("unavailable", "Auth0 discovery issuer mismatch.");
    const endpoints = [
      ["authorization", metadata.authorization_endpoint],
      ["token", metadata.token_endpoint],
      ["JWKS", metadata.jwks_uri],
    ] as const;
    if (endpoints.some(([, endpoint]) => !endpoint.startsWith("https://"))) {
      throw new Auth0InfrastructureError("unavailable", "Auth0 discovery endpoints must use HTTPS.");
    }
    if (!metadata.code_challenge_methods_supported?.includes("S256")) {
      throw new Auth0InfrastructureError("unavailable", "Auth0 discovery must advertise PKCE S256.");
    }
    return { oauth: metadata, jwksUrl: new URL(metadata.jwks_uri) };
  } catch (error) {
    if (error instanceof Auth0InfrastructureError) throw error;
    throw new Auth0InfrastructureError(error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError") ? "timeout" : "unavailable", "Auth0 discovery failed.");
  }
}

export function createAuth0Verifier(
  config: Auth0Config,
  jwksUrl: URL,
  key?: JWTVerifyGetKey,
  timeoutMs = 5_000,
): OAuthTokenVerifier {
  const verificationKey = key ?? createRemoteJWKSet(jwksUrl, { timeoutDuration: timeoutMs });
  return {
    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, verificationKey, {
          issuer: config.issuer.href,
          audience: config.audience,
          algorithms: ["RS256"],
        });
        const scopes = typeof payload.scope === "string" ? payload.scope.split(/\s+/u).filter(Boolean) : [];
        const service = config.serviceAcceptance;
        const serviceSubject = service ? `${service.clientId}@clients` : undefined;
        const serviceToken = payload.sub === serviceSubject && payload.azp === service?.clientId
          && scopes.length === 1 && scopes[0] === SERVICE_ACCEPTANCE_SCOPE
          && typeof payload.exp === "number" && Number.isFinite(payload.exp);
        const claimsServiceIdentity = !!service && (payload.sub === serviceSubject || payload.azp === service.clientId);
        if (typeof payload.sub !== "string" || !payload.sub
          || (claimsServiceIdentity ? !serviceToken : !scopes.includes(config.requiredScope))) throw invalidAccessToken();
        return {
          token,
          clientId: typeof payload.azp === "string" ? payload.azp : "unknown",
          scopes,
          expiresAt: payload.exp,
          extra: { subject: payload.sub },
        };
      } catch (error) {
        if (error instanceof OAuthError) throw error;
        if (isAuth0Timeout(error)) {
          throw new Auth0InfrastructureError("timeout");
        }
        if (errorCode(error) === "ERR_JWKS_NO_MATCHING_KEY") throw invalidAccessToken();
        if (errorName(error) === "JWKSInvalid" || errorName(error) === "JWKSMultipleMatchingKeys"
          || errorCode(error)?.startsWith("ERR_JWKS_") || !isJoseValidationError(error)) {
          throw new Auth0InfrastructureError("unavailable");
        }
        throw invalidAccessToken();
      }
    },
  };
}
