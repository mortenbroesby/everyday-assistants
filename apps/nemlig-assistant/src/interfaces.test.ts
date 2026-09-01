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

test("MCP exposes exact non-recipe tools and clean missing-credential errors", async () => {
  const client = fakeClient({ isLoggedIn: () => false });
  await withMcpClient(createMcpServer(client, async () => undefined, { NEMLIG_MCP_APPS: "0" }), async (mcp) => {
    const tools = await mcp.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      [
        "apply_cart_additions",
        "apply_cart_clear",
        "apply_cart_removal",
        "apply_cart_replacement",
        "browse_department",
        "create_feature_request",
        "list_departments",
        "list_favorites",
        "load_shopping_plan",
        "plan_shopping_list",
        "prepare_cart_additions",
        "prepare_cart_clear",
        "prepare_cart_removal",
        "prepare_cart_replacement",
        "save_shopping_plan",
        "search_products",
        "view_cart",
      ],
    );
    assert.equal(tools.tools.some((tool) => /recipe|checkout|order|pay|purchase/iu.test(tool.name)), false);
    const result = await mcp.callTool({ name: "view_cart", arguments: {} });
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
    const favorites = tools.tools.find((tool) => tool.name === "list_favorites");
    assert.deepEqual(favorites?.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    });
    const listed = await mcp.callTool({ name: "list_favorites", arguments: { limit: 1 } });
    assert.deepEqual((listed.structuredContent as { result: Array<{ id: number }> }).result.map(({ id }) => id), [8]);

    const matched = await mcp.callTool({
      name: "list_favorites",
      arguments: { query: "BANAN", limit: 2 },
    });
    const candidates = (matched.structuredContent as { result: Array<{ id: number; tags: string[] }> }).result;
    assert.deepEqual(candidates.map(({ id }) => id), [8, 10]);
    assert.deepEqual(candidates[0]?.tags, ["recommended"]);
    assert.deepEqual(candidates[1]?.tags, ["cheapest", "organic"]);

    const empty = await mcp.callTool({
      name: "list_favorites",
      arguments: { query: "pære", limit: 2 },
    });
    assert.deepEqual((empty.structuredContent as { result: unknown[] }).result, []);
    assert.deepEqual(requestedLimits, [1, 1000, 1000]);
  });
});

