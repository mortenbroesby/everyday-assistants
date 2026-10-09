import assert from "node:assert/strict";
import type { OAuthMetadata } from "@modelcontextprotocol/server";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createHttpApp } from "./http.js";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  Auth0InfrastructureError,
  createAuth0Verifier,
  SERVICE_ACCEPTANCE_SCOPE,
  type Auth0Config,
} from "./auth0.js";
import { verifyServiceAcceptanceFeatures } from "./production-acceptance.js";
import {
  attachAdmissionCredential,
  handleGatewayRequest,
} from "./cloudflare-gateway.js";
import {
  admitPrincipalRequest,
  replaceCredentialRecord,
  type PrincipalStorage,
} from "./principal-records.js";
import { BasketProposalService } from "./proposals.js";
import { parsePrincipalPolicy } from "./principal-policy.js";
import type { ShoppingClient } from "./client.js";
import {
  encryptCredentials,
  type CredentialEnvelope,
} from "./credential-envelope.js";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { NEMLIG_VERSION } from "./runtime.js";

const ownerSubject = "auth0|owner";
const principalPolicy = parsePrincipalPolicy(
  JSON.stringify({
    schema_version: 3,
    revision: "family-v3",
    owner_subject: ownerSubject,
    principals: [
      { subject: ownerSubject, principal_key: "a".repeat(32), enabled: true },
      { subject: "auth0|guest", principal_key: "b".repeat(32), enabled: true },
    ],
  }),
);

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
  credentialKey: Buffer.alloc(32, 9).toString("base64url"),
  credentialKeyVersion: "one",
  serviceAcceptance: { clientId: "service-client" },
};
const oauth: OAuthMetadata = {
  issuer: config.issuer.href,
  authorization_endpoint: new URL("authorize", config.issuer).href,
  token_endpoint: new URL("oauth/token", config.issuer).href,
  registration_endpoint: new URL("oidc/register", config.issuer).href,
  response_types_supported: ["code"],
};

const envelopeHeaders = (value: CredentialEnvelope) => ({
  "x-nemlig-principal-key": value.principal_key,
  "x-nemlig-policy-revision": value.policy_revision,
  "x-nemlig-credential-generation": String(value.generation),
  "x-nemlig-credential-envelope": btoa(JSON.stringify(value)),
});
const familyHeaders = async (token: string) => {
  const guest = token === "guest";
  const value = await encryptCredentials(
    {
      username: guest ? "guest@example.test" : "owner@example.test",
      password: guest ? "guest-secret" : "owner-secret",
    },
    {
      principalKey: (guest ? "b" : "a").repeat(32),
      policyRevision: principalPolicy.revision,
      keyVersion: config.credentialKeyVersion,
      generation: 1,
    },
    config.credentialKey,
  );
  return { authorization: `Bearer ${token}`, ...envelopeHeaders(value) };
};

const modernClient = (name: string) =>
  new Client(
    { name, version: "1.0.0" },
    {
      versionNegotiation: { mode: { pin: "2026-07-28" } },
    },
  );

