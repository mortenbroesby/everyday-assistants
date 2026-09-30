/** Loopback-only MCP Apps smoke host for the read-only visual provider basket. */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { Product, ShoppingClient } from "../src/client.js";
import { createMcpServer } from "../src/mcp.js";
import { PRODUCT_VIEWER_RESOURCE_URI } from "../src/product-viewer.js";

const fixtureImage = "https://www.nemlig.com/scommerce/images/smoerbar-saltet.jpg?i=UEzG6FXM/104373";
const product = (id: number): Product => ({
  id, name: `Smoke product ${id}`, price: 10, unit: "kr/stk", unitPrice: 10, unitSize: "1 package",
  brand: "Fixture", category: "Test", subcategory: "Test", imageUrl: fixtureImage, available: true,
  labels: [], isOrganic: false, isFrozen: false, isRefrigerated: false, isDairy: false,
  isLactoseFree: false, isGlutenFree: false, isVegan: false, isOnDiscount: false,
});
let basketReads = 0;
let productReads = 0;
let writes = 0;
const denied = async (): Promise<never> => { writes++; throw new Error("Provider basket mutation forbidden in this smoke"); };
const fixture = {
  isLoggedIn: () => true, login: async () => {},
  getCart: async () => {
    basketReads++;
    return { items: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `Smoke product ${index + 1}`, quantity: 2, total: 20 })), productsPrice: 120, deliveryPrice: 0, numberOfProducts: 12, deliveryTime: undefined };
  },
  getProduct: async (id: number) => { productReads++; return product(id); },
  addToCart: denied,
} as unknown as ShoppingClient;
const server = createMcpServer(fixture, async () => undefined);
const handler = createMcpHandler(() => server, { legacy: "reject" });
const mcpHandler = toNodeHandler(handler);
const client = new Client({ name: "visual-basket-smoke", version: "1" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
const page = `<!doctype html><html><body><h1>Visual basket smoke</h1>
<button id="show">Show basket visually</button><output id="status">Ready</output>
<iframe id="viewer" src="/viewer" style="width:100%;height:900px"></iframe>
<script>
const frame=document.getElementById('viewer'),status=document.getElementById('status');
let result;
const publish=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},location.origin);
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow||event.origin!==location.origin)return;
 const message=event.data;
 if(message.method==='ui/initialize')frame.contentWindow.postMessage({jsonrpc:'2.0',id:message.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{}}},location.origin);
 if(message.method==='ui/notifications/initialized'&&result)publish();
});
document.getElementById('show').onclick=async()=>{
 const response=await fetch('/call',{method:'POST'});
 result=await response.json();
 if(result.isError){status.textContent='FAIL: '+result.content?.[0]?.text;return;}
 publish();
 const doc=frame.contentDocument;
 const until=Date.now()+5000;
 while(doc.querySelectorAll('#products article').length!==6&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,25));
 const images=[...doc.querySelectorAll('#products img')];
 await Promise.all(images.map(image=>image.decode().catch(()=>{})));
 const stats=await fetch('/stats').then(r=>r.json());
 if(doc.querySelector('#title')?.textContent!=='Actual Nemlig basket'||images.length!==6||images.some(image=>image.naturalWidth===0)||doc.querySelector('input, #actions:not([hidden])')||stats.basketReads!==1||stats.productReads!==6||stats.writes!==0){status.textContent='FAIL: visual basket contract';return;}
 status.textContent='PASS: six visible basket images, one basket read, six detail reads, zero writes';
};
</script></body></html>`;
const web = createServer((req, res) => {
  if (req.url === "/mcp") { void mcpHandler(req, res); return; }
  void (async () => {
    if (req.url === "/") { res.setHeader("content-type", "text/html"); res.end(page); return; }
    if (req.url === "/viewer") {
      const resource = (await client.readResource({ uri: PRODUCT_VIEWER_RESOURCE_URI })).contents[0];
      res.setHeader("content-type", "text/html"); res.end(resource && "text" in resource ? resource.text : "Missing viewer"); return;
    }
    if (req.url === "/call" && req.method === "POST") {
      const result = await client.callTool({ name: "show_my_basket_visually", arguments: {} });
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify(result)); return;
    }
    if (req.url === "/stats") {
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ basketReads, productReads, writes })); return;
    }
    res.statusCode = 404; res.end();
  })().catch(() => { res.statusCode = 500; res.end("Smoke request failed"); });
});
web.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => web.once("listening", resolve));
const origin = `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", origin)));
console.log(`Visual basket smoke: ${origin}`);
