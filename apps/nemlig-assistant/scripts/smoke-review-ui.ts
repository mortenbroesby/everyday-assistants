/** Loopback-only browser smoke host: real MCP adapter + review service, fake catalogue. */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpServer } from "../src/mcp.js";
import type { Product, ShoppingClient } from "../src/client.js";
import { PRODUCT_VIEWER_RESOURCE_URI } from "../src/product-viewer.js";
import { RETIRED_PRODUCT_VIEWER_RESOURCE_URIS } from "../src/product-viewer-identity.js";

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
<button id="run">Run regression smoke</button><button id="retired">Show retired card</button><output id="status">Ready</output><iframe id="viewer" src="/viewer" style="width:100%;height:760px"></iframe>
<script>
const frame = document.getElementById('viewer'), status = document.getElementById('status');
let transcript, offline = false;
const widgetCalls = [];
const publish = () => frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:transcript},location.origin);
const call = args => fetch('/call', {method:'POST',body:JSON.stringify(args)}).then(r=>r.json());
document.getElementById('start').onclick = async () => {
 transcript = await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}]}});
 publish();
 status.textContent='Review shown';
};
document.getElementById('retired').onclick = () => { frame.src='/retired'; status.textContent='Retired card: no shopping calls'; };
document.getElementById('replace').onclick = async () => { await call({name:'start_product_review',arguments:{items:[{product_id:3,quantity:4}]}}); status.textContent='Current review created; old card retained'; };
document.getElementById('reset').onclick = async () => { await fetch('/reset',{method:'POST'}); status.textContent='Server restarted; old card retained'; };
window.addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow || event.origin!==location.origin)return;
 const m=event.data;
 if(m.method==='ui/initialize')frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{}}},location.origin);
 if(m.method==='ui/notifications/initialized' && transcript)publish();
 if(m.method==='ui/message'){ status.textContent='PASS: retired card requested current review in conversation'; frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result:{}},location.origin); }
 if(m.method==='tools/call'){
  widgetCalls.push(m.params);
  const result=offline ? {isError:true,content:[{type:'text',text:'Service Unavailable: private trace'}]} : await call(m.params);
  // Reproduce ChatGPT wrapping a tool error as a JSON-RPC exception.
  const response=result.isError ? {error:{code:-32602,message:'Error code: INVALID_ARGUMENT; Error calling MCP tool: '+result.content.map(c=>c.text||'').join(' ')}} : {result};
  frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,...response},location.origin);
 }
});
// Runs against the actual iframe DOM, MCP transport and draft service. No provider access.
document.getElementById('run').onclick = async () => {
 const run = document.getElementById('run'); run.disabled = true;
 const doc = () => frame.contentDocument;
 const text = () => doc().querySelector('main')?.textContent || '';
 const button = label => [...doc().querySelectorAll('button')].find(b=>b.textContent===label);
 const check = (condition, label) => { if(!condition)throw new Error(label); };
 const wait = async predicate => {
  const until=Date.now()+5000;
  while(!predicate()){if(Date.now()>until)throw new Error('Timed out: '+status.textContent); await new Promise(r=>setTimeout(r,25));}
 };
 const click = label => { const b=button(label); check(b && !b.disabled,'Missing enabled control: '+label); b.click(); };
 const select = () => { const input=doc().querySelector('input[type=checkbox]'); check(input,'No product checkbox'); input.click(); };
 try {
  status.textContent='Checking inactive snapshots';
  if (new URL(frame.src).pathname !== '/viewer') { transcript=undefined; frame.src='/viewer'; await wait(()=>doc()?.querySelector('#products')); }
  await fetch('/reset',{method:'POST'});
  widgetCalls.length=0; await document.getElementById('start').onclick();
  await wait(()=>button('Open current review'));
  check(widgetCalls.length===0 && !doc().querySelector('input'),'Historical payload performed work');
  click('Open current review'); await wait(()=>button('Needs review (2)') && !button('Needs review (2)').disabled);
  select(); click('Add selected to local Basket (1)'); await wait(()=>button('Basket (1)') && !button('Basket (1)').disabled);
  status.textContent='Checking remount'; const beforeMount=widgetCalls.length;
  frame.src='/viewer'; await wait(()=>button('Open current review'));
  check(widgetCalls.length===beforeMount,'Remount called backend');
  click('Open current review'); await wait(()=>button('Basket (1)') && !button('Basket (1)').disabled);
  status.textContent='Checking stale revision without replay';
  const current=(await call({name:'update_product_review',arguments:{action:{kind:'show'}}})).structuredContent.review;
  await call({name:'update_product_review',arguments:{review_id:current.review_id,revision:current.revision,action:{kind:'quantity',product_id:1,quantity:3}}});
  const beforeConflict=widgetCalls.length;
  select(); click('Add selected to local Basket (1)'); await wait(()=>text().includes('Your last action was not applied'));
  check(widgetCalls.length===beforeConflict+2,'Conflict must make one edit attempt and one read');
  check(widgetCalls.at(-1).arguments.action.kind==='show','Conflict recovery was not read-only');
  check(button('Basket (1)') && !doc().querySelector('input:checked'),'Conflict changed acceptance');
  status.textContent='Checking connection failure'; offline=true; click('Refresh review'); await wait(()=>button('Open current review'));
  check(!doc().querySelector('input') && !/INVALID_ARGUMENT|private trace/.test(text()),'Failure leaked details or editable snapshot');
  offline=false; click('Open current review'); await wait(()=>button('Basket (1)') && !button('Basket (1)').disabled);
  status.textContent='Checking process restart'; await fetch('/reset',{method:'POST'});
  select(); click('Add selected to local Basket (1)'); await wait(()=>button('Start new review'));
  click('Start new review'); await wait(()=>button('Needs review (2)') && !button('Needs review (2)').disabled);
  check(button('Basket (0)') && !doc().querySelector('input:checked') && text().includes('3 packages'),'Restart restored acceptance or lost quantities');
  click('Finish shopping'); click('Discard local basket'); await wait(()=>text().includes('Shopping finished'));
  const stats=await fetch('/stats').then(r=>r.json()); check(stats.providerBasketCalls===0,'Provider basket accessed');
  status.textContent='PASS: inactive mount, remount, stale revision, outage, restart, finish; provider basket calls 0';
 } catch(error) { status.textContent='FAIL: '+error.message; }
 finally { offline=false; run.disabled=false; }
};
</script></body></html>`;
const server = createServer((req, res) => {
  if (req.url === "/mcp") { void mcpHandler(req, res); return; }
  void (async () => {
    if (req.url === "/") { res.setHeader("content-type", "text/html"); res.end(page); return; }
    if (req.url === "/viewer" || req.url === "/retired") {
      const resource = (await client.readResource({ uri: req.url === "/retired" ? RETIRED_PRODUCT_VIEWER_RESOURCE_URIS[0] : PRODUCT_VIEWER_RESOURCE_URI })).contents[0];
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