test("loopback MCP bursts use encrypted credential admission without usage limits or unapproved writes", async () => {
  const empty = {
    items: [],
    productsPrice: 0,
    deliveryPrice: 0,
    numberOfProducts: 0,
    deliveryTime: "",
  };
  let reads = 0;
  let writes = 0;
  let loggedIn = false;
  const shopper = {
    isLoggedIn: () => loggedIn,
    login: async (username: string, password: string) => {
      assert.deepEqual(
        { username, password },
        { username: "owner@example.test", password: "owner-secret" },
      );
      loggedIn = true;
    },
    getCart: async () => {
      reads += 1;
      return empty;
    },
    addToCart: async () => {
      writes += 1;
      throw new Error("unapproved write");
    },
  } as unknown as ShoppingClient;
  const app = createHttpApp(
    config,
    oauth,
    {
      verifyAccessToken: async (token) => ({
        token,
        clientId: "chatgpt",
        scopes: [config.requiredScope],
        expiresAt: Date.now() / 1000 + 300,
        extra: { subject: ownerSubject },
      }),
    },
    () => ({ client: shopper, proposals: new BasketProposalService(shopper) }),
  );
  const server = app.listen(0, config.host);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const endpoint = new URL(
    `http://${config.host}:${(server.address() as AddressInfo).port}/mcp`,
  );
  const records = new Map<string, unknown>();
  let tail = Promise.resolve();
  const storage: PrincipalStorage = {
    transaction: async <T>(callback: () => Promise<T>) => {
      const result = tail.then(callback);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    get: async <T>(key: string) => records.get(key) as T | undefined,
    put: async (key, value) => {
      records.set(key, value);
    },
    delete: async (key) => records.delete(key),
  };
  const principal = principalPolicy.principals[0]!;
  await replaceCredentialRecord(
    storage,
    principal,
    await encryptCredentials(
      { username: "owner@example.test", password: "owner-secret" },
      {
        principalKey: principal.principal_key,
        policyRevision: principalPolicy.revision,
        keyVersion: config.credentialKeyVersion,
        generation: 1,
      },
      config.credentialKey,
    ),
    true,
  );
  let usefulAdmissions = 0;
  const edgeFetch = async (input: RequestInfo | URL, init?: RequestInit) =>
    handleGatewayRequest(
      new Request(input, init),
      {
        MCP_ENABLED: "true",
        MCP_AUTH_TIMEOUT_MS: "5000",
        MCP_CONTROL_TIMEOUT_MS: "3000",
        MCP_TOTAL_TIMEOUT_MS: "30000",
        MCP_BACKEND_TIMEOUT_MS: "25000",
        NEMLIG_MCP_AUTH0_ISSUER: config.issuer.href,
        NEMLIG_MCP_AUTH0_AUDIENCE: config.audience,
        NEMLIG_MCP_PRINCIPALS: JSON.stringify(principalPolicy),
        NEMLIG_MCP_PUBLIC_URL: config.publicUrl.href,
        NEMLIG_MCP_CREDENTIAL_KEY: config.credentialKey,
        NEMLIG_MCP_CREDENTIAL_KEY_VERSION: config.credentialKeyVersion,
      },
      {
        authenticate: async () => principalPolicy.principals[0],
        admit: async (operation, currentPrincipal) => {
          if (operation === "useful") {
            usefulAdmissions += 1;
          }
          return admitPrincipalRequest(
            storage,
            { principalKey: currentPrincipal.principal_key },
            { revision: principalPolicy.revision },
            operation === "useful",
          );
        },
        forward: async (request, _operation, _config, _deadline, admission) =>
          fetch(attachAdmissionCredential(request, admission)),
      },
    );
  const client = modernClient("burst-test");
  try {
    await client.connect(
      new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { authorization: "Bearer test" } },
        fetch: edgeFetch,
      }),
    );
    for (let index = 0; index < 501; index += 1) {
      const result = await client.callTool({
        name: "show_my_basket",
        arguments: {},
      });
      assert.notEqual(result.isError, true);
    }
    for (let index = 0; index < 30; index += 1) {
      const result = await client.callTool({
        name: "submit_product_review_conversation",
        arguments: {
          review_id: "00000000-0000-4000-8000-000000000000",
          revision: 1,
          submission_id: "00000000-0000-4000-8000-000000000000",
        },
      });
      assert.equal(
        result.isError,
        true,
        "rate removal must not bypass exact approval",
      );
    }
    assert.equal(reads, 501);
    assert.equal(writes, 0);
    assert.equal(usefulAdmissions, 531);
    assert.equal(records.has("usage"), false);
  } finally {
    await client.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error?: Error) => (error ? reject(error) : resolve())),
    );
  }
});

