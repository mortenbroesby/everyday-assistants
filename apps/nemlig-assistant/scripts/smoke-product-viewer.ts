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
    providerWrites: number;
    failNext: boolean;
    failGenericNext: boolean;
    submissionAttempts: number;
    sendPassive: () => void;
    getReview: () => ProductReviewSnapshot;
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
  destination: "ready",
  items: [1, 2].map((id) => ({
    product_id: id,
    quantity: id,
    state: "ready",
    view: fixtureView(id, id === 1 ? "Synthetic milk" : longOatsName),
  })),
};
const fixtureJson = JSON.stringify(initialReview);
const longFixtureJson = JSON.stringify({
  ...initialReview,
  items: Array.from({ length: 12 }, (_, index) => {
    const id = index + 1;
    return {
      product_id: id,
      quantity: 1,
      state: "ready",
      view: fixtureView(id, `Synthetic product ${id}`),
    };
  }),
});
const parentDocument = (
  reviewJson: string,
) => `<!doctype html><meta charset="utf-8"><title>synthetic MCP host</title>
<iframe title="viewer" src="/resource" style="width:100%;height:900px;border:0"></iframe>
<script>
window.calls=[]; window.messages=[]; window.providerWrites=0; window.hostErrors=[]; let review=${reviewJson}; window.submissionAttempts=0; window.failNext=false; window.failGenericNext=false;
const alternativeView=${JSON.stringify(fixtureView(3, "Synthetic alternative"))};
const frame=document.querySelector('iframe');
const post=(event,message)=>event.source.postMessage(message,location.origin);
const result=(review)=>({structuredContent:{review}});
const apply=(action)=>{
 if(action.kind==='show') return result(review);
 if(action.kind==='navigate') review.destination=action.destination;
 if(action.kind==='quantity') review.items.find(item=>item.product_id===action.product_id).quantity=action.quantity;
 if(action.kind==='remove') review.items=review.items.filter(item=>!action.product_ids.includes(item.product_id));
 if(action.kind==='alternatives'){ review.destination='alternatives'; review.alternatives={product_id:action.product_id,query:action.query,views:[alternativeView]}; }
 if(action.kind==='replace'){ const target=review.items.find(item=>item.product_id===action.product_id); target.view=alternativeView; target.product_id=action.replacement_id; target.state='ready'; review.destination='ready'; review.alternatives=undefined; }
 if(action.kind==='prepare_submission') { const lines=review.items.map(item=>({product_id:item.product_id,quantity:item.quantity,name:item.view.product.name,item_price:item.view.product.price,line_total:item.quantity*item.view.product.price})); review.submission={status:'prepared',submission_id:'synthetic-submission',review:{lines,expected_products_price:lines.reduce((total,line)=>total+line.line_total,0)}}; }
 if(action.kind!=='prepare_submission' && action.kind!=='navigate' && action.kind!=='alternatives') delete review.submission;
 return result(review);
};
window.getReview=()=>JSON.parse(JSON.stringify(review));
window.sendPassive=()=>{const older=JSON.parse(JSON.stringify(review));older.items=[{product_id:99,quantity:1,state:'ready',view:${JSON.stringify(fixtureView(99, "Foreign product"))}}];frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(older)},location.origin)};
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow || event.origin!==location.origin) return;
 const message=event.data; if(!message || message.jsonrpc!=='2.0') return;
 if(message.method==='ui/initialize') return post(event,{jsonrpc:'2.0',id:message.id,result:{protocolVersion:message.params.protocolVersion,hostInfo:{name:'synthetic-host',version:'1'},hostCapabilities:{},hostContext:{theme:'light'}}});
 if(message.method==='ui/notifications/initialized')return post(event,{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(review)});
 if(message.method==='ui/message'){const text=message.params.content.map(block=>block.type==='text'?block.text:'').join('');window.messages.push(text);post(event,{jsonrpc:'2.0',id:message.id,result:{}});return}
 if(message.method==='tools/call'){
  const {name,arguments:args}=message.params; window.calls.push({name,args});
  if(name==='submit_product_review'){
   window.submissionAttempts++;
   if(window.failNext){window.failNext=false;review.submission.status='uncertain';return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'Write outcome uncertain'}})}
   return post(event,{jsonrpc:'2.0',id:message.id,result:result({...review,submission:{...review.submission,status:'submitted'}})});
  }
  if(name==='update_product_review' && window.failGenericNext){window.failGenericNext=false;return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'Temporary synthetic failure'}})}
  try { const response=name==='update_product_review'?apply(args.action):result(review); return post(event,{jsonrpc:'2.0',id:message.id,result:response}); }
  catch(error){window.hostErrors.push(String(error));return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32603,message:String(error)}})}
 }
});
</script>`;

