import { z } from "zod";

const routeSchema = z.enum([
  "health",
  "revision",
  "oauth_metadata",
  "mcp",
  "admin_usage",
  "admin_reset",
  "unknown",
]);
const methodSchema = z.enum(["GET", "POST", "DELETE", "OTHER"]);
const operationSchema = z.enum(["protocol", "normal", "expensive", "none"]);
const outcomeSchema = z.enum([
  "completed",
  "protocol_completed",
  "disabled",
  "configuration_rejected",
  "request_rejected",
  "authentication_rejected",
  "authentication_timeout",
  "control_timeout",
  "rate_limited",
  "breaker_rejected",
  "backend_timeout",
  "request_timeout",
  "backend_failed",
]);

export const gatewayRequestEventSchema = z.object({
  schema_version: z.literal(1),
  event: z.literal("gateway_request_terminal"),
  request_id: z.string().uuid(),
  revision: z.string().min(1).max(128),
  route: routeSchema,
  method: methodSchema,
  operation: operationSchema,
  outcome: outcomeSchema,
  status: z.number().int().min(100).max(599),
  elapsed_ms: z.number().int().min(0).max(120_000),
}).strict();

export type GatewayRequestEvent = z.infer<typeof gatewayRequestEventSchema>;
export type GatewayRoute = GatewayRequestEvent["route"];
export type GatewayMethod = GatewayRequestEvent["method"];
export type GatewayOutcome = GatewayRequestEvent["outcome"];

export function parseGatewayRequestEvent(value: unknown): GatewayRequestEvent {
  return gatewayRequestEventSchema.parse(value);
}

export function classifyGatewayRoute(pathname: string): GatewayRoute {
  if (pathname === "/healthz") return "health";
  if (pathname === "/revision") return "revision";
  if (pathname.startsWith("/.well-known/oauth-protected-resource")) return "oauth_metadata";
  if (pathname === "/mcp") return "mcp";
  if (pathname === "/admin/usage") return "admin_usage";
  if (pathname === "/admin/reset-breaker") return "admin_reset";
  return "unknown";
}

export function classifyGatewayMethod(method: string): GatewayMethod {
  return method === "GET" || method === "POST" || method === "DELETE" ? method : "OTHER";
}

export function shouldEmitGatewayRequestEvent(event: GatewayRequestEvent): boolean {
  if (event.outcome !== "protocol_completed" && event.outcome !== "authentication_rejected") return true;
  let hash = 2_166_136_261;
  for (const character of event.request_id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % 100 === 0;
}
