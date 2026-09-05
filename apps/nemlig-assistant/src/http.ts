#!/usr/bin/env node

import { getOAuthProtectedResourceMetadataUrl, mcpAuthMetadataRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename } from "node:path";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createAuth0Verifier, fetchAuth0Metadata, loadAuth0Config, type Auth0Config } from "./auth0.js";
import type { ShoppingClient } from "./cli.js";
import { NemligClient } from "./client.js";
import { createMcpServer } from "./mcp.js";
import { BasketProposalService } from "./proposals.js";
import type { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { findEnabledPrincipal, type Principal } from "./principal-policy.js";

export interface PrincipalContext {
  client: ShoppingClient;
  proposals: BasketProposalService;
}

export type PrincipalContextFactory = (principal: Principal) => PrincipalContext;

const defaultPrincipalContext: PrincipalContextFactory = () => {
  const client = new NemligClient();
  return { client, proposals: new BasketProposalService(client) };
};

type Request = IncomingMessage & { auth?: AuthInfo; body?: unknown; get(name: string): string | undefined };
type Response = ServerResponse & {
  headersSent: boolean;
  json(body: unknown): Response;
  status(code: number): Response;
};
type Next = () => void;

const configAddress = (server: Server): string => {
  const address = server.address();
  return typeof address === "object" && address ? `${address.address}:${address.port}` : String(address);
};

export function createHttpApp(
  config: Auth0Config,
  oauth: OAuthMetadata,
  verifier: OAuthTokenVerifier,
  createContext: PrincipalContextFactory = defaultPrincipalContext,
) {
  const app = createMcpExpressApp({ host: config.host });
  const contexts = new Map<string, PrincipalContext>();
  const sessions = new Map<string, { principalKey: string; policyRevision: string; transport: StreamableHTTPServerTransport }>();
  app.use(mcpAuthMetadataRouter({
    oauthMetadata: oauth,
    resourceServerUrl: config.publicUrl,
    scopesSupported: [config.requiredScope],
    resourceName: "Nemlig Assistant",
  }));
  app.get("/healthz", (_req: Request, res: Response) => res.json({ status: "ok" }));
  app.get("/readyz", (_req: Request, res: Response) => res.json({ status: "ready" }));
  app.get("/revision", (_req: Request, res: Response) => res.json({ revision: config.revision }));

  const authenticate = requireBearerAuth({
    verifier,
    requiredScopes: [config.requiredScope],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(config.publicUrl),
  });
  app.use("/mcp", (req: Request, res: Response, next: Next) => {
    const origin = req.get("origin");
    if (origin && !config.allowedOrigins.includes(origin)) return res.status(403).json({ error: "origin_not_allowed" });
    return next();
  }, authenticate);

  app.all("/mcp", async (req: Request, res: Response) => {
    try {
      const subject = req.auth?.extra?.subject;
      const principal = typeof subject === "string" ? findEnabledPrincipal(config.principalPolicy, subject) : undefined;
      if (!principal) return res.status(403).json({ error: "principal_not_allowed" });
      const sessionId = req.get("mcp-session-id");
      const session = sessionId ? sessions.get(sessionId) : undefined;
      if (session && (session.principalKey !== principal.principal_key || session.policyRevision !== config.principalPolicy.revision)) {
        return res.status(403).json({ error: "principal_not_allowed" });
      }
      let transport = session?.transport;
      if (!transport && req.method === "POST" && isInitializeRequest(req.body)) {
        let context = contexts.get(principal.principal_key);
        if (!context) {
          if (contexts.size >= config.principalPolicy.principals.length) {
            return res.status(503).json({ error: "principal_capacity_unavailable" });
          }
          context = createContext(principal);
          contexts.set(principal.principal_key, context);
        }
        const createdTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          onsessioninitialized: (id) => { sessions.set(id, { principalKey: principal.principal_key, policyRevision: config.principalPolicy.revision, transport: createdTransport }); },
          onsessionclosed: (id) => { sessions.delete(id); },
        });
        transport = createdTransport;
        transport.onclose = () => {
          if (transport?.sessionId) sessions.delete(transport.sessionId);
        };
        await createMcpServer(
          context.client,
          async () => principal.nemlig,
          process.env,
          context.proposals,
          undefined,
          { principalKey: principal.principal_key, policyRevision: config.principalPolicy.revision, tier: principal.tier },
        ).connect(transport);
      }
      if (!transport) return res.status(400).json({ jsonrpc: "2.0", error: { code: -32_000, message: "Invalid or missing session." }, id: null });
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32_603, message: "Internal server error" }, id: null });
    }
  });
  return app;
}

export async function startHttpServer(env: NodeJS.ProcessEnv = process.env): Promise<Server> {
  const config = loadAuth0Config(env);
  const { oauth, jwksUrl } = await fetchAuth0Metadata(config);
  const app = createHttpApp(config, oauth, createAuth0Verifier(config, jwksUrl));
  return await new Promise((resolve, reject) => {
    const server = app.listen(config.port, config.host, () => resolve(server));
    server.once("error", reject);
  });
}

if (process.argv[1] && ["http.js", "http.ts"].includes(basename(realpathSync(process.argv[1])))) {
  startHttpServer().then((server) => {
    console.error(`Nemlig MCP HTTP listening on ${configAddress(server)}.`);
  }).catch(() => {
    console.error("Nemlig MCP HTTP server failed.");
    process.exitCode = 1;
  });
}
