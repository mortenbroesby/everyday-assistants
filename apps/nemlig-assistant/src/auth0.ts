import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { OpenIdProviderDiscoveryMetadataSchema, type OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface Auth0Config {
  issuer: URL;
  audience: string;
  ownerSubject: string;
  requiredScope: string;
  publicUrl: URL;
  allowedOrigins: string[];
  revision: string;
  host: "127.0.0.1";
  port: number;
}

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

export function loadAuth0Config(env: NodeJS.ProcessEnv = process.env): Auth0Config {
  const issuer = new URL(required(env, "NEMLIG_MCP_AUTH0_ISSUER"));
  const publicUrl = new URL(required(env, "NEMLIG_MCP_PUBLIC_URL"));
  const port = Number(env.NEMLIG_MCP_HTTP_PORT ?? "3333");
  if (issuer.protocol !== "https:" || issuer.search || issuer.hash) throw new Error("Auth0 issuer must be an HTTPS URL without query or fragment.");
  if (!issuer.pathname.endsWith("/")) issuer.pathname += "/";
  const loopbackUrl = publicUrl.protocol === "http:" && publicUrl.hostname === "127.0.0.1" && Number(publicUrl.port) === port;
  if ((publicUrl.protocol !== "https:" && !loopbackUrl) || publicUrl.pathname !== "/mcp" || publicUrl.search || publicUrl.hash) {
    throw new Error("MCP resource URL must be HTTPS or the configured loopback /mcp URL.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("NEMLIG_MCP_HTTP_PORT must be a valid port.");
  return {
    issuer,
    audience: required(env, "NEMLIG_MCP_AUTH0_AUDIENCE"),
    ownerSubject: required(env, "NEMLIG_MCP_AUTH0_OWNER_SUBJECT"),
    requiredScope: env.NEMLIG_MCP_REQUIRED_SCOPE?.trim() || "use:nemlig-assistant",
    publicUrl,
    allowedOrigins: (env.NEMLIG_MCP_ALLOWED_ORIGINS ?? "https://chatgpt.com,https://chat.openai.com")
      .split(",").map((value) => value.trim()).filter(Boolean),
    revision: env.NEMLIG_MCP_REVISION?.trim() || "development",
    host: "127.0.0.1",
    port,
  };
}

export async function fetchAuth0Metadata(
  config: Auth0Config,
  fetcher: typeof fetch = fetch,
): Promise<{ oauth: OAuthMetadata; jwksUrl: URL }> {
  const response = await fetcher(new URL(".well-known/openid-configuration", config.issuer));
  if (!response.ok) throw new Error("Auth0 discovery failed.");
  const metadata = OpenIdProviderDiscoveryMetadataSchema.parse(await response.json());
  if (metadata.issuer !== config.issuer.href) throw new Error("Auth0 discovery issuer mismatch.");
  return { oauth: metadata, jwksUrl: new URL(metadata.jwks_uri) };
}

export function createAuth0Verifier(
  config: Auth0Config,
  jwksUrl: URL,
  key: JWTVerifyGetKey = createRemoteJWKSet(jwksUrl),
): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: config.issuer.href,
          audience: config.audience,
          algorithms: ["RS256"],
        });
        if (payload.sub !== config.ownerSubject) throw new Error("wrong owner");
        const scopes = typeof payload.scope === "string" ? payload.scope.split(/\s+/u).filter(Boolean) : [];
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
