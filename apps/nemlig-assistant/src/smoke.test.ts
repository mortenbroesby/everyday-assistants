import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import { NemligError, type Basket, type Product, type ShoppingClient } from "./client.js";
import { createMcpServer } from "./mcp.js";

const execute = promisify(execFile);

test("server modules do not depend on the executable CLI entry point", async () => {
  for (const file of ["mcp.ts", "http.ts", "proposals.ts"]) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /from "\.\/cli\.js"/u);
  }
});

test("source CLI, MCP, and HTTP modules import without starting work", async () => {
  const { stderr, stdout } = await execute(
    process.execPath,
    ["--import=tsx", "--input-type=module", "--eval", 'globalThis.fetch=()=>{throw new Error("fetch during import")};await Promise.all([import("./cli.ts"), import("./mcp.ts"), import("./http.ts")])'],
    { cwd: import.meta.dirname, env: { PATH: process.env.PATH }, timeout: 30_000 },
  );
  assert.equal(stdout, "");
  assert.equal(stderr, "");
});

test("local CLI help and MCP surface need no credentials or network", async () => {
  const { stdout } = await execute(
    process.execPath,
    ["--import=tsx", `${import.meta.dirname}/cli.ts`, "--help"],
    { env: { PATH: process.env.PATH } },
  );
  assert.match(stdout, /^Usage: nemlig-assistant/m);
  assert.match(stdout, /login/);
  assert.match(stdout, /search/);
  assert.match(stdout, /favorites/);
  assert.doesNotMatch(stdout, /feature-request/);
  assert.match(stdout, /cart/);
  assert.match(stdout, /add/);
  assert.match(stdout, /remove/);
  assert.doesNotMatch(stdout, /parse|checkout|--password/);

  const unavailable = async (): Promise<never> => {
    throw new Error("Network must not be used by smoke test");
  };
  const shoppingClient: ShoppingClient = {
    isLoggedIn: () => false,
    login: unavailable,
    searchProducts: unavailable,
    getProduct: unavailable,
    getFreshProduct: unavailable,
    listFavorites: unavailable,
    listDepartments: unavailable,
    browseDepartment: unavailable,
    getCart: unavailable,
    addToCart: unavailable,
    removeFromCart: unavailable,
    clearCart: unavailable,
  };
  const server = createMcpServer(shoppingClient, async () => undefined, {
    NEMLIG_MCP_APPS: "0",
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "smoke", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const serverInfo = client.getServerVersion();
    assert.ok(serverInfo);
    assert.equal(serverInfo?.name, "nemlig-assistant");
    assert.equal(serverInfo.title, "Nemlig Assistant");
    assert.deepEqual(serverInfo.icons, [{
      src: serverInfo.icons?.[0]?.src,
      mimeType: "image/png",
      sizes: ["1024x1024"],
    }]);
    assert.match(serverInfo.icons?.[0]?.src ?? "", /^data:image\/png;base64,iVBOR/);
    assert.deepEqual(
      (await client.listTools()).tools.map((tool) => tool.name).sort(),
      [
        "add_approved_items",
        "browse_grocery_section",
        "check_nemlig_connection",
        "empty_approved_basket",
        "find_groceries",
        "make_approved_item_swap",
        "plan_my_shopping",
        "remove_approved_item",
        "review_emptying_basket",
        "review_item_swap",
        "review_item_to_remove",
        "review_items_to_add",
        "show_grocery_sections",
        "show_my_basket",
        "show_my_favorites",
      ],
    );
  } finally {
    await client.close();
    await server.close();
  }
});

test("recipe discovery reaches a reviewed proposal and verified basket without unsafe shortcuts", async () => {
  const product = (id: number, name: string, unitSize: string, price: number, category = "Dagligvarer"): Product => ({
    id, name, price, unit: `${price.toFixed(2)} kr./stk.`, unitPrice: price, unitSize,
    brand: name.startsWith("Heinz") ? "Heinz" : "Test", category, subcategory: category,
    imageUrl: "", available: true, labels: [], isOrganic: false, isFrozen: false,
    isRefrigerated: false, isDairy: false, isLactoseFree: false,
    isGlutenFree: false, isVegan: false, isOnDiscount: false,
  });
  const products = new Map([
    [101, product(101, "Hakket oksekød", "500 g", 45, "Kød")],
    [102, product(102, "Hakket oksekød til kat", "400 g", 22, "Kattemad")],
    [201, product(201, "Heinz Tomato Ketchup", "500 ml", 28, "Ketchup")],
    [202, product(202, "Tomatketchup", "500 ml", 14, "Ketchup")],
    [301, product(301, "Cheddar", "200 g", 25, "Ost")],
  ]);
  let reads = 0;
  let writes = 0;
  let basket: Basket = { items: [], productsPrice: 0, deliveryPrice: 0, numberOfProducts: 0, deliveryTime: undefined };
  const client: ShoppingClient = {
    isLoggedIn: () => true,
    login: async () => {},
    searchProducts: async (query) => query === "hakket oksekød"
      ? [products.get(101)!, products.get(102)!]
      : query === "ketchup" ? [products.get(201)!, products.get(202)!] : [products.get(301)!],
    getProduct: async (id) => {
      if (id === 103) throw new NemligError("Resource not found.", 404);
      return products.get(id)!;
    },
    getFreshProduct: async (id) => products.get(id)!,
    listFavorites: async () => [products.get(201)!],
    listDepartments: async () => [],
    browseDepartment: async () => ({ products: [], page: 1, hasNext: false }),
    getCart: async () => { reads += 1; return basket; },
    addToCart: async (id, quantity = 1) => {
      writes += 1;
      const found = products.get(id)!;
      const existing = basket.items.find((item) => item.id === id);
      const items = existing
        ? basket.items.map((item) => item.id === id ? { ...item, quantity: (item.quantity ?? 0) + quantity, total: (item.total ?? 0) + found.price! * quantity } : item)
        : [...basket.items, { id, name: found.name, quantity, total: found.price! * quantity }];
      basket = { ...basket, items, productsPrice: items.reduce((total, item) => total + (item.total ?? 0), 0), numberOfProducts: items.reduce((total, item) => total + (item.quantity ?? 0), 0) };
      return basket;
    },
    removeFromCart: async () => { throw new Error("unexpected removal"); },
    clearCart: async () => { throw new Error("unexpected clear"); },
  };
  const server = createMcpServer(client, async () => ({ username: "smoke@example.test", password: "synthetic" }), { NEMLIG_MCP_APPS: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "recipe-smoke", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
  try {
    const beef = await mcp.callTool({ name: "find_groceries", arguments: { search_term: "hakket oksekød", result_count: 5 } });
    assert.notEqual(beef.isError, true, JSON.stringify(beef));
    assert.deepEqual((beef.structuredContent as { result: Array<{ id: number }> }).result.map(({ id }) => id), [101, 102]);
    const favourites = await mcp.callTool({ name: "show_my_favorites", arguments: { search_term: "ketchup", result_count: 5, page: 1 } });
    assert.equal((favourites.structuredContent as { result: Array<{ id: number }> }).result[0]?.id, 201);

    const rejected = await mcp.callTool({ name: "review_proposed_basket", arguments: {
      items: [{ ingredient: "hakket oksekød", product: 102, quantity: 3, confidence: 90 }],
    } });
    assert.notEqual(rejected.isError, true);
    assert.deepEqual(rejected.structuredContent, {
      pantry_assumptions: [],
      items: [],
      rejected: [{ ingredient: "hakket oksekød", reason: "No proposed product matched this ingredient." }],
    });
    assert.equal(reads, 0);

    const partiallyAvailable = await mcp.callTool({ name: "review_proposed_basket", arguments: {
      items: [
        { ingredient: "forsvundet vare", product: 103, quantity: 1, confidence: 90 },
        { ingredient: "ketchup", product: 201, quantity: 1, confidence: 90 },
      ],
    } });
    assert.notEqual(partiallyAvailable.isError, true);
    const partial = partiallyAvailable.structuredContent as { items: Array<{ ingredient: string }>; rejected: Array<{ ingredient: string }> };
    assert.deepEqual(partial.items.map(({ ingredient }) => ingredient), ["ketchup"]);
    assert.deepEqual(partial.rejected.map(({ ingredient }) => ingredient), ["forsvundet vare"]);
    assert.equal(reads, 0);

    const proposed = await mcp.callTool({ name: "review_proposed_basket", arguments: {
      pantry_assumptions: ["mel", "salt", "peber"],
      items: [
        { ingredient: "minced beef", search_term: "hakket oksekød", product: 101, quantity: 3, confidence: 92 },
        { ingredient: "ketchup", product: 201, alternatives: [202], quantity: 1, confidence: 72, favorite_match: true },
        { ingredient: "cheddar", product: 301, quantity: 2, confidence: 85 },
      ],
    } });
    assert.notEqual(proposed.isError, true);
    assert.deepEqual((proposed.structuredContent as { pantry_assumptions: string[] }).pantry_assumptions, ["mel", "salt", "peber"]);
    assert.equal(reads, 0);

    const scoped = await mcp.callTool({ name: "plan_my_shopping", arguments: {
      proceed: true,
      lines: [{ id: "cheddar", name: "cheddar", quantity: 2 }],
    } });
    assert.notEqual(scoped.isError, true, JSON.stringify(scoped));
    const authorization = (scoped.structuredContent as { automatic_authorization: string }).automatic_authorization;
    const drifted = await mcp.callTool({ name: "review_items_to_add", arguments: {
      authorization: "same_run_automatic", automatic_authorization: authorization,
      items: [{ product: 201, quantity: 1 }],
    } });
    assert.equal(drifted.isError, true);
    assert.equal(writes, 0);

    const reviewed = await mcp.callTool({ name: "review_items_to_add", arguments: {
      authorization: "exact_review",
      items: [{ product: 101, quantity: 3 }, { product: 201, quantity: 1 }, { product: 301, quantity: 2 }],
    } });
    assert.notEqual(reviewed.isError, true);
    const proposalId = (reviewed.structuredContent as { proposal_id: string }).proposal_id;
    const applied = await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } });
    assert.notEqual(applied.isError, true);
    assert.equal(writes, 3);
    assert.deepEqual(basket.items.map(({ id, quantity }) => [id, quantity]), [[101, 3], [201, 1], [301, 2]]);
    assert.ok(reads >= 2);

    const replay = await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } });
    assert.notEqual(replay.isError, true);
    assert.equal((replay.structuredContent as { replayed: boolean }).replayed, true);
    assert.equal(writes, 3);
  } finally {
    await mcp.close();
    await server.close();
  }
});

