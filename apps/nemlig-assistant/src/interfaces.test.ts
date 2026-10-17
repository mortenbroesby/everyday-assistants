import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  NemligClient,
  NemligError,
  SEARCH_GATEWAY_URL,
  type Basket,
  type Product,
  type ShoppingClient,
  type ShoppingListClient,
} from "./client.js";
import { createProgram } from "./cli.js";
import {
  createMcpServer,
  NEMLIG_CONNECT_URL,
  rankProducts,
  safeNemligImageUrl,
  serviceAcceptanceToolInventory,
} from "./mcp.js";
import {
  assertProductionInventory,
  productionToolInventory,
} from "./production-acceptance.js";
import { type ProductReviewSnapshot } from "./product-review.js";
import { handleLocalBasketStateRequest } from "./local-basket-callback.js";
import {
  mutateOwnerLocalBasketInventory,
  type LocalBasketInventoryStorage,
  type LocalBasketStorageAccess,
} from "./local-basket-storage.js";
import {
  PRODUCT_VIEWER_RESOURCE_URI,
  readProductViewerArtifact,
} from "./product-viewer.js";
import { RETIRED_PRODUCT_VIEWER_RESOURCE_URIS } from "./product-viewer-identity.js";
import { NEMLIG_CODENAME, NEMLIG_VERSION } from "./runtime.js";

const expectedProductViewerResources = [
  {
    uri: PRODUCT_VIEWER_RESOURCE_URI,
    name: "nemlig-product-viewer",
    title: "Nemlig Assistant",
    description:
      "Products and the shared Local basket supplied by Nemlig Assistant.",
    mimeType: "text/html;profile=mcp-app",
  },
  ...RETIRED_PRODUCT_VIEWER_RESOURCE_URIS.map((uri, index) => ({
    uri,
    name: `nemlig-retired-product-viewer-v${index}`,
    title: "Nemlig shopping list",
    description:
      "This older shopping-list card is unavailable and contains no shopping data.",
    mimeType: "text/html;profile=mcp-app",
  })),
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

const fakeClient = (
  overrides: Partial<ShoppingClient & ShoppingListClient> = {},
): ShoppingClient & ShoppingListClient => {
  const lists = new Map<
    number,
    {
      id: number;
      name: string;
      items: Array<{ productId: number; quantity: number }>;
    }
  >();
  let nextListId = 1000;
  return {
    isLoggedIn: () => true,
    login: async () => {},
    searchProducts: async () => [product],
    getProduct: async () => product,
    getFreshProduct: async () => product,
    listFavorites: async () => [product],
    listDepartments: async () => [{ id: "/mejeri", name: "Mejeri" }],
    browseDepartment: async () => ({
      products: [product],
      page: 1,
      hasNext: false,
    }),
    getCart: async () => basket,
    addToCart: async () => basket,
    addManyToCart: async () => basket,
    providerIdentity: () => "test-account",
    listShoppingLists: async () =>
      [...lists.values()].map(({ id, name, items }) => ({
        id,
        name,
        productCount: items.length,
      })),
    createShoppingList: async (name) => {
      const id = nextListId++;
      lists.set(id, { id, name, items: [] });
      return id;
    },
    getShoppingList: async (id) => structuredClone(lists.get(id)!),
    updateShoppingListProduct: async (id, productId, quantity) => {
      const list = lists.get(id);
      if (!list) {
        throw new Error("Missing shopping list");
      }
      list.items = list.items.filter((item) => item.productId !== productId);
      if (quantity > 0) {
        list.items.push({ productId, quantity });
      }
    },
    deleteShoppingList: async (id) => {
      lists.delete(id);
    },
    addShoppingListToCart: async () => {},
    ...overrides,
  };
};

const testCredentials = async () => ({
  username: "person@example.test",
  password: "secret",
});

test("CLI exposes only supported commands and never accepts a password option", () => {
  const help = createProgram({ client: fakeClient() }).helpInformation();
  for (const command of [
    "login",
    "logout",
    "search",
    "favorites",
    "add",
    "cart",
  ]) {
    assert.match(help, new RegExp(command));
  }
  assert.doesNotMatch(help, /\bremove\b/u);
  assert.doesNotMatch(help, /plan_my_shopping|\bplan\b/u);
  for (const forbidden of [
    "feature-request",
    "parse",
    "checkout",
    "--password",
  ]) {
    assert.doesNotMatch(help, new RegExp(forbidden));
  }
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
  await createProgram({
    client,
    out: (message) => output.push(message),
  }).parseAsync(["node", "nemlig", "favorites", "--limit", "1"]);
  assert.equal(requestedLimit, 1);
  assert.match(output.join("\n"), /Økologisk mælk/);
  assert.match(output.join("\n"), /7/);
});

test("CLI search and favorites preserve product list output and empty messages", async () => {
  const secondProduct: Product = {
    ...product,
    id: 8,
    name: "Bananer",
    price: 9,
    unitSize: "1 kg",
    available: false,
    brand: "",
    category: "",
    isRefrigerated: false,
    isOrganic: false,
    isDairy: false,
  };
  const expectedList = [
    "ID       Name                          Price    Size       Status",
    "7        Økologisk mælk                12.50    1 liter    ✓ In Stock",
    "         Test | Køl | [Køl] | [Øko] | [Dairy]",
    "8        Bananer                       9.00     1 kg       ✗ Sold Out",
  ].join("\n");
  const run = async (command: "search" | "favorites", products: Product[]) => {
    const output: string[] = [];
    const client = fakeClient({
      searchProducts: async () => products,
      listFavorites: async () => products,
    });
    await createProgram({
      client,
      out: (message) => output.push(message),
    }).parseAsync(
      command === "search"
        ? ["node", "nemlig", command, "mælk"]
        : ["node", "nemlig", command],
    );
    return output;
  };

  assert.deepEqual(await run("search", [product, secondProduct]), [
    expectedList,
  ]);
  assert.deepEqual(await run("favorites", [product, secondProduct]), [
    expectedList,
  ]);
  assert.deepEqual(await run("search", []), ["No products found."]);
  assert.deepEqual(await run("favorites", []), ["No favorites found."]);
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
  await createProgram({
    client,
    out: (message) => output.push(message),
  }).parseAsync(["node", "nemlig", "favorites", "BANAN", "--limit", "1"]);
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
  await createProgram({
    client,
    out: (message) => output.push(message),
  }).parseAsync(["node", "nemlig", "add", "7", "--quantity", "2"]);
  assert.deepEqual(received, [7, 2]);
  assert.match(output.join("\n"), /SHOPPING BASKET/);
  assert.match(output.join("\n"), /Total: 17\.50 DKK/);
});

test("CLI add-many routes all exact lines through one client call", async () => {
  const output: string[] = [];
  let received: Array<{ productId: number; quantity: number }> | undefined;
  const client = fakeClient({
    addManyToCart: async (additions) => {
      received = additions;
      return basket;
    },
  });
  await createProgram({
    client,
    out: (message) => output.push(message),
  }).parseAsync(["node", "nemlig", "add-many", "7:2", "8:1"]);
  assert.deepEqual(received, [
    { productId: 7, quantity: 2 },
    { productId: 8, quantity: 1 },
  ]);
  assert.match(output.join("\n"), /2 products in one request/);
});

test("CLI login saves only when requested and uses the masked prompt seam", async () => {
  const saved: string[] = [];
  let prompted = false;
  await createProgram({
    client: fakeClient({ isLoggedIn: () => false }),
    credentials: async () => undefined,
    prompt: async (username) => {
      prompted = true;
      return {
        username: username ?? "person@example.test",
        password: "private",
      };
    },
    save: async (credentials) => {
      saved.push(credentials.username);
    },
    out: () => {},
  }).parseAsync([
    "node",
    "nemlig",
    "login",
    "--username",
    "person@example.test",
    "--save",
  ]);
  assert.equal(prompted, true);
  assert.deepEqual(saved, ["person@example.test"]);
});

test("retired CLI feature request is rejected without a side effect", async () => {
  const client = fakeClient({
    getCart: async () => {
      throw new Error("unexpected basket read");
    },
    addToCart: async () => {
      throw new Error("unexpected basket mutation");
    },
  });
  const program = createProgram({
    client,
    out: () => {},
  }).exitOverride();
  await assert.rejects(
    program.parseAsync([
      "node",
      "nemlig",
      "feature-request",
      "Prefer discounted favorites",
      "--summary",
      "Choose discounted favorites first.",
    ]),
    /unknown command|feature-request/iu,
  );
});

const withMcpClient = async <T>(
  server: ReturnType<typeof createMcpServer>,
  action: (client: Client) => Promise<T>,
  capabilities?: { elicitation?: { url?: Record<string, never> } },
): Promise<T> => {
  const handler = createMcpHandler(() => server, { legacy: "reject" });
  const nodeHandler = toNodeHandler(handler);
  const httpServer = createServer((req, res) => {
    void nodeHandler(req, res);
  });
  httpServer.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    httpServer.once("listening", resolve);
    httpServer.once("error", reject);
  });
  const endpoint = new URL(
    `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/mcp`,
  );
  const client = new Client(
    { name: "test", version: "1.0.0" },
    {
      versionNegotiation: { mode: { pin: "2026-07-28" } },
      ...(capabilities ? { capabilities } : {}),
    },
  );
  const transport = new StreamableHTTPClientTransport(endpoint);
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

