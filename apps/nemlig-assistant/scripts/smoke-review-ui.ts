/** Loopback-only browser smoke host: real MCP adapter + review service, fake catalogue. */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { chromium } from "playwright";
import { createMcpServer } from "../src/mcp.js";
import type { Product, ShoppingClient } from "../src/client.js";
import type { ProductReviewSnapshot } from "../src/product-review.js";
import { BasketProposalService } from "../src/proposals.js";
import { PRODUCT_VIEWER_RESOURCE_URI } from "../src/product-viewer.js";

let basketReads = 0, writes = 0;
let preparedForSimulation: ProductReviewSnapshot | undefined;
let simulatedSubmitted: ProductReviewSnapshot | undefined;
let simulatedSubmissions = 0;
let nextSubmissionStatus: "submitted" | "uncertain" = "submitted";
let unknownPriceScenario = false;
const denied = async (): Promise<never> => { writes++; throw new Error("Provider basket write forbidden in this smoke"); };
const product = (id: number): Product => ({ id, name: `Smoke product ${id}`, price: unknownPriceScenario && id === 1 ? undefined : id * 5, available: true,
  unit: "kr/kg", unitPrice: id * 5, unitSize: "1 kg", brand: "Fixture", category: "Test", subcategory: "Test", imageUrl: "", labels: [],
  isOrganic: false, isFrozen: false, isRefrigerated: false, isDairy: false, isLactoseFree: false, isGlutenFree: false, isVegan: false, isOnDiscount: false });