test("an indeterminate recipe write is attempted once", async () => {
  const item: Product = {
    id: 401, name: "Tomatketchup", price: 14, unit: "28 kr./l", unitPrice: 28,
    unitSize: "500 ml", brand: "Test", category: "Ketchup", subcategory: "Ketchup",
    imageUrl: "", available: true, labels: [], isOrganic: false, isFrozen: false,
    isRefrigerated: false, isDairy: false, isLactoseFree: false,
    isGlutenFree: false, isVegan: true, isOnDiscount: false,
  };
  const empty: Basket = { items: [], productsPrice: 0, deliveryPrice: 0, numberOfProducts: 0, deliveryTime: undefined };
  let writes = 0;
  const unavailable = async (): Promise<never> => { throw new Error("unexpected provider operation"); };
  const client: ShoppingClient = {
    isLoggedIn: () => true, login: async () => {}, searchProducts: unavailable,
    getProduct: async () => item, getFreshProduct: async () => item,
    listFavorites: unavailable, listDepartments: unavailable, browseDepartment: unavailable,
    getCart: async () => empty,
    addToCart: async () => { writes += 1; throw new Error("indeterminate write"); },
    removeFromCart: unavailable, clearCart: unavailable,
  };
  const server = createMcpServer(client, async () => ({ username: "smoke@example.test", password: "synthetic" }), { NEMLIG_MCP_APPS: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "write-smoke", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
  try {
    const review = await mcp.callTool({ name: "review_items_to_add", arguments: {
      authorization: "exact_review", items: [{ product: 401, quantity: 1 }],
    } });
    const proposalId = (review.structuredContent as { proposal_id: string }).proposal_id;
    assert.equal((await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } })).isError, true);
    assert.equal((await mcp.callTool({ name: "add_approved_items", arguments: { approved_review: proposalId } })).isError, true);
    assert.equal(writes, 1);
  } finally {
    await mcp.close();
    await server.close();
  }
});
