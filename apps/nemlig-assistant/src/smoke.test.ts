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
    assert.equal(client.getServerVersion()?.name, "nemlig-assistant");
    assert.deepEqual(
      (await client.listTools()).tools.map((tool) => tool.name).sort(),
      [
        "apply_cart_additions",
        "apply_cart_clear",
        "apply_cart_removal",
        "create_feature_request",
        "list_favorites",
        "prepare_cart_additions",
        "prepare_cart_clear",
        "prepare_cart_removal",
        "search_products",
        "view_cart",
      ],
    );
  } finally {
    await client.close();
    await server.close();
  }
});
