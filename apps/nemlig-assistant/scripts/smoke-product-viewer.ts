import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chromium,
  type FrameLocator,
  type Locator,
  type Page,
} from "playwright";
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
        basket_id?: string;
      };
    }>;
    messages: string[];
    hostErrors: string[];
    providerWrites: number;
    failNext: boolean;
    failGenericNext: boolean;
    deferGenericNext: boolean;
    submissionAttempts: number;
    heartbeatCalls: number;
    getBasketState: () => { selected?: string; ids: string[] };
    advanceSyntheticClock: (milliseconds: number) => void;
    sendPassive: () => void;
    cancelPendingTool: () => void;
    rejectDeferredGeneric: () => void;
    getReview: () => ProductReviewSnapshot & { basketId?: string };
  }
}

async function openBasket(
  page: Page,
  frame: FrameLocator,
  basketId: string,
  message: string,
) {
  await frame
    .getByRole("button", { name: `Open basket ${basketId.slice(0, 8)}` })
    .click();
  await frame
    .getByRole("heading", { name: "Local basket", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.calls.at(-1)?.args.basket_id),
    basketId,
    message,
  );
}

async function setSyntheticClock(viewer: Locator) {
  await viewer.evaluate(() => {
    let now = Date.now();
    Date.now = () => now;
    (
      window as Window & { advanceClock?: (milliseconds: number) => void }
    ).advanceClock = (milliseconds) => {
      now += milliseconds;
    };
  });
}

