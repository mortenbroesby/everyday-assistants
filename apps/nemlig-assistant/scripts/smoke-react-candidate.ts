import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright";
import type { ProductView } from "../src/product-presentation.js";

declare global {
  interface Window {
    hostEvents: string[];
    hostMessages: string[];
  }
}

const htmlPath = new URL("../.candidate-dist/picker.html", import.meta.url);
const html = await readFile(htmlPath, "utf8");
const view: ProductView = {
  context: "search",
  status: "complete",
  product: {
    id: 42,
    name: "Candidate product",
    price: 18.5,
    unit_price: 37,
    unit: "kr/kg",
    unit_size: "500 g",
    currency: "DKK",
    brand: "Fixture",
    available: true,
    is_organic: true,
    is_frozen: false,
    is_on_discount: false,
    image_url: "https://example.com/must-not-load.png",
    description: "Synthetic detail for the browser smoke test.",
    declaration: "Synthetic declaration.",
    details: [{ key: "Origin", value: "Fixture" }],
    labels: ["Available"],
    tags: [],
  },
};

const fixture = JSON.stringify([view]);
const server = createServer((request, response) => {
  if (request.url === "/candidate") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html);
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html><style>html,body{width:100%;height:100%;margin:0}iframe{display:block;width:100vw;height:100vh;border:0}</style><iframe title="candidate" src="/candidate"></iframe><script>
    window.hostEvents = [];
    window.hostMessages = [];
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || message.jsonrpc !== "2.0") return;
      window.hostMessages.push(message.method || "response");
      if (message.method === "ui/initialize" && message.id !== undefined) {
        event.source.postMessage({ jsonrpc: "2.0", id: message.id, result: {
          protocolVersion: message.params.protocolVersion,
          hostInfo: { name: "synthetic-smoke-host", version: "1.0.0" },
          hostCapabilities: {}, hostContext: {}
        } }, "*");
      }
      if (message.method === "ui/notifications/initialized") {
        window.hostEvents.push("initialized");
        event.source.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: {
          structuredContent: { views: ${fixture} }
        } }, "*");
      }
    });
  </script>`);
});
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start the synthetic MCP Apps host.");

const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 780 }, colorScheme: "light" });
  const externalRequests: string[] = [];
  await context.route("**/*", async (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:")) await route.continue();
    else { externalRequests.push(route.request().url()); await route.abort(); }
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/host`);
  const candidate = page.frameLocator("iframe[title=candidate]");
  await page.waitForFunction(() => window.hostEvents.length > 0, { timeout: 10_000 }).catch(async () => {
    const diagnostic = await page.evaluate(() => {
      return { events: window.hostEvents, messages: window.hostMessages };
    });
    throw new Error(`MCP Apps candidate did not initialize: ${JSON.stringify({ diagnostic, errors })}`);
  });
  await candidate.getByText("Candidate product").waitFor();
  await candidate.getByText("Product ID: 42").waitFor({ state: "hidden" });
  await candidate.locator(".product-summary").click();
  await candidate.locator(".product-fact > summary").first().click();
  await candidate.getByText("Synthetic detail for the browser smoke test.").waitFor();
  assert.deepEqual(await page.evaluate(() => window.hostEvents), ["initialized"], "candidate did not complete the MCP Apps initialization handshake");
  assert.equal(await candidate.locator("body").evaluate((node) => node.scrollWidth), 320, "candidate overflows a 320px viewport");
  assert.deepEqual(externalRequests, [], "candidate requested an external resource");
  assert.deepEqual(errors, [], "candidate raised browser errors");
  await context.close();
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

console.log("React candidate MCP Apps browser smoke passed at 320px with synthetic, read-only product data.");
