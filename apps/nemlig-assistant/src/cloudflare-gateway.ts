import { loadGatewayConfig, type CloudflareEnv, type GatewayConfig } from "./cloudflare-config.js";
import {
  classifyGatewayMethod,
  classifyGatewayRoute,
  parseGatewayRequestEvent,
  shouldEmitGatewayRequestEvent,
  type GatewayOutcome,
  type GatewayRequestEvent,
} from "./cloudflare-observability.js";
import type { AdmissionResult, UsageState } from "./cloudflare-usage.js";

export type OperationClass = "protocol" | "normal" | "expensive";

export interface GatewayDeadline {
  readonly signal: AbortSignal;
  readonly remainingMs: number;
}

export interface GatewayDependencies {
  authenticate(token: string, config: GatewayConfig, deadline: GatewayDeadline): Promise<void>;
  admit(operation: OperationClass, config: GatewayConfig, deadline: GatewayDeadline): Promise<AdmissionResult>;
  forward(request: Request, operation: OperationClass, config: GatewayConfig, deadline: GatewayDeadline): Promise<Response>;
  resetUsage?(config: GatewayConfig, deadline: GatewayDeadline): Promise<UsageState>;
  usage?(config: GatewayConfig, deadline: GatewayDeadline): Promise<UsageState | undefined>;
  event?(event: GatewayRequestEvent): void;
  now?(): number;
  requestId?(): string;
}

class BoundaryTimeoutError extends Error {
  constructor(readonly outcome: GatewayOutcome) {
    super(outcome);
  }
}

