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
import { MAX_PRINCIPALS } from "./principal-policy.js";
import { decryptCredentials, type CredentialEnvelope } from "./credential-envelope.js";
import type { Credentials } from "./config.js";

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
  createValidationClient: () => Pick<NemligClient, "validateCredentials"> = () => new NemligClient(),
) {
  const app = createMcpExpressApp({ host: config.host });
  const contexts = new Map<string, PrincipalContext>();
  const sessions = new Map<string, { principalKey: string; policyRevision: string; generation: number; transport: StreamableHTTPServerTransport }>();
  app.use(mcpAuthMetadataRouter({
    oauthMetadata: oauth,
    resourceServerUrl: config.publicUrl,
    scopesSupported: [config.requiredScope],
    resourceName: "Nemlig Assistant",
  }));
  app.get("/healthz", (_req: Request, res: Response) => res.json({ status: "ok" }));
  app.get("/readyz", (_req: Request, res: Response) => res.json({ status: "ready" }));
  app.get("/revision", (_req: Request, res: Response) => res.json({ revision: config.revision }));
  app.post("/__credential-validation", async (req: Request, res: Response) => {
    try {
      const principalKey = req.get("x-nemlig-principal-key");
      const policyRevision = req.get("x-nemlig-policy-revision");
      const generation = Number(req.get("x-nemlig-credential-generation"));
      const encoded = req.get("x-nemlig-credential-envelope");
      if (!principalKey || policyRevision !== config.principalPolicy.revision || !Number.isSafeInteger(generation)
        || generation < 1 || !encoded || !config.credentialKey || !config.credentialKeyVersion) return res.status(403).json({ error: "validation_rejected" });
      const credentials = await decryptCredentials(JSON.parse(atob(encoded)), {
        principalKey, policyRevision, keyVersion: config.credentialKeyVersion, generation,
      }, config.credentialKey);
      const client = createValidationClient();
      await client.validateCredentials(credentials.username, credentials.password, AbortSignal.timeout(20_000));
      return res.status(204).json({});
    } catch {
      return res.status(401).json({ error: "validation_failed" });
    }
  });

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
      const configured = typeof subject === "string" ? findEnabledPrincipal(config.principalPolicy, subject) : undefined;
      let principal = configured;
      let credentials: Credentials | undefined = configured?.nemlig;
      let generation = 0;
      if (config.principalPolicy.schema_version === 2 && typeof subject === "string") {
        const principalKey = req.get("x-nemlig-principal-key");
        const policyRevision = req.get("x-nemlig-policy-revision");
        const generationValue = Number(req.get("x-nemlig-credential-generation"));
        const encodedEnvelope = req.get("x-nemlig-credential-envelope");
        if (!principalKey || policyRevision !== config.principalPolicy.revision
          || !Number.isSafeInteger(generationValue) || generationValue < 1 || !encodedEnvelope
          || !config.credentialKey || !config.credentialKeyVersion) {
          return res.status(403).json({ error: "principal_not_allowed" });
        }
        try {
          const envelope = JSON.parse(atob(encodedEnvelope)) as CredentialEnvelope;
          if (configured && configured.principal_key !== principalKey) return res.status(403).json({ error: "principal_not_allowed" });
          principal = configured ?? { subject, principal_key: principalKey, tier: 1, enabled: true };
          generation = generationValue;
          credentials = await decryptCredentials(envelope, {
            principalKey,
            policyRevision,
            keyVersion: config.credentialKeyVersion,
            generation,
          }, config.credentialKey);
        } catch {
          return res.status(403).json({ error: "principal_not_allowed" });
        }
      }
      if (!principal) return res.status(403).json({ error: "principal_not_allowed" });
      if (!credentials) return res.status(409).json({ error: "connection_required", connection_url: "https://nemlig-mcp.broesby.dk/connect" });
      const sessionId = req.get("mcp-session-id");
      const session = sessionId ? sessions.get(sessionId) : undefined;
      if (session && (session.principalKey !== principal.principal_key
        || session.policyRevision !== config.principalPolicy.revision || session.generation !== generation)) {
        return res.status(403).json({ error: "reconnect_required", connection_url: "https://nemlig-mcp.broesby.dk/connect" });
      }
      let transport = session?.transport;
      if (!transport && req.method === "POST" && isInitializeRequest(req.body)) {
        const contextKey = `${principal.principal_key}:${generation}`;
        let context = contexts.get(contextKey);
        if (!context) {
          for (const key of contexts.keys()) if (key.startsWith(`${principal.principal_key}:`)) contexts.delete(key);
          if (contexts.size >= MAX_PRINCIPALS) {
            return res.status(503).json({ error: "principal_capacity_unavailable" });
          }
          context = createContext(principal);
          contexts.set(contextKey, context);
        }
        const createdTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          onsessioninitialized: (id) => { sessions.set(id, { principalKey: principal.principal_key, policyRevision: config.principalPolicy.revision, generation, transport: createdTransport }); },
          onsessionclosed: (id) => { sessions.delete(id); },
        });
        transport = createdTransport;
        transport.onclose = () => {
          if (transport?.sessionId) sessions.delete(transport.sessionId);
        };
        await createMcpServer(
          context.client,
          async () => credentials,
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