test("HTTP MCP accepts a 2025-era ChatGPT initialize handshake", async () => {
  const app = createHttpApp(config, oauth, {
    verifyAccessToken: async (token) => ({
      token,
      clientId: "chatgpt",
      scopes: [config.requiredScope],
      expiresAt: Date.now() / 1000 + 300,
      extra: { subject: ownerSubject },
    }),
  });
  const server = app.listen(0, config.host);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    const response = await fetch(
      `http://${config.host}:${(server.address() as AddressInfo).port}/mcp`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer test",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "chatgpt-legacy", version: "1.0.0" },
          },
        }),
      },
    );
    assert.equal(response.status, 200, await response.text());
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error?: Error) => (error ? reject(error) : resolve())),
    );
  }
});

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
    const metadata = await fetch(
      `${base}/.well-known/oauth-protected-resource/mcp`,
    );
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
    assert.doesNotMatch(
      JSON.stringify({ health, readiness, revision }),
      /auth0\||credential|token|basket|proposal|session|path/iu,
    );
    const anonymous = await fetch(`${base}/mcp`, {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
    assert.equal(anonymous.status, 401);
    assert.match(
      anonymous.headers.get("www-authenticate") ?? "",
      /oauth-protected-resource\/mcp/u,
    );
    const missingScope = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer no-scope" },
    });
    assert.equal(missingScope.status, 403);
    const foreign = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer test", origin: "https://evil.example" },
    });
    assert.equal(foreign.status, 403);

    const client = modernClient("http-test");
    const transport = new StreamableHTTPClientTransport(
      new URL(`${base}/mcp`),
      {
        requestInit: { headers: await familyHeaders("test") },
      },
    );
    await client.connect(transport);
    assert.equal(client.getServerVersion()?.name, "nemlig-assistant");
    const httpTools = await client.listTools();
    assert.ok(httpTools.tools.some((tool) => tool.name === "show_my_basket"));
    assert.equal(transport.sessionId, undefined);

    await client.close();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error?: Error) => (error ? reject(error) : resolve())),
    );
  }
});

test("HTTP Auth0 verifier infrastructure failures return a sanitized server error instead of an OAuth challenge", async () => {
  const app = createHttpApp(config, oauth, {
    verifyAccessToken: async () => {
      throw new Auth0InfrastructureError("unavailable");
    },
  });
  const server = app.listen(0, config.host);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    const endpoint = `http://${config.host}:${(server.address() as AddressInfo).port}/mcp`;
    const response = await fetch(endpoint, {
      method: "POST",
      body: "{}",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "server_error",
      error_description: "Authentication unavailable.",
    });
    assert.equal(response.headers.get("www-authenticate"), null);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error?: Error) => (error ? reject(error) : resolve())),
    );
  }
});

