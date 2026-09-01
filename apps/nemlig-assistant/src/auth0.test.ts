import assert from "node:assert/strict";
import test from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createAuth0Verifier, fetchAuth0Metadata, loadAuth0Config, type Auth0Config } from "./auth0.js";

const config: Auth0Config = {
  issuer: new URL("https://tenant.example.test/"),
  audience: "https://nemlig.example.test/mcp",
  ownerSubject: "auth0|owner",
  requiredScope: "use:nemlig-assistant",
  publicUrl: new URL("https://mcp.example.test/mcp"),
  allowedOrigins: ["https://chatgpt.com"],
  revision: "test-revision",
  host: "127.0.0.1",
  port: 3333,
};

test("Auth0 verifier accepts only the configured owner, audience, issuer, signature, expiry, and scope", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const { privateKey: revokedPrivateKey } = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(publicKey), kid: "test", alg: "RS256" };
  const verifier = createAuth0Verifier(config, new URL("https://tenant.example.test/.well-known/jwks.json"), createLocalJWKSet({ keys: [jwk] }));
  const sign = (claims: Record<string, unknown> = {}, subject = config.ownerSubject) => new SignJWT({ scope: config.requiredScope, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(config.issuer.href)
    .setAudience(config.audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  const accepted = await verifier.verifyAccessToken(await sign({ azp: "chatgpt" }));
  assert.equal(accepted.extra?.subject, config.ownerSubject);
  assert.deepEqual(accepted.scopes, [config.requiredScope]);
  assert.deepEqual((await verifier.verifyAccessToken(await sign({ scope: "" }))).scopes, []);
  await assert.rejects(async () => verifier.verifyAccessToken(await sign({}, "auth0|other")), /Invalid access token/u);
  await assert.rejects(async () => verifier.verifyAccessToken(`${await sign()}broken`), /Invalid access token/u);
  const revokedKey = await new SignJWT({ scope: config.requiredScope }).setProtectedHeader({ alg: "RS256", kid: "revoked" })
    .setIssuer(config.issuer.href).setAudience(config.audience).setSubject(config.ownerSubject).setExpirationTime("5m").sign(revokedPrivateKey);
  await assert.rejects(() => verifier.verifyAccessToken(revokedKey), /Invalid access token/u);
  const wrongAudience = await new SignJWT({ scope: config.requiredScope }).setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(config.issuer.href).setAudience("https://wrong.example").setSubject(config.ownerSubject).setExpirationTime("5m").sign(privateKey);
  await assert.rejects(() => verifier.verifyAccessToken(wrongAudience), /Invalid access token/u);
  const expired = await new SignJWT({ scope: config.requiredScope }).setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(config.issuer.href).setAudience(config.audience).setSubject(config.ownerSubject).setExpirationTime(1).sign(privateKey);
  await assert.rejects(() => verifier.verifyAccessToken(expired), /Invalid access token/u);
});

test("HTTP auth configuration defaults to loopback and allows only the Container bind address", () => {
  assert.throws(() => loadAuth0Config({}), /NEMLIG_MCP_AUTH0_ISSUER/u);
  const loaded = loadAuth0Config({
    NEMLIG_MCP_AUTH0_ISSUER: "https://tenant.example.test",
    NEMLIG_MCP_AUTH0_AUDIENCE: config.audience,
    NEMLIG_MCP_AUTH0_OWNER_SUBJECT: config.ownerSubject,
    NEMLIG_MCP_PUBLIC_URL: config.publicUrl.href,
  });
  assert.equal(loaded.issuer.href, config.issuer.href);
  assert.equal(loaded.host, "127.0.0.1");
  assert.deepEqual(loaded.allowedOrigins, ["https://chatgpt.com", "https://chat.openai.com"]);
  assert.equal(loadAuth0Config({
    NEMLIG_MCP_AUTH0_ISSUER: config.issuer.href,
    NEMLIG_MCP_AUTH0_AUDIENCE: config.audience,
    NEMLIG_MCP_AUTH0_OWNER_SUBJECT: config.ownerSubject,
    NEMLIG_MCP_PUBLIC_URL: "http://127.0.0.1:3333/mcp",
  }).host, "127.0.0.1");
  assert.equal(loadAuth0Config({
    NEMLIG_MCP_AUTH0_ISSUER: config.issuer.href,
    NEMLIG_MCP_AUTH0_AUDIENCE: config.audience,
    NEMLIG_MCP_AUTH0_OWNER_SUBJECT: config.ownerSubject,
    NEMLIG_MCP_PUBLIC_URL: config.publicUrl.href,
    NEMLIG_MCP_HTTP_HOST: "0.0.0.0",
  }).host, "0.0.0.0");
  assert.throws(() => loadAuth0Config({
    NEMLIG_MCP_AUTH0_ISSUER: config.issuer.href,
    NEMLIG_MCP_AUTH0_AUDIENCE: config.audience,
    NEMLIG_MCP_AUTH0_OWNER_SUBJECT: config.ownerSubject,
    NEMLIG_MCP_PUBLIC_URL: config.publicUrl.href,
    NEMLIG_MCP_HTTP_HOST: "example.test",
  }), /NEMLIG_MCP_HTTP_HOST/u);
  assert.throws(() => loadAuth0Config({
    NEMLIG_MCP_AUTH0_ISSUER: config.issuer.href,
    NEMLIG_MCP_AUTH0_AUDIENCE: config.audience,
    NEMLIG_MCP_AUTH0_OWNER_SUBJECT: config.ownerSubject,
    NEMLIG_MCP_PUBLIC_URL: "http://example.test:3333/mcp",
  }), /loopback/u);
  assert.throws(() => loadAuth0Config({
    NEMLIG_MCP_AUTH0_ISSUER: "http://tenant.example.test",
    NEMLIG_MCP_AUTH0_AUDIENCE: config.audience,
    NEMLIG_MCP_AUTH0_OWNER_SUBJECT: config.ownerSubject,
    NEMLIG_MCP_PUBLIC_URL: config.publicUrl.href,
  }), /HTTPS/u);
});

test("Auth0 metadata failure is fail-closed", async () => {
  await assert.rejects(() => fetchAuth0Metadata(config, async () => new Response(null, { status: 503 })), /discovery failed/u);
});
