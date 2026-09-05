import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createHttpApp } from "./http.js";
import type { Auth0Config } from "./auth0.js";
import { BasketProposalService } from "./proposals.js";
import { parsePrincipalPolicy } from "./principal-policy.js";
import type { ShoppingClient } from "./cli.js";

const ownerSubject = "auth0|owner";
const principalPolicy = parsePrincipalPolicy(JSON.stringify({
  schema_version: 1, revision: "family-v1",
  budgets: {
    principal_minute_limits: { "0": 60, "1": 20, "2": 5 },
    tier0_reserve: { minute: 20, month: 30_000 }, guest_limit: { minute: 40, month: 125_000 },
    tier1_shed_at: { minute: 40, month: 125_000 }, tier2_shed_at: { minute: 20, month: 60_000 },
  },
  principals: [
    { subject: ownerSubject, principal_key: "a".repeat(32), tier: 0, enabled: true, nemlig: { username: "owner@example.test", password: "owner-secret" } },
    { subject: "auth0|guest", principal_key: "b".repeat(32), tier: 1, enabled: true, nemlig: { username: "guest@example.test", password: "guest-secret" } },
  ],
}));

const config: Auth0Config = {
  issuer: new URL("https://tenant.example.test/"),
  audience: "https://nemlig.example.test/mcp",
  principalPolicy,
  requiredScope: "use:nemlig-assistant",
  publicUrl: new URL("https://mcp.example.test/mcp"),
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
      extra: { subject: token === "guest" ? "auth0|guest" : ownerSubject },
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
    assert.ok(httpTools.tools.some((tool) => tool.name === "show_my_basket"));
    assert.ok(transport.sessionId);
    const toolCall = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "show_my_basket", arguments: {} } });
    const wrongOwner = await fetch(`${base}/mcp`, {
      method: "POST",
      body: toolCall,
      headers: {
        authorization: "Bearer guest",
        "content-type": "application/json",
        "mcp-session-id": transport.sessionId,
        "x-nemlig-principal": principalPolicy.principals[0]!.principal_key,
      },
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
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
  }
});

test("HTTP MCP preserves an owner proposal across authenticated transport reconnects", async () => {
  const product = {
    id: 7, name: "Banan", price: 2.5, unit: "2,50 kr/stk.", unitPrice: 2.5,
    unitSize: "1 stk.", brand: "Test", category: "Frugt", subcategory: "Bananer",
    imageUrl: "", available: true, labels: [], isOrganic: false, isFrozen: false,
    isRefrigerated: false, isDairy: false, isLactoseFree: false, isGlutenFree: true,
    isVegan: true, isOnDiscount: false,
  };
  const empty = { items: [], productsPrice: 0, deliveryPrice: 39, numberOfProducts: 0, deliveryTime: "Tomorrow" };
  const applied = {
    ...empty,
    items: [{ id: 7, name: product.name, quantity: 1, total: 2.5 }],
    productsPrice: 2.5,
    numberOfProducts: 1,
  };
  let changed = false;
  const client = {
    isLoggedIn: () => true,
    login: async () => undefined,
    searchProducts: async () => [],
    getProduct: async () => product,
    getFreshProduct: async () => product,
    listFavorites: async () => [],
    listDepartments: async () => [],
    browseDepartment: async () => ({ products: [], page: 1, hasNext: false }),
    getCart: async () => changed ? applied : empty,
    addToCart: async () => { changed = true; return applied; },
    removeFromCart: async () => empty,
    clearCart: async () => empty,
  };
  const proposalStores = new Map<string, BasketProposalService>();
  const app = createHttpApp(config, oauth, {
    verifyAccessToken: async (token) => ({
      token, clientId: "chatgpt", scopes: [config.requiredScope],
      expiresAt: Date.now() / 1000 + 300, extra: { subject: token === "guest" ? "auth0|guest" : ownerSubject },
    }),
  }, (principal) => {
    const proposals = new BasketProposalService(client);
    proposalStores.set(principal.principal_key, proposals);
    return { client, proposals };
  });
  const server = app.listen(0, config.host);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const endpoint = new URL(`http://${config.host}:${(server.address() as AddressInfo).port}/mcp`);
  const connect = async (token = "test") => {
    const client = new Client({ name: "reconnect-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    });
    await client.connect(transport);
    return client;
  };
  try {
    const first = await connect();
    const prepared = await first.callTool({
      name: "review_items_to_add",
      arguments: { items: [{ product: 7, quantity: 1 }] },
    });
    const proposalId = (prepared.structuredContent as { proposal_id: string }).proposal_id;
    await first.close();

    const guest = await connect("guest");
    const refused = await guest.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } });
    assert.equal(refused.isError, true);
    assert.equal(changed, false);
    await guest.close();

    const second = await connect();
    const result = await second.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } });
    assert.equal(result.isError, undefined);
    assert.equal(changed, true);
    assert.equal((result.structuredContent as { basket: { items: unknown[] } }).basket.items.length, 1);
    assert.equal(proposalStores.size, 2);
    await second.close();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
  }
});