test("HTTP service acceptance uses signed machine identity and its fixed fixture without a human context", async () => {
  const serviceConfig = {
    ...config,
    serviceAcceptance: { clientId: "service-client" },
  };
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "service", alg: "RS256" };
  const verifier = createAuth0Verifier(
    serviceConfig,
    new URL("https://tenant.example.test/.well-known/jwks.json"),
    createLocalJWKSet({ keys: [jwk] }),
  );
  const token = await new SignJWT({
    scope: SERVICE_ACCEPTANCE_SCOPE,
    azp: "service-client",
  })
    .setProtectedHeader({ alg: "RS256", kid: "service" })
    .setIssuer(config.issuer.href)
    .setAudience(config.audience)
    .setSubject("service-client@clients")
    .setExpirationTime("5m")
    .sign(privateKey);
  for (const throughGateway of [true, false] as const) {
    const app = createHttpApp(serviceConfig, oauth, verifier, () => {
      throw new Error("service must not resolve a human context");
    });
    const server = app.listen(0, config.host);
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    try {
      const endpoint = new URL(
        `http://${config.host}:${(server.address() as AddressInfo).port}/mcp`,
      );
      const edgeFetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> =>
        await handleGatewayRequest(
          new Request(input, init),
          {
            MCP_ENABLED: "true",
            MCP_AUTH_TIMEOUT_MS: "5000",
            MCP_CONTROL_TIMEOUT_MS: "3000",
            MCP_TOTAL_TIMEOUT_MS: "30000",
            MCP_BACKEND_TIMEOUT_MS: "25000",
            NEMLIG_MCP_AUTH0_ISSUER: config.issuer.href,
            NEMLIG_MCP_AUTH0_AUDIENCE: config.audience,
            NEMLIG_MCP_PRINCIPALS: JSON.stringify(principalPolicy),
            NEMLIG_MCP_PUBLIC_URL: config.publicUrl.href,
            NEMLIG_MCP_CREDENTIAL_KEY: config.credentialKey,
            NEMLIG_MCP_CREDENTIAL_KEY_VERSION: config.credentialKeyVersion,
            NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED: "true",
            NEMLIG_MCP_SERVICE_CLIENT_ID: "service-client",
          },
          {
            authenticate: async () => ({
              subject: "service-client@clients",
              principal_key: "s".repeat(32),
              enabled: true,
            }),
            admit: async () => ({ admitted: true }),
            forward: async (request) => fetch(request),
          },
        );
      const client = modernClient("service-test");
      const transport = new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
        ...(throughGateway ? { fetch: edgeFetch } : {}),
      });
      await client.connect(transport);
      assert.equal(client.getServerVersion()?.version, NEMLIG_VERSION);
      const report = await verifyServiceAcceptanceFeatures({
        listTools: async () => client.listTools(),
        callTool: async (request) =>
          (await client.callTool(request)) as {
            isError?: boolean;
            structuredContent?: unknown;
          },
        listResources: async () => client.listResources(),
        readResource: async (request) => client.readResource(request),
      });
      assert.equal(report.requestCount, 8);
      await client.close();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error?: Error) => (error ? reject(error) : resolve())),
      );
    }
  }
});