async function assertNoDeleteAction(page: Page, message: string) {
  assert.equal(
    await page.evaluate(() =>
      window.calls.some(({ args }) => args.action?.kind === "delete"),
    ),
    false,
    message,
  );
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
  basketId: "12345678-1234-4234-8234-123456789abc",
  revision: 1,
  submissionAttempted: false,
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
const basketIds = [
  "12345678-1234-4234-8234-123456789abc",
  "abcdef12-1234-4234-8234-123456789abc",
];
const parentDocument = (
  reviewJson: string,
  mode: "normal" | "picker" | "idless" | "restored" = "normal",
) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>synthetic MCP host</title>
<style>body{margin:0}</style><iframe title="viewer" src="/resource" style="display:block;width:100%;height:100vh;border:0"></iframe>
<script>
window.calls=[]; window.messages=[]; window.providerWrites=0; window.hostErrors=[]; window.submissionAttempts=0; window.failNext=false; window.failGenericNext=false; window.deferGenericNext=false; window.heartbeatCalls=0;
const mode=${JSON.stringify(mode)}; const basketIds=${JSON.stringify(basketIds)}; let selectedBasketId;
let review=JSON.parse(${JSON.stringify(reviewJson)}); if(mode==='restored') review={...review,basketId:basketIds[0],revision:1}; if(mode==='idless'){delete review.basketId;delete review.revision;delete review.submissionAttempted}
let syntheticNow=Date.now(); Date.now=()=>syntheticNow; window.advanceSyntheticClock=(milliseconds)=>{syntheticNow+=milliseconds};
const inventory=basketIds.map((basketId,index)=>({basketId,createdAt:Date.parse('2026-10-01T10:00:00.000Z'),lastActivityAt:Date.parse('2026-10-09T10:00:00.000Z'),expiresAt:Date.parse('2026-10-10T10:00:00.000Z'),revision:index+1,productCount:index+2,submissionAttempted:false}));
const basketReview=(basketId)=>({...JSON.parse(${JSON.stringify(reviewJson)}),basketId,revision:1,submissionAttempted:false,submission:undefined});
const alternativeView=${JSON.stringify(fixtureView(3, "Synthetic alternative"))};
const frame=document.querySelector('iframe');
const post=(event,message)=>event.source.postMessage(message,location.origin);
const result=(review)=>({structuredContent:{review,...(mode==='normal'?{}:{baskets:inventory,selectedBasketId})}});
const payload=(data)=>({structuredContent:data});
const apply=(action,args)=>{
 if(action.kind==='list') return payload({baskets:inventory,selectedBasketId,selectionRequired:true});
 if(action.kind==='select'){selectedBasketId=args.basket_id;review=basketReview(selectedBasketId);return result(review)}
 if(action.kind==='delete'){const index=inventory.findIndex(basket=>basket.basketId===args.basket_id);if(index>=0)inventory.splice(index,1);if(selectedBasketId===args.basket_id)selectedBasketId=undefined;return payload({baskets:inventory,selectedBasketId,selectionRequired:true})}
 if(action.kind==='heartbeat'){window.heartbeatCalls++;review.revision++;inventory.find(basket=>basket.basketId===args.basket_id).lastActivityAt=Date.parse('2026-10-10T10:00:00.000Z');return result(review)}
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
window.getReview=()=>JSON.parse(JSON.stringify(review)); window.getBasketState=()=>({selected:selectedBasketId,ids:inventory.map(basket=>basket.basketId)});
window.sendPassive=()=>{const older=JSON.parse(JSON.stringify(review));older.items=[{product_id:99,quantity:1,state:'ready',view:${JSON.stringify(fixtureView(99, "Foreign product"))}}];frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(older)},location.origin)};
let deferredGeneric; window.cancelPendingTool=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-cancelled',params:{reason:'synthetic cancellation'}},location.origin); window.rejectDeferredGeneric=()=>{if(deferredGeneric){const {event,message}=deferredGeneric;deferredGeneric=undefined;post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'Temporary synthetic failure'}})}};
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow || event.origin!==location.origin) return;
 const message=event.data; if(!message || message.jsonrpc!=='2.0') return;
 if(message.method==='ui/initialize') return post(event,{jsonrpc:'2.0',id:message.id,result:{protocolVersion:message.params.protocolVersion,hostInfo:{name:'synthetic-host',version:'1'},hostCapabilities:{},hostContext:{theme:'light'}}});
 if(message.method==='ui/notifications/initialized'){const initial=mode==='picker'?payload({baskets:inventory,selectionRequired:true}):mode==='idless'?payload({review,baskets:inventory,selectionRequired:true}):result(review);return post(event,{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:initial})}
 if(message.method==='ui/message'){const text=message.params.content.map(block=>block.type==='text'?block.text:'').join('');window.messages.push(text);post(event,{jsonrpc:'2.0',id:message.id,result:{}});return}
 if(message.method==='tools/call'){
  const {name,arguments:args}=message.params; window.calls.push({name,args});
  if(name==='submit_product_review'){
   window.submissionAttempts++;
   if(window.failNext){window.failNext=false;review.submission.status='uncertain';return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'Write outcome uncertain'}})}
   return post(event,{jsonrpc:'2.0',id:message.id,result:result({...review,submission:{...review.submission,status:'submitted'}})});
  }
  if(name==='update_product_review' && window.failGenericNext){window.failGenericNext=false;if(window.deferGenericNext){window.deferGenericNext=false;deferredGeneric={event,message};return}return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'Temporary synthetic failure'}})}
  try { const response=name==='update_product_review'?apply(args.action,args):result(review); return post(event,{jsonrpc:'2.0',id:message.id,result:response}); }
  catch(error){window.hostErrors.push(String(error));return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32603,message:String(error)}})}
 }
});
</script>`;

const hostDocuments = new Map([
  ["/host", parentDocument(fixtureJson)],
  ["/host-long", parentDocument(longFixtureJson)],
  ["/host-picker", parentDocument(fixtureJson, "picker")],
  ["/host-idless", parentDocument(fixtureJson, "idless")],
  ["/host-restored", parentDocument(fixtureJson, "restored")],
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
    await recoveryFrame.locator("#title").waitFor();
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
  await frame
    .getByRole("heading", { name: "Local basket", exact: true })
    .waitFor();
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

  const basketPage = await context.newPage();
  await basketPage.goto(`http://127.0.0.1:${address.port}/host-picker`);
  const basketFrame = basketPage.frameLocator('iframe[title="viewer"]');
  await basketFrame.locator("#title").waitFor();
  assert.equal(
    await basketPage.evaluate(() => window.calls.length),
    0,
    "picker mount selected a basket",
  );
  await openBasket(
    basketPage,
    basketFrame,
    basketIds[0],
    "selection did not carry the explicit basket ID",
  );

  await basketFrame
    .locator(".product-action-row")
    .first()
    .locator('[data-viewer-component="product-summary"]')
    .press("Shift+F10");
  await basketFrame
    .getByRole("button", { name: "Increase quantity of Synthetic milk" })
    .click();
  await basketPage.waitForFunction(() =>
    window.calls.some(
      ({ args }) => args.action?.kind === "quantity" && args.basket_id,
    ),
  );
  assert.equal(
    await basketPage.evaluate(
      () =>
        window.calls.find(({ args }) => args.action?.kind === "quantity")?.args
          .basket_id,
    ),
    basketIds[0],
    "quantity update was not bound to the selected basket",
  );

  await basketFrame.getByRole("button", { name: "Submit to Nemlig" }).click();
  await basketFrame
    .getByRole("heading", { name: "Ready to submit the Local basket" })
    .waitFor();
  await basketFrame.locator(".basket-menu > button").click();
  await basketFrame.getByRole("button", { name: "Choose basket" }).click();
  await basketFrame.locator("#title").waitFor();
  await openBasket(
    basketPage,
    basketFrame,
    basketIds[1],
    "second-chat selection did not carry its explicit basket ID",
  );
  assert.equal(
    await basketFrame
      .getByRole("heading", { name: "Ready to submit the Local basket" })
      .count(),
    0,
    "basket switch preserved the previous submission confirmation",
  );

  await basketFrame.locator(".basket-menu > button").click();
  await basketFrame.getByRole("button", { name: "Choose basket" }).click();
  await basketFrame.locator("#title").waitFor();
  const deleteTarget = basketFrame.locator(".basket-picker li").first();
  await deleteTarget
    .getByRole("button", { name: `Delete basket ${basketIds[0].slice(0, 8)}` })
    .click();
  await assertNoDeleteAction(basketPage, "delete happened before confirmation");
  await deleteTarget.getByRole("button", { name: "Keep" }).click();
  await assertNoDeleteAction(basketPage, "cancelled deletion reached the host");
  await deleteTarget
    .getByRole("button", { name: `Delete basket ${basketIds[0].slice(0, 8)}` })
    .click();
  await deleteTarget
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await basketPage.waitForFunction(() =>
    window.calls.some(({ args }) => args.action?.kind === "delete"),
  );
  assert.equal(
    await basketPage.evaluate(
      () =>
        window.calls.find(({ args }) => args.action?.kind === "delete")?.args
          .basket_id,
    ),
    basketIds[0],
    "delete was not bound to the confirmed basket",
  );
  await basketPage.close();

  const legacyPage = await context.newPage();
  await legacyPage.goto(`http://127.0.0.1:${address.port}/host-idless`);
  const legacyFrame = legacyPage.frameLocator('iframe[title="viewer"]');
  await legacyFrame.locator("#title").waitFor();
  assert.equal(
    await legacyPage.evaluate(() => window.calls.length),
    0,
    "idless card guessed a basket",
  );
  await legacyPage.close();

  const restoredPage = await context.newPage();
  await restoredPage.goto(`http://127.0.0.1:${address.port}/host-restored`);
  const restoredFrame = restoredPage.frameLocator('iframe[title="viewer"]');
  await restoredFrame
    .getByRole("heading", { name: "Local basket", exact: true })
    .waitFor();
  await setSyntheticClock(restoredFrame.locator(".viewer"));
  await restoredFrame.locator(".viewer").evaluate(() => {
    (
      window as Window & { advanceClock?: (milliseconds: number) => void }
    ).advanceClock?.(2 * 60 * 60 * 1_000);
    window.dispatchEvent(new Event("focus"));
  });
  assert.equal(
    await restoredPage.evaluate(() => window.heartbeatCalls),
    0,
    "passive restore renewed a basket",
  );
  await restoredPage.close();

  const staleFailurePage = await context.newPage();
  await staleFailurePage.goto(`http://127.0.0.1:${address.port}/host-restored`);
  const staleFailureFrame = staleFailurePage.frameLocator(
    'iframe[title="viewer"]',
  );
  await staleFailureFrame
    .getByRole("heading", { name: "Local basket", exact: true })
    .waitFor();
  await staleFailureFrame
    .locator(".product-action-row")
    .first()
    .locator('[data-viewer-component="product-summary"]')
    .press("Shift+F10");
  await staleFailurePage.evaluate(() => {
    window.failGenericNext = true;
    window.deferGenericNext = true;
  });
  await staleFailureFrame
    .getByRole("button", { name: "Increase quantity of Synthetic milk" })
    .click();
  await staleFailurePage.waitForFunction(() =>
    window.calls.some(({ args }) => args.action?.kind === "quantity"),
  );
  await staleFailurePage.evaluate(() => window.cancelPendingTool());
  const cancellationStatus = staleFailureFrame.getByRole("status");
  await cancellationStatus
    .getByText(
      "Request cancelled. Continue in conversation when you are ready.",
      {
        exact: true,
      },
    )
    .waitFor();
  await staleFailurePage.evaluate(() => window.rejectDeferredGeneric());
  await staleFailurePage.waitForTimeout(100);
  assert.equal(
    await cancellationStatus
      .getByText(
        "Request cancelled. Continue in conversation when you are ready.",
        {
          exact: true,
        },
      )
      .count(),
    1,
    "a stale rejection replaced the cancellation state",
  );
  assert.equal(
    await staleFailureFrame.getByText(/could not confirm this action/u).count(),
    0,
    "a stale rejection replaced the current selection with an error",
  );
  await staleFailurePage.close();

  const activePage = await context.newPage();
  await activePage.goto(`http://127.0.0.1:${address.port}/host-picker`);
  const activeFrame = activePage.frameLocator('iframe[title="viewer"]');
  await openBasket(
    activePage,
    activeFrame,
    basketIds[0],
    "heartbeat setup did not select the explicit basket ID",
  );
  await setSyntheticClock(activeFrame.locator(".viewer"));
  assert.equal(
    await activePage.evaluate(() => window.heartbeatCalls),
    0,
    "selection triggered an immediate heartbeat",
  );
  await activeFrame.locator(".viewer").evaluate(() => {
    (
      window as Window & { advanceClock?: (milliseconds: number) => void }
    ).advanceClock?.(60 * 60 * 1_000);
    window.dispatchEvent(new Event("focus"));
  });
  await activePage.waitForFunction(() => window.heartbeatCalls === 1);
  assert.equal(
    await activePage.evaluate(
      () =>
        window.calls.find(({ args }) => args.action?.kind === "heartbeat")?.args
          .basket_id,
    ),
    basketIds[0],
    "heartbeat was not bound to the active basket",
  );
  await activeFrame
    .locator('[data-viewer-component="product-summary"]')
    .first()
    .click();
  await activeFrame.locator(".product-detail-modal").waitFor();
  await activeFrame.locator(".viewer").evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    (
      window as Window & { advanceClock?: (milliseconds: number) => void }
    ).advanceClock?.(60 * 60 * 1_000);
    window.dispatchEvent(new Event("focus"));
  });
  await activePage.waitForTimeout(100);
  assert.equal(
    await activePage.evaluate(() => window.heartbeatCalls),
    1,
    "background tab renewed a basket",
  );
  await activePage.close();

  const milkCard = frame
    .locator(".product-card")
    .filter({ hasText: "Synthetic milk" });
  const milkDisclosure = milkCard.locator(
    '[data-viewer-component="product-summary"]',
  );
  const rowHitArea = await milkCard.evaluate((card) => {
    const row = card.getBoundingClientRect();
    const button = card
      .querySelector('[data-viewer-component="product-summary"]')!
      .getBoundingClientRect();
    return {
      top: button.top - row.top,
      left: button.left - row.left,
      right: row.right - button.right,
      bottom: row.bottom - button.bottom,
    };
  });
  assert.ok(
    Object.values(rowHitArea).every((gap) => gap <= 2),
    `product row has a non-interactive edge: ${JSON.stringify(rowHitArea)}`,
  );
  await page.bringToFront();
  await milkDisclosure.click();
  const details = frame.locator(".product-detail-modal");
  await details.waitFor();
  const detailsLayout = await details.evaluate((modal) => ({
    width: modal.getBoundingClientRect().width,
    height: modal.getBoundingClientRect().height,
    viewport: modal.ownerDocument.documentElement.clientHeight,
  }));
  assert.ok(
    detailsLayout.height >= detailsLayout.viewport - 32 &&
      detailsLayout.width >= 300,
    `product details did not open as a near-full-screen modal: ${JSON.stringify(detailsLayout)}`,
  );
  const detailsBox = await details.boundingBox();
  const hostFrameBox = await page
    .locator('iframe[title="viewer"]')
    .boundingBox();
  assert.ok(
    detailsBox && detailsBox.y >= 0 && detailsBox.y + detailsBox.height <= 860,
    `product details extend beyond the visible host viewport: ${JSON.stringify(detailsBox)}`,
  );
  assert.ok(
    hostFrameBox && detailsBox && detailsBox.y - hostFrameBox.y <= 16,
    "product details are not top-aligned in the viewer",
  );
  for (const label of ["Remove product", "Find alternatives"]) {
    assert.equal(await details.getByRole("button", { name: label }).count(), 1);
  }
  await details
    .getByRole("button", { name: "Increase quantity of Synthetic milk" })
    .click();
  await page.waitForFunction(() => window.getReview().items[0]?.quantity === 2);
  await details
    .getByRole("button", { name: "Decrease quantity of Synthetic milk" })
    .click();
  await page.waitForFunction(() => window.getReview().items[0]?.quantity === 1);
  await details.getByRole("button", { name: "Close product overlay" }).click();
  await milkDisclosure.press("Shift+F10");
  const actionSheet = frame.getByRole("group", {
    name: "Actions for Synthetic milk",
  });
  await actionSheet.waitFor();
  assert.equal(
    await frame.getByRole("dialog").count(),
    0,
    "actions opened a modal",
  );
  const rowBox = await frame.locator('[data-product-id="1"]').boundingBox();
  const sheetBox = await actionSheet.boundingBox();
  assert.ok(rowBox);
  assert.ok(sheetBox);
  assert.ok(
    Math.abs(rowBox.y - sheetBox.y) < 2,
    "actions did not replace the product row",
  );
  assert.equal(
    await frame
      .getByRole("button", { name: "Show details for Synthetic milk" })
      .evaluate((button) => {
        button.focus({ preventScroll: true });
        return (
          button.closest("article")?.inert &&
          button.ownerDocument.activeElement !== button
        );
      }),
    true,
    "replaced product summary is still interactive",
  );
  for (const label of ["Remove product", "Find alternatives"]) {
    assert.equal(
      await actionSheet.getByRole("button", { name: label }).count(),
      1,
    );
  }
  const assertActionLayout = async (surface = actionSheet) => {
    await surface.evaluate(async (node) => {
      await Promise.all(
        node.getAnimations().map((animation) => animation.finished),
      );
    });
    const remove = await surface
      .getByRole("button", { name: "Remove product" })
      .boundingBox();
    const quantity = await surface
      .locator('[data-viewer-component="quantity-control"]')
      .boundingBox();
    const alternatives = await surface
      .getByRole("button", { name: "Find alternatives" })
      .boundingBox();
    assert.ok(remove, "trash control is missing");
    assert.ok(remove.x >= 0, "trash control is clipped offscreen");
    assert.equal(
      await surface.evaluate((node) => node.parentElement?.scrollLeft),
      0,
      "focusing inline actions scrolled the row sideways",
    );
    assert.ok(quantity, "quantity controls are missing");
    assert.ok(alternatives, "Find alternatives is missing");
    assert.ok(
      remove.x + remove.width < quantity.x,
      "trash control is not left of quantity controls",
    );
    assert.ok(
      Math.abs(remove.y - quantity.y) < 2,
      "trash and quantity controls are not aligned",
    );
    assert.ok(
      Math.abs(alternatives.y - quantity.y) < 2,
      "alternatives and quantity controls are not on the same line",
    );
    assert.ok(
      remove.x + remove.width <= alternatives.x,
      "alternatives is not beside trash",
    );
    assert.ok(
      alternatives.x + alternatives.width <= quantity.x,
      "alternatives is not before quantity controls",
    );
    const targets = await surface
      .locator(".product-action-controls button")
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width >= 44 && rect.height >= 44;
        }),
      );
    assert.equal(
      targets.length,
      4,
      "trash, alternatives, minus, and plus controls are required",
    );
    assert.ok(
      targets.every(Boolean),
      "action controls have undersized touch targets",
    );
    assert.equal(
      await surface.evaluate((modal) => modal.scrollWidth <= modal.clientWidth),
      true,
      "action sheet overflows horizontally",
    );
  };
  await assertActionLayout();
  await page.setViewportSize({ width: 320, height: 860 });
  await assertActionLayout();
  await capture("local-basket-actions-320");
  await page.setViewportSize({ width: 375, height: 860 });
  await capture("local-basket-quantity");
  await actionSheet
    .getByRole("button", { name: "Close product actions" })
    .click();
  await milkDisclosure.click();
  await details.waitFor();
  await assertActionLayout(details);
  await page.setViewportSize({ width: 320, height: 860 });
  await assertActionLayout(details);
  await capture("product-details-actions-320");
  await page.setViewportSize({ width: 375, height: 860 });
  await details.getByRole("button", { name: "Find alternatives" }).click();
  await frame
    .getByRole("heading", { name: "Find an alternative", level: 1 })
    .waitFor();
  assert.equal(
    await frame.getByRole("dialog").count(),
    0,
    "details stayed open over alternatives",
  );
  assert.equal(
    await page.evaluate(() => window.getReview().items[0]?.quantity),
    1,
    "details alternatives changed quantity",
  );
  await frame.getByRole("button", { name: "Back to Local basket" }).click();
  await frame
    .getByRole("heading", { name: "Local basket", exact: true })
    .waitFor();
  const callsBeforeMenu = await page.evaluate(() => window.calls.length);
  const box = await milkDisclosure.boundingBox();
  assert.ok(box, "product summary has no hit area");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.up();
  await frame.getByRole("dialog", { name: "Synthetic milk" }).waitFor();
  await frame
    .getByRole("dialog", { name: "Synthetic milk" })
    .getByRole("button", { name: "Close product overlay" })
    .click();
  const swipeSummary = async (from: number, to: number, dy = 0) => {
    const box = await milkDisclosure.boundingBox();
    assert.ok(box, "product summary has no swipe hit area");
    await page.mouse.move(box.x + box.width * from, box.y + box.height / 2);
    await page.mouse.down();
    // Tiny initial finger jitter must not lock a horizontal swipe to the vertical axis.
    await page.mouse.move(box.x + box.width * from, box.y + box.height / 2 + 2);
    await page.mouse.move(box.x + box.width * to, box.y + box.height / 2 + dy, {
      steps: 5,
    });
    await page.mouse.up();
  };
  await swipeSummary(0.8, 0.2);
  await actionSheet.waitFor();
  assert.equal(
    await page.evaluate(() => window.calls.length),
    callsBeforeMenu,
    "opening the action menu changed the Local basket",
  );
  await capture("local-basket-actions");
  await actionSheet.press("Escape");
  await actionSheet.waitFor({ state: "detached" });
  for (const [from, to, dy] of [
    [0.2, 0.8, 0],
    [0.8, 0.7, 0],
    [0.8, 0.7, 80],
  ] as const) {
    await swipeSummary(from, to, dy);
    assert.equal(
      await frame.locator(".product-inline-actions, [role=dialog]").count(),
      0,
      "rightward, short, or vertical movement opened a product overlay",
    );
  }
  for (const cancelEvent of ["pointercancel", "lostpointercapture"]) {
    const cancelBox = await milkDisclosure.boundingBox();
    assert.ok(cancelBox, "product summary has no cancel hit area");
    await page.mouse.move(cancelBox.x + cancelBox.width * 0.8, cancelBox.y + 5);
    await page.mouse.down();
    await page.mouse.move(cancelBox.x + cancelBox.width * 0.2, cancelBox.y + 5);
    await milkDisclosure.dispatchEvent(cancelEvent, { pointerId: 1 });
    await page.mouse.up();
    assert.equal(
      await frame.locator(".product-inline-actions, [role=dialog]").count(),
      0,
      `${cancelEvent} opened an overlay`,
    );
  }
  await milkDisclosure.press("Enter");
  await details.waitFor();
  await details.press("Escape");
  await details.waitFor({ state: "detached" });
  const openMilkAlternatives = async () => {
    await milkDisclosure.press("Shift+F10");
    await frame
      .locator(".product-inline-actions")
      .getByRole("button", { name: "Find alternatives" })
      .click();
    await frame
      .getByRole("heading", { name: "Find an alternative", level: 1 })
      .waitFor();
  };
  await openMilkAlternatives();
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
  await frame
    .getByRole("heading", { name: "Local basket", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.calls.length),
    backCalls,
    "Back changed server state",
  );

  await milkDisclosure.press("Shift+F10");
  await frame
    .getByRole("group", { name: "Actions for Synthetic milk" })
    .getByRole("button", { name: "Increase quantity of Synthetic milk" })
    .click();
  await frame.locator(".product-inline-actions").press("Escape");
  await page.waitForFunction(() => window.getReview().items[0]?.quantity === 2);
  await frame
    .getByRole("heading", { name: "Local basket", exact: true })
    .waitFor();
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
  await openMilkAlternatives();
  const candidate = frame
    .locator(".alternative-options .product-card")
    .filter({ hasText: "Synthetic alternative" });
  await candidate
    .getByRole("button", {
      name: "Select Synthetic alternative as the alternative",
    })
    .click();
  await frame.getByRole("button", { name: "Use selected alternative" }).click();
  await frame
    .getByRole("heading", { name: "Local basket", exact: true })
    .waitFor();
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
  await oatsDisclosure.press("Shift+F10");
  const increase = frame
    .locator(".product-inline-actions")
    .getByRole("button", {
      name: `Increase quantity of ${longOatsName}`,
    });
  await increase.click();
  await frame.locator(".product-inline-actions").press("Escape");
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
  await replacementCard
    .locator('[data-viewer-component="product-summary"]')
    .press("Shift+F10");
  await frame
    .locator(".product-inline-actions")
    .getByRole("button", { name: "Increase quantity of Synthetic alternative" })
    .click();
  await frame.locator(".product-inline-actions").press("Escape");
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
  await uncertainFrame
    .getByRole("heading", { name: "Local basket", exact: true })
    .waitFor();
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
  await removeFrame
    .getByRole("heading", { name: "Local basket", exact: true })
    .waitFor();
  const removeProduct = async (name: string, remaining: number) => {
    await removeFrame
      .getByRole("button", { name: `Show details for ${name}` })
      .click();
    await removeFrame
      .getByRole("dialog", { name })
      .getByRole("button", { name: "Remove product" })
      .click();
    await removePage.waitForFunction(
      (count) => window.getReview().items.length === count,
      remaining,
    );
  };
  await removeProduct("Synthetic milk", 1);
  assert.equal(
    await removeFrame
      .getByRole("button", { name: `Show details for ${longOatsName}` })
      .evaluate((button) => button.ownerDocument.activeElement === button),
    true,
    "removal lost focus instead of moving it to the remaining row",
  );
  await removeProduct(longOatsName, 0);
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

  const openRowsPage = await context.newPage();
  await openRowsPage.goto(`http://127.0.0.1:${address.port}/host`);
  const openRowsFrame = openRowsPage.frameLocator('iframe[title="viewer"]');
  for (const name of ["Synthetic milk", longOatsName]) {
    await openRowsFrame
      .getByRole("button", { name: `Show details for ${name}` })
      .press("Shift+F10");
  }
  await openRowsFrame
    .locator('[data-product-id="1"]')
    .getByRole("button", { name: "Remove product" })
    .click();
  await openRowsPage.waitForFunction(
    () => window.getReview().items.length === 1,
  );
  await openRowsFrame.locator('[data-product-id="1"]').waitFor({
    state: "detached",
  });
  assert.equal(
    await openRowsFrame
      .locator(".product-inline-actions")
      .evaluate(
        (controls) => controls.ownerDocument.activeElement === controls,
      ),
    true,
    "removal did not focus the remaining row's open controls",
  );
  await openRowsPage.close();

  hostDocuments.set(
    "/host-delayed",
    parentDocument(fixtureJson).replace(
      "return post(event,{jsonrpc:'2.0',id:message.id,result:response});",
      "return setTimeout(()=>post(event,{jsonrpc:'2.0',id:message.id,result:response}),1000);",
    ),
  );
  for (const [initialDistance, releaseDuringSave] of [
    [100, true],
    [100, false],
    [5, false],
  ] as const) {
    const savingPage = await context.newPage();
    await savingPage.goto(`http://127.0.0.1:${address.port}/host-delayed`);
    const savingFrame = savingPage.frameLocator('iframe[title="viewer"]');
    await savingFrame
      .getByRole("button", {
        name: "Show details for Synthetic milk",
      })
      .press("Shift+F10");
    await savingFrame
      .getByRole("button", {
        name: "Increase quantity of Synthetic milk",
      })
      .click();
    const swiped = savingFrame.getByRole("button", {
      name: `Show details for ${longOatsName}`,
    });
    const swipeBox = await swiped.boundingBox();
    assert.ok(swipeBox);
    await savingPage.mouse.move(swipeBox.x + 200, swipeBox.y + 20);
    await savingPage.mouse.down();
    await savingPage.mouse.move(
      swipeBox.x + 200 - initialDistance,
      swipeBox.y + 20,
      { steps: 5 },
    );
    assert.equal(
      await swiped.evaluate(
        (button) =>
          new DOMMatrix(getComputedStyle(button.closest("article")!).transform)
            .m41,
      ),
      initialDistance === 5 ? 0 : -100,
    );
    await savingPage.waitForFunction(
      () =>
        document
          .querySelector<HTMLIFrameElement>("iframe")!
          .contentDocument!.querySelector<HTMLButtonElement>(
            '[data-product-id="2"] button',
          )!.disabled,
    );
    if (releaseDuringSave) {
      await savingPage.mouse.up();
    }
    await savingPage.waitForFunction(
      () =>
        !document
          .querySelector<HTMLIFrameElement>("iframe")!
          .contentDocument!.querySelector<HTMLButtonElement>(
            '[data-product-id="2"] button',
          )!.disabled,
    );
    if (!releaseDuringSave) {
      await savingPage.mouse.move(swipeBox.x + 100, swipeBox.y + 20, {
        steps: 5,
      });
      await savingPage.mouse.up();
    }
    assert.equal(
      await swiped.evaluate(
        (button) =>
          new DOMMatrix(getComputedStyle(button.closest("article")!).transform)
            .m41,
      ),
      0,
      "quantity save left another product row displaced",
    );
    assert.equal(
      await savingFrame
        .locator('[data-product-id="2"] .product-inline-actions')
        .count(),
      0,
      "a swipe interrupted by saving opened actions on release",
    );
    await savingPage.close();
  }

  const imageUrl = "https://www.nemlig.com/synthetic-swipe-image.svg";
  hostDocuments.set(
    "/host-image",
    parentDocument(
      fixtureJson.replaceAll("https://example.invalid/image.png", imageUrl),
    ),
  );
  const imagePage = await context.newPage();
  await imagePage.route(imageUrl, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="58" height="58"><rect width="58" height="58" fill="green"/></svg>',
    }),
  );
  await imagePage.goto(`http://127.0.0.1:${address.port}/host-image`);
  const imageFrame = imagePage.frameLocator('iframe[title="viewer"]');
  const thumbnail = imageFrame.locator('[data-product-id="1"] img');
  await thumbnail.waitFor();
  await thumbnail.evaluate((image: HTMLImageElement) => image.decode());
  const imageBox = await thumbnail.boundingBox();
  assert.ok(imageBox);
  await imagePage.mouse.move(imageBox.x + imageBox.width - 2, imageBox.y + 20);
  await imagePage.mouse.down();
  await imagePage.mouse.move(
    imageBox.x + imageBox.width - 57,
    imageBox.y + 20,
    { steps: 8 },
  );
  await imagePage.mouse.up();
  await imageFrame
    .getByRole("group", { name: "Actions for Synthetic milk" })
    .waitFor();
  assert.equal(
    await imagePage.evaluate(() => window.calls.length),
    0,
    "swiping from a thumbnail activated a basket action",
  );
  await imagePage.close();

  const longPage = await context.newPage();
  await longPage.goto(`http://127.0.0.1:${address.port}/host-long`);
  const longFrame = longPage.frameLocator('iframe[title="viewer"]');
  await longFrame
    .getByRole("heading", { name: "Local basket", exact: true })
    .waitFor();
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
    .press("Shift+F10");
  await longFrame
    .locator(".product-inline-actions")
    .locator('[data-viewer-component="quantity-control"]')
    .waitFor();
  await longFrame
    .locator(".product-inline-actions")
    .getByRole("button", { name: "Remove product" })
    .click();
  await longPage.waitForFunction(() => window.getReview().items.length === 11);
  await longPage.waitForFunction(() => {
    const doc = document.querySelector<HTMLIFrameElement>(
      'iframe[title="viewer"]',
    )?.contentDocument;
    const next = doc?.querySelector(
      '[data-product-id="2"] [data-viewer-component="product-summary"]',
    );
    return next && doc?.activeElement === next;
  });
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

  const touchContext = await browser.newContext({
    viewport: { width: 375, height: 860 },
    hasTouch: true,
    isMobile: true,
  });
  const touchRequests = await installViewerAssetFixture(
    touchContext,
    viewerGeneration,
    new Map(),
  );
  const touchPage = await touchContext.newPage();
  await touchPage.goto(`http://127.0.0.1:${address.port}/host`);
  const touchFrame = touchPage.frameLocator('iframe[title="viewer"]');
  const touchSummary = touchFrame.getByRole("button", {
    name: "Show details for Synthetic milk",
  });
  const touchBox = await touchSummary.boundingBox();
  assert.ok(touchBox, "touch row has no hit area");
  const touch = await touchContext.newCDPSession(touchPage);
  const touchSwipe = async (
    from: number,
    to: number,
    cancel = false,
    dy = 0,
  ) => {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: touchBox.x + touchBox.width * from, y: touchBox.y + 5 },
      ],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: touchBox.x + touchBox.width * to, y: touchBox.y + 5 + dy },
      ],
    });
    assert.equal(
      await touchFrame
        .locator(".product-inline-actions, [role=dialog]")
        .count(),
      0,
      "touch opened actions before release",
    );
    await touch.send("Input.dispatchTouchEvent", {
      type: cancel ? "touchCancel" : "touchEnd",
      touchPoints: [],
    });
  };
  for (const [from, to, cancel, dy] of [
    [0.2, 0.8, false, 0],
    [0.8, 0.7, false, 0],
    [0.8, 0.2, true, 0],
    [0.8, 0.7, false, 80],
  ] as const) {
    await touchSwipe(from, to, cancel, dy);
    assert.equal(
      await touchFrame
        .locator(".product-inline-actions, [role=dialog]")
        .count(),
      0,
      `touch (${from}, ${to}, cancel=${cancel}, dy=${dy}) opened ${await touchFrame.locator(".product-inline-actions, [role=dialog]").allTextContents()}`,
    );
    if (cancel) {
      // Assistive activation can send a click without a fresh pointer or keyboard event.
      await touchSummary.evaluate((button) =>
        (button as HTMLButtonElement).click(),
      );
      const touchDetails = touchFrame.getByRole("dialog", {
        name: "Synthetic milk",
      });
      await touchDetails.waitFor();
      await touchDetails
        .getByRole("button", { name: "Close product overlay" })
        .click();
      await touchDetails.waitFor({ state: "detached" });
    }
  }
  await touchSwipe(0.8, 0.2);
  await touchFrame
    .getByRole("group", { name: "Actions for Synthetic milk" })
    .waitFor();
  assert.equal(
    await touchPage.evaluate(() => window.calls.length),
    0,
    "touch swipe activated a basket action",
  );
  assert.equal(
    await touchPage.evaluate(() => window.providerWrites),
    0,
    "touch swipe reached a provider write",
  );
  assert.deepEqual(
    touchRequests,
    [],
    "touch UI requested an external resource",
  );
  await touchPage.goto(`http://127.0.0.1:${address.port}/host-long`);
  await touchFrame.locator(".product-action-row").first().waitFor();
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 180, y: 300 }],
  });
  for (const y of [260, 220, 180, 140]) {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 180, y }],
    });
  }
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await touchPage.waitForFunction(() => {
    const viewer = document
      .querySelector<HTMLIFrameElement>('iframe[title="viewer"]')
      ?.contentDocument?.querySelector(".viewer");
    return viewer && viewer.scrollTop > 0;
  });
  assert.equal(
    await touchFrame.locator(".product-inline-actions, [role=dialog]").count(),
    0,
    "vertical touch scrolling opened an overlay",
  );
  await touchContext.close();

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
  "Built React viewer passed synthetic MCP browser smoke: one-list right-to-left swipe actions, explicit alternatives/back and replacement, quantity flush, whole-list exact preparation, cancellation, confirmation, zero provider writes, and no external requests.",
);
