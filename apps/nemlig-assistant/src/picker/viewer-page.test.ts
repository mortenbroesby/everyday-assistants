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
    baskets: [],
    selectedBasketId: undefined,
  },
  actions: {
    onNavigate: noop,
    onFactExpandedChange: noop,
    onRefresh: noop,
    onOpenPicker: noop,
    onSelectBasket: noop,
    onDeleteBasket: noop,
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

test("basket picker shows only a compact prefix, activity date, and product count", () => {
  const pageProps = props();
  const inventory = [
    {
      basketId: "12345678-1234-4234-8234-123456789abc",
      createdAt: Date.parse("2026-10-01T10:00:00.000Z"),
      lastActivityAt: Date.parse("2026-10-09T10:00:00.000Z"),
      expiresAt: Date.parse("2026-10-10T10:00:00.000Z"),
      revision: 3,
      productCount: 4,
      submissionAttempted: false,
    },
  ];
  pageProps.model.screen = {
    kind: "picker",
    baskets: inventory,
  };
  pageProps.model.baskets = inventory;
  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, /Local baskets/u);
  assert.match(markup, /Basket 12345678/u);
  assert.match(markup, /4 unique products/u);
  assert.doesNotMatch(markup, /12345678-1234-4234-8234-123456789abc/u);
  assert.match(markup, />Open</u);
  assert.match(markup, />Delete</u);
  assert.doesNotMatch(markup, /Choose a Local basket to continue/u);
  assert.doesNotMatch(markup, /Local basket options|Choose basket/u);
  assert.equal((markup.match(/<h[1-6]/gu) ?? []).length, 1);
});

test("an unavailable old card offers picker recovery without an implicit selection", () => {
  const pageProps = props();
  pageProps.model.screen = { kind: "picker", baskets: [] };
  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, /No active Local baskets/u);
  assert.match(markup, /Start one in conversation/u);
  assert.doesNotMatch(markup, /Submit to Nemlig/u);
});

test("a recovered submission fence explains the uncertainty without inventing an id", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen.review = {
    ...pageProps.model.screen.review,
    basketId: "12345678-1234-4234-8234-123456789abc",
    submissionAttempted: true,
  };
  pageProps.model.selectedBasketId = "12345678-1234-4234-8234-123456789abc";
  pageProps.model.submitBlocked = true;
  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, /A previous addition needs checking/u);
  assert.match(markup, /may have reached Nemlig/u);
  assert.doesNotMatch(markup, /synthetic-submission|fixture-submission/u);
  assert.doesNotMatch(markup, />Submit to Nemlig<\/button>/u);
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
  assert.match(withFixture, /Show details for Fixture yoghurt/u);
  assert.match(withFixture, /swipe from right to left for actions/u);
  assert.doesNotMatch(withFixture, /Actions for Fixture yoghurt/u);
  assert.match(withFixture, /aria-expanded="false"/u);
  assert.doesNotMatch(
    withFixture,
    /data-viewer-component="product-summary"[^>]*aria-expanded/u,
  );
  assert.doesNotMatch(withFixture, /hold a product/u);
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

  const unavailable = {
    context: "review",
    status: "unavailable",
    product_id: 7,
  } satisfies ProductView;
  for (const view of [unavailable] satisfies ProductView[]) {
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
    assert.match(markup, /Resolve products with missing details/u);
  }
  pageProps.model.screen = {
    kind: "review",
    active: true,
    review: {
      ...review,
      items: [
        {
          ...review.items[0]!,
          view: {
            ...product,
            product: { ...product.product, price: undefined },
          },
        },
      ],
    },
  };
  assert.match(
    renderToStaticMarkup(createElement(ViewerPage, pageProps)),
    />Submit to Nemlig<\/button>/u,
  );
  pageProps.model.screen = {
    kind: "review",
    active: true,
    review: {
      ...review,
      items: [{ ...review.items[0]!, view: { ...unavailable, missing: true } }],
    },
  };
  const missingMarkup = renderToStaticMarkup(
    createElement(ViewerPage, pageProps),
  );
  assert.match(missingMarkup, />Submit to Nemlig<\/button>/u);
  assert.match(
    missingMarkup,
    /Products Nemlig confirms are unavailable will be skipped/u,
  );
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
  assert.match(html, /Estimated product total:/u);
  assert.match(html, /Prices may change/u);
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
      submissionAttempted: true,
      submission: {
        status: "partial",
        submission_id: "fixture-submission",
        verified_additions: 1,
        review: {},
      },
    },
  };
  pageProps.model.submitBlocked = true;

  const html = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(html, /Some additions were confirmed/u);
  assert.match(html, /One product was confirmed/u);
  assert.match(html, /No later product was sent/u);
  assert.doesNotMatch(html, /We could not verify the addition/u);
  assert.doesNotMatch(html, /A previous addition needs checking/u);
});

test("a stopped submission explains the known reason and next step", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen.review.submission = {
    status: "uncertain",
    submission_id: "fixture-submission",
    review: {},
  };
  pageProps.model.screen.review.submissionAttempted = true;
  pageProps.model.message =
    "Nemlig's basket could not be read before the next addition. No product was sent.";

  const html = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(html, /Addition stopped before sending/u);
  assert.match(html, /basket could not be read/u);
  assert.match(html, /The known result is that no product was sent/u);
  assert.doesNotMatch(html, /prior addition may have reached Nemlig/u);
  assert.match(html, /cannot be retried/u);
  assert.match(html, /Inspect Nemlig basket in conversation/u);
});

test("a submitted basket names skipped products without claiming they were added", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen.review.submission = {
    status: "submitted",
    submission_id: "fixture-submission",
    review: {},
    verified_additions: 0,
    skipped_products: [{ product_id: 7, name: "Banan" }],
  };
  pageProps.model.screen.review.submissionAttempted = true;
  pageProps.model.submitBlocked = true;
  const html = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(html, /No products were added/u);
  assert.match(html, /Unavailable products were skipped: Banan/u);
  assert.doesNotMatch(html, /Only the prepared products were added/u);
  assert.doesNotMatch(html, /A previous addition needs checking/u);
  assert.match(html, /Choose another Local basket/u);
  assert.doesNotMatch(html, /Continue with Local basket/u);
});
