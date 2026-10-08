import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { chromium } from "playwright";

declare global {
  interface Window {
    calls: Array<{ name: string; args: { action?: { kind?: string; product_id?: number; quantity?: number; query?: string } } }>;
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
    setReadyForDisclosure: (ready: boolean) => void;
    replaceReviewIdentity: () => void;
  }
}

const html = await readFile(new URL("../dist/picker.html", import.meta.url), "utf8");
const screenshotDirectory = process.env.NEMLIG_UI_SCREENSHOT_DIR;
const longOatsName = "Synthetic oats with an intentionally long product name that must wrap safely";
const fixtureView = (id: number, name: string) => ({
  context: "review", status: "complete", product: {
    id, name, price: 12, unit_price: 24, unit: "kr/kg", unit_size: "500 g", currency: "DKK",
    brand: "Fixture", available: true, is_organic: true, is_frozen: false, is_on_discount: true,
    image_url: "https://example.invalid/image.png", description: "Synthetic detail.", declaration: "Synthetic declaration.",
    details: [{ key: "Origin", value: "Fixture" }], labels: [], tags: ["organic"],
  }, review: { kind: "review", quantity: 1, approved: false },
});
const initialReview = {
  review_id: "synthetic-review", revision: 1, destination: "needs-review",
  items: [1, 2].map((id) => ({ product_id: id, quantity: id, state: "needs-review", view: fixtureView(id, id === 1 ? "Synthetic milk" : longOatsName) })),
};
const fixtureJson = JSON.stringify(initialReview);
const parentDocument = `<!doctype html><meta charset="utf-8"><title>synthetic MCP host</title>
<iframe title="viewer" src="/resource" style="width:100%;height:900px;border:0"></iframe>
<script>
window.calls=[]; window.providerWrites=0; window.hostErrors=[]; let review=${fixtureJson}; let viewId='synthetic-view-1'; let initialViewIdOverride; window.submissionAttempts=0; window.failNext=false; window.failGenericNext=false;
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
 if(action.kind==='replace'){ const target=review.items.find(item=>item.product_id===action.product_id); target.view=alternativeView; target.product_id=action.replacement_id; target.state='needs-review'; review.destination='needs-review'; review.alternatives=undefined; }
 if(action.kind==='prepare_submission') { const lines=review.items.filter(item=>item.state==='ready').map(item=>({product_id:item.product_id,quantity:item.quantity,name:item.view.product.name,item_price:item.view.product.price,line_total:item.quantity*item.view.product.price})); review.submission={status:'prepared',submission_id:'synthetic-submission',review:{lines,expected_products_price:lines.reduce((total,line)=>total+line.line_total,0)}}; }
 if(action.kind!=='prepare_submission' && action.kind!=='navigate' && action.kind!=='alternatives') delete review.submission;
 review.revision++; return result(review);
};
window.sendForeign=()=>{const foreign=JSON.parse(JSON.stringify(review));foreign.review_id='foreign-review';foreign.revision+=20;foreign.items=[{product_id:99,quantity:1,state:'needs-review',view:${JSON.stringify(fixtureView(99,"Foreign product"))}}];frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(foreign)},location.origin)};
window.sendDuplicate=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(JSON.parse(JSON.stringify(review)))},location.origin);
window.sendCancel=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-cancelled',params:{reason:'synthetic user cancellation'}},location.origin);
window.sendSubmitted=()=>{review.submission.status='submitted';frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(JSON.parse(JSON.stringify(review)))},location.origin)};
window.sendMalformed=()=>{const malformed=JSON.parse(JSON.stringify(review));malformed.submission.review.lines=[null];frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(malformed)},location.origin)};
window.sendEnded=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:{ended:true}}},location.origin);
window.sendUnavailable=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:{unavailable:true}}},location.origin);
window.sendUnavailableProduct=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:{views:[{context:'search',status:'unavailable',product_id:404}]}}},location.origin);
window.getViewId=()=>viewId;
window.supersedeAndReload=()=>{initialViewIdOverride=viewId;viewId='synthetic-view-'+(Number(viewId.split('-').at(-1))+1);frame.src='/resource'};
window.setReadyForDisclosure=(ready)=>{review.items.find(item=>item.product_id===2).state=ready?'ready':'needs-review';review.revision++;frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(JSON.parse(JSON.stringify(review)))},location.origin)};
window.replaceReviewIdentity=()=>{review.review_id='second-synthetic-review';review.revision++;viewId='synthetic-view-2';frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(JSON.parse(JSON.stringify(review)))},location.origin)};
window.reopenCurrentReview=()=>{viewId='synthetic-view-'+(Number(viewId.split('-').at(-1))+1);frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(JSON.parse(JSON.stringify(review)))},location.origin)};
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow || event.origin!==location.origin) return;
 const message=event.data; if(!message || message.jsonrpc!=='2.0') return;
 if(message.method==='ui/initialize') return post(event,{jsonrpc:'2.0',id:message.id,result:{protocolVersion:message.params.protocolVersion,hostInfo:{name:'synthetic-host',version:'1'},hostCapabilities:{},hostContext:{theme:'light'}}});
 if(message.method==='ui/notifications/initialized'){const presented=result(review,initialViewIdOverride??viewId);initialViewIdOverride=undefined;return post(event,{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:presented})}
 if(message.method==='tools/call'){
  const {name,arguments:args}=message.params; window.calls.push({name,args});
  if(name==='update_product_review'&&args.action?.kind==='show'){
   if(args.activate){viewId='synthetic-view-'+(Number(viewId.split('-').at(-1))+1);return post(event,{jsonrpc:'2.0',id:message.id,result:result(review)})}
   if(!args.view_id)return post(event,{jsonrpc:'2.0',id:message.id,result:{structuredContent:{review}}});
   if(args.view_id!==viewId)return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32602,message:'This Draft list card is out of date'}})
  }
  if(name==='submit_product_review'){
   window.submissionAttempts++;
   if(window.failNext){window.failNext=false;review.revision++;review.submission.status='uncertain';return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'Write outcome uncertain'}})}
   return post(event,{jsonrpc:'2.0',id:message.id,result:result({...review,submission:{...review.submission,status:'submitted'}})});
  }
  if(name==='update_product_review' && args.action?.kind==='accept' && window.failNext){ window.failNext=false; return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32602,message:'Draft list revision is stale'}}); }
  if(name==='update_product_review' && window.failGenericNext){window.failGenericNext=false;return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'Temporary synthetic failure'}})}
  if(name==='update_product_review' && args.action?.kind==='show' && !args.view_id) viewId='synthetic-view-'+(Number(viewId.split('-').at(-1))+1);
  try { const response=name==='update_product_review'?apply(args.action):result(review); return post(event,{jsonrpc:'2.0',id:message.id,result:response}); }
  catch(error){window.hostErrors.push(String(error));return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32603,message:String(error)}})}
 }
});
</script>`;

