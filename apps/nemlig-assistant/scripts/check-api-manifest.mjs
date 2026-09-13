/* global console, process */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(appRoot, "nemlig-api.openapi.json");
const clientPath = resolve(appRoot, "src/client.ts");
const methods = new Set(["delete", "get", "head", "options", "patch", "post", "put", "trace"]);
const usages = new Set(["client-used", "client-used-and-observed", "observed-only"]);
const bases = {
  API_BASE_URL: "https://www.nemlig.com/webapi",
  SEARCH_GATEWAY_URL: "https://webapi.prod.knl.nemlig.it/searchgateway/api",
};

const pathSignature = (path) => path.split("/").map((part) => (/^\{[^}]+\}$/u.test(part) ? "{}" : part)).join("/");

const endpointKey = (host, path) => `${host}${pathSignature(path)}`;

export function extractClientEndpoints(source) {
  const endpoints = new Set();

  for (const line of source.split("\n")) {
    for (const [identifier, base] of Object.entries(bases)) {
      const marker = `\${${identifier}}`;
      const start = line.indexOf(marker);
      if (start < 0) continue;
      let suffix = line.slice(start + marker.length).split("`", 1)[0];
      const query = suffix.indexOf("?${");
      if (query >= 0) suffix = suffix.slice(0, query);
      suffix = suffix.replace(/\$\{[^}]+\}/gu, "{value}");
      if (!suffix.startsWith("/")) continue;
      const url = new URL(base);
      endpoints.add(endpointKey(url.host, `${url.pathname}${suffix}`));
    }

    if (line.includes('"https://www.nemlig.com/?GetAsJson=1"')) {
      endpoints.add(endpointKey("www.nemlig.com", "/"));
    }

    const page = line.match(/new URL\(("[^"]+"|path), "https:\/\/www\.nemlig\.com"\)/u);
    if (page) {
      const path = page[1] === "path" ? "/{cataloguePath}" : JSON.parse(page[1]);
      endpoints.add(endpointKey("www.nemlig.com", path));
    }
  }

  return endpoints;
}

function manifestOperations(manifest) {
  if (!manifest.paths || typeof manifest.paths !== "object" || Array.isArray(manifest.paths)) return [];
  return Object.entries(manifest.paths).flatMap(([path, item]) =>
    Object.entries(item).flatMap(([method, operation]) => methods.has(method)
      ? [{ method, path, operation }]
      : []),
  );
}

export function validateApiManifest(manifest, clientSource) {
  const errors = [];
  if (typeof manifest.openapi !== "string" || !manifest.openapi.startsWith("3.1.")) {
    errors.push("manifest.openapi must select an OpenAPI 3.1 patch version");
  }
  if (!manifest.info?.title || !manifest.info?.version || !manifest["x-nemlig"]?.lastObserved) {
    errors.push("manifest info and x-nemlig.lastObserved are required");
  }

  const operations = manifestOperations(manifest);
  const operationIds = new Set();
  const documentedClientEndpoints = new Set();
  for (const { method, path, operation } of operations) {
    const id = operation?.operationId;
    const metadata = operation?.["x-nemlig"];
    if (!id) errors.push(`${method.toUpperCase()} ${path} is missing operationId`);
    else if (operationIds.has(id)) errors.push(`duplicate operationId: ${id}`);
    else operationIds.add(id);
    if (!metadata || !usages.has(metadata.usage) || !metadata.confidence || !metadata.safety || !metadata.evidence?.length) {
      errors.push(`${method.toUpperCase()} ${path} is missing complete x-nemlig metadata`);
      continue;
    }
    if (!metadata.usage.startsWith("client-used")) continue;
    const serverUrl = operation.servers?.[0]?.url ?? manifest.servers?.[0]?.url;
    if (!serverUrl) {
      errors.push(`${method.toUpperCase()} ${path} has no server`);
      continue;
    }
    documentedClientEndpoints.add(endpointKey(new URL(serverUrl).host, path));
  }

  const sourceEndpoints = extractClientEndpoints(clientSource);
  for (const endpoint of sourceEndpoints) {
    if (!documentedClientEndpoints.has(endpoint)) errors.push(`client endpoint is missing from manifest: ${endpoint}`);
  }
  for (const endpoint of documentedClientEndpoints) {
    if (!sourceEndpoints.has(endpoint)) errors.push(`manifest client endpoint is missing from source: ${endpoint}`);
  }
  return errors;
}

async function main() {
  const [manifestText, clientSource] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(clientPath, "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  const errors = validateApiManifest(manifest, clientSource);
  if (errors.length) throw new Error(errors.join("\n"));
  const operations = manifestOperations(manifest);
  const clientUsed = operations.filter(({ operation }) => operation["x-nemlig"].usage.startsWith("client-used")).length;
  console.log(`Nemlig API manifest: ${operations.length} operations (${clientUsed} client-used, ${operations.length - clientUsed} observed-only).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
