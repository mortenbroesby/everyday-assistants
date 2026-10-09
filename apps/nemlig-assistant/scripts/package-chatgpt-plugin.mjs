#!/usr/bin/env node
/* global Buffer, URL, console, process */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  renameSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(appRoot, "chatgpt-plugin-source");
const packageRoot = resolve(sourceRoot, "nemlig-shopping");
const pluginPath = resolve(packageRoot, "plugin.json");
const appPath = resolve(packageRoot, ".app.json");
const mcpPath = resolve(packageRoot, "mcp.json");
const cloudflareConfigPath = resolve(appRoot, "wrangler.jsonc");
const plugin = readJson(pluginPath);
const app = readJson(appPath);
const mcp = readJson(mcpPath);
const cloudflareConfig = readJson(cloudflareConfigPath);
const { outputPath } = parseArgs(process.argv.slice(2), plugin.version);

validate();

const outputDirectory = dirname(outputPath);
mkdirSync(outputDirectory, { recursive: true });
if (isInside(sourceRoot, outputPath)) {
  throw new Error("Choose an output path outside chatgpt-plugin-source.");
}

const temporaryDirectory = mkdtempSync(
  join(outputDirectory, ".nemlig-plugin-"),
);
const temporaryArchive = join(temporaryDirectory, "package.zip");

try {
  const stagedPackageRoot = join(temporaryDirectory, plugin.name);
  cpSync(packageRoot, stagedPackageRoot, { recursive: true });
  mkdirSync(join(stagedPackageRoot, "cloudflare"));
  copyFileSync(
    cloudflareConfigPath,
    join(stagedPackageRoot, "cloudflare/wrangler.jsonc"),
  );
  execFileSync("zip", ["-q", "-r", "-X", temporaryArchive, plugin.name], {
    cwd: temporaryDirectory,
  });
  execFileSync("unzip", ["-tq", temporaryArchive]);
  renameSync(temporaryArchive, outputPath);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(`Created ${outputPath}`);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseArgs(args, version) {
  if (args.length === 0) {
    return {
      outputPath: resolve(
        appRoot,
        "dist/plugin",
        `nemlig-shopping-${version}.zip`,
      ),
    };
  }

  if (args.length === 2 && args[0] === "--output") {
    return { outputPath: resolve(process.cwd(), args[1]) };
  }

  throw new Error(
    "Usage: node package-chatgpt-plugin.mjs [--output <zip-path>]",
  );
}

function validate() {
  if (
    plugin.name !== "nemlig-shopping" ||
    !/^\d+\.\d+\.\d+$/.test(plugin.version)
  ) {
    throw new Error(
      "plugin.json must define the package name and a semantic version.",
    );
  }

  if (plugin.author?.email) {
    throw new Error(
      "Do not package the private export's author email in this public repository.",
    );
  }

  const shortDescription =
    plugin.extensions?.["com.openai"]?.interface?.shortDescription;
  if (
    !Array.isArray(plugin.keywords) ||
    plugin.keywords.length === 0 ||
    typeof shortDescription !== "string" ||
    shortDescription.length > 30
  ) {
    throw new Error(
      "Add plugin keywords and keep shortDescription at or below 30 characters.",
    );
  }

  const openAi = plugin.extensions?.["com.openai"];
  if (
    openAi?.apps !== "./.app.json" ||
    app.apps?.["nemlig-assistant"]?.id !==
      "asdk_app_6ac7995a68648191bafab7459ab55953" ||
    app.apps["nemlig-assistant"].required !== true
  ) {
    throw new Error("The package must bind to the registered Nemlig MCP app.");
  }

  const production = cloudflareConfig.env?.production;
  const productionVars = production?.vars;
  const hostedUrl = productionVars?.NEMLIG_MCP_PUBLIC_URL;
  const hostedOrigin =
    typeof hostedUrl === "string" ? new URL(hostedUrl) : null;
  const hasCustomDomain = production?.routes?.some(
    (route) =>
      route.custom_domain === true && route.pattern === hostedOrigin?.hostname,
  );
  if (
    mcp.mcpServers?.nemlig?.type !== "streamable-http" ||
    mcp.mcpServers.nemlig.url !== hostedUrl ||
    hostedOrigin?.protocol !== "https:" ||
    productionVars?.NEMLIG_MCP_AUTH0_AUDIENCE !== hostedUrl ||
    !productionVars?.NEMLIG_MCP_AUTH0_ISSUER?.startsWith("https://") ||
    !hasCustomDomain
  ) {
    throw new Error(
      "mcp.json must match the production HTTPS MCP URL and OAuth resource settings.",
    );
  }

  const icon = openAi.interface?.logo;
  if (
    !icon ||
    openAi.interface?.composerIcon !== icon ||
    !icon.startsWith("./")
  ) {
    throw new Error(
      "The logo and composer icon must use the same package-local image.",
    );
  }

  const iconBytes = readFileSync(resolve(packageRoot, icon.slice(2)));
  const connectorIconBytes = readFileSync(
    resolve(packageRoot, "assets/connector-icon.png"),
  );
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    !iconBytes.subarray(0, pngSignature.length).equals(pngSignature) ||
    iconBytes.readUInt32BE(16) !== 1024 ||
    iconBytes.readUInt32BE(20) !== 1024
  ) {
    throw new Error("The configured icon must be a valid 1024 x 1024 PNG.");
  }
  if (
    !connectorIconBytes.subarray(0, pngSignature.length).equals(pngSignature) ||
    connectorIconBytes.readUInt32BE(16) !== 256 ||
    connectorIconBytes.readUInt32BE(20) !== 256 ||
    connectorIconBytes.length > 10_000
  ) {
    throw new Error(
      "The ChatGPT MCP connector icon must be a 256 x 256 PNG below 10 KB.",
    );
  }

  // Pin the reviewed plugin artwork independently of the separate MCP handshake icon.
  const expectedIconSha256 =
    "4f7d00a3df3b5729e5d008e05191a00effd755587e3ea631bb3f36adb6e78315";
  if (
    createHash("sha256").update(iconBytes).digest("hex") !== expectedIconSha256
  ) {
    throw new Error("The plugin icon must match the pinned plugin artwork.");
  }

  const skillsDirectory = resolve(packageRoot, "skills");
  if (
    !readFileSync(resolve(skillsDirectory, "grocery-shopping/SKILL.md"), "utf8")
  ) {
    throw new Error("The grocery shopping skill is missing or empty.");
  }

  if (!readFileSync(resolve(packageRoot, "README.md"), "utf8")) {
    throw new Error("The packaged README is missing or empty.");
  }
}

function isInside(parent, target) {
  return target === parent || target.startsWith(`${parent}${sep}`);
}
