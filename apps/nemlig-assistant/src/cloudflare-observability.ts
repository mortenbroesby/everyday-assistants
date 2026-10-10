import { z } from "zod";

const routeSchema = z.enum([
  "health",
  "revision",
  "oauth_metadata",
  "mcp",
  "unknown",
]);
const methodSchema = z.enum(["GET", "POST", "DELETE", "OTHER"]);
const operationSchema = z.enum([
  "protocol",
  "profile",
  "local",
  "useful",
  "none",
]);
const denialReasonSchema = z.enum([
  "none",
  "mcp_disabled",
  "configuration_invalid",
  "request_invalid",
  "origin_not_allowed",
  "authentication_required",
  "authentication_failed",
  "principal_not_allowed",
  "credential_required",
]);
const outcomeSchema = z.enum([
  "completed",
  "protocol_completed",
  "disabled",
  "configuration_rejected",
  "request_rejected",
  "authentication_rejected",
  "authentication_timeout",
  "authentication_unavailable",
  "control_timeout",
  "connection_required",
  "backend_timeout",
  "backend_rejected",
  "request_timeout",
  "backend_failed",
]);

const gatewayRequestEventSchema = z
  .object({
    schema_version: z.literal(2),
    event: z.literal("gateway_request_terminal"),
    request_id: z.string().uuid(),
    revision: z.string().min(1).max(128),
    route: routeSchema,
    method: methodSchema,
    operation: operationSchema,
    denial_reason: denialReasonSchema,
    outcome: outcomeSchema,
    status: z.number().int().min(100).max(599),
    elapsed_ms: z.number().int().min(0).max(120_000),
  })
  .strict();

export type GatewayRequestEvent = z.infer<typeof gatewayRequestEventSchema>;
export type GatewayRoute = GatewayRequestEvent["route"];
export type GatewayMethod = GatewayRequestEvent["method"];
export type GatewayOutcome = GatewayRequestEvent["outcome"];

/** Bounded resource-binding evidence. It never contains a raw URI or user data. */
const viewerResourceReadEventSchema = z
  .object({
    schema_version: z.literal(1),
    event: z.literal("viewer_resource_read"),
    correlation_id: z.string().uuid(),
    uri_class: z.enum(["current", "retired", "other"]),
    artifact_id: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
  })
  .strict();

export type ViewerResourceReadEvent = z.infer<
  typeof viewerResourceReadEventSchema
>;

const productDiscoveryEventSchema = z
  .object({
    schema_version: z.literal(1),
    event: z.literal("product_discovery_diagnostic"),
    stage: z.enum(["shallow", "detail", "deadline", "cancelled"]),
    error_class: z.enum([
      "authentication",
      "deadline",
      "cancelled",
      "provider",
      "unknown",
    ]),
    active_read_count: z.number().int().nonnegative(),
  })
  .strict();

export type ProductDiscoveryEvent = z.infer<typeof productDiscoveryEventSchema>;

export function parseGatewayRequestEvent(value: unknown): GatewayRequestEvent {
  return gatewayRequestEventSchema.parse(value);
}

export function parseViewerResourceReadEvent(
  value: unknown,
): ViewerResourceReadEvent {
  return viewerResourceReadEventSchema.parse(value);
}

export function parseProductDiscoveryEvent(
  value: unknown,
): ProductDiscoveryEvent {
  return productDiscoveryEventSchema.parse(value);
}

export function classifyGatewayRoute(pathname: string): GatewayRoute {
  if (pathname === "/healthz") {
    return "health";
  }
  if (pathname === "/revision") {
    return "revision";
  }
  if (pathname.startsWith("/.well-known/oauth-protected-resource")) {
    return "oauth_metadata";
  }
  if (pathname === "/mcp") {
    return "mcp";
  }
  return "unknown";
}

export function classifyGatewayMethod(method: string): GatewayMethod {
  return method === "GET" || method === "POST" || method === "DELETE"
    ? method
    : "OTHER";
}

export function shouldEmitGatewayRequestEvent(
  event: GatewayRequestEvent,
): boolean {
  void event;
  return true;
}
