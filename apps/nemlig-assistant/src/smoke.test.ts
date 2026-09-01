import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import type { ShoppingClient } from "./cli.js";
import { createMcpServer } from "./mcp.js";

const execute = promisify(execFile);

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
  assert.match(stdout, /feature-request/);
  assert.match(stdout, /cart/);
  assert.match(stdout, /add/);
  assert.match(stdout, /remove/);
  assert.doesNotMatch(stdout, /parse|checkout|--password/);

  const unavailable = async (): Promise<never> => {
    throw new Error("Network must not be used by smoke test");
  };
  const shoppingClient: ShoppingClient = {
    isLoggedIn: () => false,
    login: unavailable,
    searchProducts: unavailable,
    getProduct: unavailable,
    listFavorites: unavailable,
    listDepartments: unavailable,
    browseDepartment: unavailable,
    getCart: unavailable,
    addToCart: unavailable,
    removeFromCart: unavailable,
    clearCart: unavailable,
  };
  const server = createMcpServer(shoppingClient, async () => undefined, {
    NEMLIG_MCP_APPS: "0",
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "smoke", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const serverInfo = client.getServerVersion();
    assert.ok(serverInfo);
    assert.equal(serverInfo?.name, "nemlig-assistant");
    assert.equal(serverInfo.title, "Nemlig Assistant");
    assert.deepEqual(serverInfo.icons, [{
      src: serverInfo.icons?.[0]?.src,
      mimeType: "image/png",
      sizes: ["1024x1024"],
    }]);
    assert.match(serverInfo.icons?.[0]?.src ?? "", /^data:image\/png;base64,iVBOR/);
    assert.deepEqual(
      (await client.listTools()).tools.map((tool) => tool.name).sort(),
      [
        "add_approved_items",
        "browse_grocery_section",
        "continue_my_shopping_plan",
        "empty_approved_basket",
        "find_groceries",
        "make_approved_item_swap",
        "plan_my_shopping",
        "remove_approved_item",
        "review_emptying_basket",
        "review_item_swap",
        "review_item_to_remove",
        "review_items_to_add",
        "save_my_shopping_plan",
        "show_grocery_sections",
        "show_my_basket",
        "show_my_favorites",
        "suggest_an_improvement",
      ],
    );
  } finally {
    await client.close();
    await server.close();
  }
});
