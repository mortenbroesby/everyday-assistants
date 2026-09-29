import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { NemligError, type Basket, type Product, type ShoppingClient } from "./client.js";
import { createProgram } from "./cli.js";
import { createMcpServer, NEMLIG_CONNECT_URL, rankProducts, safeNemligImageUrl, serviceAcceptanceToolInventory } from "./mcp.js";
import { productionToolInventory } from "./production-acceptance.js";
import type { ProductReviewSnapshot } from "./product-review.js";
import { BasketProposalService } from "./proposals.js";
import { PRODUCT_VIEWER_RESOURCE_URI } from "./product-viewer.js";
import { RETIRED_PRODUCT_VIEWER_RESOURCE_URIS } from "./product-viewer-identity.js";
import { NEMLIG_RELEASE_IDENTITY } from "./runtime.js";

const expectedProductViewerResources = [
  { uri: PRODUCT_VIEWER_RESOURCE_URI, name: "nemlig-product-viewer", title: "Nemlig product viewer", description: "Product results and shared local review supplied by Nemlig Assistant.", mimeType: "text/html;profile=mcp-app" },
  ...RETIRED_PRODUCT_VIEWER_RESOURCE_URIS.map((uri, index) => ({ uri, name: `nemlig-retired-product-viewer-v${index}`, title: "Updated Nemlig review card", description: "This retired review card contains no shopping data. Use its button to open the current conversation review.", mimeType: "text/html;profile=mcp-app" })),
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

const assertFriendlyBasketText = (result: unknown): string => {
  const text = toolText(result);
  assert.ok(text);
  assert.doesNotMatch(
    text,
    /\b(?:proposal|applicable|completed|replayed|expires?|fingerprint|product[_ ]?id|status)\b|\bID\b|[0-9a-f]{8}-[0-9a-f-]{27}/iu,
  );
  return text;
};

const friendlyCatalog = [
  ["add_approved_items", "Add the approved items", false, false, ["approved_review"]],
  ["browse_grocery_section", "Browse a grocery section", true, false, ["section", "result_count", "page"]],
  ["check_nemlig_connection", "Check my Nemlig connection", true, false, []],
  ["find_groceries", "Find groceries", true, false, ["search_term", "result_count"]],
  ["get_grocery_details", "Get grocery details", true, false, ["product_id"]],
  ["get_profile", "Get my Nemlig profile", true, false, []],
  ["reconnect_nemlig_assistant", "Reconnect Nemlig Assistant", true, false, []],
  ["review_items_to_add", "Review items to add", true, false, ["items", "authorization"]],
  ["show_grocery_sections", "Show grocery sections", true, false, []],
  ["show_my_basket", "Show my Nemlig basket", true, false, []],
  ["show_my_basket_visually", "Show my Nemlig basket visually", true, false, []],
  ["show_my_favorites", "Show my favourites", true, false, ["search_term", "result_count", "page"]],
  ["start_product_review", "Start a local product review", false, false, ["items"]],
  ["submit_product_review", "Submit the approved Ready products", false, false, ["review_id", "revision", "submission_id"]],
  ["update_product_review", "Update the local product review", false, false, ["review_id", "revision", "action"]],
] as const;

const formerToolNames = [
  "search_products", "list_favorites", "plan_shopping_list", "list_departments", "browse_department",
  "save_shopping_plan", "load_shopping_plan", "create_feature_request", "view_cart", "prepare_cart_additions",
  "apply_cart_additions", "prepare_cart_removal", "apply_cart_removal", "prepare_cart_replacement",
  "apply_cart_replacement", "prepare_cart_clear", "apply_cart_clear", "pick_products", "suggest_an_improvement",
  "choose_products_visually",
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

test("MCP exposes the complete friendly catalog and clean missing-credential errors", async () => {
  const client = fakeClient({ isLoggedIn: () => false });
  await withMcpClient(createMcpServer(client, async () => undefined), async (mcp) => {
    const tools = (await mcp.listTools()).tools.sort((left, right) => left.name.localeCompare(right.name));
    assert.deepEqual(tools.map(({ name }) => name), friendlyCatalog.map(([name]) => name));
    for (const [name, title, readOnlyHint, destructiveHint, inputs] of friendlyCatalog) {
      const tool = tools.find((candidate) => candidate.name === name);
      assert.equal(tool?.title, title, name);
      assert.ok(tool?.description, `${name} needs a description`);
      assert.deepEqual(tool?.annotations, { readOnlyHint, destructiveHint, openWorldHint: name === "get_profile" ? false : true }, name);
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

test("MCP profile tool exposes the authenticated principal as a stable read-only identity", async () => {
  await withMcpClient(
    createMcpServer(fakeClient(), testCredentials, undefined, undefined, {
      principalKey: "auth0|profile-owner",
      policyRevision: "test-v1",
    }),
    async (mcp) => {
      const tool = (await mcp.listTools()).tools.find(({ name }) => name === "get_profile");
      assert.deepEqual(tool?._meta, {
        "openai/profile": true,
        securitySchemes: [{ type: "oauth2", scopes: ["use:nemlig-assistant"] }],
      });
      const outputSchema = { ...tool?.outputSchema };
      delete outputSchema.$schema;
      assert.deepEqual(outputSchema, {
        additionalProperties: false,
        properties: { id: { minLength: 1, type: "string" } },
        required: ["id"],
        type: "object",
      });
      const result = await mcp.callTool({ name: "get_profile", arguments: {} });
      assert.equal(result.isError, undefined);
      assert.deepEqual(result.structuredContent, { id: "auth0|profile-owner" });
      assert.equal(tool?.annotations?.readOnlyHint, true);
      assert.equal(tool?.annotations?.destructiveHint, false);
    },
  );
});

test("production MCP inventory is exact", async () => {
  const expected = Object.values(productionToolInventory).flat().sort();
  await withMcpClient(createMcpServer(fakeClient(), testCredentials), async (mcp) => {
    assert.deepEqual((await mcp.listTools()).tools.map((tool) => tool.name).sort(), expected);
  });
});

test("retired saved-shopping MCP calls reject before the Nemlig client", async () => {
  let calls = 0;
  const unexpected = async (): Promise<never> => { calls += 1; throw new Error("unexpected Nemlig call"); };
  const client = fakeClient({
    isLoggedIn: () => { calls += 1; return true; }, login: unexpected, searchProducts: unexpected,
    getProduct: unexpected, getFreshProduct: unexpected, listFavorites: unexpected, listDepartments: unexpected,
    browseDepartment: unexpected, getCart: unexpected, addToCart: unexpected,
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    for (const name of [
      "save_my_shopping_plan", "continue_my_shopping_plan", "show_my_shopping_lists", "save_my_shopping_list",
      "copy_my_shopping_list", "set_my_shopping_list_status", "shop_from_my_list", "migrate_my_saved_plan",
    ]) await assert.rejects(mcp.callTool({ name, arguments: {} }), /not found/iu, name);
  });
  assert.equal(calls, 0);
});

test("service acceptance exposes only its fixed read-only tool inventory", async () => {
  assert.equal((serviceAcceptanceToolInventory as readonly string[]).includes("get_grocery_details"), true);
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
    for (const uri of RETIRED_PRODUCT_VIEWER_RESOURCE_URIS) {
      const retired = await mcp.readResource({ uri });
      const body = retired.contents[0];
      assert.ok(body && "text" in body);
      if (body && "text" in body) {
        assert.match(body.text, /This review card is retired/u);
        assert.doesNotMatch(body.text, /tools\/call|callTool|hydrate|fetch\(/u);
      }
    }
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

test("explicit reconnect asks ChatGPT to reopen OAuth", async () => {
  await withMcpClient(createMcpServer(fakeClient(), testCredentials), async (mcp) => {
    const result = await mcp.callTool({ name: "reconnect_nemlig_assistant", arguments: {} });
    assert.equal(result.isError, true);
    assert.equal(toolText(result), "Reconnect Nemlig Assistant to continue.");
    assert.deepEqual(result._meta?.["mcp/www_authenticate"], [
      'Bearer resource_metadata="https://nemlig-mcp.broesby.dk/.well-known/oauth-protected-resource/mcp", error="invalid_token", error_description="Reconnect Nemlig Assistant to continue"',
    ]);
  });
});

test("MCP favorites is read-only and returns listed, matched, or empty candidates", async () => {
  const requestedLimits: Array<number | undefined> = [];
  const favoriteProducts = [
    { ...product, id: 8, name: "Banan mini", price: 15, isOrganic: false, labels: [] },
    { ...product, id: 9, name: "Økologisk mælk", price: 12 },
    { ...product, id: 10, name: "Økologiske bananer", price: 10 },
  ];
  const client = fakeClient({
    listFavorites: async (limit) => {
      requestedLimits.push(limit);
      const resolvedLimit = limit ?? favoriteProducts.length;
      return favoriteProducts.slice(0, resolvedLimit);
    },
    searchProducts: async () => {
      throw new Error("catalog search called");
    },
    getCart: async () => {
      throw new Error("basket operation called");
    },
    addToCart: async () => {
      throw new Error("basket operation called");
    },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const tools = await mcp.listTools();
    const favorites = tools.tools.find((tool) => tool.name === "show_my_favorites");
    assert.deepEqual(favorites?.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    });
    const listed = await mcp.callTool({ name: "show_my_favorites", arguments: { result_count: 1 } });
    assert.deepEqual((listed.structuredContent as { result: Array<{ id: number }> }).result.map(({ id }) => id), [8]);

    const matched = await mcp.callTool({
      name: "show_my_favorites",
      arguments: { search_term: "BANAN", result_count: 2 },
    });
    const candidates = (matched.structuredContent as { result: Array<{ id: number; tags: string[] }> }).result;
    assert.deepEqual(candidates.map(({ id }) => id), [8, 10]);
    assert.deepEqual(candidates[0]?.tags, []);
    assert.deepEqual(candidates[1]?.tags, ["organic"]);

    const empty = await mcp.callTool({
      name: "show_my_favorites",
      arguments: { search_term: "pære", result_count: 2 },
    });
    assert.deepEqual((empty.structuredContent as { result: unknown[] }).result, []);
    assert.deepEqual(requestedLimits, [1, undefined, undefined]);
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
    for (const name of [
      "find_groceries",
      "show_my_favorites",
      "show_my_basket",
      "review_items_to_add",
      "get_grocery_details",
    ]) {
      assert.equal(byName.get(name)?.annotations?.readOnlyHint, true, name);
      assert.equal(byName.get(name)?.annotations?.destructiveHint, false, name);
    }
    assert.equal(byName.get("add_approved_items")?.annotations?.destructiveHint, false);
    for (const forbidden of ["remove_approved_item", "make_approved_item_swap", "empty_approved_basket", "review_item_to_remove", "review_item_swap", "review_emptying_basket"]) {
      assert.equal(byName.has(forbidden), false, `${forbidden} must not be exposed`);
    }
    assert.match(mcp.getInstructions() ?? "", /matching staged review\/apply tools and explicit approval/);
    assert.equal(mcp.getInstructions()?.startsWith(`Current release: ${NEMLIG_RELEASE_IDENTITY}.`), true);
    assert.match(mcp.getInstructions() ?? "", /independent capabilities/);
    assert.match(mcp.getInstructions() ?? "", /Never check out, pay, order, or select delivery slots/);
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

test("MCP exposes independent discovery, exact details, and one shared product viewer", async () => {
  await withMcpClient(createMcpServer(fakeClient(), testCredentials), async (mcp) => {
    const tools = new Map((await mcp.listTools()).tools.map((tool) => [tool.name, tool.description ?? ""]));
    const instructions = mcp.getInstructions() ?? "";
    assert.match(instructions, /Use Nemlig Assistant as independent capabilities for current products/);
    assert.match(instructions, /Normalize each search into one short Danish catalogue phrase/);
    assert.match(instructions, /independent capabilities/);
    assert.match(instructions, /actual basket additions require their matching staged review\/apply tools and explicit approval/i);
    assert.match(instructions, /Never check out, pay, order, or select delivery slots/);
    assert.match(instructions, /Show, not repeated detail reads, reopens the local viewer/u);
    assert.match(instructions, /show_my_basket_visually to inspect the actual basket/u);
    assert.match(instructions, /image URLs do not prove cards rendered/u);
    assert.doesNotMatch(instructions, /Suggest an improvement|GitHub issue/);
    assert.match(tools.get("find_groceries") ?? "", /current Nemlig catalogue directly/);
    assert.match(tools.get("find_groceries") ?? "", /'Prince biscuits' becomes 'prince kiks'/);
    assert.match(tools.get("show_my_favorites") ?? "", /saved Nemlig favourites/);

    for (const group of ["Current catalogue", "Actual Nemlig basket", "Local shopping review", "Sending to Nemlig", "Recovery and safety"]) {
      assert.match(instructions, new RegExp(`\\n${group}\\n`, "u"));
    }
    for (const name of ["find_groceries", "get_grocery_details", "start_product_review"]) {
      assert.match(tools.get(name) ?? "", /not for reopening an existing local review/iu, name);
      assert.match(tools.get(name) ?? "", /update_product_review.*show/u, name);
    }
    for (const name of ["show_my_basket", "show_my_basket_visually"]) {
      assert.match(tools.get(name) ?? "", /actual Nemlig basket/u, name);
      assert.match(tools.get(name) ?? "", /not (?:the local|the temporary local) shopping review/iu, name);
    }
    assert.match(tools.get("update_product_review") ?? "", /None of these actions writes to Nemlig/u);
    assert.match(tools.get("submit_product_review") ?? "", /Local acceptance is NOT approval/u);
    assert.match(instructions, /If no alternatives are returned.*In Review/u);

    const direct = (await mcp.listTools()).tools.find((tool) => tool.name === "find_groceries");
    const details = (await mcp.listTools()).tools.find((tool) => tool.name === "get_grocery_details");
    assert.equal((await mcp.listResources()).resources[0]?.uri, PRODUCT_VIEWER_RESOURCE_URI);
    const viewer = await mcp.readResource({ uri: PRODUCT_VIEWER_RESOURCE_URI });
    assert.equal(viewer.contents[0]?.mimeType, "text/html;profile=mcp-app");
    assert.ok(viewer.contents[0] && "text" in viewer.contents[0]);
    if (viewer.contents[0] && "text" in viewer.contents[0]) assert.match(viewer.contents[0].text, /el\("details"/u);
    assert.equal((direct?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri, undefined);
    assert.equal((details?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri, undefined);
    assert.match(JSON.stringify(details?.inputSchema), /product_id/u);
    assert.match(JSON.stringify(direct?.inputSchema), /prince kiks.*Prince biscuits/);
  });
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

test("visual basket advertises the viewer and enriches six exact lines without changing the basket", async () => {
  const readIds: number[] = [];
  let writes = 0;
  const client = fakeClient({
    getCart: async () => ({ ...basket, items: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `Basket ${index + 1}`, quantity: 2, total: 20 })) }),
    getProduct: async (id) => { readIds.push(id); return { ...product, id, name: `Detail ${id}`, imageUrl: `https://www.nemlig.com/image-${id}.jpg` }; },
    addToCart: async () => { writes++; throw new Error("unexpected write"); },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const tool = (await mcp.listTools()).tools.find(({ name }) => name === "show_my_basket_visually");
    assert.equal((tool?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri, PRODUCT_VIEWER_RESOURCE_URI);
    assert.equal(tool?.annotations?.readOnlyHint, true);
    const result = await mcp.callTool({ name: "show_my_basket_visually", arguments: {} });
    assert.notEqual(result.isError, true, toolText(result));
    const value = result.structuredContent as { items: unknown[]; views: Array<{ context: string; product: { id: number; image_url?: string }; basket: { quantity: number; line_total: number } }> };
    assert.equal(value.items.length, 6);
    assert.deepEqual(value.views.map((view) => view.product.id), [1, 2, 3, 4, 5, 6]);
    assert.equal(value.views[0]?.product.image_url, "https://www.nemlig.com/image-1.jpg");
    assert.deepEqual(value.views[0]?.basket, { kind: "basket", quantity: 2, line_total: 20 });
    assert.match(toolText(result), /Basket 1/u);
  });
  assert.deepEqual(readIds.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  assert.equal(writes, 0);
});

test("visual basket bounds detail reads and retains lines when details fail or mismatch", async () => {
  const readIds: number[] = [];
  const client = fakeClient({
    getCart: async () => ({ ...basket, items: Array.from({ length: 15 }, (_, index) => ({ id: index + 1, name: `Line ${index + 1}`, quantity: 1, total: 9 })) }),
    getProduct: async (id) => {
      readIds.push(id);
      if (id === 2) throw new NemligError("Not found", 404);
      if (id === 3) return { ...product, id: 99, imageUrl: "https://www.nemlig.com/wrong.jpg" };
      if (id === 4) return { ...product, id, name: undefined, imageUrl: "https://www.nemlig.com/image.jpg" };
      return { ...product, id, imageUrl: "https://images.test/not-allowed.jpg" };
    },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const result = await mcp.callTool({ name: "show_my_basket_visually", arguments: {} });
    assert.notEqual(result.isError, true, toolText(result));
    const value = result.structuredContent as { views: Array<{ product: { id: number; name: string; image_url?: string } }>; detail_limit: number; unenriched_count: number };
    assert.equal(value.views.length, 15);
    assert.equal(value.detail_limit, 12);
    assert.equal(value.unenriched_count, 5);
    assert.equal(value.views[1]?.product.name, "Line 2");
    assert.equal(value.views[2]?.product.name, "Line 3");
    assert.equal(value.views[3]?.product.name, "Line 4");
    assert.equal(value.views[0]?.product.image_url, undefined);
    assert.equal(value.views[12]?.product.name, "Line 13");
    assert.match(toolText(result), /not enriched|without images/iu);
  });
  assert.deepEqual(readIds.sort((a, b) => a - b), Array.from({ length: 12 }, (_, index) => index + 1));
});

test("visual basket retries a 401 only after the in-flight detail group settles", async () => {
  let cartReads = 0;
  let logins = 0;
  let active = 0;
  let first = true;
  const client = fakeClient({
    getCart: async () => { cartReads++; return { ...basket, items: [1, 2, 3].map((id) => ({ id, name: `Line ${id}`, quantity: 1, total: 10 })) }; },
    login: async () => { assert.equal(active, 0, "reauthentication started before detail requests settled"); logins++; },
    getProduct: async (id) => {
      active++;
      await new Promise((resolve) => setTimeout(resolve, id === 3 ? 10 : 1));
      active--;
      if (id === 2 && first) { first = false; throw new NemligError("Expired", 401); }
      return { ...product, id, imageUrl: "https://www.nemlig.com/image.jpg" };
    },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const result = await mcp.callTool({ name: "show_my_basket_visually", arguments: {} });
    assert.notEqual(result.isError, true, toolText(result));
    assert.equal((result.structuredContent as { image_count: number }).image_count, 3);
  });
  assert.equal(cartReads, 2);
  assert.equal(logins, 1);
});

test("visual basket shows an empty basket without detail reads", async () => {
  const client = fakeClient({
    getCart: async () => ({ ...basket, items: [] }),
    getProduct: async () => { throw new Error("unexpected detail read"); },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const result = await mcp.callTool({ name: "show_my_basket_visually", arguments: {} });
    assert.notEqual(result.isError, true, toolText(result));
    assert.deepEqual((result.structuredContent as { views: unknown[] }).views, []);
    assert.match(toolText(result), /Kurven er tom/u);
  });
});

test("MCP exact product details are read-only and retain bounded factual fields", async () => {
  let reads = 0;
  const client = fakeClient({
    getProduct: async (id) => {
      reads += 1;
      return { ...product, id, description: "Tomat", declaration: "Tomater", details: [{ key: "Oprindelse", value: "Danmark" }] };
    },
    getCart: async () => { throw new Error("basket read"); },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const result = await mcp.callTool({ name: "get_grocery_details", arguments: { product_id: 7 } });
    assert.notEqual(result.isError, true, toolText(result));
    const payload = (result.structuredContent as { result: { id: number; description?: string; declaration?: string; details?: unknown[] } }).result;
    assert.equal(payload.id, 7);
    assert.equal(payload.description, "Tomat");
    assert.equal(payload.declaration, "Tomater");
    assert.deepEqual(payload.details, [{ key: "Oprindelse", value: "Danmark" }]);
    assert.equal((await mcp.callTool({ name: "get_grocery_details", arguments: { product_id: 0 } })).isError, true);
  });
  assert.equal(reads, 1);
});

test("Effect addition review settles an expired product batch before authenticated retry", async () => {
  let logins = 0;
  let active = 0;
  let retryOverlapped = false;
  let firstAttemptStartedQueued = false;
  const client = fakeClient({
    isLoggedIn: () => true,
    login: async () => {
      logins += 1;
      if (logins === 1 && active > 0) retryOverlapped = true;
    },
    getCart: async () => ({ ...basket, items: [], productsPrice: 0, numberOfProducts: 0 }),
    getProduct: async (id, signal) => {
      const attempt = logins;
      if (attempt === 0 && id === 4) firstAttemptStartedQueued = true;
      if (attempt === 0 && id === 1) {
        await new Promise((resolve) => setTimeout(resolve, 1));
        throw new NemligError("Product read failed", 401);
      }
      if (attempt === 0) return new Promise((resolve, reject) => {
        active += 1;
        const timer = setTimeout(() => { active -= 1; resolve({ ...product, id, name: "Mælk" }); }, 40);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          setTimeout(() => { active -= 1; reject(signal.reason); }, 5);
        }, { once: true });
      });
      return { ...product, id, name: "Mælk" };
    },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const result = await mcp.callTool({
      name: "review_items_to_add",
      arguments: {
        items: [1, 2, 3, 4].map((id) => ({ product: id, quantity: 1 })),
        authorization: "exact_review",
      },
    });
    assert.notEqual(result.isError, true, toolText(result));
  });
  assert.equal(logins, 1);
  assert.equal(active, 0);
  assert.equal(retryOverlapped, false);
  assert.equal(firstAttemptStartedQueued, false);
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

test("MCP additions require prepare then apply and direct mutation tools are unavailable", async () => {
  let added: [number, number] | undefined;
  let productReads = 0;
  const empty = { ...basket, items: [], productsPrice: 0, numberOfProducts: 0 };
  const applied = {
    ...basket,
    items: [{ id: 7, name: product.name, quantity: 2, total: 25 }],
    productsPrice: 25,
    numberOfProducts: 2,
  };
  const client = fakeClient({
    getProduct: async (id) => { productReads += 1; return { ...product, id, unitSize: id === 8 ? "2 liter" : "1 liter" }; },
    getCart: async () => empty,
    addToCart: async (id, quantity) => {
      added = [id, quantity ?? 1];
      return applied;
    },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const viewed = await mcp.callTool({ name: "show_my_basket", arguments: {} });
    assert.match(assertFriendlyBasketText(viewed), /Kurven er tom/u);
    assert.deepEqual(viewed.structuredContent, {
      items: [], products_price: 0, delivery_price: 5, number_of_products: 0, delivery_time: "Tomorrow", views: [],
    });
    const invalid = await mcp.callTool({
      name: "review_items_to_add",
      arguments: { items: [{ product: 7, quantity: 0 }], authorization: "exact_review" },
    });
    assert.equal(invalid.isError, true);
    assert.equal(added, undefined);
    const readsBeforeReview = productReads;
    const prepared = await mcp.callTool({
      name: "review_items_to_add",
      arguments: { items: [{ product: 7, quantity: 2 }], authorization: "exact_review" },
    });
    assert.equal(added, undefined);
    assert.equal(productReads - readsBeforeReview, 1, "building the review viewer must reuse the review's exact product facts");
    assert.match(assertFriendlyBasketText(prepared), /2 × Økologisk mælk/u);
    assert.match(toolText(prepared), /25,00 kr\./u);
    assert.deepEqual(Object.keys(prepared.structuredContent ?? {}).sort(), [
      "applicable", "authorization", "basket_fingerprint", "connection_bound", "expires_at", "issued_at", "operation", "proposal_id", "review", "views",
    ]);
    const reviewViews = (prepared.structuredContent as { views: Array<{ context: string; product: { category: string; price: number; unit_price?: number }; review: { quantity: number } }> }).views;
    assert.equal(reviewViews[0]?.context, "review");
    assert.equal(reviewViews[0]?.product.category, "Køl");
    assert.equal(reviewViews[0]?.review.quantity, 2);
    const sameName = await mcp.callTool({
      name: "review_items_to_add",
      arguments: { items: [{ product: 7, quantity: 1 }, { product: 8, quantity: 1 }], authorization: "exact_review" },
    });
    assert.match(toolText(sameName), /Økologisk mælk \(1 liter\).*Økologisk mælk \(2 liter\)/su);
    const proposalId = (prepared.structuredContent as { proposal_id: string }).proposal_id;
    const result = await mcp.callTool({
      name: "add_approved_items",
      arguments: { approved_review: proposalId },
    });
    assert.deepEqual(added, [7, 2]);
    assert.match(assertFriendlyBasketText(result), /Kurven indeholder nu/u);
    assert.deepEqual(Object.keys(result.structuredContent ?? {}).sort(), ["basket", "operation", "replayed", "status", "views"]);
    const appliedViews = (result.structuredContent as { views: Array<{ context: string; product: { available?: boolean }; basket: { quantity: number } }> }).views;
    assert.equal(appliedViews[0]?.context, "basket");
    assert.equal(appliedViews[0]?.product.available, undefined);
    assert.equal(appliedViews[0]?.basket.quantity, 2);
    assert.equal(
      ((result.structuredContent as { basket: { number_of_products: number } }).basket).number_of_products,
      2,
    );
    await assert.rejects(mcp.callTool({
      name: "add_to_cart",
      arguments: { product_id: 7, quantity: 2 },
    }), /not found/iu);
  });
});

test("approved MCP writes reuse a warm session and never retry an indeterminate mutation", async () => {
  let logins = 0;
  let writes = 0;
  const context = { principalKey: "auth0|owner", policyRevision: "test-v1" };
  const client = fakeClient({
    login: async () => { logins += 1; },
    getCart: async () => ({ ...basket, items: [], productsPrice: 0, numberOfProducts: 0 }),
    addToCart: async () => { writes += 1; throw new NemligError("Write failed", 401); },
  });
  const proposals = new BasketProposalService(client);
  const prepared = await proposals.prepareAdditions(
    `${context.principalKey}\0${context.policyRevision}`,
    [{ product_id: 7, quantity: 1 }],
    { kind: "exact_review" },
  );
  assert.equal(prepared.applicable, true);
  await withMcpClient(createMcpServer(client, testCredentials, undefined, proposals, context), async (mcp) => {
    const result = await mcp.callTool({
      name: "add_approved_items",
      arguments: { approved_review: prepared.proposal_id },
    });
    assert.equal(result.isError, true);
  });
  assert.equal(logins, 0);
  assert.equal(writes, 1);
});

test("approved MCP writes authenticate a cold session before mutation", async () => {
  let loggedIn = false;
  let writes = 0;
  const client = fakeClient({
    isLoggedIn: () => loggedIn,
    login: async () => { loggedIn = true; },
    getCart: async () => ({ ...basket, items: [], productsPrice: 0, numberOfProducts: 0 }),
    addToCart: async () => {
      assert.equal(loggedIn, true, "cold session must authenticate before provider mutation");
      writes += 1;
      return { ...basket, items: [{ id: 7, name: product.name, quantity: 1, total: product.price }], numberOfProducts: 1 };
    },
  });
  const proposals = new BasketProposalService(client);
  await withMcpClient(createMcpServer(client, testCredentials, undefined, proposals), async (mcp) => {
    const prepared = await mcp.callTool({ name: "review_items_to_add", arguments: {
      items: [{ product: 7, quantity: 1 }], authorization: "exact_review",
    } });
    const result = await mcp.callTool({ name: "add_approved_items", arguments: {
      approved_review: (prepared.structuredContent as { proposal_id: string }).proposal_id,
    } });
    assert.equal(result.isError, undefined, toolText(result));
  });
  assert.equal(writes, 1);
});

test("an explicitly reviewed grocery addition reaches verified readback", async () => {
  let basketState: Basket = { ...basket, items: [], productsPrice: 0, numberOfProducts: 0 };
  const client = fakeClient({
    getCart: async () => basketState,
    addToCart: async (_id, quantity = 1) => {
      basketState = { ...basket, items: [{ id: 7, name: product.name, quantity, total: product.price! * quantity }], productsPrice: product.price! * quantity, numberOfProducts: quantity };
      return basketState;
    },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const prepared = await mcp.callTool({ name: "review_items_to_add", arguments: {
      items: [{ product: 7, quantity: 2 }],
      authorization: "exact_review",
    } });
    assert.match(toolText(prepared), /Skal jeg/iu);
    const applied = await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: (prepared.structuredContent as { proposal_id: string }).proposal_id } });
    assert.equal((applied.structuredContent as { basket: { number_of_products: number } }).basket.number_of_products, 2);
  });
});

test("hosted proposals survive a principal reconnect but remain isolated by principal and policy revision", async () => {
  let added: [number, number] | undefined;
  const empty = { ...basket, items: [], productsPrice: 0, numberOfProducts: 0 };
  const applied = {
    ...basket,
    items: [{ id: 7, name: product.name, quantity: 1, total: 12.5 }],
    productsPrice: 12.5,
    numberOfProducts: 1,
  };
  const client = fakeClient({
    getCart: async () => added ? applied : empty,
    addToCart: async (id, quantity) => {
      added = [id, quantity ?? 1];
      return applied;
    },
  });
  const proposals = new BasketProposalService(client);
  let proposalId = "";

  await withMcpClient(
    createMcpServer(client, testCredentials, undefined, proposals, { principalKey: "auth0|owner", policyRevision: "test-v1" }),
    async (mcp) => {
      const prepared = await mcp.callTool({
        name: "review_items_to_add",
        arguments: { items: [{ product: 7, quantity: 1 }], authorization: "exact_review" },
      });
      proposalId = (prepared.structuredContent as { proposal_id: string }).proposal_id;
    },
  );

  await withMcpClient(
    createMcpServer(client, testCredentials, undefined, new BasketProposalService(client), { principalKey: "auth0|owner", policyRevision: "test-v1" }),
    async (mcp) => {
      const unavailable = await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } });
      assert.equal(unavailable.isError, true);
      assert.equal(added, undefined);
    },
  );

  await withMcpClient(
    createMcpServer(client, testCredentials, undefined, proposals, { principalKey: "auth0|other", policyRevision: "test-v1" }),
    async (mcp) => {
      const rejected = await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } });
      assert.equal(rejected.isError, true);
      assert.equal(added, undefined);
    },
  );

  await withMcpClient(
    createMcpServer(client, testCredentials, undefined, proposals, { principalKey: "auth0|owner", policyRevision: "test-v2" }),
    async (mcp) => {
      const rejected = await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } });
      assert.equal(rejected.isError, true);
      assert.equal(added, undefined);
    },
  );

  await withMcpClient(
    createMcpServer(client, testCredentials, undefined, proposals, { principalKey: "auth0|owner", policyRevision: "test-v1" }),
    async (mcp) => {
      const result = await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } });
      assert.equal(result.isError, undefined);
      assert.deepEqual(added, [7, 1]);
    },
  );
});

test("MCP local review and explicit submission share exact state without premature provider writes", async () => {
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
      const result = await mcp.callTool({ name: "update_product_review", arguments: { review_id: review.review_id, revision: review.revision, action } });
      assert.equal(result.isError, undefined, toolText(result));
      review = (result.structuredContent as { review: typeof review }).review;
    };
    await update({ kind: "accept", product_ids: [7] });
    assert.equal(review.items[0]?.state, "ready");
    await update({ kind: "prepare_submission" });
    assert.equal(writes, 0);
    assert.ok(review.submission);
    assert.equal(JSON.stringify(review).includes("proposal_id"), false);
    const tool = (await mcp.listTools()).tools.find(t => t.name === "submit_product_review");
    assert.deepEqual((tool?._meta?.ui as { visibility: string[] }).visibility, ["model", "app"]);
    assert.equal(tool?._meta?.["openai/widgetAccessible"], true);
    const args = { review_id: review.review_id, revision: review.revision, submission_id: review.submission.submission_id };
    const submitted = await mcp.callTool({ name: "submit_product_review", arguments: args });
    assert.equal(submitted.isError, undefined, toolText(submitted));
    const data = submitted.structuredContent as { review: typeof review; result: { basket: { items: Array<{ id: number; quantity: number }> } } };
    assert.equal(data.review.submission?.status, "submitted");
    assert.equal(data.review.items[0]?.state, "ready");
    assert.equal(data.review.items.length, 1);
    assert.deepEqual(data.result.basket.items.map(i => [i.id, i.quantity]), [[99, 1], [7, 2]]);
    assert.equal((await mcp.callTool({ name: "submit_product_review", arguments: args })).isError, true);
    assert.equal(writes, 1);
  });
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
    let review = await call("update_product_review", { review_id: started.review_id, revision: started.revision, action: { kind: "accept", product_ids: [7] } });
    assert.equal(review.items[0]?.state, "ready");
    review = await call("update_product_review", { action: { kind: "show" } });
    assert.equal(review.items[0]?.state, "ready");
    const obsolete = await mcp.callTool({ name: "update_product_review", arguments: { review_id: review.review_id, revision: review.revision, action: { kind: "navigate", destination: "basket" } } });
    assert.equal(obsolete.isError, true);
    review = await call("update_product_review", { review_id: review.review_id, revision: review.revision, action: { kind: "navigate", destination: "ready" } });
    assert.equal(review.destination, "ready");
    const rejected = await mcp.callTool({ name: "update_product_review", arguments: { review_id: review.review_id, revision: review.revision, action: { kind: "alternatives", product_id: 7, query: "mælk" } } });
    assert.equal(rejected.isError, true, "Ready must move back before alternatives");
    review = await call("update_product_review", { review_id: review.review_id, revision: review.revision, action: { kind: "revisit", product_ids: [7] } });
    review = await call("update_product_review", { review_id: review.review_id, revision: review.revision, action: { kind: "alternatives", product_id: 7, query: "mælk" } });
    assert.equal(review.alternatives?.origin, "needs-review");
    assert.equal((await call("start_product_review", { items: [{ product_id: 7, quantity: 1 }] })).items[0]?.state, "needs-review");
  });
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
    const detail = await mcp.callTool({ name: "get_grocery_details", arguments: { product_id: 7 } });
    assert.equal(detail.isError, true);
    assert.match(toolText(detail), /Product not found/u);
    assert.match(mcp.getInstructions() ?? "", /Unavailable product facts.*find_groceries/u);
    const empty = await mcp.callTool({ name: "show_my_basket", arguments: {} });
    assert.equal(empty.isError, undefined);
    assert.deepEqual((empty.structuredContent as { items: unknown[] }).items, []);
    const started = await mcp.callTool({ name: "start_product_review", arguments: { items: [{ product_id: 7, quantity: 1 }] } });
    assert.equal(started.isError, undefined);
    let review = (started.structuredContent as { review: ProductReviewSnapshot }).review;
    const alternatives = await mcp.callTool({ name: "update_product_review", arguments: { review_id: review.review_id, revision: review.revision, action: { kind: "alternatives", product_id: 7, query: "mælk" } } });
    assert.equal(alternatives.isError, undefined);
    review = (alternatives.structuredContent as { review: ProductReviewSnapshot }).review;
    assert.deepEqual(review.alternatives?.views, []);
    assert.equal(review.items[0]?.state, "needs-review");
    assert.equal(review.submission, undefined);
    const refused = await mcp.callTool({ name: "update_product_review", arguments: { review_id: review.review_id, revision: review.revision, action: { kind: "accept", product_ids: [7] } } });
    assert.equal(refused.isError, true);
    assert.match(toolText(refused), /Choose an available alternative/u);
    assert.match(mcp.getInstructions() ?? "", /empty actual basket does not imply an empty local review/u);
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
    const edit = await mcp.callTool({ name: "update_product_review", arguments: { review_id: stale.review_id, revision: stale.revision, action: { kind: "accept", product_ids: [7] } } });
    assert.equal(edit.isError, true);
    assert.match(toolText(edit), /update_product_review show without.*review_id/u);
    assert.match(toolText(edit), /never replay/iu);
    const show = () => mcp.callTool({ name: "update_product_review", arguments: { action: { kind: "show" } } });
    const absent = await show();
    assert.equal(absent.isError, undefined, toolText(absent));
    assert.deepEqual(absent.structuredContent, { unavailable: true });
    assert.match(toolText(absent), /Ask before starting a new review/u);
    const restarted = await mcp.callTool({ name: "start_product_review", arguments: { items: stale.items.map(({ product_id, quantity }) => ({ product_id, quantity })) } });
    const current = (restarted.structuredContent as { review: ProductReviewSnapshot }).review;
    assert.notEqual(current.review_id, stale.review_id);
    assert.equal(current.items[0]?.quantity, 2);
    assert.equal(current.items[0]?.state, "needs-review");
    assert.equal(current.submission, undefined);
    assert.deepEqual((await show()).structuredContent, { review: current });
    const oldEdit = await mcp.callTool({ name: "update_product_review", arguments: { review_id: stale.review_id, revision: stale.revision, action: { kind: "accept", product_ids: [7] } } });
    assert.equal(oldEdit.isError, true);
    assert.match(toolText(oldEdit), /update_product_review show without.*review_id/u);
    assert.deepEqual((await show()).structuredContent, { review: current });
    await mcp.callTool({ name: "update_product_review", arguments: { review_id: current.review_id, revision: current.revision, action: { kind: "end" } } });
    assert.deepEqual((await show()).structuredContent, { unavailable: true });
  });
});