const hostDocuments = new Map([
  ["/host", parentDocument(fixtureJson)],
  ["/host-long", parentDocument(longFixtureJson)],
]);
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const hostDocument = hostDocuments.get(pathname);
  if (pathname === "/resource") {
    response
      .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end(html);
  } else if (hostDocument) {
    response
      .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end(hostDocument);
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
  const openPreparedSubmission = async () => {
    await frame.getByRole("button", { name: "Submit to Nemlig" }).click();
    await frame
      .getByRole("heading", { name: "Ready to submit the Local basket" })
      .waitFor();
  };
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
  await milkDisclosure.click();
  const quantityLayout = await milkCard
    .locator('[data-viewer-component="quantity-control"]')
    .evaluate((control) => ({
      control: control.getBoundingClientRect().width,
      parent: control.parentElement!.getBoundingClientRect().width,
      buttons: [...control.querySelectorAll("button")].map(
        (button) => button.getBoundingClientRect().width,
      ),
    }));
  assert.ok(
    quantityLayout.control >= quantityLayout.parent - 2 &&
      quantityLayout.buttons.every(
        (width) => width > quantityLayout.parent / 3,
      ),
    "expanded quantity controls do not span the product row",
  );
  assert.equal(
    await milkCard
      .getByRole("button", { name: /Actions for Synthetic milk/ })
      .count(),
    1,
    "expanded product lost its action menu trigger",
  );
  await capture("local-basket-quantity");
  await milkDisclosure.click();
  const callsBeforeMenu = await page.evaluate(() => window.calls.length);
  const actionTrigger = frame.getByRole("button", {
    name: "Actions for Synthetic milk",
  });
  const box = await milkDisclosure.boundingBox();
  assert.ok(box, "product summary has no hit area");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.up();
  assert.equal(
    await frame.getByRole("menuitem").count(),
    0,
    "a short press opened the action menu",
  );
  if ((await milkDisclosure.getAttribute("aria-expanded")) === "true") {
    await milkDisclosure.click();
  }
  const dragBox = await milkDisclosure.boundingBox();
  assert.ok(dragBox, "product summary has no drag hit area");
  await page.mouse.move(
    dragBox.x + dragBox.width * 0.8,
    dragBox.y + dragBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    dragBox.x + dragBox.width * 0.2,
    dragBox.y + dragBox.height / 2,
  );
  await page.waitForTimeout(2_100);
  await page.mouse.up();
  assert.equal(
    await frame.getByRole("menuitem").count(),
    0,
    "dragging opened the product action menu",
  );
  const holdBox = await milkDisclosure.boundingBox();
  assert.ok(holdBox, "product summary has no long-press hit area");
  await page.mouse.move(
    holdBox.x + holdBox.width / 2,
    holdBox.y + holdBox.height / 2,
  );
  await page.mouse.down();
  await frame
    .getByRole("menuitem", { name: "Find alternative" })
    .waitFor({ timeout: 3_000 });
  await page.mouse.up();
  assert.equal(
    await page.evaluate(() => window.calls.length),
    callsBeforeMenu,
    "opening the action menu changed the Local basket",
  );
  await capture("local-basket-actions");
  await frame
    .getByRole("menuitem", { name: "Find alternative" })
    .press("Escape");
  await frame.getByRole("menuitem").first().waitFor({ state: "detached" });
  await actionTrigger.click();
  await frame.getByRole("menuitem", { name: "Find alternative" }).click();
  await frame
    .getByRole("heading", { name: "Find an alternative", level: 1 })
    .waitFor();
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

  if ((await milkDisclosure.getAttribute("aria-expanded")) === "false") {
    await milkDisclosure.click();
  }
  await milkCard
    .getByRole("button", { name: "Increase quantity of Synthetic milk" })
    .click();
  await page.waitForFunction(() => window.getReview().items[0]?.quantity === 2);
  await frame.getByRole("heading", { name: "Local basket" }).waitFor();
  await page.evaluate(() => window.sendPassive());
  assert.equal(
    await frame.getByText("Foreign product").count(),
    0,
    "a passive host snapshot replaced a confirmed Local basket edit",
  );
  assert.equal(
    await page.evaluate(() => window.getReview().items[0]?.quantity),
    2,
    "ordinary snapshot reopened alternatives or lost quantity after Back",
  );
  await actionTrigger.click();
  await frame.getByRole("menuitem", { name: "Find alternative" }).click();
  await frame
    .getByRole("heading", { name: "Find an alternative", level: 1 })
    .waitFor();
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
  const oatsDisclosure = oatsCard.locator(
    '[data-viewer-component="product-summary"]',
  );
  if ((await oatsDisclosure.getAttribute("aria-expanded")) === "false") {
    await oatsDisclosure.click();
  }
  const increase = oatsCard.getByRole("button", {
    name: `Increase quantity of ${longOatsName}`,
  });
  await increase.click();
  const callsBeforeSubmit = await page.evaluate(() => window.calls.length);
  await openPreparedSubmission();
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
  const replacementCard = frame
    .locator(".product-card")
    .filter({ hasText: "Synthetic alternative" });
  if (
    (await replacementCard
      .locator('[data-viewer-component="product-summary"]')
      .getAttribute("aria-expanded")) === "false"
  ) {
    await replacementCard
      .locator('[data-viewer-component="product-summary"]')
      .click();
  }
  await replacementCard
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
  const submitCalls = await page.evaluate(() => window.calls.length);
  await openPreparedSubmission();

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
  await uncertainPage.waitForFunction(() => window.submissionAttempts === 1);
  await uncertainFrame
    .getByRole("heading", { name: "We could not verify the addition" })
    .waitFor();
  assert.equal(
    await uncertainPage.evaluate(() => window.submissionAttempts),
    1,
    "uncertain write was retried",
  );
  await uncertainPage.close();

  const removePage = await context.newPage();
  await removePage.goto(`http://127.0.0.1:${address.port}/host`);
  const removeFrame = removePage.frameLocator('iframe[title="viewer"]');
  await removeFrame.getByRole("heading", { name: "Local basket" }).waitFor();
  await removeFrame
    .getByRole("button", { name: "Actions for Synthetic milk" })
    .click();
  await removeFrame
    .getByRole("menuitem", { name: "Remove from Local basket" })
    .click();
  await removePage.waitForFunction(() => window.getReview().items.length === 1);
  assert.equal(
    await removeFrame
      .getByRole("button", { name: `Actions for ${longOatsName}` })
      .evaluate((button) => button.ownerDocument.activeElement === button),
    true,
    "removal lost focus instead of moving it to the remaining row",
  );
  await removeFrame
    .getByRole("button", { name: `Actions for ${longOatsName}` })
    .click();
  await removeFrame
    .getByRole("menuitem", { name: "Remove from Local basket" })
    .click();
  await removePage.waitForFunction(() => window.getReview().items.length === 0);
  assert.equal(
    await removeFrame
      .locator(".viewer")
      .evaluate((viewer) => viewer.ownerDocument.activeElement === viewer),
    true,
    "removing the last row lost keyboard focus",
  );
  assert.equal(
    await removePage.evaluate(() => window.providerWrites),
    0,
    "local row removal reached a provider write",
  );
  await removePage.close();

  const longPage = await context.newPage();
  await longPage.goto(`http://127.0.0.1:${address.port}/host-long`);
  const longFrame = longPage.frameLocator('iframe[title="viewer"]');
  await longFrame.getByRole("heading", { name: "Local basket" }).waitFor();
  await longFrame.locator(".product-action-row").first().waitFor();
  const longList = await longFrame.locator(".viewer").evaluate((viewer) => ({
    height: viewer.clientHeight,
    scrollHeight: viewer.scrollHeight,
    rendered: viewer.querySelectorAll(".product-action-row").length,
  }));
  assert.ok(
    longList.height <= 620 &&
      longList.scrollHeight > longList.height &&
      longList.rendered < 12,
    `long Local basket was not bounded and virtualized: ${JSON.stringify(longList)}`,
  );
  const firstLongRow = longFrame.locator(".product-action-row").first();
  await firstLongRow
    .locator('[data-viewer-component="product-summary"]')
    .click();
  await firstLongRow
    .locator('[data-viewer-component="quantity-control"]')
    .waitFor();
  await firstLongRow
    .getByRole("button", { name: "Actions for Synthetic product 1" })
    .click();
  await longFrame
    .getByRole("menuitem", { name: "Remove from Local basket" })
    .click();
  await longPage.waitForFunction(() => window.getReview().items.length === 11);
  assert.equal(
    await longFrame
      .getByRole("button", { name: "Actions for Synthetic product 2" })
      .evaluate((button) => button.ownerDocument.activeElement === button),
    true,
    "virtualized row removal lost keyboard focus",
  );
  await longFrame.locator(".viewer").evaluate((viewer) => {
    viewer.scrollTop = viewer.scrollHeight;
  });
  await longFrame.locator('[data-product-id="12"]').waitFor();
  assert.equal(
    await longPage.evaluate(() => window.providerWrites),
    0,
    "virtualized Local basket reached a provider write",
  );
  await longPage.close();

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
  "Built React viewer passed synthetic MCP browser smoke: one-list long-press actions, explicit alternatives/back and replacement, quantity flush, whole-list exact preparation, cancellation, confirmation, zero provider writes, and no external requests.",
);
