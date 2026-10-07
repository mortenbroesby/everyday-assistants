import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import { NemligError, type Basket, type Product, type ShoppingClient } from "./client.js";
import { createMcpServer } from "./mcp.js";

const execute = promisify(execFile);
const modernClient = (name: string) => new Client({ name, version: "1.0.0" }, {
  versionNegotiation: { mode: { pin: "2026-07-28" } },
});

const connectModern = async (server: ReturnType<typeof createMcpServer>, client: Client): Promise<() => Promise<void>> => {
  const handler = createMcpHandler(() => server, { legacy: "reject" });
  const nodeHandler = toNodeHandler(handler);
  const httpServer = createServer((req, res) => { void nodeHandler(req, res); });
  httpServer.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { httpServer.once("listening", resolve); httpServer.once("error", reject); });
  const endpoint = new URL(`http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/mcp`);
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  return async () => {
    await client.close();
    await handler.close();
    httpServer.closeAllConnections();
    await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  };
};

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
  assert.doesNotMatch(stdout, /\bremove\b/u);
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
  };
  const server = createMcpServer(shoppingClient, async () => undefined);
  const client = modernClient("smoke");
  const close = await connectModern(server, client);
  try {
    const serverInfo = client.getServerVersion();
    assert.ok(serverInfo);
    assert.equal(serverInfo?.name, "nemlig-assistant");
    assert.equal(serverInfo.title, "MoJo Shopper");
    assert.deepEqual(serverInfo.icons, [{
      src: serverInfo.icons?.[0]?.src,
      mimeType: "image/svg+xml",
      sizes: ["1024x1024"],
    }]);
    assert.match(serverInfo.icons?.[0]?.src ?? "", /^data:image\/svg\+xml,/u);
    assert.deepEqual(
      (await client.listTools()).tools
        .filter((tool) => !tool._meta?.ui || ((tool._meta.ui as { visibility?: string[] }).visibility ?? []).includes("model"))
        .map((tool) => tool.name).sort(),
      [
        "check_nemlig_connection",
        "find_groceries",
        "get_profile",
        "show_my_basket",
        "start_product_review",
        "submit_product_review_conversation",
        "update_product_review_conversation",
      ],
    );
  } finally {
    await close();
  }
});

test("discovery reaches an approved draft submission and verified Nemlig basket", async () => {
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
  };
  const server = createMcpServer(client, async () => ({ username: "smoke@example.test", password: "synthetic" }));
  const mcp = modernClient("recipe-smoke");
  const close = await connectModern(server, mcp);
  try {
    const beef = await mcp.callTool({ name: "find_groceries", arguments: { search_term: "hakket oksekød", result_count: 5 } });
    assert.notEqual(beef.isError, true, JSON.stringify(beef));
    assert.deepEqual((beef.structuredContent as { result: Array<{ id: number }> }).result.map(({ id }) => id), [101, 102]);
    assert.equal(reads, 0);

    const started = await mcp.callTool({ name: "start_product_review", arguments: {
      items: [{ product_id: 101, quantity: 3 }, { product_id: 201, quantity: 1 }, { product_id: 301, quantity: 2 }],
    } });
    assert.notEqual(started.isError, true);
    const initial = (started.structuredContent as { review: { review_id: string; revision: number } }).review;
    const accepted = await mcp.callTool({ name: "update_product_review_conversation", arguments: {
      review_id: initial.review_id, revision: initial.revision,
      action: { kind: "accept", product_ids: [101, 201, 301] },
    } });
    const ready = (accepted.structuredContent as { review: { review_id: string; revision: number } }).review;
    const prepared = await mcp.callTool({ name: "update_product_review_conversation", arguments: {
      review_id: ready.review_id, revision: ready.revision, action: { kind: "prepare_submission" },
    } });
    const draft = (prepared.structuredContent as { review: { review_id: string; revision: number; submission: { submission_id: string } } }).review;
    const applied = await mcp.callTool({ name: "submit_product_review_conversation", arguments: {
      review_id: draft.review_id, revision: draft.revision, submission_id: draft.submission.submission_id,
    } });
    assert.notEqual(applied.isError, true);
    assert.equal(writes, 3);
    assert.deepEqual(basket.items.map(({ id, quantity }) => [id, quantity]), [[101, 3], [201, 1], [301, 2]]);
    assert.ok(reads >= 2);

    const replay = await mcp.callTool({ name: "submit_product_review_conversation", arguments: {
      review_id: draft.review_id, revision: draft.revision, submission_id: draft.submission.submission_id,
    } });
    assert.equal(replay.isError, true);
    assert.equal(writes, 3);
  } finally {
    await close();
  }
});

test("an indeterminate draft submission is attempted once", async () => {
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
  };
  const server = createMcpServer(client, async () => ({ username: "smoke@example.test", password: "synthetic" }));
  const mcp = modernClient("write-smoke");
  const close = await connectModern(server, mcp);
  try {
    const started = await mcp.callTool({ name: "start_product_review", arguments: { items: [{ product_id: 401, quantity: 1 }] } });
    const initial = (started.structuredContent as { review: { review_id: string; revision: number } }).review;
    const accepted = await mcp.callTool({ name: "update_product_review_conversation", arguments: {
      review_id: initial.review_id, revision: initial.revision, action: { kind: "accept", product_ids: [401] },
    } });
    const ready = (accepted.structuredContent as { review: { review_id: string; revision: number } }).review;
    const prepared = await mcp.callTool({ name: "update_product_review_conversation", arguments: {
      review_id: ready.review_id, revision: ready.revision, action: { kind: "prepare_submission" },
    } });
    const draft = (prepared.structuredContent as { review: { review_id: string; revision: number; submission: { submission_id: string } } }).review;
    const args = { review_id: draft.review_id, revision: draft.revision, submission_id: draft.submission.submission_id };
    assert.equal((await mcp.callTool({ name: "submit_product_review_conversation", arguments: args })).isError, true);
    assert.equal((await mcp.callTool({ name: "submit_product_review_conversation", arguments: args })).isError, true);
    assert.equal(writes, 1);
  } finally {
    await close();
  }
});
