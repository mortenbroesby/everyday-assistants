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
import { randomUUID } from "node:crypto";
import type {
  Basket,
  Product,
  ShoppingClient,
  ShoppingListClient,
} from "./client.js";
import { createMcpServer } from "./mcp.js";
import { handleLocalBasketStateRequest } from "./local-basket-callback.js";
import {
  mutateOwnerLocalBasketInventory,
  type LocalBasketInventoryStorage,
  type LocalBasketStorageAccess,
} from "./local-basket-storage.js";
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

test("MCP saves exact list rows and submits once with durable basket readback", async () => {
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
  let listUpdates = 0;
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
    listShoppingLists: async () =>
      [...shoppingLists.keys()].map((id) => ({
        id,
        name: "Nemlig Assistant Local basket",
        productCount: shoppingLists.get(id)?.size ?? 0,
      })),
    createShoppingList: async () => {
      shoppingLists.set(1, new Map());
      return 1;
    },
    updateShoppingListProduct: async (listId, id, quantity) => {
      listUpdates++;
      if (quantity === 0) {
        shoppingLists.get(listId)?.delete(id);
      } else {
        shoppingLists.get(listId)?.set(id, quantity);
      }
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
  const values = new Map<string, unknown>();
  const storage: LocalBasketInventoryStorage = {
    async get<T>(key: string) {
      return values.get(key) as T | undefined;
    },
    async put<T>(key: string, value: T) {
      values.set(key, structuredClone(value));
    },
    async delete(key: string) {
      values.delete(key);
    },
    async setAlarm() {},
    async deleteAlarm() {},
    async transaction<T>(
      action: (access: LocalBasketStorageAccess) => Promise<T>,
    ) {
      return action(storage);
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (!url.startsWith("http://local-basket-state.internal/")) {
      return originalFetch(input, init);
    }
    return handleLocalBasketStateRequest(
      new Request(input, init),
      {
        idFromName: (ownerId) => ownerId,
        get: () => ({
          mutate: (ownerId, command) =>
            mutateOwnerLocalBasketInventory(storage, ownerId, command),
        }),
      },
      async (capability) =>
        capability === "submission-smoke-capability" ? "owner" : undefined,
    );
  };
  const requestContext = {
    principalKey: "owner",
    policyRevision: "test-v1",
    localBasketCapability: "submission-smoke-capability",
  };
  try {
    await withMcpClient(
      createMcpServer(
        provider,
        credentials,
        undefined,
        undefined,
        requestContext,
      ),
      async (mcp) => {
        const found = await mcp.callTool({
          name: "find_groceries",
          arguments: { search_term: "oats" },
        });
        assert.equal(found.isError, undefined);
        const result = found.structuredContent as {
          result: Array<{ id: number }>;
        };
        assert.deepEqual(
          result.result.map((value) => value.id),
          [7, 8],
        );
        assert.equal(providerWrites, 0, "search is read-only");
        const tools = await mcp.listTools();
        const productReviewTool = tools.tools.find(
          ({ name }) => name === "start_product_review",
        );
        assert.ok(productReviewTool);
        assert.doesNotMatch(
          productReviewTool.description ?? "",
          /submission .* disabled/u,
        );
        assert.match(
          productReviewTool.description ?? "",
          /saved list.*Submit|Submit.*saved list/u,
        );

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
            draft_id: review.draftId,
          },
        });
        assert.equal(saved.isError, undefined, JSON.stringify(saved.content));
        const savedReview = (
          saved.structuredContent as { review: ProductReviewSnapshot }
        ).review;
        assert.equal(savedReview.saveStatus, "saved");
        assert.ok(savedReview.reviewContextId);
        assert.deepEqual((await provider.getShoppingList(1)).items, [
          { productId: 7, quantity: 3 },
          { productId: 8, quantity: 2 },
        ]);
        assert.equal(listUpdates, 2, "Save writes only the draft rows");
        const staged = await mcp.callTool({
          name: "update_product_review_conversation",
          arguments: {
            action: { kind: "quantity", product_id: 7, quantity: 4 },
            shopping_list_id: 1,
            review_context_id: savedReview.reviewContextId,
          },
        });
        assert.equal(staged.isError, undefined);
        assert.deepEqual((await provider.getShoppingList(1)).items, [
          { productId: 7, quantity: 3 },
          { productId: 8, quantity: 2 },
        ]);
        assert.equal(listUpdates, 2, "staging does not write the native list");
        const updated = await mcp.callTool({
          name: "update_product_review_conversation",
          arguments: {
            action: { kind: "update" },
            shopping_list_id: 1,
            review_context_id: savedReview.reviewContextId,
          },
        });
        assert.equal(
          updated.isError,
          undefined,
          JSON.stringify(updated.content),
        );
        assert.deepEqual((await provider.getShoppingList(1)).items, [
          { productId: 7, quantity: 4 },
          { productId: 8, quantity: 2 },
        ]);
        assert.equal(
          listUpdates,
          3,
          "Update writes the staged difference once",
        );
        const submitted = await mcp.callTool({
          name: "submit_product_review_conversation",
          arguments: {
            shopping_list_id: 1,
            review_context_id: savedReview.reviewContextId,
            submission_id: randomUUID(),
          },
        });
        assert.equal(
          submitted.isError,
          undefined,
          JSON.stringify(submitted.content),
        );
        assert.equal(
          providerWrites,
          1,
          "the explicit submit transfers the updated native list once",
        );
        assert.deepEqual(providerEvents, [
          "basket-readback",
          "basket-readback",
          "transfer",
          "basket-readback",
          "delete-list",
        ]);
        assert.deepEqual(await provider.listShoppingLists(), []);
        assert.deepEqual(
          basket.items.map(({ id, quantity }) => [id, quantity]),
          [
            [99, 2],
            [7, 4],
            [8, 2],
          ],
        );
        const replay = await mcp.callTool({
          name: "submit_product_review_conversation",
          arguments: {
            shopping_list_id: 1,
            submission_id: randomUUID(),
          },
        });
        assert.equal(replay.isError, true);
        assert.equal(
          providerWrites,
          1,
          "a fresh ID cannot replay the same list snapshot",
        );
      },
    );
    await withMcpClient(
      createMcpServer(
        provider,
        credentials,
        undefined,
        undefined,
        requestContext,
      ),
      async (restarted) => {
        const reopened = await restarted.callTool({
          name: "start_product_review",
          arguments: { shopping_list_id: 1 },
        });
        assert.equal(reopened.isError, undefined);
        assert.equal(
          (reopened.structuredContent as { selectedShoppingListId: null })
            .selectedShoppingListId,
          null,
          "the deleted source returns to the list picker",
        );
        const replay = await restarted.callTool({
          name: "submit_product_review_conversation",
          arguments: {
            shopping_list_id: 1,
            submission_id: randomUUID(),
          },
        });
        assert.equal(replay.isError, true);
        assert.equal(
          providerWrites,
          1,
          "a restarted service cannot replay the exact list snapshot",
        );
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
