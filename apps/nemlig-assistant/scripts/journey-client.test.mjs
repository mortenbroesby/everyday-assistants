import assert from "node:assert/strict";
import test from "node:test";
import { checkSample, journeyFetch, journeyTarget } from "./journey-client.ts";
import { cleanupJourneyImage } from "./journey-local.mjs";
import { installJourneyIssuer } from "./journey-issuer.mjs";

const { AbortSignal, Response } = globalThis;
const local = {
  NEMLIG_JOURNEY_TOKEN: "test",
  NEMLIG_JOURNEY_ENDPOINT: "https://127.0.0.1:4000/mcp",
};

test("client sends tokens only to exact TLS loopback endpoints", async () => {
  for (const target of [
    "https://nemlig-mcp.broesby.dk/mcp",
    "https://another.invalid/mcp",
    "http://127.0.0.1:4000/mcp",
    "https://u@127.0.0.1:4000/mcp",
    "https://127.0.0.1:4000/mcp?q=1",
  ]) {
    assert.throws(() =>
      journeyTarget({ ...local, NEMLIG_JOURNEY_ENDPOINT: target }),
    );
  }
  const config = journeyTarget(local);
  const evidence = [];
  const send = journeyFetch(
    config,
    AbortSignal.timeout(2000),
    (e) => evidence.push(e),
    async (_url, init) => {
      assert.equal(init.headers.get("authorization"), "Bearer test");
      assert.equal(init.redirect, "error");
      return new Response("ok", {
        headers: {
          "server-timing": "auth;dur=11, private;desc=test",
        },
      });
    },
  );
  assert.equal(await (await send(config.endpoint)).text(), "ok");
  assert.deepEqual(evidence.at(-1), { http_status: 200, auth_ms: 11 });
  await assert.rejects(send("https://another.invalid/mcp"));
});

test("local sample requires actual cold then warm state with all phase timings", () => {
  const first = {
    container_state: "cold",
    auth_ms: 0,
    ready_ms: 1,
    mcp_headers_ms: 2,
  };
  checkSample(first, "first");
  assert.throws(() => checkSample(first, "second"));
  assert.throws(() => checkSample({ ...first, auth_ms: undefined }, "first"));
  checkSample({ ...first, container_state: "warm" }, "second");
});

test("local issuer serves a public discovery document and key to both verifiers", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("other");
    const jwk = { kty: "RSA", kid: "test" };
    installJourneyIssuer(jwk);
    const doc = await (
      await globalThis.fetch(
        "https://journey-issuer.invalid/.well-known/openid-configuration",
      )
    ).json();
    assert.deepEqual(await (await globalThis.fetch(doc.jwks_uri)).json(), {
      keys: [jwk],
    });
    assert.equal(
      (await globalThis.fetch("https://journey-issuer.invalid/login")).status,
      404,
    );
    assert.equal(
      await (await globalThis.fetch("https://elsewhere.invalid")).text(),
      "other",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("cleanup targets only this invocation's exact Wrangler Docker tag", () => {
  const calls = [];
  cleanupJourneyImage(
    "synthetic",
    { WRANGLER_DOCKER_BIN: "configured" },
    (engine, args, options) => {
      assert.equal(engine, "configured");
      assert.equal(options.timeout, 10000);
      calls.push(args);
      return "shared:current\ncloudflare-dev/localjourneycontainer:0011aabb\ncloudflare-dev/other:0011aabb\n<none>:<none>";
    },
  );
  assert.ok(calls[0].includes("label=dk.broesby.nemlig.journey=synthetic"));
  assert.deepEqual(calls.slice(1), [
    ["image", "rm", "cloudflare-dev/localjourneycontainer:0011aabb"],
  ]);
});

test("network diagnostics retain only a recognized transport failure code", async () => {
  const target = journeyTarget(local);
  const events = [];
  const send = journeyFetch(
    target,
    AbortSignal.timeout(2000),
    (value) => events.push(value),
    async () => {
      throw new TypeError("private detail", { cause: { code: "ECONNRESET" } });
    },
  );
  await assert.rejects(send(target.endpoint));
  assert.deepEqual(events.at(-1), { transport_error: "ECONNRESET" });
});
