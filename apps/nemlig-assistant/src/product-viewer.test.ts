import assert from "node:assert/strict";
import test from "node:test";
import { validateProductViewerArtifact } from "../scripts/product-viewer-artifact.js";
import type { ProductView } from "./product-presentation.js";
import {
  PRODUCT_VIEWER_BUILD_MARKER,
  PRODUCT_VIEWER_MIME_TYPE,
  PRODUCT_VIEWER_RESOURCE_METADATA,
  PRODUCT_VIEWER_RESOURCE_URI,
  productViewsToText,
  readProductViewerArtifact,
  renderProductViewerHtml,
} from "./product-viewer.js";

const complete: ProductView = {
  context: "review", status: "complete", product: {
    id: 7, name: "Mælk", price: 12, unit_price: 12, unit: "12 kr/l", unit_size: "1 l",
    currency: "DKK", brand: "Fresh", available: true, is_organic: false, is_frozen: false,
    is_on_discount: false, image_url: undefined, labels: [], tags: [], details: [{ key: "Fat", value: "1.5%" }],
  }, review: { kind: "review", quantity: 2, approved: false },
};

test("permanent viewer identity and complete headless fallback stay in sync", () => {
  assert.equal(PRODUCT_VIEWER_RESOURCE_URI, "ui://nemlig/draft-list.html");
  assert.equal(PRODUCT_VIEWER_MIME_TYPE, "text/html;profile=mcp-app");
  assert.deepEqual(PRODUCT_VIEWER_RESOURCE_METADATA, {
    ui: { resourceUri: PRODUCT_VIEWER_RESOURCE_URI },
    "openai/outputTemplate": PRODUCT_VIEWER_RESOURCE_URI,
  });
  const text = productViewsToText([complete]);
  for (const fact of ["Mælk", "Fresh", "approved no", "12 kr/l", "Fat: 1.5%", "draft list quantity 2"]) assert.match(text, new RegExp(fact, "u"));
  assert.match(productViewsToText([{ context: "search", status: "unavailable", product_id: 9 }]), /9/u);
  assert.equal(productViewsToText([]), "No products found.");
});

test("headless product text preserves full optional fact ordering exactly", () => {
  const fullProduct: ProductView = {
    context: "basket",
    status: "complete",
    basket: { kind: "basket", quantity: 2, line_total: 5 },
    product: {
      id: 12, name: "Blåbær", price: 10, unit_price: 2.5, unit: "kg", unit_size: "250 g",
      category: "Frugt", subcategory: "Bær", currency: "DKK", brand: "Nord", available: true,
      is_organic: true, is_frozen: false, is_on_discount: true, image_url: undefined,
      labels: ["Øko", "Dansk"], tags: ["organic"], description: "Sød", declaration: "EU klasse 1",
      details: [{ key: "Fedt", value: "2%" }, { key: "Oprindelse", value: "Danmark" }],
    },
  };

  assert.equal(
    productViewsToText([fullProduct]),
    "1. Blåbær — Nord — 10.00 kr DKK — kg — 250 g — available; category: Frugt / Bær; organic yes; frozen no; on discount yes; unit price 2.50 kr DKK (kg); labels: Øko, Dansk; Nemlig basket quantity 2; line total 5.00 kr; description: Sød; declaration: EU klasse 1; Fedt: 2%; Oprindelse: Danmark.",
  );
});

