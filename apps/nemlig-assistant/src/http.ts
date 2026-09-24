#!/usr/bin/env node

import { createMcpHandler, OAuthError, type AuthInfo, type OAuthMetadata } from "@modelcontextprotocol/server";
import { createMcpExpressApp, getOAuthProtectedResourceMetadataUrl, mcpAuthMetadataRouter, requireBearerAuth, type OAuthTokenVerifier } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { realpathSync } from "node:fs";
import { basename } from "node:path";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Auth0InfrastructureError, createAuth0Verifier, fetchAuth0Metadata, loadAuth0Config, SERVICE_ACCEPTANCE_SCOPE, type Auth0Config } from "./auth0.js";
import { NemligClient, type ShoppingClient } from "./client.js";
import { createMcpServer, serviceAcceptanceToolInventory } from "./mcp.js";
import { BasketProposalService } from "./proposals.js";
import { findEnabledPrincipal, MAX_PRINCIPALS, type Principal } from "./principal-policy.js";
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

const servicePrincipal: Principal = { subject: "service", principal_key: "s".repeat(32), tier: 2, enabled: true };
const serviceContext = (): PrincipalContext => {
  const product = () => ({ id: 1, name: "Service fixture banana", price: 1, unit: "1 kr/stk.", unitPrice: 1, unitSize: "1 stk.", brand: "Fixture", category: "Frugt", subcategory: "Bananer", imageUrl: "", available: true, labels: [], isOrganic: false, isFrozen: false, isRefrigerated: false, isDairy: false, isLactoseFree: false, isGlutenFree: false, isVegan: true, isOnDiscount: false });
  const client: ShoppingClient = {
    isLoggedIn: () => true, login: async () => {}, searchProducts: async () => [product()], getProduct: async () => product(), getFreshProduct: async () => product(),
    listFavorites: async () => [product()], listDepartments: async () => [{ id: "/frugt", name: "Frugt" }], browseDepartment: async () => ({ products: [product()], page: 1, hasNext: false }),
    getCart: async () => ({ items: [], productsPrice: 0, deliveryPrice: 0, numberOfProducts: 0, deliveryTime: undefined }),
    addToCart: async () => { throw new Error("service fixture is read-only"); }, removeFromCart: async () => { throw new Error("service fixture is read-only"); }, clearCart: async () => { throw new Error("service fixture is read-only"); },
  };
  return { client, proposals: new BasketProposalService(client) };
};

