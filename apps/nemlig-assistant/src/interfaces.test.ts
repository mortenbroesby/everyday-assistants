import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { NemligClient, NemligError, SEARCH_GATEWAY_URL, type Basket, type Product, type ShoppingClient } from "./client.js";
import { createProgram } from "./cli.js";
import { createMcpServer, NEMLIG_CONNECT_URL, rankProducts, safeNemligImageUrl, serviceAcceptanceToolInventory } from "./mcp.js";
import { productionToolInventory } from "./production-acceptance.js";
import type { ProductReviewSnapshot } from "./product-review.js";
import { BasketProposalService } from "./proposals.js";
import { PRODUCT_VIEWER_RESOURCE_URI } from "./product-viewer.js";
import { RETIRED_PRODUCT_VIEWER_RESOURCE_URIS } from "./product-viewer-identity.js";
import { NEMLIG_CODENAME, NEMLIG_VERSION } from "./runtime.js";

const expectedProductViewerResources = [
  { uri: PRODUCT_VIEWER_RESOURCE_URI, name: "nemlig-product-viewer", title: "Your draft list", description: "Product results and the shared local shopping draft list supplied by Nemlig Assistant.", mimeType: "text/html;profile=mcp-app" },
  ...RETIRED_PRODUCT_VIEWER_RESOURCE_URIS.map((uri, index) => ({ uri, name: `nemlig-retired-product-viewer-v${index}`, title: "Updated draft list", description: "This retired draft list card is inert and contains no shopping data.", mimeType: "text/html;profile=mcp-app" })),
];

const basket: Basket = {
  items: [{ name: "Milk", quantity: 1, total: 12.5 }],
  productsPrice: 12.5,
  deliveryPrice: 5,
  numberOfProducts: 1,
  deliveryTime: "Tomorrow",
};

const product: Product = {
  id: 7,
  name: "Økologisk mælk",
  price: 12.5,
  unit: "12,50 kr/l",
  unitPrice: 12.5,
  unitSize: "1 liter",
  brand: "Test",
  category: "Køl",
  subcategory: "Mejeri",
  imageUrl: "https://images.test/milk.jpg",
  available: true,
  labels: ["Øko"],
  isOrganic: true,
  isFrozen: false,
  isRefrigerated: true,
  isDairy: true,
  isLactoseFree: false,
  isGlutenFree: false,
  isVegan: false,
  isOnDiscount: false,
};

const fakeClient = (overrides: Partial<ShoppingClient> = {}): ShoppingClient => ({
  isLoggedIn: () => true,
  login: async () => {},
  searchProducts: async () => [product],
  getProduct: async () => product,
  getFreshProduct: async () => product,
  listFavorites: async () => [product],
  listDepartments: async () => [{ id: "/mejeri", name: "Mejeri" }],
  browseDepartment: async () => ({ products: [product], page: 1, hasNext: false }),
  getCart: async () => basket,
  addToCart: async () => basket,
  ...overrides,
});

const testCredentials = async () => ({ username: "person@example.test", password: "secret" });

test("CLI exposes only supported commands and never accepts a password option", () => {
  const help = createProgram({ client: fakeClient() }).helpInformation();
  for (const command of ["login", "logout", "search", "favorites", "add", "cart"]) assert.match(help, new RegExp(command));
  assert.doesNotMatch(help, /\bremove\b/u);
  assert.doesNotMatch(help, /plan_my_shopping|\bplan\b/u);
  for (const forbidden of ["feature-request", "parse", "checkout", "--password"]) assert.doesNotMatch(help, new RegExp(forbidden));
});

test("CLI favorites authenticates and prints the existing product format", async () => {
  const output: string[] = [];
  let requestedLimit: number | undefined;
  const client = fakeClient({
    listFavorites: async (limit) => {
      requestedLimit = limit;
      return [product];
    },
    getCart: async () => {
      throw new Error("basket operation called");
    },
  });
  await createProgram({ client, out: (message) => output.push(message) }).parseAsync(
    ["node", "nemlig", "favorites", "--limit", "1"],
  );
  assert.equal(requestedLimit, 1);
  assert.match(output.join("\n"), /Økologisk mælk/);
  assert.match(output.join("\n"), /7/);
});

test("CLI favorites searches Danish names without touching the basket", async () => {
  const output: string[] = [];
  let requestedLimit: number | undefined;
  const client = fakeClient({
    listFavorites: async (limit) => {
      requestedLimit = limit;
      return [product, { ...product, id: 8, name: "Økologiske bananer" }];
    },
    getCart: async () => {
      throw new Error("basket operation called");
    },
    addToCart: async () => {
      throw new Error("basket operation called");
    },
  });
  await createProgram({ client, out: (message) => output.push(message) }).parseAsync([
    "node",
    "nemlig",
    "favorites",
    "BANAN",
    "--limit",
    "1",
  ]);
  assert.equal(requestedLimit, undefined);
  assert.match(output.join("\n"), /Økologiske bananer/);
  assert.doesNotMatch(output.join("\n"), /Økologisk mælk/);
});

test("CLI add uses exact arguments and prints basket readback", async () => {
  const output: string[] = [];
  let received: [number, number] | undefined;
  const client = fakeClient({
    addToCart: async (id, quantity) => {
      received = [id, quantity ?? 1];
      return basket;
    },
  });
  await createProgram({ client, out: (message) => output.push(message) }).parseAsync(
    ["node", "nemlig", "add", "7", "--quantity", "2"],
  );
  assert.deepEqual(received, [7, 2]);
  assert.match(output.join("\n"), /SHOPPING BASKET/);
  assert.match(output.join("\n"), /Total: 17\.50 DKK/);
});

test("CLI login saves only when requested and uses the masked prompt seam", async () => {
  const saved: string[] = [];
  let prompted = false;
  await createProgram({
    client: fakeClient({ isLoggedIn: () => false }),
    credentials: async () => undefined,
    prompt: async (username) => {
      prompted = true;
      return { username: username ?? "person@example.test", password: "private" };
    },
    save: async (credentials) => {
      saved.push(credentials.username);
    },
    out: () => {},
  }).parseAsync(["node", "nemlig", "login", "--username", "person@example.test", "--save"]);
  assert.equal(prompted, true);
  assert.deepEqual(saved, ["person@example.test"]);
});

test("retired CLI feature request is rejected without a side effect", async () => {
  const client = fakeClient({
    getCart: async () => { throw new Error("unexpected basket read"); },
    addToCart: async () => { throw new Error("unexpected basket mutation"); },
  });
  const program = createProgram({
    client,
    out: () => {},
  }).exitOverride();
  await assert.rejects(program.parseAsync([
    "node",
    "nemlig",
    "feature-request",
    "Prefer discounted favorites",
    "--summary",
    "Choose discounted favorites first.",
  ]), /unknown command|feature-request/iu);
});

const withMcpClient = async <T>(
  server: ReturnType<typeof createMcpServer>,
  action: (client: Client) => Promise<T>,
  capabilities?: { elicitation?: { url?: Record<string, never> } },
): Promise<T> => {
  const handler = createMcpHandler(() => server, { legacy: "reject" });
  const nodeHandler = toNodeHandler(handler);
  const httpServer = createServer((req, res) => { void nodeHandler(req, res); });
  httpServer.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    httpServer.once("listening", resolve);
    httpServer.once("error", reject);
  });
  const endpoint = new URL(`http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/mcp`);
  const client = new Client({ name: "test", version: "1.0.0" }, {
    versionNegotiation: { mode: { pin: "2026-07-28" } },
    ...(capabilities ? { capabilities } : {}),
  });
  const transport = new StreamableHTTPClientTransport(endpoint);
  await client.connect(transport);
  try {
    return await action(client);
  } finally {
    await client.close();
    await handler.close();
    httpServer.closeAllConnections();
    await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  }
};

