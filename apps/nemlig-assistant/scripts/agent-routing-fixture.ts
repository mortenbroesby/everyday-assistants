// Local synthetic MCP fixture for native routing evaluations. No model calls.
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createServer } from "node:http";
import process from "node:process";
import { createMcpServer } from "../src/mcp.js";
import { ProductReviewService } from "../src/product-review.js";
import type {
  ShoppingClient,
  ShoppingListClient,
  Product,
} from "../src/client.js";
const counts = { searches: 0, details: 0, forbidden: 0 };
const forbidden = async (): Promise<never> => {
  counts.forbidden++;
  throw new Error("Synthetic probe forbids this operation");
};
globalThis.fetch = forbidden as typeof fetch;
const productId = 900001;
const product: Product = {
  id: productId,
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
const provider: ShoppingClient & Pick<ShoppingListClient, "providerIdentity"> =
  {
    isLoggedIn: () => true,
    providerIdentity: () => "synthetic-routing-fixture",
    login: forbidden,
    searchProducts: async () => {
      counts.searches++;
      return [product];
    },
    getProduct: async (id) => {
      if (id !== productId) {
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
if (process.argv.slice(2).some((arg: string) => arg !== "--expired-draft")) {
  throw new Error("Only --expired-draft is supported.");
}
let clockOffset = 0;
const reviews = new ProductReviewService(provider, {
  now: () => Date.now() + clockOffset,
});
const expiredSeed = process.argv.includes("--expired-draft")
  ? await reviews.startDirectBasket("synthetic-routing-fixture\0seed", [
      { product_id: productId, quantity: 1 },
    ])
  : undefined;
if (expiredSeed) {
  // Advance only the injected service clock, beyond its two-hour idle TTL.
  clockOffset = 3 * 60 * 60 * 1000;
}
const server = createMcpServer(
  provider,
  forbidden,
  {},
  { principalKey: "synthetic-routing-fixture", policyRevision: "probe-v1" },
  reviews,
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
      JSON.stringify({
        url: `http://127.0.0.1:${address.port}/mcp`,
        expiredDraft: expiredSeed && {
          draftId: expiredSeed.draftId,
          reviewContextId: expiredSeed.reviewContextId,
        },
      }),
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
