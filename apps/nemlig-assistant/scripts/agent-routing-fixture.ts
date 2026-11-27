// Local synthetic MCP fixture for native routing evaluations. No model calls.
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createServer } from "node:http";
import { createMcpServer } from "../src/mcp.js";
import type { ShoppingClient, Product } from "../src/client.js";
const counts = { searches: 0, details: 0, forbidden: 0 };
const forbidden = async (): Promise<never> => {
  counts.forbidden++;
  throw new Error("Synthetic probe forbids this operation");
};
globalThis.fetch = forbidden as typeof fetch;
const product: Product = {
  id: 900001,
  name: "Synthetic oat drink",
  price: 10,
  unit: "kr/l",
  unitPrice: 10,
  unitSize: "1 l",
  brand: "Fixture",
  category: "Drikke",
  subcategory: "Plantedrik",
  imageUrl: "",
  available: true,
  labels: [],
  isOrganic: false,
  isFrozen: false,
  isRefrigerated: false,
  isDairy: false,
  isLactoseFree: false,
  isGlutenFree: false,
  isVegan: true,
  isOnDiscount: false,
};
const provider: ShoppingClient = {
  isLoggedIn: () => true,
  providerIdentity: () => "synthetic-routing-fixture",
  login: forbidden,
  searchProducts: async () => {
    counts.searches++;
    return [product];
  },
  getProduct: async (id) => {
    if (id !== product.id) {
      throw new Error("Unknown fixture");
    }
    counts.details++;
    return product;
  },
  getFreshProduct: forbidden,
  listFavorites: forbidden,
  listDepartments: forbidden,
  browseDepartment: forbidden,
  getCart: forbidden,
  addToCart: forbidden,
};
const server = createMcpServer(
  provider,
  forbidden,
  {},
  { principalKey: "synthetic-routing-fixture", policyRevision: "probe-v1" },
);
const handler = createMcpHandler(() => server, { legacy: "stateless" });
const nodeHandler = toNodeHandler(handler);
const http = createServer((req, res) => {
  void nodeHandler(req, res);
});
http.listen(0, "127.0.0.1", () => {
  const address = http.address();
  if (address && typeof address === "object") {
    console.log(
      JSON.stringify({ url: `http://127.0.0.1:${address.port}/mcp` }),
    );
  }
});
const stop = () => {
  console.log(JSON.stringify({ event: "stopped", counts }));
  http.closeAllConnections();
  http.close();
  void handler.close().finally(() => process.exit(0));
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