const server = createServer((request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(request.url === "/resource" ? html : parentDocument);
});
await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start synthetic browser host.");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
console.log("Synthetic viewer smoke: browser launched");
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 860 }, colorScheme: "light" });
  const externalRequests: string[] = [];
  await context.route("**/*", async (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:")) await route.continue();
    else { externalRequests.push(route.request().url()); await route.abort(); }
  });
  const page = await context.newPage();
  const capture = async (name: string) => {
    if (!screenshotDirectory) return;
    await mkdir(screenshotDirectory, { recursive: true });
    const path = resolve(screenshotDirectory, `${name}.png`);
    await page.screenshot({ path });
    console.log(`Synthetic viewer mockup: ${path}`);
  };
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(10_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${address.port}/host`, { waitUntil: "domcontentloaded" });
  console.log("Synthetic viewer smoke: host page loaded");
  const frame = page.frameLocator('iframe[title="viewer"]');
  await frame.getByRole("heading", { name: "To decide" }).waitFor().catch(async (error: unknown) => {
    const diagnostics = await page.evaluate(() => ({ calls: window.calls, hostErrors: window.hostErrors, iframeText: document.querySelector("iframe")?.contentDocument?.body.innerText }));
    throw new Error(`React resource did not initialize. Browser errors: ${JSON.stringify(errors)}. Host diagnostics: ${JSON.stringify(diagnostics)}`, { cause: error });
  });
  console.log("Synthetic viewer smoke: React resource initialized");
  await frame.getByRole("button", { name: /To decide \(2\)/ }).waitFor();
  await page.waitForFunction(() => window.calls.some((call) => call.args.action?.kind === "show"));
  assert.equal(await frame.locator('input[type="checkbox"]').count(), 2, "products were not visible on the first rendered card");
  console.log("Synthetic viewer smoke: direct product display and view validation passed");
  const callsBeforeInactiveRefresh = await page.evaluate(() => window.calls.length);
  const staleViewId = await page.evaluate(() => window.getViewId());
  await page.evaluate(() => window.supersedeAndReload());
  const currentViewId = await page.evaluate(() => window.getViewId());
  await frame.getByText("This Draft list card is inactive.").waitFor();
  await frame.getByText("The current Draft list is shown read-only.").waitFor();
  await frame.getByRole("button", { name: "Make this card current" }).waitFor();
  assert.equal(await frame.locator('input[type="checkbox"]').count(), 0, "automatically refreshed card exposed editable product controls");
  assert.equal(await frame.locator(".product-list article").count(), 2, "stale card did not automatically display the current products");
  assert.equal(await page.evaluate(() => window.calls.length), callsBeforeInactiveRefresh + 2, "stale card did not validate and then perform one read-only refresh");
  const automaticRefresh = await page.evaluate(() => window.calls.at(-1));
  assert.deepEqual(automaticRefresh?.args, { action: { kind: "show" } }, "automatic refresh sent stale authority or mutation arguments");
  assert.notEqual(currentViewId, staleViewId, "fixture did not make the rendered card stale");
  assert.equal(await page.evaluate(() => window.getViewId()), currentViewId, "automatic refresh stole current-card authority");
  await frame.getByRole("button", { name: "Make this card current" }).click();
  await frame.getByRole("button", { name: /To decide \(2\)/ }).waitFor();
  await frame.getByText("This Draft list card is inactive.").waitFor({ state: "detached" });
  const activation = await page.evaluate(() => window.calls.at(-1));
  assert.equal(await page.evaluate(() => window.calls.length), callsBeforeInactiveRefresh + 3, "explicit activation did not make exactly one additional view call");
  assert.equal(activation?.name, "update_product_review");
  assert.deepEqual(activation?.args, { action: { kind: "show" }, activate: true }, "activation sent stale review, revision, or mutation arguments");
  assert.notEqual(await page.evaluate(() => window.getViewId()), currentViewId, "explicit activation did not rotate the active view token");
  assert.equal(await frame.locator('input[type="checkbox"]').count(), 2, "refresh did not show the current products in the same card");
  console.log("Synthetic viewer smoke: stale card auto-refreshes read-only; explicit activation alone acquires authority");
  await frame.getByRole("button", { name: /To decide \(2\)/ }).waitFor();
  assert.equal(await frame.getByText("Synthetic milk").count(), 1);
  assert.equal(await frame.getByText("Organic").count(), 2, "organic badge missing");
  assert.equal(await frame.getByText("Offer").count(), 2, "offer badge missing");
  const statusChip = frame.locator(".product-status-chip").first();
  assert.equal(await frame.locator(".product-status-chip").count(), 4, "product status facts were not rendered as viewer-local chips");
  const chipLayout = await statusChip.evaluate((chip) => ({
    chipWidth: chip.getBoundingClientRect().width,
    containerWidth: chip.parentElement?.getBoundingClientRect().width ?? 0,
  }));
  assert.ok(chipLayout.chipWidth < chipLayout.containerWidth, `product status facts expanded into full-width controls: ${JSON.stringify(chipLayout)}`);
  const tabs = frame.locator(".destination-tabs-segments");
  assert.equal(await tabs.getAttribute("data-viewer-control"), "segmented-tabs", "destination navigation did not use the viewer-local segmented control");
  await capture("to-decide");
  const milkCard = frame.locator(".product-card").filter({ hasText: "Synthetic milk" });
  const milkDisclosure = milkCard.locator(".product-summary");
  const milkCheckbox = milkCard.getByRole("checkbox", { name: "Select Synthetic milk" });
  assert.equal(await milkCard.getByRole("button", { name: "Increase quantity of Synthetic milk" }).count(), 0, "a collapsed To decide row exposed quantity controls");
  assert.equal(await milkCard.getByRole("button", { name: "Choose alternative" }).count(), 0, "a collapsed To decide row exposed alternative controls");
  assert.equal(await milkCard.locator(".product-image-fallback").count(), 1, "a rejected image URL did not render the safe image fallback");
  await milkCheckbox.check();
  assert.equal(await milkDisclosure.getAttribute("aria-expanded"), "false", "checking a product row expanded it");
  await milkCheckbox.uncheck();
  const callsBeforeDisclosure = await page.evaluate(() => window.calls.length);
  const summaryLayout = await milkDisclosure.evaluate((button) => {
    const content = button.querySelector(":scope > span");
    return { button: button.getBoundingClientRect().width, content: content?.getBoundingClientRect().width ?? 0 };
  });
  assert.ok(summaryLayout.content >= summaryLayout.button - 16, `product summary content is narrower than its button beyond the expected inner padding: ${JSON.stringify(summaryLayout)}`);
  await milkDisclosure.focus();
  await page.keyboard.press("Enter");
  assert.equal(await milkDisclosure.getAttribute("aria-expanded"), "true", "product disclosure did not open");
  assert.equal(await milkCard.getByRole("button", { name: "Increase quantity of Synthetic milk" }).count(), 1, "an expanded To decide row did not expose quantity controls");
  assert.equal(await milkCard.getByRole("button", { name: "Choose alternative" }).count(), 1, "an expanded To decide row did not expose alternative controls");
  const milkFact = milkCard.locator(".product-fact").first();
  await milkFact.locator("summary").click();
  assert.equal(await milkFact.evaluate((node: HTMLDetailsElement) => node.open), true, "nested product fact did not open");
  assert.equal(await page.evaluate(() => window.calls.length), callsBeforeDisclosure, "product disclosure performed a tool call");
  await capture("product-expanded");
  await page.evaluate(() => window.setReadyForDisclosure(true));
  await frame.getByRole("button", { name: /Ready \(1\)/ }).click();
  await frame.getByRole("heading", { name: "Ready" }).waitFor();
  const readyOatsCard = frame.locator(".product-card").filter({ hasText: longOatsName });
  assert.equal(await readyOatsCard.getByRole("button", { name: `Increase quantity of ${longOatsName}` }).count(), 1, "a collapsed Ready row did not keep direct quantity controls");
  await capture("ready");
  await frame.getByRole("button", { name: /To decide \(1\)/ }).click();
  await frame.getByRole("heading", { name: "To decide" }).waitFor();
  assert.equal(await milkDisclosure.getAttribute("aria-expanded"), "true", "review navigation lost the open product disclosure");
  assert.equal(await milkFact.evaluate((node: HTMLDetailsElement) => node.open), true, "review navigation lost the open nested fact disclosure");
  await page.evaluate(() => window.setReadyForDisclosure(false));
  await frame.getByRole("button", { name: /To decide \(2\)/ }).waitFor();
  await page.evaluate(() => window.sendCancel());
  await page.evaluate(() => window.replaceReviewIdentity());
  await frame.getByRole("button", { name: /To decide \(2\)/ }).waitFor();
  assert.equal(await milkDisclosure.getAttribute("aria-expanded"), "false", "a different review inherited the previous card disclosure state");
  assert.equal(await milkFact.evaluate((node: HTMLDetailsElement) => node.open), false, "a different review inherited the previous nested fact state");
  await milkDisclosure.click();
  await milkCard.getByRole("button", { name: "Choose alternative" }).click();
  await frame.getByRole("heading", { name: "Current product" }).waitFor();
  await capture("alternatives");
  const alternativesQuery = frame.getByRole("searchbox", { name: "Search for more products" });
  assert.equal(await alternativesQuery.inputValue(), "Synthetic milk", "the current product search query was not shown");
  await alternativesQuery.fill("custom milk query");
  const beforeAlternativeSearch = await page.evaluate(() => window.calls.length);
  await frame.getByRole("button", { name: "Search products" }).click();
  await page.waitForFunction((before) => window.calls.slice(before).some((call) => call.args.action?.kind === "alternatives" && call.args.action.query === "custom milk query"), beforeAlternativeSearch);
  await alternativesQuery.fill("");
  assert.equal(await alternativesQuery.inputValue(), "", "clearing the alternatives query restored stale server text");
  const alternativeCallsBeforeEmptySearch = await page.evaluate(() => window.calls.filter((call) => call.args.action?.kind === "alternatives").length);
  await frame.getByRole("button", { name: "Search products" }).click();
  assert.equal(await page.evaluate(() => window.calls.filter((call) => call.args.action?.kind === "alternatives").length), alternativeCallsBeforeEmptySearch, "an empty alternatives query sent a stale search");
  await frame.getByRole("button", { name: /To decide \(2\)/ }).click();
  const oatsCard = frame.locator(".product-card").filter({ hasText: longOatsName });
  await oatsCard.locator(".product-summary").click();
  await oatsCard.getByRole("button", { name: "Choose alternative" }).click();
  await frame.getByRole("heading", { name: "Current product" }).waitFor();
  assert.equal(await frame.getByRole("searchbox", { name: "Search for more products" }).inputValue(), longOatsName, "an earlier product's query leaked into the new alternative target");
  await frame.getByRole("button", { name: /To decide \(2\)/ }).click();
  await frame.getByRole("heading", { name: "To decide" }).waitFor();
  await frame.getByRole("button", { name: "Select all" }).click();
  assert.equal(await frame.locator('input[type="checkbox"]:checked').count(), 2, "Select all omitted a usable row");
  await frame.getByRole("checkbox", { name: "Select Synthetic milk" }).uncheck();
  assert.equal(await frame.locator('input[type="checkbox"]:checked').count(), 1, "unchecking one row changed another row's selection");
  await frame.getByRole("checkbox", { name: "Select Synthetic milk" }).check();
  await page.evaluate(() => window.sendDuplicate());
  assert.equal(await frame.getByRole("checkbox", { name: "Select Synthetic milk" }).isChecked(), true, "same-revision notification reset an ephemeral selection");
  await frame.getByRole("checkbox", { name: "Select Synthetic milk" }).uncheck();
  await page.evaluate(() => window.sendForeign());
  await frame.getByText("Synthetic milk").waitFor();
  assert.equal(await frame.getByText("Foreign product").count(), 0, "foreign review displaced the active Draft list");
  const callsBeforeRemount = await page.evaluate(() => window.calls.length);
  await page.locator('iframe[title="viewer"]').evaluate((element: HTMLIFrameElement) => element.contentWindow?.location.reload());
  await frame.getByRole("button", { name: /To decide \(2\)/ }).waitFor();
  await page.waitForFunction((before) => window.calls.slice(before).some((call) => call.args.action?.kind === "show"), callsBeforeRemount);
  assert.equal(await page.evaluate((before) => window.calls.slice(before).filter((call) => call.args.action?.kind === "show").length, callsBeforeRemount), 1, "remount did not validate the current view exactly once");
  await page.evaluate(() => { window.failNext = true; });
  await frame.getByRole("checkbox", { name: "Select Synthetic milk" }).check();
  const callsBeforeConflict = await page.evaluate(() => window.calls.length);
  await frame.getByRole("button", { name: "Add selected to Ready (1)" }).click();
  await frame.getByText("Your last action was not applied").waitFor();
  const conflictCalls = await page.evaluate((before) => window.calls.slice(before), callsBeforeConflict);
  assert.deepEqual(conflictCalls.map((call) => call.args.action?.kind), ["accept", "show"], "stale recovery replayed an edit or skipped its read-only refresh");
  assert.equal(await frame.locator('input[type="checkbox"]:checked').count(), 0, "stale selection survived recovery");
  await frame.getByRole("checkbox", { name: "Select Synthetic milk" }).check();
  await page.evaluate(() => { window.failGenericNext = true; });
  await frame.getByRole("button", { name: "Add selected to Ready (1)" }).click();
  await frame.getByText("We could not confirm this action").first().waitFor();
  assert.equal(await frame.locator('input[type="checkbox"]').count(), 0, "non-stale failure left stale review controls active");
  await page.evaluate(() => window.reopenCurrentReview());
  await frame.getByRole("checkbox", { name: "Select Synthetic milk" }).waitFor();
  await frame.getByRole("checkbox", { name: "Select Synthetic milk" }).check();
  await frame.getByRole("button", { name: "Add selected to Ready (1)" }).click();
  await frame.getByRole("button", { name: /Ready \(1\)/ }).waitFor();
  await page.evaluate(() => window.sendCancel());
  await frame.getByText(
    "Request cancelled. Continue in conversation to confirm the current Draft list before continuing.",
  ).waitFor();
  assert.equal(await frame.locator('input[type="checkbox"]').count(), 0, "cancellation left active review controls");
  await page.evaluate(() => window.sendDuplicate());
  assert.equal(await frame.locator('input[type="checkbox"]').count(), 0, "unsolicited snapshot reactivated a cancelled view");
  await page.evaluate(() => window.reopenCurrentReview());
  await frame.getByRole("button", { name: /To decide \(1\)/ }).waitFor();
  await frame.getByRole("button", { name: /To decide \(1\)/ }).click();
  await frame.locator(".product-card").locator(".product-summary").first().click();
  await frame.getByRole("button", { name: "Choose alternative" }).click();
  await frame.getByRole("heading", { name: "Current product" }).waitFor().catch(async (error: unknown) => {
    const state = await frame.locator("main").innerText();
    const diagnostics = await page.evaluate(() => ({ calls: window.calls, hostErrors: window.hostErrors, frames: [...document.querySelector('iframe')!.contentDocument!.querySelectorAll('main')].map((node) => node.innerText) }));
    throw new Error(`Alternative screen failed. Calls: ${JSON.stringify(diagnostics)}. UI: ${state}`, { cause: error });
  });
  await frame.getByRole("radio", { name: "Choose Synthetic alternative" }).click();
  await frame.getByRole("button", { name: "Use selected alternative" }).click();
  await frame.getByRole("button", { name: /To decide \(1\)/ }).waitFor();
  await frame.getByRole("checkbox", { name: "Select Synthetic alternative" }).check().catch(async (error: unknown) => {
    const state = await frame.locator("main").innerText();
    const diagnostics = await page.evaluate(() => ({ calls: window.calls, hostErrors: window.hostErrors }));
    throw new Error(`Oats selection failed. Calls: ${JSON.stringify(diagnostics)}. UI: ${state}`, { cause: error });
  });
  await frame.getByRole("button", { name: "Add selected to Ready (1)" }).click();
  await frame.getByRole("button", { name: /Ready \(2\)/ }).waitFor();
  await frame.getByRole("button", { name: /Ready \(2\)/ }).click();
  await frame.getByRole("button", { name: "Increase quantity of Synthetic milk" }).click();
  await frame.getByRole("button", { name: "Increase quantity of Synthetic alternative" }).click();
  const beforePrepare = await page.evaluate(() => window.calls.length);
  await frame.getByRole("button", { name: "Prepare exact change" }).click();
  await page.waitForFunction((before) => window.calls.slice(before).some((call) => call.args.action?.kind === "prepare_submission"), beforePrepare);
  const prepareCalls = await page.evaluate((before) => window.calls.slice(before).map((call) => call.args.action), beforePrepare);
  assert.deepEqual(prepareCalls, [
    { kind: "quantity", product_id: 1, quantity: 2 },
    { kind: "quantity", product_id: 3, quantity: 3 },
    { kind: "prepare_submission" },
  ], "both quantities were not serialized before prepare inside one debounce window");
  await frame.getByRole("heading", { name: "Confirm the exact Nemlig change" }).waitFor();
  await frame.getByText("2 × Synthetic milk").waitFor();
  await frame.getByText("3 × Synthetic alternative").waitFor();
  await capture("confirmation");
  await frame.getByRole("button", { name: "Review exact change" }).click();
  await frame.getByRole("button", { name: "Cancel" }).click();
  assert.equal(await page.evaluate(() => window.submissionAttempts), 0, "opening and cancelling exact confirmation submitted a review");
  await frame.getByRole("button", { name: "Review exact change" }).click();
  const attemptsBeforeStaleConfirmation = await page.evaluate(() => window.submissionAttempts);
  await frame.getByRole("button", { name: "Increase quantity of Synthetic milk" }).click();
  await frame.getByRole("button", { name: "Add to Nemlig" }).evaluate((button: HTMLButtonElement) => button.click());
  await frame.getByText("The prepared change changed while quantities were being saved.").waitFor();
  assert.equal(await page.evaluate(() => window.submissionAttempts), attemptsBeforeStaleConfirmation, "stale prepared review was submitted after quantity flush");
  await frame.getByRole("button", { name: "Prepare exact change" }).waitFor();
  await frame.getByRole("button", { name: "Prepare exact change" }).click();
  await frame.getByRole("button", { name: "Review exact change" }).click();
  await page.evaluate(() => { window.failNext = true; });
  await frame.getByRole("button", { name: "Add to Nemlig" }).click();
  await frame.getByText("Submission outcome is uncertain").waitFor();
  assert.equal(await page.evaluate(() => window.submissionAttempts), 1, "explicit submission was not attempted exactly once");
  assert.equal(await frame.locator('input[type="checkbox"]').count(), 0, "uncertain submission left review editing active");
  await page.evaluate(() => window.reopenCurrentReview());
  await frame.getByText("Submission outcome is uncertain").waitFor();
  assert.equal(await frame.getByRole("button", { name: "Prepare exact change" }).count(), 0, "uncertain submission offered a retry");
  const callsBeforeVerifiedCompletion = await page.evaluate(() => window.calls.length);
  await page.evaluate(() => window.sendSubmitted());
  await frame.getByText("Nemlig confirmed this Draft list was added successfully.").waitFor();
  await capture("success");
  assert.equal(await page.evaluate((before) => window.calls.slice(before).filter((call) => call.name === "submit_product_review").length, callsBeforeVerifiedCompletion), 0, "verified completion replayed submission");
  await page.evaluate(() => window.sendMalformed());
  await frame.getByRole("alert").waitFor();
  assert.equal(await frame.locator('input[type="checkbox"]').count(), 0, "malformed nested submission left actions active");
  await page.evaluate(() => window.reopenCurrentReview());
  await frame.getByRole("button", { name: /Ready \(2\)/ }).waitFor();
  await frame.getByRole("button", { name: "Continue with Draft list" }).click();
  await frame.getByRole("button", { name: "Increase quantity of Synthetic milk" }).click();
  await frame.getByText("4 ×").waitFor();
  await frame.getByRole("button", { name: "Prepare exact change" }).waitFor();
  assert.equal(await page.evaluate(() => window.submissionAttempts), 1, "continuing a submitted Draft list retried the old submission");
  await page.evaluate(() => window.sendEnded());
  await frame.getByText("Your local Draft list was discarded.").waitFor();
  await capture("empty");
  assert.equal(await frame.locator('input[type="checkbox"]').count(), 0, "authoritative ended notification left active controls");
  await page.evaluate(() => window.sendUnavailable());
  await frame.getByRole("heading", { name: "Start a new Draft list" }).waitFor();
  await frame.getByText("This temporary Draft list is no longer available. Ask in chat before starting a new Draft list. Previous choices or submission approval are not restored.").waitFor();
  await capture("unavailable");
  assert.equal(await frame.getByRole("button", { name: "Prepare exact change" }).count(), 0, "unavailable notification restored the discarded review actions");
  assert.equal(await frame.locator('input[type="checkbox"]').count(), 0, "unavailable notification restored discarded review controls");
  await page.evaluate(() => window.sendUnavailableProduct());
  await frame.getByText("Product 404 details unavailable.").waitFor();
  assert.equal(await frame.locator('input[type="checkbox"]').count(), 0, "an unavailable product rendered selectable review controls");
  assert.equal(await page.evaluate(() => window.providerWrites), 0, "synthetic browser smoke reached a provider write");
  assert.deepEqual(externalRequests, [], "built UI requested a network resource outside the synthetic host");
  assert.deepEqual(errors, [], "React UI raised browser errors");
  assert.equal(await frame.locator("body").evaluate((node) => node.scrollWidth <= node.clientWidth), true, "viewer overflows the 375px content viewport");
  await page.setViewportSize({ width: 320, height: 860 });
  assert.equal(await frame.locator("body").evaluate((node) => node.scrollWidth <= node.clientWidth), true, "viewer overflows the 320px content viewport");
  await context.close();
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

console.log("Built React viewer passed synthetic MCP browser smoke: inert activation, local decisions, alternatives, quantity flush, separate confirmation, one synthetic submit, zero provider writes, and no external requests.");
