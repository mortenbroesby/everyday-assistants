import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PRODUCT_VIEWER_RESOURCE_URI } from "../src/product-viewer.js";

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
    "dist/http.js",
    "dist/http.js.map",
    "dist/mcp.js",
    "dist/mcp.js.map",
    "dist/picker.html",
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
  ) as { name?: string; version?: string; bin?: Record<string, string>; dependencies?: Record<string, string> };
  assert.equal(manifest.name, "nemlig-assistant");
  assert.equal(manifest.version, sourceManifest.version);
  assert.deepEqual(Object.keys(manifest.bin ?? {}).sort(), ["nemlig", "nemlig-assistant", "nemlig-mcp", "nemlig-mcp-http"]);
  for (const browserBuildInput of ["@modelcontextprotocol/ext-apps", "@openai/apps-sdk-ui", "react", "react-dom"]) assert.equal(manifest.dependencies?.[browserBuildInput], undefined);

  const installed = path.join(tempRoot, "node_modules", "nemlig-assistant", "dist");
  const imports = await execute(
    process.execPath,
    ["--input-type=module", "--eval", `globalThis.fetch=()=>{throw new Error("fetch during import")};await Promise.all(${JSON.stringify(["cli.js", "mcp.js", "http.js"].map((file) => pathToFileURL(path.join(installed, file)).href))}.map((entry) => import(entry)))`],
    { env: { PATH: process.env.PATH ?? "" }, timeout: 30_000 },
  );
  assert.equal(imports.stdout, "");
  assert.equal(imports.stderr, "");

  const bin = (name: string): string => path.join(tempRoot, "node_modules", ".bin", name);
  const help = await execute(bin("nemlig"), ["--help"], { env: { PATH: process.env.PATH ?? "" } });
  assert.match(help.stdout, /login/);
  assert.match(help.stdout, /search/);
  assert.match(help.stdout, /favorites/);
  assert.match(help.stdout, /departments/);
  assert.match(help.stdout, /browse/);
  assert.doesNotMatch(help.stdout, /plan_my_shopping|\bplan\b/u);
  assert.doesNotMatch(help.stdout, /feature-request/);
  assert.match(help.stdout, /cart/);
  assert.match(help.stdout, /add/);
  assert.doesNotMatch(help.stdout, /^\s{2}remove(?:\s|$)/mu);
  assert.doesNotMatch(help.stdout, /parse|checkout|--password/i);

  const transport = new StdioClientTransport({
    command: bin("nemlig-mcp"),
    env: { ...process.env },
  });
  const client = new Client({ name: "package-smoke", version: "1.0.0" }, {
    versionNegotiation: { mode: { pin: "2026-07-28" } },
  });
  await client.connect(transport);
  try {
    assert.equal(client.getServerVersion()?.name, "nemlig-assistant");
    assert.equal(client.getServerVersion()?.version, sourceManifest.version);
    assert.doesNotMatch(client.getInstructions() ?? "", /^Current release:/u);
    const tools = (await client.listTools()).tools
      .filter((tool) => !tool._meta?.ui || ((tool._meta.ui as { visibility?: string[] }).visibility ?? []).includes("model"))
      .map((tool) => tool.name).sort();
    assert.deepEqual(tools, [
      "check_nemlig_connection",
      "find_groceries",
      "get_profile",
      "show_my_basket",
      "start_product_review",
      "submit_product_review_conversation",
      "update_product_review_conversation",
    ]);
    assert.doesNotMatch(tools.join("\n"), /add_to_cart|remove_from_cart|replace_cart_line|clear_cart/);
    assert.doesNotMatch(tools.join("\n"), /recipe|checkout|order|payment/i);
    const viewer = await client.readResource({ uri: PRODUCT_VIEWER_RESOURCE_URI });
    assert.equal(viewer.contents.length, 1);
    const resource = viewer.contents[0];
    assert.ok(resource && "text" in resource);
    assert.equal(resource.mimeType, "text/html;profile=mcp-app");
    assert.equal(PRODUCT_VIEWER_RESOURCE_URI, "ui://nemlig/product-viewer-v12.html");
    assert.match(resource.text, /Nemlig confirmed this Draft list was added successfully\./u);
    const packagedViewer = await readFile(path.join(tempRoot, "node_modules", "nemlig-assistant", "dist", "picker.html"), "utf8");
    assert.equal(resource.text, packagedViewer, "installed MCP server did not serve the packaged v12 viewer artifact");
  } finally {
    await client.close();
  }

  console.log("Packed Nemlig Assistant interfaces verified.");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