test("HTTP MCP creates bounded isolated clients, credentials, baskets, favourites, and proposal stores per principal", async () => {
  const logins: string[] = [];
  const clients = new Set<ShoppingClient>();
  const proposalStores = new Set<BasketProposalService>();
  const app = createHttpApp(
    config,
    oauth,
    {
      verifyAccessToken: async (token) => ({
        token,
        clientId: "chatgpt",
        scopes: [config.requiredScope],
        expiresAt: Date.now() / 1000 + 300,
        extra: { subject: token === "guest" ? "auth0|guest" : ownerSubject },
      }),
    },
    (principal) => {
      let loggedIn = false;
      const product = {
        id: principal.subject === ownerSubject ? 1 : 2,
        name:
          principal.subject === ownerSubject
            ? "owner-favourite"
            : "guest-favourite",
        price: 1,
        unit: "1 kr/stk.",
        unitPrice: 1,
        unitSize: "1 stk.",
        brand: "Test",
        category: "Test",
        subcategory: "Test",
        imageUrl: "",
        available: true,
        labels: [],
        isOrganic: false,
        isFrozen: false,
        isRefrigerated: false,
        isDairy: false,
        isLactoseFree: false,
        isGlutenFree: false,
        isVegan: false,
        isOnDiscount: false,
      };
      const client: ShoppingClient = {
        isLoggedIn: () => loggedIn,
        login: async (username, password) => {
          loggedIn = true;
          logins.push(`${username}:${password}`);
        },
        searchProducts: async () => [],
        getProduct: async () => product,
        getFreshProduct: async () => {
          throw new Error("unused");
        },
        listFavorites: async () => [product],
        listDepartments: async () => [],
        browseDepartment: async () => ({
          products: [],
          page: 1,
          hasNext: false,
        }),
        getCart: async () => ({
          items: [],
          productsPrice: 0,
          deliveryPrice: 0,
          numberOfProducts: 0,
          deliveryTime:
            principal.subject === ownerSubject
              ? "owner-basket"
              : "guest-basket",
        }),
        addToCart: async () => {
          throw new Error("unused");
        },
      };
      const proposals = new BasketProposalService(client);
      clients.add(client);
      proposalStores.add(proposals);
      return { client, proposals };
    },
  );
  const server = app.listen(0, config.host);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const endpoint = new URL(
    `http://${config.host}:${(server.address() as AddressInfo).port}/mcp`,
  );
  const connect = async (token: string) => {
    const client = modernClient(`${token}-test`);
    await client.connect(
      new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: await familyHeaders(token) },
      }),
    );
    return client;
  };
  try {
    const owner = await connect("owner");
    const guest = await connect("guest");
    const ownerBasket = await owner.callTool({
      name: "show_my_basket",
      arguments: {},
    });
    const guestBasket = await guest.callTool({
      name: "show_my_basket",
      arguments: {},
    });
    assert.match(
      JSON.stringify(ownerBasket.structuredContent),
      /owner-basket/u,
    );
    assert.match(
      JSON.stringify(guestBasket.structuredContent),
      /guest-basket/u,
    );
    assert.deepEqual(logins.sort(), [
      "guest@example.test:guest-secret",
      "owner@example.test:owner-secret",
    ]);
    const started = await owner.callTool({
      _meta: { "openai/session": "shop-a" },
      name: "start_product_review",
      arguments: { items: [{ product_id: 1, quantity: 2 }] },
    });
    assert.equal(started.isError, undefined);
    const review = (
      started.structuredContent as {
        review: { review_id: string; revision: number };
      }
    ).review;
    const secondOwner = await connect("owner");
    try {
      const otherChat = await secondOwner.callTool({
        _meta: { "openai/session": "shop-b" },
        name: "update_product_review_conversation",
        arguments: { ...review, action: { kind: "show" } },
      });
      assert.equal(
        otherChat.isError,
        true,
        "same authenticated account in a different chat cannot access the local selection",
      );
      const noSession = await secondOwner.callTool({
        name: "update_product_review_conversation",
        arguments: { ...review, action: { kind: "show" } },
      });
      assert.equal(
        noSession.isError,
        true,
        "stateless requests without conversation context must fail closed",
      );
      const accepted = await secondOwner.callTool({
        _meta: { "openai/session": "shop-a" },
        name: "update_product_review_conversation",
        arguments: { ...review, action: { kind: "accept", product_ids: [1] } },
      });
      assert.equal(accepted.isError, undefined);
      const shown = await owner.callTool({
        _meta: { "openai/session": "shop-a" },
        name: "update_product_review_conversation",
        arguments: { review_id: review.review_id, action: { kind: "show" } },
      });
      assert.equal(
        (
          shown.structuredContent as {
            review: { items: Array<{ state: string }> };
          }
        ).review.items[0]?.state,
        "ready",
      );
      const denied = await guest.callTool({
        _meta: { "openai/session": "shop-a" },
        name: "update_product_review_conversation",
        arguments: { review_id: review.review_id, action: { kind: "show" } },
      });
      assert.equal(denied.isError, true);
    } finally {
      await secondOwner.close();
    }
    assert.equal(clients.size, 2);
    assert.equal(proposalStores.size, 2);
    await owner.close();
    await guest.close();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error?: Error) => (error ? reject(error) : resolve())),
    );
  }
});

