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
import type { Basket, Product, ShoppingClient } from "../src/client.js";
import { BasketProposalService } from "../src/proposals.js";
import { handleLocalBasketStateRequest } from "../src/local-basket-callback.js";
import {
  mutateOwnerLocalBasketInventory,
  type LocalBasketInventoryStorage,
} from "../src/local-basket-storage.js";
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
  directWrites = 0,
  nativeTransfers = 0;
let shoppingListCreates = 0,
  shoppingListUpdates = 0;
let simulatedSubmissions = 0;
let nextSubmissionStatus: "submitted" | "uncertain" = "submitted";
let unknownPriceScenario = false;
let nextShoppingListId = 1;
const shoppingLists = new Map<
  number,
  { id: number; name: string; items: Map<number, number> }
>();
let currentBasket: Basket = {
  items: [],
  productsPrice: 0,
  deliveryPrice: 0,
  numberOfProducts: 0,
  deliveryTime: "smoke",
};
const denied = async (): Promise<never> => {
  directWrites++;
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
  providerIdentity: () => "smoke-account",
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
    return structuredClone(currentBasket);
  },
  addToCart: denied,
  createShoppingList: async (name: string) => {
    shoppingListCreates++;
    const id = nextShoppingListId++;
    shoppingLists.set(id, { id, name, items: new Map() });
    return id;
  },
  updateShoppingListProduct: async (
    listId: number,
    productId: number,
    quantity: number,
  ) => {
    shoppingListUpdates++;
    const list = shoppingLists.get(listId);
    if (!list) {
      throw new Error("Synthetic shopping list is missing");
    }
    if (quantity === 0) {
      list.items.delete(productId);
      return;
    }
    list.items.set(productId, quantity);
  },
  listShoppingLists: async () =>
    [...shoppingLists.values()].map((list) => ({
      id: list.id,
      name: list.name,
      productCount: list.items.size,
      totalAmount: 0,
    })),
  getShoppingList: async (listId: number) => {
    const list = shoppingLists.get(listId);
    if (!list) {
      throw new Error("Synthetic shopping list is missing");
    }
    return {
      id: list.id,
      name: list.name,
      items: [...list.items].map(([productId, quantity]) => ({
        productId,
        quantity,
      })),
    };
  },
  deleteShoppingList: async (listId: number) => {
    shoppingLists.delete(listId);
  },
  addShoppingListToCart: async (listId: number) => {
    const list = shoppingLists.get(listId);
    if (!list) {
      throw new Error("Synthetic shopping list is missing");
    }
    nativeTransfers++;
    const items = [...list.items].map(([id, quantity]) => {
      const view = product(id);
      return {
        id,
        name: view.name,
        quantity,
        total: quantity * (view.price ?? 0),
      };
    });
    currentBasket = {
      ...currentBasket,
      items: [...currentBasket.items, ...items],
      productsPrice:
        (currentBasket.productsPrice ?? 0) +
        items.reduce((total, item) => total + (item.total ?? 0), 0),
      numberOfProducts:
        (currentBasket.numberOfProducts ?? 0) +
        items.reduce((total, item) => total + item.quantity, 0),
    };
  },
} as unknown as ShoppingClient;
const proposalService = new BasketProposalService(catalogue);
const uncertainProposals = {
  prepareAdditions: (
    ...args: Parameters<BasketProposalService["prepareAdditions"]>
  ) => proposalService.prepareAdditions(...args),
  prepareShoppingListAdditions: (
    ...args: Parameters<BasketProposalService["prepareShoppingListAdditions"]>
  ) => proposalService.prepareShoppingListAdditions(...args),
  transferNativeShoppingList: (
    ...args: Parameters<BasketProposalService["transferNativeShoppingList"]>
  ) => proposalService.transferNativeShoppingList(...args),
  apply: async (...args: Parameters<BasketProposalService["apply"]>) => {
    simulatedSubmissions++;
    if (nextSubmissionStatus === "uncertain") {
      nextSubmissionStatus = "submitted";
      throw new Error(
        "Synthetic ambiguous outcome; provider mutation is forbidden in this smoke.",
      );
    }
    return proposalService.apply(...args);
  },
} as unknown as BasketProposalService;
// Keep durable storage across MCP restarts, just as the owner Durable Object does.
let stored = new Map<string, unknown>();
const storage: LocalBasketInventoryStorage = {
  get: async <T>(key: string) => structuredClone(stored.get(key)) as T,
  put: async (key, value) => {
    stored.set(key, structuredClone(value));
  },
  delete: async (key) => stored.delete(key),
  setAlarm: async () => {},
  deleteAlarm: async () => {},
  transaction: async (action) => {
    const before = structuredClone(stored);
    try {
      return await action(storage);
    } catch (error) {
      stored = before;
      throw error;
    }
  },
};
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  if (url.hostname !== "local-basket-state.internal") {
    return originalFetch(input, init);
  }
  return handleLocalBasketStateRequest(
    new Request(input, init),
    {
      idFromName: (owner) => owner,
      get: () => ({
        mutate: (owner, command) =>
          mutateOwnerLocalBasketInventory(storage, owner, command),
      }),
    },
    async (capability) =>
      capability === "smoke-capability" ? "smoke-owner" : undefined,
  );
}) as typeof fetch;
const makeServer = () =>
  createMcpServer(
    catalogue,
    async () => undefined,
    process.env,
    uncertainProposals,
    {
      principalKey: "smoke-owner",
      policyRevision: "smoke-policy",
      localBasketCapability: "smoke-capability",
    },
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
const waitForStats=async predicate=>{const until=Date.now()+15000;while(Date.now()<until){const stats=await fetch('/stats').then(r=>r.json());if(predicate(stats))return stats;await new Promise(r=>setTimeout(r,25));}throw new Error('Timed out waiting for provider stats');};
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
  widgetResults.push({name:m.params.name,isError:result.isError===true,structuredContent:result.structuredContent,text:(result.content||[]).filter(content=>content.type==='text').map(content=>content.text).join(' ')});
  // Reproduce ChatGPT wrapping a tool error as a JSON-RPC exception.
  const response=result.isError ? {error:{code:-32602,message:'Error code: INVALID_ARGUMENT; Error calling MCP tool: '+result.content.map(c=>c.text||'').join(' ')}} : {result};
  frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,...response},location.origin);
  if (!result.isError) frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},location.origin);
 }
});
// Runs against the actual iframe DOM, MCP transport and draft service. No provider access.
document.getElementById('run').onclick = async () => {
 const run=document.getElementById('run'); run.disabled=true;
 const doc=()=>frame.contentDocument, title=()=>doc()?.querySelector('#title')?.textContent;
 const text=()=>doc()?.querySelector('main')?.textContent||'';
 const buttons=()=>[...doc().querySelectorAll('button')], button=label=>buttons().find(b=>b.textContent.trim()===label);
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const wait=async predicate=>{const until=Date.now()+15000;while(!predicate()){if(Date.now()>until)throw new Error('Timed out: '+(doc()?.querySelector('main')?.innerText||'no viewer main'));await new Promise(r=>setTimeout(r,25));}};
  const click=label=>{const b=button(label);check(b&&!b.disabled,'Missing enabled control: '+label);b.click();};
  const saveList=async name=>{const input=doc().querySelector('#shopping-list-name');check(input,'Unsaved draft has no Save form');await wait(()=>!input.disabled&&input.form.querySelector('button[type="submit"]')&&!input.form.querySelector('button[type="submit"]').disabled);input.value=name;input.form.querySelector('button[type="submit"]').click();await wait(()=>title()===name&&button('Submit to Nemlig basket'));};
 try {
  await fetch('/reset',{method:'POST'}); widgetCalls.length=0; transcript=undefined; initialized=false;
  const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true})); frame.src='/viewer'; await loaded; await wait(()=>initialized);
  transcript=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}]}}); publish();
  await wait(()=>title()==='Unsaved shopping list'&&doc().querySelectorAll('.product-list article').length===2);
  check(doc().querySelectorAll('input[type=checkbox]').length===0,'Unified list rendered checkbox selection');
  check(!buttons().some(b=>b.textContent.includes('To decide')||b.textContent.includes('Ready (')),'Unified list rendered destination tabs');
  check(transcript.structuredContent.review.items.every(item=>item.state==='ready'),'Fresh basket rows are not all Ready');
  const beforeReload=widgetCalls.length; const reloaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true})); frame.contentWindow.location.reload(); await reloaded;
  await wait(()=>title()==='Unsaved shopping list'&&doc().querySelectorAll('.product-list article').length===2);
  check(widgetCalls.length===beforeReload,'Reload made an unnecessary service call');
  const summary=doc().querySelector('.product-list article [data-viewer-component="product-summary"]'); check(summary,'Product summary missing'); summary.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));
  await wait(()=>doc().querySelector('.product-inline-actions [data-viewer-component="quantity-control"] button:last-of-type'));
  const quantity=doc().querySelector('.product-inline-actions [data-viewer-component="quantity-control"] button:last-of-type'); check(quantity,'Quantity controls missing'); quantity.click();
  doc().querySelector('.product-inline-actions [aria-label="Close product actions"]')?.click();
  await wait(()=>widgetCalls.some(c=>c.arguments.action?.kind==='quantity'));
  await saveList('Regression list');
  await wait(()=>title()==='Regression list');
  const savedReview=widgetResults.at(-1).structuredContent.review;
  check(!button('Submit to Nemlig basket').disabled,'Saved native-list Submit was unavailable');
  await fetch('/change-list',{method:'POST'});
  click('Submit to Nemlig basket');
  await wait(()=>widgetResults.some(result=>result.name==='submit_product_review'&&result.isError));
  const staleResult=widgetResults.findLast(result=>result.name==='submit_product_review');
  check(staleResult.text.includes('Nemlig changed this list'),'Stale list rejection did not explain the refresh requirement');
  check((await fetch('/stats').then(r=>r.json())).nativeTransfers===0,'Changed list reached the basket transfer boundary');
  await wait(()=>widgetResults.some(result=>result.name==='update_product_review'&&result.structuredContent.review.items.some(item=>item.product_id===2&&item.quantity===3)));
  const refreshed=widgetResults.findLast(result=>result.name==='update_product_review').structuredContent.review;
  check(JSON.stringify(refreshed.items.map(item=>[item.product_id,item.quantity]))===JSON.stringify([[1,2],[2,3]]),'Refreshing did not show the current native-list contents');
  check(text().includes('Nemlig changed this list'),'Changed-list rejection was not shown after refresh');
  check(!button('Submit to Nemlig basket').disabled,'Refreshed native list was unavailable for deliberate submission');
  click('Submit to Nemlig basket');
  await wait(()=>widgetResults.some(result=>result.name==='submit_product_review'&&result.structuredContent?.result?.status==='completed'));
  const submitted=widgetResults.findLast(result=>result.name==='submit_product_review');
  check(submitted.structuredContent.review.submission?.status==='submitted','Native-list transfer receipt was not returned');
  const submittedStats=await waitForStats(stats=>stats.nativeTransfers===1);
  check(submittedStats.shoppingListCount===1,'Submission removed its source list');
  check(submittedStats.basketReads>=3&&submittedStats.basketWrites===0,'Transfer skipped basket readback or used a direct basket write');
  check(JSON.stringify(submittedStats.basketItems.map(item=>[item.id,item.quantity]))===JSON.stringify([[1,2],[2,3]]),'Basket readback did not contain the exact refreshed quantities');
  check(!widgetCalls.some(c=>c.arguments.action?.kind==='prepare_submission'),'Submit used an extra preparation action');
  const stats=await fetch('/stats').then(r=>r.json()); check(stats.shoppingListCount===1&&stats.shoppingListCreates===1&&stats.shoppingListUpdates===2,'Review created a duplicate transfer list'); check(stats.nativeTransfers===1&&stats.basketWrites===0,'Submit did not use one native-list transfer');
  check(widgetCalls.every(c=>!('representation' in c.arguments)),'Viewer sent a representation selector');
  await fetch('/restart',{method:'POST'});
  const recovered=await call({name:'start_product_review',arguments:{shopping_list_id:savedReview.shoppingListId}});
  check(recovered.structuredContent.review.shoppingListId===savedReview.shoppingListId,'Restart lost the saved Nemlig shopping list');
  check(recovered.structuredContent.review.items.length===2&&recovered.structuredContent.review.submission?.status==='submitted','Restart lost the completed transfer receipt or list rows');
  const stale=await call({name:'submit_product_review',arguments:{shopping_list_id:savedReview.shoppingListId,submission_id:'00000000-0000-4000-8000-000000000000'}});
  check(stale.isError===true,'Restart accepted a submission without prepared authority');
  check((await fetch('/stats').then(r=>r.json())).nativeTransfers===0,'Restart recovery replayed a completed transfer');
  transcript=recovered; initialized=false; frame.src='/viewer';
  await wait(()=>initialized&&text().includes('Nemlig confirmed the addition'));
  status.textContent='PASS: saved list transferred once, basket readback matched, source retained, and restart blocked replay';
 } catch(error) {status.textContent='FAIL: '+error.message+' | viewer: '+(doc()?.body?.innerText||'no iframe document')+' | widget calls: '+JSON.stringify(widgetCalls)+' | widget results: '+JSON.stringify(widgetResults);} finally {run.disabled=false;}
};
document.getElementById('flow').onclick = async () => {
 const run=document.getElementById('flow'); run.disabled=true;
 const doc=()=>frame.contentDocument, title=()=>doc()?.querySelector('#title')?.textContent;
 const text=()=>doc()?.body?.textContent||'';
 const buttons=()=>[...doc().querySelectorAll('button')], button=label=>buttons().find(b=>b.textContent.trim()===label);
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const wait=async predicate=>{const until=Date.now()+15000;while(!predicate()){if(Date.now()>until)throw new Error('Timed out: '+(doc()?.querySelector('main')?.innerText||'no viewer main'));await new Promise(r=>setTimeout(r,25));}};
 const click=label=>{const b=button(label);check(b&&!b.disabled,'Missing enabled control: '+label);b.click();};
 const saveList=async name=>{const input=doc().querySelector('#shopping-list-name');check(input,'Unsaved draft has no Save form');await wait(()=>!input.disabled&&input.form.querySelector('button[type="submit"]')&&!input.form.querySelector('button[type="submit"]').disabled);input.value=name;input.form.querySelector('button[type="submit"]').click();await wait(()=>title()===name&&button('Submit to Nemlig basket'));};
 try {
  status.textContent='Checking preparation with an unknown price'; widgetCalls.length=0;
  await fetch('/reset',{method:'POST'}); await fetch('/unknown-price',{method:'POST'});
  transcript=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}]}});
  initialized=false; frame.src='/viewer'; await wait(()=>initialized);
  await wait(()=>title()==='Unsaved shopping list'&&doc().querySelectorAll('.product-list article').length===2);
  await saveList('Unknown price list');
  await wait(()=>text().includes('Unknown price'));
  check(!button('Submit to Nemlig basket').disabled,'Unknown-price native-list Submit was unavailable');
  click('Submit to Nemlig basket');
  const stats=await waitForStats(value=>value.nativeTransfers===1);
  check(stats.shoppingListCount===1&&stats.shoppingListCreates===1&&stats.shoppingListUpdates===2,'Review created a duplicate transfer list');
  check(stats.basketReads>=3&&stats.basketWrites===0&&JSON.stringify(stats.basketItems.map(item=>[item.id,item.quantity]))===JSON.stringify([[1,1],[2,2]]),'Unknown-price transfer did not complete with exact basket readback');
  check(!widgetCalls.some(c=>c.arguments.action?.kind==='prepare_submission'),'Submit used an extra preparation action');
  status.textContent='PASS: unknown-price list submitted once with basket readback and no duplicate list';
 } catch(error){status.textContent='FAIL: '+error.message+' | viewer: '+(doc()?.body?.innerText||'no iframe document')+' | widget calls: '+JSON.stringify(widgetCalls);} finally{run.disabled=false;}
};
document.getElementById('alternatives').onclick = async () => {
 const run=document.getElementById('alternatives'); run.disabled=true;
 status.textContent='Checking alternatives comparison';
 const doc=()=>frame.contentDocument, title=()=>doc()?.querySelector('#title')?.textContent;
 const buttons=()=>[...doc().querySelectorAll('button')], button=label=>buttons().find(b=>b.textContent.trim()===label);
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const wait=async predicate=>{const until=Date.now()+15000;while(!predicate()){if(Date.now()>until)throw new Error('Timed out: '+(doc()?.querySelector('main')?.innerText||'no viewer main'));await new Promise(r=>setTimeout(r,25));}};
 const click=label=>{const b=button(label);check(b&&!b.disabled,'Missing enabled control: '+label);b.click();};
 try {
  await fetch('/reset',{method:'POST'}); widgetCalls.length=0; initialized=false;
  transcript=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:2},{product_id:2,quantity:1}]}}); frame.src='/viewer'; await wait(()=>initialized&&doc()?.querySelector('main.viewer')); publish();
  await wait(()=>title()==='Unsaved shopping list'&&doc().querySelectorAll('.product-list article').length===2);
  const draftId=transcript.structuredContent.review.draftId;
  const before=await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'},draft_id:draftId}});
  const target=[...doc().querySelectorAll('.product-list article')].find(row=>row.textContent.includes('Smoke product 1')); check(target,'Product missing');
  const row=target.closest('.product-action-row'); check(row,'Product row missing'); const trigger=row.querySelector('[data-viewer-component="product-summary"]'); check(trigger,'Product summary missing'); trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true})); await wait(()=>doc().querySelector('.product-inline-actions'));
  const beforeMenu=widgetCalls.length; const find=[...doc().querySelectorAll('.product-inline-actions button')].find(item=>item.getAttribute('aria-label')==='Find alternatives'); check(find,'Find alternative action missing'); find.click(); await wait(()=>title()==='Find an alternative');
  check(widgetCalls.length===beforeMenu+1&&widgetCalls.at(-1).arguments.action.kind==='alternatives','Alternative view did not use the read-only search action');
  const unchanged=(await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'},draft_id:draftId}})).structuredContent.review;
  check(JSON.stringify(unchanged.items.map(i=>[i.product_id,i.quantity,i.state]))===JSON.stringify(before.structuredContent.review.items.map(i=>[i.product_id,i.quantity,i.state])),'Opening alternatives changed the Local basket');
  const query=doc().querySelector('#alternative-query'); check(query,'Alternative search missing');
  Object.getOwnPropertyDescriptor(doc().defaultView.HTMLInputElement.prototype,'value').set.call(query,'unavailable');
  query.dispatchEvent(new Event('input',{bubbles:true})); query.form.requestSubmit();
  await wait(()=>doc().querySelector('.alternative-options')?.textContent.includes('Smoke product 4'));
  const back=button('Back to shopping list'); check(back,'Back control missing'); back.click(); await wait(()=>title()==='Unsaved shopping list');
  check((await fetch('/stats').then(r=>r.json())).basketWrites===0,'Alternative navigation wrote to Nemlig');
  status.textContent='PASS: alternative search/navigation leaves shopping list unchanged; provider basket writes 0';
 } catch(error){status.textContent='FAIL: '+error.message+' | screen: '+(title()||'unavailable')+' | widget calls: '+JSON.stringify(widgetCalls);} finally{run.disabled=false;}
};
</script></body></html>`;
const server = createServer((req, res) => {
  if (req.url === "/mcp") {
    void mcpHandler(req, res);
    return;
  }
  // Fixture routes share reset counters and durable storage; MCP owns the behavior under test.
  // fallow-ignore-next-line complexity
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
    if (req.url === "/restart" && req.method === "POST") {
      current = makeServer();
      basketReads = 0;
      directWrites = 0;
      nativeTransfers = 0;
      simulatedSubmissions = 0;
      nextSubmissionStatus = "submitted";
      unknownPriceScenario = false;
      res.end("restart");
      return;
    }
    if (req.url === "/reset" && req.method === "POST") {
      current = makeServer();
      basketReads = 0;
      directWrites = 0;
      nativeTransfers = 0;
      shoppingListCreates = 0;
      shoppingListUpdates = 0;
      simulatedSubmissions = 0;
      nextSubmissionStatus = "submitted";
      unknownPriceScenario = false;
      nextShoppingListId = 1;
      shoppingLists.clear();
      currentBasket = {
        items: [],
        productsPrice: 0,
        deliveryPrice: 0,
        numberOfProducts: 0,
        deliveryTime: "smoke",
      };
      res.end("reset");
      return;
    }
    if (req.url === "/unknown-price" && req.method === "POST") {
      unknownPriceScenario = true;
      res.end("enabled");
      return;
    }
    if (req.url === "/change-list" && req.method === "POST") {
      const list = shoppingLists.get(1);
      if (!list) {
        throw new Error("Synthetic shopping list is missing");
      }
      list.items.set(2, 3);
      res.end("changed");
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
          providerBasketCalls: basketReads + directWrites + nativeTransfers,
          basketReads,
          basketWrites: directWrites,
          nativeTransfers,
          basketItems: currentBasket.items,
          shoppingListCount: shoppingLists.size,
          shoppingListCreates,
          shoppingListUpdates,
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
      const result = await client.callTool({
        ...input,
        _meta: { "openai/session": "review-ui-smoke-conversation" },
      });
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
  if (stats.basketWrites !== 0 || directWrites !== 0) {
    throw new Error(
      `Fake provider basket write boundary crossed: ${JSON.stringify(stats)}`,
    );
  }
} finally {
  await browser.close();
  await client.close();
  await closeViewerSmokeServer(server);
  globalThis.fetch = originalFetch;
}
console.log(
  "MCP adapter browser smoke passed: saved-list transfer, basket readback, restart replay guard, alternatives, and zero direct basket writes.",
);
