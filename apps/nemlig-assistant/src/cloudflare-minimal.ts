import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Auth0InfrastructureError, oauthReconnectChallenge } from "./auth0.js";
import type { CloudflareEnv, GatewayConfig } from "./cloudflare-config.js";
import { findEnabledPrincipal, parsePrincipalPolicy, type Principal } from "./principal-policy.js";
import { createProfileMcpServer } from "./profile-mcp-server.js";

export interface MinimalConfig {
  issuer: URL;
  audience: string;
  principalPolicy: GatewayConfig["principalPolicy"];
  requiredScope: string;
  publicUrl: URL;
  allowedOrigins: string[];
  revision: string;
  authTimeoutMs: number;
  enabled: boolean;
}

export interface MinimalDependencies {
  authenticate(token: string, config: MinimalConfig, signal: AbortSignal): Promise<Principal | undefined>;
  event?(event: { boundary: string; outcome: string; request_id: string; revision: string; status?: number }): void;
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

const event = (
  dependencies: MinimalDependencies,
  requestId: string,
  revision: string,
  boundary: string,
  outcome: string,
  status?: number,
): void => {
  dependencies.event?.({ boundary, outcome, request_id: requestId, revision, ...(status === undefined ? {} : { status }) });
};

const unauthorized = (config: MinimalConfig): Response => new Response("Unauthorized", {
  status: 401,
  headers: { "www-authenticate": oauthReconnectChallenge(config.publicUrl) },
});

export function loadMinimalConfig(env: CloudflareEnv): MinimalConfig {
  const issuer = new URL(env.NEMLIG_MCP_AUTH0_ISSUER?.trim() || "");
  const publicUrl = new URL(env.NEMLIG_MCP_PUBLIC_URL?.trim() || "");
  if (issuer.protocol !== "https:" || issuer.search || issuer.hash) throw new Error("Invalid Auth0 issuer.");
  if (!issuer.pathname.endsWith("/")) issuer.pathname += "/";
  if (publicUrl.protocol !== "https:" || publicUrl.pathname !== "/mcp" || publicUrl.search || publicUrl.hash) {
    throw new Error("Invalid MCP resource URL.");
  }
  const authTimeoutMs = Number(env.MCP_AUTH_TIMEOUT_MS ?? "5000");
  if (!Number.isSafeInteger(authTimeoutMs) || authTimeoutMs < 1 || authTimeoutMs > 10_000) throw new Error("Invalid auth timeout.");
  return {
    issuer,
    audience: env.NEMLIG_MCP_AUTH0_AUDIENCE?.trim() || (() => { throw new Error("Missing Auth0 audience."); })(),
    principalPolicy: parsePrincipalPolicy(env.NEMLIG_MCP_PRINCIPALS),
    requiredScope: env.NEMLIG_MCP_REQUIRED_SCOPE?.trim() || "use:nemlig-assistant",
    publicUrl,
    allowedOrigins: (env.NEMLIG_MCP_ALLOWED_ORIGINS ?? "https://chatgpt.com,https://chat.openai.com")
      .split(",").map((value) => value.trim()).filter(Boolean),
    revision: env.NEMLIG_MCP_REVISION?.trim() || "development",
    authTimeoutMs,
    enabled: env.MCP_ENABLED === "true",
  };
}

export async function handleMinimalMcpRequest(
  request: Request,
  config: MinimalConfig,
  dependencies: MinimalDependencies,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  event(dependencies, requestId, config.revision, "request_received", "started");
  if (url.pathname === "/healthz") return json({ status: "ok", enabled: true });
  if (url.pathname === "/revision") return json({ revision: config.revision });
  if (url.pathname === `/.well-known/oauth-protected-resource${config.publicUrl.pathname}`) {
    return json({
      resource: config.publicUrl.href,
      resource_name: "Nemlig Assistant",
      authorization_servers: [config.issuer.href],
      scopes_supported: [config.requiredScope],
      bearer_methods_supported: ["header"],
    });
  }
  if (url.pathname !== "/mcp") return new Response("Not found", { status: 404 });
  const origin = request.headers.get("origin");
  if (origin && !config.allowedOrigins.includes(origin)) return json({ error: "origin_not_allowed" }, 403);
  if (!config.enabled) return new Response("MCP temporarily disabled", { status: 503 });
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+([^\s]+)$/iu)?.[1];
  event(dependencies, requestId, config.revision, "bearer", token ? "present" : "missing");
  if (!token) return unauthorized(config);
  let principal: Principal | undefined;
  try {
    principal = await dependencies.authenticate(token, config, AbortSignal.timeout(config.authTimeoutMs));
  } catch (error) {
    const status = error instanceof Auth0InfrastructureError ? (error.kind === "timeout" ? 504 : 503) : 401;
    event(dependencies, requestId, config.revision, "token", error instanceof Auth0InfrastructureError ? "infrastructure_error" : "rejected", status);
    return error instanceof Auth0InfrastructureError ? json({ error: error.kind === "timeout" ? "authentication_timeout" : "authentication_unavailable" }, status) : unauthorized(config);
  }
  if (!principal) {
    event(dependencies, requestId, config.revision, "principal", "rejected", 403);
    return json({ error: "principal_not_allowed" }, 403);
  }
  event(dependencies, requestId, config.revision, "token", "accepted");
  event(dependencies, requestId, config.revision, "principal", "authorized");
  event(dependencies, requestId, config.revision, "mcp", "reached");
  const server = createProfileMcpServer({
    principalKey: principal.principal_key,
    policyRevision: config.principalPolicy.revision,
    tier: principal.tier,
  }, config.requiredScope,
  () => event(dependencies, requestId, config.revision, "get_profile", "called"),
  () => event(dependencies, requestId, config.revision, "get_profile", "completed", 200));
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    event(dependencies, requestId, config.revision, "mcp", "completed", response.status);
    return response;
  } catch {
    event(dependencies, requestId, config.revision, "mcp", "failed", 502);
    return json({ error: "mcp_failed" }, 502);
  }
}

export const minimalPrincipal = (config: MinimalConfig, subject: string): Principal | undefined =>
  findEnabledPrincipal(config.principalPolicy, subject);
