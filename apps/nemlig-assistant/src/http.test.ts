import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createHttpApp } from "./http.js";
import type { Auth0Config } from "./auth0.js";

const config: Auth0Config = {
  issuer: new URL("https://tenant.example.test/"),
  audience: "https://nemlig.example.test/mcp",
  ownerSubject: "auth0|owner",
  requiredScope: "use:nemlig-assistant",
  publicUrl: new URL("https://tunnel.example.test/mcp"),
  allowedOrigins: ["https://chatgpt.com"],
  revision: "test-revision",
  host: "127.0.0.1",
  port: 3333,
};
const oauth: OAuthMetadata = {
  issuer: config.issuer.href,
  authorization_endpoint: new URL("authorize", config.issuer).href,
  token_endpoint: new URL("oauth/token", config.issuer).href,
  registration_endpoint: new URL("oidc/register", config.issuer).href,
  response_types_supported: ["code"],
};

test("HTTP MCP advertises Auth0, rejects anonymous and foreign origins, and preserves the MCP surface", async () => {
  const app = createHttpApp(config, oauth, {
    verifyAccessToken: async (token) => ({
      token,
      clientId: "chatgpt",
      scopes: token === "no-scope" ? [] : [config.requiredScope],
      expiresAt: Date.now() / 1000 + 300,
      extra: { subject: token === "wrong-owner" ? "auth0|other" : config.ownerSubject },
    }),
  });
  const server = app.listen(0, config.host);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = `http://${config.host}:${(server.address() as AddressInfo).port}`;
  try {
    const metadata = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    assert.deepEqual(await metadata.json(), {
      resource: config.publicUrl.href,
      authorization_servers: [config.issuer.href],
      scopes_supported: [config.requiredScope],
      resource_name: "Nemlig Assistant",
    });
    const health = await (await fetch(`${base}/healthz`)).json();
    const readiness = await (await fetch(`${base}/readyz`)).json();
    const revision = await (await fetch(`${base}/revision`)).json();
    assert.deepEqual(health, { status: "ok" });
    assert.deepEqual(readiness, { status: "ready" });
    assert.deepEqual(revision, { revision: config.revision });
    assert.doesNotMatch(JSON.stringify({ health, readiness, revision }), /auth0\||credential|token|basket|proposal|session|path/iu);
    const anonymous = await fetch(`${base}/mcp`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    assert.equal(anonymous.status, 401);
    assert.match(anonymous.headers.get("www-authenticate") ?? "", /oauth-protected-resource\/mcp/u);
    const missingScope = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: "Bearer no-scope" } });
    assert.equal(missingScope.status, 403);
    const foreign = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: "Bearer test", origin: "https://evil.example" } });
    assert.equal(foreign.status, 403);

    const client = new Client({ name: "http-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { authorization: "Bearer test" } },
    });
    await client.connect(transport);
    assert.equal(client.getServerVersion()?.name, "nemlig-assistant");
    const httpTools = await client.listTools();
    assert.ok(httpTools.tools.some((tool) => tool.name === "view_cart"));
    assert.ok(transport.sessionId);
    const toolCall = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "view_cart", arguments: {} } });
    const wrongOwner = await fetch(`${base}/mcp`, {
      method: "POST",
      body: toolCall,
      headers: { authorization: "Bearer wrong-owner", "content-type": "application/json", "mcp-session-id": transport.sessionId },
    });
    assert.equal(wrongOwner.status, 403);
    const wrongSession = await fetch(`${base}/mcp`, {
      method: "POST",
      body: toolCall,
      headers: { authorization: "Bearer test", "content-type": "application/json", "mcp-session-id": "wrong-session" },
    });
    assert.equal(wrongSession.status, 400);
    const malformed = await fetch(`${base}/mcp`, {
      method: "POST",
      body: "{}",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
    });
    assert.equal(malformed.status, 400);
    const invalidGet = await fetch(`${base}/mcp`, {
      headers: { accept: "text/event-stream", authorization: "Bearer test", "mcp-session-id": "wrong-session" },
    });
    assert.equal(invalidGet.status, 400);

    await client.close();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
  }
});