const catalogue = {
  isLoggedIn: () => true, login: async () => {}, getProduct: async (id: number) => product(id),
  getFreshProduct: async (id: number) => product(id), searchProducts: async () => [product(1), product(2), product(3)],
  getCart: async () => { basketReads++; return { items: [], productsPrice: 0, deliveryPrice: 0, numberOfProducts: 0, deliveryTime: "smoke" }; },
  addToCart: denied,
} as unknown as ShoppingClient;
const proposalService = new BasketProposalService(catalogue);
const uncertainProposals = {
  prepareAdditions: (...args: Parameters<BasketProposalService["prepareAdditions"]>) => proposalService.prepareAdditions(...args),
  apply: async () => { throw new Error("Synthetic ambiguous outcome; provider mutation is forbidden in this smoke."); },
} as unknown as BasketProposalService;
const makeServer = () => createMcpServer(catalogue, async () => undefined, process.env, uncertainProposals);
let current = makeServer();
const retiredV7 = "ui://nemlig/product-viewer-v7.html";
const handler = createMcpHandler(() => current, { legacy: "reject" });
const mcpHandler = toNodeHandler(handler);
const client = new Client({ name: "review-ui-smoke", version: "1" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
const page = `<!doctype html><html><body><h1>Selection recovery smoke</h1>
<button id="start">Start sample selection</button><button id="reset">Simulate server restart</button><button id="replace">Create current selection without updating card</button>
<button id="run">Run regression smoke</button><button id="flow">Run continuous local flow</button><button id="retired">Show retired v7 card</button><output id="status">Ready</output><iframe id="viewer" src="/viewer" style="width:100%;height:760px"></iframe>
<script>
const frame = document.getElementById('viewer'), status = document.getElementById('status');
let transcript, offline = false, initialized = false, conversationMessages = 0;
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
 if(m.method==='ui/initialize')frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result:{protocolVersion:m.params.protocolVersion,hostInfo:{name:'synthetic-mcp-host',version:'1'},hostCapabilities:{},hostContext:{theme:'light'}}},location.origin);
 if(m.method==='ui/notifications/initialized'){ initialized=true; if(transcript)publish(); }
 if(m.method==='ui/message'){ conversationMessages++; status.textContent='Retired current-list message received'; frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result:{}},location.origin); }
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
  const until=Date.now()+15000;
  while(!predicate()){if(Date.now()>until)throw new Error('Timed out: '+status.textContent); await new Promise(r=>setTimeout(r,25));}
 };
  const click = label => { const b=button(label); check(b && !b.disabled,'Missing enabled control: '+label); b.click(); };
  const select = async () => { await wait(()=>doc().querySelector('input[type=checkbox]')); doc().querySelector('input[type=checkbox]').click(); };
  try {
  await fetch('/reset',{method:'POST'});
  widgetCalls.length=0; await document.getElementById('start').onclick();
  await wait(()=>widgetCalls.length===1&&widgetCalls[0].arguments.action?.kind==='show');
  status.textContent='Checking retired v7 resource'; frame.src='/retired';
  await wait(()=>doc()?.querySelector('h1')?.textContent==='This Draft list card is out of date');
  check(doc().querySelector('h1')?.textContent==='This Draft list card is out of date'&&!doc().querySelector('.product-list'),'Retired v7 hydrated selection data');
  const retiredStats=await fetch('/stats').then(r=>r.json());
  check(widgetCalls.length===1&&retiredStats.providerBasketCalls===0&&!doc().querySelector('button'),'Retired v7 exposed an action or made shopping calls');
  status.textContent='Checking direct product display'; const beforeDirectView=widgetCalls.length; frame.src='/viewer'; await wait(()=>button('To decide (2)') && !button('To decide (2)').disabled);
  check(widgetCalls.length===beforeDirectView+1&&widgetCalls.at(-1).arguments.action?.kind==='show'&&doc().querySelectorAll('.product-list article').length===2,'New card did not show products directly or validate its view');
  await select(); click('Add 1 to Ready'); await wait(()=>button('Ready (1)') && !button('Ready (1)').disabled);
  check(!button('Open current Draft list'),'New card retained the obsolete open CTA');
  click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready' && !button('Ready (1)').disabled);
  check(!button('Choose alternative'),'Ready offered alternatives');
  const canonical=(await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}})).structuredContent.review;
  check(canonical.destination==='ready'&&canonical.items.find(item=>item.product_id===1)?.state==='ready','Wire review is not canonical Ready');
  check(!button('Open current Draft list'),'Ready navigation collapsed the mounted frame');
  click('To decide (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='To decide' && !button('To decide (1)').disabled);
  check(!!button('Choose alternative'),'To decide omitted alternatives');
  check(!button('Open current Draft list'),'Return navigation collapsed the mounted frame');
  status.textContent='Checking remount'; const beforeMount=widgetCalls.length;
  frame.src='/viewer'; await wait(()=>widgetCalls.length===beforeMount+1&&widgetCalls.at(-1).arguments.action?.kind==='show');
  await wait(()=>button('Ready (1)') && !button('Ready (1)').disabled);
  check(widgetCalls.length===beforeMount+1&&widgetCalls.at(-1).arguments.action?.kind==='show','Remount did not validate and refresh the current view');
  status.textContent='Checking stale revision without replay';
  const current=(await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}})).structuredContent.review;
  await call({name:'update_product_review_conversation',arguments:{review_id:current.review_id,revision:current.revision,action:{kind:'quantity',product_id:1,quantity:3}}});
  const beforeConflict=widgetCalls.length;
  await select(); click('Add 1 to Ready'); await wait(()=>text().includes('Your last action was not applied'));
  check(widgetCalls.length===beforeConflict+2,'Conflict must make one edit attempt and one read');
  check(widgetCalls.at(-1).arguments.action.kind==='show','Conflict recovery was not read-only');
  check(button('Ready (1)') && !doc().querySelector('input:checked'),'Conflict changed acceptance');
  status.textContent='Checking connection failure'; await select(); offline=true; click('Add 1 to Ready'); await wait(()=>text().includes('This Draft list card is out of date'));
  check(!doc().querySelector('input') && !/INVALID_ARGUMENT|private trace/.test(text()),'Failure leaked details or editable snapshot');
  check(!doc().querySelector('button'),'Stale view retained action controls after its request failed');
  offline=false;
  status.textContent='Checking process restart'; await fetch('/reset',{method:'POST'});
  const restarted=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:3},{product_id:2,quantity:2}]}});
  transcript=restarted; publish();
  await wait(()=>button('To decide (2)') && !button('To decide (2)').disabled);
  check(button('Ready (0)') && !doc().querySelector('input:checked') && [...doc().querySelectorAll('.product-list .product-quantity')].some(node=>node.textContent.startsWith('3')),'Restart restored acceptance or lost the explicitly supplied quantities');
  status.textContent='Checking exact prepare only';
  await select(); click('Add 1 to Ready'); await wait(()=>button('Ready (1)')&&!button('Ready (1)').disabled);
  click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&!button('Ready (1)').disabled);
  click('Prepare exact change'); await wait(()=>doc().querySelector('.submission h2')?.textContent==='Confirm the exact Nemlig change');
  const prepared=await fetch('/stats').then(r=>r.json());
  check(widgetCalls.at(-1).arguments.action.kind==='prepare_submission','Send did not prepare a review');
  check(prepared.basketReads===1&&prepared.basketWrites===0,'Prepare crossed the wrong provider boundary');
  check(!!button('Review exact change') && !button('Add to Nemlig'),'The prepared change was shown before explicit confirmation');
  check(widgetCalls.every(call=>!('representation' in call.arguments)),'Viewer sent a representation selector');
  status.textContent='PASS: retired v7, inactive mount, remount, stale revision, outage, restart, finish, prepare only; one fake basket read, zero writes';
 } catch(error) { status.textContent='FAIL: '+error.message+' | viewer: '+(doc()?.body?.innerText||'no iframe document')+' | widget calls: '+JSON.stringify(widgetCalls); }
 finally { offline=false; run.disabled=false; }
};
document.getElementById('flow').onclick = async () => {
 const run=document.getElementById('flow'); run.disabled=true;
 const doc=()=>frame.contentDocument;
 const text=()=>doc().querySelector('main')?.textContent||'';
 const simulatorStats=async()=>fetch('/stats').then(r=>r.json());
 const button=label=>[...doc().querySelectorAll('button')].find(b=>b.textContent===label);
 const check=(condition,label)=>{if(!condition)throw new Error(label);};
 const wait=async predicate=>{const until=Date.now()+15000;while(!predicate()){if(Date.now()>until)throw new Error('Timed out: '+status.textContent+' | '+(doc()?.querySelector('main')?.innerText||'no viewer main'));await new Promise(r=>setTimeout(r,25));}};
 const click=label=>{const b=button(label);check(b&&!b.disabled,'Missing enabled control: '+label);b.click();};
 const open=()=>check(!button('Open current Draft list'),'The mounted review collapsed');
 const widths=async()=>{const original=frame.style.width;for(const width of [320,375]){frame.style.width=width+'px';await new Promise(requestAnimationFrame);check(doc().documentElement.scrollWidth<=doc().documentElement.clientWidth+1,width+'px viewer overflow');const title=doc().querySelector('.product-heading strong');if(title){const summary=title.closest('.product-summary');check(summary?.querySelector('.product-summary-content')&&getComputedStyle(summary.querySelector('.product-summary-content')).display==='grid',width+'px product summary layout missing');check(title.getBoundingClientRect().width>=64,width+'px product title collapsed to '+title.getBoundingClientRect().width+'px');}}frame.style.width=original;};
 try {
  status.textContent='Starting continuous local flow';
  widgetCalls.length=0;
  transcript=undefined; initialized=false; frame.src='/viewer'; await wait(()=>initialized&&doc()?.querySelector('main.viewer')&&doc()?.querySelector('#title'));
  await fetch('/reset',{method:'POST'});
  await fetch('/unknown-price',{method:'POST'});
  transcript=await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}}); publish();
  await wait(()=>['What should we shop for?','Start a new Draft list'].includes(doc().querySelector('#title')?.textContent ?? '')); await widths();
  await document.getElementById('start').onclick();
  await wait(()=>button('To decide (2)'));
  await wait(()=>button('To decide (2)')&&!button('To decide (2)').disabled); await widths();
  click('Select all'); await wait(()=>doc().querySelectorAll('input[type=checkbox]:checked').length===2); check(doc().querySelectorAll('input[type=checkbox]:checked').length===2,'Select all omitted a usable row');
  click('Clear selection'); await wait(()=>doc().querySelectorAll('input[type=checkbox]:checked').length===0); check(doc().querySelectorAll('input[type=checkbox]:checked').length===0,'Clear selection left products selected');
  const beforeSelection=widgetCalls.length; doc().querySelector('input[type=checkbox]').click();
  await wait(()=>doc().querySelector('input[type=checkbox]:checked'));
  check(widgetCalls.length===beforeSelection,'Selecting a To decide row triggered an unnecessary tool call');
  click('Add 1 to Ready');
  await wait(()=>button('Ready (1)')&&!button('Ready (1)').disabled); open();
  click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&!button('Ready (1)').disabled); open(); await widths();
  const readySummary=doc().querySelector('.review-footer')?.textContent||'';
  check(readySummary.includes('Unknown price'),'Missing price was displayed as a zero Ready total: '+readySummary);
  check(!button('Choose alternative'),'Ready offered alternatives');
  status.textContent='Checking Ready quantity';
  doc().querySelector('.product-list article button[aria-expanded]').click();
  const plus=doc().querySelector('.product-list button[aria-label="Increase quantity of Smoke product 1"]'); check(plus,'Quantity control missing'); plus.click();
  await wait(()=>doc().querySelector('.product-list .product-quantity')?.textContent?.startsWith('2')); open();
  status.textContent='Checking move back to To decide';
  click('Move to To decide'); await wait(()=>button('To decide (2)')&&!button('To decide (2)').disabled); open();
  click('To decide (2)'); await wait(()=>doc().querySelector('#title')?.textContent==='To decide'&&!button('To decide (2)').disabled);
  status.textContent='Checking alternatives';
  doc().querySelector('.product-list article button[aria-expanded]').click(); click('Choose alternative');
  await wait(()=>doc().querySelector('#title')?.textContent==='Choose an alternative'&&button('Ready (0)')&&!button('Ready (0)').disabled); open();
  const radio=doc().querySelector('input[type=radio]'); check(radio,'Alternative choice missing'); radio.click();
  await wait(()=>button('Use selected alternative')&&!button('Use selected alternative').disabled);
  click('Ready (0)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&button('Return to existing alternatives')&&!button('Return to existing alternatives').disabled);
  check(!!button('Return to existing alternatives'),'Ready navigation omitted the saved alternatives return action');
  click('Return to existing alternatives'); await wait(()=>doc().querySelector('#title')?.textContent==='Choose an alternative'&&button('Use selected alternative')&&!button('Use selected alternative').disabled);
  check(doc().querySelector('input[type=radio]')?.checked,'Saved alternative selection was lost on return'); open(); click('Use selected alternative');
  await wait(()=>doc().querySelector('#title')?.textContent==='To decide'&&button('To decide (2)')&&!button('To decide (2)').disabled); open();
  click('Select all'); await wait(()=>doc().querySelectorAll('input[type=checkbox]:checked').length===2); click('Add 2 to Ready');
  await wait(()=>button('Ready (2)')&&!button('Ready (2)').disabled); open();
  click('Ready (2)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&!button('Ready (2)').disabled); open();
  status.textContent='Checking two-row debounce flush';
  const firstPlus=doc().querySelector('.product-list button[aria-label="Increase quantity of Smoke product 2"]');
  const secondPlus=doc().querySelector('.product-list button[aria-label="Increase quantity of Smoke product 3"]');
  check(firstPlus&&secondPlus,'Ready product quantity controls missing');
  const beforeBatch=widgetCalls.length; firstPlus.click(); secondPlus.click();
  click('Prepare exact change');
  await wait(()=>doc().querySelector('.submission h2')?.textContent==='Confirm the exact Nemlig change');
  const batchCalls=widgetCalls.slice(beforeBatch).map(call=>call.arguments.action);
  check(batchCalls.length===3&&batchCalls[0].kind==='quantity'&&batchCalls[0].product_id===2&&batchCalls[1].kind==='quantity'&&batchCalls[1].product_id===3&&batchCalls[2].kind==='prepare_submission','Two row quantities did not reach the real review service in sequence before prepare'); open();
  status.textContent='Checking stale prepared review';
  click('Review exact change');
  const stalePlus=doc().querySelector('.product-list button[aria-label="Increase quantity of Smoke product 2"]'); check(stalePlus,'Prepared product quantity control missing');
  const beforeStale=widgetCalls.length; stalePlus.click();
  await wait(()=>widgetCalls.slice(beforeStale).some(call=>call.name==='update_product_review'&&call.arguments.action?.kind==='quantity')&&!doc().querySelector('.submission h2'));
  check(!widgetCalls.slice(beforeStale).some(call=>call.name==='submit_product_review'),'Stale prepared review reached submit_product_review'); open();
  click('Remove all Ready'); await wait(()=>button('Confirm remove all Ready')); open(); click('Confirm remove all Ready');
  status.textContent='Checking draft list completion';
  await wait(()=>text().includes('Your Draft list is empty.')); open();
  const emptyReview=(await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}})).structuredContent.review;
  check(emptyReview.items.length===0,'Confirmed Remove all Ready did not clear the local Ready rows');
  click('End Draft list'); await wait(()=>button('Confirm discard Draft list')); open(); click('Confirm discard Draft list');
  await wait(()=>text().includes('Your local Draft list was discarded.'));
  transcript=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}]}});
  status.textContent='Checking fresh post-discard card';
 initialized=false; const viewerLoaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true})); frame.src='/viewer'; await viewerLoaded; await wait(()=>initialized);
  await wait(()=>initialized&&button('To decide (2)')&&!button('To decide (2)').disabled);
  await wait(()=>button('To decide (2)')&&!button('To decide (2)').disabled); await widths();
  const availableRow=doc().querySelector('input[type=checkbox][aria-label="Select Smoke product 2"]'); check(availableRow,'Known-price row missing from submitted-continuation setup'); availableRow.click(); click('Add 1 to Ready');
  await wait(()=>button('Ready (1)')&&!button('Ready (1)').disabled); open(); click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&!button('Ready (1)').disabled); open();
  click('Prepare exact change'); await wait(()=>doc().querySelector('.submission h2')?.textContent==='Confirm the exact Nemlig change'); open();
  click('Review exact change'); await wait(()=>button('Add to Nemlig')&&!button('Add to Nemlig').disabled);
  await fetch('/uncertain-next',{method:'POST'}); click('Add to Nemlig');
  status.textContent='Checking uncertain submission';
  await wait(()=>text().includes('Submission outcome is uncertain. Inspect the actual Nemlig basket; do not retry automatically.'));
  check(!button('Prepare exact change'),'Uncertain submission allowed another prepare before an explicit edit');
  check(!button('Open current Draft list') || doc().querySelectorAll('input[type=checkbox]').length===0,'Ambiguous submission retained stale edit controls');
  frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-cancelled',params:{reason:'Reopen only after explicit current-state inspection'}},location.origin);
  await wait(()=>doc().querySelectorAll('input[type=checkbox]').length===0 && text().includes('Request cancelled'));
  transcript=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}]}}); publish();
  status.textContent='Checking recovery after uncertain write';
  const uncertainSnapshot=(await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}})).structuredContent.review;
  const edited=await call({name:'update_product_review_conversation',arguments:{review_id:uncertainSnapshot.review_id,revision:uncertainSnapshot.revision,action:{kind:'quantity',product_id:2,quantity:3}}});
  check(edited.isError!==true,'Explicit server-side quantity edit after uncertainty failed');
  const editedReview=edited.structuredContent.review;
  check(!editedReview.submission,'Explicit quantity edit retained the uncertain submission authority');
  transcript=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}]}});
  check(!transcript.structuredContent.review.submission,'Fresh viewer restored a previous uncertain submission');
  initialized=false; frame.src='/viewer';
  await wait(()=>button('Prepare exact change')&&!button('Prepare exact change').disabled);
  check(!button('Add to Nemlig'),'Reopening an edited uncertain review restored its old confirmation');
  check(widgetCalls.filter(call=>call.name==='submit_product_review').length===1,'Reopening an edited uncertain review automatically submitted it');
  click('Prepare exact change'); await wait(()=>doc().querySelector('.submission h2')?.textContent==='Confirm the exact Nemlig change'); open();
  click('Review exact change'); await wait(()=>button('Add to Nemlig')&&!button('Add to Nemlig').disabled);
  click('Add to Nemlig'); await wait(()=>text().includes('Nemlig confirmed this Draft list was added successfully.'));
  check((await simulatorStats()).simulatedSubmissions===1,'Explicit edit did not allow one separately reviewed submission');
  click('Continue with Draft list'); await wait(()=>!button('Continue with Draft list'));
  click('To decide (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='To decide'&&!button('To decide (1)').disabled); open();
  click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&!button('Ready (1)').disabled); open();
  click('To decide (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='To decide'&&!button('To decide (1)').disabled);
  check((await simulatorStats()).simulatedSubmissions===1,'Navigating a continued submitted list caused another submit');
  check(widgetCalls.filter(call=>call.name==='submit_product_review').length===2,'Browser adapter made an unexpected submission call');
  const stats=await fetch('/stats').then(r=>r.json()); check(stats.basketWrites===0,'Provider basket write occurred');
  check(widgetCalls.every(call=>!('representation' in call.arguments)),'Viewer sent a representation selector');
  status.textContent='PASS: activation, select/clear, no-call row selection, unknown and pending Ready totals, alternative return, two-row flush, stale prepared no-submit, verified-submit continuation, uncertain block and explicit-edit recovery, confirmed clear/end/restart, 320/375px; provider basket writes 0';
 } catch(error){status.textContent='FAIL: '+error.message+' | screen: '+(doc()?.querySelector('#title')?.textContent||'unavailable')+' | controls: '+[...(doc()?.querySelectorAll('button')||[])].map(button=>button.textContent.trim()+(button.disabled?' [disabled]':'')).join('; ')+' | widget calls: '+widgetCalls.map(call=>call.name+':'+(call.arguments.action?.kind||'start')).join(',');} finally{run.disabled=false;}
};
</script></body></html>`;
const server = createServer((req, res) => {
  if (req.url === "/mcp") { void mcpHandler(req, res); return; }
  void (async () => {
    if (req.url === "/") { res.setHeader("content-type", "text/html"); res.end(page); return; }
    if (req.url === "/viewer" || req.url === "/retired") {
      const resource = (await client.readResource({ uri: req.url === "/retired" ? retiredV7 : PRODUCT_VIEWER_RESOURCE_URI })).contents[0];
      res.setHeader("content-type", "text/html"); res.end(resource && "text" in resource ? resource.text : "Missing viewer"); return;
    }
    if (req.url === "/reset" && req.method === "POST") { current = makeServer(); basketReads = 0; writes = 0; preparedForSimulation = undefined; simulatedSubmitted = undefined; simulatedSubmissions = 0; nextSubmissionStatus = "submitted"; unknownPriceScenario = false; res.end("reset"); return; }
    if (req.url === "/unknown-price" && req.method === "POST") { unknownPriceScenario = true; res.end("enabled"); return; }
    if (req.url === "/uncertain-next" && req.method === "POST") { nextSubmissionStatus = "uncertain"; res.end("enabled"); return; }
    if (req.url === "/stats") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ providerBasketCalls: basketReads + writes, basketReads, basketWrites: writes, simulatedSubmissions })); return; }
    if (req.url === "/call" && req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) { chunks.push(Buffer.from(chunk)); if (Buffer.concat(chunks).length > 16384) throw new Error("Input too large"); }
      const input = JSON.parse(Buffer.concat(chunks).toString()) as { name: string; arguments: Record<string, unknown> };
      if (input.name === "submit_product_review" && nextSubmissionStatus !== "uncertain") {
        const prepared = preparedForSimulation;
        if (!prepared?.submission || prepared.submission.status !== "prepared"
          || input.arguments.review_id !== prepared.review_id || input.arguments.revision !== prepared.revision
          || input.arguments.submission_id !== prepared.submission.submission_id) throw new Error("Only the exact locally prepared review may use the synthetic verified-submit result");
        simulatedSubmitted = structuredClone(prepared);
        if (nextSubmissionStatus === "submitted") simulatedSubmitted.revision++;
        simulatedSubmitted.submission!.status = nextSubmissionStatus;
        nextSubmissionStatus = "submitted";
        simulatedSubmissions++;
        res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ structuredContent: { review: simulatedSubmitted, view_id: input.arguments.view_id }, content: [], isError: false })); return;
      }
      if (!["start_product_review", "update_product_review", "submit_product_review", "update_product_review_conversation", "submit_product_review_conversation"].includes(input.name)) throw new Error("Unexpected tool call in this smoke");
      const action = input.arguments.action as { kind?: string; destination?: ProductReviewSnapshot["destination"] } | undefined;
      if (input.name === "update_product_review" && action?.kind === "navigate" && simulatedSubmitted
        && input.arguments.review_id === simulatedSubmitted.review_id && action.destination) {
        simulatedSubmitted.revision++;
        simulatedSubmitted.destination = action.destination;
        res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ structuredContent: { review: structuredClone(simulatedSubmitted) }, content: [], isError: false })); return;
      }
      if (input.name === "submit_product_review" && nextSubmissionStatus === "uncertain") nextSubmissionStatus = "submitted";
      const result = await client.callTool(input);
      if (input.name === "update_product_review" && action?.kind === "prepare_submission") {
        const snapshot = (result.structuredContent as { review?: unknown } | undefined)?.review;
        if (snapshot && typeof snapshot === "object") preparedForSimulation = structuredClone(snapshot) as ProductReviewSnapshot;
      }
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify(result)); return;
    }
    res.statusCode = 404; res.end();
  })().catch(() => { res.statusCode = 500; res.end("Smoke request failed"); });
});
server.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", origin)));
console.log(`Review UI smoke: ${origin}`);
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const browserPage = await browser.newPage({ viewport: { width: 375, height: 860 } });
  browserPage.setDefaultTimeout(10_000);
  browserPage.setDefaultNavigationTimeout(10_000);
  await browserPage.goto(origin, { waitUntil: "domcontentloaded" });
  const status = browserPage.locator("#status");
  const waitForResult = async (phase: string) => {
    await browserPage.waitForFunction(() => /^(PASS|FAIL):/.test(document.querySelector("#status")?.textContent ?? ""), undefined, { timeout: 90_000 });
    const result = await status.textContent();
    if (!result?.startsWith("PASS:")) throw new Error(`${phase} failed: ${result}`);
    console.log(`${phase}: ${result}`);
  };
  await browserPage.locator("#run").click();
  await waitForResult("MCP adapter recovery flow");
  await browserPage.locator("#flow").click();
  await waitForResult("MCP adapter continuous flow");
  const stats = await browserPage.evaluate(async () => fetch("/stats").then(async (response) => await response.json() as { providerBasketCalls: number; basketWrites: number }));
  if (stats.basketWrites !== 0 || writes !== 0) throw new Error(`Fake provider basket write boundary crossed: ${JSON.stringify(stats)}`);
} finally {
  await browser.close();
  await client.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
console.log("MCP adapter browser smoke passed: recovery, current review controls, restart, exact prepare, and zero fake provider basket writes.");
