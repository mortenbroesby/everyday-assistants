import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
  type FetchLike,
} from "@modelcontextprotocol/client";
import { readJourneyTiming } from "../src/journey-timing.js";
import { runShoppingJourney } from "./shopping-journey.js";

type Evidence = ReturnType<typeof readJourneyTiming> & { http_status?: number };

export function journeyTarget(env: NodeJS.ProcessEnv) {
  const endpoint = new URL(env.NEMLIG_JOURNEY_ENDPOINT ?? "");
  const token = env.NEMLIG_JOURNEY_TOKEN;
  assert.ok(token);
  assert.match(endpoint.href, /^https:\/\/127\.0\.0\.1:\d+\/mcp$/u);
  return { endpoint, token };
}

type Target = ReturnType<typeof journeyTarget>;

export function journeyFetch(
  target: Target,
  signal: AbortSignal,
  report: (e: Evidence) => void,
  send: FetchLike = fetch,
): FetchLike {
  return async (input, init) => {
    assert.equal(new URL(input).href, target.endpoint.href);
    report({});
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${target.token}`);
    const response = await send(input, {
      ...init,
      headers,
      redirect: "error",
      signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal,
    });
    report({
      http_status: response.status,
      ...readJourneyTiming(response.headers),
    });
    return response;
  };
}

type Sample = "first" | "second";
export function checkSample(evidence: Evidence, sample: Sample) {
  assert.ok(evidence.container_state);
  assert.notEqual(evidence.ready_ms, undefined);
  assert.notEqual(evidence.auth_ms, undefined);
  assert.notEqual(evidence.mcp_headers_ms, undefined);
  assert.equal(evidence.container_state, sample === "first" ? "cold" : "warm");
}

async function runSample(target: Target, sample: Sample, signal: AbortSignal) {
  const client = new Client(
    { name: "nemlig-shopping-journey", version: "1.0.0" },
    {
      versionNegotiation: {
        mode: { pin: "2026-07-28" },
        probe: { maxRetries: 0, timeoutMs: 90_000 },
      },
    },
  );
  let evidence: Evidence = {};
  const transport = new StreamableHTTPClientTransport(target.endpoint, {
    fetch: journeyFetch(target, signal, (value) => {
      evidence = value;
    }),
  });
  const startedAt = performance.now();
  let outcome = "fail";
  try {
    try {
      await client.connect(transport, { signal, timeout: 90_000 });
      assert.ok(client.getServerVersion());
      checkSample(evidence, sample);
      outcome = "pass";
    } finally {
      console.log(
        JSON.stringify({
          operation: "server/discover",
          sample,
          outcome,
          ...evidence,
          elapsed_ms: Math.round(performance.now() - startedAt),
        }),
      );
    }
    if (sample === "second") {
      await runShoppingJourney(client, target.endpoint.origin, (step) => {
        console.log(JSON.stringify({ ...step, ...evidence }));
      });
    }
  } finally {
    await client.close();
  }
}

async function main() {
  const target = journeyTarget(process.env);
  const signal = AbortSignal.timeout(180_000);
  await runSample(target, "first", signal);
  await runSample(target, "second", signal);
}

if (import.meta.main) {
  main().catch(() => {
    console.error("Shopping journey failed.");
    process.exitCode = 1;
  });
}
