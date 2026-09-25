import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { Basket, Product, ShoppingClient } from "./client.js";
import { createMcpServer } from "./mcp.js";
import type { ProductReviewSnapshot } from "./product-review.js";

const product = (id: number, name: string, price: number): Product => ({
  id, name, price, unit: `${price.toFixed(2)} kr/stk`, unitPrice: price, unitSize: "1 stk", brand: "Test",
  category: "Dagligvarer", subcategory: "", imageUrl: "", available: true, labels: [], isOrganic: false,
  isFrozen: false, isRefrigerated: false, isDairy: false, isLactoseFree: false, isGlutenFree: false,
  isVegan: false, isOnDiscount: false,
});

const item = (id: number, name: string, quantity: number, price: number) => ({
  id, name, quantity, total: quantity * price,
});

const withMcpClient = async <T>(server: ReturnType<typeof createMcpServer>, action: (client: Client) => Promise<T>): Promise<T> => {
  const handler = createMcpHandler(() => server, { legacy: "reject" });
  const nodeHandler = toNodeHandler(handler);
  const httpServer = createServer((request, response) => { void nodeHandler(request, response); });
  httpServer.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    httpServer.once("listening", resolve);
    httpServer.once("error", reject);
  });
  const client = new Client({ name: "submission-smoke", version: "1.0.0" }, {
    versionNegotiation: { mode: { pin: "2026-07-28" } },
  });
  const transport = new StreamableHTTPClientTransport(new URL(`/mcp`, `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`));
  await client.connect(transport);
  try {
    return await action(client);
  } finally {
    await client.close();
    await handler.close();
    httpServer.closeAllConnections();
    await new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
  }
};

