import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(path.join(tmpdir(), "nemlig-assistant-package-"));
const sourceManifest = JSON.parse(
  await readFile(path.join(packageRoot, "package.json"), "utf8"),
) as { version?: string };

try {
  const { stdout } = await execute(
    "npm",
    ["pack", "--json", "--pack-destination", tempRoot],
    { cwd: packageRoot },
  );
  const jsonStart = stdout.lastIndexOf("[\n  {");
  assert.notEqual(jsonStart, -1, "npm pack returned no JSON result");
  const [packed] = JSON.parse(stdout.slice(jsonStart)) as [{
    filename: string;
    files: Array<{ path: string }>;
  }];
  assert.ok(packed, "npm pack returned no package");
  const packedPaths = packed.files.map((file) => file.path).sort();
  assert.deepEqual(packedPaths, [
    "README.md",
    "dist/cli.js",
    "dist/cli.js.map",
    "dist/mcp.js",
    "dist/mcp.js.map",
    "package.json",
  ]);
  assert.doesNotMatch(packedPaths.join("\n"), /test|credential|token|cookie|\.auth|python/i);

  await writeFile(
    path.join(tempRoot, "package.json"),
    `${JSON.stringify({ private: true }, null, 2)}\n`,
  );
  await execute(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", path.join(tempRoot, packed.filename)],
    { cwd: tempRoot },
  );

  const manifest = JSON.parse(
    await readFile(path.join(tempRoot, "node_modules", "nemlig-assistant", "package.json"), "utf8"),
  ) as { name?: string; version?: string; bin?: Record<string, string> };
  assert.equal(manifest.name, "nemlig-assistant");
  assert.equal(manifest.version, sourceManifest.version);
  assert.deepEqual(Object.keys(manifest.bin ?? {}).sort(), ["nemlig", "nemlig-assistant", "nemlig-mcp"]);

  const bin = (name: string): string => path.join(tempRoot, "node_modules", ".bin", name);
  const help = await execute(bin("nemlig"), ["--help"], { env: { PATH: process.env.PATH ?? "" } });
  assert.match(help.stdout, /login/);
  assert.match(help.stdout, /search/);
  assert.match(help.stdout, /favorites/);
  assert.match(help.stdout, /departments/);
  assert.match(help.stdout, /browse/);
  assert.match(help.stdout, /feature-request/);
  assert.match(help.stdout, /cart/);
  assert.match(help.stdout, /add/);
  assert.match(help.stdout, /remove/);
  assert.doesNotMatch(help.stdout, /parse|checkout|--password/i);

  const transport = new StdioClientTransport({
    command: bin("nemlig-mcp"),
    env: { ...process.env, NEMLIG_MCP_APPS: "0" },
  });
  const client = new Client({ name: "package-smoke", version: "1.0.0" });
  await client.connect(transport);
  try {
    assert.equal(client.getServerVersion()?.name, "nemlig-assistant");
    assert.equal(client.getServerVersion()?.version, "1.3.0-alpha.7");
    const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
    assert.deepEqual(tools, [
      "apply_cart_additions",
      "apply_cart_clear",
      "apply_cart_removal",
      "apply_cart_replacement",
      "browse_department",
      "create_feature_request",
      "list_departments",
      "list_favorites",
      "load_shopping_plan",
      "plan_shopping_list",
      "prepare_cart_additions",
      "prepare_cart_clear",
      "prepare_cart_removal",
      "prepare_cart_replacement",
      "save_shopping_plan",
      "search_products",
      "view_cart",
    ]);
    assert.doesNotMatch(tools.join("\n"), /add_to_cart|remove_from_cart|replace_cart_line|clear_cart/);
    assert.doesNotMatch(tools.join("\n"), /recipe|checkout|order|payment/i);
  } finally {
    await client.close();
  }

  console.log("Packed Nemlig Assistant interfaces verified.");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
