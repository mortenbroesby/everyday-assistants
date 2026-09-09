import assert from "node:assert/strict";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { SERVICE_ACCEPTANCE_SCOPE } from "./auth0.js";
import { issueServiceToken } from "../scripts/service-token.js";

const env = {
  NEMLIG_MCP_AUTH0_ISSUER: "https://auth.example.test/",
  NEMLIG_MCP_PUBLIC_URL: "https://nemlig-mcp.example.test/mcp",
  NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client",
  NEMLIG_MCP_SERVICE_CLIENT_SECRET: "private-service-secret",
};

test("issues and verifies one bounded service token without exposing credentials", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const now = new Date("2026-09-09T10:00:00.000Z");
  const token = await new SignJWT({ scope: SERVICE_ACCEPTANCE_SCOPE, azp: env.NEMLIG_MCP_SERVICE_CLIENT_ID })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(env.NEMLIG_MCP_AUTH0_ISSUER)
    .setAudience(env.NEMLIG_MCP_PUBLIC_URL)
    .setSubject(`${env.NEMLIG_MCP_SERVICE_CLIENT_ID}@clients`)
    .setIssuedAt(Math.floor(now.getTime() / 1_000))
    .setExpirationTime(Math.floor(now.getTime() / 1_000) + 1_800)
    .sign(privateKey);
  const requests: Request[] = [];
  const issued = await issueServiceToken(env, {
    now: () => now,
    key: publicKey,
    fetcher: async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({ access_token: token, token_type: "Bearer", expires_in: 1_800 });
    },
  });

  assert.equal(issued, token);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://auth.example.test/oauth/token");
  assert.equal(await requests[0]?.text(), "grant_type=client_credentials&client_id=service-client&client_secret=private-service-secret&audience=https%3A%2F%2Fnemlig-mcp.example.test%2Fmcp&scope=acceptance%3Anemlig-assistant");
  assert.equal((await exportJWK(publicKey)).kty, "RSA");
});

test("rejects invalid or short-lived service tokens without retrying", async () => {
  let calls = 0;
  await assert.rejects(issueServiceToken(env, {
    now: () => new Date("2026-09-09T10:00:00.000Z"),
    fetcher: async () => {
      calls += 1;
      return Response.json({ access_token: "not-a-jwt" });
    },
  }), /service token unavailable/iu);
  assert.equal(calls, 1);
});

test("rejects unsafe endpoints and oversized token responses before a secret can leave the canonical Auth0 issuer", async () => {
  let calls = 0;
  await assert.rejects(issueServiceToken({
    ...env,
    NEMLIG_MCP_AUTH0_ISSUER: "https://auth.example.test/?next=https://attacker.example.test",
  }, {
    fetcher: async () => {
      calls += 1;
      return Response.json({ access_token: "unreachable" });
    },
  }), /service token unavailable/iu);
  assert.equal(calls, 0);

  await assert.rejects(issueServiceToken(env, {
    fetcher: async (_input, init) => {
      calls += 1;
      assert.equal(init?.redirect, "error");
      return new Response("x".repeat(16_385), { status: 200 });
    },
  }), /service token unavailable/iu);
  assert.equal(calls, 1);
});