test("MCP submission smoke searches, prepares only accepted lines, and verifies explicit submission", async () => {
  const chosen = product(7, "Chosen oats", 4.25);
  const unresolved = product(8, "Unresolved tea", 6.5);
  const products = new Map([[7, chosen], [8, unresolved]]);
  let basket: Basket = {
    items: [item(99, "Unrelated provider item", 2, 3)],
    productsPrice: 6, deliveryPrice: 5, numberOfProducts: 2, deliveryTime: "Tomorrow",
  };
  let providerWrites = 0;
  const provider: ShoppingClient = {
    isLoggedIn: () => true,
    login: async () => {},
    searchProducts: async query => query === "oats" ? [chosen, unresolved] : [],
    getProduct: async id => products.get(id) ?? { ...unresolved, id: undefined },
    getFreshProduct: async id => products.get(id) ?? { ...unresolved, id: undefined },
    listFavorites: async () => [],
    listDepartments: async () => [],
    browseDepartment: async () => ({ products: [], page: 1, hasNext: false }),
    getCart: async () => structuredClone(basket),
    addToCart: async (id, quantity = 1) => {
      providerWrites++;
      const productValue = products.get(id);
      assert.ok(productValue, `Unexpected product mutation: ${id}`);
      const line = item(id, productValue.name ?? `Product ${id}`, quantity, productValue.price ?? 0);
      const existing = basket.items.find(current => current.id === id);
      basket = {
        ...basket,
        items: existing ? basket.items.map(current => current.id === id ? line : current) : [...basket.items, line],
        productsPrice: (basket.productsPrice ?? 0) + (line.total ?? 0) - (existing?.total ?? 0),
        numberOfProducts: (basket.numberOfProducts ?? 0) + quantity - (existing?.quantity ?? 0),
      };
      return structuredClone(basket);
    },
    removeFromCart: async () => { throw new Error("Unexpected removal"); },
    clearCart: async () => { throw new Error("Unexpected clear"); },
  };
  const credentials = async () => ({ username: "person@example.test", password: "test-only" });

  await withMcpClient(createMcpServer(provider, credentials), async mcp => {
    const found = await mcp.callTool({ name: "find_groceries", arguments: { search_term: "oats" } });
    assert.equal(found.isError, undefined);
    const result = found.structuredContent as { result: Array<{ id: number }> };
    assert.deepEqual(result.result.map(value => value.id), [7, 8]);
    assert.equal(providerWrites, 0, "search is read-only");

    const started = await mcp.callTool({ name: "start_product_review", arguments: { items: [{ product_id: 7, quantity: 3 }, { product_id: 8, quantity: 2 }] } });
    assert.equal(started.isError, undefined);
    let review = (started.structuredContent as { review: ProductReviewSnapshot }).review;
    const update = async (action: Record<string, unknown>) => {
      const response = await mcp.callTool({ name: "update_product_review", arguments: { review_id: review.review_id, revision: review.revision, action } });
      assert.equal(response.isError, undefined, JSON.stringify(response.content));
      review = (response.structuredContent as { review: ProductReviewSnapshot }).review;
      return review;
    };
    assert.deepEqual(review.items.map(({ product_id, quantity, state }) => [product_id, quantity, state]), [
      [7, 3, "needs-review"], [8, 2, "needs-review"],
    ]);
    review = await update({ kind: "accept", product_ids: [7] });
    assert.deepEqual(review.items.map(({ product_id, state }) => [product_id, state]), [[7, "basket"], [8, "needs-review"]]);
    assert.equal(providerWrites, 0, "local acceptance does not mutate the provider basket");

    review = await update({ kind: "prepare_submission" });
    assert.equal(providerWrites, 0, "preparation does not mutate the provider basket");
    const prepared = review.submission;
    assert.ok(prepared);
    const preparedLines = prepared.review.lines as Array<{ product_id: number; quantity: number; item_price: number; line_total: number; name: string; unit_size: string }>;
    assert.deepEqual(preparedLines.map(({ product_id, quantity, item_price, line_total, name, unit_size }) => ({ product_id, quantity, item_price, line_total, name, unit_size })), [{ product_id: 7, quantity: 3, item_price: 4.25, line_total: 12.75, name: "Chosen oats", unit_size: "1 stk" }]);
    assert.equal(JSON.stringify(prepared.review).includes("Unresolved tea"), false);
    assert.equal(JSON.stringify(prepared.review).includes('"product_id":8'), false);

    const wrongReference = await mcp.callTool({ name: "submit_product_review", arguments: {
      review_id: review.review_id, revision: review.revision, submission_id: "00000000-0000-4000-8000-000000000000",
    } });
    assert.equal(wrongReference.isError, true, "only the exact prepared submission can be applied");
    assert.equal(providerWrites, 0);
    // Simulate the separate conversational approval turn for these exact lines.
    // User approval is the model's responsibility, not a boolean invented by this test.
    const submitted = await mcp.callTool({ name: "submit_product_review", arguments: {
      review_id: review.review_id, revision: review.revision, submission_id: prepared.submission_id,
    } });
    assert.equal(submitted.isError, undefined, JSON.stringify(submitted.content));
    const submittedData = submitted.structuredContent as {
      review: ProductReviewSnapshot;
      result: { status: string; basket: { items: Array<{ id: number; quantity: number }>; products_price: number; number_of_products: number } };
    };
    assert.equal(submittedData.review.submission?.status, "submitted");
    assert.equal(submittedData.result.status, "completed");
    assert.deepEqual(submittedData.result.basket.items.map(({ id, quantity }) => [id, quantity]), [[99, 2], [7, 3]]);
    assert.equal(submittedData.result.basket.products_price, 18.75);
    assert.equal(submittedData.result.basket.number_of_products, 5);
    assert.equal(providerWrites, 1);
    assert.deepEqual((await provider.getCart()).items.map(({ id, quantity }) => [id, quantity]), [[99, 2], [7, 3]], "verified provider readback preserves unrelated lines");

    const duplicate = await mcp.callTool({ name: "submit_product_review", arguments: {
      review_id: review.review_id, revision: review.revision, submission_id: prepared.submission_id,
    } });
    assert.equal(duplicate.isError, true, "the same approved submission cannot be applied twice");
    assert.equal(providerWrites, 1, "rejected duplicate makes no second provider write");
  });
});
