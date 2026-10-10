import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { readProductViewerArtifact } from "../src/product-viewer.js";
import type { ProductReviewSnapshot } from "../src/product-review.js";
import { readLocalViewerGeneration } from "./viewer-generation.js";
import {
  closeViewerSmokeServer,
  installViewerAssetFixture,
} from "./viewer-asset-fixture.js";
import { VIEWER_MANIFEST_PATH } from "../src/viewer-assets.js";

declare global {
  interface Window {
    calls: Array<{
      name: string;
      args: {
        action?: {
          kind?: string;
          product_id?: number;
          replacement_id?: number;
          quantity?: number;
          query?: string;
        };
      };
    }>;
    messages: string[];
    hostErrors: string[];
    getViewId: () => string;
    providerWrites: number;
    failNext: boolean;
    failGenericNext: boolean;
    submissionAttempts: number;
    sendForeign: () => void;
    sendDuplicate: () => void;
    sendCancel: () => void;
    sendSubmitted: () => void;
    sendMalformed: () => void;
    sendEnded: () => void;
    sendUnavailable: () => void;
    sendUnavailableProduct: () => void;
    supersedeAndReload: () => void;
    reopenCurrentReview: () => void;
    getReview: () => ProductReviewSnapshot;
    setLegacyNeedsReview: () => void;
    setReadyForDisclosure: (ready: boolean, quantity?: number) => void;
    setAllReady: (ready: boolean) => void;
    replaceReviewIdentity: () => void;
  }
}

const html = readProductViewerArtifact().html;
const viewerGeneration = await readLocalViewerGeneration(
  fileURLToPath(new URL("../dist/ui-static/", import.meta.url)),
);
const screenshotDirectory = process.env.NEMLIG_UI_SCREENSHOT_DIR;
const longOatsName =
  "Synthetic oats with an intentionally long product name that must wrap safely";