const toolText = (result: unknown): string =>
  (
    (result as { content?: unknown })?.content as
      Array<{ type?: string; text?: string }> | undefined
  )?.find(({ type }) => type === "text")?.text ?? "";

const friendlyCatalog = [
  ["check_nemlig_connection", "Check my Nemlig connection", true, false, []],
  [
    "find_groceries",
    "Search Nemlig products",
    true,
    false,
    ["search_term", "result_count"],
  ],
  ["get_profile", "Get my Nemlig profile", true, false, []],
  ["show_my_basket", "Show my Nemlig basket", true, false, []],
  [
    "start_product_review",
    "Review products before a basket addition",
    false,
    false,
    ["items", "shopping_list_id", "shopping_list_name", "creation_id"],
  ],
  [
    "submit_product_review_conversation",
    "Submit the reviewed products to Nemlig",
    false,
    false,
    [
      "draft_id",
      "shopping_list_id",
      "submission_id",
      "reviewed_list",
      "review_context_id",
    ],
  ],
  [
    "update_product_review_conversation",
    "Edit the temporary basket draft",
    false,
    false,
    ["action", "draft_id", "shopping_list_id", "review_context_id"],
  ],
] as const;

const formerToolNames = [
  "search_products",
  "list_favorites",
  "plan_shopping_list",
  "list_departments",
  "browse_department",
  "save_shopping_plan",
  "load_shopping_plan",
  "create_feature_request",
  "view_cart",
  "prepare_cart_additions",
  "apply_cart_additions",
  "prepare_cart_removal",
  "apply_cart_removal",
  "prepare_cart_replacement",
  "apply_cart_replacement",
  "prepare_cart_clear",
  "apply_cart_clear",
  "pick_products",
  "suggest_an_improvement",
  "choose_products_visually",
  "show_my_basket_visually",
  "review_items_to_add",
  "add_approved_items",
  "reconnect_nemlig_assistant",
  "get_grocery_details",
  "show_my_favorites",
  "show_grocery_sections",
  "browse_grocery_section",
  "save_my_shopping_plan",
  "continue_my_shopping_plan",
  "show_my_shopping_lists",
  "save_my_shopping_list",
  "copy_my_shopping_list",
  "set_my_shopping_list_status",
  "shop_from_my_list",
  "migrate_my_saved_plan",
] as const;

test("product tags retain only positively supported organic facts", () => {
  const ranked = rankProducts(
    [
      { ...product, id: 1, price: 20, name: "Frossen mælk", isFrozen: true },
      {
        ...product,
        id: 2,
        price: 12,
        name: "Frisk mælk",
        isOrganic: false,
        labels: [],
      },
      { ...product, id: 3, price: 5, name: "Udsolgt mælk", available: false },
    ],
    "mælk",
  );
  assert.deepEqual(ranked.find((item) => item.id === 2)?.tags, []);
  assert.deepEqual(ranked.find((item) => item.id === 1)?.tags, ["organic"]);
  assert.deepEqual(ranked.find((item) => item.id === 3)?.tags, ["organic"]);
  assert.deepEqual(rankProducts([], "mælk"), []);
});

test("profile exposes the live runtime release without provider access", async () => {
  let providerCalls = 0;
  const client = fakeClient({
    isLoggedIn: () => {
      providerCalls += 1;
      return true;
    },
    login: async () => {
      providerCalls += 1;
    },
    getCart: async () => {
      providerCalls += 1;
      return basket;
    },
  });
  await withMcpClient(
    createMcpServer(client, testCredentials, undefined, {
      principalKey: "auth0|profile-owner",
      policyRevision: "test-v1",
    }),
    async (mcp) => {
      const tool = (await mcp.listTools()).tools.find(
        ({ name }) => name === "get_profile",
      );
      assert.deepEqual(tool?._meta, {
        "openai/profile": true,
        securitySchemes: [{ type: "oauth2", scopes: ["use:nemlig-assistant"] }],
      });
      const result = await mcp.callTool({ name: "get_profile", arguments: {} });
      assert.equal(result.isError, undefined);
      assert.deepEqual(result.structuredContent, {
        id: "auth0|profile-owner",
        release: { version: NEMLIG_VERSION, codename: NEMLIG_CODENAME },
      });
    },
  );
  assert.equal(providerCalls, 0);
});

