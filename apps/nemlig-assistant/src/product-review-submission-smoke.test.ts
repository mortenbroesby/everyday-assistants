import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type {
  Basket,
  Product,
  ShoppingClient,
  ShoppingListClient,
} from "./client.js";
import { createMcpServer } from "./mcp.js";
import type { ProductReviewSnapshot } from "./product-review.js";

const product = (id: number, name: string, price: number): Product => ({
  id,
  name,
  price,
  unit: `${price.toFixed(2)} kr/stk`,
  unitPrice: price,
  unitSize: "1 stk",
  brand: "Test",
  category: "Dagligvarer",
  subcategory: "",
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
});

const item = (id: number, name: string, quantity: number, price: number) => ({
  id,
  name,
  quantity,
  total: quantity * price,
});

const withMcpClient = async <T>(
  server: ReturnType<typeof createMcpServer>,
  action: (client: Client) => Promise<T>,
): Promise<T> => {
  const handler = createMcpHandler(() => server, { legacy: "reject" });
  const nodeHandler = toNodeHandler(handler);
  const httpServer = createServer((request, response) => {
    void nodeHandler(request, response);
  });
  httpServer.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    httpServer.once("listening", resolve);
    httpServer.once("error", reject);
  });
  const client = new Client(
    { name: "submission-smoke", version: "1.0.0" },
    {
      versionNegotiation: { mode: { pin: "2026-07-28" } },
    },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL(
      `/mcp`,
      `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`,
    ),
  );
  await client.connect(transport);
  try {
    return await action(client);
  } finally {
    await client.close();
    await handler.close();
    httpServer.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
};

// Proposal-level transfer, verified readback, cleanup and replay remain covered by proposals.test.ts.
test("MCP submission smoke saves every exact line and blocks unsafe native-list transfer", async () => {
  const chosen = product(7, "Chosen oats", 4.25);
  const unresolved = product(8, "Unresolved tea", 6.5);
  const products = new Map([
    [7, chosen],
    [8, unresolved],
  ]);
  let basket: Basket = {
    items: [item(99, "Unrelated provider item", 2, 3)],
    productsPrice: 6,
    deliveryPrice: 5,
    numberOfProducts: 2,
    deliveryTime: "Tomorrow",
  };
  let providerWrites = 0;
  const providerEvents: string[] = [];
  const shoppingLists = new Map<number, Map<number, number>>();
  const provider: ShoppingClient & ShoppingListClient = {
    providerIdentity: () => "account-1",
    isLoggedIn: () => true,
    login: async () => {},
    searchProducts: async (query) =>
      query === "oats" ? [chosen, unresolved] : [],
    getProduct: async (id) =>
      products.get(id) ?? { ...unresolved, id: undefined },
    getFreshProduct: async (id) =>
      products.get(id) ?? { ...unresolved, id: undefined },
    listFavorites: async () => [],
    listDepartments: async () => [],
    browseDepartment: async () => ({ products: [], page: 1, hasNext: false }),
    getCart: async () => {
      providerEvents.push("basket-readback");
      return structuredClone(basket);
    },
    addToCart: async () => {
      throw new Error("Direct basket writes must not be used.");
    },
    listShoppingLists: async () => [],
    createShoppingList: async () => {
      shoppingLists.set(1, new Map());
      return 1;
    },
    updateShoppingListProduct: async (listId, id, quantity) => {
      shoppingLists.get(listId)?.set(id, quantity);
    },
    getShoppingList: async (listId) => ({
      id: listId,
      name: "Nemlig Assistant Local basket",
      items: [...(shoppingLists.get(listId) ?? [])].map(
        ([productId, quantity]) => ({ productId, quantity }),
      ),
    }),
    deleteShoppingList: async (listId) => {
      providerEvents.push("delete-list");
      shoppingLists.delete(listId);
      throw new Error("Cleanup was not confirmed.");
    },
    addShoppingListToCart: async (listId) => {
      providerEvents.push("transfer");
      providerWrites++;
      const additions = [...(shoppingLists.get(listId) ?? [])].map(
        ([id, quantity]) => {
          const productValue = products.get(id);
          assert.ok(productValue, `Unexpected product mutation: ${id}`);
          return item(
            id,
            productValue.name ?? `Product ${id}`,
            quantity,
            productValue.price ?? 0,
          );
        },
      );
      basket = {
        ...basket,
        items: [...basket.items, ...additions],
        productsPrice:
          (basket.productsPrice ?? 0) +
          additions.reduce((total, line) => total + (line.total ?? 0), 0),
        numberOfProducts:
          (basket.numberOfProducts ?? 0) +
          additions.reduce((total, line) => total + (line.quantity ?? 0), 0),
      };
    },
  };
  const credentials = async () => ({
    username: "person@example.test",
    password: "test-only",
  });

  await withMcpClient(createMcpServer(provider, credentials), async (mcp) => {
    const found = await mcp.callTool({
      name: "find_groceries",
      arguments: { search_term: "oats" },
    });
    assert.equal(found.isError, undefined);
    const result = found.structuredContent as { result: Array<{ id: number }> };
    assert.deepEqual(
      result.result.map((value) => value.id),
      [7, 8],
    );
    assert.equal(providerWrites, 0, "search is read-only");

    const started = await mcp.callTool({
      name: "start_product_review",
      arguments: {
        items: [
          { product_id: 7, quantity: 3 },
          { product_id: 8, quantity: 2 },
        ],
      },
    });
    assert.equal(started.isError, undefined);
    const review = (
      started.structuredContent as { review: ProductReviewSnapshot }
    ).review;
    assert.deepEqual(
      review.items.map(({ product_id, quantity, state }) => [
        product_id,
        quantity,
        state,
      ]),
      [
        [7, 3, "ready"],
        [8, 2, "ready"],
      ],
    );
    assert.equal(
      providerWrites,
      0,
      "starting a draft does not mutate the provider basket",
    );

    const saved = await mcp.callTool({
      name: "update_product_review_conversation",
      arguments: {
        action: { kind: "save", name: "Nemlig Assistant Local basket" },
      },
    });
    assert.equal(saved.isError, undefined, JSON.stringify(saved.content));
    const savedReview = (
      saved.structuredContent as { review: ProductReviewSnapshot }
    ).review;
    assert.equal(savedReview.saveStatus, "saved");
    assert.deepEqual((await provider.getShoppingList(1)).items, [
      { productId: 7, quantity: 3 },
      { productId: 8, quantity: 2 },
    ]);
    const prepared = await mcp.callTool({
      name: "update_product_review_conversation",
      arguments: { action: { kind: "prepare_submission" } },
    });
    assert.equal(prepared.isError, true);
    assert.match(
      JSON.stringify(prepared.content),
      /cannot verify Nemlig will transfer the exact reviewed list unchanged/u,
    );
    assert.equal(
      providerWrites,
      0,
      "an unsafe native-list transfer does not mutate the provider basket",
    );
    assert.deepEqual(providerEvents, []);
  });
});
