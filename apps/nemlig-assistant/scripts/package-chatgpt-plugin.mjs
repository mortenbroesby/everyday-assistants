#!/usr/bin/env node
/* global Buffer, URL, console, process */

import { execFileSync } from "node:child_process";
import { cpSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, renameSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(appRoot, "chatgpt-plugin-source");
const packageRoot = resolve(sourceRoot, "nemlig-assistant");
const pluginPath = resolve(packageRoot, "plugin.json");
const codexPluginPath = resolve(packageRoot, ".codex-plugin/plugin.json");
const appManifestPath = resolve(packageRoot, ".app.json");
const hostedAppPath = resolve(packageRoot, "hosted-app.json");
const cloudflareConfigPath = resolve(appRoot, "wrangler.jsonc");
const plugin = readJson(pluginPath);
const codexPlugin = readJson(codexPluginPath);
const appManifest = readJson(appManifestPath);
const hostedApp = readJson(hostedAppPath);
const cloudflareConfig = readJson(cloudflareConfigPath);
const { outputPath } = parseArgs(process.argv.slice(2), plugin.version);

validate();

const outputDirectory = dirname(outputPath);
mkdirSync(outputDirectory, { recursive: true });
if (isInside(sourceRoot, outputPath)) {
  throw new Error("Choose an output path outside chatgpt-plugin-source.");
}

const temporaryDirectory = mkdtempSync(join(outputDirectory, ".nemlig-plugin-"));
const temporaryArchive = join(temporaryDirectory, "package.zip");

try {
  const stagedPackageRoot = join(temporaryDirectory, "nemlig-assistant");
  cpSync(packageRoot, stagedPackageRoot, { recursive: true });
  mkdirSync(join(stagedPackageRoot, "cloudflare"));
  copyFileSync(cloudflareConfigPath, join(stagedPackageRoot, "cloudflare/wrangler.jsonc"));
  execFileSync("zip", ["-q", "-r", "-X", temporaryArchive, "nemlig-assistant"], {
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
      outputPath: resolve(appRoot, "dist/plugin", `nemlig-assistant-${version}.zip`),
    };
  }

  if (args.length === 2 && args[0] === "--output") {
    return { outputPath: resolve(process.cwd(), args[1]) };
  }

  throw new Error("Usage: node package-chatgpt-plugin.mjs [--output <zip-path>]");
}

function validate() {
  if (!plugin.name || !plugin.version) {
    throw new Error("plugin.json must define a name and version.");
  }

  if (plugin.author?.email || codexPlugin.author?.email) {
    throw new Error("Do not package the private export's author email in this public repository.");
  }

  if (
    codexPlugin.name !== plugin.name ||
    codexPlugin.version !== plugin.version ||
    codexPlugin.description !== plugin.description ||
    JSON.stringify(codexPlugin.keywords) !== JSON.stringify(plugin.keywords) ||
    codexPlugin.author?.name !== plugin.author?.name ||
    codexPlugin.apps !== plugin.extensions?.["com.openai"]?.apps ||
    codexPlugin.skills !== "./skills" ||
    JSON.stringify(codexPlugin.interface) !==
      JSON.stringify(plugin.extensions?.["com.openai"]?.interface)
  ) {
    throw new Error("plugin.json and .codex-plugin/plugin.json are out of sync.");
  }

  const shortDescription = plugin.extensions?.["com.openai"]?.interface?.shortDescription;
  if (
    !Array.isArray(plugin.keywords) ||
    plugin.keywords.length === 0 ||
    typeof shortDescription !== "string" ||
    shortDescription.length > 30
  ) {
    throw new Error("Add plugin keywords and keep shortDescription at or below 30 characters.");
  }

  const openAi = plugin.extensions?.["com.openai"];
  if (openAi?.apps !== "./.app.json") {
    throw new Error("The OpenAI app binding must point to ./.app.json.");
  }

  const app = appManifest.apps?.[plugin.name];
  if (!app?.id || app.required !== true) {
    throw new Error(".app.json must require the existing Nemlig Assistant app.");
  }

  const production = cloudflareConfig.env?.production;
  const productionVars = production?.vars;
  const hostedUrl = productionVars?.NEMLIG_MCP_PUBLIC_URL;
  const hostedOrigin = typeof hostedUrl === "string" ? new URL(hostedUrl) : null;
  const hasCustomDomain = production?.routes?.some((route) =>
    route.custom_domain === true && route.pattern === hostedOrigin?.hostname,
  );
  if (
    hostedApp.appId !== app.id ||
    hostedApp.mcpUrl !== hostedUrl ||
    hostedApp.oauthIssuer !== productionVars?.NEMLIG_MCP_AUTH0_ISSUER ||
    hostedApp.oauthAudience !== productionVars?.NEMLIG_MCP_AUTH0_AUDIENCE ||
    hostedApp.cloudflareWorker !== production?.name ||
    hostedApp.cloudflareCustomDomain !== hostedOrigin?.hostname ||
    hostedApp.repositoryConfig !== "apps/nemlig-assistant/wrangler.jsonc" ||
    hostedApp.archiveConfig !== "cloudflare/wrangler.jsonc" ||
    !hasCustomDomain
  ) {
    throw new Error("hosted-app.json must match the app binding and production Cloudflare configuration.");
  }

  const icon = openAi.interface?.logo;
  if (!icon || openAi.interface?.composerIcon !== icon || !icon.startsWith("./")) {
    throw new Error("The logo and composer icon must use the same package-local image.");
  }

  const iconBytes = readFileSync(resolve(packageRoot, icon.slice(2)));
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    !iconBytes.subarray(0, pngSignature.length).equals(pngSignature) ||
    iconBytes.readUInt32BE(16) !== 1024 ||
    iconBytes.readUInt32BE(20) !== 1024
  ) {
    throw new Error("The configured icon must be a valid 1024 x 1024 PNG.");
  }

  const serverSource = readFileSync(resolve(appRoot, "src/mcp.ts"), "utf8");
  const embeddedIcon = serverSource.match(/export const NEMLIG_ICON\s*=\s*"data:image\/png;base64,([^"]+)"/);
  if (!embeddedIcon || !Buffer.from(embeddedIcon[1], "base64").equals(iconBytes)) {
    throw new Error("The plugin icon must match the icon configured by the existing MCP app.");
  }

  const skillsDirectory = resolve(packageRoot, "skills");
  if (!readFileSync(resolve(skillsDirectory, "grocery-shopping/SKILL.md"), "utf8")) {
    throw new Error("The grocery shopping skill is missing or empty.");
  }

  if (!readFileSync(resolve(packageRoot, "README.md"), "utf8")) {
    throw new Error("The packaged README is missing or empty.");
  }
}

function isInside(parent, target) {
  return target === parent || target.startsWith(`${parent}${sep}`);
}
