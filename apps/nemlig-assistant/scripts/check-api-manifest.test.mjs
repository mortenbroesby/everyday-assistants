import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { extractClientEndpoints, validateApiManifest } from "./check-api-manifest.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [manifest, clientSource] = await Promise.all([
  readFile(resolve(appRoot, "nemlig-api.openapi.json"), "utf8").then(JSON.parse),
  readFile(resolve(appRoot, "src/client.ts"), "utf8"),
]);

test("the API manifest covers every endpoint referenced by the Nemlig client", () => {
  assert.deepEqual(validateApiManifest(manifest, clientSource), []);
});

test("missing manifest operations fail the drift check", () => {
  const incomplete = JSON.parse(JSON.stringify(manifest));
  delete incomplete.paths["/webapi/Token"];
  assert.match(validateApiManifest(incomplete, clientSource).join("\n"), /client endpoint is missing from manifest.*Token/u);
});

test("new unrecorded client endpoints fail the drift check", () => {
  const changedSource = `${clientSource}\nconst undocumented = \`\${API_BASE_URL}/NewEndpoint\`;\n`;
  assert.match(validateApiManifest(manifest, changedSource).join("\n"), /client endpoint is missing from manifest.*NewEndpoint/u);
});

test("endpoint extraction normalizes dynamic path segments", () => {
  const source = "const endpoint = `${API_BASE_URL}/${stamp}/${slot}/1/${user}/Products/Get`;";
  assert.deepEqual([...extractClientEndpoints(source)], ["www.nemlig.com/webapi/{}/{}/1/{}/Products/Get"]);
});
