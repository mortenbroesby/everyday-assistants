import assert from "node:assert/strict";
import test from "node:test";
import {
  readJourneyTiming,
  timedJourneyContainerFetch,
} from "./journey-timing.js";

const request = new Request("https://journey.example/mcp");

test("an initially stopped container measures readiness separately from response headers", async () => {
  let time = 0;
  const response = await timedJourneyContainerFetch(request, {
    isRunning: () => false,
    status: async () => "stopped",
    ready: async () => {
      time += 1500;
    },
    forward: async () => {
      time += 23;
      return new Response("result", {
        headers: { "server-timing": "private;desc=payload" },
      });
    },
    now: () => time,
  });
  assert.deepEqual(readJourneyTiming(response.headers), {
    container_state: "cold",
    ready_ms: 1500,
    mcp_headers_ms: 23,
  });
  assert.doesNotMatch(
    response.headers.get("server-timing")!,
    /private|payload/,
  );
  assert.equal(await response.text(), "result");
});

test("a running healthy container is measured without repeating the readiness probe", async () => {
  const response = await timedJourneyContainerFetch(request, {
    isRunning: () => true,
    status: async () => "healthy",
    ready: async () => assert.fail("unexpected wake"),
    forward: async () => new Response(null, { status: 204 }),
    now: () => 0,
  });
  assert.deepEqual(readJourneyTiming(response.headers), {
    container_state: "warm",
    ready_ms: 0,
    mcp_headers_ms: 0,
  });
});

test("a failed readiness probe gives bounded evidence and never forwards or leaks raw errors", async () => {
  let time = 0;
  const response = await timedJourneyContainerFetch(request, {
    isRunning: () => true,
    status: async () => "running",
    ready: async () => {
      time += 130000;
      throw new Error("private");
    },
    forward: async () => assert.fail("attempt after failure"),
    now: () => time,
  });
  assert.equal(response.status, 503);
  assert.deepEqual(readJourneyTiming(response.headers), {
    container_state: "starting",
    ready_ms: 120000,
  });
  assert.doesNotMatch(await response.text(), /private/);
});

test("runner accepts only closed metrics and bounded integer durations", () => {
  const headers = new Headers({
    "server-timing":
      'auth;dur=123, ready;dur=120001, mcp_headers;dur=-1, pwd;desc="private", container;desc="unexpected"',
  });
  assert.deepEqual(readJourneyTiming(headers), { auth_ms: 123 });
});