test("direct draft catalog exposes its input contract and loading status", async () => {
  await withMcpClient(
    createMcpServer(fakeClient(), testCredentials),
    async (mcp) => {
      const tool = (await mcp.listTools()).tools.find(
        ({ name }) => name === "start_product_review",
      );
      assert.ok(tool);
      assert.deepEqual(tool.inputSchema.anyOf, [
        {
          required: ["items"],
          not: {
            anyOf: [
              { required: ["shopping_list_id"] },
              { required: ["creation_id"] },
            ],
          },
        },
        {
          required: ["shopping_list_id"],
          not: {
            anyOf: [{ required: ["items"] }, { required: ["creation_id"] }],
          },
        },
        {
          not: {
            anyOf: [
              { required: ["items"] },
              { required: ["shopping_list_id"] },
              { required: ["creation_id"] },
            ],
          },
        },
      ]);
      assert.match(tool.description ?? "", /temporary process-local draft/u);
      assert.doesNotMatch(tool.description ?? "", /creation_id UUID/u);
      assert.equal(
        tool._meta?.["openai/toolInvocation/invoking"],
        "Preparing your Nemlig basket draft…",
      );
      assert.equal(
        tool._meta?.["openai/toolInvocation/invoked"],
        "Draft ready for review",
      );
      const tools = (await mcp.listTools()).tools;
      const modelTools = tools.filter((candidate) =>
        (
          candidate._meta?.ui as { visibility?: string[] } | undefined
        )?.visibility?.includes("model"),
      );
      const appTools = tools.filter((candidate) =>
        (
          candidate._meta?.ui as { visibility?: string[] } | undefined
        )?.visibility?.includes("app"),
      );
      assert.deepEqual(appTools.map(({ name }) => name).sort(), [
        "save_basket_as_shopping_list",
        "submit_product_review",
        "update_product_review",
      ]);
      assert.equal(
        modelTools.some(({ name }) => name === "save_basket_as_shopping_list"),
        false,
      );
      const update = modelTools.find(
        ({ name }) => name === "update_product_review_conversation",
      );
      const submit = modelTools.find(
        ({ name }) => name === "submit_product_review_conversation",
      );
      assert.ok(update);
      assert.ok(submit);
      const updateProperties = update.inputSchema.properties as Record<
        string,
        { description?: string }
      >;
      const submitProperties = submit.inputSchema.properties as Record<
        string,
        { description?: string }
      >;
      assert.match(
        updateProperties.review_context_id.description ?? "",
        /draft review/u,
      );
      assert.match(
        submitProperties.reviewed_list.description ?? "",
        /product IDs and quantities/u,
      );
      assert.doesNotMatch(
        modelTools.map(({ description }) => description).join("\n"),
        /load_saved_shopping_list|automatically saved shopping list/iu,
      );
    },
  );
});

test("MCP exposes the complete friendly catalog and clean missing-credential errors", async () => {
  const client = fakeClient({ isLoggedIn: () => false });
  await withMcpClient(
    createMcpServer(client, async () => undefined),
    async (mcp) => {
      const tools = (await mcp.listTools()).tools
        .filter((tool) => {
          const visibility = (
            tool._meta?.ui as { visibility?: string[] } | undefined
          )?.visibility;
          return !visibility || visibility.includes("model");
        })
        .sort((left, right) => left.name.localeCompare(right.name));
      assert.deepEqual(
        tools.map(({ name }) => name),
        friendlyCatalog.map(([name]) => name),
      );
      for (const [
        name,
        title,
        readOnlyHint,
        destructiveHint,
        inputs,
      ] of friendlyCatalog) {
        const tool = tools.find((candidate) => candidate.name === name);
        assert.ok(tool, `${name} is missing`);
        assert.equal(tool.title, title, name);
        assert.ok(tool.description, `${name} needs a description`);
        assert.deepEqual(
          tool.annotations,
          {
            readOnlyHint,
            destructiveHint,
            ...(name === "start_product_review" ||
            name === "update_product_review_conversation"
              ? { idempotentHint: false }
              : {}),
            openWorldHint: name !== "get_profile",
          },
          name,
        );
        assert.deepEqual(
          tool._meta?.securitySchemes,
          [{ type: "oauth2", scopes: ["use:nemlig-assistant"] }],
          name,
        );
        const properties =
          (
            tool.inputSchema as {
              properties?: Record<string, { description?: string }>;
            }
          ).properties ?? {};
        assert.deepEqual(
          Object.keys(properties).sort(),
          [...inputs].sort(),
          `${name} inputs drifted`,
        );
        for (const input of inputs) {
          assert.ok(
            properties[input]?.description,
            `${name}.${input} needs plain-language guidance`,
          );
        }
      }
      // Tool descriptions must explain protocol formats; user-facing titles need not.
      assert.doesNotMatch(
        tools.map(({ title }) => title).join("\n"),
        /\buuid\b/iu,
      );
      const catalogText = tools
        .flatMap(({ name, title, description, inputSchema }) => {
          const properties =
            (
              inputSchema as {
                properties?: Record<string, { description?: string }>;
              }
            ).properties ?? {};
          return [
            name,
            title,
            description,
            ...Object.entries(properties).flatMap(([input, schema]) => [
              input,
              schema.description,
            ]),
          ];
        })
        .join("\n");
      for (const name of formerToolNames) {
        assert.equal(
          tools.some((tool) => tool.name === name),
          false,
          name,
        );
      }
      assert.doesNotMatch(
        catalogText,
        /\b(?:immutable snapshot|department_id|internal status)\b/iu,
      );
      assert.equal(
        tools.some((tool) =>
          /recipe|checkout|order|pay|purchase/iu.test(tool.name),
        ),
        false,
      );
      const result = await mcp.callTool({
        name: "show_my_basket",
        arguments: {},
      });
      assert.equal(result.isError, true);
      const content = result.content as Array<{ type: string; text?: string }>;
      assert.match(content[0]?.text ?? "", /credentials configured/);
    },
  );
});

test("direct basket mode routes selection and abandon without shopping-list calls", async () => {
  let listCalls = 0;
  let mutations = 0;
  const provider = fakeClient({
    listShoppingLists: async () => {
      listCalls++;
      throw new Error("direct mode must not list shopping lists");
    },
    createShoppingList: async () => {
      listCalls++;
      throw new Error("direct mode must not create shopping lists");
    },
    updateShoppingListProduct: async () => {
      listCalls++;
      throw new Error("direct mode must not edit shopping lists");
    },
    deleteShoppingList: async () => {
      listCalls++;
      throw new Error("direct mode must not delete shopping lists");
    },
    addManyToCart: async () => {
      mutations++;
      throw new Error("selection and abandon must not mutate basket");
    },
  });
  await withMcpClient(
    createMcpServer(provider, testCredentials),
    async (mcp) => {
      const started = await mcp.callTool({
        name: "start_product_review",
        arguments: {
          items: [{ product_id: 7, quantity: 2 }],
        },
      });
      assert.equal(started.isError, undefined, toolText(started));
      const review = (
        started.structuredContent as {
          review: ProductReviewSnapshot;
        }
      ).review;
      assert.equal(review.basketMode, "direct-basket");
      assert.ok(review.draftId);
      assert.ok(review.reviewContextId);
      const staleContext = await mcp.callTool({
        name: "update_product_review_conversation",
        arguments: {
          draft_id: review.draftId,
          review_context_id: randomUUID(),
          action: { kind: "show" },
        },
      });
      assert.equal(staleContext.isError, true);
      assert.equal(listCalls, 0);
      assert.equal(mutations, 0);
      const abandoned = await mcp.callTool({
        name: "update_product_review",
        arguments: {
          draft_id: review.draftId,
          review_context_id: review.reviewContextId,
          action: { kind: "abandon_draft" },
        },
      });
      assert.equal(abandoned.isError, undefined, toolText(abandoned));
      assert.deepEqual(abandoned.structuredContent, { ended: true });
      const lost = await mcp.callTool({
        name: "start_product_review",
        arguments: { items: [{ product_id: 8, quantity: 1 }] },
      });
      assert.equal(lost.isError, undefined, toolText(lost));
      const lostDraft = (
        lost.structuredContent as { review: ProductReviewSnapshot }
      ).review;
      await withMcpClient(
        createMcpServer(provider, testCredentials),
        async (restarted) => {
          const stale = await restarted.callTool({
            name: "update_product_review_conversation",
            arguments: {
              draft_id: lostDraft.draftId,
              review_context_id: lostDraft.reviewContextId,
              action: { kind: "show" },
            },
          });
          assert.equal(stale.isError, true);
        },
      );
    },
  );
  assert.equal(listCalls, 0);
  assert.equal(mutations, 0);
});