test("current family stateless requests decrypt credentials and isolate credential generations and principals", async () => {
  const key = Buffer.alloc(32, 9).toString("base64url");
  const guestKey = "c".repeat(32);
  const familyPolicy = parsePrincipalPolicy(
    JSON.stringify({
      ...principalPolicy,
      principals: principalPolicy.principals.map((principal) =>
        principal.subject === "auth0|guest"
          ? { ...principal, principal_key: "c".repeat(32) }
          : principal,
      ),
    }),
  );
  const familyConfig: Auth0Config = {
    ...config,
    principalPolicy: familyPolicy,
    credentialKey: key,
    credentialKeyVersion: "one",
  };
  const envelope = await encryptCredentials(
    { username: "guest@example.test", password: "guest-secret" },
    {
      principalKey: guestKey,
      policyRevision: familyPolicy.revision,
      keyVersion: "one",
      generation: 1,
    },
    key,
  );
  const internalHeaders = (value: CredentialEnvelope) => ({
    authorization: "Bearer guest",
    "x-nemlig-principal-key": value.principal_key,
    "x-nemlig-policy-revision": value.policy_revision,
    "x-nemlig-credential-generation": String(value.generation),
    "x-nemlig-credential-envelope": btoa(JSON.stringify(value)),
  });
  const logins: string[] = [];
  const client: ShoppingClient = {
    isLoggedIn: () => false,
    login: async (username, password) => {
      logins.push(`${username}:${password}`);
    },
    searchProducts: async () => [],
    getProduct: async () => {
      throw new Error("unused");
    },
    getFreshProduct: async () => {
      throw new Error("unused");
    },
    listFavorites: async () => [],
    listDepartments: async () => [],
    browseDepartment: async () => ({ products: [], page: 1, hasNext: false }),
    getCart: async () => ({
      items: [],
      productsPrice: 0,
      deliveryPrice: 0,
      numberOfProducts: 0,
      deliveryTime: "guest-current",
    }),
    addToCart: async () => {
      throw new Error("unused");
    },
  };
  const app = createHttpApp(
    familyConfig,
    oauth,
    {
      verifyAccessToken: async (token) => ({
        token,
        clientId: "chatgpt",
        scopes: [config.requiredScope],
        expiresAt: Date.now() / 1000 + 300,
        extra: { subject: "auth0|guest" },
      }),
    },
    () => ({ client, proposals: new BasketProposalService(client) }),
  );
  const server = app.listen(0, config.host);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const endpoint = new URL(
    `http://${config.host}:${(server.address() as AddressInfo).port}/mcp`,
  );
  try {
    const mcp = modernClient("current-test");
    const transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers: internalHeaders(envelope) },
    });
    await mcp.connect(transport);
    await mcp.callTool({ name: "show_my_basket", arguments: {} });
    assert.deepEqual(logins, ["guest@example.test:guest-secret"]);
    const next = await encryptCredentials(
      { username: "guest@example.test", password: "new-secret" },
      {
        principalKey: guestKey,
        policyRevision: familyPolicy.revision,
        keyVersion: "one",
        generation: 2,
      },
      key,
    );
    const wrongPrincipal = await fetch(endpoint, {
      method: "POST",
      body: "{}",
      headers: {
        ...internalHeaders({ ...envelope, principal_key: "d".repeat(32) }),
        "content-type": "application/json",
      },
    });
    assert.equal(wrongPrincipal.status, 403);
    const rotated = modernClient("current-rotated-test");
    const rotatedTransport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers: internalHeaders(next) },
    });
    await rotated.connect(rotatedTransport);
    await rotated.callTool({ name: "show_my_basket", arguments: {} });
    assert.deepEqual(logins, [
      "guest@example.test:guest-secret",
      "guest@example.test:new-secret",
    ]);
    await rotated.close();
    await mcp.close();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error?: Error) => (error ? reject(error) : resolve())),
    );
  }
});