const toolText = (result: unknown): string =>
  ((((result as { content?: unknown })?.content) as Array<{ type?: string; text?: string }> | undefined)
    ?.find(({ type }) => type === "text")?.text ?? "");

const friendlyCatalog = [
  ["check_nemlig_connection", "Check my Nemlig connection", true, false, []],
  ["find_groceries", "Search Nemlig products", true, false, ["search_term", "result_count"]],
  ["get_profile", "Get my Nemlig profile", true, false, []],
  ["show_my_basket", "Show my Nemlig basket", true, false, []],
  ["start_product_review", "Show or start your draft list", false, false, ["items"]],
  ["submit_product_review_conversation", "Add explicitly requested Ready products to Nemlig", false, false, ["review_id", "revision", "submission_id"]],
  ["update_product_review_conversation", "Update your draft list", false, false, ["review_id", "revision", "action"]],
] as const;

const formerToolNames = [
  "search_products", "list_favorites", "plan_shopping_list", "list_departments", "browse_department",
  "save_shopping_plan", "load_shopping_plan", "create_feature_request", "view_cart", "prepare_cart_additions",
  "apply_cart_additions", "prepare_cart_removal", "apply_cart_removal", "prepare_cart_replacement",
  "apply_cart_replacement", "prepare_cart_clear", "apply_cart_clear", "pick_products", "suggest_an_improvement",
  "choose_products_visually",
  "show_my_basket_visually", "review_items_to_add", "add_approved_items",
  "reconnect_nemlig_assistant", "get_grocery_details", "show_my_favorites", "show_grocery_sections", "browse_grocery_section",
  "save_my_shopping_plan", "continue_my_shopping_plan", "show_my_shopping_lists", "save_my_shopping_list",
  "copy_my_shopping_list", "set_my_shopping_list_status", "shop_from_my_list", "migrate_my_saved_plan",
] as const;

test("product tags retain only positively supported organic facts", () => {
  const ranked = rankProducts(
    [
      { ...product, id: 1, price: 20, name: "Frossen mælk", isFrozen: true },
      { ...product, id: 2, price: 12, name: "Frisk mælk", isOrganic: false, labels: [] },
      { ...product, id: 3, price: 5, name: "Udsolgt mælk", available: false },
    ],
    "mælk",
  );
  assert.deepEqual(ranked.find((item) => item.id === 2)?.tags, []);
  assert.deepEqual(ranked.find((item) => item.id === 1)?.tags, ["organic"]);
  assert.deepEqual(ranked.find((item) => item.id === 3)?.tags, ["organic"]);
  assert.deepEqual(rankProducts([], "mælk"), []);
});

test("profile exposes the live runtime release without provider access", async () => {
  let providerCalls = 0;
  const client = fakeClient({
    isLoggedIn: () => { providerCalls += 1; return true; },
    login: async () => { providerCalls += 1; },
    getCart: async () => { providerCalls += 1; return basket; },
  });
  await withMcpClient(createMcpServer(client, testCredentials, undefined, undefined, {
    principalKey: "auth0|profile-owner",
    policyRevision: "test-v1",
  }), async (mcp) => {
    const tool = (await mcp.listTools()).tools.find(({ name }) => name === "get_profile");
    assert.deepEqual(tool?._meta, {
      "openai/profile": true,
      securitySchemes: [{ type: "oauth2", scopes: ["use:nemlig-assistant"] }],
    });
    const result = await mcp.callTool({ name: "get_profile", arguments: {} });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, {
      id: "auth0|profile-owner",
      release: { version: NEMLIG_VERSION, codename: NEMLIG_CODENAME },
    });
  });
  assert.equal(providerCalls, 0);
});

