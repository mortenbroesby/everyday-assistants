import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { Product, ShoppingClient } from "./client.js";
import { createMcpServer } from "./mcp.js";

const modernClient = (name: string) =>
  new Client(
    { name, version: "1.0.0" },
    {
      versionNegotiation: { mode: { pin: "2026-07-28" } },
    },
  );

const connectModern = async (
  server: ReturnType<typeof createMcpServer>,
  client: Client,
): Promise<() => Promise<void>> => {
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
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  return async () => {
    await client.close();
    await handler.close();
    httpServer.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  };
};

// Synthetic cases exercise the actual MCP protocol, never the live provider.
const cases = JSON.parse(
  await readFile(
    new URL("./fixtures/agent-discovery.json", import.meta.url),
    "utf8",
  ),
) as Array<{
  id: string;
  query: string;
  ids: number[];
  unavailable: number[];
  searchFails: boolean;
  expectedIds: number[];
}>;

for (const scenario of cases) {
  test(`agent evaluation: ${scenario.id}`, { timeout: 10000 }, async (t) => {
    let searches = 0;
    const detailCalls: number[] = [];
    let forbiddenCalls = 0;
    const forbidden = async (): Promise<never> => {
      forbiddenCalls += 1;
      throw new Error("Forbidden provider operation");
    };
    const product = (id: number): Product => ({
      id,
      name: `Synthetic product ${id}`,
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
      isVegan: false,
      isOnDiscount: false,
    });
    const provider: ShoppingClient = {
      isLoggedIn: () => true,
      login: forbidden,
      searchProducts: async (query) => {
        searches += 1;
        assert.equal(query, scenario.query);
        if (scenario.searchFails) {
          throw new Error("PRIVATE_PROVIDER_FAILURE");
        }
        return scenario.ids.map(product);
      },
      getProduct: async (id) => {
        detailCalls.push(id);
        if (scenario.unavailable.includes(id)) {
          throw new Error("PRIVATE_DETAIL_FAILURE");
        }
        return product(id);
      },
      getFreshProduct: forbidden,
      listFavorites: forbidden,
      listDepartments: forbidden,
      browseDepartment: forbidden,
      getCart: forbidden,
      addToCart: forbidden,
    };
    const server = createMcpServer(provider, forbidden);
    const client = modernClient("agent-evaluation");
    const close = await connectModern(server, client);
    try {
      const catalog = await client.listTools();
      const reviewTools = catalog.tools.filter((tool) =>
        tool.name.includes("product_review"),
      );
      assert.equal(reviewTools.length, 6);
      for (const tool of reviewTools) {
        assert.ok(
          tool.outputSchema?.$defs,
          `${tool.name} must advertise local reusable definitions`,
        );
      }
      const modelTools = catalog.tools.filter((tool) => {
        const ui = tool._meta?.ui as { visibility?: string[] } | undefined;
        return !ui?.visibility || ui.visibility.includes("model");
      });
      const result = await client.callTool({
        name: "find_groceries",
        arguments: { search_term: scenario.query },
      });
      assert.equal(searches, 1);
      assert.equal(forbiddenCalls, 0);
      assert.deepEqual(
        detailCalls.sort((a, b) => a - b),
        scenario.searchFails
          ? []
          : [...new Set(scenario.ids)].sort((a, b) => a - b),
      );
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/u);
      assert.equal(result.isError === true, scenario.searchFails);
      if (!scenario.searchFails) {
        const structured = result.structuredContent as {
          result: Array<{ id: number }>;
          views: Array<{ status: string; product_id?: number }>;
        };
        assert.deepEqual(
          structured.result.map((item) => item.id),
          scenario.expectedIds,
        );
        assert.equal(structured.views.length, new Set(scenario.ids).size);
        assert.equal(
          structured.views.filter((view) => view.status === "unavailable")
            .length,
          scenario.unavailable.length,
        );
      }
      t.diagnostic(
        JSON.stringify({
          case: scenario.id,
          toolCount: catalog.tools.length,
          modelToolCount: modelTools.length,
          modelToolsBytes: Buffer.byteLength(JSON.stringify(modelTools)),
          outputSchemasBytes: Buffer.byteLength(
            JSON.stringify(catalog.tools.map((tool) => tool.outputSchema)),
          ),
          catalogBytes: Buffer.byteLength(JSON.stringify(catalog)),
          responseBytes: Buffer.byteLength(JSON.stringify(result)),
          searches,
          detailReads: detailCalls.length,
          forbiddenCalls,
        }),
      );
    } finally {
      await close();
    }
  });
}