test("credential-free discovery preserves an active review while credential rotation invalidates it", async () => {
  let providerReads = 0;
  const product = {
    id: 1,
    name: "Fixture milk",
    price: 12,
    unit: "12 kr/L",
    unitPrice: 12,
    unitSize: "1 L",
    brand: "Fixture",
    category: "Dairy",
    subcategory: "Milk",
    imageUrl: "",
    available: true,
    labels: [],
    isOrganic: false,
    isFrozen: false,
    isRefrigerated: true,
    isDairy: true,
    isLactoseFree: false,
    isGlutenFree: true,
    isVegan: false,
    isOnDiscount: false,
  };
  const app = createHttpApp(
    config,
    oauth,
    {
      verifyAccessToken: async (token) => ({
        token,
        clientId: "chatgpt",
        scopes: [config.requiredScope],
        expiresAt: Date.now() / 1000 + 300,
        extra: { subject: ownerSubject },
      }),
    },
    () => {
      const client = {
        isLoggedIn: () => false,
        login: async () => {},
        getProduct: async () => {
          providerReads += 1;
          return product;
        },
      } as unknown as ShoppingClient;
      return { client, proposals: new BasketProposalService(client) };
    },
  );
  const server = app.listen(0, config.host);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const endpoint = new URL(
    `http://${config.host}:${(server.address() as AddressInfo).port}/mcp`,
  );
  const reviewer = modernClient("active-review");
  const discovery = modernClient("credential-free-discovery");
  const rotated = modernClient("rotated-review");
  const _meta = { "openai/session": "review-discovery-regression" };
  try {
    await reviewer.connect(
      new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: await familyHeaders("owner") },
      }),
    );
    const started = await reviewer.callTool({
      _meta,
      name: "start_product_review",
      arguments: { items: [{ product_id: 1, quantity: 2 }] },
    });
    assert.equal(started.isError, undefined);
    const review = (
      started.structuredContent as {
        review: { review_id: string; revision: number };
      }
    ).review;
    assert.equal(providerReads, 1);

    await discovery.connect(
      new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { authorization: "Bearer owner" } },
      }),
    );
    await discovery.listTools();
    const shown = await reviewer.callTool({
      _meta,
      name: "update_product_review_conversation",
      arguments: { review_id: review.review_id, action: { kind: "show" } },
    });
    assert.equal(
      shown.isError,
      undefined,
      "credential-free discovery must not discard the active review",
    );
    assert.deepEqual(
      (shown.structuredContent as { review: unknown }).review,
      review,
    );
    assert.equal(
      providerReads,
      1,
      "discovery and showing retained state must not reread products",
    );

    const next = await encryptCredentials(
      { username: "owner@example.test", password: "rotated-secret" },
      {
        principalKey: "a".repeat(32),
        policyRevision: principalPolicy.revision,
        keyVersion: config.credentialKeyVersion,
        generation: 2,
      },
      config.credentialKey,
    );
    await rotated.connect(
      new StreamableHTTPClientTransport(endpoint, {
        requestInit: {
          headers: { authorization: "Bearer owner", ...envelopeHeaders(next) },
        },
      }),
    );
    const invalidated = await rotated.callTool({
      _meta,
      name: "update_product_review_conversation",
      arguments: { review_id: review.review_id, action: { kind: "show" } },
    });
    assert.equal(
      invalidated.isError,
      true,
      "actual credential rotation must still discard the old review",
    );
  } finally {
    await Promise.all([reviewer.close(), discovery.close(), rotated.close()]);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error?: Error) => (error ? reject(error) : resolve())),
    );
  }
});