const normalTools = new Set([
  "find_groceries",
  "show_my_favorites",
  "show_grocery_sections",
  "browse_grocery_section",
  "save_my_shopping_plan",
  "continue_my_shopping_plan",
  "show_my_shopping_lists",
  "save_my_shopping_list",
  "copy_my_shopping_list",
  "set_my_shopping_list_status",
  "migrate_my_saved_plan",
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

const readBoundedBody = async (request: Request, signal: AbortSignal): Promise<string | Response> => {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const cancel = () => { void reader.cancel(); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    while (true) {
      if (signal.aborted) throw new DOMException("Request deadline exceeded", "AbortError");
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode();
      size += value.byteLength;
      if (size > 1_048_576) {
        await reader.cancel();
        return new Response("Request too large", { status: 413 });
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    signal.removeEventListener("abort", cancel);
  }
};

const withRequestId = (response: Response, requestId: string): Response => {
  const headers = new Headers(response.headers);
  headers.set("x-nemlig-request-id", requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

async function withinBoundary<T>(
  work: (deadline: GatewayDeadline) => Promise<T>,
  maximumMs: number,
  remainingMs: () => number,
  totalSignal: AbortSignal,
  boundaryOutcome: GatewayOutcome,
): Promise<T> {
  const remaining = remainingMs();
  if (remaining <= 0 || totalSignal.aborted) throw new BoundaryTimeoutError("request_timeout");
  const budget = Math.max(1, Math.min(maximumMs, remaining));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  const signal = AbortSignal.any([totalSignal, controller.signal]);
  try {
    return await Promise.race([
      work({ signal, remainingMs: budget }),
      new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => {
        reject(new BoundaryTimeoutError(totalSignal.aborted || remaining <= maximumMs ? "request_timeout" : boundaryOutcome));
      }, { once: true })),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

interface ClassifiedRequest { operation: OperationClass; request: Request }

const classifyRequest = async (request: Request, signal: AbortSignal): Promise<ClassifiedRequest | Response> => {
  if (request.method === "GET" || request.method === "DELETE") return { operation: "protocol", request };
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length < 0 || length > 1_048_576) return new Response("Request too large", { status: 413 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return new Response("JSON content type required", { status: 415 });
  }
  try {
    const body = await readBoundedBody(request, signal);
    if (body instanceof Response) return body;
    return {
      operation: classifyMcpMessage(JSON.parse(body)),
      request: new Request(request, { body }),
    };
  } catch (error) {
    if (signal.aborted) throw error;
    return new Response("Invalid JSON", { status: 400 });
  }
};

export async function handleGatewayRequest(
  request: Request,
  env: CloudflareEnv,
  dependencies: GatewayDependencies,
): Promise<Response> {
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const requestId = dependencies.requestId?.() ?? crypto.randomUUID();
  const url = new URL(request.url);
  const route = classifyGatewayRoute(url.pathname);
  const method = classifyGatewayMethod(request.method);
  let revision = env.NEMLIG_MCP_REVISION?.trim() || "unconfigured";
  let operation: GatewayRequestEvent["operation"] = "none";
  let emitted = false;
  const finish = (response: Response, outcome: GatewayOutcome): Response => {
    if (!emitted) {
      emitted = true;
      const event = parseGatewayRequestEvent({
        schema_version: 1,
        event: "gateway_request_terminal",
        request_id: requestId,
        revision,
        route,
        method,
        operation,
        outcome,
        status: response.status,
        elapsed_ms: Math.min(120_000, Math.max(0, Math.round(now() - startedAt))),
      });
      if (shouldEmitGatewayRequestEvent(event)) dependencies.event?.(event);
    }
    return withRequestId(response, requestId);
  };

  if (env.MCP_ENABLED !== "true") return finish(new Response("MCP temporarily disabled", { status: 503 }), "disabled");

  let config: GatewayConfig;
  try {
    config = loadGatewayConfig(env);
    revision = config.revision;
  } catch {
    return finish(new Response("MCP configuration invalid", { status: 503 }), "configuration_rejected");
  }

  const totalController = new AbortController();
  const totalTimer = setTimeout(() => totalController.abort(), config.totalTimeoutMs);
  const remainingMs = () => config.totalTimeoutMs - (now() - startedAt);
  try {
    if (url.pathname === "/healthz") return finish(json({ status: "ok", enabled: true }), "protocol_completed");
    if (url.pathname === "/revision") return finish(json({ revision: config.revision }), "protocol_completed");
    if (url.pathname === `/.well-known/oauth-protected-resource${config.publicUrl.pathname}`) {
      return finish(json({
        resource: config.publicUrl.href,
        authorization_servers: [config.issuer.href],
        scopes_supported: [config.requiredScope],
        bearer_methods_supported: ["header"],
      }), "protocol_completed");
    }
    const admin = url.pathname === "/admin/usage" || url.pathname === "/admin/reset-breaker";
    if (url.pathname !== "/mcp" && !admin) return finish(new Response("Not found", { status: 404 }), "request_rejected");

    const origin = request.headers.get("origin");
    if (origin && !config.allowedOrigins.includes(origin)) return finish(json({ error: "origin_not_allowed" }, 403), "request_rejected");
    const classified = admin
      ? { operation: "protocol" as const, request }
      : await withinBoundary((deadline) => classifyRequest(request, deadline.signal), remainingMs(), remainingMs, totalController.signal, "request_timeout");
    if (classified instanceof Response) return finish(classified, "request_rejected");
    operation = classified.operation;
    const authorization = request.headers.get("authorization");
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/iu);
    if (!match?.[1]) return finish(new Response("Unauthorized", { status: 401 }), "authentication_rejected");
    try {
      await withinBoundary(
        (deadline) => dependencies.authenticate(match[1] as string, config, deadline),
        config.authTimeoutMs, remainingMs, totalController.signal, "authentication_timeout",
      );
    } catch (error) {
      if (error instanceof BoundaryTimeoutError) return finish(json({ error: error.outcome }, 504), error.outcome);
      return finish(new Response("Unauthorized", { status: 401 }), "authentication_rejected");
    }
    if (url.pathname === "/admin/usage") {
      if (request.method !== "GET" || !dependencies.usage) return finish(new Response("Method not allowed", { status: 405 }), "request_rejected");
      try {
        const usage = await withinBoundary((deadline) => dependencies.usage!(config, deadline), config.controlTimeoutMs, remainingMs, totalController.signal, "control_timeout");
        return finish(json(usage ?? { status: "unused" }), "completed");
      } catch (error) {
        const outcome = error instanceof BoundaryTimeoutError ? error.outcome : "backend_failed";
        return finish(json({ error: outcome }, outcome.endsWith("timeout") ? 504 : 502), outcome);
      }
    }
    if (url.pathname === "/admin/reset-breaker") {
      if (request.method !== "POST" || !dependencies.resetUsage) return finish(new Response("Method not allowed", { status: 405 }), "request_rejected");
      try {
        const usage = await withinBoundary((deadline) => dependencies.resetUsage!(config, deadline), config.controlTimeoutMs, remainingMs, totalController.signal, "control_timeout");
        return finish(json(usage), "completed");
      } catch (error) {
        const outcome = error instanceof BoundaryTimeoutError ? error.outcome : "backend_failed";
        return finish(json({ error: outcome }, outcome.endsWith("timeout") ? 504 : 502), outcome);
      }
    }
    let admission: AdmissionResult;
    try {
      admission = await withinBoundary((deadline) => dependencies.admit(classified.operation, config, deadline), config.controlTimeoutMs, remainingMs, totalController.signal, "control_timeout");
    } catch (error) {
      const outcome = error instanceof BoundaryTimeoutError ? error.outcome : "backend_failed";
      return finish(json({ error: outcome }, outcome.endsWith("timeout") ? 504 : 502), outcome);
    }
    if (!admission.admitted) {
      const outcome = admission.reason === "rate_limit" ? "rate_limited" : "breaker_rejected";
      return finish(json({ error: admission.reason }, admission.status), outcome);
    }
    try {
      const response = await withinBoundary(
        (deadline) => dependencies.forward(classified.request, classified.operation, config, deadline),
        config.backendTimeoutMs, remainingMs, totalController.signal, "backend_timeout",
      );
      return finish(response, classified.operation === "protocol" ? "protocol_completed" : "completed");
    } catch (error) {
      const outcome = error instanceof BoundaryTimeoutError
        ? error.outcome
        : error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")
          ? "backend_timeout"
          : "backend_failed";
      return finish(json({ error: outcome }, outcome.endsWith("timeout") ? 504 : 502), outcome);
    }
  } catch (error) {
    const outcome = error instanceof BoundaryTimeoutError ? error.outcome : "backend_failed";
    return finish(json({ error: outcome }, outcome.endsWith("timeout") ? 504 : 502), outcome);
  } finally {
    clearTimeout(totalTimer);
  }
}
