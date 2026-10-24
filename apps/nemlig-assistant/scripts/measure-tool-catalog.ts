import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createMcpServer } from "../src/mcp.js";
import type { Basket, Product, ShoppingClient } from "../src/client.js";

const product: Product = {
  id: 1,
  name: "Measurement product",
  price: 1,
  unit: "kr/st",
  unitPrice: 1,
  unitSize: "1 stk",
  brand: "Fixture",
  category: "Fixture",
  subcategory: "Fixture",
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
};

const emptyBasket: Basket = {
  items: [],
  productsPrice: 0,
  deliveryPrice: 0,
  numberOfProducts: 0,
  deliveryTime: undefined,
};

const catalogue = {
  isLoggedIn: () => true,
  login: async () => {},
  searchProducts: async () => [product],
  getProduct: async () => product,
  getFreshProduct: async () => product,
  listFavorites: async () => [product],
  listDepartments: async () => [],
  browseDepartment: async () => ({ products: [], page: 1, hasNext: false }),
  getCart: async () => emptyBasket,
  addToCart: async () => emptyBasket,
  addManyToCart: async () => emptyBasket,
  providerIdentity: () => "measurement-account",
  listShoppingLists: async () => [],
  getShoppingList: async () => ({ id: 1, name: "Fixture", items: [] }),
  createShoppingList: async () => 1,
  updateShoppingListProduct: async () => {},
  deleteShoppingList: async () => {},
  addShoppingListToCart: async () => {},
} as unknown as ShoppingClient;

const server = createMcpServer(catalogue, async () => undefined, undefined, {
  principalKey: "tool-catalog-measurement",
  policyRevision: "measurement-v1",
});
const handler = createMcpHandler(() => server, { legacy: "reject" });
const nodeHandler = toNodeHandler(handler);
let toolsListBytes: number | undefined;
const httpServer = createServer((request, response) => {
  const chunks: Buffer[] = [];
  const write = response.write.bind(response);
  const end = response.end.bind(response);
  response.write = ((chunk: unknown, ...args: unknown[]) => {
    if (chunk) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    return write(chunk as never, ...(args as never[]));
  }) as typeof response.write;
  response.end = ((chunk: unknown, ...args: unknown[]) => {
    if (chunk) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    return end(chunk as never, ...(args as never[]));
  }) as typeof response.end;
  response.once("finish", () => {
    const body = Buffer.concat(chunks);
    if (body.includes(Buffer.from('"tools"'))) {
      toolsListBytes = body.byteLength;
    }
  });
  void nodeHandler(request, response);
});
httpServer.listen(0, "127.0.0.1");
await new Promise<void>((resolve, reject) => {
  httpServer.once("listening", resolve);
  httpServer.once("error", reject);
});

const client = new Client(
  { name: "tool-catalog-measurement", version: "1" },
  { versionNegotiation: { mode: { pin: "2026-07-28" } } },
);
await client.connect(
  new StreamableHTTPClientTransport(
    new URL(
      `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/mcp`,
    ),
  ),
);
try {
  const tools = (await client.listTools()).tools;
  if (toolsListBytes === undefined) {
    throw new Error("The loopback tools/list response was not captured.");
  }
  const modelVisibleToolCount = tools.filter((tool) => {
    const visibility = (tool._meta?.ui as { visibility?: string[] } | undefined)
      ?.visibility;
    return !visibility || visibility.includes("model");
  }).length;
  console.log(
    JSON.stringify({
      serializedToolsListBytes: toolsListBytes,
      modelVisibleToolCount,
      totalToolCount: tools.length,
    }),
  );
} finally {
  await client.close();
  await handler.close();
  httpServer.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
