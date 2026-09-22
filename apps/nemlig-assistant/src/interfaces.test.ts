import { AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { JsonSchemaType } from "@modelcontextprotocol/server";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import { NemligError, type Basket, type Product, type ShoppingClient } from "./client.js";
import { createProgram } from "./cli.js";
import { createMcpServer, NEMLIG_CONNECT_URL, rankProducts, safeNemligImageUrl, serviceAcceptanceToolInventory } from "./mcp.js";
import { productionToolInventory } from "./production-acceptance.js";
import { BasketProposalService } from "./proposals.js";
import { PlanningDeadlineError } from "./product-discovery.js";
import { resolveShoppingPlan } from "./plans.js";
import { NEMLIG_RELEASE_IDENTITY } from "./runtime.js";

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
  removeFromCart: async () => ({ ...basket, items: [] }),
  clearCart: async () => ({ ...basket, items: [], numberOfProducts: 0 }),
  ...overrides,
});

const testCredentials = async () => ({ username: "person@example.test", password: "secret" });

test("CLI exposes only supported commands and never accepts a password option", () => {
  const help = createProgram({ client: fakeClient() }).helpInformation();
  for (const command of ["login", "logout", "search", "favorites", "add", "remove", "cart", "plan"]) assert.match(help, new RegExp(command));
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
    removeFromCart: async () => {
      throw new Error("basket operation called");
    },
    clearCart: async () => {
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
  assert.equal(requestedLimit, 1000);
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

test("CLI remove uses the exact product ID and prints basket readback", async () => {
  const output: string[] = [];
  let received: number | undefined;
  const client = fakeClient({
    removeFromCart: async (id) => {
      received = id;
      return { ...basket, items: [], productsPrice: 0, numberOfProducts: 0 };
    },
  });
  await createProgram({ client, out: (message) => output.push(message) }).parseAsync([
    "node",
    "nemlig",
    "remove",
    "7",
  ]);
  assert.equal(received, 7);
  assert.match(output.join("\n"), /Removed product 7/);
  assert.match(output.join("\n"), /basket is empty/);
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
    removeFromCart: async () => { throw new Error("unexpected basket mutation"); },
    clearCart: async () => { throw new Error("unexpected basket mutation"); },
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

const withPlanFile = async <T>(input: unknown, action: (file: string) => Promise<T>): Promise<T> => {
  const directory = await mkdtemp(`${tmpdir()}/nemlig-cli-plan-`);
  const file = `${directory}/plan.json`;
  await writeFile(file, JSON.stringify(input));
  try {
    return await action(file);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

test("CLI plan validates malformed and over-limit files before login or provider reads", async () => {
  for (const input of [{ lines: [] }, { lines: Array.from({ length: 51 }, (_, index) => ({ id: `line-${index}`, name: "mælk" })) }]) {
    await withPlanFile(input, async (file) => {
      let logins = 0;
      let reads = 0;
      const client = fakeClient({
        isLoggedIn: () => false,
        login: async () => { logins += 1; },
        searchProducts: async () => { reads += 1; return [product]; },
        getCart: async () => { reads += 1; return basket; },
      });
      await assert.rejects(createProgram({ client, credentials: testCredentials, out: () => {} }).parseAsync([
        "node", "nemlig", "plan", file,
      ]));
      assert.equal(logins, 0);
      assert.equal(reads, 0);
    });
  }
});

test("CLI plan formats or serializes a read-only plan without basket mutations", async () => {
  await withPlanFile({ lines: [{ id: "milk", name: "mælk", quantity: 2 }] }, async (file) => {
    const output: string[] = [];
    let logins = 0;
    const client = fakeClient({
      isLoggedIn: () => false,
      login: async () => { logins += 1; },
      addToCart: async () => { throw new Error("basket mutation called"); },
      removeFromCart: async () => { throw new Error("basket mutation called"); },
      clearCart: async () => { throw new Error("basket mutation called"); },
    });
    await createProgram({ client, credentials: testCredentials, out: (message) => output.push(message) }).parseAsync([
      "node", "nemlig", "plan", file,
    ]);
    assert.equal(logins, 1);
    assert.match(output.join("\n"), /SHOPPING PLAN/u);
    assert.match(output.join("\n"), /Økologisk mælk/u);
    assert.match(output.join("\n"), /no basket mutation/u);

    output.length = 0;
    await createProgram({ client, credentials: testCredentials, out: (message) => output.push(message) }).parseAsync([
      "node", "nemlig", "plan", file, "--json",
    ]);
    const plan = JSON.parse(output.join("\n")) as { lines: Array<{ id: string }>; summary: { added: number } };
    assert.deepEqual(plan.lines.map(({ id }) => id), ["milk"]);
    assert.equal(plan.summary.added, 0);
  });
});

test("CLI plan reports ordinary discovery failures and drains reads after SIGINT", async () => {
  await withPlanFile({ lines: [{ id: "milk", name: "mælk", quantity: 1 }] }, async (file) => {
    const unavailable: string[] = [];
    await createProgram({
      client: fakeClient({ searchProducts: async () => { throw new Error("catalogue unavailable"); } }),
      out: (message) => unavailable.push(message),
    }).parseAsync(["node", "nemlig", "plan", file]);
    assert.match(unavailable.join("\n"), /discovery unavailable/iu);

    const signals = new EventEmitter();
    let started: (() => void) | undefined;
    const startedRead = new Promise<void>((resolve) => { started = resolve; });
    let settled = 0;
    const waitForAbort = <T>(_value: T, signal?: AbortSignal): Promise<T> => new Promise((_resolve, reject) => {
      started?.();
      signal?.addEventListener("abort", () => setTimeout(() => {
        settled += 1;
        reject(signal.reason);
      }, 3), { once: true });
    });
    const client = fakeClient({
      searchProducts: (_query, _limit, signal) => waitForAbort([product], signal),
      getCart: (signal) => waitForAbort(basket, signal),
      addToCart: async () => { throw new Error("basket mutation called"); },
      removeFromCart: async () => { throw new Error("basket mutation called"); },
      clearCart: async () => { throw new Error("basket mutation called"); },
    });
    const pending = createProgram({ client, signals, out: () => {} }).parseAsync(["node", "nemlig", "plan", file]);
    await startedRead;
    signals.emit("SIGINT");
    await assert.rejects(pending, (error) => error instanceof DOMException && error.name === "AbortError" && error.message === "Planning cancelled.");
    assert.equal(settled, 2);
    assert.equal(signals.listenerCount("SIGINT"), 0);

    settled = 0;
    await assert.rejects(
      createProgram({ client, signals, out: () => {} }).parseAsync(["node", "nemlig", "plan", file, "--timeout-ms", "1"]),
      PlanningDeadlineError,
    );
    assert.equal(settled, 2);
    assert.equal(signals.listenerCount("SIGINT"), 0);
  });
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
  ["empty_approved_basket", "Empty my approved basket", false, true, ["approved_review"]],
  ["find_groceries", "Find groceries", true, false, ["search_term", "result_count"]],
  ["get_grocery_details", "Get grocery details", true, false, ["product_id"]],
  ["get_profile", "Get my Nemlig profile", true, false, []],
  ["make_approved_item_swap", "Make the approved swap", false, true, ["approved_review"]],
  ["plan_my_shopping", "Plan my shopping", true, false, ["lines", "mode", "proceed"]],
  ["reconnect_nemlig_assistant", "Reconnect Nemlig Assistant", true, false, []],
  ["remove_approved_item", "Remove the approved item", false, true, ["approved_review"]],
  ["review_emptying_basket", "Review emptying my basket", true, false, []],
  ["review_item_swap", "Review swapping an item", true, false, ["current_item", "replacement_item", "quantity"]],
  ["review_item_to_remove", "Review an item to remove", true, false, ["basket_item"]],
  ["review_items_to_add", "Review items to add", true, false, ["items", "authorization", "automatic_authorization"]],
  ["show_grocery_sections", "Show grocery sections", true, false, []],
  ["show_my_basket", "Show my basket", true, false, []],
  ["show_my_favorites", "Show my favourites", true, false, ["search_term", "result_count", "page"]],
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

test("ranking tags cheapest, recommended, and organic deterministically", () => {
  const ranked = rankProducts(
    [
      { ...product, id: 1, price: 20, name: "Frossen mælk", isFrozen: true },
      { ...product, id: 2, price: 12, name: "Frisk mælk", isOrganic: false },
      { ...product, id: 3, price: 5, name: "Udsolgt mælk", available: false },
    ],
    "mælk",
  );
  assert.deepEqual(ranked.find((item) => item.id === 2)?.tags, ["cheapest", "recommended"]);
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
      tier: 0,
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
    browseDepartment: unexpected, getCart: unexpected, addToCart: unexpected, removeFromCart: unexpected, clearCart: unexpected,
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
    browseDepartment: unexpected, getCart: unexpected, addToCart: unexpected, removeFromCart: unexpected, clearCart: unexpected,
  });
  for (const expectedVariant of [serviceAcceptanceToolInventory, serviceAcceptanceToolInventory] as const) await withMcpClient(createMcpServer(client, testCredentials, undefined, undefined, {
    principalKey: "s".repeat(32), policyRevision: "service", tier: 2, kind: "service",
  }), async (mcp) => {
    const expected = expectedVariant;
    assert.deepEqual((await mcp.listTools()).tools.map(({ name }) => name).sort(), [...expected].sort());
    assert.deepEqual(await mcp.listResources(), { resources: [] });
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
    principalKey: "p".repeat(32), policyRevision: "test", tier: 0,
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
  const requestedLimits: number[] = [];
  const favoriteProducts = [
    { ...product, id: 8, name: "Banan mini", price: 15, isOrganic: false },
    { ...product, id: 9, name: "Økologisk mælk", price: 12 },
    { ...product, id: 10, name: "Økologiske bananer", price: 10 },
  ];
  const client = fakeClient({
    listFavorites: async (limit) => {
      const resolvedLimit = limit ?? 10;
      requestedLimits.push(resolvedLimit);
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
    removeFromCart: async () => {
      throw new Error("basket operation called");
    },
    clearCart: async () => {
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
    assert.deepEqual(candidates[0]?.tags, ["recommended"]);
    assert.deepEqual(candidates[1]?.tags, ["cheapest", "organic"]);

    const empty = await mcp.callTool({
      name: "show_my_favorites",
      arguments: { search_term: "pære", result_count: 2 },
    });
    assert.deepEqual((empty.structuredContent as { result: unknown[] }).result, []);
    assert.deepEqual(requestedLimits, [1, 1000, 1000]);
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

test("MCP plan_my_shopping retries one expired session and returns recovered candidates", async () => {
  let searches = 0;
  let logins = 0;
  let basketReads = 0;
  const client = fakeClient({
    isLoggedIn: () => true,
    login: async () => { logins += 1; },
    searchProducts: async () => {
      searches += 1;
      if (searches === 1) throw new NemligError("Search failed", 401);
      return [product];
    },
    getCart: async () => { basketReads += 1; return { ...basket, items: [] }; },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const result = await mcp.callTool({ name: "plan_my_shopping", arguments: { lines: [{ id: "milk", name: "mælk", quantity: 1 }] } });
    assert.notEqual(result.isError, true, toolText(result));
    const lines = (result.structuredContent as { lines: Array<{ candidates: Array<{ id: number }> }> }).lines;
    assert.deepEqual(lines[0]?.candidates.map(({ id }) => id), [7]);
  });
  assert.equal(searches, 2);
  assert.equal(logins, 1);
  assert.equal(basketReads, 2);
});

test("default planning starts no reads when its request is already aborted", async () => {
  const controller = new AbortController();
  const reason = new Error("caller stopped before planning");
  controller.abort(reason);
  let reads = 0;
  await assert.rejects(resolveShoppingPlan({
    searchProducts: async () => { reads += 1; return [product]; },
    getProduct: async () => { reads += 1; return product; },
    getCart: async () => { reads += 1; return { ...basket, items: [] }; },
  }, {
    lines: [{ id: "milk", name: "mælk", quantity: 1 }],
  }, { signal: controller.signal }), (error) => error === reason);
  assert.equal(reads, 0);
});

test("Effect planning settles the expired attempt before authenticated retry", async () => {
  let logins = 0;
  let firstAttemptSlowSettled = false;
  let retryOverlappedFirstAttempt = false;
  let firstAttemptStartedQueued = false;
  const starts: string[] = [];
  const client = fakeClient({
    isLoggedIn: () => true,
    login: async () => {
      logins += 1;
      if (logins === 1 && !firstAttemptSlowSettled) retryOverlappedFirstAttempt = true;
    },
    searchProducts: async (query, _limit, signal) => {
      const attempt = logins;
      starts.push(`${attempt}:${query}`);
      if (attempt === 0 && query === "queued") firstAttemptStartedQueued = true;
      if (attempt === 0 && query === "expired") {
        await new Promise((resolve) => setTimeout(resolve, 1));
        throw new NemligError("Search failed", 401);
      }
      if (attempt === 0) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve([{ ...product, name: query, description: query }]), 40);
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            setTimeout(() => {
              firstAttemptSlowSettled = true;
              reject(signal.reason);
            }, 5);
          }, { once: true });
        });
      }
      return [{ ...product, name: query, description: query }];
    },
    getCart: async () => ({ ...basket, items: [] }),
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const result = await mcp.callTool({
      name: "plan_my_shopping",
      arguments: {
        lines: ["expired", "slow-a", "slow-b", "queued"].map((name) => ({ id: name, name, quantity: 1 })),
      },
    });
    assert.notEqual(result.isError, true, toolText(result));
  });
  assert.equal(logins, 1);
  assert.equal(firstAttemptSlowSettled, true);
  assert.equal(retryOverlappedFirstAttempt, false);
  assert.equal(firstAttemptStartedQueued, false);
  assert.ok(starts.includes("1:queued"));
});

test("MCP plan_my_shopping surfaces a second 401 without looping", async () => {
  let searches = 0;
  let logins = 0;
  const client = fakeClient({
    isLoggedIn: () => true,
    login: async () => { logins += 1; },
    searchProducts: async () => { searches += 1; throw new NemligError("Search failed", 401); },
    getCart: async () => ({ ...basket, items: [] }),
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const result = await mcp.callTool({ name: "plan_my_shopping", arguments: { lines: [{ id: "milk", name: "mælk", quantity: 1 }] } });
    assert.equal(result.isError, true);
    assert.match(toolText(result), /Search failed/u);
  });
  assert.equal(searches, 2);
  assert.equal(logins, 1);
});

test("MCP plans whole lists without saved state", async () => {
  const directory = await mkdtemp(`${tmpdir()}/nemlig-mcp-plan-`);
  let reads = 0;
  const client = fakeClient({
    searchProducts: async () => { reads += 1; return [product]; }, getCart: async () => { reads += 1; return { ...basket, items: [{ ...basket.items[0]!, id: 7 }] }; },
    addToCart: async () => { throw new Error("mutation called"); }, removeFromCart: async () => { throw new Error("mutation called"); }, clearCart: async () => { throw new Error("mutation called"); },
  });
  try {
    await withMcpClient(createMcpServer(client, testCredentials, { NEMLIG_CONFIG_DIR: directory }), async (mcp) => {
      const planned = await mcp.callTool({ name: "plan_my_shopping", arguments: { lines: [{ id: "milk", name: "mælk", quantity: 2 }] } });
      const plan = planned.structuredContent as { lines: Array<{ candidates: Array<{ source: string }>; remaining_quantity: number }> };
      assert.equal(plan.lines[0]?.candidates[0]?.source, "catalog"); assert.equal(plan.lines[0]?.remaining_quantity, 1);
      assert.equal((await mcp.callTool({ name: "plan_my_shopping", arguments: { lines: [] } })).isError, true);
    });
    assert.equal(reads, 2);
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("published plan schemas validate real outputs and reject malformed data", async () => {
  const client = fakeClient({
    getCart: async () => ({ ...basket, items: [{ ...basket.items[0]!, id: 7, quantity: 0.5 }] }),
    searchProducts: async (query) => query === "missing" ? [] : [{ ...product, description: "Mælk", details: [{ key: "Indhold", value: "Mælk" }] }],
    addToCart: async () => { throw new Error("unexpected mutation"); },
    removeFromCart: async () => { throw new Error("unexpected mutation"); },
    clearCart: async () => { throw new Error("unexpected mutation"); },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const tools = new Map((await mcp.listTools()).tools.map((tool) => [tool.name, tool]));
    const provider = new AjvJsonSchemaValidator();
    const validator = (name: string) => provider.getValidator<Record<string, unknown>>(tools.get(name)!.outputSchema as JsonSchemaType);
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await mcp.callTool({ name, arguments: args });
      assert.notEqual(result.isError, true, `${name}: ${toolText(result)}`);
      const data = result.structuredContent as Record<string, unknown>;
      assert.equal(validator(name)(data).valid, true, name);
      if (name === "plan_my_shopping") {
        assert.deepEqual(JSON.parse(toolText(result)), JSON.parse(JSON.stringify(data)));
      }
      return data;
    };
    const lines = [{ id: "milk", name: "mælk", quantity: 2 }];
    const plan = await call("plan_my_shopping", { lines });
    const planLines = plan.lines as Array<Record<string, unknown>>;
    assert.equal(planLines[0]!.basket_quantity, 0.5);
    assert.equal(planLines[0]!.remaining_quantity, 1.5);
    const amountPlan = await call("plan_my_shopping", { lines: [{ id: "milk", name: "mælk", requested_amount: 2, requested_unit: "l", preferred_brands: ["Test"] }] });
    const amountLine = (amountPlan.lines as Array<Record<string, unknown>>)[0]!;
    const amountCandidate = (amountLine.candidates as Array<Record<string, unknown>>)[0]!;
    assert.equal(amountLine.requested_amount, 2);
    assert.equal(amountCandidate.preferred_brand_match, true);
    assert.equal(amountCandidate.required_packages, 2);
    assert.equal(amountCandidate.covered_amount, 2000);
    const manual = await call("plan_my_shopping", { lines, mode: "manual" });
    assert.equal((manual.lines as Array<Record<string, unknown>>)[0]!.clarity_reason, "manual_choice");
    const empty = await call("plan_my_shopping", { lines: [{ id: "missing", name: "missing", quantity: 1 }] });
    assert.equal((empty.lines as Array<Record<string, unknown>>)[0]!.resolution, "unresolved");
    const candidate = (planLines[0]!.candidates as Array<Record<string, unknown>>)[0]!;
    const sparseCandidate = { ...candidate };
    for (const key of ["price", "unit_price", "description", "details", "image_url"]) delete sparseCandidate[key];
    assert.equal(validator("plan_my_shopping")({ ...plan, lines: [{ ...planLines[0], candidates: [sparseCandidate] }] }).valid, true);
    for (const badCandidate of [
      { ...candidate, owner_scope: "private" },
      { ...candidate, description: null },
      { ...candidate, details: [{ key: "Indhold", value: 42 }] },
      { ...candidate, dietary: { ...(candidate.dietary as object), private: true } },
    ]) {
      assert.equal(validator("plan_my_shopping")({ ...plan, lines: [{ ...planLines[0], candidates: [badCandidate] }] }).valid, false);
    }
    assert.equal(validator("plan_my_shopping")({ ...plan, owner_scope: "private" }).valid, false);
    assert.equal(validator("plan_my_shopping")({ ...plan, summary: { ...(plan.summary as object), failed: "zero" } }).valid, false);
    const notApplicable = await call("review_item_to_remove", { basket_item: 999 });
    assert.equal(notApplicable.applicable, false);
  });
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
      "review_item_to_remove",
      "review_item_swap",
      "review_emptying_basket",
      "get_grocery_details",
    ]) {
      assert.equal(byName.get(name)?.annotations?.readOnlyHint, true, name);
      assert.equal(byName.get(name)?.annotations?.destructiveHint, false, name);
    }
    assert.equal(byName.get("add_approved_items")?.annotations?.destructiveHint, false);
    assert.equal(byName.get("remove_approved_item")?.annotations?.destructiveHint, true);
    assert.equal(byName.get("make_approved_item_swap")?.annotations?.destructiveHint, true);
    assert.equal(byName.get("empty_approved_basket")?.annotations?.destructiveHint, true);
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
      createMcpServer(fakeClient(), testCredentials, undefined, undefined, { principalKey: "auth0|owner", policyRevision: "test-v1", tier: 0 }),
      async (http) => {
        assert.deepEqual(await http.listTools(), await stdio.listTools());
        assert.deepEqual(await stdio.listResources(), { resources: [] });
        assert.deepEqual(await http.listResources(), { resources: [] });
        assert.equal(http.getInstructions(), stdio.getInstructions());
      },
    );
  });
});

test("MCP routes recipe discovery through individual short searches and favourites for uncertainty", async () => {
  await withMcpClient(createMcpServer(fakeClient(), testCredentials), async (mcp) => {
    const tools = new Map((await mcp.listTools()).tools.map((tool) => [tool.name, tool.description ?? ""]));
    const instructions = mcp.getInstructions() ?? "";
    assert.match(instructions, /Use Nemlig Assistant as independent capabilities for current products/);
    assert.match(instructions, /Normalize each search into one short Danish catalogue phrase/);
    assert.match(instructions, /independent capabilities/);
    assert.match(instructions, /Basket changes require the matching staged review\/apply tools and explicit approval/);
    assert.match(instructions, /Never check out, pay, order, or select delivery slots/);
    assert.doesNotMatch(instructions, /Suggest an improvement|GitHub issue/);
    assert.match(tools.get("plan_my_shopping") ?? "", /Resolve 1–50 groceries automatically by default/);
    assert.match(tools.get("plan_my_shopping") ?? "", /discovery_unavailable.*find_groceries/u);
    assert.match(tools.get("find_groceries") ?? "", /current Nemlig catalogue directly/);
    assert.match(tools.get("find_groceries") ?? "", /'Prince biscuits' becomes 'prince kiks'/);
    assert.match(tools.get("show_my_favorites") ?? "", /saved Nemlig favourites/);

    const plan = (await mcp.listTools()).tools.find((tool) => tool.name === "plan_my_shopping");
    const direct = (await mcp.listTools()).tools.find((tool) => tool.name === "find_groceries");
    const details = (await mcp.listTools()).tools.find((tool) => tool.name === "get_grocery_details");
    assert.deepEqual(plan?._meta?.securitySchemes, [{ type: "oauth2", scopes: ["use:nemlig-assistant"] }]);
    assert.match(JSON.stringify(details?.inputSchema), /product_id/u);
    assert.match(JSON.stringify(plan?.inputSchema), /Prince biscuits.*prince kiks/);
    assert.match(JSON.stringify(direct?.inputSchema), /prince kiks.*Prince biscuits/);
    for (const name of ["plan_my_shopping"]) {
      const tool = (await mcp.listTools()).tools.find((entry) => entry.name === name);
      assert.doesNotMatch(JSON.stringify(tool?.outputSchema), /"(?:items|summary|list)":\{\}/u, `${name} must not publish an unconstrained result schema`);
    }
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
    removeFromCart: async () => { throw new Error("unexpected basket mutation"); },
    clearCart: async () => { throw new Error("unexpected basket mutation"); },
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
  const empty = { ...basket, items: [], productsPrice: 0, numberOfProducts: 0 };
  const applied = {
    ...basket,
    items: [{ id: 7, name: product.name, quantity: 2, total: 25 }],
    productsPrice: 25,
    numberOfProducts: 2,
  };
  const client = fakeClient({
    getProduct: async (id) => ({ ...product, id, unitSize: id === 8 ? "2 liter" : "1 liter" }),
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
      items: [], products_price: 0, delivery_price: 5, number_of_products: 0, delivery_time: "Tomorrow",
    });
    const invalid = await mcp.callTool({
      name: "review_items_to_add",
      arguments: { items: [{ product: 7, quantity: 0 }], authorization: "exact_review" },
    });
    assert.equal(invalid.isError, true);
    assert.equal(added, undefined);
    const prepared = await mcp.callTool({
      name: "review_items_to_add",
      arguments: { items: [{ product: 7, quantity: 2 }], authorization: "exact_review" },
    });
    assert.equal(added, undefined);
    assert.match(assertFriendlyBasketText(prepared), /2 × Økologisk mælk/u);
    assert.match(toolText(prepared), /25,00 kr\./u);
    assert.deepEqual(Object.keys(prepared.structuredContent ?? {}).sort(), [
      "applicable", "authorization", "basket_fingerprint", "connection_bound", "expires_at", "issued_at", "operation", "proposal_id", "review",
    ]);
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
    assert.deepEqual(Object.keys(result.structuredContent ?? {}).sort(), ["basket", "operation", "replayed", "status"]);
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

test("approved MCP writes authenticate before the task and never retry an indeterminate mutation", async () => {
  let logins = 0;
  let writes = 0;
  const context = { principalKey: "auth0|owner", policyRevision: "test-v1", tier: 0 as const };
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
  assert.equal(logins, 1);
  assert.equal(writes, 1);
});

test("an explicitly authorized clear grocery run reaches verified readback without a second question", async () => {
  let basketState: Basket = { ...basket, items: [], productsPrice: 0, numberOfProducts: 0 };
  const client = fakeClient({
    getCart: async () => basketState,
    addToCart: async (_id, quantity = 1) => {
      basketState = { ...basket, items: [{ id: 7, name: product.name, quantity, total: product.price! * quantity }], productsPrice: product.price! * quantity, numberOfProducts: quantity };
      return basketState;
    },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const planned = await mcp.callTool({ name: "plan_my_shopping", arguments: { proceed: true, lines: [{ id: "milk", name: "mælk", quantity: 2 }] } });
    const plan = planned.structuredContent as { automatic_authorization: string; lines: Array<{ selected_product_id: number; remaining_quantity: number }> };
    assert.ok(plan.automatic_authorization);
    const prepared = await mcp.callTool({ name: "review_items_to_add", arguments: {
      items: [{ product: plan.lines[0]!.selected_product_id, quantity: plan.lines[0]!.remaining_quantity }],
      authorization: "same_run_automatic", automatic_authorization: plan.automatic_authorization,
    } });
    assert.doesNotMatch(toolText(prepared), /Skal jeg/iu);
    const applied = await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: (prepared.structuredContent as { proposal_id: string }).proposal_id } });
    assert.equal((applied.structuredContent as { basket: { number_of_products: number } }).basket.number_of_products, 2);

    const planOnly = await mcp.callTool({ name: "plan_my_shopping", arguments: { lines: [{ id: "milk", name: "mælk", quantity: 1 }] } });
    assert.equal(
      "automatic_authorization" in ((planOnly.structuredContent ?? {}) as Record<string, unknown>),
      false,
    );
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
    createMcpServer(client, testCredentials, undefined, proposals, { principalKey: "auth0|owner", policyRevision: "test-v1", tier: 0 }),
    async (mcp) => {
      const prepared = await mcp.callTool({
        name: "review_items_to_add",
        arguments: { items: [{ product: 7, quantity: 1 }], authorization: "exact_review" },
      });
      proposalId = (prepared.structuredContent as { proposal_id: string }).proposal_id;
    },
  );

  await withMcpClient(
    createMcpServer(client, testCredentials, undefined, new BasketProposalService(client), { principalKey: "auth0|owner", policyRevision: "test-v1", tier: 0 }),
    async (mcp) => {
      const unavailable = await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } });
      assert.equal(unavailable.isError, true);
      assert.equal(added, undefined);
    },
  );

  await withMcpClient(
    createMcpServer(client, testCredentials, undefined, proposals, { principalKey: "auth0|other", policyRevision: "test-v1", tier: 1 }),
    async (mcp) => {
      const rejected = await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } });
      assert.equal(rejected.isError, true);
      assert.equal(added, undefined);
    },
  );

  await withMcpClient(
    createMcpServer(client, testCredentials, undefined, proposals, { principalKey: "auth0|owner", policyRevision: "test-v2", tier: 0 }),
    async (mcp) => {
      const rejected = await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } });
      assert.equal(rejected.isError, true);
      assert.equal(added, undefined);
    },
  );

  await withMcpClient(
    createMcpServer(client, testCredentials, undefined, proposals, { principalKey: "auth0|owner", policyRevision: "test-v1", tier: 0 }),
    async (mcp) => {
      const result = await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } });
      assert.equal(result.isError, undefined);
      assert.deepEqual(added, [7, 1]);
    },
  );
});

