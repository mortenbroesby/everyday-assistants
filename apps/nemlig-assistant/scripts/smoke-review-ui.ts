/** Loopback-only browser smoke host: real MCP adapter + review service, fake catalogue. */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpServer } from "../src/mcp.js";
import type { Product, ShoppingClient } from "../src/client.js";
import { PRODUCT_VIEWER_RESOURCE_URI } from "../src/product-viewer.js";

let writes = 0;
const denied = async (): Promise<never> => { writes++; throw new Error("Provider basket access forbidden in this smoke"); };
const product = (id: number): Product => ({ id, name: `Smoke product ${id}`, price: id * 5, available: true,
  unit: "kr/kg", unitPrice: id * 5, unitSize: "1 kg", brand: "Fixture", category: "Test", subcategory: "Test", imageUrl: "", labels: [],
  isOrganic: false, isFrozen: false, isRefrigerated: false, isDairy: false, isLactoseFree: false, isGlutenFree: false, isVegan: false, isOnDiscount: false });
const catalogue = {
  isLoggedIn: () => true, login: async () => {}, getProduct: async (id: number) => product(id),
  getFreshProduct: async (id: number) => product(id), searchProducts: async () => [product(1), product(2), product(3)],
  getCart: denied, addToCart: denied, removeFromCart: denied, clearCart: denied,
} as unknown as ShoppingClient;
const makeServer = () => createMcpServer(catalogue, async () => undefined);
let current = makeServer();
const handler = createMcpHandler(() => current, { legacy: "reject" });
const mcpHandler = toNodeHandler(handler);
const client = new Client({ name: "review-ui-smoke", version: "1" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
const page = `<!doctype html><html><body><h1>Review recovery smoke</h1>
<button id="start">Start sample review</button><button id="reset">Simulate server restart</button><button id="replace">Create current review without updating card</button>
<output id="status">Ready</output><iframe id="viewer" src="/viewer" style="width:100%;height:760px"></iframe>
<script>
const frame = document.getElementById('viewer'), status = document.getElementById('status');
const call = args => fetch('/call', {method:'POST',body:JSON.stringify(args)}).then(r=>r.json());
document.getElementById('start').onclick = async () => {
 const result = await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}]}});
 frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},location.origin);
 status.textContent='Review shown';
};
document.getElementById('replace').onclick = async () => { await call({name:'start_product_review',arguments:{items:[{product_id:3,quantity:4}]}}); status.textContent='Current review created; old card retained'; };
document.getElementById('reset').onclick = async () => { await fetch('/reset',{method:'POST'}); status.textContent='Server restarted; old card retained'; };
window.addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow || event.origin!==location.origin)return;
 const m=event.data;
 if(m.method==='ui/initialize')frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{}}},location.origin);
 if(m.method==='tools/call'){
  const result=await call(m.params);
  // Reproduce ChatGPT wrapping a tool error as a JSON-RPC exception.
  const response=result.isError ? {error:{code:-32602,message:'Error code: INVALID_ARGUMENT; Error calling MCP tool: '+result.content.map(c=>c.text||'').join(' ')}} : {result};
  frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,...response},location.origin);
 }
});
</script></body></html>`;
const server = createServer((req, res) => {
  if (req.url === "/mcp") { void mcpHandler(req, res); return; }
  void (async () => {
    if (req.url === "/") { res.setHeader("content-type", "text/html"); res.end(page); return; }
    if (req.url === "/viewer") {
      const resource = (await client.readResource({ uri: PRODUCT_VIEWER_RESOURCE_URI })).contents[0];
      res.setHeader("content-type", "text/html"); res.end(resource && "text" in resource ? resource.text : "Missing viewer"); return;
    }
    if (req.url === "/reset" && req.method === "POST") { current = makeServer(); res.end("reset"); return; }
    if (req.url === "/stats") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ providerBasketCalls: writes })); return; }
    if (req.url === "/call" && req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) { chunks.push(Buffer.from(chunk)); if (Buffer.concat(chunks).length > 16384) throw new Error("Input too large"); }
      const input = JSON.parse(Buffer.concat(chunks).toString()) as { name: string; arguments: Record<string, unknown> };
      if (!["start_product_review", "update_product_review"].includes(input.name) || (input.arguments.action as { kind?: string })?.kind === "prepare_submission") throw new Error("Only local review controls are permitted");
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify(await client.callTool(input))); return;
    }
    res.statusCode = 404; res.end();
  })().catch(() => { res.statusCode = 500; res.end("Smoke request failed"); });
});
server.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", origin)));
console.log(`Review UI smoke: ${origin}`);
console.log("Exercise normal controls, restart with an old card visible, recover explicitly, and check /stats for zero provider basket calls.");