const isCredentialFreeRequest = (request: Request): boolean => {
  // Schema-v2 profile discovery must work before provider credential onboarding.
  const body = request.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const method = (body as { method?: unknown }).method;
  if (method === "server/discover") return true;
  if (method !== "tools/call") return false;
  const params = (body as { params?: unknown }).params;
  return !!params && typeof params === "object" && !Array.isArray(params) && (params as { name?: unknown }).name === "get_profile";
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
  mcpEnv: NodeJS.ProcessEnv = process.env,
) {
  const app = createMcpExpressApp({ host: config.host });
  const contexts = new Map<string, PrincipalContext>();
  const requestContexts = new WeakMap<AuthInfo, {
    context: PrincipalContext;
    principal: Principal;
    credentials: Credentials | undefined;
    service: boolean;
  }>();
  const handler = createMcpHandler(({ authInfo }) => {
    if (!authInfo) throw new Error("Authenticated request context is missing");
    const requestContext = requestContexts.get(authInfo);
    if (!requestContext) throw new Error("Validated principal context is missing");
    const { context, principal, credentials, service } = requestContext;
    return createMcpServer(
      context.client,
      async () => credentials,
      mcpEnv,
      context.proposals,
      { principalKey: principal.principal_key, policyRevision: config.principalPolicy.revision, tier: principal.tier, ...(service ? { kind: "service" as const } : {}) },
    );
  }, { legacy: "stateless" });
  const nodeHandler = toNodeHandler(handler, { onerror: () => undefined });
  app.locals.mcpHandler = handler;
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
    verifier: {
      async verifyAccessToken(token) {
        try {
          return await verifier.verifyAccessToken(token);
        } catch (error) {
          if (error instanceof Auth0InfrastructureError) throw new OAuthError("server_error", error.kind === "timeout" ? "Authentication timeout." : "Authentication unavailable.");
          throw error;
        }
      },
    },
    requiredScopes: [],
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
      const service = config.serviceAcceptance
        && req.auth?.clientId === config.serviceAcceptance.clientId
        && subject === `${config.serviceAcceptance.clientId}@clients`
        && req.auth.scopes.length === 1 && req.auth.scopes[0] === SERVICE_ACCEPTANCE_SCOPE;
      if (service && req.method === "POST" && req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
        const message = req.body as { method?: unknown; params?: unknown };
        if (message.method === "tools/call") {
          const name = message.params && typeof message.params === "object" && !Array.isArray(message.params)
            ? (message.params as { name?: unknown }).name
            : undefined;
          if (typeof name !== "string" || !serviceAcceptanceToolInventory.includes(name as typeof serviceAcceptanceToolInventory[number])) {
            return res.status(403).json({ error: "principal_not_allowed" });
          }
        }
      }
      if (!service && !req.auth?.scopes.includes(config.requiredScope)) return res.status(403).json({ error: "principal_not_allowed" });
      const configured = !service && typeof subject === "string" ? findEnabledPrincipal(config.principalPolicy, subject) : undefined;
      let principal = configured;
      let credentials: Credentials | undefined = configured?.nemlig;
      let generation = 0;
      if (service) {
        principal = servicePrincipal;
        credentials = undefined;
      } else if (config.principalPolicy.schema_version === 2 && typeof subject === "string"
        && (!isCredentialFreeRequest(req) || req.get("x-nemlig-credential-envelope"))) {
        const principalKey = req.get("x-nemlig-principal-key");
        const policyRevision = req.get("x-nemlig-policy-revision");
        const generationValue = Number(req.get("x-nemlig-credential-generation"));
        const encodedEnvelope = req.get("x-nemlig-credential-envelope");
        if (!principalKey && !policyRevision && !req.get("x-nemlig-credential-generation") && !encodedEnvelope) {
          principal = configured ?? { subject, principal_key: "p".repeat(32), tier: 1, enabled: true };
        } else if (!principalKey || policyRevision !== config.principalPolicy.revision
          || !Number.isSafeInteger(generationValue) || generationValue < 1 || !encodedEnvelope
          || !config.credentialKey || !config.credentialKeyVersion) {
          return res.status(403).json({ error: "principal_not_allowed" });
        } else {
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
      }
      if (!principal) return res.status(403).json({ error: "principal_not_allowed" });
      const contextKey = `${principal.principal_key}:${config.principalPolicy.revision}:${generation}`;
      let context = service ? serviceContext() : contexts.get(contextKey);
      if (!context) {
        for (const key of contexts.keys()) if (key.startsWith(`${principal.principal_key}:`)) contexts.delete(key);
        if (contexts.size >= MAX_PRINCIPALS) return res.status(503).json({ error: "principal_capacity_unavailable" });
        context = createContext(principal);
        contexts.set(contextKey, context);
      }
      const authInfo = req.auth;
      if (!authInfo) return res.status(403).json({ error: "principal_not_allowed" });
      requestContexts.set(authInfo, { context, principal, credentials, service: Boolean(service) });
      try {
        await nodeHandler(req, res, req.body);
      } finally {
        requestContexts.delete(authInfo);
      }
    } catch {
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32_603, message: "Internal server error" }, id: null });
    }
  });
  return app;
}

export async function startHttpServer(env: NodeJS.ProcessEnv = process.env): Promise<Server> {
  const config = loadAuth0Config(env);
  let app: ReturnType<typeof createHttpApp> | undefined;
  let startupError = false;
  const server = createServer((request, response) => {
    if (app) return app(request, response);
    response.statusCode = 503;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ error: startupError ? "server_unavailable" : "server_starting" }));
  });
  server.once("close", () => { void app?.locals.mcpHandler?.close(); });
  await new Promise<void>((resolve, reject) => {
    server.listen(config.port, config.host, () => resolve());
    server.once("error", reject);
  });
  void fetchAuth0Metadata(config).then(({ oauth, jwksUrl }) => {
    app = createHttpApp(config, oauth, createAuth0Verifier(config, jwksUrl));
  }).catch((error) => {
    startupError = true;
    console.error(error instanceof Auth0InfrastructureError ? error.message : "MCP server startup failed.");
  });
  return server;
}

if (process.argv[1] && ["http.js", "http.ts"].includes(basename(realpathSync(process.argv[1])))) {
  startHttpServer().then((server) => {
    console.error(`Nemlig MCP HTTP listening on ${configAddress(server)}.`);
  }).catch(() => {
    console.error("Nemlig MCP HTTP server failed.");
    process.exitCode = 1;
  });
}