test("private validation route decrypts once and exposes no MCP or credential data", async () => {
  const key = Buffer.alloc(32, 4).toString("base64url");
  const familyPolicy = parsePrincipalPolicy(
    JSON.stringify({
      ...principalPolicy,
      principals: principalPolicy.principals.map((principal) =>
        principal.subject === "auth0|guest"
          ? { ...principal, principal_key: "c".repeat(32) }
          : principal,
      ),
    }),
  );
  const validationConfig: Auth0Config = {
    ...config,
    principalPolicy: familyPolicy,
    credentialKey: key,
    credentialKeyVersion: "one",
  };
  const binding = {
    principalKey: "c".repeat(32),
    policyRevision: familyPolicy.revision,
    keyVersion: "one",
    generation: 1,
  };
  const envelope = await encryptCredentials(
    { username: "guest@example.test", password: "private-password" },
    binding,
    key,
  );
  let calls = 0;
  const app = createHttpApp(
    validationConfig,
    oauth,
    {
      verifyAccessToken: async () => {
        throw new Error("unused");
      },
    },
    undefined,
    () => ({
      validateCredentials: async (username, password) => {
        calls += 1;
        assert.deepEqual(
          { username, password },
          { username: "guest@example.test", password: "private-password" },
        );
      },
    }),
  );
  const server = app.listen(0, config.host);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = `http://${config.host}:${(server.address() as AddressInfo).port}`;
  const headers = {
    "x-nemlig-principal-key": binding.principalKey,
    "x-nemlig-policy-revision": binding.policyRevision,
    "x-nemlig-credential-generation": "1",
    "x-nemlig-credential-envelope": btoa(JSON.stringify(envelope)),
  };
  try {
    const accepted = await fetch(`${base}/__credential-validation`, {
      method: "POST",
      headers,
    });
    assert.equal(accepted.status, 204);
    assert.equal(await accepted.text(), "");
    assert.equal(calls, 1);
    const rejected = await fetch(`${base}/__credential-validation`, {
      method: "POST",
      headers: { ...headers, "x-nemlig-principal-key": "d".repeat(32) },
    });
    assert.equal(rejected.status, 403);
    assert.deepEqual(await rejected.json(), { error: "validation_rejected" });
    assert.equal(calls, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error?: Error) => (error ? reject(error) : resolve())),
    );
  }
});

test("family HTTP denies unknown, disabled and mismatched identities before creating provider contexts", async () => {
  let contexts = 0;
  const familyPolicy = parsePrincipalPolicy(
    JSON.stringify({
      ...principalPolicy,
      principals: [
        ...principalPolicy.principals,
        {
          subject: "auth0|disabled",
          principal_key: "d".repeat(32),
          enabled: false,
        },
      ],
    }),
  );
  const app = createHttpApp(
    { ...config, principalPolicy: familyPolicy },
    oauth,
    {
      verifyAccessToken: async (token) => ({
        token,
        clientId: "chatgpt",
        scopes: [config.requiredScope],
        expiresAt: Date.now() / 1000 + 300,
        extra: {
          subject:
            token === "unknown"
              ? "auth0|unknown"
              : token === "disabled"
                ? "auth0|disabled"
                : ownerSubject,
        },
      }),
    },
    () => {
      contexts += 1;
      throw new Error("denied request must not create provider context");
    },
  );
  const server = app.listen(0, config.host);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const endpoint = `http://${config.host}:${(server.address() as AddressInfo).port}/mcp`;
  const ownerHeaders = await familyHeaders("owner");
  const guestHeaders = await familyHeaders("guest");
  try {
    const deniedHeaders: Array<Record<string, string>> = [
      { authorization: "Bearer unknown" },
      { ...guestHeaders, authorization: "Bearer unknown" },
      { ...guestHeaders, authorization: "Bearer disabled" },
      { authorization: "Bearer owner" },
      { ...guestHeaders, authorization: "Bearer owner" },
      {
        authorization: "Bearer owner",
        "x-nemlig-principal-key": "a".repeat(32),
      },
      { ...ownerHeaders, "x-nemlig-policy-revision": "previous-policy" },
      { ...ownerHeaders, "x-nemlig-credential-generation": "2" },
    ];
    for (const headers of deniedHeaders) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "show_my_basket", arguments: {} },
        }),
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        error: "principal_not_allowed",
      });
    }
    assert.equal(contexts, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error?: Error) => (error ? reject(error) : resolve())),
    );
  }
});
