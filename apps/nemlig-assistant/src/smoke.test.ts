import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { promisify } from "node:util";
import type { ShoppingClient } from "./client.js";
import { createMcpServer } from "./mcp.js";

const execute = promisify(execFile);
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

test("server modules do not depend on the executable CLI entry point", async () => {
  for (const file of ["mcp.ts", "http.ts", "product-review.ts"]) {
    const source = await readFile(
      new URL(`./${file}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /from\s+["']\.\/cli\.js["']/u);
  }
});

test("credential storage module stays independent of terminal prompt dependencies", async () => {
  const source = await readFile(
    new URL("./config.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /(?:from\s+|import\s*)["'](?:@inquirer\/password|node:readline\/promises)["']/u,
  );
});

test("source CLI, MCP, and HTTP modules import without starting work", async () => {
  const { stderr, stdout } = await execute(
    process.execPath,
    [
      "--import=tsx",
      "--input-type=module",
      "--eval",
      'globalThis.fetch=()=>{throw new Error("fetch during import")};await Promise.all([import("./cli.ts"), import("./mcp.ts"), import("./http.ts")])',
    ],
    {
      cwd: import.meta.dirname,
      env: { PATH: process.env.PATH },
      timeout: 30_000,
    },
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
  assert.doesNotMatch(stdout, /\bremove\b/u);
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
  };
  const server = createMcpServer(shoppingClient, async () => undefined);
  const client = modernClient("smoke");
  const close = await connectModern(server, client);
  try {
    const serverInfo = client.getServerVersion();
    assert.ok(serverInfo);
    assert.equal(serverInfo?.name, "nemlig-assistant");
    assert.equal(serverInfo.title, "Nemlig Assistant");
    assert.deepEqual(serverInfo.icons, [
      {
        src: serverInfo.icons?.[0]?.src,
        mimeType: "image/svg+xml",
        sizes: ["1024x1024"],
      },
    ]);
    assert.match(serverInfo.icons?.[0]?.src ?? "", /^data:image\/svg\+xml,/u);
    assert.deepEqual(
      (await client.listTools()).tools
        .filter(
          (tool) =>
            !tool._meta?.ui ||
            (
              (tool._meta.ui as { visibility?: string[] }).visibility ?? []
            ).includes("model"),
        )
        .map((tool) => tool.name)
        .sort(),
      [
        "check_nemlig_connection",
        "find_groceries",
        "get_profile",
        "show_my_basket",
        "show_product_review",
        "start_product_review",
        "submit_product_review_conversation",
        "update_product_review_conversation",
      ],
    );
  } finally {
    await close();
  }
});