test("headless product text preserves unknown, zero, false, empty, and whitespace values exactly", () => {
  const unknown: ProductView = {
    context: "result",
    status: "complete",
    product: {
      id: undefined, name: "Mystery", price: undefined, unit_price: undefined, unit: "", unit_size: "",
      currency: "DKK", brand: undefined, available: undefined, is_organic: undefined, is_frozen: undefined,
      is_on_discount: undefined, image_url: undefined, labels: [], tags: [], details: [],
    },
  };
  const zeroFalse: ProductView = {
    context: "review",
    status: "complete",
    review: { kind: "review", quantity: 0, line_total: 0, approved: false },
    product: {
      id: 0, name: "Vand", price: 0, unit_price: 0, unit: "", unit_size: "", currency: "DKK",
      brand: undefined, available: false, is_organic: false, is_frozen: false, is_on_discount: false,
      image_url: undefined, labels: [], tags: [], details: [],
    },
  };
  const whitespace: ProductView = {
    context: "search",
    status: "complete",
    product: {
      id: 2, name: "Tea", price: 1, unit_price: undefined, unit: "", unit_size: "", currency: "DKK",
      brand: undefined, available: undefined, is_organic: undefined, is_frozen: undefined,
      is_on_discount: undefined, image_url: undefined, labels: [], tags: [], details: [],
      description: " ", declaration: "  ", category: " ", subcategory: "  ",
    },
  };

  assert.equal(productViewsToText([unknown]), "1. Mystery — unknown price DKK — availability unknown.");
  assert.equal(
    productViewsToText([zeroFalse]),
    "1. Vand — 0.00 kr DKK — unavailable; organic no; frozen no; on discount no; unit price 0.00 kr DKK; draft list quantity 0; line total 0.00 kr; approved no.",
  );
  assert.equal(
    productViewsToText([whitespace]),
    "1. Tea — 1.00 kr DKK — availability unknown; description: \u0020; declaration: \u0020\u0020.",
  );
});

test("headless product text preserves multiple rows and unavailable outputs exactly", () => {
  assert.equal(
    productViewsToText([
      { ...complete, product: { ...complete.product, name: "First", labels: [], details: [] } },
      { ...complete, product: { ...complete.product, name: "Second", labels: [], details: [] } },
    ]),
    "1. First — Fresh — 12.00 kr DKK — 12 kr/l — 1 l — available; organic no; frozen no; on discount no; unit price 12.00 kr DKK (12 kr/l); draft list quantity 2; line total unknown price; approved no.\n2. Second — Fresh — 12.00 kr DKK — 12 kr/l — 1 l — available; organic no; frozen no; on discount no; unit price 12.00 kr DKK (12 kr/l); draft list quantity 2; line total unknown price; approved no.",
  );
  assert.equal(
    productViewsToText([
      { context: "search", status: "unavailable" },
      { context: "result", status: "unavailable", product_id: 42 },
    ]),
    "1. Product details unavailable.\n2. Product 42 details unavailable.",
  );
  assert.equal(productViewsToText([]), "No products found.");
});

test("served resource is the bounded self-contained React build", () => {
  const { artifactId, html } = readProductViewerArtifact();
  assert.match(html, /<html lang="en">/u);
  assert.match(html, /Nemlig Assistant Draft list/u);
  assert.match(html, new RegExp(`name="nemlig-viewer-build" content="${PRODUCT_VIEWER_BUILD_MARKER}"`, "u"));
  assert.match(artifactId, /^[a-f0-9]{64}$/u);
  assert.equal(html, renderProductViewerHtml());
  assert.match(html, /react-dom/u);
  validateProductViewerArtifact(html);
});

test("artifact policy rejects external dependencies, dynamic loading, fetches, placeholders, and oversized HTML", () => {
  const rejected = [
    ['<script src="https://example.test/app.js"></script>', "viewer contains an external script"],
    ['<link rel="stylesheet" href="https://example.test/app.css">', "viewer contains an external stylesheet"],
    ["import(\"./chunk.js\")", "viewer contains a dynamic import"],
    ['fetch("/api")', "viewer contains an application fetch"],
    ["Interactive local review is not implemented", "candidate placeholder remains in the production viewer"],
  ] as const;

  for (const [html, message] of rejected) {
    assert.throws(() => validateProductViewerArtifact(html), new RegExp(message, "u"));
  }
  assert.throws(
    () => validateProductViewerArtifact("x".repeat(1_500_001)),
    /React viewer exceeds the raw HTML budget/u,
  );

  let state = 1;
  const lowCompressionHtmlBytes = Buffer.allocUnsafe(500_000);
  for (let index = 0; index < 500_000; index += 1) {
    state = (1664525 * state + 1013904223) >>> 0;
    lowCompressionHtmlBytes[index] = 32 + (state % 95);
  }
  assert.throws(
    () => validateProductViewerArtifact(lowCompressionHtmlBytes.toString("ascii")),
    /React viewer exceeds the gzip HTML budget/u,
  );
});