test("production MCP inventory is exact", async () => {
  const expected = Object.values(productionToolInventory).flat().sort();
  await withMcpClient(
    createMcpServer(fakeClient(), testCredentials, process.env, {
      principalKey: "production-inventory-test",
      policyRevision: "test",
      localBasketCapability: "test-capability",
    }),
    async (mcp) => {
      const tools = (await mcp.listTools()).tools;
      assert.deepEqual(tools.map((tool) => tool.name).sort(), expected);
      const resources = (await mcp.listResources()).resources;
      assertProductionInventory(tools, resources);
    },
  );
});

test("retired MCP calls reject before the Nemlig client", async () => {
  let calls = 0;
  const unexpected = async (): Promise<never> => {
    calls += 1;
    throw new Error("unexpected Nemlig call");
  };
  const client = fakeClient({
    isLoggedIn: () => {
      calls += 1;
      return true;
    },
    login: unexpected,
    searchProducts: unexpected,
    getProduct: unexpected,
    getFreshProduct: unexpected,
    listFavorites: unexpected,
    listDepartments: unexpected,
    browseDepartment: unexpected,
    getCart: unexpected,
    addToCart: unexpected,
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    for (const name of formerToolNames) {
      await assert.rejects(
        mcp.callTool({ name, arguments: {} }),
        /not found/iu,
        name,
      );
    }
  });
  assert.equal(calls, 0);
});

test("service acceptance exposes only its fixed read-only tool inventory", async () => {
  assert.equal(
    (serviceAcceptanceToolInventory as readonly string[]).includes(
      "show_my_basket",
    ),
    true,
  );
  assert.equal(
    (serviceAcceptanceToolInventory as readonly string[]).includes(
      "choose_products_visually",
    ),
    false,
  );
  let calls = 0;
  const unexpected = async (): Promise<never> => {
    calls += 1;
    throw new Error("unexpected Nemlig call");
  };
  const client = fakeClient({
    isLoggedIn: () => {
      calls += 1;
      return true;
    },
    login: unexpected,
    searchProducts: unexpected,
    getProduct: unexpected,
    getFreshProduct: unexpected,
    listFavorites: unexpected,
    listDepartments: unexpected,
    browseDepartment: unexpected,
    getCart: unexpected,
    addToCart: unexpected,
  });
  for (const expectedVariant of [
    serviceAcceptanceToolInventory,
    serviceAcceptanceToolInventory,
  ] as const) {
    await withMcpClient(
      createMcpServer(client, testCredentials, undefined, {
        principalKey: "s".repeat(32),
        policyRevision: "service",
        kind: "service",
      }),
      async (mcp) => {
        const expected = expectedVariant;
        assert.deepEqual(
          (await mcp.listTools()).tools.map(({ name }) => name).sort(),
          [...expected].sort(),
        );
        assert.deepEqual(
          (await mcp.listResources()).resources,
          expectedProductViewerResources,
        );
        await assert.rejects(
          mcp.readResource({ uri: "ui://nemlig/product-viewer-v-old.html" }),
          /resource/iu,
        );
        await assert.rejects(
          mcp.callTool({
            name: "add_approved_items",
            arguments: {
              approved_review: "00000000-0000-4000-8000-000000000000",
            },
          }),
          /not found/iu,
        );
      },
    );
  }
  assert.equal(calls, 0);
});

test("MCP hides generic provider failure details", async () => {
  const providerSecret = "provider-secret-should-not-reach-mcp";
  await withMcpClient(
    createMcpServer(
      fakeClient({
        searchProducts: async () => {
          throw new Error(providerSecret);
        },
      }),
      testCredentials,
    ),
    async (mcp) => {
      const result = await mcp.callTool({
        name: "find_groceries",
        arguments: { search_term: "mælk", result_count: 1 },
      });
      assert.equal(result.isError, true);
      assert.equal(toolText(result), "find_groceries failed.");
      assert.doesNotMatch(toolText(result), new RegExp(providerSecret));
    },
  );
});

test("connection guidance uses URL elicitation only when explicitly supported", async () => {
  await withMcpClient(
    createMcpServer(fakeClient(), async () => undefined),
    async (mcp) => {
      const result = await mcp.callTool({
        name: "check_nemlig_connection",
        arguments: {},
      });
      assert.deepEqual(
        result.structuredContent,
        { status: "connection_required", connection_url: NEMLIG_CONNECT_URL },
        JSON.stringify(result),
      );
    },
  );

  let elicitation: unknown;
  await withMcpClient(
    createMcpServer(fakeClient(), async () => undefined),
    async (client) => {
      client.setRequestHandler("elicitation/create", async (request) => {
        elicitation = request.params;
        return { action: "accept" };
      });
      const result = await client.callTool({
        name: "check_nemlig_connection",
        arguments: {},
      });
      assert.deepEqual(
        result.structuredContent,
        { status: "connection_required", connection_url: NEMLIG_CONNECT_URL },
        JSON.stringify(result),
      );
      assert.deepEqual(elicitation, {
        mode: "url",
        message:
          "Open the secure Nemlig connection page. Do not enter your password in chat.",
        url: NEMLIG_CONNECT_URL,
      });
    },
    { elicitation: { url: {} } },
  );
});

test("connection status verifies Nemlig and does not trust OAuth context alone", async () => {
  const client = fakeClient({
    getCart: async () => {
      throw new NemligError("Nemlig unavailable");
    },
  });
  await withMcpClient(
    createMcpServer(client, testCredentials, undefined, {
      principalKey: "p".repeat(32),
      policyRevision: "test",
    }),
    async (mcp) => {
      const result = await mcp.callTool({
        name: "check_nemlig_connection",
        arguments: {},
      });
      assert.deepEqual(result.structuredContent, {
        status: "provider_unavailable",
        connection_url: NEMLIG_CONNECT_URL,
      });
    },
  );

  await withMcpClient(
    createMcpServer(fakeClient(), async () => ({
      username: "owner@example.test",
      password: "secret",
    })),
    async (mcp) => {
      const result = await mcp.callTool({
        name: "check_nemlig_connection",
        arguments: {},
      });
      assert.deepEqual(result.structuredContent, {
        status: "connected",
        connection_url: NEMLIG_CONNECT_URL,
      });
    },
  );
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
      if (calls === 1) {
        throw new NemligError("Search failed", 401);
      }
      return [product];
    },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const result = await mcp.callTool({
      name: "find_groceries",
      arguments: { search_term: "mælk", result_count: 1 },
    });
    assert.notEqual(result.isError, true, toolText(result));
    const returned = (
      result.structuredContent as { result: Array<{ id: number }> }
    ).result;
    assert.deepEqual(
      returned.map(({ id }) => id),
      [7],
    );
  });
  assert.equal(calls, 2);
  assert.equal(logins, 1);
});