test("MCP replacement prepares factual savings and applies only the approved staged change", async () => {
  const current = { ...product, id: 7, name: "Mælk", price: 12.5 };
  const replacement = {
    ...product,
    id: 8,
    name: "Billigere mælk",
    price: 10,
    unit: "10,00 kr/l",
    unitPrice: 10,
    labels: ["Tilbud"],
    isOnDiscount: true,
  };
  let cart: Basket = {
    items: [{ id: 7, name: current.name, quantity: 1, total: 12.5 }],
    productsPrice: 12.5,
    deliveryPrice: 5,
    numberOfProducts: 1,
    deliveryTime: "Tomorrow",
  };
  const writes: string[] = [];
  const client = fakeClient({
    getProduct: async (id) => id === 8 ? replacement : current,
    getFreshProduct: async (id) => id === 8 ? replacement : current,
    getCart: async () => cart,
    addToCart: async (id, quantity) => {
      writes.push(`add:${id}:${quantity}`);
      cart = {
        ...cart,
        items: [...cart.items, { id, name: replacement.name, quantity, total: 10 * (quantity ?? 1) }],
        productsPrice: 22.5,
        numberOfProducts: 2,
      };
      return cart;
    },
    removeFromCart: async (id) => {
      writes.push(`remove:${id}`);
      cart = { ...cart, items: cart.items.filter((item) => item.id !== id), productsPrice: 10, numberOfProducts: 1 };
      return cart;
    },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const invalid = await mcp.callTool({
      name: "review_item_swap",
      arguments: { current_item: 7, replacement_item: 7, quantity: 1 },
    });
    assert.equal(invalid.isError, true);
    assert.equal(writes.length, 0);

    const prepared = await mcp.callTool({
      name: "review_item_swap",
      arguments: { current_item: 7, replacement_item: 8, quantity: 1 },
    });
    const review = (prepared.structuredContent as {
      proposal_id: string;
      review: { price_difference: number; potential_savings: number; current_line: { unit_size: string }; replacement_line: { unit_price: number } };
    });
    assert.equal(review.review.price_difference, 2.5);
    assert.equal(review.review.potential_savings, 2.5);
    assert.equal(review.review.current_line.unit_size, "1 liter");
    assert.equal(review.review.replacement_line.unit_price, 10);
    assert.equal(writes.length, 0);
    assert.match(assertFriendlyBasketText(prepared), /Mælk.*1 liter.*Billigere mælk.*1 liter/su);
    assert.match(toolText(prepared), /2,50 kr\./u);

    const applied = await mcp.callTool({
      name: "make_approved_item_swap",
      arguments: { approved_review: review.proposal_id },
    });
    assert.equal((applied.structuredContent as { operation: string }).operation, "replacement");
    assert.match(assertFriendlyBasketText(applied), /Kurven indeholder nu/u);
    assert.deepEqual(writes, ["add:8:1", "remove:7"]);
    const replayed = await mcp.callTool({
      name: "make_approved_item_swap",
      arguments: { approved_review: review.proposal_id },
    });
    assert.equal((replayed.structuredContent as { replayed: boolean }).replayed, true);
    assert.deepEqual(writes, ["add:8:1", "remove:7"]);

    await assert.rejects(mcp.callTool({
      name: "replace_cart_line",
      arguments: { current_product_id: 7, replacement_product_id: 8, replacement_quantity: 1 },
    }), /not found/iu);
  });

  const uncertainClient = fakeClient({
    getProduct: async (id) => id === 8 ? replacement : current,
    getFreshProduct: async (id) => id === 8 ? replacement : current,
    getCart: async () => ({
      items: [{ id: 7, name: current.name, quantity: 1, total: 12.5 }],
      productsPrice: 12.5, deliveryPrice: 0, numberOfProducts: 1, deliveryTime: undefined,
    }),
    addToCart: async () => ({
      items: [{ id: 7, name: current.name, quantity: 1, total: 12.5 }],
      productsPrice: 12.5, deliveryPrice: 0, numberOfProducts: 1, deliveryTime: undefined,
    }),
  });
  await withMcpClient(createMcpServer(uncertainClient, testCredentials), async (mcp) => {
    const prepared = await mcp.callTool({
      name: "review_item_swap",
      arguments: { current_item: 7, replacement_item: 8, quantity: 1 },
    });
    const result = await mcp.callTool({
      name: "make_approved_item_swap",
      arguments: { approved_review: (prepared.structuredContent as { proposal_id: string }).proposal_id },
    });
    assert.equal(result.isError, true);
    const text = (result.content as Array<{ text?: string }>)[0]?.text ?? "";
    assert.match(text, /inspect the basket and do not retry/);
    assert.doesNotMatch(text, /upstream|stack|Error:/);
  });
});

