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
 const run=document.getElementById('run'); run.disabled=true;
 const doc=()=>frame.contentDocument, title=()=>doc()?.querySelector('#title')?.textContent;
 const text=()=>doc()?.querySelector('main')?.textContent||'';
 const buttons=()=>[...doc().querySelectorAll('button')], button=label=>buttons().find(b=>b.textContent.trim()===label);
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const wait=async predicate=>{const until=Date.now()+15000;while(!predicate()){if(Date.now()>until)throw new Error('Timed out: '+(doc()?.querySelector('main')?.innerText||'no viewer main'));await new Promise(r=>setTimeout(r,25));}};
 const click=label=>{const b=button(label);check(b&&!b.disabled,'Missing enabled control: '+label);b.click();};
 try {
  await fetch('/reset',{method:'POST'}); widgetCalls.length=0; transcript=undefined; initialized=false;
  const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true})); frame.src='/viewer'; await loaded; await wait(()=>initialized);
  transcript=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}]}}); publish();
  await wait(()=>title()==='Local basket'&&doc().querySelectorAll('.product-list article').length===2);
  check(doc().querySelectorAll('input[type=checkbox]').length===0,'Unified list rendered checkbox selection');
  check(!buttons().some(b=>b.textContent.includes('To decide')||b.textContent.includes('Ready (')),'Unified list rendered destination tabs');
  check(transcript.structuredContent.review.items.every(item=>item.state==='ready'),'Fresh basket rows are not all Ready');
  const beforeReload=widgetCalls.length; const reloaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true})); frame.contentWindow.location.reload(); await reloaded;
  await wait(()=>title()==='Local basket'&&doc().querySelectorAll('.product-list article').length===2);
  check(widgetCalls.length===beforeReload,'Reload made an unnecessary service call');
  const disclosure=doc().querySelector('.product-list article button[aria-expanded]'); check(disclosure,'Product disclosure missing'); disclosure.click();
  await wait(()=>doc().querySelector('.product-list article [data-viewer-component="quantity-control"] button:last-of-type'));
  const quantity=doc().querySelector('.product-list article [data-viewer-component="quantity-control"] button:last-of-type'); check(quantity,'Quantity controls missing'); quantity.click();
  await wait(()=>widgetCalls.some(c=>c.arguments.action?.kind==='quantity'));
  await wait(()=>button('Submit to Nemlig')&&!button('Submit to Nemlig').disabled);
  click('Submit to Nemlig'); await wait(()=>doc().querySelector('[data-viewer-component="outcome-surface"] h2')?.textContent==='Ready to submit the Local basket');
  const prepared=await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}});
  const review=prepared.structuredContent.review;
  check(review.submission?.status==='prepared'&&review.submission.review.lines.length===2,'Preparation did not include every local row');
  check(widgetCalls.at(-1).arguments.action.kind==='prepare_submission','Submit did not prepare an exact review');
  check(button('Add to Nemlig basket')&&!button('Add to Nemlig'),'Prepared review skipped explicit confirmation');
  const stats=await fetch('/stats').then(r=>r.json()); check(stats.basketReads===1&&stats.basketWrites===0,'Prepare crossed an unsafe provider boundary');
  check(widgetCalls.every(c=>!('representation' in c.arguments)),'Viewer sent a representation selector');
  status.textContent='PASS: one Ready list, no tabs or checkboxes, quantity flush, all-row exact prepare, confirmation retained, one fake basket read, zero writes';
 } catch(error) {status.textContent='FAIL: '+error.message+' | viewer: '+(doc()?.body?.innerText||'no iframe document')+' | widget calls: '+JSON.stringify(widgetCalls);} finally {run.disabled=false;}
};
document.getElementById('flow').onclick = async () => {
 const run=document.getElementById('flow'); run.disabled=true;
 const doc=()=>frame.contentDocument, title=()=>doc()?.querySelector('#title')?.textContent;
 const text=()=>doc()?.querySelector('main')?.textContent||'';
 const buttons=()=>[...doc().querySelectorAll('button')], button=label=>buttons().find(b=>b.textContent.trim()===label);
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const wait=async predicate=>{const until=Date.now()+15000;while(!predicate()){if(Date.now()>until)throw new Error('Timed out: '+(doc()?.querySelector('main')?.innerText||'no viewer main'));await new Promise(r=>setTimeout(r,25));}};
 const click=label=>{const b=button(label);check(b&&!b.disabled,'Missing enabled control: '+label);b.click();};
 try {
  status.textContent='Checking fail-closed whole-list preparation'; widgetCalls.length=0;
  await fetch('/reset',{method:'POST'}); await fetch('/unknown-price',{method:'POST'});
  transcript=await call({name:'start_product_review',arguments:{items:[{product_id:1,quantity:1},{product_id:2,quantity:2}]}});
  initialized=false; frame.src='/viewer'; await wait(()=>initialized);
  await wait(()=>title()==='Local basket'&&doc().querySelectorAll('.product-list article').length===2);
  await wait(()=>button('Submit to Nemlig')&&!button('Submit to Nemlig').disabled);
  click('Submit to Nemlig'); await wait(()=>widgetResults.at(-1)?.name==='update_product_review'&&widgetResults.at(-1)?.isError);
  check(widgetResults.at(-1)?.text.includes('incomplete'),'Incomplete exact product failure was not reported');
  check(!widgetCalls.some(c=>c.arguments.action?.kind==='submit_submission'),'Unavailable/incomplete basket row was submitted');
  check((await fetch('/stats').then(r=>r.json())).basketWrites===0,'Unavailable row reached a provider write');
  await fetch('/reset',{method:'POST'}); await fetch('/unknown-price',{method:'POST'});
  status.textContent='Checking uncertain submission block';
  transcript=await call({name:'start_product_review',arguments:{items:[{product_id:2,quantity:1}]}});
  initialized=false; frame.src='/viewer'; await wait(()=>initialized);
  await wait(()=>title()==='Local basket'&&doc().querySelectorAll('.product-list article').length===1);
  await wait(()=>button('Submit to Nemlig')&&!button('Submit to Nemlig').disabled);
  click('Submit to Nemlig'); await wait(()=>button('Add to Nemlig basket'));
  click('Add to Nemlig basket'); await wait(()=>button('Add to Nemlig'));
  await fetch('/uncertain-next',{method:'POST'}); click('Add to Nemlig'); await wait(()=>text().includes('We could not verify the addition'));
  check(!button('Submit to Nemlig')&&!button('Add to Nemlig'),'Uncertain outcome allowed a retry');
  check((await fetch('/stats').then(r=>r.json())).basketWrites===0,'Synthetic uncertain path wrote the provider basket');
  status.textContent='PASS: incomplete lines block prepare, uncertain result blocks replay, provider basket writes 0';
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
  await wait(()=>title()==='Local basket'&&doc().querySelectorAll('.product-list article').length===2);
  const before=await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}});
  const target=[...doc().querySelectorAll('.product-list article')].find(row=>row.textContent.includes('Smoke product 1')); check(target,'Product missing');
  target.querySelector('button[aria-expanded]')?.click(); await wait(()=>button('Find alternative'));
  const beforeSwipe=widgetCalls.length; click('Find alternative'); await wait(()=>title()==='Find an alternative');
  check(widgetCalls.length===beforeSwipe+1&&widgetCalls.at(-1).arguments.action.kind==='alternatives','Alternative view did not use the read-only search action');
  const unchanged=(await call({name:'update_product_review_conversation',arguments:{action:{kind:'show'}}})).structuredContent.review;
  check(JSON.stringify(unchanged.items.map(i=>[i.product_id,i.quantity,i.state]))===JSON.stringify(before.structuredContent.review.items.map(i=>[i.product_id,i.quantity,i.state])),'Opening alternatives changed the Local basket');
  const query=doc().querySelector('#alternative-query'); check(query,'Alternative search missing');
  Object.getOwnPropertyDescriptor(doc().defaultView.HTMLInputElement.prototype,'value').set.call(query,'unavailable');
  query.dispatchEvent(new Event('input',{bubbles:true})); query.form.requestSubmit();
  await wait(()=>doc().querySelector('.alternative-options')?.textContent.includes('Smoke product 4'));
  const back=button('Back to Local basket'); check(back,'Back control missing'); back.click(); await wait(()=>title()==='Local basket');
  check((await fetch('/stats').then(r=>r.json())).basketWrites===0,'Alternative navigation wrote to Nemlig');
  status.textContent='PASS: alternative search/back leaves basket unchanged; provider basket writes 0';
 } catch(error){status.textContent='FAIL: '+error.message+' | screen: '+(title()||'unavailable')+' | widget calls: '+JSON.stringify(widgetCalls);} finally{run.disabled=false;}
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