test("MCP distinguishes a successful empty salmiak search from an upstream HTTP 500", async () => {
  const callSearch = async (status: number) => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      calls.push(url.href);
      const json = (value: unknown, responseStatus = 200) =>
        new Response(JSON.stringify(value), {
          status: responseStatus,
          headers: { "content-type": "application/json" },
        });
      if (url.pathname.endsWith("/AntiForgery")) {
        const headers = new Headers({ "content-type": "application/json" });
        headers.append("set-cookie", "XSRF-TOKEN=fixture-xsrf; Path=/; Secure");
        headers.append(
          "set-cookie",
          "XSRF-COOKIE-TOKEN=fixture-cookie; Path=/; Secure",
        );
        return new Response(
          JSON.stringify({ Header: "X-XSRF-TOKEN", Value: "fixture-xsrf" }),
          { headers },
        );
      }
      if (url.pathname.endsWith("/login")) {
        return json({ RedirectUrl: "/" });
      }
      if (url.pathname.endsWith("/Token")) {
        return json({ access_token: "fixture-token" });
      }
      if (url.pathname.endsWith("/v2/AppSettings/Website")) {
        return json({
          CombinedProductsAndSitecoreTimestamp: "fixture-products",
          SitecorePublishedStamp: "fixture-site",
        });
      }
      if (url.pathname.endsWith("/user/GetCurrentUser")) {
        return json({ DebitorId: 42 });
      }
      if (url.pathname.endsWith("/Order/DeliverySpot")) {
        return json({
          TimeslotUtc: "2026092915-60-240",
          TimeslotId: 7,
          DeliveryZoneId: 9,
        });
      }
      if (url.origin + url.pathname === `${SEARCH_GATEWAY_URL}/search`) {
        assert.equal(url.searchParams.get("query"), "salmiak");
        return json({}, status);
      }
      if (url.origin + url.pathname === `${SEARCH_GATEWAY_URL}/quick`) {
        return json({ Categories: [] });
      }
      throw new Error(`Unexpected fixture request: ${url.pathname}`);
    };
    return withMcpClient(
      createMcpServer(new NemligClient(fetcher), testCredentials),
      async (mcp) => {
        const tool = (await mcp.listTools()).tools.find(
          (item) => item.name === "find_groceries",
        );
        assert.match(
          tool?.description ?? "",
          /not tied to the current temporary draft or an alternative target/u,
        );
        return {
          result: await mcp.callTool({
            name: "find_groceries",
            arguments: { search_term: "salmiak" },
          }),
          calls,
        };
      },
    );
  };

  const empty = await callSearch(200);
  assert.equal(empty.result.isError, undefined, toolText(empty.result));
  assert.deepEqual(
    (empty.result.structuredContent as { result: unknown[] }).result,
    [],
  );
  assert.match(toolText(empty.result), /No products found/u);
  assert.equal(empty.calls.filter((url) => url.includes("/search?")).length, 1);
  assert.equal(empty.calls.filter((url) => url.includes("/quick?")).length, 1);

  const failed = await callSearch(500);
  assert.equal(failed.result.isError, true);
  assert.equal(toolText(failed.result), "Search products failed (HTTP 500).");
  assert.equal(
    failed.calls.filter((url) => url.includes("/search?")).length,
    1,
  );
  assert.equal(
    failed.calls.filter((url) => url.includes("/quick?")).length,
    0,
    "a primary HTTP failure is not retried as a different search or converted to empty",
  );
});

test("every MCP tool has complete schemas, accurate annotations, and safe server instructions", async () => {
  await withMcpClient(
    createMcpServer(fakeClient(), testCredentials),
    async (mcp) => {
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
        "check_nemlig_connection",
        "show_my_basket",
      ]) {
        assert.equal(byName.get(name)?.annotations?.readOnlyHint, true, name);
        assert.equal(
          byName.get(name)?.annotations?.destructiveHint,
          false,
          name,
        );
      }
      for (const name of [
        "start_product_review",
        "update_product_review_conversation",
        "submit_product_review_conversation",
      ]) {
        assert.equal(byName.get(name)?.annotations?.readOnlyHint, false, name);
        assert.equal(
          byName.get(name)?.annotations?.destructiveHint,
          false,
          name,
        );
      }
      assert.match(
        mcp.getInstructions() ?? "",
        /^Search Nemlig products with find_groceries/u,
      );
      assert.equal(
        (mcp.getInstructions() ?? "").includes("Current release:"),
        false,
      );
      assert.equal(
        (mcp.getInstructions() ?? "").includes(NEMLIG_VERSION),
        false,
      );
      assert.equal(
        (mcp.getInstructions() ?? "").includes(NEMLIG_CODENAME),
        false,
      );
      assert.match(
        mcp.getInstructions() ?? "",
        /The actual Nemlig basket is add-only/u,
      );
      assert.match(mcp.getInstructions() ?? "", /Edits affect only the draft/u);
      assert.match(
        mcp.getInstructions() ?? "",
        /When users choose exact products and quantities.*temporary process-local draft/u,
      );
      assert.match(
        mcp.getInstructions() ?? "",
        /Saved Nemlig shopping lists are read-only sources/u,
      );
      assert.doesNotMatch(
        JSON.stringify({ tools, instructions: mcp.getInstructions() }),
        /password|cookie|bearer|access[_-]?token|api[_-]?key|session[_-]?id/iu,
      );
    },
  );
});

test("authenticated HTTP request context preserves stdio tool and resource metadata", async () => {
  await withMcpClient(
    createMcpServer(fakeClient(), testCredentials),
    async (stdio) => {
      await withMcpClient(
        createMcpServer(fakeClient(), testCredentials, undefined, {
          principalKey: "auth0|owner",
          policyRevision: "test-v1",
        }),
        async (http) => {
          const stdioTools = await stdio.listTools();
          const httpTools = await http.listTools();
          assert.deepEqual(
            httpTools.tools.map(({ name }) => name),
            stdioTools.tools.map(({ name }) => name),
          );
          const stdioStart = stdioTools.tools.find(
            ({ name }) => name === "start_product_review",
          );
          const httpStart = httpTools.tools.find(
            ({ name }) => name === "start_product_review",
          );
          assert.equal(
            (stdioStart?._meta as { ui?: { resourceUri?: string } } | undefined)
              ?.ui?.resourceUri,
            undefined,
          );
          assert.equal(
            (httpStart?._meta as { ui?: { resourceUri?: string } } | undefined)
              ?.ui?.resourceUri,
            PRODUCT_VIEWER_RESOURCE_URI,
          );
          const expectedResources = expectedProductViewerResources;
          assert.deepEqual(
            (await stdio.listResources()).resources,
            expectedResources,
          );
          assert.deepEqual(
            (await http.listResources()).resources,
            expectedResources,
          );
          assert.equal(http.getInstructions(), stdio.getInstructions());
        },
      );
    },
  );
});