test("MCP removal and clear keep exact structured data behind friendly shopping text", async () => {
  let cart: Basket = {
    ...basket,
    items: [
      { id: 7, name: "Mælk", quantity: 1, total: 12.5 },
      { id: 8, name: "Banan", quantity: 2, total: 5 },
    ],
    productsPrice: 17.5,
    numberOfProducts: 3,
  };
  const client = fakeClient({
    getCart: async () => cart,
    removeFromCart: async (id) => {
      cart = { ...cart, items: cart.items.filter((item) => item.id !== id), productsPrice: 5, numberOfProducts: 2 };
      return cart;
    },
    clearCart: async () => {
      cart = { ...cart, items: [], productsPrice: 0, numberOfProducts: 0 };
      return cart;
    },
  });

  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const removal = await mcp.callTool({ name: "review_item_to_remove", arguments: { basket_item: 7 } });
    assert.match(assertFriendlyBasketText(removal), /Fjern 1 × Mælk · 12,50 kr\./u);
    assert.deepEqual(Object.keys(removal.structuredContent ?? {}).sort(), [
      "applicable", "basket_fingerprint", "connection_bound", "expires_at", "issued_at", "operation", "proposal_id", "review",
    ]);
    const removed = await mcp.callTool({
      name: "remove_approved_item",
      arguments: { approved_review: (removal.structuredContent as { proposal_id: string }).proposal_id },
    });
    assert.match(assertFriendlyBasketText(removed), /2 × Banan/u);

    const clear = await mcp.callTool({ name: "review_emptying_basket", arguments: {} });
    assert.match(assertFriendlyBasketText(clear), /Tøm kurven/u);
    assert.match(toolText(clear), /2 × Banan · 5,00 kr\./u);
    assert.deepEqual(Object.keys(clear.structuredContent ?? {}).sort(), [
      "applicable", "basket_fingerprint", "connection_bound", "expires_at", "issued_at", "operation", "proposal_id", "review",
    ]);
    const cleared = await mcp.callTool({
      name: "empty_approved_basket",
      arguments: { approved_review: (clear.structuredContent as { proposal_id: string }).proposal_id },
    });
    assert.match(assertFriendlyBasketText(cleared), /Kurven er nu tom/u);
    assert.deepEqual((cleared.structuredContent as { basket: { items: unknown[] } }).basket.items, []);
  });
});
