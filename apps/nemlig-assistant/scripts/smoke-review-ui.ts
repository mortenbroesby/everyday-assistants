/** Loopback-only browser smoke host: real MCP adapter + review service, fake catalogue. */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpServer } from "../src/mcp.js";
import type { Product, ShoppingClient } from "../src/client.js";
import { PRODUCT_VIEWER_RESOURCE_URI } from "../src/product-viewer.js";

let basketReads = 0, writes = 0;
const denied = async (): Promise<never> => { writes++; throw new Error("Provider basket write forbidden in this smoke"); };
const product = (id: number): Product => ({ id, name: `Smoke product ${id}`, price: id * 5, available: true,
  unit: "kr/kg", unitPrice: id * 5, unitSize: "1 kg", brand: "Fixture", category: "Test", subcategory: "Test", imageUrl: "", labels: [],
  isOrganic: false, isFrozen: false, isRefrigerated: false, isDairy: false, isLactoseFree: false, isGlutenFree: false, isVegan: false, isOnDiscount: false });
const catalogue = {
  isLoggedIn: () => true, login: async () => {}, getProduct: async (id: number) => product(id),
  getFreshProduct: async (id: number) => product(id), searchProducts: async () => [product(1), product(2), product(3)],
  getCart: async () => { basketReads++; return { items: [], productsPrice: 0, deliveryPrice: 0, numberOfProducts: 0, deliveryTime: "smoke" }; },
  addToCart: denied,
} as unknown as ShoppingClient;
const makeServer = () => createMcpServer(catalogue, async () => undefined);
let current = makeServer();
const retiredV6 = "ui://nemlig/product-viewer-v6.html";
const handler = createMcpHandler(() => current, { legacy: "reject" });
const mcpHandler = toNodeHandler(handler);
const client = new Client({ name: "review-ui-smoke", version: "1" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
const page = `<!doctype html><html><body><h1>Selection recovery smoke</h1>
<button id="start">Start sample selection</button><button id="reset">Simulate server restart</button><button id="replace">Create current selection without updating card</button>
<button id="run">Run regression smoke</button><button id="flow">Run continuous local flow</button><button id="retired">Show retired v6 card</button><output id="status">Ready</output><iframe id="viewer" src="/viewer" style="width:100%;height:760px"></iframe>
<script>
const frame = document.getElementById('viewer'), status = document.getElementById('status');
let transcript, offline = false, initialized = false;
const widgetCalls = [];
const publish = () => frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:transcript},location.origin);
const call = args => fetch('/call', {method:'POST',body:JSON.stringify(args)}).then(r=>r.json());
document.getElementById('start').onclick = async () => {
 transcript = await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}]}});
 publish();
 status.textContent='Selection shown';
};
document.getElementById('retired').onclick = () => { frame.src='/retired'; status.textContent='Retired card: no shopping calls'; };
document.getElementById('replace').onclick = async () => { await call({name:'start_product_review',arguments:{items:[{product_id:3,quantity:4}]}}); status.textContent='Current selection created; old card retained'; };
document.getElementById('reset').onclick = async () => { await fetch('/reset',{method:'POST'}); status.textContent='Server restarted; old card retained'; };
window.addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow || event.origin!==location.origin)return;
 const m=event.data;
 if(m.method==='ui/initialize')frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{}}},location.origin);
 if(m.method==='ui/notifications/initialized'){ initialized=true; if(transcript)publish(); }
 if(m.method==='ui/message'){ status.textContent='PASS: retired card requested current selection in conversation'; frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result:{}},location.origin); }
 if(m.method==='tools/call'){
  widgetCalls.push(m.params);
  const result=offline ? {isError:true,content:[{type:'text',text:'Service Unavailable: private trace'}]} : await call(m.params);
  // Reproduce ChatGPT wrapping a tool error as a JSON-RPC exception.
  const response=result.isError ? {error:{code:-32602,message:'Error code: INVALID_ARGUMENT; Error calling MCP tool: '+result.content.map(c=>c.text||'').join(' ')}} : {result};
  frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,...response},location.origin);
  if (!result.isError) frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},location.origin);
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
  const select = async () => { await wait(()=>doc().querySelector('input[type=checkbox]')); doc().querySelector('input[type=checkbox]').click(); };
  try {
  await fetch('/reset',{method:'POST'});
  widgetCalls.length=0; await document.getElementById('start').onclick();
  status.textContent='Checking retired v6 resource'; frame.src='/retired';
  await wait(()=>doc()?.querySelector('#open'));
  check(doc().querySelector('h1')?.textContent==='This selection card is retired'&&!doc().querySelector('#products'),'Retired v6 hydrated selection data');
  click('Open current selection'); await wait(()=>status.textContent==='PASS: retired card requested current selection in conversation');
  const retiredStats=await fetch('/stats').then(r=>r.json());
  check(widgetCalls.length===0&&retiredStats.providerBasketCalls===0,'Retired v6 made shopping calls');
  status.textContent='Checking inactive snapshots'; frame.src='/viewer'; await wait(()=>button('Open current selection'));
  check(widgetCalls.length===0 && !doc().querySelector('input'),'Historical payload performed work');
  click('Open current selection'); await wait(()=>button('To decide (2)') && !button('To decide (2)').disabled);
  await select(); click('Add 1 to Ready'); await wait(()=>button('Ready (1)') && !button('Ready (1)').disabled);
  check(!button('Open current selection'),'Local acceptance collapsed the mounted frame');
  click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready' && !button('Ready (1)').disabled);
  check(!button('Choose alternative'),'Ready offered alternatives');
  const canonical=(await call({name:'update_product_review',arguments:{action:{kind:'show'}}})).structuredContent.review;
  check(canonical.destination==='ready'&&canonical.items.find(item=>item.product_id===1)?.state==='ready','Wire review is not canonical Ready');
  check(!button('Open current selection'),'Ready navigation collapsed the mounted frame');
  click('To decide (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='To decide' && !button('To decide (1)').disabled);
  check(!!button('Choose alternative'),'To decide omitted alternatives');
  check(!button('Open current selection'),'Return navigation collapsed the mounted frame');
  status.textContent='Checking remount'; const beforeMount=widgetCalls.length;
  frame.src='/viewer'; await wait(()=>button('Open current selection'));
  check(widgetCalls.length===beforeMount,'Remount called backend');
  click('Open current selection'); await wait(()=>button('Ready (1)') && !button('Ready (1)').disabled);
  status.textContent='Checking stale revision without replay';
  const current=(await call({name:'update_product_review',arguments:{action:{kind:'show'}}})).structuredContent.review;
  await call({name:'update_product_review',arguments:{review_id:current.review_id,revision:current.revision,action:{kind:'quantity',product_id:1,quantity:3}}});
  const beforeConflict=widgetCalls.length;
  await select(); click('Add 1 to Ready'); await wait(()=>text().includes('Your last action was not applied'));
  check(widgetCalls.length===beforeConflict+2,'Conflict must make one edit attempt and one read');
  check(widgetCalls.at(-1).arguments.action.kind==='show','Conflict recovery was not read-only');
  check(button('Ready (1)') && !doc().querySelector('input:checked'),'Conflict changed acceptance');
  status.textContent='Checking connection failure'; offline=true; click('Refresh selection'); await wait(()=>button('Open current selection'));
  check(!doc().querySelector('input') && !/INVALID_ARGUMENT|private trace/.test(text()),'Failure leaked details or editable snapshot');
  offline=false; click('Open current selection'); await wait(()=>button('Ready (1)') && !button('Ready (1)').disabled);
  status.textContent='Checking process restart'; await fetch('/reset',{method:'POST'});
  await select(); click('Add 1 to Ready'); await wait(()=>button('Start new selection'));
  click('Start new selection'); await wait(()=>button('To decide (2)') && !button('To decide (2)').disabled);
  check(button('Ready (0)') && !doc().querySelector('input:checked') && [...doc().querySelectorAll('#products .basket-quantity')].some(node=>node.textContent.startsWith('3')),'Restart restored acceptance or lost quantities');
  click('Clear selection and start over'); click('Discard selection'); await wait(()=>doc().querySelector('#title')?.textContent==='What should we shop for?');
  const stats=await fetch('/stats').then(r=>r.json()); check(stats.providerBasketCalls===0,'Provider basket accessed');
  status.textContent='Checking prepare only'; await document.getElementById('start').onclick();
  await wait(()=>button('Open current selection')); click('Open current selection'); await wait(()=>button('To decide (2)'));
  await select(); click('Add 1 to Ready'); await wait(()=>button('Ready (1)')&&!button('Ready (1)').disabled);
  click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&!button('Ready (1)').disabled);
  click('Send to Nemlig basket'); await wait(()=>doc().querySelector('#submission h2')?.textContent==='Confirm the exact Nemlig change');
  const prepared=await fetch('/stats').then(r=>r.json());
  check(widgetCalls.at(-1).arguments.action.kind==='prepare_submission','Send did not prepare a review');
  check(prepared.basketReads===1&&prepared.basketWrites===0,'Prepare crossed the wrong provider boundary');
  check(!!button('Add to Nemlig'),'Exact confirmation missing');
  check(widgetCalls.every(call=>!('representation' in call.arguments)),'Viewer sent a representation selector');
  status.textContent='PASS: retired v6, inactive mount, remount, stale revision, outage, restart, finish, prepare only; one fake basket read, zero writes';
 } catch(error) { status.textContent='FAIL: '+error.message; }
 finally { offline=false; run.disabled=false; }
};
document.getElementById('flow').onclick = async () => {
 const run=document.getElementById('flow'); run.disabled=true;
 const doc=()=>frame.contentDocument;
 const button=label=>[...doc().querySelectorAll('button')].find(b=>b.textContent===label);
 const check=(condition,label)=>{if(!condition)throw new Error(label);};
 const wait=async predicate=>{const until=Date.now()+15000;while(!predicate()){if(Date.now()>until)throw new Error('Timed out: '+status.textContent);await new Promise(r=>setTimeout(r,25));}};
 const click=label=>{const b=button(label);check(b&&!b.disabled,'Missing enabled control: '+label);b.click();};
 const open=()=>check(!button('Open current selection'),'The mounted review collapsed');
 const widths=async()=>{const original=frame.style.width;for(const width of [320,375]){frame.style.width=width+'px';await new Promise(requestAnimationFrame);check(doc().documentElement.scrollWidth<=doc().documentElement.clientWidth+1,width+'px viewer overflow');}frame.style.width=original;};
 try {
  status.textContent='Starting continuous local flow';
  widgetCalls.length=0;
  transcript=undefined; initialized=false; frame.src='/viewer'; await wait(()=>initialized&&doc()?.querySelector('#products'));
  await fetch('/reset',{method:'POST'});
  transcript=await call({name:'update_product_review',arguments:{action:{kind:'show'}}}); publish();
  await wait(()=>doc().querySelector('#title')?.textContent==='What should we shop for?'); await widths();
  await document.getElementById('start').onclick();
  await wait(()=>button('Open current selection')||button('To decide (2)'));
  if(button('Open current selection')) click('Open current selection');
  await wait(()=>button('To decide (2)')&&!button('To decide (2)').disabled); await widths();
  doc().querySelector('input[type=checkbox]').click(); click('Add 1 to Ready');
  await wait(()=>button('Ready (1)')&&!button('Ready (1)').disabled); open();
  click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&!button('Ready (1)').disabled); open(); await widths();
  check(!button('Choose alternative'),'Ready offered alternatives');
  status.textContent='Checking Ready quantity';
  doc().querySelector('#products article > details > summary').click();
  const plus=doc().querySelector('#products button[aria-label="Increase quantity of Smoke product 1"]'); check(plus,'Quantity control missing'); plus.click();
  await wait(()=>doc().querySelector('#products .basket-quantity')?.textContent?.startsWith('2')); open();
  status.textContent='Checking move back to To decide';
  click('Move to To decide'); await wait(()=>button('To decide (2)')&&!button('To decide (2)').disabled); open();
  click('To decide (2)'); await wait(()=>doc().querySelector('#title')?.textContent==='To decide'&&!button('To decide (2)').disabled);
  status.textContent='Checking alternatives';
  doc().querySelector('#products article > details > summary').click(); click('Choose alternative');
  await wait(()=>doc().querySelector('#title')?.textContent.startsWith('Choose alternative for')); open();
  const radio=doc().querySelector('input[type=radio]'); check(radio,'Alternative choice missing'); radio.click(); click('Use selected alternative');
  await wait(()=>doc().querySelector('#title')?.textContent==='To decide'&&button('To decide (2)')); open();
  doc().querySelector('input[type=checkbox]').click(); click('Add 1 to Ready');
  await wait(()=>button('Ready (1)')&&!button('Ready (1)').disabled); open();
  click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&!button('Ready (1)').disabled); open();
  click('Remove all Ready products'); check(button('Remove Ready products'),'Remove confirmation missing'); click('Remove Ready products');
  await wait(()=>button('Ready (0)')&&!button('Ready (0)').disabled); open();
  const remaining=(await call({name:'update_product_review',arguments:{action:{kind:'show'}}})).structuredContent.review.items;
  check(remaining.length===1&&remaining[0].product_id===2,'Remove all Ready products retained local rows');
  click('To decide (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='To decide'&&!button('To decide (1)').disabled); open();
  doc().querySelector('input[type=checkbox]').click(); click('Add 1 to Ready');
  await wait(()=>button('Ready (1)')&&!button('Ready (1)').disabled); open();
  click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&!button('Ready (1)').disabled); open(); await widths();
  const stats=await fetch('/stats').then(r=>r.json()); check(stats.providerBasketCalls===0,'Provider basket accessed');
  check(widgetCalls.every(call=>!('representation' in call.arguments)),'Viewer sent a representation selector');
  status.textContent='PASS: empty, activation, To decide, Ready, quantity, alternatives, remove, rebuild, 320/375px; provider basket calls 0';
 } catch(error){status.textContent='FAIL: '+error.message;} finally{run.disabled=false;}
};
</script></body></html>`;
const server = createServer((req, res) => {
  if (req.url === "/mcp") { void mcpHandler(req, res); return; }
  void (async () => {
    if (req.url === "/") { res.setHeader("content-type", "text/html"); res.end(page); return; }
    if (req.url === "/viewer" || req.url === "/retired") {
      const resource = (await client.readResource({ uri: req.url === "/retired" ? retiredV6 : PRODUCT_VIEWER_RESOURCE_URI })).contents[0];
      res.setHeader("content-type", "text/html"); res.end(resource && "text" in resource ? resource.text : "Missing viewer"); return;
    }
    if (req.url === "/reset" && req.method === "POST") { current = makeServer(); basketReads = 0; writes = 0; res.end("reset"); return; }
    if (req.url === "/stats") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ providerBasketCalls: basketReads + writes, basketReads, basketWrites: writes })); return; }
    if (req.url === "/call" && req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) { chunks.push(Buffer.from(chunk)); if (Buffer.concat(chunks).length > 16384) throw new Error("Input too large"); }
      const input = JSON.parse(Buffer.concat(chunks).toString()) as { name: string; arguments: Record<string, unknown> };
      if (!["start_product_review", "update_product_review"].includes(input.name)) throw new Error("Submission is forbidden in this smoke");
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
console.log("Exercise v6 retirement, local selection controls, and prepare-only submission; continuous flow requires zero fake provider basket calls.");
