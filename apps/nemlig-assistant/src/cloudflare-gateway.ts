import { loadGatewayConfig, type CloudflareEnv, type GatewayConfig } from "./cloudflare-config.js";
import type { AdmissionResult, UsageState } from "./cloudflare-usage.js";

export type OperationClass = "protocol" | "normal" | "expensive";

export interface GatewayDependencies {
  authenticate(token: string, config: GatewayConfig): Promise<void>;
  admit(operation: OperationClass, config: GatewayConfig): Promise<AdmissionResult>;
  forward(request: Request, operation: OperationClass, config: GatewayConfig): Promise<Response>;
  resetUsage?(config: GatewayConfig): Promise<UsageState>;
  usage?(config: GatewayConfig): Promise<UsageState | undefined>;
  event?(name: string, fields?: Record<string, string | number | boolean>): void;
}

const normalTools = new Set([
  "find_groceries",
  "show_my_favorites",
  "show_grocery_sections",
  "browse_grocery_section",
  "save_my_shopping_plan",
  "show_my_basket",
  "review_items_to_add",
  "review_item_to_remove",
  "review_item_swap",
  "review_emptying_basket",
  "choose_products_visually",
]);

export function classifyMcpMessage(value: unknown): OperationClass {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "expensive";
  const message = value as { method?: unknown; params?: unknown };
  if (typeof message.method !== "string") return "expensive";
  if (message.method !== "tools/call") return "protocol";
  const params = message.params;
  const name = params && typeof params === "object" && "name" in params ? (params as { name?: unknown }).name : undefined;
  return typeof name === "string" && normalTools.has(name) ? "normal" : "expensive";
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

const readBoundedBody = async (request: Request): Promise<string | Response> => {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return body + decoder.decode();
    size += value.byteLength;
    if (size > 1_048_576) {
      return new Response("Request too large", { status: 413 });
    }
    body += decoder.decode(value, { stream: true });
  }
};

interface ClassifiedRequest { operation: OperationClass; request: Request }

const classifyRequest = async (request: Request): Promise<ClassifiedRequest | Response> => {
  if (request.method === "GET" || request.method === "DELETE") return { operation: "protocol", request };
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length < 0 || length > 1_048_576) return new Response("Request too large", { status: 413 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return new Response("JSON content type required", { status: 415 });
  }
  try {
    const body = await readBoundedBody(request);
    if (body instanceof Response) return body;
    return {
      operation: classifyMcpMessage(JSON.parse(body)),
      request: new Request(request, { body }),
    };
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
};

export async function handleGatewayRequest(
  request: Request,
  env: CloudflareEnv,
  dependencies: GatewayDependencies,
): Promise<Response> {
  if (env.MCP_ENABLED !== "true") {
    dependencies.event?.("disabled");
    return new Response("MCP temporarily disabled", { status: 503 });
  }

  let config: GatewayConfig;
  try {
    config = loadGatewayConfig(env);
  } catch {
    dependencies.event?.("configuration_rejected");
    return new Response("MCP configuration invalid", { status: 503 });
  }

  const url = new URL(request.url);
  if (url.pathname === "/healthz") return json({ status: "ok", enabled: true });
  if (url.pathname === "/revision") return json({ revision: config.revision });
  if (url.pathname === `/.well-known/oauth-protected-resource${config.publicUrl.pathname}`) {
    return json({
      resource: config.publicUrl.href,
      authorization_servers: [config.issuer.href],
      scopes_supported: [config.requiredScope],
      bearer_methods_supported: ["header"],
    });
  }
  const admin = url.pathname === "/admin/usage" || url.pathname === "/admin/reset-breaker";
  if (url.pathname !== "/mcp" && !admin) return new Response("Not found", { status: 404 });

  const origin = request.headers.get("origin");
  if (origin && !config.allowedOrigins.includes(origin)) return json({ error: "origin_not_allowed" }, 403);
  const classified = admin ? { operation: "protocol" as const, request } : await classifyRequest(request);
  if (classified instanceof Response) return classified;
  const { operation, request: boundedRequest } = classified;
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/iu);
  if (!match?.[1]) {
    dependencies.event?.("authentication_rejected");
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    await dependencies.authenticate(match[1], config);
  } catch {
    dependencies.event?.("authentication_rejected");
    return new Response("Unauthorized", { status: 401 });
  }
  if (url.pathname === "/admin/usage") {
    if (request.method !== "GET" || !dependencies.usage) return new Response("Method not allowed", { status: 405 });
    return json(await dependencies.usage(config) ?? { status: "unused" });
  }
  if (url.pathname === "/admin/reset-breaker") {
    if (request.method !== "POST" || !dependencies.resetUsage) return new Response("Method not allowed", { status: 405 });
    return json(await dependencies.resetUsage(config));
  }
  const admission = await dependencies.admit(operation, config);
  if (!admission.admitted) {
    dependencies.event?.(admission.reason === "rate_limit" ? "rate_limited" : "breaker_rejected", {
      operation, reason: admission.reason,
    });
    return json({ error: admission.reason }, admission.status);
  }
  try {
    return await dependencies.forward(boundedRequest, operation, config);
  } catch (error) {
    const timeout = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    dependencies.event?.(timeout ? "backend_timeout" : "backend_failed", { operation });
    return json({ error: timeout ? "backend_timeout" : "backend_failed" }, timeout ? 504 : 502);
  }
}
