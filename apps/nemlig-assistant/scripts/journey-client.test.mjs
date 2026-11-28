import assert from "node:assert/strict";
import test from "node:test";
import { checkSample, journeyFetch, journeyTarget } from "./journey-client.ts";
import { installJourneyIssuer } from "./journey-issuer.mjs";
import { ensureDocker } from "./journey-local.mjs";

const { AbortSignal, Response } = globalThis;
const staging = {
  NEMLIG_JOURNEY_TOKEN: "test",
  NEMLIG_JOURNEY_EXPECTED_REVISION: "a".repeat(40),
};

test("client sends tokens only to canonical staging or exact TLS loopback endpoints", async () => {
  for (const target of [
    "https://nemlig-mcp.broesby.dk/mcp",
    "https://another.invalid/mcp",
    "http://127.0.0.1:4000/mcp",
    "https://u@127.0.0.1:4000/mcp",
    "https://127.0.0.1:4000/mcp?q=1",
  ]) {
    assert.throws(() =>
      journeyTarget({ ...staging, NEMLIG_JOURNEY_ENDPOINT: target }),
    );
  }
  assert.throws(() =>
    journeyTarget({ ...staging, NEMLIG_JOURNEY_EXPECTED_REVISION: "short" }),
  );
  const local = journeyTarget({
    ...staging,
    NEMLIG_JOURNEY_ENDPOINT: "https://127.0.0.1:4000/mcp",
  });
  assert.equal(local.revision, undefined);
  const config = journeyTarget(staging);
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
          "x-nemlig-journey-image": config.revision,
          "server-timing": "auth;dur=11, private;desc=test",
        },
      });
    },
  );
  assert.equal(await (await send(config.endpoint)).text(), "ok");
  assert.deepEqual(evidence.at(-1), { http_status: 200, auth_ms: 11 });
  await assert.rejects(send("https://another.invalid/mcp"));
});

test("hosted client rejects a response from the wrong deployed image", async () => {
  const config = journeyTarget(staging);
  const send = journeyFetch(
    config,
    AbortSignal.timeout(2000),
    () => {},
    async () => new Response("ok"),
  );
  await assert.rejects(send(config.endpoint), /revision mismatch/u);
});

test("local sample requires actual cold then warm state with all phase timings", () => {
  const first = {
    container_state: "cold",
    auth_ms: 0,
    ready_ms: 1,
    mcp_headers_ms: 2,
  };
  checkSample(first, true, "first");
  assert.throws(() => checkSample(first, true, "second"));
  assert.throws(() =>
    checkSample({ ...first, auth_ms: undefined }, false, "first"),
  );
  checkSample({ ...first, container_state: "warm" }, true, "second");
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

test("local bootstrap only starts an explicitly selected Colima context", async () => {
  const calls = [];
  const exec = async (bin, args) => {
    calls.push([bin, args]);
    if (args[0] === "version") {
      throw new Error("offline");
    }
    return { stdout: "colima\n" };
  };
  await ensureDocker(exec, "darwin", {});
  assert.equal(calls.at(-1)[0], "colima");
  calls.length = 0;
  await assert.rejects(
    ensureDocker(exec, "linux", {}),
    /Docker engine unavailable/u,
  );
  assert.equal(calls.length, 1);
  calls.length = 0;
  await assert.rejects(
    ensureDocker(exec, "darwin", { DOCKER_HOST: "unix:///other" }),
    /Docker engine unavailable/u,
  );
  assert.equal(calls.length, 1);
});