test("MCP distinguishes the Local basket from the actual Nemlig basket", async () => {
  await withMcpClient(
    createMcpServer(fakeClient(), testCredentials),
    async (mcp) => {
      const tools = new Map(
        (await mcp.listTools()).tools.map((tool) => [
          tool.name,
          tool.description ?? "",
        ]),
      );
      const instructions = mcp.getInstructions() ?? "";
      assert.match(
        instructions,
        /Saved Nemlig shopping lists are read-only sources/u,
      );
      assert.match(instructions, /temporary process-local draft/u);
      assert.match(instructions, /The actual Nemlig basket is add-only/u);
      assert.match(
        instructions,
        /Never remove, decrease, replace, swap, clear, check out, pay, order/u,
      );
      assert.match(
        instructions,
        /Only explicit Submit may add products to the actual basket/u,
      );
      assert.match(
        tools.get("find_groceries") ?? "",
        /current Nemlig catalogue independently/u,
      );
      assert.match(tools.get("show_my_basket") ?? "", /actual Nemlig basket/u);
      assert.match(
        tools.get("start_product_review") ?? "",
        /temporary process-local draft/u,
      );
      assert.match(
        tools.get("update_product_review_conversation") ?? "",
        /Update the exact temporary draft/u,
      );
      assert.match(
        tools.get("submit_product_review_conversation") ?? "",
        /After explicit user authorization, add all exact reviewed draft quantities in one request/u,
      );
      assert.equal(
        (await mcp.listResources()).resources[0]?.uri,
        PRODUCT_VIEWER_RESOURCE_URI,
      );
      const viewer = await mcp.readResource({
        uri: PRODUCT_VIEWER_RESOURCE_URI,
      });
      assert.equal(viewer.contents[0]?.mimeType, "text/html;profile=mcp-app");
      assert.ok(viewer.contents[0] && "text" in viewer.contents[0]);
      if (viewer.contents[0] && "text" in viewer.contents[0]) {
        assert.match(viewer.contents[0].text, /nemlig-viewer-shell/u);
        assert.equal(viewer.contents[0].text, readProductViewerArtifact().html);
      }
      for (const uri of RETIRED_PRODUCT_VIEWER_RESOURCE_URIS) {
        const retiredViewer = await mcp.readResource({ uri });
        assert.equal(
          retiredViewer.contents[0]?.mimeType,
          "text/html;profile=mcp-app",
          uri,
        );
        assert.ok(
          retiredViewer.contents[0] && "text" in retiredViewer.contents[0],
          uri,
        );
        if (retiredViewer.contents[0] && "text" in retiredViewer.contents[0]) {
          assert.match(retiredViewer.contents[0].text, /read-only/u, uri);
          assert.doesNotMatch(
            retiredViewer.contents[0].text,
            /<button|tools\/call|callTool|fetch\(/iu,
            uri,
          );
        }
      }
      assert.match(
        JSON.stringify(
          (await mcp.listTools()).tools.find(
            (tool) => tool.name === "find_groceries",
          )?.inputSchema,
        ),
        /concise Danish catalogue phrase/u,
      );
    },
  );
});

test("visual product discovery routes exact fixture results into the local selection viewer", async () => {
  const fixtureProducts = [
    {
      ...product,
      id: 401,
      name: "Conference pear",
      isDairy: false,
      isRefrigerated: false,
    },
    {
      ...product,
      id: 402,
      name: "Organic banana",
      isDairy: false,
      isRefrigerated: false,
    },
  ];
  let searchCalls = 0;
  let startCalls = 0;
  let basketReads = 0;
  let basketWrites = 0;
  const provider = fakeClient({
    searchProducts: async (query) => {
      searchCalls++;
      assert.equal(query, "pear and banana");
      return fixtureProducts;
    },
    getProduct: async (id) =>
      fixtureProducts.find(({ id: candidateId }) => candidateId === id) ??
      fixtureProducts[0],
    getCart: async () => {
      basketReads++;
      throw new Error("visual selection must not read the actual basket");
    },
    addToCart: async () => {
      basketWrites++;
      throw new Error("visual selection must not write to the actual basket");
    },
  });

  await withMcpClient(
    createMcpServer(provider, testCredentials),
    async (mcp) => {
      const originalCallTool = mcp.callTool.bind(mcp);
      mcp.callTool = async (params, options) => {
        if (params.name === "start_product_review") {
          startCalls++;
        }
        return originalCallTool(params, options);
      };
      const found = await mcp.callTool({
        name: "find_groceries",
        arguments: { search_term: "pear and banana" },
      });
      assert.equal(found.isError, undefined, toolText(found));
      const ids = (
        found.structuredContent as { result: Array<{ id: number }> }
      ).result.map(({ id }) => id);
      assert.deepEqual(ids, [401, 402]);
      const searchTool = (await mcp.listTools()).tools.find(
        ({ name }) => name === "find_groceries",
      );
      const startTool = (await mcp.listTools()).tools.find(
        ({ name }) => name === "start_product_review",
      );
      assert.equal(
        (searchTool?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui
          ?.resourceUri,
        undefined,
      );
      assert.equal(
        (startTool?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui
          ?.resourceUri,
        undefined,
      );
      assert.deepEqual(
        (startTool?._meta as { ui?: { visibility?: string[] } } | undefined)?.ui
          ?.visibility,
        ["model"],
      );

      const started = await mcp.callTool({
        name: "start_product_review",
        arguments: {
          items: ids.map((product_id) => ({ product_id, quantity: 1 })),
        },
      });
      assert.equal(started.isError, undefined, toolText(started));
      const initial = (
        started.structuredContent as { review: ProductReviewSnapshot }
      ).review;
      assert.deepEqual(
        initial.items.map(({ product_id, state }) => [product_id, state]),
        [
          [401, "ready"],
          [402, "ready"],
        ],
      );
      assert.match(toolText(started), /Green pear|pear/u);
      const shown = await mcp.callTool({
        name: "update_product_review_conversation",
        arguments: {
          draft_id: initial.draftId,
          review_context_id: initial.reviewContextId,
          action: { kind: "show" },
        },
      });
      assert.equal(shown.isError, undefined, toolText(shown));
      const current = (
        shown.structuredContent as { review: ProductReviewSnapshot }
      ).review;
      assert.deepEqual(
        current.items.map(({ product_id, state }) => [product_id, state]),
        [
          [401, "ready"],
          [402, "ready"],
        ],
      );
    },
  );
  assert.equal(searchCalls, 1);
  assert.equal(startCalls, 1);
  assert.equal(basketReads, 0);
  assert.equal(basketWrites, 0);
});

test("MCP basket viewer uses basket summaries without fetching product details", async () => {
  let productReads = 0;
  const client = fakeClient({
    getCart: async () => ({
      ...basket,
      items: [{ id: 44, name: "Banan", quantity: 3, total: 7.5 }],
    }),
    getProduct: async () => {
      productReads += 1;
      throw new Error("product lookup must not run while rendering a basket");
    },
  });
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const result = await mcp.callTool({
      name: "show_my_basket",
      arguments: {},
    });
    assert.notEqual(result.isError, true, toolText(result));
    const views = (
      result.structuredContent as {
        views: Array<{
          context: string;
          product: { id: number; price?: number; available?: boolean };
          basket: { quantity: number; line_total: number };
        }>;
      }
    ).views;
    assert.equal(views[0]?.context, "basket");
    assert.equal(views[0]?.product.id, 44);
    assert.equal(views[0]?.product.price, undefined);
    assert.equal(views[0]?.product.available, undefined);
    assert.equal(views[0]?.basket.quantity, 3);
    assert.equal(views[0]?.basket.line_total, 7.5);
  });
  assert.equal(productReads, 0);
});

test("retired Local Basket targets and actions reject without provider access", async () => {
  let providerReads = 0;
  let providerWrites = 0;
  const client = {
    ...fakeClient(),
    providerIdentity: () => "account-1",
    listShoppingLists: async () => {
      providerReads += 1;
      return [{ id: 44, name: "Family", productCount: 2 }];
    },
    getShoppingList: async () => {
      providerReads += 1;
      throw new Error("unexpected saved-list read");
    },
    addShoppingListToCart: async () => {
      providerWrites += 1;
      throw new Error("unexpected transfer");
    },
  };
  await withMcpClient(createMcpServer(client, testCredentials), async (mcp) => {
    const retiredCalls = [
      [
        "update_product_review",
        {
          basket_id: "00000000-0000-4000-8000-000000000099",
          action: { kind: "show" },
        },
      ],
      [
        "update_product_review",
        { shopping_list_id: 44, action: { kind: "delete" } },
      ],
      [
        "update_product_review_conversation",
        {
          draft_id: "00000000-0000-4000-8000-000000000099",
          action: { kind: "heartbeat" },
        },
      ],
      [
        "submit_product_review",
        {
          basket_id: "00000000-0000-4000-8000-000000000099",
          submission_id: "00000000-0000-4000-8000-000000000002",
        },
      ],
    ] as const;
    for (const [name, arguments_] of retiredCalls) {
      const result = await mcp.callTool({ name, arguments: arguments_ });
      assert.equal(result.isError, true, `${name}: ${toolText(result)}`);
    }
  });
  assert.equal(providerReads, 0);
  assert.equal(providerWrites, 0);
});

test("explicit list action opens native list discovery without a provider write", async () => {
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
    const command = JSON.parse(String(init?.body)) as { kind?: string };
    if (command.kind === "selection") {
      return Response.json(null);
    }
    if (command.kind === "list") {
      return Response.json([]);
    }
    throw new Error(`unexpected local basket command: ${command.kind}`);
  };
  const context = {
    principalKey: "p".repeat(32),
    policyRevision: "policy-1",
    localBasketCapability: "capability-for-this-request",
  };
  const requestMeta = { "openai/session": "fresh-session" };
  const provider = Object.assign(fakeClient(), {
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [],
  });

  try {
    await withMcpClient(
      createMcpServer(provider, async () => undefined, undefined, context),
      async (mcp) => {
        const nativeLists = await mcp.callTool({
          name: "start_product_review",
          _meta: requestMeta,
          arguments: {},
        });
        assert.equal(nativeLists.isError, undefined, toolText(nativeLists));
        assert.deepEqual(nativeLists.structuredContent, {
          shoppingLists: [],
          selectedShoppingListId: null,
          selectionRequired: true,
        });

        const picker = await mcp.callTool({
          name: "update_product_review_conversation",
          _meta: requestMeta,
          arguments: { action: { kind: "show" } },
        });
        assert.equal(picker.isError, undefined, toolText(picker));
        assert.deepEqual(picker.structuredContent, { unavailable: true });
        const explicitPicker = await mcp.callTool({
          name: "update_product_review_conversation",
          _meta: requestMeta,
          arguments: { action: { kind: "list" } },
        });
        assert.equal(
          explicitPicker.isError,
          undefined,
          toolText(explicitPicker),
        );
        assert.deepEqual(explicitPicker.structuredContent, {
          shoppingLists: [],
          selectedShoppingListId: null,
          selectionRequired: true,
        });
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model-visible product images allow only observed Nemlig HTTPS origins", () => {
  assert.equal(
    safeNemligImageUrl("https://nemlig.com/scommerce/images/milk.jpg?i=1"),
    "https://nemlig.com/scommerce/images/milk.jpg?i=1",
  );
  assert.equal(
    safeNemligImageUrl("https://www.nemlig.com/scommerce/images/milk.jpg?i=1"),
    "https://www.nemlig.com/scommerce/images/milk.jpg?i=1",
  );
  for (const value of [
    "http://www.nemlig.com/image.jpg",
    "https://nemlig.com.evil.test/image.jpg",
    "https://images.test/image.jpg",
    "not a url",
    undefined,
  ]) {
    assert.equal(safeNemligImageUrl(value), undefined);
  }
});

test("retired MCP feature request is unavailable and has no Nemlig side effect", async () => {
  const client = fakeClient({
    getCart: async () => {
      throw new Error("unexpected basket read");
    },
    addToCart: async () => {
      throw new Error("unexpected basket mutation");
    },
  });
  await withMcpClient(
    createMcpServer(client, async () => undefined, undefined),
    async (mcp) => {
      assert.equal(
        (await mcp.listTools()).tools.some(
          (tool) => tool.name === "suggest_an_improvement",
        ),
        false,
      );
      await assert.rejects(
        mcp.callTool({
          name: "suggest_an_improvement",
          arguments: {
            title: "Prefer discounted favorites",
            summary: "Choose discounted favorites first.",
            acceptance_criteria: ["Search favorites first"],
          },
        }),
        /not found/iu,
      );
    },
  );
});

test("legacy raw visual chooser is unavailable", async () => {
  await withMcpClient(
    createMcpServer(fakeClient(), testCredentials),
    async (mcp) => {
      await assert.rejects(
        mcp.callTool({
          name: "choose_products_visually",
          arguments: { search_term: "mælk", result_count: 5 },
        }),
        /not found/iu,
      );
    },
  );
});

test("direct draft loads a read-only source, submits once, and saves the basket separately", async () => {
  let basketWrites = 0;
  let basketListSaves = 0;
  const sourceItems = new Map([[7, 2]]);
  let current: Basket = {
    items: [{ id: 99, name: "Existing", quantity: 1, total: 2 }],
    productsPrice: 2,
    deliveryPrice: 0,
    numberOfProducts: 1,
    deliveryTime: undefined,
  };
  const state = new Map<string, unknown>();
  const storage: LocalBasketInventoryStorage = {
    async get<T>(key: string) {
      return structuredClone(state.get(key)) as T | undefined;
    },
    async put<T>(key: string, value: T) {
      state.set(key, structuredClone(value));
    },
    async delete(key: string) {
      state.delete(key);
    },
    async setAlarm() {},
    async deleteAlarm() {},
    async transaction<T>(action: (tx: LocalBasketStorageAccess) => Promise<T>) {
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
        capability === "direct-review-capability"
          ? "direct-review-owner"
          : undefined,
    );
  };
  const provider = Object.assign(
    fakeClient({
      getCart: async () => structuredClone(current),
      addManyToCart: async (
        additions: Array<{ productId: number; quantity: number }>,
        options?: { beforeDispatch?: (baseline: Basket) => Promise<void> },
      ) => {
        await options?.beforeDispatch?.(structuredClone(current));
        basketWrites++;
        const lines = new Map(current.items.map((item) => [item.id!, item]));
        for (const addition of additions) {
          lines.set(addition.productId, {
            id: addition.productId,
            name: product.name,
            quantity:
              (lines.get(addition.productId)?.quantity ?? 0) +
              addition.quantity,
            total: addition.quantity * product.price!,
          });
        }
        current = { ...current, items: [...lines.values()] };
        return structuredClone(current);
      },
      listShoppingLists: async () => [
        { id: 55, name: "Read-only source", productCount: 1, totalAmount: 0 },
      ],
      getShoppingList: async (id: number) => ({
        id,
        name: "Read-only source",
        items: [...sourceItems].map(([productId, quantity]) => ({
          productId,
          quantity,
        })),
      }),
      createShoppingListFromBasket: async (options: {
        beforeDispatch?: (baseline: Basket) => Promise<void>;
      }) => {
        await options.beforeDispatch?.(structuredClone(current));
        basketListSaves++;
        return structuredClone(current);
      },
    }),
    { providerIdentity: () => "account-1" },
  );
  const server = () =>
    createMcpServer(provider, testCredentials, undefined, {
      principalKey: "direct-review-owner",
      policyRevision: "direct-review-test",
      localBasketCapability: "direct-review-capability",
    });
  let submittedDraftId: string | undefined;
  try {
    await withMcpClient(server(), async (mcp) => {
      const loaded = await mcp.callTool({
        name: "start_product_review",
        arguments: { shopping_list_id: 55 },
      });
      assert.equal(loaded.isError, undefined, toolText(loaded));
      let review = (
        loaded.structuredContent as { review: ProductReviewSnapshot }
      ).review;
      submittedDraftId = review.draftId;
      assert.equal(review.basketMode, "direct-basket");
      assert.equal(review.shoppingListId, undefined);
      assert.equal(basketWrites, 0);
      assert.equal(basketListSaves, 0);
      const edited = await mcp.callTool({
        name: "update_product_review_conversation",
        arguments: {
          draft_id: review.draftId,
          review_context_id: review.reviewContextId,
          action: { kind: "quantity", product_id: 7, quantity: 3 },
        },
      });
      assert.equal(edited.isError, undefined, toolText(edited));
      review = (edited.structuredContent as { review: ProductReviewSnapshot })
        .review;
      assert.deepEqual([...sourceItems], [[7, 2]]);
      assert.equal(basketWrites, 0);
      const submissionId = randomUUID();
      const submitted = await mcp.callTool({
        name: "submit_product_review_conversation",
        arguments: {
          draft_id: review.draftId,
          review_context_id: review.reviewContextId,
          submission_id: submissionId,
          reviewed_list: {
            name: review.shoppingListName ?? "Read-only source",
            items: review.items.map(({ product_id, quantity }) => ({
              product_id,
              quantity,
            })),
          },
        },
      });
      assert.equal(submitted.isError, undefined, toolText(submitted));
      assert.equal(basketWrites, 1);
      assert.equal(basketListSaves, 0);
      assert.deepEqual(
        current.items.map(({ id, quantity }) => [id, quantity]),
        [
          [99, 1],
          [7, 3],
        ],
      );
      assert.deepEqual([...sourceItems], [[7, 2]]);
      const replayedSave = await mcp.callTool({
        name: "save_basket_as_shopping_list",
        arguments: {
          draft_id: review.draftId,
          review_context_id: review.reviewContextId,
          save_id: randomUUID(),
        },
      });
      assert.equal(replayedSave.isError, undefined, toolText(replayedSave));
      assert.equal(
        (replayedSave.structuredContent as { replayed: boolean }).replayed,
        false,
      );
      assert.equal(basketListSaves, 1);
      const saved = await mcp.callTool({
        name: "save_basket_as_shopping_list",
        arguments: {
          draft_id: review.draftId,
          review_context_id: review.reviewContextId,
          save_id: randomUUID(),
        },
      });
      assert.equal(saved.isError, undefined, toolText(saved));
      assert.equal((saved.structuredContent as { saved: boolean }).saved, true);
      assert.equal(
        (saved.structuredContent as { replayed: boolean }).replayed,
        true,
      );
      assert.equal(basketListSaves, 1);
      assert.equal(basketWrites, 1);
      assert.deepEqual(
        current.items.map(({ id, quantity }) => [id, quantity]),
        [
          [99, 1],
          [7, 3],
        ],
      );
      assert.deepEqual([...sourceItems], [[7, 2]]);
    });
    await withMcpClient(server(), async (mcp) => {
      const loadedAgain = await mcp.callTool({
        name: "start_product_review",
        arguments: { shopping_list_id: 55 },
      });
      assert.equal(loadedAgain.isError, undefined, toolText(loadedAgain));
      const fresh = (
        loadedAgain.structuredContent as { review: ProductReviewSnapshot }
      ).review;
      assert.ok(fresh.draftId);
      assert.notEqual(fresh.draftId, submittedDraftId);
      assert.deepEqual(
        fresh.items.map(({ product_id, quantity }) => [product_id, quantity]),
        [[7, 2]],
      );
      assert.equal(basketWrites, 1);
      assert.equal(basketListSaves, 1);
      assert.deepEqual([...sourceItems], [[7, 2]]);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("product search is read-only and selection starts a temporary draft", async () => {
  let creates = 0;
  let basketWrites = 0;
  const provider = Object.assign(
    fakeClient({
      searchProducts: async () => [],
      getCart: async () => {
        basketWrites++;
        throw new Error("unexpected basket access");
      },
      addToCart: async () => {
        basketWrites++;
        throw new Error("unexpected basket write");
      },
    }),
    {
      addShoppingListToCart: async () => {
        basketWrites++;
        throw new Error("unexpected basket transfer");
      },
      createShoppingList: async () => {
        creates++;
        return 99;
      },
    },
  );
  await withMcpClient(
    createMcpServer(provider, testCredentials),
    async (mcp) => {
      const found = await mcp.callTool({
        name: "find_groceries",
        arguments: { search_term: "missing product", result_count: 3 },
      });
      assert.equal(found.isError, undefined, toolText(found));
      assert.deepEqual(
        (found.structuredContent as { result: unknown[] }).result,
        [],
      );
      const started = await mcp.callTool({
        name: "start_product_review",
        arguments: { items: [{ product_id: 7, quantity: 1 }] },
      });
      assert.equal(started.isError, undefined, toolText(started));
      const rejectedStarts = [
        {
          items: [{ product_id: 7, quantity: 1 }],
          creation_id: randomUUID(),
        },
        {
          items: [{ product_id: 7, quantity: 1 }],
          shopping_list_id: 55,
        },
      ];
      for (const arguments_ of rejectedStarts) {
        const rejected = await mcp.callTool({
          name: "start_product_review",
          arguments: arguments_,
        });
        assert.equal(rejected.isError, true, toolText(rejected));
      }
      const missingTarget = await mcp.callTool({
        name: "update_product_review_conversation",
        arguments: { action: { kind: "quantity", product_id: 7, quantity: 2 } },
      });
      assert.equal(missingTarget.isError, true);
      const retiredTarget = await mcp.callTool({
        name: "update_product_review_conversation",
        arguments: { basket_id: randomUUID(), action: { kind: "show" } },
      });
      assert.equal(retiredTarget.isError, true);
      const missingSubmitIdentity = await mcp.callTool({
        name: "submit_product_review_conversation",
        arguments: {
          draft_id: randomUUID(),
          submission_id: randomUUID(),
          reviewed_list: {
            name: "Basket draft",
            items: [{ product_id: 7, quantity: 1 }],
          },
        },
      });
      assert.equal(missingSubmitIdentity.isError, true);
      const retiredDraft = await mcp.callTool({
        name: "update_product_review_conversation",
        arguments: {
          draft_id: randomUUID(),
          action: { kind: "show" },
        },
      });
      assert.equal(retiredDraft.isError, true);
      assert.match(
        mcp.getInstructions() ?? "",
        /temporary process-local draft/u,
      );
      assert.match(mcp.getInstructions() ?? "", /never the source list/u);
    },
  );
  assert.equal(creates, 0);
  assert.equal(basketWrites, 0);
});
