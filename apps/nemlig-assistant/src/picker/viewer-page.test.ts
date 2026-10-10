import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProductView } from "../product-presentation.js";
import { ViewerPage } from "./viewer-page.js";
import type { ViewerPageProps } from "./viewer-page.js";

const product: ProductView = {
  context: "review",
  status: "complete",
  product: {
    id: 7,
    name: "Fixture yoghurt",
    brand: "Fixture",
    unit_size: "500 g",
    price: 10,
    unit_price: 20,
    unit: "kr/kg",
    currency: "DKK",
    available: true,
    is_organic: false,
    is_frozen: false,
    is_on_discount: false,
    image_url: "https://example.invalid/untrusted.png",
    labels: [],
    tags: [],
  },
  review: { kind: "review", quantity: 1, approved: false },
};
const noop = () => undefined;
const props = (thumbnail?: string): ViewerPageProps => ({
  model: {
    screen: {
      kind: "review",
      active: true,
      review: {
        destination: "ready",
        items: [
          {
            product_id: 7,
            quantity: 1,
            state: "ready",
            view: product,
          },
        ],
      },
    },
    maxWidth: 320,
    reviewDisclosures: new Map(),
    pendingQuantities: new Map(),
    thumbnails: thumbnail ? new Map([[product, thumbnail]]) : new Map(),
    message: "",
    busy: false,
    confirmSubmit: false,
    confirmEnd: false,
    continueSubmitted: false,
    submitBlocked: false,
  },
  actions: {
    onNavigate: noop,
    onDisclosureChange: noop,
    onFactExpandedChange: noop,
    onRefresh: noop,
    onQuantity: noop,
    onRemove: noop,
    onOpenAlternatives: noop,
    onSearchAlternatives: noop,
    onReplace: noop,
    onPrepareSubmission: noop,
    onRequestSubmitConfirmation: noop,
    onCancelSubmit: noop,
    onConfirmSubmit: noop,
    onContinueSubmitted: noop,
    onInspectBasket: noop,
    onSendFollowUp: noop,
    onRequestEnd: noop,
    onCancelEnd: noop,
    onConfirmEnd: noop,
  },
});

test("shared viewer page uses its supplied fixture thumbnail and keeps unsafe input on the fallback", () => {
  const localThumbnail = "/assets/milk-carton.svg";
  const withFixture = renderToStaticMarkup(
    createElement(ViewerPage, props(localThumbnail)),
  );
  assert.match(
    withFixture,
    new RegExp(`<img[^>]+src="${localThumbnail}"`, "u"),
  );
  assert.match(withFixture, /aria-labelledby="title"/u);
  assert.match(withFixture, /<h1[^>]*id="title"[^>]*>Local basket<\/h1>/u);
  assert.doesNotMatch(withFixture, /<strong>Nemlig Assistant<\/strong>/u);

  const withoutFixture = renderToStaticMarkup(
    createElement(ViewerPage, props()),
  );
  assert.match(withoutFixture, /data-viewer-component="image-fallback"/u);
  assert.doesNotMatch(withoutFixture, /example\.invalid\/untrusted\.png/u);
});

test("shared viewer page keeps thumbnails attached to their individual views", () => {
  const alternative: ProductView = {
    ...product,
    product: {
      ...product.product,
      name: "Alternative yoghurt",
      image_url: "https://www.nemlig.com/alternative.png",
    },
  };
  const pageProps = props();
  pageProps.model.screen = {
    kind: "review",
    active: true,
    review: {
      destination: "alternatives",
      items: [{ product_id: 7, quantity: 1, state: "ready", view: product }],
      alternatives: { product_id: 7, query: "yoghurt", views: [alternative] },
    },
  };
  pageProps.model.presentationDestination = "alternatives";
  pageProps.model.thumbnails = new Map([
    [product, "/assets/original.svg"],
    [alternative, "/assets/alternative.svg"],
  ]);
  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(
    markup,
    /src="\/assets\/original\.svg"[^>]*alt="Fixture yoghurt"/u,
  );
  assert.match(
    markup,
    /src="\/assets\/alternative\.svg"[^>]*alt="Alternative yoghurt"/u,
  );
  assert.match(markup, /data-viewer-component="product-price"/u);
  assert.match(
    markup,
    /aria-label="Select Alternative yoghurt as the alternative"/u,
  );
  assert.match(markup, /Use selected alternative/u);
  assert.match(markup, /Back to Local basket/u);
});

test("empty and incomplete Local baskets cannot start submission", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  const review = pageProps.model.screen.review;
  pageProps.model.screen = {
    kind: "review",
    active: true,
    review: { ...review, items: [] },
  };
  assert.doesNotMatch(
    renderToStaticMarkup(createElement(ViewerPage, pageProps)),
    />Submit to Nemlig<\/button>/u,
  );

  for (const view of [
    { context: "review", status: "unavailable", product_id: 7 },
    { ...product, product: { ...product.product, price: undefined } },
  ] satisfies ProductView[]) {
    pageProps.model.screen = {
      kind: "review",
      active: true,
      review: { ...review, items: [{ ...review.items[0]!, view }] },
    };
    const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
    assert.match(
      markup,
      /<button[^>]*disabled=""[^>]*>Submit to Nemlig<\/button>/u,
    );
    assert.match(
      markup,
      /Remove or replace unavailable or incomplete products/u,
    );
  }
});

test("busy submission confirmation disables its cancel control", () => {
  const pageProps = props();
  assert.equal(pageProps.model.screen.kind, "review");
  if (pageProps.model.screen.kind !== "review") {
    return;
  }
  pageProps.model.screen = {
    ...pageProps.model.screen,
    review: {
      ...pageProps.model.screen.review,
      destination: "ready",
      items: pageProps.model.screen.review.items.map((item) => ({
        ...item,
        state: "ready",
      })),
      submission: {
        status: "prepared",
        submission_id: "fixture-submission",
        review: { lines: [], expected_products_price: 0 },
      },
    },
  };
  pageProps.model.presentationDestination = "ready";
  pageProps.model.busy = true;
  pageProps.model.confirmSubmit = true;

  const html = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  const cancelButton = html.match(/<button[^>]*>Cancel<\/button>/u)?.[0];
  assert.ok(cancelButton, "submission confirmation did not render Cancel");
  assert.match(cancelButton, /disabled=""/u);
});

test("shared viewer page distinguishes a verified partial addition from an uncertain one", () => {
  const pageProps = props();
  assert.equal(pageProps.model.screen.kind, "review");
  if (pageProps.model.screen.kind !== "review") {
    return;
  }
  pageProps.model.screen = {
    ...pageProps.model.screen,
    review: {
      ...pageProps.model.screen.review,
      submission: {
        status: "partial",
        submission_id: "fixture-submission",
        verified_additions: 1,
        review: {},
      },
    },
  };

  const html = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(html, /Some additions were confirmed/u);
  assert.match(html, /One product was confirmed/u);
  assert.match(html, /No later product was sent/u);
  assert.doesNotMatch(html, /We could not verify the addition/u);
});
