import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProductView } from "../product-presentation.js";
import { ViewerPage } from "./viewer-page.js";
import type { ViewerPageProps } from "./viewer-page.js";

const product: ProductView = {
  context: "review", status: "complete", product: {
    id: 7, name: "Fixture yoghurt", brand: "Fixture", unit_size: "500 g", price: 10,
    unit_price: 20, unit: "kr/kg", currency: "DKK", available: true,
    is_organic: false, is_frozen: false, is_on_discount: false,
    image_url: "https://example.invalid/untrusted.png", labels: [], tags: [],
  }, review: { kind: "review", quantity: 1, approved: false },
};
const noop = () => undefined;
const props = (thumbnail?: string): ViewerPageProps => ({
  screen: { kind: "review", active: true, view_id: "fixture-view", review: {
    review_id: "fixture-review", revision: 1, destination: "needs-review",
    items: [{ product_id: 7, quantity: 1, state: "needs-review", view: product }],
  } },
  maxWidth: 320,
  selected: new Set(), reviewDisclosures: new Map(), pendingQuantities: new Map(),
  thumbnails: thumbnail ? new Map([[product, thumbnail]]) : new Map(),
  message: "", busy: false, activatingCurrent: false, confirmSubmit: false,
  confirmEnd: false, continueSubmitted: false, submitBlocked: false,
  onNavigate: noop, onDisclosureChange: noop, onFactExpandedChange: noop,
  onActivateCurrent: noop, onSelected: noop, onSelectAll: noop, onAcceptSelected: noop,
  onQuantity: noop, onRemove: noop, onRevisit: noop, onOpenAlternatives: noop,
  onSearchAlternatives: noop, onChooseReplacement: noop, onReplace: noop,
  onPrepareSubmission: noop, onRequestSubmitConfirmation: noop, onCancelSubmit: noop,
  onConfirmSubmit: noop, onContinueSubmitted: noop, onInspectBasket: noop,
  onSendFollowUp: noop, onRequestEnd: noop, onCancelEnd: noop, onConfirmEnd: noop,
});

test("shared viewer page uses its supplied fixture thumbnail and keeps unsafe input on the fallback", () => {
  const localThumbnail = "/assets/milk-carton.svg";
  const withFixture = renderToStaticMarkup(createElement(ViewerPage, props(localThumbnail)));
  assert.match(withFixture, new RegExp(`<img[^>]+src="${localThumbnail}"`, "u"));
  assert.match(withFixture, /aria-labelledby="title"/u);
  assert.match(withFixture, /<h1[^>]*id="title"[^>]*>To decide<\/h1>/u);
  assert.doesNotMatch(withFixture, /<strong>Nemlig Assistant<\/strong>/u);

  const withoutFixture = renderToStaticMarkup(createElement(ViewerPage, props()));
  assert.match(withoutFixture, /data-viewer-component="image-fallback"/u);
  assert.doesNotMatch(withoutFixture, /example\.invalid\/untrusted\.png/u);
});

test("shared viewer page keeps thumbnails attached to their individual views", () => {
  const alternative: ProductView = {
    ...product,
    product: { ...product.product, name: "Alternative yoghurt", image_url: "https://www.nemlig.com/alternative.png" },
  };
  const pageProps = props();
  pageProps.screen = {
    kind: "review", active: true, view_id: "fixture-view", review: {
      review_id: "fixture-review", revision: 1, destination: "alternatives",
      items: [{ product_id: 7, quantity: 1, state: "needs-review", view: product }],
      alternatives: { product_id: 7, query: "yoghurt", views: [alternative] },
    },
  };
  pageProps.presentationDestination = "alternatives";
  pageProps.thumbnails = new Map([[product, "/assets/original.svg"], [alternative, "/assets/alternative.svg"]]);
  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, /src="\/assets\/original\.svg"[^>]*alt="Fixture yoghurt"/u);
  assert.match(markup, /src="\/assets\/alternative\.svg"[^>]*alt="Alternative yoghurt"/u);
});
