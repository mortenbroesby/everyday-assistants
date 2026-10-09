import assert from "node:assert/strict";
import test from "node:test";
import {
  parseGatewayRequestEvent,
  parseViewerResourceReadEvent,
  shouldEmitGatewayRequestEvent,
  type GatewayRequestEvent,
} from "./cloudflare-observability.js";

const safeEvent: GatewayRequestEvent = {
  schema_version: 2,
  event: "gateway_request_terminal",
  request_id: "00000000-0000-4000-8000-000000000000",
  revision: "abc123",
  route: "mcp",
  method: "POST",
  operation: "useful",
  denial_reason: "none",
  outcome: "completed",
  status: 200,
  elapsed_ms: 42,
};

test("terminal request evidence accepts only the closed privacy-safe schema", () => {
  assert.deepEqual(parseGatewayRequestEvent(safeEvent), safeEvent);
  for (const sensitiveKey of [
    "error",
    "headers",
    "body",
    "query",
    "token",
    "cookie",
    "arguments",
    "stack",
    "tier",
  ]) {
    assert.throws(() =>
      parseGatewayRequestEvent({
        ...safeEvent,
        [sensitiveKey]: "representative-secret-value",
      }),
    );
  }
  assert.throws(() => parseGatewayRequestEvent({ ...safeEvent, revision: "" }));
  assert.throws(() =>
    parseGatewayRequestEvent({
      ...safeEvent,
      outcome: "private-provider-response",
    }),
  );
  assert.throws(() =>
    parseGatewayRequestEvent({ ...safeEvent, schema_version: 1 }),
  );
  assert.throws(() =>
    parseGatewayRequestEvent({ ...safeEvent, operation: "expensive" }),
  );
});

test("every privacy-safe terminal event is emitted for bounded diagnosis", () => {
  const events = Array.from({ length: 10_000 }, (_, index) => ({
    ...safeEvent,
    request_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    outcome: "protocol_completed" as const,
  }));
  assert.equal(events.every(shouldEmitGatewayRequestEvent), true);
  assert.equal(
    shouldEmitGatewayRequestEvent({
      ...safeEvent,
      outcome: "authentication_rejected",
    }),
    true,
  );
  assert.equal(
    shouldEmitGatewayRequestEvent({ ...safeEvent, outcome: "backend_timeout" }),
    true,
  );
});

test("viewer binding evidence permits only a URI class, served artifact digest, and request-local correlation", () => {
  const event = {
    schema_version: 1 as const,
    event: "viewer_resource_read" as const,
    correlation_id: "00000000-0000-4000-8000-000000000000",
    uri_class: "current" as const,
    artifact_id: "a".repeat(64),
  };
  assert.deepEqual(parseViewerResourceReadEvent(event), event);
  for (const sensitiveKey of [
    "uri",
    "body",
    "headers",
    "token",
    "principal",
    "session",
    "chat",
    "shopping_data",
  ]) {
    assert.throws(() =>
      parseViewerResourceReadEvent({
        ...event,
        [sensitiveKey]: "representative-secret-value",
      }),
    );
  }
  assert.deepEqual(
    parseViewerResourceReadEvent({
      ...event,
      uri_class: "retired",
      artifact_id: null,
    }),
    { ...event, uri_class: "retired", artifact_id: null },
  );
  assert.throws(() =>
    parseViewerResourceReadEvent({ ...event, artifact_id: "not-a-digest" }),
  );
});
