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

test("MCP submits one exact direct draft and never changes a saved list", async () => {
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
  const listUpdates = 0;
  const providerEvents: string[] = [];
  let submittedDraftId = "";
  let submittedContextId = "";
  let submittedItems: Array<{ product_id: number; quantity: number }> = [];
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
      throw new Error("Single-item mutations must not be used.");
    },
    addManyToCart: async (items, options) => {
      await options?.beforeDispatch?.(structuredClone(basket));
      providerEvents.push("bulk-add");
      providerWrites++;
      const additions = items.map(({ productId, quantity }) => {
        const productValue = products.get(productId);
        assert.ok(productValue, `Unexpected product mutation: ${productId}`);
        return item(
          productId,
          productValue.name!,
          quantity,
          productValue.price!,
        );
      });
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
      return structuredClone(basket);
    },
    listShoppingLists: async () => [],
    getShoppingList: async () => {
      throw new Error("Direct drafts do not read shopping lists.");
    },
    createShoppingList: async () => {
      throw new Error("Direct drafts do not create shopping lists.");
    },
    updateShoppingListProduct: async () => {
      throw new Error("Direct drafts do not edit shopping lists.");
    },
    deleteShoppingList: async () => {
      throw new Error("Direct drafts do not delete shopping lists.");
    },
    addShoppingListToCart: async () => {
      throw new Error("Direct drafts do not transfer shopping lists.");
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
      createMcpServer(provider, credentials, undefined, requestContext),
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
        assert.match(productReviewTool.description ?? "", /temporary/u);

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
        assert.equal(review.basketMode, "direct-basket");
        assert.ok(review.draftId);
        assert.ok(review.reviewContextId);
        assert.equal(listUpdates, 0, "draft creation does not write a list");
        assert.equal(providerWrites, 0, "draft creation does not write basket");

        const edited = await mcp.callTool({
          name: "update_product_review_conversation",
          arguments: {
            action: { kind: "quantity", product_id: 7, quantity: 4 },
            draft_id: review.draftId,
            review_context_id: review.reviewContextId,
          },
        });
        assert.equal(edited.isError, undefined, JSON.stringify(edited.content));
        const editedReview = (
          edited.structuredContent as { review: ProductReviewSnapshot }
        ).review;
        submittedDraftId = editedReview.draftId!;
        submittedContextId = editedReview.reviewContextId!;
        submittedItems = editedReview.items.map(({ product_id, quantity }) => ({
          product_id,
          quantity,
        }));
        assert.equal(listUpdates, 0, "draft edits do not write a list");
        const submitted = await mcp.callTool({
          name: "submit_product_review_conversation",
          arguments: {
            draft_id: editedReview.draftId,
            review_context_id: editedReview.reviewContextId,
            submission_id: randomUUID(),
            reviewed_list: {
              name: "Reviewed draft",
              items: editedReview.items.map(({ product_id, quantity }) => ({
                product_id,
                quantity,
              })),
            },
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
          "the explicit submit bulk-adds the draft once",
        );
        assert.equal(
          providerEvents.filter((event) => event === "bulk-add").length,
          1,
        );
        assert.equal(listUpdates, 0);
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
            draft_id: editedReview.draftId,
            review_context_id: editedReview.reviewContextId,
            submission_id: randomUUID(),
            reviewed_list: {
              name: "Reviewed draft",
              items: editedReview.items.map(({ product_id, quantity }) => ({
                product_id,
                quantity,
              })),
            },
          },
        });
        assert.equal(replay.isError, undefined, JSON.stringify(replay.content));
        assert.equal(
          (replay.structuredContent as { result: { replayed: boolean } }).result
            .replayed,
          true,
        );
        assert.equal(
          providerWrites,
          1,
          "a fresh ID cannot replay a direct draft submission",
        );
      },
    );
    await withMcpClient(
      createMcpServer(provider, credentials, undefined, requestContext),
      async (restarted) => {
        const reopened = await restarted.callTool({
          name: "submit_product_review_conversation",
          arguments: {
            draft_id: submittedDraftId,
            review_context_id: submittedContextId,
            submission_id: randomUUID(),
            reviewed_list: {
              name: "Reviewed draft",
              items: submittedItems,
            },
          },
        });
        assert.equal(reopened.isError, undefined);
        assert.equal(
          (reopened.structuredContent as { result: { replayed: boolean } })
            .result.replayed,
          true,
        );
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