test("MCP exposes the complete friendly catalog and clean missing-credential errors", async () => {
  const client = fakeClient({ isLoggedIn: () => false });
  await withMcpClient(createMcpServer(client, async () => undefined), async (mcp) => {
    const tools = (await mcp.listTools()).tools
      .filter((tool) => {
        const visibility = (tool._meta?.ui as { visibility?: string[] } | undefined)?.visibility;
        return !visibility || visibility.includes("model");
      })
      .sort((left, right) => left.name.localeCompare(right.name));
    assert.deepEqual(tools.map(({ name }) => name), friendlyCatalog.map(([name]) => name));
    for (const [name, title, readOnlyHint, destructiveHint, inputs] of friendlyCatalog) {
      const tool = tools.find((candidate) => candidate.name === name);
      assert.equal(tool?.title, title, name);
      assert.ok(tool?.description, `${name} needs a description`);
      assert.deepEqual(tool?.annotations, { readOnlyHint, destructiveHint, openWorldHint: name !== "get_profile" }, name);
      assert.deepEqual(tool?._meta?.securitySchemes, [{ type: "oauth2", scopes: ["use:nemlig-assistant"] }], name);
      const properties = (tool?.inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {};
      assert.deepEqual(Object.keys(properties).sort(), [...inputs].sort(), `${name} inputs drifted`);
      for (const input of inputs) assert.ok(properties[input]?.description, `${name}.${input} needs plain-language guidance`);
    }
    const catalogText = tools.flatMap(({ name, title, description, inputSchema }) => {
      const properties = (inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {};
      return [name, title, description, ...Object.entries(properties).flatMap(([input, schema]) => [input, schema.description])];
    }).join("\n");
    for (const name of formerToolNames) assert.equal(tools.some((tool) => tool.name === name), false, name);
    assert.doesNotMatch(catalogText, /\b(?:immutable snapshot|uuid|department_id|internal status)\b/iu);
    assert.equal(tools.some((tool) => /recipe|checkout|order|pay|purchase/iu.test(tool.name)), false);
    const result = await mcp.callTool({ name: "show_my_basket", arguments: {} });
    assert.equal(result.isError, true);
    const content = result.content as Array<{ type: string; text?: string }>;
    assert.match(content[0]?.text ?? "", /credentials configured/);
  });
});

test("production MCP inventory is exact", async () => {
  const expected = Object.values(productionToolInventory).flat().sort();
  await withMcpClient(createMcpServer(fakeClient(), testCredentials), async (mcp) => {
    assert.deepEqual((await mcp.listTools()).tools.map((tool) => tool.name).sort(), expected);
  });
});

test("retired MCP calls reject before the Nemlig client", async () => {
  let calls = 0;
  const unexpected = async (): Promise<never> => { calls += 1; throw new Error("unexpected Nemlig call"); };
  const client = fakeClient({
    isLoggedIn: () => { calls += 1; return true; }, login: unexpected, searchProducts: unexpected,
    getProduct: unexpected, getFreshProduct: unexpected, listFavorites: unexpected, listDepartments: unexpected,
    browseDepartment: unexpected, getCart: unexpected, addToCart: unexpected,
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    for (const name of formerToolNames) await assert.rejects(mcp.callTool({ name, arguments: {} }), /not found/iu, name);
  });
  assert.equal(calls, 0);
});

test("service acceptance exposes only its fixed read-only tool inventory", async () => {
  assert.equal((serviceAcceptanceToolInventory as readonly string[]).includes("show_my_basket"), true);
  assert.equal((serviceAcceptanceToolInventory as readonly string[]).includes("choose_products_visually"), false);
  let calls = 0;
  const unexpected = async (): Promise<never> => { calls += 1; throw new Error("unexpected Nemlig call"); };
  const client = fakeClient({
    isLoggedIn: () => { calls += 1; return true; }, login: unexpected, searchProducts: unexpected,
    getProduct: unexpected, getFreshProduct: unexpected, listFavorites: unexpected, listDepartments: unexpected,
    browseDepartment: unexpected, getCart: unexpected, addToCart: unexpected,
  });
  for (const expectedVariant of [serviceAcceptanceToolInventory, serviceAcceptanceToolInventory] as const) await withMcpClient(createMcpServer(client, testCredentials, undefined, undefined, {
    principalKey: "s".repeat(32), policyRevision: "service", kind: "service",
  }), async (mcp) => {
    const expected = expectedVariant;
    assert.deepEqual((await mcp.listTools()).tools.map(({ name }) => name).sort(), [...expected].sort());
    assert.deepEqual((await mcp.listResources()).resources, expectedProductViewerResources);
    await assert.rejects(mcp.readResource({ uri: "ui://nemlig/product-viewer-v-old.html" }), /resource/iu);
    await assert.rejects(mcp.callTool({ name: "add_approved_items", arguments: { approved_review: "00000000-0000-4000-8000-000000000000" } }), /not found/iu);
  });
  assert.equal(calls, 0);
});

test("MCP hides generic provider failure details", async () => {
  const providerSecret = "provider-secret-should-not-reach-mcp";
  await withMcpClient(
    createMcpServer(fakeClient({ searchProducts: async () => { throw new Error(providerSecret); } }), testCredentials),
    async (mcp) => {
      const result = await mcp.callTool({ name: "find_groceries", arguments: { search_term: "mælk", result_count: 1 } });
      assert.equal(result.isError, true);
      assert.equal(toolText(result), "find_groceries failed.");
      assert.doesNotMatch(toolText(result), new RegExp(providerSecret));
    },
  );
});

test("connection guidance uses URL elicitation only when explicitly supported", async () => {
  await withMcpClient(createMcpServer(fakeClient(), async () => undefined), async (mcp) => {
    const result = await mcp.callTool({ name: "check_nemlig_connection", arguments: {} });
    assert.deepEqual(result.structuredContent, { status: "connection_required", connection_url: NEMLIG_CONNECT_URL }, JSON.stringify(result));
  });

  let elicitation: unknown;
  await withMcpClient(createMcpServer(fakeClient(), async () => undefined), async (client) => {
    client.setRequestHandler("elicitation/create", async (request) => {
      elicitation = request.params;
      return { action: "accept" };
    });
    const result = await client.callTool({ name: "check_nemlig_connection", arguments: {} });
    assert.deepEqual(result.structuredContent, { status: "connection_required", connection_url: NEMLIG_CONNECT_URL }, JSON.stringify(result));
    assert.deepEqual(elicitation, {
      mode: "url",
      message: "Open the secure Nemlig connection page. Do not enter your password in chat.",
      url: NEMLIG_CONNECT_URL,
    });
  }, { elicitation: { url: {} } });
});

test("connection status verifies Nemlig and does not trust OAuth context alone", async () => {
  const client = fakeClient({ getCart: async () => { throw new NemligError("Nemlig unavailable"); } });
  await withMcpClient(createMcpServer(client, testCredentials, undefined, undefined, {
    principalKey: "p".repeat(32), policyRevision: "test",
  }), async (mcp) => {
    const result = await mcp.callTool({ name: "check_nemlig_connection", arguments: {} });
    assert.deepEqual(result.structuredContent, { status: "provider_unavailable", connection_url: NEMLIG_CONNECT_URL });
  });

  await withMcpClient(createMcpServer(fakeClient(), async () => ({ username: "owner@example.test", password: "secret" })), async (mcp) => {
    const result = await mcp.callTool({ name: "check_nemlig_connection", arguments: {} });
    assert.deepEqual(result.structuredContent, { status: "connected", connection_url: NEMLIG_CONNECT_URL });
  });
});

test("MCP find_groceries authenticates first and retries once on a later expired-session response", async () => {
  let calls = 0;
  let logins = 0;
  const client = fakeClient({
    isLoggedIn: () => true,
    login: async () => {
      logins += 1;
    },
    searchProducts: async () => {
      calls += 1;
      if (calls === 1) throw new NemligError("Search failed", 401);
      return [product];
    },
  });
  await withMcpClient(
    createMcpServer(client, testCredentials),
    async (mcp) => {
      const result = await mcp.callTool({ name: "find_groceries", arguments: { search_term: "mælk", result_count: 1 } });
      assert.notEqual(result.isError, true, toolText(result));
      const returned = (result.structuredContent as { result: Array<{ id: number }> }).result;
      assert.deepEqual(returned.map(({ id }) => id), [7]);
    },
  );
  assert.equal(calls, 2);
  assert.equal(logins, 1);
});

test("MCP distinguishes a successful empty salmiak search from an upstream HTTP 500", async () => {
  const callSearch = async (status: number) => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async input => {
      const url = new URL(String(input));
      calls.push(url.href);
      const json = (value: unknown, responseStatus = 200) => new Response(JSON.stringify(value), {
        status: responseStatus,
        headers: { "content-type": "application/json" },
      });
      if (url.pathname.endsWith("/AntiForgery")) {
        const headers = new Headers({ "content-type": "application/json" });
        headers.append("set-cookie", "XSRF-TOKEN=fixture-xsrf; Path=/; Secure");
        headers.append("set-cookie", "XSRF-COOKIE-TOKEN=fixture-cookie; Path=/; Secure");
        return new Response(JSON.stringify({ Header: "X-XSRF-TOKEN", Value: "fixture-xsrf" }), { headers });
      }
      if (url.pathname.endsWith("/login")) return json({ RedirectUrl: "/" });
      if (url.pathname.endsWith("/Token")) return json({ access_token: "fixture-token" });
      if (url.pathname.endsWith("/v2/AppSettings/Website")) return json({ CombinedProductsAndSitecoreTimestamp: "fixture-products", SitecorePublishedStamp: "fixture-site" });
      if (url.pathname.endsWith("/user/GetCurrentUser")) return json({ DebitorId: 42 });
      if (url.pathname.endsWith("/Order/DeliverySpot")) return json({ TimeslotUtc: "2026092915-60-240", TimeslotId: 7, DeliveryZoneId: 9 });
      if (url.origin + url.pathname === `${SEARCH_GATEWAY_URL}/search`) {
        assert.equal(url.searchParams.get("query"), "salmiak");
        return json({}, status);
      }
      if (url.origin + url.pathname === `${SEARCH_GATEWAY_URL}/quick`) return json({ Categories: [] });
      throw new Error(`Unexpected fixture request: ${url.pathname}`);
    };
    return withMcpClient(createMcpServer(new NemligClient(fetcher), testCredentials), async mcp => {
      const tool = (await mcp.listTools()).tools.find(item => item.name === "find_groceries");
      assert.match(tool?.description ?? "", /not tied to the current draft list or an alternative target/u);
      return { result: await mcp.callTool({ name: "find_groceries", arguments: { search_term: "salmiak" } }), calls };
    });
  };

  const empty = await callSearch(200);
  assert.equal(empty.result.isError, undefined, toolText(empty.result));
  assert.deepEqual((empty.result.structuredContent as { result: unknown[] }).result, []);
  assert.match(toolText(empty.result), /No products found/u);
  assert.equal(empty.calls.filter(url => url.includes("/search?")).length, 1);
  assert.equal(empty.calls.filter(url => url.includes("/quick?")).length, 1);

  const failed = await callSearch(500);
  assert.equal(failed.result.isError, true);
  assert.equal(toolText(failed.result), "Search products failed (HTTP 500).");
  assert.equal(failed.calls.filter(url => url.includes("/search?")).length, 1);
  assert.equal(failed.calls.filter(url => url.includes("/quick?")).length, 0, "a primary HTTP failure is not retried as a different search or converted to empty");
});

test("every MCP tool has complete schemas, accurate annotations, and safe server instructions", async () => {
  await withMcpClient(createMcpServer(fakeClient(), testCredentials), async (mcp) => {
    const tools = (await mcp.listTools()).tools;
    for (const tool of tools) {
      assert.ok(tool.title, `${tool.name} needs a title`);
      assert.ok(tool.description, `${tool.name} needs a description`);
      assert.ok(tool.inputSchema, `${tool.name} needs an input schema`);
      assert.ok(tool.outputSchema, `${tool.name} needs an output schema`);
      assert.ok(tool.annotations, `${tool.name} needs annotations`);
    }
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const name of ["find_groceries", "check_nemlig_connection", "show_my_basket"]) {
      assert.equal(byName.get(name)?.annotations?.readOnlyHint, true, name);
      assert.equal(byName.get(name)?.annotations?.destructiveHint, false, name);
    }
    for (const name of ["start_product_review", "update_product_review_conversation", "submit_product_review_conversation"]) {
      assert.equal(byName.get(name)?.annotations?.readOnlyHint, false, name);
      assert.equal(byName.get(name)?.annotations?.destructiveHint, false, name);
    }
    assert.match(mcp.getInstructions() ?? "", /^Search Nemlig products with find_groceries/u);
    assert.equal((mcp.getInstructions() ?? "").includes("Current release:"), false);
    assert.equal((mcp.getInstructions() ?? "").includes(NEMLIG_VERSION), false);
    assert.equal((mcp.getInstructions() ?? "").includes(NEMLIG_CODENAME), false);
    assert.match(mcp.getInstructions() ?? "", /The real Nemlig basket is add-only/u);
    assert.match(mcp.getInstructions() ?? "", /Local draft list edits never write to Nemlig/u);
    assert.match(mcp.getInstructions() ?? "", /asks to see products visually.*native Draft list/u);
    assert.match(mcp.getInstructions() ?? "", /visual request conflicts.*ask whether to allow it/u);
    assert.doesNotMatch(
      JSON.stringify({ tools, instructions: mcp.getInstructions() }),
      /password|cookie|bearer|access[_-]?token|api[_-]?key|session[_-]?id/iu,
    );
  });
});

