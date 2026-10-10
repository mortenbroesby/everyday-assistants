/** Loopback-only browser smoke host: real MCP adapter + review service, fake catalogue. */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { chromium } from "playwright";
import { createMcpServer } from "../src/mcp.js";
import type { Product, ShoppingClient } from "../src/client.js";
import type { ProductReviewSnapshot } from "../src/product-review.js";
import { BasketProposalService } from "../src/proposals.js";
import { PRODUCT_VIEWER_RESOURCE_URI } from "../src/product-viewer.js";
import { readLocalViewerGeneration } from "./viewer-generation.js";
import {
  closeViewerSmokeServer,
  installViewerAssetFixture,
} from "./viewer-asset-fixture.js";

const viewerGeneration = await readLocalViewerGeneration(
  fileURLToPath(new URL("../dist/ui-static/", import.meta.url)),
);

let basketReads = 0,
  writes = 0;
let preparedForSimulation: ProductReviewSnapshot | undefined;
let simulatedSubmitted: ProductReviewSnapshot | undefined;
let simulatedSubmissions = 0;
let nextSubmissionStatus: "submitted" | "uncertain" = "submitted";
let unknownPriceScenario = false;
const denied = async (): Promise<never> => {
  writes++;
  throw new Error("Provider basket write forbidden in this smoke");
};
const product = (id: number): Product => ({
  id,
  name: `Smoke product ${id}`,
  price: unknownPriceScenario && id === 1 ? undefined : id * 5,
  available: id === 4 ? false : true,
  unit: "kr/kg",
  unitPrice: id * 5,
  unitSize: "1 kg",
  brand: "Fixture",
  category: "Test",
  subcategory: "Test",
  imageUrl: "",
  labels: [],
  description:
    id === 3
      ? "Long factual description for the alternatives comparison smoke."
      : undefined,
  declaration:
    id === 3
      ? "Ingredients and allergen facts for the alternatives comparison smoke."
      : undefined,
  details:
    id === 3
      ? [
          { key: "Country of origin", value: "Denmark" },
          { key: "Storage", value: "Keep chilled" },
        ]
      : undefined,
  isOrganic: id === 3,
  isFrozen: false,
  isRefrigerated: false,
  isDairy: false,
  isLactoseFree: false,
  isGlutenFree: false,
  isVegan: false,
  isOnDiscount: false,
});
const catalogue = {
  isLoggedIn: () => true,
  login: async () => {},
  getProduct: async (id: number) => product(id),
  getFreshProduct: async (id: number) => product(id),
  searchProducts: async (query: string) => {
    if (query === "search-error") {
      throw new Error("Synthetic alternative search failure");
    }
    if (query === "empty") {
      return [];
    }
    if (query === "unavailable") {
      return [product(4)];
    }
    return [product(1), product(2), product(3)];
  },
  getCart: async () => {
    basketReads++;
    return {
      items: [],
      productsPrice: 0,
      deliveryPrice: 0,
      numberOfProducts: 0,
      deliveryTime: "smoke",
    };
  },
  addToCart: denied,
} as unknown as ShoppingClient;
const proposalService = new BasketProposalService(catalogue);
const uncertainProposals = {
  prepareAdditions: (
    ...args: Parameters<BasketProposalService["prepareAdditions"]>
  ) => proposalService.prepareAdditions(...args),
  apply: async () => {
    throw new Error(
      "Synthetic ambiguous outcome; provider mutation is forbidden in this smoke.",
    );
  },
} as unknown as BasketProposalService;
const makeServer = () =>
  createMcpServer(
    catalogue,
    async () => undefined,
    process.env,
    uncertainProposals,
  );