test("HTTP MCP creates bounded isolated clients, credentials, baskets, favourites, and proposal stores per principal", async () => {
  const logins: string[] = [];
  const clients = new Set<ShoppingClient>();
  const proposalStores = new Set<BasketProposalService>();
  const app = createHttpApp(config, oauth, {
    verifyAccessToken: async (token) => ({
      token, clientId: "chatgpt", scopes: [config.requiredScope], expiresAt: Date.now() / 1000 + 300,
      extra: { subject: token === "guest" ? "auth0|guest" : ownerSubject },
    }),
  }, (principal) => {
    let loggedIn = false;
    const product = {
      id: principal.tier + 1, name: principal.tier === 0 ? "owner-favourite" : "guest-favourite", price: 1,
      unit: "1 kr/stk.", unitPrice: 1, unitSize: "1 stk.", brand: "Test", category: "Test", subcategory: "Test",
      imageUrl: "", available: true, labels: [], isOrganic: false, isFrozen: false, isRefrigerated: false,
      isDairy: false, isLactoseFree: false, isGlutenFree: false, isVegan: false, isOnDiscount: false,
    };
    const client: ShoppingClient = {
      isLoggedIn: () => loggedIn,
      login: async (username, password) => { loggedIn = true; logins.push(`${username}:${password}`); },
      searchProducts: async () => [],
      getProduct: async () => { throw new Error("unused"); },
      getFreshProduct: async () => { throw new Error("unused"); },
      listFavorites: async () => [product],
      listDepartments: async () => [],
      browseDepartment: async () => ({ products: [], page: 1, hasNext: false }),
      getCart: async () => ({
        items: [], productsPrice: 0, deliveryPrice: 0, numberOfProducts: 0,
        deliveryTime: principal.tier === 0 ? "owner-basket" : "guest-basket",
      }),
      addToCart: async () => { throw new Error("unused"); },
      removeFromCart: async () => { throw new Error("unused"); },
      clearCart: async () => { throw new Error("unused"); },
    };
    const proposals = new BasketProposalService(client);
    clients.add(client);
    proposalStores.add(proposals);
    return { client, proposals };
  });
  const server = app.listen(0, config.host);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const endpoint = new URL(`http://${config.host}:${(server.address() as AddressInfo).port}/mcp`);
  const connect = async (token: string) => {
    const client = new Client({ name: `${token}-test`, version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    return client;
  };
  try {
    const owner = await connect("owner");
    const guest = await connect("guest");
    const ownerBasket = await owner.callTool({ name: "show_my_basket", arguments: {} });
    const guestBasket = await guest.callTool({ name: "show_my_basket", arguments: {} });
    const ownerFavourites = await owner.callTool({ name: "show_my_favorites", arguments: {} });
    const guestFavourites = await guest.callTool({ name: "show_my_favorites", arguments: {} });
    assert.match(JSON.stringify(ownerBasket.structuredContent), /owner-basket/u);
    assert.match(JSON.stringify(guestBasket.structuredContent), /guest-basket/u);
    assert.match(JSON.stringify(ownerFavourites.structuredContent), /owner-favourite/u);
    assert.match(JSON.stringify(guestFavourites.structuredContent), /guest-favourite/u);
    assert.deepEqual(logins.sort(), ["guest@example.test:guest-secret", "owner@example.test:owner-secret"]);
    assert.equal(clients.size, 2);
    assert.equal(proposalStores.size, 2);
    await owner.close();
    await guest.close();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
  }
});
