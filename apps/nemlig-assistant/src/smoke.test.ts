import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import type { ShoppingClient } from "./client.js";
import { createMcpServer } from "./mcp.js";

const execute = promisify(execFile);

test("server modules do not depend on the executable CLI entry point", async () => {
  for (const file of ["mcp.ts", "http.ts", "proposals.ts"]) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /from "\.\/cli\.js"/u);
  }
});

test("source CLI, MCP, and HTTP modules import without starting work", async () => {
  const { stderr, stdout } = await execute(
    process.execPath,
    ["--import=tsx", "--input-type=module", "--eval", 'globalThis.fetch=()=>{throw new Error("fetch during import")};await Promise.all([import("./cli.ts"), import("./mcp.ts"), import("./http.ts")])'],
    { cwd: import.meta.dirname, env: { PATH: process.env.PATH }, timeout: 30_000 },
  );
  assert.equal(stdout, "");
  assert.equal(stderr, "");
});

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
  assert.doesNotMatch(stdout, /feature-request/);
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
    getFreshProduct: unavailable,
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
        "check_nemlig_connection",
        "empty_approved_basket",
        "find_groceries",
        "make_approved_item_swap",
        "plan_my_shopping",
        "remove_approved_item",
        "review_emptying_basket",
        "review_item_swap",
        "review_item_to_remove",
        "review_items_to_add",
        "show_grocery_sections",
        "show_my_basket",
        "show_my_favorites",
      ],
    );
  } finally {
    await client.close();
    await server.close();
  }
});
