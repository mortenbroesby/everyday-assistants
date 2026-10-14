import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type FrameLocator, type Page } from "playwright";
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
          product_ids?: number[];
        };
        shopping_list_id?: number;
        review_context_id?: string;
        creation_id?: string;
        submission_id?: string;
        reviewed_list?: {
          name: string;
          items: Array<{ product_id: number; quantity: number }>;
        };
      };
    }>;
    messages: string[];
    hostErrors: string[];
    providerWrites: number;
    failNext: boolean;
    failNoWriteNext: boolean;
    failGenericNext: boolean;
    nextReviewResponse?:
      | "tool"
      | "malformed"
      | "unavailable"
      | "products"
      | "partial"
      | "uncertain";
    failMessageNext?: string;
    deferGenericNext: boolean;
    deferSubmitNext: boolean;
    resolveDeferredSubmit: () => void;
    resolveDeferredShow: () => void;
    submissionAttempts: number;
    markNativeListDirty: boolean;
    getBasketState: () => { selected?: string; ids: string[] };
    sendPassive: () => void;
    sendPassivePicker: () => void;
    cancelPendingTool: () => void;
    rejectDeferredGeneric: () => void;
    getReview: () => ProductReviewSnapshot;
  }
}

async function openBasket(
  page: Page,
  frame: FrameLocator,
  basketId: string,
  basketName: string,
  message: string,
) {
  await frame
    .getByRole("button", { name: `Open shopping list ${basketName}` })
    .click();
  await frame.getByRole("heading", { name: basketName, exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.calls.at(-1)?.args.shopping_list_id),
    Number(basketId),
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
  shoppingListId: 44,
  shoppingListName: "Synthetic saved list",
  reviewContextId: "12345678-1234-4234-8234-123456789def",
  saveStatus: "saved",
  submissionAttempted: false,
  destination: "ready",
  items: [1, 2, 3, 4, 5].map((id) => ({
    product_id: id,
    quantity: 1,
    state: "ready",
    view: fixtureView(id, id === 1 ? "Synthetic milk" : longOatsName),
  })),
};
const fixtureJson = JSON.stringify(initialReview);
const nativeFixtureJson = fixtureJson;
const partialFixtureJson = JSON.stringify({
  ...initialReview,
  shoppingListId: 46,
  shoppingListName: "Synthetic partial creation",
  items: initialReview.items.slice(0, 2),
  saveStatus: "partial",
  actionNotice:
    "Only 2 of 3 selected products were confirmed in this Nemlig list. Review the confirmed rows before continuing.",
  saveProgress: { completed: 2, total: 3 },
});
const unknownCreationFixtureJson = JSON.stringify({
  ...initialReview,
  shoppingListId: undefined,
  reviewContextId: undefined,
  shoppingListName: undefined,
  saveStatus: "uncertain",
  items: initialReview.items.slice(0, 3),
  actionNotice:
    "Nemlig may have created this selection, but no list ID was confirmed. Keep these rows and inspect your lists before starting again.",
});
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
const basketIds = ["44", "45"];
const parentDocument = (
  reviewJson: string,
  mode:
    | "normal"
    | "picker"
    | "idless"
    | "restored"
    | "unavailable"
    | "delayed"
    | "partial-create" = "normal",
) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>synthetic MCP host</title>
<style>body{margin:0}</style><iframe title="viewer" src="/resource" style="display:block;width:100%;height:100vh;border:0"></iframe>
<script>
window.calls=[]; window.messages=[]; window.providerWrites=0; window.hostErrors=[]; window.submissionAttempts=0; window.failNext=false; window.failNoWriteNext=false; window.failGenericNext=false; window.failMessageNext=undefined; window.deferGenericNext=false;
const mode=${JSON.stringify(mode)}; const basketIds=${JSON.stringify(basketIds)}; let selectedBasketId; let delayedShowPending=mode==='delayed'; let unavailableShowPending=mode==='unavailable';
const hostSnapshot=JSON.parse(${JSON.stringify(reviewJson)}); let review=JSON.parse(JSON.stringify(hostSnapshot)); if(mode==='restored') review={...review,shoppingListId:Number(basketIds[0]),shoppingListName:'Synthetic saved list',reviewContextId:'12345678-1234-4234-8234-123456789def',saveStatus:'saved'}; if(mode==='partial-create') review={...review,saveStatus:'saved',actionNotice:undefined,saveProgress:undefined}; if(mode==='idless'){delete review.shoppingListId;delete review.reviewContextId;delete review.revision;delete review.submissionAttempted}
const inventoryIds=mode==='partial-create'?[...basketIds,'46']:basketIds; const inventory=inventoryIds.map((id,index)=>({id:Number(id),name:'Synthetic saved list '+(index+1),productCount:index+2}));
const alternativeView=${JSON.stringify(fixtureView(6, "Synthetic alternative"))};
const frame=document.querySelector('iframe');
const post=(event,message)=>event.source.postMessage(message,location.origin);
const result=(review)=>({structuredContent:{review,...(mode==='normal'?{}:{shoppingLists:inventory,selectedShoppingListId:selectedBasketId?Number(selectedBasketId):null})}});
const payload=(data)=>({structuredContent:data});
const apply=(action,args)=>{
 if(action.kind==='list') return payload({shoppingLists:inventory,selectedShoppingListId:null,selectionRequired:true});
 if(action.kind==='select'){selectedBasketId=String(args.shopping_list_id);if(Number(selectedBasketId)!==Number(review.shoppingListId))review={...review,items:[{product_id:8,quantity:1,state:'ready',view:${JSON.stringify(fixtureView(8, "Foreign list product"))}}]};review={...review,shoppingListId:Number(selectedBasketId),shoppingListName:inventory.find(list=>String(list.id)===selectedBasketId)?.name,reviewContextId:'12345678-1234-4234-8234-123456789def',saveStatus:'saved',saveProgress:undefined};return result(review)}
 if(action.kind==='show'){if(args.shopping_list_id!==review.shoppingListId)throw new Error('Synthetic exact-list mismatch');return result(review)}
 if(action.kind==='navigate') review.destination=action.destination;
 if(action.kind==='quantity'){review.items.find(item=>item.product_id===action.product_id).quantity=action.quantity;window.providerWrites++}
 if(action.kind==='remove'){review.items=review.items.filter(item=>!action.product_ids.includes(item.product_id));window.providerWrites++}
 if(action.kind==='alternatives'){ review.destination='alternatives'; review.alternatives={product_id:action.product_id,query:action.query,views:[alternativeView]}; }
 if(action.kind==='replace'){ const target=review.items.find(item=>item.product_id===action.product_id); target.view={...alternativeView,product:{...alternativeView.product,id:action.replacement_id,name:'Synthetic replacement'}}; target.product_id=action.replacement_id; target.state='ready'; review.destination='ready'; review.alternatives=undefined; window.providerWrites++ }
 if(action.kind!=='navigate' && action.kind!=='alternatives') delete review.submission;
 return result(review);
};
window.getReview=()=>JSON.parse(JSON.stringify(review)); window.getBasketState=()=>({selected:selectedBasketId,ids:inventory.map(list=>String(list.id))});
window.sendPassive=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result(hostSnapshot)},location.origin);
window.sendPassivePicker=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:payload({shoppingLists:inventory,selectedShoppingListId:null,selectionRequired:true})},location.origin);
let deferredSubmit; window.resolveDeferredSubmit=()=>{const complete=deferredSubmit;deferredSubmit=undefined;complete?.()}; let deferredShow; window.resolveDeferredShow=()=>{const complete=deferredShow;deferredShow=undefined;complete?.()};
let deferredGeneric; window.cancelPendingTool=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-cancelled',params:{reason:'synthetic cancellation'}},location.origin); window.rejectDeferredGeneric=()=>{if(deferredGeneric){const {event,message}=deferredGeneric;deferredGeneric=undefined;post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'Temporary synthetic failure'}})}};
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow || event.origin!==location.origin) return;
 const message=event.data; if(!message || message.jsonrpc!=='2.0') return;
 if(message.method==='ui/initialize') return post(event,{jsonrpc:'2.0',id:message.id,result:{protocolVersion:message.params.protocolVersion,hostInfo:{name:'synthetic-host',version:'1'},hostCapabilities:{},hostContext:{theme:'light'}}});
 if(message.method==='ui/notifications/initialized'){const initial=mode==='picker'?payload({shoppingLists:inventory,selectionRequired:true}):mode==='idless'?payload({review:hostSnapshot,shoppingLists:inventory,selectionRequired:true}):result(hostSnapshot);return post(event,{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:initial})}
 if(message.method==='ui/message'){const text=message.params.content.map(block=>block.type==='text'?block.text:'').join('');window.messages.push(text);post(event,{jsonrpc:'2.0',id:message.id,result:{}});return}
 if(message.method==='tools/call'){
  const {name,arguments:args}=message.params; window.calls.push({name,args});
  if(name==='update_product_review' && args.action?.kind==='show' && delayedShowPending){delayedShowPending=false;deferredShow=()=>post(event,{jsonrpc:'2.0',id:message.id,result:result(review)});return}
  if(name==='update_product_review' && args.action?.kind==='show' && unavailableShowPending){unavailableShowPending=false;return post(event,{jsonrpc:'2.0',id:message.id,result:payload({unavailable:true})})}
  if(name==='submit_product_review'){
   window.submissionAttempts++;
   if(window.deferSubmitNext){window.deferSubmitNext=false;deferredSubmit=()=>post(event,{jsonrpc:'2.0',id:message.id,result:result({...review,submissionAttempted:true,submission:{submission_id:args.submission_id,status:'submitted',review:{}}})});return}
   if(window.failNoWriteNext){window.failNoWriteNext=false;return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'Could not verify the saved list. No basket write was sent.'}})}
   if(window.failNext){window.failNext=false;review.submission={submission_id:args.submission_id,status:'uncertain',review:{}};return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'Write outcome uncertain'}})}
   return post(event,{jsonrpc:'2.0',id:message.id,result:result({...review,submissionAttempted:true,submission:{submission_id:args.submission_id,status:'submitted',review:{}}})});
  }
  if(name==='update_product_review' && window.nextReviewResponse){
    const kind=window.nextReviewResponse;
    window.nextReviewResponse=undefined;
    const responses={
      products:payload({views:[]}),
      unavailable:payload({unavailable:true}),
      malformed:payload({unexpected:true}),
      tool:{isError:true,content:[{type:'text',text:window.failMessageNext??'Temporary synthetic failure'}]},
      partial:result({...review,updateStatus:'partial',actionNotice:'Nemlig did not confirm this shopping-list change. Refresh the exact list before editing again.'}),
      uncertain:result({...review,updateStatus:'uncertain',actionNotice:'Nemlig may have applied this shopping-list change. Refresh the exact list before editing again.'}),
    };
    if(kind==='tool') window.failMessageNext=undefined;
    return post(event,{jsonrpc:'2.0',id:message.id,result:responses[kind]});
  }
  if(name==='update_product_review' && window.failGenericNext){window.failGenericNext=false;if(window.deferGenericNext){window.deferGenericNext=false;deferredGeneric={event,message};return}const failure=window.failMessageNext??'Temporary synthetic failure';window.failMessageNext=undefined;return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32000,message:failure}})}
  try { const response=name==='update_product_review'?apply(args.action,args):result(review); return post(event,{jsonrpc:'2.0',id:message.id,result:response}); }
  catch(error){window.hostErrors.push(String(error));return post(event,{jsonrpc:'2.0',id:message.id,error:{code:-32603,message:String(error)}})}
 }
});
</script>`;

const hostDocuments = new Map([
  ["/host", parentDocument(fixtureJson)],
  ["/host-native", parentDocument(nativeFixtureJson)],
  ["/host-native-cached", parentDocument(fixtureJson)],
  ["/host-unavailable", parentDocument(fixtureJson, "unavailable")],
  [
    "/host-partial-dirty",
    parentDocument(
      JSON.stringify({
        ...JSON.parse(partialFixtureJson),
        shoppingListDirty: true,
      }),
    ),
  ],
  ["/host-partial", parentDocument(partialFixtureJson)],
  [
    "/host-partial-create",
    parentDocument(partialFixtureJson, "partial-create"),
  ],
  ["/host-unknown-creation", parentDocument(unknownCreationFixtureJson)],
  ["/host-delayed", parentDocument(fixtureJson, "delayed")],
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
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(10_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  const base = `http://127.0.0.1:${address.port}`;
  const frame = page.frameLocator('iframe[title="viewer"]');
  const currentRows = async () =>
    page.evaluate(() =>
      window
        .getReview()
        .items.map(({ product_id, quantity }) => [product_id, quantity]),
    );
  const openRowActions = async (
    targetFrame: FrameLocator,
    productId: number,
  ) => {
    const row = targetFrame.locator(
      `.product-action-row[data-product-id="${productId}"]`,
    );
    await row
      .locator('[data-viewer-component="product-summary"]')
      .press("Shift+F10");
    await row.locator(".product-inline-actions").waitFor();
    return row;
  };
  const clickQuantityIncrease = async (
    targetFrame: FrameLocator,
    productId: number,
    label: string,
  ) => {
    const row = await openRowActions(targetFrame, productId);
    await row
      .getByRole("button", { name: `Increase quantity of ${label}` })
      .click();
  };
  const incrementQuantity = async (
    targetFrame: FrameLocator,
    productId: number,
    label: string,
    expectedQuantity: number,
  ) => {
    await clickQuantityIncrease(targetFrame, productId, label);
    await page.waitForFunction(
      ({ id, quantity }) =>
        window.getReview().items.find((item) => item.product_id === id)
          ?.quantity === quantity,
      { id: productId, quantity: expectedQuantity },
    );
  };
  const waitForActionCall = async (kind: string) =>
    page.waitForFunction(
      (actionKind) =>
        window.calls.some(({ args }) => args.action?.kind === actionKind),
      kind,
    );
  const countActionCalls = async (kind: string) =>
    page.evaluate(
      (actionKind) =>
        window.calls.filter(({ args }) => args.action?.kind === actionKind)
          .length,
      kind,
    );
  const open = async (path: string) => {
    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    const targetFrame = page.frameLocator('iframe[title="viewer"]');
    await targetFrame.locator("#title").waitFor();
    return targetFrame;
  };
  const capture = async (name: string) => {
    if (!screenshotDirectory) {
      return;
    }
    await mkdir(screenshotDirectory, { recursive: true });
    const path = resolve(screenshotDirectory, `${name}.png`);
    await page.screenshot({ path });
    console.log(`Synthetic viewer mockup: ${path}`);
  };

  const activeFrame = await open("/host");
  await activeFrame
    .getByRole("heading", { name: "Synthetic saved list", exact: true })
    .waitFor();
  await activeFrame
    .getByRole("button", { name: "Add to Nemlig basket", exact: true })
    .waitFor();
  assert.equal(
    await activeFrame.locator(".product-list article").count(),
    5,
    "the original five native-list rows were not shown",
  );
  assert.equal(
    await activeFrame
      .getByRole("button", { name: /Save|Update shopping list/u })
      .count(),
    0,
    "retired manual Save/Update control rendered",
  );
  assert.equal(
    await page.evaluate(() => window.calls[0]?.args.shopping_list_id),
    44,
    "initial native refresh did not use the exact list ID",
  );
  assert.equal(
    await page.evaluate(() => window.providerWrites),
    0,
    "mount/show wrote or cleaned up a native list",
  );
  await capture("native-shopping-list");
  const basketAction = activeFrame.getByRole("button", {
    name: "Add to Nemlig basket",
    exact: true,
  });
  await basketAction.scrollIntoViewIfNeeded();
  const basketActionBounds = await basketAction.boundingBox();
  assert.ok(
    basketActionBounds &&
      basketActionBounds.y >= 0 &&
      basketActionBounds.y + basketActionBounds.height <= 860,
    "Add to Nemlig basket was not reachable by scrolling the native list",
  );

  // Persist quantity, removal, and replacement, then replay the original host snapshot on remount.
  await incrementQuantity(activeFrame, 1, "Synthetic milk", 2);
  let row = await openRowActions(activeFrame, 1);
  const increase = row.getByRole("button", {
    name: "Increase quantity of Synthetic milk",
  });
  await increase.click();
  await increase.click();
  await page.waitForFunction(
    () =>
      window.getReview().items.find((item) => item.product_id === 1)
        ?.quantity === 4,
  );
  row = await openRowActions(activeFrame, 5);
  await row.getByRole("button", { name: "Remove product" }).click();
  await page.waitForFunction(() => window.getReview().items.length === 4);
  row = await openRowActions(activeFrame, 4);
  await row.getByRole("button", { name: "Find alternatives" }).click();
  await activeFrame
    .getByRole("heading", { name: "Find an alternative", level: 1 })
    .waitFor();
  const writesBeforeSearch = await page.evaluate(() => window.providerWrites);
  const search = activeFrame.locator("#alternative-query");
  await search.fill("oats");
  await search.press("Enter");
  const replacement = activeFrame.getByRole("button", {
    name: "Use Synthetic alternative as the alternative",
  });
  await replacement.waitFor();
  await replacement.click();
  await activeFrame
    .getByRole("heading", { name: "Synthetic saved list", exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    window.getReview().items.some((item) => item.product_id === 6),
  );
  assert.equal(
    await page.evaluate(() => window.providerWrites),
    writesBeforeSearch + 1,
    "read-only alternatives search changed the provider list",
  );
  assert.deepEqual(
    await currentRows(),
    [
      [1, 4],
      [2, 1],
      [3, 1],
      [6, 1],
    ],
    "native edits did not preserve current rows and quantities",
  );
  await page.evaluate(() => window.sendPassive());
  await page.waitForTimeout(50);
  assert.deepEqual(
    await currentRows(),
    [
      [1, 4],
      [2, 1],
      [3, 1],
      [6, 1],
    ],
    "passive original host snapshot rolled back current native contents",
  );
  const beforeRemount = await page.evaluate(() => window.calls.length);
  await page.evaluate(() =>
    document
      .querySelector<HTMLIFrameElement>('iframe[title="viewer"]')
      ?.contentWindow?.location.reload(),
  );
  await page.waitForFunction(
    (count) =>
      window.calls
        .slice(count)
        .some(({ args }) => args.action?.kind === "show"),
    beforeRemount,
  );
  await activeFrame
    .getByRole("heading", { name: "Synthetic saved list", exact: true })
    .waitFor();
  await activeFrame.locator(".product-list article").first().waitFor();
  assert.deepEqual(
    await currentRows(),
    [
      [1, 4],
      [2, 1],
      [3, 1],
      [6, 1],
    ],
    "remount of the original five-product card rolled back current native contents",
  );
  assert.equal(
    await page.evaluate(
      (count) =>
        window.calls
          .slice(count)
          .every(({ args }) => args.shopping_list_id === 44),
      beforeRemount,
    ),
    true,
    "remount refresh guessed another list",
  );

  // Remount blocks every edit until the exact-list read completes.
  const delayedFrame = await open("/host-delayed");
  await delayedFrame
    .getByRole("heading", { name: "Synthetic saved list", exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    window.calls.some(({ args }) => args.action?.kind === "show"),
  );
  assert.equal(
    await delayedFrame
      .getByRole("button", { name: "Increase quantity of Synthetic milk" })
      .count(),
    0,
    "quantity control appeared before native refresh completed",
  );
  assert.equal(
    await delayedFrame
      .getByRole("button", { name: "Add to Nemlig basket" })
      .isDisabled(),
    true,
    "basket action enabled before native refresh completed",
  );
  await delayedFrame
    .getByRole("status")
    .filter({ hasText: "Refreshing this Nemlig shopping list…" })
    .waitFor();
  assert.equal(
    await delayedFrame.locator(".progress-spinner").isVisible(),
    true,
  );
  assert.equal(
    await delayedFrame.getByRole("main").getAttribute("aria-busy"),
    "true",
  );
  await capture("native-shopping-list-loading");
  await page.evaluate(() => window.resolveDeferredShow());
  await delayedFrame.locator(".progress-spinner").waitFor({ state: "hidden" });
  await openRowActions(delayedFrame, 1);
  await delayedFrame
    .getByRole("button", { name: "Increase quantity of Synthetic milk" })
    .waitFor({ state: "visible" });
  assert.equal(
    await delayedFrame
      .getByRole("button", { name: "Increase quantity of Synthetic milk" })
      .isDisabled(),
    false,
    "exact-list refresh did not enable current controls",
  );

  // An unavailable exact read preserves the cached rows and offers an exact retry.
  const unavailableFrame = await open("/host-unavailable");
  await unavailableFrame
    .getByRole("dialog", { name: "Shopping list change needs review" })
    .waitFor();
  assert.equal(
    await unavailableFrame.locator(".product-list article").count(),
    5,
    "unavailable refresh erased the cached rows",
  );
  const unavailableDialog = unavailableFrame.getByRole("dialog");
  await unavailableDialog
    .getByRole("button", { name: "Refresh shopping list" })
    .click();
  await unavailableDialog.waitFor({ state: "detached" });
  assert.equal(
    await page.evaluate(() => window.calls.at(-1)?.args.shopping_list_id),
    44,
    "retry did not target the same native list",
  );
  assert.equal(
    await unavailableFrame.locator(".product-list article").count(),
    5,
    "successful exact retry did not retain the list rows",
  );

  // A partial creation keeps its warning until the user explicitly adopts the confirmed rows.
  const partialCreateFrame = await open("/host-partial-create");
  const partialCreateDialog = partialCreateFrame.getByRole("dialog", {
    name: "Shopping list change needs review",
  });
  await partialCreateDialog.waitFor();
  assert.equal(
    await partialCreateFrame.locator(".product-list article").count(),
    2,
    "partial creation invented an unconfirmed third row",
  );
  await partialCreateFrame
    .getByText(/Only 2 of 3 selected products were confirmed/u)
    .waitFor();
  assert.match(
    await partialCreateFrame.locator("main").innerText(),
    /Only 2 of 3 selected products were confirmed/u,
    "refresh erased the partial-creation warning",
  );
  await capture("native-partial-create");
  const partialBasketAction = partialCreateFrame.getByRole("button", {
    name: "Add to Nemlig basket",
  });
  assert.equal(
    (await partialBasketAction.count()) === 0 ||
      (await partialBasketAction.isDisabled()),
    true,
    "partial creation exposed basket submission before acknowledgement",
  );
  await partialCreateDialog
    .getByRole("button", { name: "Use confirmed products" })
    .click();
  await partialCreateDialog.waitFor({ state: "detached" });
  assert.equal(
    await page.evaluate(() => window.calls.at(-1)?.args.shopping_list_id),
    46,
    "partial creation acknowledgement refreshed a different native list",
  );
  assert.equal(
    await partialCreateFrame.locator(".product-list article").count(),
    2,
    "partial creation acknowledgement invented the missing third product",
  );
  assert.equal(
    await partialCreateFrame
      .getByText(/Only 2 of 3 selected products were confirmed/u)
      .count(),
    0,
    "acknowledging confirmed products did not clear the partial warning",
  );
  await incrementQuantity(partialCreateFrame, 1, "Synthetic milk", 2);
  assert.equal(
    await partialCreateFrame
      .getByRole("button", { name: "Add to Nemlig basket" })
      .isDisabled(),
    false,
    "explicitly adopted confirmed products could not be submitted",
  );
  assert.equal(
    await partialCreateFrame.locator(".product-list article").count(),
    2,
    "editing adopted partial creation reintroduced the missing product",
  );
  const unknownCreationFrame = await open("/host-unknown-creation");
  const unknownCreationDialog = unknownCreationFrame.getByRole("dialog", {
    name: "Shopping list change needs review",
  });
  await unknownCreationDialog.waitFor();
  assert.equal(
    await unknownCreationFrame.locator(".product-list article").count(),
    3,
    "uncertain no-ID creation discarded its selected context",
  );
  assert.equal(
    await unknownCreationFrame
      .getByRole("heading", { name: "Shopping lists" })
      .count(),
    0,
    "uncertain no-ID creation silently fell back to the unrelated-list picker",
  );
  await unknownCreationDialog.getByText(/no list ID was confirmed/u).waitFor();
  await capture("native-creation-unknown-id");

  // Partial and uncertain tool results are successful JSON-RPC responses that open recovery without replay.
  for (const kind of ["partial", "uncertain"] as const) {
    const recoveryFrame = await open("/host");
    await recoveryFrame
      .getByRole("heading", { name: "Synthetic saved list", exact: true })
      .waitFor();
    await page.evaluate((response) => {
      window.nextReviewResponse = response;
    }, kind);
    await clickQuantityIncrease(recoveryFrame, 1, "Synthetic milk");
    const recoveryDialog = recoveryFrame.getByRole("dialog", {
      name: "Shopping list change needs review",
    });
    await recoveryDialog.waitFor();
    assert.equal(
      await countActionCalls("quantity"),
      1,
      `${kind} edit was replayed automatically`,
    );
    if (kind === "uncertain") {
      await recoveryDialog
        .getByRole("button", {
          name: "Discard pending changes and use current list",
        })
        .click();
      await recoveryDialog.waitFor({ state: "detached" });
      await recoveryFrame
        .getByRole("heading", { name: "Synthetic saved list", exact: true })
        .waitFor();
      await recoveryFrame
        .getByRole("button", { name: "Find alternatives" })
        .first()
        .click();
      await recoveryFrame
        .getByRole("heading", { name: "Find an alternative", level: 1 })
        .waitFor();
      assert.equal(
        await countActionCalls("quantity"),
        1,
        "discarded quantity was resent during navigation",
      );
      await recoveryFrame
        .getByRole("button", { name: "Back to shopping list" })
        .click();
      await recoveryFrame
        .getByRole("heading", { name: "Synthetic saved list", exact: true })
        .waitFor();
      await incrementQuantity(recoveryFrame, 1, "Synthetic milk", 2);
      assert.equal(
        await countActionCalls("quantity"),
        2,
        "a later explicit edit replayed the discarded quantity",
      );
      assert.equal(
        await page.evaluate(() => window.calls.at(-1)?.args.shopping_list_id),
        44,
        "post-discard edit changed native-list identity",
      );
    } else {
      await recoveryDialog
        .getByRole("button", { name: "Refresh shopping list" })
        .click();
      await recoveryDialog.waitFor({ state: "detached" });
      assert.equal(
        await page.evaluate(() => window.calls.at(-1)?.args.shopping_list_id),
        44,
        `${kind} recovery refreshed a different list`,
      );
    }
  }

  // A rejected quantity requires exact-list readback before later edits can proceed.
  const failedQuantityFrame = await open("/host");
  await failedQuantityFrame
    .getByRole("heading", { name: "Synthetic saved list", exact: true })
    .waitFor();
  await page.evaluate(() => {
    window.failGenericNext = true;
    window.deferGenericNext = true;
  });
  await clickQuantityIncrease(failedQuantityFrame, 1, "Synthetic milk");
  await waitForActionCall("quantity");
  await failedQuantityFrame
    .getByText("Quantity change pending; waiting for Nemlig to confirm it.", {
      exact: true,
    })
    .waitFor();
  await page.evaluate(() => window.rejectDeferredGeneric());
  const failedQuantityDialog = failedQuantityFrame.getByRole("dialog", {
    name: "Shopping list change needs review",
  });
  await failedQuantityDialog.waitFor();
  assert.equal(
    await countActionCalls("quantity"),
    1,
    "failed quantity edit was retried before recovery",
  );
  await failedQuantityDialog
    .getByRole("button", { name: "Refresh shopping list" })
    .click();
  await failedQuantityDialog.waitFor({ state: "detached" });
  assert.equal(
    await page.evaluate(() => window.calls.at(-1)?.args.action?.kind),
    "show",
    "failed quantity recovery did not read back current native contents",
  );
  assert.equal(
    await page.evaluate(() => window.calls.at(-1)?.args.shopping_list_id),
    44,
    "failed quantity recovery refreshed a different native list",
  );
  const recoveredQuantityRow = await openRowActions(failedQuantityFrame, 1);
  await recoveredQuantityRow
    .getByRole("button", { name: "Find alternatives" })
    .click();
  await failedQuantityFrame
    .getByRole("heading", { name: "Find an alternative", level: 1 })
    .waitFor();
  assert.equal(
    await countActionCalls("quantity"),
    1,
    "failed quantity was resent during navigation after readback",
  );
  await failedQuantityFrame
    .getByRole("button", { name: "Back to shopping list" })
    .click();
  await failedQuantityFrame
    .getByRole("heading", { name: "Synthetic saved list", exact: true })
    .waitFor();
  await incrementQuantity(failedQuantityFrame, 1, "Synthetic milk", 2);
  assert.equal(
    await countActionCalls("quantity"),
    2,
    "later explicit edit resent the failed quantity instead of its new intent",
  );
  assert.equal(
    await page.evaluate(() => window.calls.at(-1)?.args.shopping_list_id),
    44,
    "post-discard quantity edit changed native-list identity",
  );

  // Host cancellation leaves the visible context and never retries the edit.
  const cancelledFrame = await open("/host");
  await cancelledFrame
    .getByRole("heading", { name: "Synthetic saved list", exact: true })
    .waitFor();
  await page.evaluate(() => {
    window.failGenericNext = true;
    window.deferGenericNext = true;
  });
  await clickQuantityIncrease(cancelledFrame, 1, "Synthetic milk");
  await waitForActionCall("quantity");
  await page.evaluate(() => window.cancelPendingTool());
  const cancelledDialog = cancelledFrame.getByRole("dialog", {
    name: "Shopping list change needs review",
  });
  await cancelledDialog.waitFor();
  await page.evaluate(() => {
    window.rejectDeferredGeneric();
    window.sendPassive();
  });
  await cancelledDialog
    .getByRole("button", { name: "Refresh shopping list" })
    .click();
  await cancelledDialog.waitFor({ state: "detached" });
  assert.equal(
    await countActionCalls("quantity"),
    1,
    "cancelled edit was retried",
  );
  assert.equal(
    await page.evaluate(() => window.calls.at(-1)?.args.shopping_list_id),
    44,
    "cancellation recovery refreshed a different native list",
  );
  assert.equal(
    await page.evaluate(() => window.calls.at(-1)?.args.action?.kind),
    "show",
    "cancellation recovery did not read back the native list before resuming",
  );

  // Selecting a second native list scopes all future edits to that ID.
  const pickerPage = await context.newPage();
  await installViewerAssetFixture(
    await pickerPage.context(),
    viewerGeneration,
    new Map(),
  );
  await pickerPage.goto(`${base}/host-picker`);
  const pickerFrame = pickerPage.frameLocator('iframe[title="viewer"]');
  await openBasket(
    pickerPage,
    pickerFrame,
    "45",
    "Synthetic saved list 2",
    "selection did not use the exact foreign list ID",
  );
  const selectWriteCount = await pickerPage.evaluate(
    () => window.providerWrites,
  );
  assert.equal(
    selectWriteCount,
    0,
    "show/select changed or cleaned up a native list",
  );
  const foreignRow = await openRowActions(pickerFrame, 8);
  await foreignRow
    .getByRole("button", { name: "Increase quantity of Foreign list product" })
    .click();
  await pickerPage.waitForFunction(
    (kind) => window.calls.some(({ args }) => args.action?.kind === kind),
    "quantity",
  );
  assert.equal(
    await pickerPage.evaluate(() => window.calls.at(-1)?.args.shopping_list_id),
    45,
    "foreign-list edit escaped its selected list",
  );
  assert.deepEqual(
    await pickerPage.evaluate(() =>
      window.getReview().items.map(({ product_id }) => product_id),
    ),
    [8],
    "foreign-list selection leaked rows from the original list",
  );
  await pickerPage.close();

  // Keep a no-write failure retry and an uncertain basket result with no replay path.
  const basketFailureFrame = await open("/host-native");
  await basketFailureFrame
    .getByRole("heading", { name: "Synthetic saved list", exact: true })
    .waitFor();
  await page.evaluate(() => {
    window.failNoWriteNext = true;
  });
  await basketFailureFrame
    .getByRole("button", { name: "Add to Nemlig basket" })
    .click();
  const noWriteDialog = basketFailureFrame.getByRole("dialog", {
    name: "Submission was not sent",
  });
  await noWriteDialog.waitFor();
  assert.equal(
    await page.evaluate(() => window.submissionAttempts),
    1,
    "known no-write failure was retried",
  );
  const firstBasketAttempt = await page.evaluate(
    () =>
      window.calls
        .slice()
        .reverse()
        .find((call) => call.name === "submit_product_review")?.args,
  );
  assert.ok(firstBasketAttempt?.reviewed_list);
  assert.equal(
    firstBasketAttempt?.shopping_list_id,
    44,
    "basket attempt did not target the exact reviewed native list",
  );
  assert.deepEqual(
    firstBasketAttempt?.reviewed_list?.items,
    [
      { product_id: 1, quantity: 1 },
      { product_id: 2, quantity: 1 },
      { product_id: 3, quantity: 1 },
      { product_id: 4, quantity: 1 },
      { product_id: 5, quantity: 1 },
    ],
    "basket attempt did not carry the exact reviewed native-list contents",
  );
  await noWriteDialog
    .getByRole("button", { name: "Review shopping list" })
    .click();
  await noWriteDialog.waitFor({ state: "detached" });
  await basketFailureFrame
    .getByRole("button", { name: "Add to Nemlig basket" })
    .click();
  await basketFailureFrame
    .getByText(/Nemlig confirmed the addition/u)
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.submissionAttempts),
    2,
    "explicit retry did not submit exactly once",
  );
  const basketAttempts = await page.evaluate(() =>
    window.calls.filter((call) => call.name === "submit_product_review"),
  );
  assert.equal(
    basketAttempts.length,
    2,
    "basket retry changed the attempt count",
  );
  const secondBasketAttempt = basketAttempts[1];
  assert.ok(secondBasketAttempt?.args.reviewed_list);
  assert.deepEqual(
    secondBasketAttempt.args.reviewed_list.items,
    firstBasketAttempt.reviewed_list.items,
    "explicit retry changed the reviewed native-list payload",
  );
  const uncertainFrame = await open("/host-native");
  await uncertainFrame
    .getByRole("heading", { name: "Synthetic saved list", exact: true })
    .waitFor();
  await page.evaluate(() => {
    window.failNext = true;
  });
  await uncertainFrame
    .getByRole("button", { name: "Add to Nemlig basket" })
    .click();
  const uncertainDialog = uncertainFrame.getByRole("dialog", {
    name: "Check your Nemlig basket",
  });
  await uncertainDialog.waitFor();
  assert.equal(
    await page.evaluate(() => window.submissionAttempts),
    1,
    "uncertain transfer retried",
  );
  const uncertainSubmitButton = uncertainFrame.getByRole("button", {
    name: "Add to Nemlig basket",
  });
  assert.equal(
    (await uncertainSubmitButton.count()) === 0 ||
      (await uncertainSubmitButton.isDisabled()),
    true,
    "uncertain result allowed another basket submission",
  );
  await page.evaluate(() => window.sendPassive());
  assert.equal(
    await page.evaluate(() => window.submissionAttempts),
    1,
    "passive payload replayed uncertain transfer",
  );

  assert.deepEqual(
    externalRequests,
    [],
    "viewer requested a resource outside the synthetic host",
  );
  assert.deepEqual(errors, [], "React UI raised browser errors");
  assert.equal(
    await page.evaluate(() => window.providerWrites),
    0,
    "basket recovery performed an unexpected native-list edit",
  );
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
  "Built React viewer passed synthetic MCP browser smoke: native creation recovery, exact-list remount, immediate edits, uncertainty recovery, basket no-replay guards, and no external requests.",
);
