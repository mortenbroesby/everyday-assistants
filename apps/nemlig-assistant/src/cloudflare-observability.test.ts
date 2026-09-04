import assert from "node:assert/strict";
import test from "node:test";
import {
  parseGatewayRequestEvent,
  shouldEmitGatewayRequestEvent,
  type GatewayRequestEvent,
} from "./cloudflare-observability.js";

const safeEvent: GatewayRequestEvent = {
  schema_version: 1,
  event: "gateway_request_terminal",
  request_id: "00000000-0000-4000-8000-000000000000",
  revision: "abc123",
  route: "mcp",
  method: "POST",
  operation: "normal",
  outcome: "completed",
  status: 200,
  elapsed_ms: 42,
};

test("terminal request evidence accepts only the closed privacy-safe schema", () => {
  assert.deepEqual(parseGatewayRequestEvent(safeEvent), safeEvent);
  for (const sensitiveKey of ["error", "headers", "body", "query", "token", "cookie", "arguments", "stack"]) {
    assert.throws(() => parseGatewayRequestEvent({ ...safeEvent, [sensitiveKey]: "representative-secret-value" }));
  }
  assert.throws(() => parseGatewayRequestEvent({ ...safeEvent, revision: "" }));
  assert.throws(() => parseGatewayRequestEvent({ ...safeEvent, outcome: "private-provider-response" }));
});

test("ordinary protocol and authentication noise is deterministic one-percent sampling", () => {
  const sampled = Array.from({ length: 10_000 }, (_, index) => ({
    ...safeEvent,
    request_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    outcome: "protocol_completed" as const,
  })).filter(shouldEmitGatewayRequestEvent);
  assert.ok(sampled.length >= 80 && sampled.length <= 120, `sampled ${sampled.length} of 10000`);
  assert.equal(shouldEmitGatewayRequestEvent({ ...safeEvent, outcome: "authentication_rejected" }),
    shouldEmitGatewayRequestEvent({ ...safeEvent, outcome: "authentication_rejected" }));
  assert.equal(shouldEmitGatewayRequestEvent({ ...safeEvent, outcome: "backend_timeout" }), true);
});
