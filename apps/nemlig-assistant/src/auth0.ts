import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { OpenIdProviderDiscoveryMetadataSchema, type OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
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
}

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
  };
}

export async function fetchAuth0Metadata(
  config: Auth0Config,
  fetcher: typeof fetch = fetch,
  timeoutMs = 5_000,
): Promise<{ oauth: OAuthMetadata; jwksUrl: URL }> {
  const response = await fetcher(new URL(".well-known/openid-configuration", config.issuer), {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error("Auth0 discovery failed.");
  const metadata = OpenIdProviderDiscoveryMetadataSchema.parse(await response.json());
  if (metadata.issuer !== config.issuer.href) throw new Error("Auth0 discovery issuer mismatch.");
  return { oauth: metadata, jwksUrl: new URL(metadata.jwks_uri) };
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
        if (typeof payload.sub !== "string" || !payload.sub || !scopes.includes(config.requiredScope)) {
          throw new Error("required claims missing");
        }
        return {
          token,
          clientId: typeof payload.azp === "string" ? payload.azp : "unknown",
          scopes,
          expiresAt: payload.exp,
          extra: { subject: payload.sub },
        };
      } catch {
        throw new InvalidTokenError("Invalid access token");
      }
    },
  };
}

export async function verifyAuth0BrowserIdToken(
  token: string,
  input: { issuer: URL; clientId: string; nonce: string; organizationId: string },
  key: JWTVerifyGetKey,
): Promise<{ subject: string; emailVerified: true; organizationId: string }> {
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: input.issuer.href,
      audience: input.clientId,
      algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string" || !payload.sub || payload.nonce !== input.nonce
      || payload.org_id !== input.organizationId || payload.email_verified !== true
      || typeof payload.email !== "string" || !payload.email) throw new Error("required claims missing");
    return { subject: payload.sub, emailVerified: true, organizationId: input.organizationId };
  } catch {
    throw new InvalidTokenError("Invalid ID token");
  }
}
