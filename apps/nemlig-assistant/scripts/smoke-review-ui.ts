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
  shoppingListUpdates = 0,
  nativeListWrites = 0;
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
    return [product(1), product(2), product(3), product(6)];
  },
  getCart: async () => {
    basketReads++;
    return structuredClone(currentBasket);
  },
  addToCart: denied,
  addManyToCart: async (
    additions: Array<{ productId: number; quantity: number }>,
    options: { beforeDispatch: (baseline: Basket) => Promise<void> },
  ) => {
    const baseline = structuredClone(currentBasket);
    await options.beforeDispatch(baseline);
    directWrites++;
    simulatedSubmissions++;
    const uncertain = nextSubmissionStatus === "uncertain";
    if (uncertain) {
      nextSubmissionStatus = "submitted";
    }
    const addedItems = additions.map(({ productId, quantity }) => {
      const view = product(productId);
      return {
        id: productId,
        name: view.name,
        quantity,
        total: quantity * (view.price ?? 0),
      };
    });
    currentBasket = {
      ...baseline,
      items: [...baseline.items, ...addedItems],
      numberOfProducts: [...baseline.items, ...addedItems].reduce(
        (total, item) => total + (item.quantity ?? 0),
        0,
      ),
    };
    if (uncertain) {
      throw new Error(
        "Synthetic ambiguous outcome; provider mutation may have occurred.",
      );
    }
    return structuredClone(currentBasket);
  },
  createShoppingListFromBasket: async (options: {
    beforeDispatch: (baseline: Basket) => Promise<void>;
  }) => {
    const baseline = structuredClone(currentBasket);
    await options.beforeDispatch(baseline);
    shoppingListCreates++;
    return structuredClone(currentBasket);
  },
  createShoppingList: async (name: string) => {
    shoppingListCreates++;
    nativeListWrites++;
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
    nativeListWrites++;
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
    nativeListWrites++;
    shoppingLists.delete(listId);
  },
  addShoppingListToCart: async (listId: number) => {
    const list = shoppingLists.get(listId);
    if (!list) {
      throw new Error("Synthetic shopping list is missing");
    }
    nativeTransfers++;
    nativeListWrites++;
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
  createMcpServer(catalogue, async () => undefined, process.env, {
    principalKey: "smoke-owner",
    policyRevision: "smoke-policy",
    localBasketCapability: "smoke-capability",
  });
let current = makeServer();
const handler = createMcpHandler(() => current, { legacy: "reject" });
const mcpHandler = toNodeHandler(handler);
const client = new Client(
  { name: "review-ui-smoke", version: "1" },
  { versionNegotiation: { mode: { pin: "2026-07-28" } } },
);
const page = `<!doctype html><html><body><h1>Selection recovery smoke</h1>
<button id="start">Start sample selection</button><button id="reset">Simulate server restart</button><button id="replace">Create current selection without updating card</button>
<button id="run">Run regression smoke</button><button id="flow">Run continuous local flow</button><button id="alternatives">Run alternatives comparison smoke</button><button id="uncertain">Run uncertain submission smoke</button><output id="status">Ready</output><iframe id="viewer" src="/viewer" style="width:100%;height:760px"></iframe>
<script>
const frame = document.getElementById('viewer'), status = document.getElementById('status');
let transcript, offline = false, initialized = false, conversationMessages = 0;
const widgetCalls = [], widgetResults = [];
const publish = () => frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:transcript},location.origin);
const call = args => fetch('/call', {method:'POST',body:JSON.stringify(args)}).then(r=>r.json());
const waitForStats=async predicate=>{const until=Date.now()+15000;while(Date.now()<until){const stats=await fetch('/stats').then(r=>r.json());if(predicate(stats))return stats;await new Promise(r=>setTimeout(r,25));}throw new Error('Timed out waiting for provider stats');};
document.getElementById('start').onclick = async () => {
 transcript = await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}],creation_id:'00000000-0000-4000-8000-000000000001'}});
 publish();
 status.textContent='Selection shown';
};
document.getElementById('replace').onclick = async () => { await call({name:'start_product_review',arguments:{items:[{product_id:3,quantity:4}],creation_id:'00000000-0000-4000-8000-000000000002'}}); status.textContent='Current native list created; old card retained'; };
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
// Runs against the actual iframe DOM, MCP transport, and fake native-list provider.
document.getElementById('run').onclick = async () => {
 const run=document.getElementById('run'); run.disabled=true;
 const doc=()=>frame.contentDocument, title=()=>doc()?.querySelector('#title')?.textContent;
 const text=()=>doc()?.querySelector('main')?.textContent||'';
 const buttons=()=>[...doc().querySelectorAll('button')], button=label=>buttons().find(b=>b.textContent.trim()===label);
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const wait=async predicate=>{const until=Date.now()+15000;while(!predicate()){if(Date.now()>until)throw new Error('Timed out: '+(doc()?.querySelector('main')?.innerText||'no viewer main'));await new Promise(r=>setTimeout(r,25));}};
 try {
  await fetch('/reset',{method:'POST'}); widgetCalls.length=0; widgetResults.length=0; initialized=false;
  transcript=await call({name:'start_product_review',arguments:{shopping_list_id:77}});
  frame.src='/viewer'; await wait(()=>initialized); publish();
  await wait(()=>widgetResults.some(result=>result.name==='update_product_review'&&!result.isError&&result.structuredContent?.review?.draftId===transcript.structuredContent.review.draftId));
  await wait(()=>title()==='Temporary basket draft'&&doc().querySelectorAll('.product-list .product-card').length===2&&button('Add to Nemlig basket')&&!button('Add to Nemlig basket').disabled);
  await wait(()=>doc().querySelectorAll('.product-action-row').length===2);
  const review=transcript.structuredContent.review;
  check(review.basketMode==='direct-basket'&&review.draftId,'Saved list was not copied into a temporary direct draft');
  check(JSON.stringify(review.items.map(item=>[item.product_id,item.quantity]))===JSON.stringify([[1,1],[2,2]]),'Loaded source contents changed');
  const stats=await fetch('/stats').then(r=>r.json());
  check(stats.nativeListWrites===0&&stats.nativeTransfers===0&&stats.basketWrites===0,'Loading a saved list wrote to Nemlig');
  check(JSON.stringify(stats.sourceItems)===JSON.stringify([[1,1],[2,2]]),'Read-only source list changed during draft load');
  check(JSON.stringify(stats.basketItems.map(item=>[item.id,item.quantity]))===JSON.stringify([[90,3]]),'Source loading changed existing basket rows');
  const row=[...doc().querySelectorAll('.product-action-row')].find(item=>item.textContent.includes('Smoke product 2'));
  const summary=row?.querySelector('[data-viewer-component="product-summary"]');
  check(summary,'Loaded source product row missing');
  summary.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));
  await wait(()=>row.querySelector('.product-inline-actions'));
  const plus=()=>[...doc().querySelectorAll('.product-action-row')].find(item=>item.textContent.includes('Smoke product 2'))?.querySelector('.product-inline-actions [data-viewer-component="quantity-control"] button[aria-label^="Increase quantity"]');
  await wait(()=>plus()&&!plus().disabled);
  plus().click();
  await wait(()=>widgetResults.some(result=>result.name==='update_product_review'&&result.structuredContent.review.items.some(item=>item.product_id===2&&item.quantity===3)));
  transcript.structuredContent.review=widgetResults.findLast(result=>result.name==='update_product_review').structuredContent.review;
  const editedStats=await fetch('/stats').then(r=>r.json());
  check(editedStats.nativeListWrites===0&&JSON.stringify(editedStats.sourceItems)===JSON.stringify([[1,1],[2,2]]),'Draft edit changed its read-only source');
  status.textContent='PASS: saved-list rows loaded and edited in a temporary draft; source and basket unchanged';
 } catch(error) {status.textContent='FAIL: '+error.message+' | viewer: '+(doc()?.body?.innerText||'no iframe document')+' | rows: '+JSON.stringify([...doc().querySelectorAll('.product-list .product-card')].map(row=>row.outerHTML.slice(0,250)))+' | widget calls: '+JSON.stringify(widgetCalls.map(call=>({name:call.name,action:call.arguments.action?.kind,draft_id:call.arguments.draft_id,shopping_list_id:call.arguments.shopping_list_id})))+' | results: '+JSON.stringify(widgetResults.map(result=>({name:result.name,isError:result.isError,text:result.text})));} finally {run.disabled=false;}
};
document.getElementById('flow').onclick = async () => {
 const run=document.getElementById('flow'); run.disabled=true;
 status.textContent='Checking direct bulk submission and optional save';
 const doc=()=>frame.contentDocument, title=()=>doc()?.querySelector('#title')?.textContent;
 const buttons=()=>[...doc().querySelectorAll('button')], button=label=>buttons().find(b=>b.textContent.trim()===label);
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const wait=async predicate=>{const until=Date.now()+15000;while(!predicate()){if(Date.now()>until)throw new Error('Timed out: '+(doc()?.querySelector('main')?.innerText||'no viewer main'));await new Promise(r=>setTimeout(r,25));}};
 const click=label=>{const b=button(label);check(b&&!b.disabled,'Missing enabled control: '+label);b.click();};
 try {
  check(transcript?.structuredContent?.review?.draftId,'Run source-load smoke first');
  const draft=transcript.structuredContent.review;
  const before=await fetch('/stats').then(r=>r.json());
  click('Add to Nemlig basket');
  await wait(()=>widgetResults.some(result=>result.name==='submit_product_review'&&result.structuredContent?.result?.status==='completed'));
  const submission=widgetResults.findLast(result=>result.name==='submit_product_review');
  check(submission.structuredContent.review.submission?.status==='submitted','Bulk basket acknowledgement was not returned');
  let stats=await waitForStats(value=>value.basketWrites===1);
  check(stats.nativeListWrites===0&&stats.nativeTransfers===0,'Submit mutated a saved shopping list');
  check(stats.shoppingListCreates===0,'Submit implicitly created a shopping list');
  check(JSON.stringify(stats.basketItems.map(item=>[item.id,item.quantity]))===JSON.stringify([[90,3],[1,1],[2,3]]),'Single bulk submit did not preserve old basket rows and add the exact reviewed rows');
  check(before.basketWrites===0&&stats.basketWrites===1,'Submit did not use exactly one bulk mutation');
  const save=button('Save current basket as shopping list');
  check(save&&!save.disabled,'Verified submit did not offer an explicit separate basket save');
  save.click();
  await wait(()=>widgetResults.some(result=>result.name==='save_basket_as_shopping_list'&&!result.isError));
  stats=await fetch('/stats').then(r=>r.json());
  check(stats.shoppingListCreates===1&&stats.nativeListWrites===0,'Explicit save did not call only the basket-to-list endpoint');
  check(stats.basketWrites===1&&JSON.stringify(stats.basketItems.map(item=>[item.id,item.quantity]))===JSON.stringify([[90,3],[1,1],[2,3]]),'Saving the whole basket changed or cleared its contents');
  check(JSON.stringify(stats.sourceItems)===JSON.stringify([[1,1],[2,2]]),'Submission or save changed the loaded source list');
  status.textContent='PASS: one additive bulk submit preserved the basket; separate save preserved it again';
 } catch(error){status.textContent='FAIL: '+error.message+' | screen: '+(doc()?.body?.innerText||'unavailable')+' | calls: '+JSON.stringify(widgetCalls.map(call=>call.name))+' | results: '+JSON.stringify(widgetResults.map(result=>({name:result.name,isError:result.isError,text:result.text,review:result.structuredContent?.review?.submission})));} finally{run.disabled=false;}
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
  await wait(()=>title()==='Temporary basket draft'&&doc().querySelectorAll('.product-list .product-card').length===2);
  const draft=transcript.structuredContent.review;
  const targetArgs={draft_id:draft.draftId,review_context_id:draft.reviewContextId};
  const before=await call({name:'update_product_review',arguments:{...targetArgs,action:{kind:'show'}}});
  const target=[...doc().querySelectorAll('.product-list .product-card')].find(row=>row.textContent.includes('Smoke product 1')); check(target,'Product missing');
  const row=target.closest('.product-action-row'); check(row,'Product row missing'); const trigger=row.querySelector('[data-viewer-component="product-summary"]'); check(trigger,'Product summary missing'); trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true})); await wait(()=>doc().querySelector('.product-inline-actions'));
  const beforeMenu=widgetCalls.length; const find=[...doc().querySelectorAll('.product-inline-actions button')].find(item=>item.getAttribute('aria-label')==='Find alternatives'); check(find,'Find alternative action missing'); find.click(); await wait(()=>title()==='Find an alternative');
  check(widgetCalls.length===beforeMenu+1&&widgetCalls.at(-1).arguments.action.kind==='alternatives','Alternative view did not use the read-only search action');
  const unchanged=(await call({name:'update_product_review',arguments:{...targetArgs,action:{kind:'show'}}})).structuredContent.review;
  check(JSON.stringify(unchanged.items.map(i=>[i.product_id,i.quantity,i.state]))===JSON.stringify(before.structuredContent.review.items.map(i=>[i.product_id,i.quantity,i.state])),'Opening alternatives changed the temporary draft');
  const query=doc().querySelector('#alternative-query'); check(query,'Alternative search missing');
  Object.getOwnPropertyDescriptor(doc().defaultView.HTMLInputElement.prototype,'value').set.call(query,'unavailable');
  query.dispatchEvent(new Event('input',{bubbles:true})); query.form.requestSubmit();
  await wait(()=>doc().querySelector('.alternative-options')?.textContent.includes('Smoke product 4'));
  const back=button('Back to draft'); check(back,'Back control missing'); back.click(); await wait(()=>title()==='Temporary basket draft');
  check((await fetch('/stats').then(r=>r.json())).basketWrites===0,'Alternative navigation wrote to Nemlig');
  status.textContent='PASS: alternative search/navigation leaves the temporary draft unchanged; provider basket writes 0';
 } catch(error){status.textContent='FAIL: '+error.message+' | screen: '+(title()||'unavailable')+' | widget calls: '+JSON.stringify(widgetCalls);} finally{run.disabled=false;}
};
document.getElementById('uncertain').onclick = async () => {
 const run=document.getElementById('uncertain'); run.disabled=true;
 status.textContent='Checking uncertain direct Submit';
 const doc=()=>frame.contentDocument, text=()=>doc()?.querySelector('main')?.textContent||'';
 const wait=async predicate=>{const until=Date.now()+15000;while(!predicate()){if(Date.now()>until)throw new Error('Timed out: '+text());await new Promise(r=>setTimeout(r,25));}};
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 try {
  await fetch('/reset',{method:'POST'}); widgetCalls.length=0; widgetResults.length=0; initialized=false;
  transcript=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1}]}});
  frame.src='/viewer'; await wait(()=>initialized&&doc()?.querySelector('main.viewer')); publish();
  await wait(()=>doc()?.querySelectorAll('.product-list .product-card').length===1&&text().includes('Smoke product 1'));
  const stale=transcript;
  await fetch('/uncertain-next',{method:'POST'});
  await wait(()=>[...doc().querySelectorAll('button')].some(button=>button.textContent.trim()==='Add to Nemlig basket'&&!button.disabled));
  const submit=[...doc().querySelectorAll('button')].find(button=>button.textContent.trim()==='Add to Nemlig basket');
  check(submit&&!submit.disabled,'Direct draft did not offer Submit'); submit.click();
  await wait(()=>widgetResults.some(result=>result.name==='submit_product_review'));
  const stats=await fetch('/stats').then(r=>r.json());
  check(stats.basketWrites===1&&stats.simulatedSubmissions===1,'Uncertain Submit did not make exactly one provider attempt');
  publish(); await new Promise(resolve=>setTimeout(resolve,100));
  const repeat=[...doc().querySelectorAll('button')].find(button=>button.textContent.trim()==='Add to Nemlig basket');
  check(!repeat||repeat.disabled,'Stale passive output re-enabled an uncertain Submit');
  check((await fetch('/stats').then(r=>r.json())).basketWrites===1,'Passive output retried an uncertain Submit');
  initialized=false; frame.src='/viewer'; await wait(()=>initialized&&doc()?.querySelector('main.viewer')); transcript=stale; publish();
  await wait(()=>text().includes('A previous addition needs checking'));
  const remounted=[...doc().querySelectorAll('button')].find(button=>button.textContent.trim()==='Add to Nemlig basket');
  check(!remounted||remounted.disabled,'Remount re-enabled an uncertain Submit');
  check((await fetch('/stats').then(r=>r.json())).basketWrites===1,'Remount retried an uncertain Submit');
  status.textContent='PASS: uncertain direct Submit attempted once; stale output and remount could not replay it';
 } catch(error){status.textContent='FAIL: '+error.message+' | screen: '+text()+' | calls: '+JSON.stringify(widgetCalls.map(call=>call.name))+' | results: '+JSON.stringify(widgetResults.map(result=>({name:result.name,isError:result.isError,text:result.text})));} finally{run.disabled=false;}
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
      simulatedSubmissions = 0;
      nextSubmissionStatus = "submitted";
      unknownPriceScenario = false;
      res.end("restart");
      return;
    }
    if (req.url === "/reset" && req.method === "POST") {
      stored.clear();
      current = makeServer();
      basketReads = 0;
      directWrites = 0;
      nativeTransfers = 0;
      shoppingListCreates = 0;
      shoppingListUpdates = 0;
      nativeListWrites = 0;
      simulatedSubmissions = 0;
      nextSubmissionStatus = "submitted";
      unknownPriceScenario = false;
      nextShoppingListId = 1;
      shoppingLists.clear();
      shoppingLists.set(77, {
        id: 77,
        name: "Read-only source",
        items: new Map([
          [1, 1],
          [2, 2],
        ]),
      });
      currentBasket = {
        items: [
          { id: 90, name: "Existing basket item", quantity: 3, total: 30 },
        ],
        productsPrice: 30,
        deliveryPrice: 0,
        numberOfProducts: 3,
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
          sourceItems: [...(shoppingLists.get(77)?.items ?? [])],
          shoppingListCount: shoppingLists.size,
          shoppingListCreates,
          shoppingListUpdates,
          nativeListWrites,
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
          "save_basket_as_shopping_list",
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
  browserPage.on("pageerror", (error) =>
    console.error("browser page error", error),
  );
  browserPage.on("console", (message) => {
    if (message.type() === "error") {
      console.error("browser console error", message.text());
    }
  });
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
  await waitForResult("MCP adapter saved-list load flow");
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
  await browserPage.locator("#uncertain").click();
  await waitForResult("MCP adapter uncertain submission");
  await fetch(new URL("/reset", origin), { method: "POST" });
  await fetch(new URL("/uncertain-next", origin), { method: "POST" });
  const started = await client.callTool({
    name: "start_product_review",
    arguments: { items: [{ product_id: 7, quantity: 2 }] },
    _meta: { "openai/session": "review-ui-smoke-conversation" },
  });
  const review = (
    started.structuredContent as
      | {
          review?: {
            draftId: string;
            reviewContextId: string;
            shoppingListName?: string;
          };
        }
      | undefined
  )?.review;
  if (!review?.draftId || !review.reviewContextId) {
    throw new Error("Ambiguous submission smoke could not start a draft");
  }
  const submit = () =>
    client.callTool({
      name: "submit_product_review_conversation",
      arguments: {
        draft_id: review.draftId,
        review_context_id: review.reviewContextId,
        submission_id: "77777777-7777-4777-8777-777777777777",
        reviewed_list: {
          name: review.shoppingListName ?? "Smoke draft",
          items: [{ product_id: 7, quantity: 2 }],
        },
      },
      _meta: { "openai/session": "review-ui-smoke-conversation" },
    });
  if (!(await submit()).isError || !(await submit()).isError) {
    throw new Error("Ambiguous submission or its replay was not fenced");
  }
  const afterUncertain = (await fetch(new URL("/stats", origin)).then(
    (response) => response.json(),
  )) as { basketWrites: number; basketItems: Basket["items"] };
  if (
    afterUncertain.basketWrites !== 1 ||
    JSON.stringify(
      afterUncertain.basketItems.map(({ id, quantity }) => [id, quantity]),
    ) !==
      JSON.stringify([
        [90, 3],
        [7, 2],
      ])
  ) {
    throw new Error(
      `Ambiguous MCP submission replayed or lost basket rows: ${JSON.stringify(afterUncertain)}`,
    );
  }
  console.log(
    "MCP adapter ambiguous submit: one provider write, replay fenced",
  );
} finally {
  await browser.close();
  await client.close();
  await closeViewerSmokeServer(server);
  globalThis.fetch = originalFetch;
}
console.log(
  "MCP adapter browser smoke passed: read-only saved-list load, one bulk basket add, separate whole-basket save, basket preservation, alternatives, and uncertain no-replay in both UI and MCP.",
);