let current = makeServer();
const handler = createMcpHandler(() => current, { legacy: "reject" });
const mcpHandler = toNodeHandler(handler);
const client = new Client(
  { name: "review-ui-smoke", version: "1" },
  { versionNegotiation: { mode: { pin: "2026-07-28" } } },
);
const page = `<!doctype html><html><body><h1>Selection recovery smoke</h1>
<button id="start">Start sample selection</button><button id="reset">Simulate server restart</button><button id="replace">Create current selection without updating card</button>
<button id="run">Run regression smoke</button><button id="flow">Run continuous local flow</button><button id="alternatives">Run alternatives comparison smoke</button><output id="status">Ready</output><iframe id="viewer" src="/viewer" style="width:100%;height:760px"></iframe>
<script>
const frame = document.getElementById('viewer'), status = document.getElementById('status');
let transcript, offline = false, initialized = false, conversationMessages = 0;
const widgetCalls = [], widgetResults = [];
const publish = () => frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:transcript},location.origin);
const call = args => fetch('/call', {method:'POST',body:JSON.stringify(args)}).then(r=>r.json());
document.getElementById('start').onclick = async () => {
 transcript = await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}]}});
 publish();
 status.textContent='Selection shown';
};
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
  widgetResults.push({name:m.params.name,isError:result.isError===true,text:(result.content||[]).filter(content=>content.type==='text').map(content=>content.text).join(' ')});
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
  const select = async () => { await wait(()=>doc().querySelector('input[type=checkbox]:not(:disabled)')); doc().querySelector('input[type=checkbox]:not(:disabled)').click(); await wait(()=>button('Add selected to Ready (1)')); };
  try {
  await fetch('/reset',{method:'POST'});
  widgetCalls.length=0; await document.getElementById('start').onclick();
  await wait(()=>button('To decide (2)') && !button('To decide (2)').disabled && doc().querySelectorAll('.product-list article').length===2);
  check(widgetCalls.length===0,'Fresh card made an unnecessary server call');
  await select(); offline=true; click('Add selected to Ready (1)'); await wait(()=>text().includes('Refresh the Draft list'));
  offline=false;
  publish();
  await new Promise(r=>setTimeout(r,50));
  check(text().includes('Refresh the Draft list')&&!button('To decide (2)'),'Delayed initial host payload restored an unconfirmed card');
  click('Refresh Draft list'); await wait(()=>button('To decide (2)') && !button('To decide (2)').disabled && doc().querySelectorAll('.product-list article').length===2);
  status.textContent='Checking direct product display'; const beforeDirectView=widgetCalls.length;
  const reloaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true})); frame.contentWindow.location.reload(); await reloaded;
  await wait(()=>button('To decide (2)') && !button('To decide (2)').disabled && doc().querySelectorAll('.product-list article').length===2);
  check(widgetCalls.length===beforeDirectView,'Reload made an unnecessary server call');
  await select(); click('Add selected to Ready (1)'); await wait(()=>button('Ready (1)') && !button('Ready (1)').disabled);
  check(!button('Open current Draft list'),'New card retained the obsolete open CTA');
  const beforeReadyTab=widgetCalls.length; click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready' && !button('Ready (1)').disabled);
  check(widgetCalls.length===beforeReadyTab,'Ready tab called the review service');
  check(!button('Choose alternative'),'Ready offered alternatives');
  const canonical=(await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}})).structuredContent.review;
  check(canonical.destination==='needs-review'&&canonical.items.find(item=>item.product_id===1)?.state==='ready','A local Ready tab changed server destination or acceptance');
  check(!button('Open current Draft list'),'Ready navigation collapsed the mounted frame');
  const beforeToDecideTab=widgetCalls.length; click('To decide (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='To decide' && !button('To decide (1)').disabled);
  check(widgetCalls.length===beforeToDecideTab,'To decide tab called the review service');
  check(!!button('Choose alternative'),'To decide omitted alternatives');
  check(!button('Open current Draft list'),'Return navigation collapsed the mounted frame');
  status.textContent='Checking remount'; const beforeMount=widgetCalls.length;
  const remounted=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true})); frame.src='/viewer'; await remounted;
  await wait(()=>button('To decide (2)') && !button('To decide (2)').disabled && doc().querySelectorAll('.product-list article').length===2);
  check(widgetCalls.length===beforeMount,'Remount made an unnecessary server call');
  transcript=await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}}); publish();
  await wait(()=>button('To decide (1)') && !button('To decide (1)').disabled);
  status.textContent='Checking sequential card action';
  await call({name:'update_product_review_conversation',arguments:{action:{kind:'quantity',product_id:1,quantity:3}}});
  const beforeSequential=widgetCalls.length;
  await select(); click('Add selected to Ready (1)'); await wait(()=>button('Ready (2)')&&!button('Ready (2)').disabled);
  check(widgetCalls.length===beforeSequential+1,'A supported card action did not apply to the current owner list');
  check(widgetCalls.at(-1).arguments.action.kind==='accept','The card replayed or replaced the explicit action');
  click('View Ready products'); await wait(()=>doc().querySelectorAll('.product-list article').length===2);
  check([...doc().querySelectorAll('[data-viewer-component="product-quantity"]')].some(node=>node.textContent.startsWith('3')),'The card did not adopt current server quantities');
  click('Move to To decide'); await wait(()=>button('To decide (1)')&&!button('To decide (1)').disabled); click('To decide (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='To decide');
  status.textContent='Checking service outage recovery'; await select(); offline=true; click('Add selected to Ready (1)'); await wait(()=>text().includes('Refresh the Draft list'));
  check(!/out of date|stale|private trace|INVALID_ARGUMENT/i.test(text()),'A service outage was mislabeled or leaked details');
  check(button('Refresh Draft list'),'Service outage omitted read-only recovery');
  offline=false; click('Refresh Draft list'); await wait(()=>button('To decide (1)')&&!button('To decide (1)').disabled);
  status.textContent='Checking process restart'; await fetch('/reset',{method:'POST'});
  const restarted=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:3},{product_id:2,quantity:2}]}});
  transcript=restarted; publish();
  const restartedFrame=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true})); frame.src='/viewer'; await restartedFrame;
  await wait(()=>button('To decide (2)') && !button('To decide (2)').disabled && [...doc().querySelectorAll('[data-viewer-component="product-quantity"]')].some(node=>node.textContent.startsWith('3')));
  check(button('Ready (0)') && !doc().querySelector('input:checked') && [...doc().querySelectorAll('[data-viewer-component="product-quantity"]')].some(node=>node.textContent.startsWith('3')),'Restart restored acceptance or lost the explicitly supplied quantities');
  status.textContent='Checking exact prepare only';
  await select(); click('Add selected to Ready (1)'); await wait(()=>button('Ready (1)')&&!button('Ready (1)').disabled);
  click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&!button('Ready (1)').disabled);
  click('Review exact Nemlig change'); await wait(()=>doc().querySelector('[data-viewer-component="outcome-surface"] h2')?.textContent==='Ready to add to Nemlig basket');
  const prepared=await fetch('/stats').then(r=>r.json());
  check(widgetCalls.at(-1).arguments.action.kind==='prepare_submission','Send did not prepare a review');
  check(prepared.basketReads===1&&prepared.basketWrites===0,'Prepare crossed the wrong provider boundary');
  check(!!button('Add to Nemlig basket') && !button('Add to Nemlig'),'The prepared change was shown before explicit confirmation');
  check(widgetCalls.every(call=>!('representation' in call.arguments)),'Viewer sent a representation selector');
 status.textContent='PASS: no-call mount, reload, remount, sequential cards, outage recovery, restart, finish, prepare only; one fake basket read, zero writes';
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
 const widths=async()=>{const original=frame.style.width;for(const width of [320,375]){frame.style.width=width+'px';await new Promise(requestAnimationFrame);check(doc().documentElement.scrollWidth<=doc().documentElement.clientWidth+1,width+'px viewer overflow');const summary=doc().querySelector('[data-viewer-component="product-summary"]');const title=summary?.querySelector('strong');if(title){check(summary?.querySelector('span')&&getComputedStyle(summary.querySelector('span')).display==='grid',width+'px product summary layout missing');check(title.getBoundingClientRect().width>=64,width+'px product title collapsed to '+title.getBoundingClientRect().width+'px');}}frame.style.width=original;};
 try {
  status.textContent='Starting continuous local flow';
  widgetCalls.length=0;
  transcript=undefined; initialized=false; frame.src='/viewer'; await wait(()=>initialized&&doc()?.querySelector('main.viewer')&&doc()?.querySelector('#title'));
  await fetch('/reset',{method:'POST'});
  await fetch('/unknown-price',{method:'POST'});
  transcript=await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}}); publish();
  await wait(()=>['What should we shop for?','Draft list unavailable'].includes(doc().querySelector('#title')?.textContent ?? '')); await widths();
  await document.getElementById('start').onclick();
  await wait(()=>button('To decide (2)'));
  await wait(()=>button('To decide (2)')&&!button('To decide (2)').disabled); await widths();
  await wait(()=>button('Select all')&&!button('Select all').disabled);
  click('Select all'); await wait(()=>doc().querySelectorAll('input[type=checkbox]:checked').length===2); check(doc().querySelectorAll('input[type=checkbox]:checked').length===2,'Select all omitted a usable row');
  doc().querySelector('input[type=checkbox]:checked').click(); await wait(()=>doc().querySelectorAll('input[type=checkbox]:checked').length===1); check(doc().querySelectorAll('input[type=checkbox]:checked').length===1,'Unchecking one row changed another selection');
  doc().querySelector('input[type=checkbox]:not(:checked)').click(); await wait(()=>doc().querySelectorAll('input[type=checkbox]:checked').length===2);
  const beforeSelection=widgetCalls.length; doc().querySelector('input[type=checkbox]').click();
  await wait(()=>doc().querySelector('input[type=checkbox]:checked'));
  check(widgetCalls.length===beforeSelection,'Selecting a To decide row triggered an unnecessary tool call');
  click('Add selected to Ready (1)');
  await wait(()=>button('Ready (1)')&&!button('Ready (1)').disabled); open();
  click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&!button('Ready (1)').disabled); open(); await widths();
  const readySummary=doc().querySelector('[data-viewer-component="action-footer"]')?.textContent||'';
  check(!readySummary.includes('products ready'),'Ready retained a redundant count summary: '+readySummary);
  check(!doc().querySelector('.product-list input[type=checkbox]'),'Ready retained a batch-selection checkbox');
  check(!button('Choose alternative'),'Ready offered alternatives');
  status.textContent='Checking Ready quantity';
  doc().querySelector('.product-list article button[aria-expanded]').click();
  const plus=doc().querySelector('.product-list article [data-viewer-component="quantity-control"] button:last-of-type'); check(plus,'Quantity control missing'); plus.click();
  await wait(()=>doc().querySelector('[data-viewer-component="product-quantity"]')?.textContent?.startsWith('2')); open();
  doc().querySelector('.product-list article button[aria-expanded]').click();
  await wait(()=>doc().querySelector('.product-list article button[aria-expanded]')?.getAttribute('aria-expanded')==='false');
  status.textContent='Checking move back to To decide';
  const collapsedMove=button('Move to To decide'); check(!collapsedMove||!!collapsedMove.closest('[hidden]'),'Ready move action was visible before expanding the row');
  doc().querySelector('.product-list article button[aria-expanded]').click();
  await wait(()=>!!button('Move to To decide')&&!button('Move to To decide').closest('[hidden]'));
  click('Move to To decide'); await wait(()=>button('To decide (2)')&&!button('To decide (2)').disabled); open();
  click('To decide (2)'); await wait(()=>doc().querySelector('#title')?.textContent==='To decide'&&!button('To decide (2)').disabled);
  status.textContent='Checking alternatives';
  doc().querySelector('.product-list article button[aria-expanded]').click(); click('Choose alternative');
  await wait(()=>doc().querySelector('#title')?.textContent==='Choose an alternative'&&button('Ready (0)')&&!button('Ready (0)').disabled); open();
  const alternative=doc().querySelector('.alternative-choice'); check(alternative&&!alternative.disabled,'Alternative replacement action missing'); const beforeReplacement=widgetCalls.length; alternative.click();
  await wait(()=>doc().querySelector('#title')?.textContent==='To decide'&&button('To decide (2)')&&!button('To decide (2)').disabled); open();
  check(!button('Use selected alternative'),'Alternative replacement retained a second confirmation action');
  check(widgetCalls.length===beforeReplacement+1&&widgetCalls.at(-1).arguments.action.kind==='replace','Selecting an alternative did not make one direct replacement request');
  click('Select all'); await wait(()=>doc().querySelectorAll('input[type=checkbox]:checked').length===2); click('Add selected to Ready (2)');
  await wait(()=>button('Ready (2)')&&!button('Ready (2)').disabled); open();
  click('Ready (2)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&!button('Ready (2)').disabled); open();
  status.textContent='Checking two-row debounce flush';
  const readyRows=[...doc().querySelectorAll('.product-list article')];
  const firstPlus=readyRows.find(row=>row.textContent.includes('Smoke product 2'))?.querySelector('[data-viewer-component="quantity-control"] button:last-of-type');
  const secondPlus=readyRows.find(row=>row.textContent.includes('Smoke product 3'))?.querySelector('[data-viewer-component="quantity-control"] button:last-of-type');
  check(firstPlus&&secondPlus,'Ready product quantity controls missing');
  const beforeBatch=widgetCalls.length; firstPlus.click(); secondPlus.click();
  click('Review exact Nemlig change');
  await wait(()=>doc().querySelector('[data-viewer-component="outcome-surface"] h2')?.textContent==='Ready to add to Nemlig basket');
  const batchCalls=widgetCalls.slice(beforeBatch).map(call=>call.arguments.action);
  check(batchCalls.length===3&&batchCalls[0].kind==='quantity'&&batchCalls[0].product_id===2&&batchCalls[1].kind==='quantity'&&batchCalls[1].product_id===3&&batchCalls[2].kind==='prepare_submission','Two row quantities did not reach the real review service in sequence before prepare'); open();
  status.textContent='Checking stale prepared review';
  click('Add to Nemlig basket');
  const stalePlus=[...doc().querySelectorAll('.product-list article')].find(row=>row.textContent.includes('Smoke product 2'))?.querySelector('[data-viewer-component="quantity-control"] button:last-of-type'); check(stalePlus,'Prepared product quantity control missing');
  const beforeStale=widgetCalls.length; stalePlus.click();
  await wait(()=>widgetCalls.slice(beforeStale).some(call=>call.name==='update_product_review'&&call.arguments.action?.kind==='quantity')&&button('Review exact Nemlig change')&&!button('Add to Nemlig'));
  check(!widgetCalls.slice(beforeStale).some(call=>call.name==='submit_product_review'),'Stale prepared review reached submit_product_review'); open();
  for (let remaining=2; remaining>0; remaining--) {
    const row=doc().querySelector('.product-list article'); check(row,'Ready row disappeared before its local removal was confirmed');
    const summary=row.querySelector('button[aria-expanded]'); check(summary,'Ready row summary missing');
    if(summary.getAttribute('aria-expanded')!=='true') summary.click();
    await wait(()=>row.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')==='true');
    const remove=[...row.querySelectorAll('button')].find(control=>control.textContent==='Remove from Draft list'&&!control.closest('[hidden]')); check(remove,'Ready local removal action was missing from the expanded row');
    const beforeLocalPrompt=widgetCalls.length; remove.focus(); remove.click();
    check(widgetCalls.length===beforeLocalPrompt,'Opening local removal confirmation called the review service');
    await wait(()=>[...row.querySelectorAll('button')].some(control=>control.textContent==='Confirm remove'&&!control.closest('[hidden]')));
    const prompt=row.querySelector('[role="alert"]'); check(prompt?.textContent?.includes('The Nemlig basket will not change.'),'Local removal prompt was not announced with its safety boundary: '+prompt?.textContent);
    check(doc().activeElement===prompt,'Opening local removal did not move focus to the announced prompt');
    const keep=[...row.querySelectorAll('button')].find(control=>control.textContent==='Keep product'); check(keep,'Local removal cancel control was missing'); keep.click();
    await wait(()=>doc().activeElement===remove);
    remove.click(); await wait(()=>[...row.querySelectorAll('button')].some(control=>control.textContent==='Confirm remove'&&!control.closest('[hidden]')));
    const confirm=[...row.querySelectorAll('button')].find(control=>control.textContent==='Confirm remove'&&!control.closest('[hidden]')); check(confirm,'Ready row removal did not require explicit confirmation'); confirm.click();
    await wait(()=>doc().querySelectorAll('.product-list article').length===remaining-1);
  }
  status.textContent='Checking draft list completion';
  await wait(()=>text().includes('Your local Draft list is empty.')); open();
  const emptyReview=(await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}})).structuredContent.review;
  check(emptyReview.items.length===0,'Confirmed local row removals did not clear the Ready list');
  check(!button('End Draft list'),'Empty Draft list retained an unnecessary destructive control');
  await call({name:'update_product_review_conversation',arguments:{action:{kind:'end'}}});
  transcript=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}]}});
  status.textContent='Checking fresh post-discard card';
 initialized=false; const viewerLoaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true})); frame.src='/viewer'; await viewerLoaded; await wait(()=>initialized);
  await wait(()=>initialized&&button('To decide (2)')&&!button('To decide (2)').disabled&&doc().querySelector('input[type=checkbox]:not(:disabled)'));
  await wait(()=>button('To decide (2)')&&!button('To decide (2)').disabled&&doc().querySelector('input[type=checkbox]:not(:disabled)')); await widths();
  const availableRow=doc().querySelector('input[type=checkbox][aria-label="Select Smoke product 2"]'); check(availableRow,'Known-price row missing from submitted-continuation setup'); availableRow.click(); click('Add selected to Ready (1)');
  await wait(()=>button('Ready (1)')&&!button('Ready (1)').disabled); open(); click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&!button('Ready (1)').disabled); open();
  click('Review exact Nemlig change'); await wait(()=>doc().querySelector('[data-viewer-component="outcome-surface"] h2')?.textContent==='Ready to add to Nemlig basket'); open();
  check(button('Add to Nemlig basket')?.getAttribute('data-viewer-tone')==='primary'&&!button('Review exact Nemlig change'),'Prepared review did not promote exact confirmation as the sole next primary action');
  click('Add to Nemlig basket'); await wait(()=>button('Add to Nemlig')&&!button('Add to Nemlig').disabled);
  check(button('Add to Nemlig')?.getAttribute('data-viewer-tone')==='primary','Explicitly reviewed submission did not promote Add to Nemlig as the next primary action');
  await fetch('/uncertain-next',{method:'POST'}); click('Add to Nemlig');
  status.textContent='Checking uncertain submission';
  await wait(()=>text().includes('We could not verify the addition'));
  check(!button('Review exact Nemlig change'),'Uncertain submission allowed another prepare before an explicit edit');
  check(!button('Open current Draft list') || doc().querySelectorAll('input[type=checkbox]').length===0,'Ambiguous submission retained stale edit controls');
  frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-cancelled',params:{reason:'Reopen only after explicit current-state inspection'}},location.origin);
  await wait(()=>doc().querySelectorAll('input[type=checkbox]').length===0 && text().includes('We could not verify the addition'));
  transcript=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}]}}); publish();
  status.textContent='Checking recovery after uncertain write';
  const uncertainSnapshot=(await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}})).structuredContent.review;
  const edited=await call({name:'update_product_review_conversation',arguments:{action:{kind:'quantity',product_id:2,quantity:3}}});
  check(edited.isError!==true,'Explicit server-side quantity edit after uncertainty failed');
  const editedReview=edited.structuredContent.review;
  check(!editedReview.submission,'Explicit quantity edit retained the uncertain submission authority');
  transcript=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}]}});
  check(!transcript.structuredContent.review.submission,'Fresh viewer restored a previous uncertain submission');
  initialized=false; const recoveryViewerLoaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true})); frame.src='/viewer'; await recoveryViewerLoaded;
  await wait(()=>initialized&&button('Ready (1)')&&!button('Ready (1)').disabled); click('Ready (1)');
  await wait(()=>button('Review exact Nemlig change')&&!button('Review exact Nemlig change').disabled);
  check(!button('Add to Nemlig'),'Reopening an edited uncertain review restored its old confirmation');
  check(widgetCalls.filter(call=>call.name==='submit_product_review').length===1,'Reopening an edited uncertain review automatically submitted it');
  click('Review exact Nemlig change'); await wait(()=>doc().querySelector('[data-viewer-component="outcome-surface"] h2')?.textContent==='Ready to add to Nemlig basket'); open();
  click('Add to Nemlig basket'); await wait(()=>button('Add to Nemlig')&&!button('Add to Nemlig').disabled);
  click('Add to Nemlig'); await wait(()=>text().includes('Nemlig confirmed the addition'));
  check((await simulatorStats()).simulatedSubmissions===1,'Explicit edit did not allow one separately reviewed submission');
  click('Continue with Draft list'); await wait(()=>!button('Continue with Draft list'));
  click('To decide (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='To decide'&&!button('To decide (1)').disabled); open();
  click('Ready (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='Ready'&&!button('Ready (1)').disabled); open();
  click('To decide (1)'); await wait(()=>doc().querySelector('#title')?.textContent==='To decide'&&!button('To decide (1)').disabled);
  check((await simulatorStats()).simulatedSubmissions===1,'Navigating a continued submitted list caused another submit');
  check(widgetCalls.filter(call=>call.name==='submit_product_review').length===2,'Browser adapter made an unexpected submission call');
  const stats=await fetch('/stats').then(r=>r.json()); check(stats.basketWrites===0,'Provider basket write occurred');
  check(widgetCalls.every(call=>!('representation' in call.arguments)),'Viewer sent a representation selector');
 status.textContent='PASS: shared owner list, row selection, no-call selection, Ready action hierarchy, confirmed local removals, alternative return, two-row flush, prepared no-submit, verified-submit continuation, uncertain block and explicit-edit recovery, confirmed end/restart, 320/375px; provider basket writes 0';
 } catch(error){status.textContent='FAIL: '+error.message+' | screen: '+(doc()?.querySelector('#title')?.textContent||'unavailable')+' | controls: '+[...(doc()?.querySelectorAll('button')||[])].map(button=>button.textContent.trim()+(button.disabled?' [disabled]':'')).join('; ')+' | widget calls: '+widgetCalls.map(call=>call.name+':'+(call.arguments.action?.kind||'start')).join(',');} finally{run.disabled=false;}
};
document.getElementById('alternatives').onclick = async () => {
 const run=document.getElementById('alternatives'); run.disabled=true;
 const doc=()=>frame.contentDocument;
 const check=(condition,label)=>{if(!condition)throw new Error(label);};
 const wait=async predicate=>{const until=Date.now()+15000;while(!predicate()){if(Date.now()>until)throw new Error('Timed out: '+(doc()?.querySelector('main')?.innerText||'no viewer main'));await new Promise(r=>setTimeout(r,25));}};
 const button=label=>[...doc().querySelectorAll('button')].find(control=>control.textContent===label);
 const click=label=>{const control=button(label);check(control&&!control.disabled,'Missing enabled control: '+label);control.click();};
 const open=()=>check(!button('Open current Draft list'),'The alternatives review unexpectedly became inactive');
 const search=async query=>{const field=doc().querySelector('#alternative-query');check(field,'Alternative search input disappeared');field.value=query;field.dispatchEvent(new Event('input',{bubbles:true}));field.form.requestSubmit();};
 try {
  status.textContent='Checking alternatives comparison';
  await fetch('/reset',{method:'POST'}); widgetCalls.length=0; widgetResults.length=0; initialized=false;
  transcript=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:2},{product_id:2,quantity:1}]}});
  frame.src='/viewer'; await wait(()=>initialized&&doc()?.querySelector('main.viewer'));
  publish(); await wait(()=>button('To decide (2)')&&!button('To decide (2)').disabled&&!doc().querySelector('button[aria-expanded]')?.disabled);
  const target=[...doc().querySelectorAll('.product-list article')].find(row=>row.textContent.includes('Smoke product 1'));
  check(target,'Current product row missing before alternatives');
  target.querySelector('button[aria-expanded]')?.click(); await wait(()=>button('Choose alternative')&&!button('Choose alternative').disabled); click('Choose alternative');
  await wait(()=>doc().querySelector('#title')?.textContent==='Choose an alternative'); open();
  const currentSection=doc().querySelector('.alternatives-current');
  const currentCard=currentSection?.querySelector('.product-card');
  check(currentSection&&currentCard,'Current product was not shown as a distinct comparison section');
  check(getComputedStyle(currentCard).borderBottomWidth==='0px','Current product retained an internal divider');
  const candidate=[...doc().querySelectorAll('.alternative-options .product-card')].find(row=>row.textContent.includes('Smoke product 3'));
  check(candidate,'Returned alternative was missing');
  check(!candidate.querySelector('[data-viewer-component="product-summary"]'),'Alternative facts remained hidden behind a product accordion');
  check(candidate.textContent.includes('Fixture')&&candidate.textContent.includes('1 kg')&&candidate.textContent.includes('15.00 kr')&&candidate.textContent.includes('Organic'),'Alternative comparison omitted supplied product facts');
  const facts=[...candidate.querySelectorAll('[data-viewer-component="product-fact"] summary')].map(summary=>summary.textContent); check(JSON.stringify(facts)===JSON.stringify(['Varebeskrivelse','Varedeklaration','Detaljer om varen']),'Alternative exposed anything other than the three supported factual sections: '+facts.join(', '));
  const description=candidate.querySelector('[data-viewer-component="product-fact"] summary'); check(description,'Long factual description disclosure missing'); description.click();
  await wait(()=>candidate.textContent.includes('Long factual description for the alternatives comparison smoke.'));
  const details=[...candidate.querySelectorAll('[data-viewer-component="product-fact"] summary')].find(summary=>summary.textContent==='Detaljer om varen'); check(details,'Grouped product details disclosure missing'); details.click(); await wait(()=>candidate.textContent.includes('Country of origin')&&candidate.textContent.includes('Keep chilled'));
  let currentReview=(await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}})).structuredContent.review;
  check(currentReview.destination==='alternatives'&&currentReview.items.every(item=>item.state==='needs-review'),'Opening alternatives implicitly accepted a product');
  const alternativeChoice=candidate.querySelector('.alternative-choice'); check(alternativeChoice&&!alternativeChoice.disabled,'Alternative card was not a direct replacement control'); const beforeComparisonReplacement=widgetCalls.length; alternativeChoice.click();
  await wait(()=>doc().querySelector('#title')?.textContent==='To decide'&&!button('To decide (2)')?.disabled);
  check(!button('Use selected alternative')&&widgetCalls.length===beforeComparisonReplacement+1&&widgetCalls.at(-1).arguments.action.kind==='replace','Alternative replacement required a second action or sent the wrong request');
  currentReview=(await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}})).structuredContent.review;
  const replacement=currentReview.items.find(item=>item.product_id===3);
  check(replacement?.quantity===2&&replacement.state==='needs-review'&&currentReview.items.find(item=>item.product_id===2)?.quantity===1,'Replacement changed the wrong candidate or lost the requested quantity');
  check(currentReview.items.every(item=>item.state==='needs-review')&&button('Ready (0)'),'Replacement implicitly accepted an item into Ready');
  const replacementRow=[...doc().querySelectorAll('.product-list article')].find(row=>row.textContent.includes('Smoke product 3'));
  replacementRow?.querySelector('button[aria-expanded]')?.click(); click('Choose alternative');
  await wait(()=>doc().querySelector('#title')?.textContent==='Choose an alternative');
  await search('unavailable'); await wait(()=>doc().querySelector('.alternative-options')?.textContent.includes('Smoke product 4'));
  const unavailable=[...doc().querySelectorAll('.alternative-options .product-card')].find(row=>row.textContent.includes('Smoke product 4'));
  check(unavailable?.querySelector('.alternative-choice:disabled')&&unavailable.textContent.includes('Unavailable'),'Unavailable alternative could be selected or was not labeled');
  await search('empty'); await wait(()=>doc().querySelector('.alternatives-empty'));
  check(doc().querySelector('#alternative-query')&&doc().querySelector('.alternatives-empty')?.textContent.includes('No alternatives were returned'),'Empty search was hidden or represented as a failure');
  await search('search-error');
  await wait(()=>doc().querySelector('main')?.textContent.includes('We could not confirm this action')&&button('Refresh Draft list'));
  check(!/stale|out of date|inactive/i.test(doc().querySelector('main')?.textContent||''),'Service failure was described as a stale card');
  check(!doc().querySelector('.alternatives-empty'),'Search failure was mislabeled as a successful empty result');
  click('Refresh Draft list'); await wait(()=>button('To decide (2)')&&!button('To decide (2)').disabled);
  currentReview=(await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}})).structuredContent.review;
  check(currentReview.items.every(item=>item.state==='needs-review'&&item.quantity>0),'Alternative search changed the authoritative local selection');
  check((await fetch('/stats').then(r=>r.json())).basketWrites===0,'Alternative comparison called a provider basket write');
  status.textContent='PASS: direct comparison facts, long disclosure, current divider, unavailable/empty/error results, no implicit acceptance; provider basket writes 0';
 } catch(error){status.textContent='FAIL: '+error.message+' | screen: '+(doc()?.querySelector('#title')?.textContent||'unavailable')+' | alternatives: '+(doc()?.querySelector('.alternatives')?.textContent||'none')+' | tool results: '+widgetResults.map(result=>result.name+':'+result.isError+':'+result.text).join(' | ');} finally{run.disabled=false;}
};
</script></body></html>`;
const server = createServer((req, res) => {
  if (req.url === "/mcp") {
    void mcpHandler(req, res);
    return;
  }
  void (async () => {
    if (req.url === "/") {
      res.setHeader("content-type", "text/html");
      res.end(page);
      return;
    }
    if (req.url === "/viewer") {
      const resource = (
        await client.readResource({ uri: PRODUCT_VIEWER_RESOURCE_URI })
      ).contents[0];
      res.setHeader("content-type", "text/html");
      res.end(
        resource && "text" in resource ? resource.text : "Missing viewer",
      );
      return;
    }
    if (req.url === "/reset" && req.method === "POST") {
      current = makeServer();
      basketReads = 0;
      writes = 0;
      preparedForSimulation = undefined;
      simulatedSubmitted = undefined;
      simulatedSubmissions = 0;
      nextSubmissionStatus = "submitted";
      unknownPriceScenario = false;
      res.end("reset");
      return;
    }
    if (req.url === "/unknown-price" && req.method === "POST") {
      unknownPriceScenario = true;
      res.end("enabled");
      return;
    }
    if (req.url === "/uncertain-next" && req.method === "POST") {
      nextSubmissionStatus = "uncertain";
      res.end("enabled");
      return;
    }
    if (req.url === "/stats") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          providerBasketCalls: basketReads + writes,
          basketReads,
          basketWrites: writes,
          simulatedSubmissions,
        }),
      );
      return;
    }
    if (req.url === "/call" && req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
        if (Buffer.concat(chunks).length > 16384) {
          throw new Error("Input too large");
        }
      }
      const input = JSON.parse(Buffer.concat(chunks).toString()) as {
        name: string;
        arguments: Record<string, unknown>;
      };
      if (
        input.name === "submit_product_review" &&
        nextSubmissionStatus !== "uncertain"
      ) {
        const prepared = preparedForSimulation;
        if (
          !prepared?.submission ||
          prepared.submission.status !== "prepared" ||
          input.arguments.submission_id !== prepared.submission.submission_id
        ) {
          throw new Error(
            "Only the exact locally prepared review may use the synthetic verified-submit result",
          );
        }
        simulatedSubmitted = structuredClone(prepared);
        simulatedSubmitted.submission!.status = nextSubmissionStatus;
        nextSubmissionStatus = "submitted";
        simulatedSubmissions++;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            structuredContent: {
              review: simulatedSubmitted,
            },
            content: [],
            isError: false,
          }),
        );
        return;
      }
      if (
        ![
          "start_product_review",
          "update_product_review",
          "submit_product_review",
          "update_product_review_conversation",
          "submit_product_review_conversation",
        ].includes(input.name)
      ) {
        throw new Error("Unexpected tool call in this smoke");
      }
      const action = input.arguments.action as
        | { kind?: string; destination?: ProductReviewSnapshot["destination"] }
        | undefined;
      if (
        input.name === "update_product_review" &&
        action?.kind === "navigate" &&
        simulatedSubmitted &&
        action.destination
      ) {
        simulatedSubmitted.destination = action.destination;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            structuredContent: { review: structuredClone(simulatedSubmitted) },
            content: [],
            isError: false,
          }),
        );
        return;
      }
      if (
        input.name === "submit_product_review" &&
        nextSubmissionStatus === "uncertain"
      ) {
        nextSubmissionStatus = "submitted";
      }
      const result = await client.callTool(input);
      if (
        input.name === "update_product_review" &&
        action?.kind === "prepare_submission"
      ) {
        const snapshot = (
          result.structuredContent as { review?: unknown } | undefined
        )?.review;
        if (snapshot && typeof snapshot === "object") {
          preparedForSimulation = structuredClone(
            snapshot,
          ) as ProductReviewSnapshot;
        }
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(result));
      return;
    }
    res.statusCode = 404;
    res.end();
  })().catch(() => {
    res.statusCode = 500;
    res.end("Smoke request failed");
  });
});
server.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
await client.connect(
  new StreamableHTTPClientTransport(new URL("/mcp", origin)),
);
console.log(`Review UI smoke: ${origin}`);
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const browserContext = await browser.newContext({
    viewport: { width: 375, height: 860 },
  });
  await installViewerAssetFixture(browserContext, viewerGeneration);
  const browserPage = await browserContext.newPage();
  browserPage.setDefaultTimeout(10_000);
  browserPage.setDefaultNavigationTimeout(10_000);
  await browserPage.goto(origin, { waitUntil: "domcontentloaded" });
  const status = browserPage.locator("#status");
  const waitForResult = async (phase: string) => {
    await browserPage.waitForFunction(
      () =>
        /^(PASS|FAIL):/.test(
          document.querySelector("#status")?.textContent ?? "",
        ),
      undefined,
      { timeout: 90_000 },
    );
    const result = await status.textContent();
    if (!result?.startsWith("PASS:")) {
      throw new Error(`${phase} failed: ${result}`);
    }
    console.log(`${phase}: ${result}`);
  };
  await browserPage.locator("#run").click();
  await waitForResult("MCP adapter recovery flow");
  await browserPage.locator("#flow").click();
  await waitForResult("MCP adapter continuous flow");
  await browserPage.locator("#alternatives").click();
  await waitForResult("MCP adapter alternatives comparison");
  const stats = await browserPage.evaluate(async () =>
    fetch("/stats").then(
      async (response) =>
        (await response.json()) as {
          providerBasketCalls: number;
          basketWrites: number;
        },
    ),
  );
  if (stats.basketWrites !== 0 || writes !== 0) {
    throw new Error(
      `Fake provider basket write boundary crossed: ${JSON.stringify(stats)}`,
    );
  }
} finally {
  await browser.close();
  await client.close();
  await closeViewerSmokeServer(server);
}
console.log(
  "MCP adapter browser smoke passed: recovery, current review controls, restart, exact prepare, and zero fake provider basket writes.",
);
