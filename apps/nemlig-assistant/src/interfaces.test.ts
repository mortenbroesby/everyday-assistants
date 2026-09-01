import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Basket, Product } from "./client.js";
import { createProgram, type ShoppingClient } from "./cli.js";
import type { FeatureRequest } from "./feature-request.js";
import { createMcpServer, PICKER_HTML, PICKER_URI, rankProducts } from "./mcp.js";
import { BasketProposalService } from "./proposals.js";

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
  listFavorites: async () => [product],
  listDepartments: async () => [{ id: "/mejeri", name: "Mejeri" }],
  browseDepartment: async () => ({ products: [product], page: 1, hasNext: false }),
  getCart: async () => basket,
  addToCart: async () => basket,
  removeFromCart: async () => ({ ...basket, items: [] }),
  clearCart: async () => ({ ...basket, items: [], numberOfProducts: 0 }),
  ...overrides,
});

test("CLI exposes only non-recipe commands and never accepts a password option", () => {
  const help = createProgram({ client: fakeClient() }).helpInformation();
  for (const command of ["login", "logout", "search", "favorites", "feature-request", "add", "remove", "cart"]) assert.match(help, new RegExp(command));
  for (const forbidden of ["parse", "checkout", "--password"]) assert.doesNotMatch(help, new RegExp(forbidden));
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

test("CLI feature-request forwards ChatGPT-ready fields and prints the issue URL", async () => {
  const output: string[] = [];
  let received: unknown;
  await createProgram({
    client: fakeClient(),
    featureRequest: async (request) => {
      received = request;
      return { number: 42, title: request.title, url: "https://github.com/mortenbroesby/everyday-assistants/issues/42" };
    },
    out: (message) => output.push(message),
  }).parseAsync([
    "node",
    "nemlig",
    "feature-request",
    "Prefer discounted favorites",
    "--summary",
    "Choose discounted favorites first.",
    "--acceptance",
    "Search favorites first",
    "Prefer discounted matches",
  ]);
  assert.deepEqual(received, {
    title: "Prefer discounted favorites",
    summary: "Choose discounted favorites first.",
    acceptance_criteria: ["Search favorites first", "Prefer discounted matches"],
    context: undefined,
  });
  assert.match(output.join("\n"), /Feature request #42.*issues\/42/);
});

const withMcpClient = async <T>(
  server: ReturnType<typeof createMcpServer>,
  action: (client: Client) => Promise<T>,
): Promise<T> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await action(client);
  } finally {
    await client.close();
    await server.close();
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
  ["choose_products_visually", "Choose products visually", true, false, ["search_term", "result_count"]],
  ["continue_my_shopping_plan", "Continue my shopping plan", true, false, ["saved_plan"]],
  ["empty_approved_basket", "Empty my approved basket", false, true, ["approved_review"]],
  ["find_groceries", "Find groceries", true, false, ["search_term", "result_count"]],
  ["make_approved_item_swap", "Make the approved swap", false, true, ["approved_review"]],
  ["plan_my_shopping", "Plan my shopping", true, false, ["lines"]],
  ["remove_approved_item", "Remove the approved item", false, true, ["approved_review"]],
  ["review_emptying_basket", "Review emptying my basket", true, false, []],
  ["review_item_swap", "Review swapping an item", true, false, ["current_item", "replacement_item", "quantity"]],
  ["review_item_to_remove", "Review an item to remove", true, false, ["basket_item"]],
  ["review_items_to_add", "Review items to add", true, false, ["items"]],
  ["save_my_shopping_plan", "Save my shopping plan", false, false, ["lines"]],
  ["show_grocery_sections", "Show grocery sections", true, false, []],
  ["show_my_basket", "Show my basket", true, false, []],
  ["show_my_favorites", "Show my favourites", true, false, ["search_term", "result_count", "page"]],
  ["suggest_an_improvement", "Suggest an improvement", false, false, ["title", "summary", "acceptance_criteria", "context"]],
] as const;

const formerToolNames = [
  "search_products", "list_favorites", "plan_shopping_list", "list_departments", "browse_department",
  "save_shopping_plan", "load_shopping_plan", "create_feature_request", "view_cart", "prepare_cart_additions",
  "apply_cart_additions", "prepare_cart_removal", "apply_cart_removal", "prepare_cart_replacement",
  "apply_cart_replacement", "prepare_cart_clear", "apply_cart_clear", "pick_products",
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
      assert.deepEqual(tool?.annotations, { readOnlyHint, destructiveHint, openWorldHint: name === "save_my_shopping_plan" ? false : true }, name);
      const properties = (tool?.inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {};
      assert.deepEqual(Object.keys(properties).sort(), [...inputs].sort(), `${name} inputs drifted`);
      for (const input of inputs) assert.ok(properties[input]?.description, `${name}.${input} needs plain-language guidance`);
    }
    const catalogText = tools.flatMap(({ name, title, description, inputSchema }) => {
      const properties = (inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {};
      return [name, title, description, ...Object.entries(properties).flatMap(([input, schema]) => [input, schema.description])];
    }).join("\n");
    for (const name of formerToolNames) assert.equal(tools.some((tool) => tool.name === name), false, name);
    assert.doesNotMatch(catalogText, /\b(?:proposal|apply|immutable snapshot|uuid|department_id|product_id|internal status)\b/iu);
    assert.equal(tools.some((tool) => /recipe|checkout|order|pay|purchase/iu.test(tool.name)), false);
    const result = await mcp.callTool({ name: "show_my_basket", arguments: {} });
    assert.equal(result.isError, true);
    const content = result.content as Array<{ type: string; text?: string }>;
    assert.match(content[0]?.text ?? "", /credentials configured/);
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
  await withMcpClient(createMcpServer(client), async (mcp) => {
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

test("MCP plans whole lists and continuing a saved plan refreshes current product data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nemlig-mcp-plans-"));
  const previous = process.env.NEMLIG_CONFIG_DIR; process.env.NEMLIG_CONFIG_DIR = directory;
  let current = product; let reads = 0;
  const client = fakeClient({
    listFavorites: async () => { reads += 1; return [current]; }, getCart: async () => { reads += 1; return { ...basket, items: [{ ...basket.items[0]!, id: 7 }] }; },
    addToCart: async () => { throw new Error("mutation called"); }, removeFromCart: async () => { throw new Error("mutation called"); }, clearCart: async () => { throw new Error("mutation called"); },
  });
  try {
    await withMcpClient(createMcpServer(client, async () => undefined, { NEMLIG_MCP_APPS: "0" }), async (mcp) => {
      const input = { lines: [{ id: "milk", name: "mælk", quantity: 2 }] };
      const planned = await mcp.callTool({ name: "plan_my_shopping", arguments: input });
      const plan = planned.structuredContent as { lines: Array<{ candidates: Array<{ source: string; dietary: object }>; remaining_quantity: number }> };
      assert.equal(plan.lines[0]?.candidates[0]?.source, "favorite"); assert.equal(plan.lines[0]?.remaining_quantity, 1);
      const saved = await mcp.callTool({ name: "save_my_shopping_plan", arguments: input });
      const id = (saved.structuredContent as { id: string }).id;
      const file = join(directory, "plans", `${id}.json`); const before = await readFile(file, "utf8");
      current = { ...product, price: 99 };
      const loaded = await mcp.callTool({ name: "continue_my_shopping_plan", arguments: { saved_plan: id } });
      const resumed = loaded.structuredContent as { lines: Array<{ candidates: Array<{ price: number }> }> };
      assert.equal(resumed.lines[0]?.candidates[0]?.price, 99); assert.equal(await readFile(file, "utf8"), before);
      const invalid = await mcp.callTool({ name: "plan_my_shopping", arguments: { lines: [] } });
      assert.equal(invalid.isError, true);
    });
    assert.equal(reads, 4);
  } finally { if (previous === undefined) delete process.env.NEMLIG_CONFIG_DIR; else process.env.NEMLIG_CONFIG_DIR = previous; }
});

test("every MCP tool has complete schemas, accurate annotations, and safe server instructions", async () => {
  await withMcpClient(createMcpServer(fakeClient()), async (mcp) => {
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
      "choose_products_visually",
    ]) {
      assert.equal(byName.get(name)?.annotations?.readOnlyHint, true, name);
      assert.equal(byName.get(name)?.annotations?.destructiveHint, false, name);
    }
    assert.equal(byName.get("add_approved_items")?.annotations?.destructiveHint, false);
    assert.equal(byName.get("suggest_an_improvement")?.annotations?.readOnlyHint, false);
    assert.equal(byName.get("suggest_an_improvement")?.annotations?.destructiveHint, false);
    assert.equal(byName.get("remove_approved_item")?.annotations?.destructiveHint, true);
    assert.equal(byName.get("make_approved_item_swap")?.annotations?.destructiveHint, true);
    assert.equal(byName.get("empty_approved_basket")?.annotations?.destructiveHint, true);
    assert.match(mcp.getInstructions() ?? "", /A review is not approval/);
    assert.match(mcp.getInstructions() ?? "", /Do not ask for approval twice/);
    assert.match(mcp.getInstructions() ?? "", /Never check out, pay, place an order/);
    assert.doesNotMatch(
      JSON.stringify({ tools, instructions: mcp.getInstructions() }),
      /password|cookie|bearer|access[_-]?token|api[_-]?key|authorization|session[_-]?id/iu,
    );
  });
});

test("authenticated HTTP request context preserves stdio tool and resource metadata", async () => {
  await withMcpClient(createMcpServer(fakeClient()), async (stdio) => {
    await withMcpClient(
      createMcpServer(fakeClient(), undefined, undefined, undefined, undefined, { ownerSubject: "auth0|owner" }),
      async (http) => {
        assert.deepEqual(await http.listTools(), await stdio.listTools());
        assert.deepEqual(await http.listResources(), await stdio.listResources());
        assert.equal(http.getInstructions(), stdio.getInstructions());
      },
    );
  });
});

test("MCP routes ordinary product intent through favorites-first planning", async () => {
  await withMcpClient(createMcpServer(fakeClient()), async (mcp) => {
    const tools = new Map((await mcp.listTools()).tools.map((tool) => [tool.name, tool.description ?? ""]));
    const instructions = mcp.getInstructions() ?? "";
    assert.match(instructions, /ordinary requests to find or add products, use plan_my_shopping/);
    assert.match(instructions, /find_groceries only for an explicit full-catalog search/);
    assert.match(instructions, /show_my_favorites only for explicit favourite browsing/);
    assert.match(tools.get("plan_my_shopping") ?? "", /checking your favourites first/);
    assert.match(tools.get("find_groceries") ?? "", /explicitly want the full catalog/);
    assert.match(tools.get("show_my_favorites") ?? "", /saved Nemlig favourites/);
  });
});

test("MCP creates one structured feature request without touching Nemlig", async () => {
  const client = fakeClient();
  let received: unknown;
  const requestFeature = async (request: FeatureRequest) => {
    received = request;
    return { number: 42, title: request.title, url: "https://github.com/mortenbroesby/everyday-assistants/issues/42" };
  };
  await withMcpClient(
    createMcpServer(client, async () => undefined, { NEMLIG_MCP_APPS: "0" }, new BasketProposalService(client), requestFeature),
    async (mcp) => {
      const result = await mcp.callTool({
        name: "suggest_an_improvement",
        arguments: {
          title: "Prefer discounted favorites",
          summary: "Choose discounted favorites first.",
          acceptance_criteria: ["Search favorites first"],
        },
      });
      assert.equal(result.isError, undefined);
      assert.deepEqual(received, {
        title: "Prefer discounted favorites",
        summary: "Choose discounted favorites first.",
        acceptance_criteria: ["Search favorites first"],
      });
      assert.deepEqual(result.structuredContent, {
        number: 42,
        title: "Prefer discounted favorites",
        url: "https://github.com/mortenbroesby/everyday-assistants/issues/42",
      });
    },
  );
});

test("MCP search and picker return identical ranked structured data", async () => {
  await withMcpClient(createMcpServer(fakeClient()), async (mcp) => {
    const search = await mcp.callTool({ name: "find_groceries", arguments: { search_term: "mælk", result_count: 5 } });
    const pick = await mcp.callTool({ name: "choose_products_visually", arguments: { search_term: "mælk", result_count: 5 } });
    assert.deepEqual(search.structuredContent, pick.structuredContent);
    assert.deepEqual((search.structuredContent as { result: Candidate[] }).result[0]?.tags, [
      "cheapest",
      "recommended",
      "organic",
    ]);
  });
});

interface Candidate {
  tags: string[];
}

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
  await withMcpClient(createMcpServer(client), async (mcp) => {
    const viewed = await mcp.callTool({ name: "show_my_basket", arguments: {} });
    assert.match(assertFriendlyBasketText(viewed), /Kurven er tom/u);
    assert.deepEqual(viewed.structuredContent, {
      items: [], products_price: 0, delivery_price: 5, number_of_products: 0, delivery_time: "Tomorrow",
    });
    const invalid = await mcp.callTool({
      name: "review_items_to_add",
      arguments: { items: [{ product: 7, quantity: 0 }] },
    });
    assert.equal(invalid.isError, true);
    assert.equal(added, undefined);
    const prepared = await mcp.callTool({
      name: "review_items_to_add",
      arguments: { items: [{ product: 7, quantity: 2 }] },
    });
    assert.equal(added, undefined);
    assert.match(assertFriendlyBasketText(prepared), /2 × Økologisk mælk/u);
    assert.match(toolText(prepared), /25,00 kr\./u);
    assert.deepEqual(Object.keys(prepared.structuredContent ?? {}).sort(), [
      "applicable", "basket_fingerprint", "connection_bound", "expires_at", "issued_at", "operation", "proposal_id", "review",
    ]);
    const sameName = await mcp.callTool({
      name: "review_items_to_add",
      arguments: { items: [{ product: 7, quantity: 1 }, { product: 8, quantity: 1 }] },
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
    const direct = await mcp.callTool({
      name: "add_to_cart",
      arguments: { product_id: 7, quantity: 2 },
    });
    assert.equal(direct.isError, true);
  });
});

test("hosted proposals survive an owner reconnect but remain isolated from another owner", async () => {
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
    createMcpServer(client, undefined, undefined, proposals, undefined, { ownerSubject: "auth0|owner" }),
    async (mcp) => {
      const prepared = await mcp.callTool({
        name: "review_items_to_add",
        arguments: { items: [{ product: 7, quantity: 1 }] },
      });
      proposalId = (prepared.structuredContent as { proposal_id: string }).proposal_id;
    },
  );

  await withMcpClient(
    createMcpServer(client, undefined, undefined, proposals, undefined, { ownerSubject: "auth0|other" }),
    async (mcp) => {
      const rejected = await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } });
      assert.equal(rejected.isError, true);
      assert.equal(added, undefined);
    },
  );

  await withMcpClient(
    createMcpServer(client, undefined, undefined, proposals, undefined, { ownerSubject: "auth0|owner" }),
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
  await withMcpClient(createMcpServer(client), async (mcp) => {
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

    const direct = await mcp.callTool({
      name: "replace_cart_line",
      arguments: { current_product_id: 7, replacement_product_id: 8, replacement_quantity: 1 },
    });
    assert.equal(direct.isError, true);
  });

  const uncertainClient = fakeClient({
    getProduct: async (id) => id === 8 ? replacement : current,
    getCart: async () => ({
      items: [{ id: 7, name: current.name, quantity: 1, total: 12.5 }],
      productsPrice: 12.5, deliveryPrice: 0, numberOfProducts: 1, deliveryTime: undefined,
    }),
    addToCart: async () => ({
      items: [{ id: 7, name: current.name, quantity: 1, total: 12.5 }],
      productsPrice: 12.5, deliveryPrice: 0, numberOfProducts: 1, deliveryTime: undefined,
    }),
  });
  await withMcpClient(createMcpServer(uncertainClient), async (mcp) => {
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

  await withMcpClient(createMcpServer(client), async (mcp) => {
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

test("picker gate hides only picker tool/resource for every false spelling", async () => {
  for (const value of ["0", "false", "FALSE", " no ", "off"]) {
    await withMcpClient(createMcpServer(fakeClient(), async () => undefined, { NEMLIG_MCP_APPS: value }), async (mcp) => {
      assert.equal((await mcp.listTools()).tools.some((tool) => tool.name === "choose_products_visually"), false);
      await assert.rejects(mcp.listResources(), /Method not found/);
    });
  }
});

test("picker resource prepares an exact quantity-one review before a distinct apply action", async () => {
  assert.match(PICKER_HTML, /aria-live/);
  assert.match(PICKER_HTML, /review_items_to_add/);
  assert.match(PICKER_HTML, /add_approved_items/);
  assert.match(PICKER_HTML, /prepareBatch\(\[\{product:product\.id,quantity:1\}\]/);
  assert.match(PICKER_HTML, /renderPlan/);
  assert.match(PICKER_HTML, /type="number"/);
  assert.match(PICKER_HTML, /Godkend og tilføj/);
  assert.match(PICKER_HTML, /Kurven indeholder nu/);
  assert.match(PICKER_HTML, /applied\.basket\.items/);
  assert.doesNotMatch(PICKER_HTML, /add_to_cart/);
  assert.match(PICKER_HTML, /structuredContent/);
  assert.match(PICKER_HTML, /proposal\.proposal_id/);
  assert.doesNotMatch(PICKER_HTML, /ID:|"ID "|Udløber|expires_at/);
  assert.match(PICKER_HTML, /line\.line_total/);
  await withMcpClient(createMcpServer(fakeClient()), async (mcp) => {
    const resources = await mcp.listResources();
    assert.equal(resources.resources.some((resource) => resource.uri === PICKER_URI), true);
    const resource = await mcp.readResource({ uri: PICKER_URI });
    assert.match(resource.contents[0] && "text" in resource.contents[0] ? resource.contents[0].text : "", /<!DOCTYPE html>/);
  });
});