test("authenticated HTTP request context preserves stdio tool and resource metadata", async () => {
  await withMcpClient(createMcpServer(fakeClient(), testCredentials), async (stdio) => {
    await withMcpClient(
      createMcpServer(fakeClient(), testCredentials, undefined, undefined, { principalKey: "auth0|owner", policyRevision: "test-v1" }),
      async (http) => {
        assert.deepEqual(await http.listTools(), await stdio.listTools());
        const expectedResources = expectedProductViewerResources;
        assert.deepEqual((await stdio.listResources()).resources, expectedResources);
        assert.deepEqual((await http.listResources()).resources, expectedResources);
        assert.equal(http.getInstructions(), stdio.getInstructions());
      },
    );
  });
});

test("MCP distinguishes the draft list from the actual Nemlig basket", async () => {
  await withMcpClient(createMcpServer(fakeClient(), testCredentials), async (mcp) => {
    const tools = new Map((await mcp.listTools()).tools.map((tool) => [tool.name, tool.description ?? ""]));
    const instructions = mcp.getInstructions() ?? "";
    assert.match(instructions, /temporary conversation draft list/u);
    assert.match(instructions, /real Nemlig basket is add-only/u);
    assert.match(instructions, /Never remove, decrease, replace, swap, clear, check out, pay, order/u);
    assert.match(instructions, /After an uncertain write, inspect the draft list and actual basket; never retry automatically/u);
    assert.match(tools.get("find_groceries") ?? "", /current Nemlig catalogue independently/u);
    assert.match(tools.get("show_my_basket") ?? "", /actual Nemlig basket, not the local draft list/u);
    assert.match(tools.get("start_product_review") ?? "", /Omit items to reopen/u);
    assert.match(tools.get("update_product_review_conversation") ?? "", /None of these local edits writes to Nemlig/u);
    assert.match(tools.get("submit_product_review_conversation") ?? "", /Local Ready acceptance alone.*is not authorization/u);
    assert.equal((await mcp.listResources()).resources[0]?.uri, PRODUCT_VIEWER_RESOURCE_URI);
    const viewer = await mcp.readResource({ uri: PRODUCT_VIEWER_RESOURCE_URI });
    assert.equal(viewer.contents[0]?.mimeType, "text/html;profile=mcp-app");
    assert.ok(viewer.contents[0] && "text" in viewer.contents[0]);
    if (viewer.contents[0] && "text" in viewer.contents[0]) assert.match(viewer.contents[0].text, /Your Nemlig Draft list/u);
    for (const uri of RETIRED_PRODUCT_VIEWER_RESOURCE_URIS) {
      const retiredViewer = await mcp.readResource({ uri });
      assert.equal(retiredViewer.contents[0]?.mimeType, "text/html;profile=mcp-app", uri);
      assert.ok(retiredViewer.contents[0] && "text" in retiredViewer.contents[0], uri);
      if (retiredViewer.contents[0] && "text" in retiredViewer.contents[0]) {
        assert.match(retiredViewer.contents[0].text, /read-only/u, uri);
        assert.doesNotMatch(retiredViewer.contents[0].text, /<button|tools\/call|callTool|fetch\(/iu, uri);
      }
    }
    assert.match(JSON.stringify((await mcp.listTools()).tools.find((tool) => tool.name === "find_groceries")?.inputSchema), /concise Danish catalogue phrase/u);
  });
});

test("visual product discovery routes exact fixture results into the local selection viewer", async () => {
  const fixtureProducts = [
    { ...product, id: 401, name: "Conference pear", isDairy: false, isRefrigerated: false },
    { ...product, id: 402, name: "Organic banana", isDairy: false, isRefrigerated: false },
  ];
  let searchCalls = 0;
  let startCalls = 0;
  let basketReads = 0;
  let basketWrites = 0;
  const provider = fakeClient({
    searchProducts: async (query) => {
      searchCalls++;
      assert.equal(query, "pear and banana");
      return fixtureProducts;
    },
    getProduct: async (id) => fixtureProducts.find(({ id: candidateId }) => candidateId === id) ?? fixtureProducts[0],
    getCart: async () => { basketReads++; throw new Error("visual selection must not read the actual basket"); },
    addToCart: async () => { basketWrites++; throw new Error("visual selection must not write to the actual basket"); },
  });

  await withMcpClient(createMcpServer(provider, testCredentials), async (mcp) => {
    const originalCallTool = mcp.callTool.bind(mcp);
    mcp.callTool = async (params, options) => {
      if (params.name === "start_product_review") startCalls++;
      return originalCallTool(params, options);
    };
    const found = await mcp.callTool({ name: "find_groceries", arguments: { search_term: "pear and banana" } });
    assert.equal(found.isError, undefined, toolText(found));
    const ids = (found.structuredContent as { result: Array<{ id: number }> }).result.map(({ id }) => id);
    assert.deepEqual(ids, [401, 402]);
    const searchTool = (await mcp.listTools()).tools.find(({ name }) => name === "find_groceries");
    const startTool = (await mcp.listTools()).tools.find(({ name }) => name === "start_product_review");
    assert.equal((searchTool?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri, undefined);
    assert.equal((startTool?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri, PRODUCT_VIEWER_RESOURCE_URI);

    const started = await mcp.callTool({ name: "start_product_review", arguments: { items: ids.map(product_id => ({ product_id, quantity: 1 })) } });
    assert.equal(started.isError, undefined, toolText(started));
    const initial = (started.structuredContent as { review: ProductReviewSnapshot }).review;
    assert.deepEqual(initial.items.map(({ product_id, state }) => [product_id, state]), [[401, "needs-review"], [402, "needs-review"]]);
    const shown = await mcp.callTool({ name: "update_product_review_conversation", arguments: { action: { kind: "show" } } });
    assert.equal(shown.isError, undefined, toolText(shown));
    const current = (shown.structuredContent as { review: ProductReviewSnapshot }).review;
    assert.equal(current.review_id, initial.review_id);
    assert.deepEqual(current.items.map(({ product_id, state }) => [product_id, state]), [[401, "needs-review"], [402, "needs-review"]]);
  });
  assert.equal(searchCalls, 1);
  assert.equal(startCalls, 1);
  assert.equal(basketReads, 0);
  assert.equal(basketWrites, 0);
});

test("appending an exact search result preserves Ready and showing the selection does not restart discovery", async () => {
  const pear = { ...product, id: 411, name: "Green pear", isDairy: false, isRefrigerated: false };
  const banana = { ...product, id: 412, name: "Banana", isDairy: false, isRefrigerated: false };
  const searched: string[] = [];
  let startCalls = 0;
  let basketReads = 0;
  let basketWrites = 0;
  const provider = fakeClient({
    searchProducts: async (query) => {
      searched.push(query);
      return query === "pear" ? [pear] : [banana];
    },
    getProduct: async (id) => [pear, banana].find(({ id: candidateId }) => candidateId === id) ?? pear,
    getCart: async () => { basketReads++; throw new Error("local selection must not read the actual basket"); },
    addToCart: async () => { basketWrites++; throw new Error("local selection must not write to the actual basket"); },
  });

  await withMcpClient(createMcpServer(provider, testCredentials), async (mcp) => {
    const originalCallTool = mcp.callTool.bind(mcp);
    mcp.callTool = async (params, options) => {
      if (params.name === "start_product_review") startCalls++;
      return originalCallTool(params, options);
    };
    const firstSearch = await mcp.callTool({ name: "find_groceries", arguments: { search_term: "pear" } });
    const firstId = (firstSearch.structuredContent as { result: Array<{ id: number }> }).result[0]!.id;
    const started = await mcp.callTool({ name: "start_product_review", arguments: { items: [{ product_id: firstId, quantity: 1 }] } });
    let review = (started.structuredContent as { review: ProductReviewSnapshot }).review;
    const accepted = await mcp.callTool({ name: "update_product_review_conversation", arguments: {
      review_id: review.review_id, revision: review.revision, action: { kind: "accept", product_ids: [firstId] },
    } });
    review = (accepted.structuredContent as { review: ProductReviewSnapshot }).review;
    assert.equal(review.items[0]?.state, "ready");

    const secondSearch = await mcp.callTool({ name: "find_groceries", arguments: { search_term: "banana" } });
    const secondId = (secondSearch.structuredContent as { result: Array<{ id: number }> }).result[0]!.id;
    const appended = await mcp.callTool({ name: "update_product_review_conversation", arguments: {
      review_id: review.review_id, revision: review.revision,
      action: { kind: "add", items: [{ product_id: secondId, quantity: 2 }] },
    } });
    review = (appended.structuredContent as { review: ProductReviewSnapshot }).review;
    assert.deepEqual(review.items.map(({ product_id, quantity, state }) => [product_id, quantity, state]), [
      [411, 1, "ready"], [412, 2, "needs-review"],
    ]);

    const shown = await mcp.callTool({ name: "update_product_review_conversation", arguments: { action: { kind: "show" } } });
    const current = (shown.structuredContent as { review: ProductReviewSnapshot }).review;
    assert.equal(current.review_id, review.review_id);
    assert.equal(current.revision, review.revision);
    assert.deepEqual(current.items.map(({ product_id, quantity, state }) => [product_id, quantity, state]), [
      [411, 1, "ready"], [412, 2, "needs-review"],
    ]);
  });
  assert.deepEqual(searched, ["pear", "banana"]);
  assert.equal(startCalls, 1);
  assert.equal(basketReads, 0);
  assert.equal(basketWrites, 0);
});

test("MCP basket viewer uses basket summaries without fetching product details", async () => {
  let productReads = 0;
  const client = fakeClient({
    getCart: async () => ({
      ...basket,
      items: [{ id: 44, name: "Banan", quantity: 3, total: 7.5 }],
    }),
    getProduct: async () => { productReads += 1; throw new Error("product lookup must not run while rendering a basket"); },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const result = await mcp.callTool({ name: "show_my_basket", arguments: {} });
    assert.notEqual(result.isError, true, toolText(result));
    const views = (result.structuredContent as { views: Array<{ context: string; product: { id: number; price?: number; available?: boolean }; basket: { quantity: number; line_total: number } }> }).views;
    assert.equal(views[0]?.context, "basket");
    assert.equal(views[0]?.product.id, 44);
    assert.equal(views[0]?.product.price, undefined);
    assert.equal(views[0]?.product.available, undefined);
    assert.equal(views[0]?.basket.quantity, 3);
    assert.equal(views[0]?.basket.line_total, 7.5);
  });
  assert.equal(productReads, 0);
});

test("model-visible product images allow only observed Nemlig HTTPS origins", () => {
  assert.equal(safeNemligImageUrl("https://nemlig.com/scommerce/images/milk.jpg?i=1"), "https://nemlig.com/scommerce/images/milk.jpg?i=1");
  assert.equal(safeNemligImageUrl("https://www.nemlig.com/scommerce/images/milk.jpg?i=1"), "https://www.nemlig.com/scommerce/images/milk.jpg?i=1");
  for (const value of ["http://www.nemlig.com/image.jpg", "https://nemlig.com.evil.test/image.jpg", "https://images.test/image.jpg", "not a url", undefined]) {
    assert.equal(safeNemligImageUrl(value), undefined);
  }
});

test("retired MCP feature request is unavailable and has no Nemlig side effect", async () => {
  const client = fakeClient({
    getCart: async () => { throw new Error("unexpected basket read"); },
    addToCart: async () => { throw new Error("unexpected basket mutation"); },
  });
  await withMcpClient(
    createMcpServer(client, async () => undefined, undefined, new BasketProposalService(client)),
    async (mcp) => {
      assert.equal((await mcp.listTools()).tools.some((tool) => tool.name === "suggest_an_improvement"), false);
      await assert.rejects(mcp.callTool({
        name: "suggest_an_improvement",
        arguments: {
          title: "Prefer discounted favorites",
          summary: "Choose discounted favorites first.",
          acceptance_criteria: ["Search favorites first"],
        },
      }), /not found/iu);
    },
  );
});

test("legacy raw visual chooser is unavailable", async () => {
  await withMcpClient(createMcpServer(fakeClient(), testCredentials), async (mcp) => {
    await assert.rejects(mcp.callTool({ name: "choose_products_visually", arguments: { search_term: "mælk", result_count: 5 } }), /not found/iu);
  });
});

test("a clear conversational add command authorizes only its exact prepared Ready selection", async () => {
  let writes = 0;
  let current: Basket = { items: [{ id: 99, name: "Existing", quantity: 1, total: 2 }], productsPrice: 2, deliveryPrice: 0, numberOfProducts: 1, deliveryTime: undefined };
  const provider = fakeClient({
    getCart: async () => structuredClone(current),
    addToCart: async (id, quantity = 1) => {
      writes++;
      current = { ...current, items: [{ id: 99, name: "Existing", quantity: 1, total: 2 }, { id, name: product.name, quantity, total: quantity * product.price! }], productsPrice: 2 + quantity * product.price!, numberOfProducts: 1 + quantity };
      return structuredClone(current);
    },
  });
  await withMcpClient(createMcpServer(provider, testCredentials), async mcp => {
    const started = await mcp.callTool({ name: "start_product_review", arguments: { items: [{ product_id: 7, quantity: 2 }] } });
    assert.equal(started.isError, undefined);
    let review = (started.structuredContent as { review: ProductReviewSnapshot }).review;
    const update = async (action: Record<string, unknown>) => {
      const result = await mcp.callTool({ name: "update_product_review_conversation", arguments: { review_id: review.review_id, revision: review.revision, action } });
      assert.equal(result.isError, undefined, toolText(result));
      review = (result.structuredContent as { review: typeof review }).review;
    };
    await update({ kind: "accept", product_ids: [7] });
    assert.equal(review.items[0]?.state, "ready");
    // This MCP tool sequence represents the user's explicit conversational command to add
    // the current Ready selection. The model must not ask for a second redundant approval.
    await update({ kind: "prepare_submission" });
    assert.equal(writes, 0);
    assert.ok(review.submission);
    assert.equal(JSON.stringify(review).includes("proposal_id"), false);
    const tool = (await mcp.listTools()).tools.find(t => t.name === "submit_product_review_conversation");
    assert.deepEqual((tool?._meta?.ui as { visibility: string[] }).visibility, ["model"]);
    assert.equal(tool?._meta?.["openai/widgetAccessible"], undefined);
    const args = { review_id: review.review_id, revision: review.revision, submission_id: review.submission.submission_id };
    const submitted = await mcp.callTool({ name: "submit_product_review_conversation", arguments: args });
    assert.equal(submitted.isError, undefined, toolText(submitted));
    const data = submitted.structuredContent as { review: typeof review; result: { basket: { items: Array<{ id: number; quantity: number }> } } };
    assert.equal(data.review.submission?.status, "submitted");
    assert.equal(data.review.items[0]?.state, "ready");
    assert.equal(data.review.items.length, 1);
    assert.deepEqual(data.result.basket.items.map(i => [i.id, i.quantity]), [[99, 1], [7, 2]]);
    assert.equal((await mcp.callTool({ name: "submit_product_review_conversation", arguments: args })).isError, true);
    assert.equal(writes, 1);
  });
});

test("only the newest Draft list card can invoke widget actions", async () => {
  let basketReads = 0;
  let basketWrites = 0;
  const provider = fakeClient({
    getCart: async () => { basketReads++; return basket; },
    addToCart: async () => { basketWrites++; return basket; },
  });
  await withMcpClient(createMcpServer(provider, testCredentials), async (mcp) => {
    const absent = await mcp.callTool({ name: "start_product_review", arguments: {} });
    assert.equal(absent.isError, true);
    assert.match(toolText(absent), /No active Draft list to show/u);
    const tools = (await mcp.listTools()).tools;
    const tool = (name: string) => tools.find((entry) => entry.name === name)!;
    const startMetadata = tool("start_product_review")._meta as Record<string, unknown>;
    assert.equal(startMetadata["openai/outputTemplate"], PRODUCT_VIEWER_RESOURCE_URI);
    assert.equal(startMetadata["openai/widgetAccessible"], undefined);
    const modelUpdate = tool("update_product_review_conversation")._meta as { ui: { visibility: string[] }; [key: string]: unknown };
    assert.deepEqual(modelUpdate.ui.visibility, ["model"]);
    assert.equal(modelUpdate["openai/outputTemplate"], undefined);
    assert.equal(modelUpdate["openai/widgetAccessible"], undefined);
    for (const name of ["update_product_review", "submit_product_review"]) {
      const metadata = tool(name)._meta as { ui: { visibility: string[] }; [key: string]: unknown };
      assert.deepEqual(metadata.ui.visibility, ["app"]);
      assert.equal(metadata["openai/widgetAccessible"], true);
      assert.equal(metadata["openai/outputTemplate"], undefined);
    }

    const start = () => mcp.callTool({ name: "start_product_review", arguments: { items: [{ product_id: 7, quantity: 1 }] } });
    const first = (await start()).structuredContent as { review: ProductReviewSnapshot; view_id: string };
    const latest = (await start()).structuredContent as { review: ProductReviewSnapshot; view_id: string };
    assert.equal(latest.review.review_id, first.review.review_id);
    assert.notEqual(latest.view_id, first.view_id);

    const reopened = await mcp.callTool({ name: "start_product_review", arguments: {} });
    assert.equal(reopened.isError, undefined, toolText(reopened));
    const reopenedView = reopened.structuredContent as { review: ProductReviewSnapshot; view_id: string };
    assert.equal(reopenedView.review.review_id, first.review.review_id);
    assert.deepEqual(reopenedView.review.items, first.review.items);
    assert.notEqual(reopenedView.view_id, latest.view_id);

    const oldEdit = await mcp.callTool({ name: "update_product_review", arguments: {
      view_id: first.view_id, review_id: first.review.review_id, revision: first.review.revision,
      action: { kind: "remove", product_ids: [7] },
    } });
    assert.equal(oldEdit.isError, true);
    assert.match(toolText(oldEdit), /out of date/u);

    const preview = await mcp.callTool({ name: "update_product_review", arguments: { action: { kind: "show" } } });
    assert.equal(preview.isError, undefined, toolText(preview));
    const readOnlySnapshot = preview.structuredContent as { review: ProductReviewSnapshot; view_id?: string };
    assert.equal(readOnlySnapshot.review.review_id, reopenedView.review.review_id);
    assert.deepEqual(readOnlySnapshot.review.items, reopenedView.review.items);
    assert.equal(readOnlySnapshot.view_id, undefined, "automatic refresh acquired card authority");
    const stillCurrent = await mcp.callTool({ name: "update_product_review", arguments: {
      view_id: reopenedView.view_id, review_id: reopenedView.review.review_id, revision: reopenedView.review.revision, action: { kind: "show" },
    } });
    assert.equal(stillCurrent.isError, undefined, toolText(stillCurrent));
    assert.equal((stillCurrent.structuredContent as { view_id: string }).view_id, reopenedView.view_id, "read-only refresh displaced the current card");
    const refreshed = await mcp.callTool({ name: "update_product_review", arguments: { action: { kind: "show" }, activate: true } });
    assert.equal(refreshed.isError, undefined, toolText(refreshed));
    const refreshedView = refreshed.structuredContent as { review: ProductReviewSnapshot; view_id: string };
    assert.equal(refreshedView.review.review_id, latest.review.review_id);
    assert.deepEqual(refreshedView.review.items, latest.review.items);
    assert.notEqual(refreshedView.view_id, latest.view_id);
    const missingTokenEdit = await mcp.callTool({ name: "update_product_review", arguments: { action: { kind: "remove", product_ids: [7] } } });
    assert.equal(missingTokenEdit.isError, true);
    assert.match(toolText(missingTokenEdit), /current Draft list view_id is required/u);

    const currentEdit = await mcp.callTool({ name: "update_product_review", arguments: {
      view_id: refreshedView.view_id, review_id: refreshedView.review.review_id, revision: refreshedView.review.revision,
      action: { kind: "navigate", destination: "ready" },
    } });
    assert.equal(currentEdit.isError, undefined, toolText(currentEdit));
    const current = currentEdit.structuredContent as { review: ProductReviewSnapshot; view_id: string };
    assert.equal(current.view_id, refreshedView.view_id);
    assert.deepEqual(current.review.items.map(({ product_id }) => product_id), [7]);

    const oldSubmit = await mcp.callTool({ name: "submit_product_review", arguments: {
      view_id: first.view_id, review_id: first.review.review_id, revision: first.review.revision,
      submission_id: "00000000-0000-4000-8000-000000000001",
    } });
    assert.equal(oldSubmit.isError, true);
    assert.match(toolText(oldSubmit), /out of date/u);
    const legacyEdit = await mcp.callTool({ name: "update_product_review", arguments: {
      review_id: first.review.review_id, revision: first.review.revision,
      action: { kind: "remove", product_ids: [7] },
    } });
    const legacySubmit = await mcp.callTool({ name: "submit_product_review", arguments: {
      review_id: first.review.review_id, revision: first.review.revision,
      submission_id: "00000000-0000-4000-8000-000000000001",
    } });
    assert.equal(legacyEdit.isError, true);
    assert.equal(legacySubmit.isError, true);
    assert.match(toolText(legacyEdit), /view_id/u);
    assert.match(toolText(legacySubmit), /view_id/u);
  });
  assert.equal(basketReads, 0);
  assert.equal(basketWrites, 0);
});

test("MCP review uses Ready only and rejects obsolete basket navigation", async () => {
  const noWrite = async (): Promise<never> => { throw new Error("Local review must not mutate the provider basket"); };
  const provider = fakeClient({ getCart: noWrite, addToCart: noWrite });
  await withMcpClient(createMcpServer(provider, testCredentials), async mcp => {
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await mcp.callTool({ name, arguments: args });
      assert.equal(result.isError, undefined, toolText(result));
      return (result.structuredContent as { review: ProductReviewSnapshot }).review;
    };
    const started = await call("start_product_review", { items: [{ product_id: 7, quantity: 1 }] });
    assert.equal(started.destination, "needs-review");
    let review = await call("update_product_review_conversation", { review_id: started.review_id, revision: started.revision, action: { kind: "accept", product_ids: [7] } });
    assert.equal(review.items[0]?.state, "ready");
    review = await call("update_product_review_conversation", { action: { kind: "show" } });
    assert.equal(review.items[0]?.state, "ready");
    const obsolete = await mcp.callTool({ name: "update_product_review_conversation", arguments: { review_id: review.review_id, revision: review.revision, action: { kind: "navigate", destination: "basket" } } });
    assert.equal(obsolete.isError, true);
    review = await call("update_product_review_conversation", { review_id: review.review_id, revision: review.revision, action: { kind: "navigate", destination: "ready" } });
    assert.equal(review.destination, "ready");
    const rejected = await mcp.callTool({ name: "update_product_review_conversation", arguments: { review_id: review.review_id, revision: review.revision, action: { kind: "alternatives", product_id: 7, query: "mælk" } } });
    assert.equal(rejected.isError, true, "Ready must move back before alternatives");
    review = await call("update_product_review_conversation", { review_id: review.review_id, revision: review.revision, action: { kind: "revisit", product_ids: [7] } });
    review = await call("update_product_review_conversation", { review_id: review.review_id, revision: review.revision, action: { kind: "alternatives", product_id: 7, query: "mælk" } });
    assert.equal(review.alternatives?.origin, "needs-review");
    assert.equal((await call("start_product_review", { items: [{ product_id: 7, quantity: 1 }] })).items[0]?.state, "needs-review");
  });
});

test("MCP supports broad search and the complete headless selection workflow without basket writes", async () => {
  const options = Array.from({ length: 12 }, (_, index) => ({ ...product, id: 100 + index, name: `Butter option ${index + 1}` }));
  const other = { ...product, id: 120, name: "Margarine option" };
  const added = { ...product, id: 112, name: "Added product" };
  const searchCalls: Array<{ query: string; limit: number | undefined }> = [];
  let basketWrites = 0;
  const forbidden = async (): Promise<never> => { basketWrites++; throw new Error("Local selection must not write to the provider basket"); };
  const provider = fakeClient({
    searchProducts: async (query, limit) => {
      searchCalls.push({ query, limit });
      return query === "margarine" || query === "salmiak" ? [other] : [...options, options[0]!];
    },
    getProduct: async (id) => [product, ...options, other, added].find(candidate => candidate.id === id) ?? product,
    getCart: forbidden,
    addToCart: forbidden,
  });

  await withMcpClient(createMcpServer(provider, testCredentials), async mcp => {
    const broad = await mcp.callTool({ name: "find_groceries", arguments: { search_term: "smør" } });
    assert.equal(broad.isError, undefined, toolText(broad));
    assert.equal((broad.structuredContent as { views: unknown[] }).views.length, 12);
    assert.deepEqual(searchCalls[0], { query: "smør", limit: undefined });

    let current = (await mcp.callTool({ name: "start_product_review", arguments: { items: [{ product_id: 7, quantity: 2 }] } })).structuredContent as { review: ProductReviewSnapshot };
    const independent = await mcp.callTool({ name: "find_groceries", arguments: { search_term: "salmiak" } });
    assert.equal(independent.isError, undefined, toolText(independent));
    assert.deepEqual((independent.structuredContent as { result: Array<{ id: number }> }).result.map(item => item.id), [120]);
    assert.deepEqual(searchCalls[1], { query: "salmiak", limit: undefined }, "an open-ended lookup is not forced through the active product's alternatives query");
    const stillActive = await mcp.callTool({ name: "update_product_review_conversation", arguments: { action: { kind: "show" } } });
    assert.deepEqual((stillActive.structuredContent as { review: ProductReviewSnapshot }).review.items.map(item => [item.product_id, item.quantity, item.state]), [[7, 2, "needs-review"]]);
    const update = async (action: Record<string, unknown>) => {
      const result = await mcp.callTool({ name: "update_product_review_conversation", arguments: { review_id: current.review.review_id, revision: current.review.revision, action } });
      assert.equal(result.isError, undefined, toolText(result));
      current = result.structuredContent as { review: ProductReviewSnapshot };
      return current.review;
    };

    await update({ kind: "add", items: [{ product_id: 112, quantity: 1 }] });
    await update({ kind: "quantity", product_id: 7, quantity: 4 });
    let selection = await update({ kind: "accept", product_ids: [7] });
    assert.deepEqual(selection.items.map(item => [item.product_id, item.quantity, item.state]), [[7, 4, "ready"], [112, 1, "needs-review"]]);
    await update({ kind: "navigate", destination: "ready" });
    await update({ kind: "revisit", product_ids: [7] });
    selection = await update({ kind: "alternatives", product_id: 7, query: "smør" });
    assert.equal(selection.alternatives?.views.length, 12);
    assert.deepEqual(searchCalls[2], { query: "smør", limit: undefined });

    selection = await update({ kind: "alternatives", product_id: 7, query: "margarine" });
    assert.equal(selection.alternatives?.views.length, 1);
    const oldCandidate = await mcp.callTool({ name: "update_product_review_conversation", arguments: {
      review_id: selection.review_id, revision: selection.revision,
      action: { kind: "replace", product_id: 7, replacement_id: 100 },
    } });
    assert.equal(oldCandidate.isError, true, "a candidate from a superseded search cannot be selected");
    selection = await update({ kind: "replace", product_id: 7, replacement_id: 120 });
    assert.deepEqual(selection.items.map(item => [item.product_id, item.quantity, item.state]), [[120, 4, "needs-review"], [112, 1, "needs-review"]]);
    selection = await update({ kind: "remove", product_ids: [120, 112] });
    assert.deepEqual(selection.items, []);
    const ended = await mcp.callTool({ name: "update_product_review_conversation", arguments: {
      review_id: selection.review_id, revision: selection.revision, action: { kind: "end" },
    } });
    assert.deepEqual(ended.structuredContent, { ended: true });
  });
  assert.equal(basketWrites, 0);
  assert.deepEqual(searchCalls, [
    { query: "smør", limit: undefined },
    { query: "salmiak", limit: undefined },
    { query: "smør", limit: undefined },
    { query: "margarine", limit: undefined },
  ]);
});

test("empty and unavailable results retain safe routes without accepting or writing", async () => {
  let writes = 0;
  const denied = async (): Promise<never> => { writes++; throw new Error("Unexpected basket mutation"); };
  const provider = fakeClient({
    getProduct: async () => { throw new NemligError("Product not found."); },
    searchProducts: async () => [],
    getCart: async () => ({ ...basket, items: [], numberOfProducts: 0, productsPrice: 0 }),
    addToCart: denied,
  });
  await withMcpClient(createMcpServer(provider, testCredentials), async mcp => {
    const found = await mcp.callTool({ name: "find_groceries", arguments: { search_term: "missing product", result_count: 3 } });
    assert.equal(found.isError, undefined);
    assert.deepEqual((found.structuredContent as { result: unknown[] }).result, []);
    const empty = await mcp.callTool({ name: "show_my_basket", arguments: {} });
    assert.equal(empty.isError, undefined);
    assert.deepEqual((empty.structuredContent as { items: unknown[] }).items, []);
    const started = await mcp.callTool({ name: "start_product_review", arguments: { items: [{ product_id: 7, quantity: 1 }] } });
    assert.equal(started.isError, undefined);
    let review = (started.structuredContent as { review: ProductReviewSnapshot }).review;
    const alternatives = await mcp.callTool({ name: "update_product_review_conversation", arguments: { review_id: review.review_id, revision: review.revision, action: { kind: "alternatives", product_id: 7, query: "mælk" } } });
    assert.equal(alternatives.isError, undefined);
    review = (alternatives.structuredContent as { review: ProductReviewSnapshot }).review;
    assert.deepEqual(review.alternatives?.views, []);
    assert.equal(review.items[0]?.state, "needs-review");
    assert.equal(review.submission, undefined);
    const refused = await mcp.callTool({ name: "update_product_review_conversation", arguments: { review_id: review.review_id, revision: review.revision, action: { kind: "accept", product_ids: [7] } } });
    assert.equal(refused.isError, true);
    assert.match(toolText(refused), /Choose an available alternative/u);
    assert.match(mcp.getInstructions() ?? "", /Local draft list edits never write to Nemlig/u);
  });
  assert.equal(writes, 0);
});

test("lost and ended review recovery reports absence, finds the current draft, and never replays edits", async () => {
  const noWrite = async (): Promise<never> => { throw new Error("Recovery must not touch the provider basket"); };
  const provider = fakeClient({ getCart: noWrite, addToCart: noWrite });
  let stale: ProductReviewSnapshot;
  await withMcpClient(createMcpServer(provider, testCredentials), async mcp => {
    const started = await mcp.callTool({ name: "start_product_review", arguments: { items: [{ product_id: 7, quantity: 2 }] } });
    stale = (started.structuredContent as { review: ProductReviewSnapshot }).review;
  });
  // A new server models loss of the in-memory draft while the host keeps its old card.
  await withMcpClient(createMcpServer(provider, testCredentials), async mcp => {
    const edit = await mcp.callTool({ name: "update_product_review_conversation", arguments: { review_id: stale.review_id, revision: stale.revision, action: { kind: "accept", product_ids: [7] } } });
    assert.equal(edit.isError, true);
    assert.match(toolText(edit), /update_product_review_conversation show without.*review_id/u);
    assert.match(toolText(edit), /never replay/iu);
    const show = () => mcp.callTool({ name: "update_product_review_conversation", arguments: { action: { kind: "show" } } });
    const absent = await show();
    assert.equal(absent.isError, undefined, toolText(absent));
    assert.deepEqual(absent.structuredContent, { unavailable: true });
    assert.match(toolText(absent), /Ask before starting a new draft list/u);
    const unavailableWidgetRefresh = await mcp.callTool({ name: "update_product_review", arguments: { action: { kind: "show" }, activate: true } });
    assert.equal(unavailableWidgetRefresh.isError, undefined, toolText(unavailableWidgetRefresh));
    assert.deepEqual(unavailableWidgetRefresh.structuredContent, { unavailable: true }, "refresh silently recreated a lost draft");
    const restarted = await mcp.callTool({ name: "start_product_review", arguments: { items: stale.items.map(({ product_id, quantity }) => ({ product_id, quantity })) } });
    const current = (restarted.structuredContent as { review: ProductReviewSnapshot }).review;
    assert.notEqual(current.review_id, stale.review_id);
    assert.equal(current.items[0]?.quantity, 2);
    assert.equal(current.items[0]?.state, "needs-review");
    assert.equal(current.submission, undefined);
    assert.deepEqual((await show()).structuredContent, { review: current });
    const oldEdit = await mcp.callTool({ name: "update_product_review_conversation", arguments: { review_id: stale.review_id, revision: stale.revision, action: { kind: "accept", product_ids: [7] } } });
    assert.equal(oldEdit.isError, true);
    assert.match(toolText(oldEdit), /update_product_review_conversation show without.*review_id/u);
    assert.deepEqual((await show()).structuredContent, { review: current });
    await mcp.callTool({ name: "update_product_review_conversation", arguments: { review_id: current.review_id, revision: current.revision, action: { kind: "end" } } });
    assert.deepEqual((await show()).structuredContent, { unavailable: true });
  });
});