const fixtureView = (id: number, name: string) => ({
  context: "review",
  status: "complete",
  product: {
    id,
    name,
    price: 12,
    unit_price: 24,
    unit: "kr/kg",
    unit_size: "500 g",
    currency: "DKK",
    brand: "Fixture",
    available: true,
    is_organic: true,
    is_frozen: false,
    is_on_discount: true,
    image_url: "https://example.invalid/image.png",
    description: "Synthetic detail.",
    declaration: "Synthetic declaration.",
    details: [{ key: "Origin", value: "Fixture" }],
    labels: [],
    tags: ["organic"],
  },
  review: { kind: "review", quantity: 1, approved: false },
});
const initialReview = {
  review_id: "synthetic-review",
  revision: 1,
  destination: "needs-review",
  items: [1, 2].map((id) => ({
    product_id: id,
    quantity: id,
    state: id === 2 ? "needs-review" : "ready",
    view: fixtureView(id, id === 1 ? "Synthetic milk" : longOatsName),
  })),
};
const fixtureJson = JSON.stringify(initialReview);
const parentDocument = `<!doctype html><meta charset="utf-8"><title>synthetic MCP host</title>
<iframe title="viewer" src="/resource" style="width:100%;height:900px;border:0"></iframe>
<script>
window.calls=[]; window.messages=[]; window.providerWrites=0; window.hostErrors=[]; let review=${fixtureJson}; let viewId='synthetic-view-1'; let initialViewIdOverride; window.submissionAttempts=0; window.failNext=false; window.failGenericNext=false;
const alternativeView=${JSON.stringify(fixtureView(3, "Synthetic alternative"))};
const frame=document.querySelector('iframe');
const post=(event,message)=>event.source.postMessage(message,location.origin);
const result=(review,presentedViewId=viewId)=>({structuredContent:{review,view_id:presentedViewId}});
const apply=(action)=>{
 if(action.kind==='show') return result(review);
 if(action.kind==='navigate') review.destination=action.destination;
 if(action.kind==='quantity') review.items.find(item=>item.product_id===action.product_id).quantity=action.quantity;
 if(action.kind==='accept') for(const item of review.items) if(action.product_ids.includes(item.product_id)) item.state='ready';
 if(action.kind==='revisit') for(const item of review.items) if(action.product_ids.includes(item.product_id)) item.state='needs-review';
 if(action.kind==='remove') review.items=review.items.filter(item=>!action.product_ids.includes(item.product_id));
 if(action.kind==='alternatives'){ review.destination='alternatives'; review.alternatives={product_id:action.product_id,query:action.query,views:[alternativeView]}; }
 if(action.kind==='replace'){ const target=review.items.find(item=>item.product_id===action.product_id); target.view=alternativeView; target.product_id=action.replacement_id; target.state='ready'; review.destination='ready'; review.alternatives=undefined; }
 if(action.kind==='prepare_submission') { const lines=review.items.map(item=>({product_id:item.product_id,quantity:item.quantity,name:item.view.product.name,item_price:item.view.product.price,line_total:item.quantity*item.view.product.price})); review.submission={status:'prepared',submission_id:'synthetic-submission',review:{lines,expected_products_price:lines.reduce((total,line)=>total+line.line_total,0)}}; }
 if(action.kind!=='prepare_submission' && action.kind!=='navigate' && action.kind!=='alternatives') delete review.submission;
 review.revision++; return result(review);
};
window.sendForeign=()=>{const foreign=JSON.parse(JSON.stringify(review));foreign.review_id='foreign-review';foreign.revision+=20;foreign.items=[{product_id:99,quantity:1,state:'needs-review',view:${JSON.stringify(fixtureView(99, "Foreign product"))}}];frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(foreign)},location.origin)};
window.sendDuplicate=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(JSON.parse(JSON.stringify(review)))},location.origin);
window.sendCancel=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-cancelled',params:{reason:'synthetic user cancellation'}},location.origin);
window.sendSubmitted=()=>{review.submission.status='submitted';frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(JSON.parse(JSON.stringify(review)))},location.origin)};
window.sendMalformed=()=>{const malformed=JSON.parse(JSON.stringify(review));malformed.submission.review.lines=[null];frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(malformed)},location.origin)};
window.sendEnded=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:{ended:true}}},location.origin);
window.sendUnavailable=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:{unavailable:true}}},location.origin);
window.sendUnavailableProduct=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:{views:[{context:'search',status:'unavailable',product_id:404}]}}},location.origin);
window.getViewId=()=>viewId; window.getReview=()=>JSON.parse(JSON.stringify(review)); window.setLegacyNeedsReview=()=>{review.items[1].state='needs-review';};
window.supersedeAndReload=()=>{initialViewIdOverride=viewId;viewId='synthetic-view-'+(Number(viewId.split('-').at(-1))+1);frame.src='/resource'};
window.setReadyForDisclosure=(ready,quantity)=>{const item=review.items.find(item=>item.product_id===2);item.state=ready?'ready':'needs-review';if(quantity!==undefined)item.quantity=quantity;review.revision++;frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(JSON.parse(JSON.stringify(review)))},location.origin)};
window.setAllReady=(ready)=>{for(const item of review.items)item.state=ready?'ready':'needs-review';review.revision++;frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(JSON.parse(JSON.stringify(review)))},location.origin)};
window.replaceReviewIdentity=()=>{review.review_id='second-synthetic-review';review.revision++;viewId='synthetic-view-2';frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(JSON.parse(JSON.stringify(review)))},location.origin)};
window.reopenCurrentReview=()=>{viewId='synthetic-view-'+(Number(viewId.split('-').at(-1))+1);frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(JSON.parse(JSON.stringify(review)))},location.origin)};
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow || event.origin!==location.origin) return;
 const message=event.data; if(!message || message.jsonrpc!=='2.0') return;
 if(message.method==='ui/initialize') return post(event,{jsonrpc:'2.0',id:message.id,result:{protocolVersion:message.params.protocolVersion,hostInfo:{name:'synthetic-host',version:'1'},hostCapabilities:{},hostContext:{theme:'light'}}});
 if(message.method==='ui/notifications/initialized'){const presented=result(review,initialViewIdOverride??viewId);initialViewIdOverride=undefined;return post(event,{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:presented})}
 if(message.method==='ui/message'){const text=message.params.content.map(block=>block.type==='text'?block.text:'').join('');window.messages.push(text);post(event,{jsonrpc:'2.0',id:message.id,result:{}});if(text.startsWith('Reopen the current Local basket')){viewId='synthetic-view-'+(Number(viewId.split('-').at(-1))+1);setTimeout(()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(review)},location.origin),0)}return}
 if(message.method==='tools/call'){
  const {name,arguments:args}=message.params; window.calls.push({name,args});
  if(name==='update_product_review'&&args.view_id&&args.view_id!==viewId)return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32602,message:'This Local basket card is out of date'}})
  if(name==='update_product_review'&&args.action?.kind==='show'){
   if(args.activate){viewId='synthetic-view-'+(Number(viewId.split('-').at(-1))+1);return post(event,{jsonrpc:'2.0',id:message.id,result:result(review)})}
   if(!args.view_id)return post(event,{jsonrpc:'2.0',id:message.id,result:{structuredContent:{review}}});
  }
  if(name==='submit_product_review'){
   window.submissionAttempts++;
   if(window.failNext){window.failNext=false;review.revision++;review.submission.status='uncertain';return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'Write outcome uncertain'}})}
   return post(event,{jsonrpc:'2.0',id:message.id,result:result({...review,submission:{...review.submission,status:'submitted'}})});
  }
  if(name==='update_product_review' && args.action?.kind==='quantity' && window.failNext){ window.failNext=false; return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32602,message:'Draft list revision is stale'}}); }
  if(name==='update_product_review' && window.failGenericNext){window.failGenericNext=false;return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'Temporary synthetic failure'}})}
  if(name==='update_product_review' && args.action?.kind==='show' && !args.view_id) viewId='synthetic-view-'+(Number(viewId.split('-').at(-1))+1);
  try { const response=name==='update_product_review'?apply(args.action):result(review); return post(event,{jsonrpc:'2.0',id:message.id,result:response}); }
  catch(error){window.hostErrors.push(String(error));return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32603,message:String(error)}})}
 }
});
</script>`;

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname === "/resource") {
    response
      .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end(html);
  } else if (pathname === "/host") {
    response
      .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end(parentDocument);
  } else {
    response.writeHead(404).end();
  }
});
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Could not start synthetic browser host.");
}
const browser = await chromium.launch({ headless: true, channel: "chrome" });
console.log("Synthetic viewer smoke: browser launched");
try {
  const verifyLoaderRecovery = async (
    path: string,
    override: { body?: string | Uint8Array; delayMs?: number },
    waitForLateResponse = false,
  ) => {
    const overrides = new Map([[path, override]]);
    const recoveryContext = await browser.newContext();
    await installViewerAssetFixture(
      recoveryContext,
      viewerGeneration,
      overrides,
    );
    const recoveryPage = await recoveryContext.newPage();
    let manifestRequests = 0;
    recoveryPage.on("request", (request) => {
      if (new URL(request.url()).pathname === VIEWER_MANIFEST_PATH) {
        manifestRequests += 1;
      }
    });
    await recoveryPage.goto(`http://127.0.0.1:${address.port}/host`);
    const recoveryFrame = recoveryPage.frameLocator('iframe[title="viewer"]');
    await recoveryFrame.locator("#load-error").waitFor({ state: "visible" });
    if (waitForLateResponse) {
      await recoveryPage.waitForTimeout(1_000);
      assert.equal(
        await recoveryFrame.locator("#root").innerText(),
        "",
        "a timed-out stale bundle mounted after its request completed",
      );
    }
    overrides.delete(path);
    overrides.set(VIEWER_MANIFEST_PATH, { delayMs: 100 });
    await recoveryFrame.getByRole("button", { name: "Try again" }).click();
    await recoveryFrame
      .locator("#retry")
      .evaluate((button: HTMLButtonElement) => button.click());
    await recoveryFrame
      .getByRole("heading", { name: "Local basket" })
      .waitFor();
    assert.equal(
      manifestRequests,
      2,
      "retry clicks started concurrent load attempts",
    );
    await recoveryContext.close();
  };
  await verifyLoaderRecovery(VIEWER_MANIFEST_PATH, { body: "{" });
  await verifyLoaderRecovery(viewerGeneration.manifest.js.url, {
    body: Buffer.from("corrupt JavaScript asset"),
  });
  await verifyLoaderRecovery(
    viewerGeneration.manifest.js.url,
    { delayMs: 5_500 },
    true,
  );
  console.log(
    "Synthetic viewer smoke: malformed, corrupt, and timed-out bundle recovery passed",
  );

  const context = await browser.newContext({
    viewport: { width: 375, height: 860 },
    colorScheme: "light",
  });
  const viewerOverrides = new Map();
  const externalRequests = await installViewerAssetFixture(
    context,
    viewerGeneration,
    viewerOverrides,
  );
  const page = await context.newPage();
  let manifestRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === VIEWER_MANIFEST_PATH) {
      manifestRequests += 1;
    }
  });
  const capture = async (name: string) => {
    if (!screenshotDirectory) {
      return;
    }
    await mkdir(screenshotDirectory, { recursive: true });
    const path = resolve(screenshotDirectory, `${name}.png`);
    await page.screenshot({ path });
    console.log(`Synthetic viewer mockup: ${path}`);
  };
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(10_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await page.goto(`http://127.0.0.1:${address.port}/host`, {
    waitUntil: "domcontentloaded",
  });
  console.log("Synthetic viewer smoke: host page loaded");
  const frame = page.frameLocator('iframe[title="viewer"]');
  await frame.getByRole("heading", { name: "Local basket" }).waitFor();
  assert.equal(
    await page.evaluate(() => window.calls.length),
    0,
    "mount revalidated the viewer",
  );
  assert.equal(
    await frame.locator("input[type=checkbox]").count(),
    0,
    "unified list rendered checkboxes",
  );
  assert.equal(
    await frame.getByRole("button", { name: /To decide|Ready \(/ }).count(),
    0,
    "unified list rendered destination tabs",
  );
  assert.equal(
    await frame.locator(".product-list article").count(),
    2,
    "not every fixture item was shown",
  );
  assert.equal(
    await frame.getByRole("button", { name: "Submit to Nemlig" }).isVisible(),
    true,
    "whole-list submit control is hidden",
  );
  assert.equal(
    await frame.getByRole("button", { name: "Clear", exact: true }).isVisible(),
    true,
    "Clear control is hidden",
  );
  const actionWidths = await frame
    .locator(".clear-local-basket")
    .evaluate((clear) => {
      const submit = document.querySelector<HTMLButtonElement>(
        '[data-viewer-component="action-footer"] button',
      );
      return {
        clear: clear.clientWidth,
        submit: submit?.clientWidth ?? 0,
        clearAfterFooter: Boolean(
          submit &&
          submit.compareDocumentPosition(clear) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      };
    });
  assert.ok(
    actionWidths.submit > 250 && actionWidths.clear === actionWidths.submit,
    "Submit and Clear are not full-width controls",
  );
  assert.equal(
    actionWidths.clearAfterFooter,
    true,
    "Clear is not below the submit control",
  );
  await capture("local-basket");

  const milkCard = frame
    .locator(".product-card")
    .filter({ hasText: "Synthetic milk" });
  const milkDisclosure = milkCard.locator(
    '[data-viewer-component="product-summary"]',
  );
  const idsBeforeStaleEdit = await page.evaluate(() =>
    window
      .getReview()
      .items.map((item: { product_id: number }) => item.product_id),
  );
  const callsBeforeStaleEdit = await page.evaluate(() => window.calls.length);
  await page.evaluate(() => window.supersedeAndReload());
  await frame.getByRole("heading", { name: "Local basket" }).waitFor();
  await milkDisclosure.click();
  await milkCard
    .getByRole("button", { name: "Remove from Local basket" })
    .click();
  await page.waitForFunction(
    (before) => window.calls.length >= before + 2,
    callsBeforeStaleEdit,
  );
  assert.deepEqual(
    await page.evaluate(
      (before) =>
        window.calls.slice(before).map((call) => call.args.action?.kind),
      callsBeforeStaleEdit,
    ),
    ["remove", "show"],
    "stale action was replayed or skipped read-only recovery",
  );
  assert.deepEqual(
    await page.evaluate(() =>
      window
        .getReview()
        .items.map((item: { product_id: number }) => item.product_id),
    ),
    idsBeforeStaleEdit,
    "stale removal changed the Local basket",
  );
  await page.evaluate(() => window.reopenCurrentReview());
  await frame.getByRole("heading", { name: "Local basket" }).waitFor();

  await page.evaluate(() => window.sendForeign());
  await frame.getByText("Synthetic milk").waitFor();
  assert.equal(
    await frame.getByText("Foreign product").count(),
    0,
    "foreign review displaced the active Local basket",
  );
  await page.evaluate(() => window.sendCancel());
  await frame
    .getByText(
      "Request cancelled. Continue in conversation to confirm the current Local basket before continuing.",
    )
    .waitFor();
  assert.equal(
    await frame.locator(".product-list").count(),
    0,
    "host cancellation left basket controls active",
  );
  await page.evaluate(() => window.reopenCurrentReview());
  await frame.getByRole("heading", { name: "Local basket" }).waitFor();

  await milkDisclosure.click();
  await page.evaluate(() => {
    window.failGenericNext = true;
  });
  await milkCard
    .getByRole("button", { name: "Increase quantity of Synthetic milk" })
    .click();
  await frame.getByText("We could not confirm this action").waitFor();
  await frame.getByText(/This Local basket card is inactive/u).waitFor();
  assert.equal(
    await milkCard
      .getByRole("button", { name: "Increase quantity of Synthetic milk" })
      .count(),
    0,
    "generic failure left editable stale controls active",
  );
  await page.evaluate(() => window.reopenCurrentReview());
  await frame.getByRole("heading", { name: "Local basket" }).waitFor();

  const callsBeforeSwipe = await page.evaluate(() => window.calls.length);
  const swipeRow = frame.locator(".basket-swipe-row").first();
  const box = await swipeRow.boundingBox();
  assert.ok(box, "product row has no hit area");
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await frame
    .getByRole("button", { name: /Remove Synthetic milk from Local basket/ })
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.calls.length),
    callsBeforeSwipe,
    "swipe release mutated the row",
  );
  await capture("local-basket-revealed");

  await swipeRow.press("Escape");
  await frame
    .getByRole("button", { name: /Remove Synthetic milk from Local basket/ })
    .waitFor({ state: "detached" });
  const shortSwipeBox = await swipeRow.boundingBox();
  assert.ok(
    shortSwipeBox,
    "product row has no hit area for the threshold check",
  );
  await page.mouse.move(
    shortSwipeBox.x + shortSwipeBox.width * 0.8,
    shortSwipeBox.y + shortSwipeBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    shortSwipeBox.x + shortSwipeBox.width * 0.45,
    shortSwipeBox.y + shortSwipeBox.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  assert.equal(
    await frame
      .getByRole("button", { name: /Remove Synthetic milk from Local basket/ })
      .count(),
    0,
    "sub-threshold swipe revealed an action",
  );
  await page.mouse.move(
    shortSwipeBox.x + shortSwipeBox.width * 0.15,
    shortSwipeBox.y + shortSwipeBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    shortSwipeBox.x + shortSwipeBox.width * 0.9,
    shortSwipeBox.y + shortSwipeBox.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await frame
    .getByRole("button", { name: /Find an alternative to Synthetic milk/ })
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.calls.length),
    callsBeforeSwipe,
    "right swipe release navigated to alternatives",
  );

  await swipeRow.press("Escape");
  await milkDisclosure.focus();
  await page.keyboard.press("Enter");
  await frame.getByRole("button", { name: /Find alternative/ }).waitFor();
  const milkAlt = milkCard.getByRole("button", { name: /Find alternative/ });
  await milkAlt.click();
  await frame.getByRole("heading", { name: "Find an alternative" }).waitFor();
  assert.equal(
    await page.evaluate(() =>
      window
        .getReview()
        .items.map((item: { product_id: number; quantity: number }) => [
          item.product_id,
          item.quantity,
        ])
        .map(String)
        .join(";"),
    ),
    "1,1;2,2",
    "opening alternatives changed the basket",
  );
  await capture("alternatives");
  const backCalls = await page.evaluate(() => window.calls.length);
  await frame.getByRole("button", { name: "Back to Local basket" }).click();
  await frame.getByRole("heading", { name: "Local basket" }).waitFor();
  assert.equal(
    await page.evaluate(() => window.calls.length),
    backCalls,
    "Back changed server state",
  );

  await frame.locator(".basket-swipe-row").first().press("Escape");
  await milkCard.locator('[data-viewer-component="product-summary"]').click();
  await milkCard
    .getByRole("button", { name: "Increase quantity of Synthetic milk" })
    .click();
  await frame.getByRole("heading", { name: "Local basket" }).waitFor();
  assert.equal(
    await page.evaluate(() => window.getReview().items[0]?.quantity),
    2,
    "ordinary snapshot reopened alternatives or lost quantity after Back",
  );
  await milkCard.getByRole("button", { name: /Find alternative/ }).click();
  await frame.getByRole("heading", { name: "Find an alternative" }).waitFor();
  const candidate = frame
    .locator(".alternative-options .product-card")
    .filter({ hasText: "Synthetic alternative" });
  await candidate
    .getByRole("button", {
      name: "Select Synthetic alternative as the alternative",
    })
    .click();
  await frame.getByRole("button", { name: "Use selected alternative" }).click();
  await frame.getByRole("heading", { name: "Local basket" }).waitFor();
  const replacement = await page.evaluate(() =>
    window
      .getReview()
      .items.find((item: { product_id: number }) => item.product_id === 3),
  );
  assert.ok(replacement, "replacement missing from Local basket");
  assert.equal(replacement.quantity, 2, "replacement lost quantity");
  assert.equal(replacement.state, "ready", "replacement did not remain Ready");
  assert.equal(
    await page.evaluate(() => window.getReview().items.length),
    2,
    "replacement dropped another row",
  );

  const oatsCard = frame
    .locator(".product-card")
    .filter({ hasText: longOatsName });
  const increase = oatsCard.getByRole("button", {
    name: `Increase quantity of ${longOatsName}`,
  });
  await increase.click();
  const callsBeforeSubmit = await page.evaluate(() => window.calls.length);
  await page.evaluate(() => window.setLegacyNeedsReview());
  await frame.getByRole("button", { name: "Submit to Nemlig" }).click();
  await frame
    .getByRole("heading", { name: "Ready to submit the Local basket" })
    .waitFor();
  const actions = await page.evaluate(
    (before) =>
      window.calls
        .slice(before)
        .map(
          (call: { args: { action?: { kind?: string } } }) =>
            call.args.action?.kind,
        ),
    callsBeforeSubmit,
  );
  assert.deepEqual(
    actions,
    ["quantity", "prepare_submission"],
    "quantity did not flush before preparation",
  );
  assert.equal(
    await frame
      .locator('[data-viewer-component="outcome-surface"] p')
      .filter({ hasText: "Synthetic alternative" })
      .count(),
    1,
    "replacement missing from exact recap",
  );
  const prepared = await page.evaluate(() => window.getReview());
  assert.ok(
    prepared.submission,
    "whole-list preparation did not produce a recap",
  );
  assert.equal(
    (prepared.submission.review.lines as unknown[]).length,
    2,
    "preparation omitted a Local basket row",
  );
  await capture("confirmation");
  await frame.getByRole("button", { name: "Add to Nemlig basket" }).click();
  await frame.getByRole("button", { name: "Cancel" }).click();
  assert.equal(
    await frame.getByRole("button", { name: "Add to Nemlig basket" }).count(),
    1,
    "cancel removed the exact recap",
  );
  await frame.getByRole("button", { name: "Add to Nemlig basket" }).click();
  const attemptsBeforeQuantityInvalidation = await page.evaluate(
    () => window.submissionAttempts,
  );
  await milkCard
    .getByRole("button", { name: "Increase quantity of Synthetic alternative" })
    .click();
  await frame.getByRole("button", { name: "Add to Nemlig" }).click();
  await frame
    .getByText("The prepared change changed while quantities were being saved.")
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.submissionAttempts),
    attemptsBeforeQuantityInvalidation,
    "quantity edit did not invalidate the prepared approval before submit",
  );
  await frame.getByRole("button", { name: "Submit to Nemlig" }).click();
  await frame
    .getByRole("heading", { name: "Ready to submit the Local basket" })
    .waitFor();

  const submitCalls = await page.evaluate(() => window.calls.length);
  await frame.getByRole("button", { name: "Add to Nemlig basket" }).click();
  await frame.getByRole("button", { name: "Add to Nemlig" }).click();
  await frame.getByText("Nemlig confirmed the addition").waitFor();
  const prepareCall = await page.evaluate(
    (before) =>
      window.calls
        .slice(before)
        .find(
          (call: { args: { action?: { kind?: string } } }) =>
            call.args.action?.kind === "prepare_submission",
        ),
    submitCalls,
  );
  assert.ok(prepareCall, "submission did not use exact preparation");

  const uncertainPage = await context.newPage();
  await uncertainPage.goto(`http://127.0.0.1:${address.port}/host`, {
    waitUntil: "domcontentloaded",
  });
  const uncertainFrame = uncertainPage.frameLocator('iframe[title="viewer"]');
  await uncertainFrame.getByRole("heading", { name: "Local basket" }).waitFor();
  await uncertainFrame
    .getByRole("button", { name: "Submit to Nemlig" })
    .click();
  await uncertainFrame
    .getByRole("heading", { name: "Ready to submit the Local basket" })
    .waitFor();
  await uncertainFrame
    .getByRole("button", { name: "Add to Nemlig basket" })
    .click();
  await uncertainPage.evaluate(() => {
    window.failNext = true;
  });
  await uncertainFrame.getByRole("button", { name: "Add to Nemlig" }).click();
  await uncertainFrame
    .getByRole("heading", { name: "We could not verify the addition" })
    .waitFor();
  assert.equal(
    await uncertainPage.evaluate(() => window.submissionAttempts),
    1,
    "uncertain write was retried",
  );
  await uncertainPage.evaluate(() => window.reopenCurrentReview());
  await uncertainFrame
    .getByRole("heading", { name: "We could not verify the addition" })
    .waitFor();
  assert.equal(
    await uncertainFrame
      .getByRole("button", { name: "Add to Nemlig basket" })
      .count(),
    0,
    "reopening an uncertain submission offered a retry",
  );
  await uncertainPage.close();

  assert.equal(
    await page.evaluate(() => window.providerWrites),
    0,
    "synthetic browser smoke reached provider write",
  );
  assert.deepEqual(
    externalRequests,
    [],
    "built UI requested a resource outside the synthetic host",
  );
  assert.deepEqual(errors, [], "React UI raised browser errors");
  assert.equal(
    await frame
      .locator("body")
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
    true,
    "viewer overflows 375px viewport",
  );
  await page.setViewportSize({ width: 320, height: 860 });
  assert.equal(
    await frame
      .locator("body")
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
    true,
    "viewer overflows 320px viewport",
  );
  await context.close();
} finally {
  await browser.close();
  await closeViewerSmokeServer(server);
}

console.log(
  "Built React viewer passed synthetic MCP browser smoke: one-list swipe reveal, explicit alternatives/back and replacement, quantity flush, whole-list exact preparation, cancellation, confirmation, zero provider writes, and no external requests.",
);
