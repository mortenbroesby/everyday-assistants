import assert from "node:assert/strict";
import test from "node:test";
import { Script } from "node:vm";
import type { ProductView } from "./product-presentation.js";
import {
  PRODUCT_VIEWER_MIME_TYPE,
  PRODUCT_VIEWER_RESOURCE_METADATA,
  PRODUCT_VIEWER_RESOURCE_URI,
  productViewsToText,
  renderProductViewerHtml,
} from "./product-viewer.js";

const complete: ProductView = {
  context: "review",
  status: "complete",
  product: {
    id: 7,
    name: "Mælk <script>alert(1)</script>",
    price: 12,
    unit_price: 12,
    unit: "12 kr/l",
    unit_size: "1 l",
    category: "Køl",
    subcategory: "Mejeri",
    currency: "DKK",
    brand: "Test",
    description: "Fresh product details.",
    declaration: "Milk, vitamin D.",
    details: [{ key: "Fat", value: "1.5%" }],
    labels: ["Laktosefri", "Økologisk"],
    available: true,
    is_organic: true,
    is_frozen: false,
    is_on_discount: false,
    image_url: undefined,
    tags: ["organic"],
  },
  review: { kind: "review", quantity: 2, approved: false },
};

test("viewer exposes one MCP Apps resource identity and a complete headless fallback", () => {
  assert.equal(PRODUCT_VIEWER_RESOURCE_URI, "ui://nemlig/product-viewer.html");
  assert.equal(PRODUCT_VIEWER_MIME_TYPE, "text/html;profile=mcp-app");
  assert.deepEqual(PRODUCT_VIEWER_RESOURCE_METADATA, {
    ui: { resourceUri: PRODUCT_VIEWER_RESOURCE_URI },
    "openai/outputTemplate": PRODUCT_VIEWER_RESOURCE_URI,
  });
  assert.match(productViewsToText([complete]), /Mælk/u);
  assert.match(productViewsToText([complete]), /Fresh product details/u);
  assert.match(productViewsToText([complete]), /approved no/u);
  assert.match(productViewsToText([complete]), /12 kr\/l/u);
  assert.match(productViewsToText([complete]), /Fat: 1\.5%/u);
  assert.match(productViewsToText([complete]), /category: Køl \/ Mejeri/u);
  assert.match(productViewsToText([{ context: "search", status: "unavailable", product_id: 9 }]), /9/u);
  assert.equal(productViewsToText([]), "No products found.");
});

test("viewer resource is accessible, self-contained, and limited to local review actions", () => {
  const html = renderProductViewerHtml();

  assert.match(html, /<html lang="en">/u);
  assert.match(html, /role="status"/u);
  assert.match(html, /aria-live="polite"/u);
  assert.match(html, /aria-label="Product results"/u);
  assert.match(html, /event.source !== window.parent/u);
  assert.match(html, /ui\/notifications\/tool-result/u);
  assert.match(html, /Array\.isArray\(value\.result\)/u);
  assert.match(html, /window\.openai\.toolOutput/u);
  assert.match(html, /product\.brand/u);
  assert.match(html, /Product ID: /u);
  assert.match(html, /product\.unit/u);
  assert.match(html, /product\.unit_price/u);
  assert.match(html, /product\.labels/u);
  assert.match(html, /product\.declaration/u);
  assert.match(html, /product\.details/u);
  assert.match(html, /el\("details"/u);
  assert.match(html, /el\("summary"/u);
  assert.match(html, /product\.declaration/u);
  assert.match(html, /product\.details/u);
  assert.match(html, /Review quantity: /u);
  assert.doesNotMatch(html, /\b(fetch|XMLHttpRequest|WebSocket)\b/u);
  assert.match(html, /callTool\("update_product_review"/u);
  assert.doesNotMatch(html, /callTool\("(?:submit_product_review|add_approved_items|remove_approved_item|make_approved_item_swap|empty_approved_basket)"/u);
  assert.match(html, /Add selected to local Basket/u);
  assert.match(html, /Review in conversation/u);
  assert.doesNotMatch(html, /<script\s+src=/u);
});

test("viewer handles missing and unsafe images through text and safe-origin checks", () => {
  const html = renderProductViewerHtml();

  assert.match(html, /Unknown price/u);
  assert.match(html, /safeImageOrigins/u);
  assert.match(html, /product\.available === undefined/u);
  assert.match(html, /image\.addEventListener\("error"/u);
  assert.match(html, /textContent/u);
  assert.match(html, /Product details unavailable/u);
  assert.match(html, /https:\/\/nemlig\.com/u);
  assert.doesNotMatch(html, /tracking\.example/u);
});


test("the self-contained browser program is valid JavaScript", () => {
  const script = renderProductViewerHtml().split("<script>")[1]!.split("</script>")[0]!;
  assert.doesNotThrow(() => new Script(script));
});