test("MCP plans whole lists and save/load re-resolves immutable structured snapshots", async () => {
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
      const planned = await mcp.callTool({ name: "plan_shopping_list", arguments: input });
      const plan = planned.structuredContent as { lines: Array<{ candidates: Array<{ source: string; dietary: object }>; remaining_quantity: number }> };
      assert.equal(plan.lines[0]?.candidates[0]?.source, "favorite"); assert.equal(plan.lines[0]?.remaining_quantity, 1);
      const saved = await mcp.callTool({ name: "save_shopping_plan", arguments: input });
      const id = (saved.structuredContent as { id: string }).id;
      const file = join(directory, "plans", `${id}.json`); const before = await readFile(file, "utf8");
      current = { ...product, price: 99 };
      const loaded = await mcp.callTool({ name: "load_shopping_plan", arguments: { id } });
      const resumed = loaded.structuredContent as { lines: Array<{ candidates: Array<{ price: number }> }> };
      assert.equal(resumed.lines[0]?.candidates[0]?.price, 99); assert.equal(await readFile(file, "utf8"), before);
      const invalid = await mcp.callTool({ name: "plan_shopping_list", arguments: { lines: [] } });
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
      "search_products",
      "list_favorites",
      "view_cart",
      "prepare_cart_additions",
      "prepare_cart_removal",
      "prepare_cart_replacement",
      "prepare_cart_clear",
      "pick_products",
    ]) {
      assert.equal(byName.get(name)?.annotations?.readOnlyHint, true, name);
      assert.equal(byName.get(name)?.annotations?.destructiveHint, false, name);
    }
    assert.equal(byName.get("apply_cart_additions")?.annotations?.destructiveHint, false);
    assert.equal(byName.get("create_feature_request")?.annotations?.readOnlyHint, false);
    assert.equal(byName.get("create_feature_request")?.annotations?.destructiveHint, false);
    assert.equal(byName.get("apply_cart_removal")?.annotations?.destructiveHint, true);
    assert.equal(byName.get("apply_cart_replacement")?.annotations?.destructiveHint, true);
    assert.equal(byName.get("apply_cart_clear")?.annotations?.destructiveHint, true);
    assert.match(mcp.getInstructions() ?? "", /Preparation is not approval/);
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
    assert.match(instructions, /ordinary requests to find or add products, use plan_shopping_list/);
    assert.match(instructions, /search_products only for an explicit general-catalog search/);
    assert.match(instructions, /list_favorites only for explicit favorite browsing/);
    assert.match(tools.get("plan_shopping_list") ?? "", /ordinary find-or-add requests/);
    assert.match(tools.get("search_products") ?? "", /explicitly requests a catalog search/);
    assert.match(tools.get("list_favorites") ?? "", /explicitly requests favorite browsing/);
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
        name: "create_feature_request",
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
    const search = await mcp.callTool({ name: "search_products", arguments: { query: "mælk", limit: 5 } });
    const pick = await mcp.callTool({ name: "pick_products", arguments: { query: "mælk", limit: 5 } });
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
    getCart: async () => empty,
    addToCart: async (id, quantity) => {
      added = [id, quantity ?? 1];
      return applied;
    },
  });
  await withMcpClient(createMcpServer(client), async (mcp) => {
    const invalid = await mcp.callTool({
      name: "prepare_cart_additions",
      arguments: { items: [{ product_id: 7, quantity: 0 }] },
    });
    assert.equal(invalid.isError, true);
    assert.equal(added, undefined);
    const prepared = await mcp.callTool({
      name: "prepare_cart_additions",
      arguments: { items: [{ product_id: 7, quantity: 2 }] },
    });
    assert.equal(added, undefined);
    const proposalId = (prepared.structuredContent as { proposal_id: string }).proposal_id;
    const result = await mcp.callTool({
      name: "apply_cart_additions",
      arguments: { proposal_id: proposalId },
    });
    assert.deepEqual(added, [7, 2]);
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
        name: "prepare_cart_additions",
        arguments: { items: [{ product_id: 7, quantity: 1 }] },
      });
      proposalId = (prepared.structuredContent as { proposal_id: string }).proposal_id;
    },
  );

  await withMcpClient(
    createMcpServer(client, undefined, undefined, proposals, undefined, { ownerSubject: "auth0|other" }),
    async (mcp) => {
      const rejected = await mcp.callTool({ name: "apply_cart_additions", arguments: { proposal_id: proposalId } });
      assert.equal(rejected.isError, true);
      assert.equal(added, undefined);
    },
  );

  await withMcpClient(
    createMcpServer(client, undefined, undefined, proposals, undefined, { ownerSubject: "auth0|owner" }),
    async (mcp) => {
      const result = await mcp.callTool({ name: "apply_cart_additions", arguments: { proposal_id: proposalId } });
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
      name: "prepare_cart_replacement",
      arguments: { current_product_id: 7, replacement_product_id: 7, replacement_quantity: 1 },
    });
    assert.equal(invalid.isError, true);
    assert.equal(writes.length, 0);

    const prepared = await mcp.callTool({
      name: "prepare_cart_replacement",
      arguments: { current_product_id: 7, replacement_product_id: 8, replacement_quantity: 1 },
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

    const applied = await mcp.callTool({
      name: "apply_cart_replacement",
      arguments: { proposal_id: review.proposal_id },
    });
    assert.equal((applied.structuredContent as { operation: string }).operation, "replacement");
    assert.deepEqual(writes, ["add:8:1", "remove:7"]);
    const replayed = await mcp.callTool({
      name: "apply_cart_replacement",
      arguments: { proposal_id: review.proposal_id },
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
      name: "prepare_cart_replacement",
      arguments: { current_product_id: 7, replacement_product_id: 8, replacement_quantity: 1 },
    });
    const result = await mcp.callTool({
      name: "apply_cart_replacement",
      arguments: { proposal_id: (prepared.structuredContent as { proposal_id: string }).proposal_id },
    });
    assert.equal(result.isError, true);
    const text = (result.content as Array<{ text?: string }>)[0]?.text ?? "";
    assert.match(text, /inspect the basket and do not retry/);
    assert.doesNotMatch(text, /upstream|stack|Error:/);
  });
});

test("picker gate hides only picker tool/resource for every false spelling", async () => {
  for (const value of ["0", "false", "FALSE", " no ", "off"]) {
    await withMcpClient(createMcpServer(fakeClient(), async () => undefined, { NEMLIG_MCP_APPS: value }), async (mcp) => {
      assert.equal((await mcp.listTools()).tools.some((tool) => tool.name === "pick_products"), false);
      await assert.rejects(mcp.listResources(), /Method not found/);
    });
  }
});

test("picker resource prepares an exact quantity-one review before a distinct apply action", async () => {
  assert.match(PICKER_HTML, /aria-live/);
  assert.match(PICKER_HTML, /prepare_cart_additions/);
  assert.match(PICKER_HTML, /apply_cart_additions/);
  assert.match(PICKER_HTML, /prepareBatch\(\[\{product_id:product\.id,quantity:1\}\]/);
  assert.match(PICKER_HTML, /renderPlan/);
  assert.match(PICKER_HTML, /type="number"/);
  assert.match(PICKER_HTML, /Godkend og tilføj/);
  assert.match(PICKER_HTML, /Verificeret kurv/);
  assert.match(PICKER_HTML, /applied\.basket\.items/);
  assert.doesNotMatch(PICKER_HTML, /add_to_cart/);
  assert.match(PICKER_HTML, /ID:/);
  assert.match(PICKER_HTML, /line\.line_total/);
  await withMcpClient(createMcpServer(fakeClient()), async (mcp) => {
    const resources = await mcp.listResources();
    assert.equal(resources.resources.some((resource) => resource.uri === PICKER_URI), true);
    const resource = await mcp.readResource({ uri: PICKER_URI });
    assert.match(resource.contents[0] && "text" in resource.contents[0] ? resource.contents[0].text : "", /<!DOCTYPE html>/);
  });
});
