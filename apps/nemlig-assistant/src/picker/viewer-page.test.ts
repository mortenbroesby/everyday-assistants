import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ProductReviewService,
  type ReviewOperationJournal,
} from "../product-review.js";
import type { ReviewOperation } from "../local-basket.js";
import type { ProductView } from "../product-presentation.js";
import { ProductFacts } from "./components/product.js";
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
    confirmEnd: false,
    continueSubmitted: false,
    submitBlocked: false,
    knownNoWrite: false,
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
    onSaveDraft: noop,
    onUpdateShoppingList: noop,
    onDiscardPendingUpdate: noop,
    onSubmit: noop,
    onConfirmSubmit: noop,
    onContinueSubmitted: noop,
    onInspectBasket: noop,
    onSendFollowUp: noop,
    onRequestEnd: noop,
    onCancelEnd: noop,
    onConfirmEnd: noop,
  },
});

test("shopping-list picker shows native names and product counts without delete", () => {
  const pageProps = props();
  const inventory = [
    {
      basketId: "44",
      nativeShoppingList: true as const,
      shoppingListName: "Family groceries",
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
  assert.match(markup, /Shopping lists/u);
  assert.match(markup, /Family groceries/u);
  assert.match(markup, /4 products/u);
  assert.match(markup, /Open shopping list Family groceries/u);
  assert.match(markup, />Open</u);
  assert.doesNotMatch(markup, />Delete</u);
  assert.doesNotMatch(markup, /Choose a shopping list to continue/u);
  assert.doesNotMatch(markup, /Shopping list options|Choose another/u);
  assert.equal((markup.match(/<h[1-6]/gu) ?? []).length, 1);
});

test("an empty picker offers shopping-list draft starter actions", () => {
  const pageProps = props();
  pageProps.model.screen = { kind: "picker", baskets: [] };
  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, /Start a shopping-list draft/u);
  assert.match(markup, /Plan groceries for the week/u);
  assert.match(markup, /Find ingredients for dinner/u);
  assert.match(markup, /Find a product/u);
  assert.doesNotMatch(markup, /No active shopping lists/u);
  assert.doesNotMatch(markup, /Submit to Nemlig/u);

  pageProps.model.screen = {
    kind: "picker",
    baskets: [],
    selectedBasketId: "12345678-1234-4234-8234-123456789abc",
  };
  const expiredMarkup = renderToStaticMarkup(
    createElement(ViewerPage, pageProps),
  );
  assert.match(expiredMarkup, /saved list is unavailable/u);
  assert.match(expiredMarkup, /Start a shopping-list draft/u);
});

test("only saved Nemlig shopping lists can be submitted to the basket", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen.review.basketId =
    "12345678-1234-4234-8234-123456789abc";
  const localMarkup = renderToStaticMarkup(
    createElement(ViewerPage, pageProps),
  );
  const localSubmit = localMarkup.match(
    /<button[^>]*>[\s\S]*?Submit to Nemlig basket[\s\S]*?<\/button>/u,
  )?.[0];
  assert.ok(localSubmit);
  assert.match(localSubmit, /\sdisabled(?:="")?/u);
  assert.match(
    localMarkup,
    /Open or save a Nemlig shopping list before submitting it/u,
  );

  pageProps.model.screen.review.shoppingListId = 44;
  pageProps.model.screen.review.saveStatus = "saved";
  const savedMarkup = renderToStaticMarkup(
    createElement(ViewerPage, pageProps),
  );
  const savedSubmit = savedMarkup.match(
    /<button[^>]*>[\s\S]*?Submit to Nemlig basket[\s\S]*?<\/button>/u,
  )?.[0];
  assert.ok(savedSubmit);
  assert.doesNotMatch(savedSubmit, /\sdisabled(?:="")?/u);
});

test("partial save offers an explicit review of the provider-confirmed subset", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  Object.assign(pageProps.model.screen.review, {
    draftId: "draft-1",
    shoppingListId: 44,
    saveStatus: "partial",
    saveProgress: { completed: 1, total: 2 },
  });
  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, /Save progress: 1 of 2 products/u);
  assert.match(markup, /Products that did not save will be left out/u);
  assert.match(markup, />Review saved products only<\/button>/u);
  assert.match(markup, />Resume saving<\/button>/u);
  const submit = markup.match(
    /<button[^>]*>[\s\S]*?Save list before review<\/button>/u,
  )?.[0];
  assert.ok(submit);
  assert.match(submit, /\sdisabled(?:="")?/u);
});

test("interrupted updates show current rows separately from pending rows", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen.review = {
    ...pageProps.model.screen.review,
    shoppingListId: 44,
    shoppingListName: "Family",
    updateStatus: "partial",
    shoppingListDirty: true,
    conflictItems: [
      {
        product_id: 7,
        quantity: 1,
        state: "ready",
        view: product,
      },
    ],
  };
  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, /Current Nemlig shopping list/u);
  assert.match(markup, /Discard pending changes and use current list/u);
  assert.match(
    markup,
    /These current rows may differ from the pending changes below/u,
  );
});

test("retired deleted-list updates show the next recovery action", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen.review = {
    destination: "ready",
    items: [],
    actionNotice:
      "This shopping list was deleted in Nemlig. Its pending update was retired; choose another list or start a draft.",
  };
  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, /deleted in Nemlig/u);
  assert.match(markup, /choose another list or start a draft/u);
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
  assert.doesNotMatch(markup, />Submit to Nemlig basket<\/button>/u);
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
  assert.match(withFixture, /<h1[^>]*id="title"[^>]*>Shopping list<\/h1>/u);
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
    /aria-label="Use Alternative yoghurt as the alternative"/u,
  );
  assert.match(markup, /alternative-select-action/u);
  assert.match(markup, /aria-label="Show details for Alternative yoghurt"/u);
  assert.doesNotMatch(markup, /product-comparison-details/u);
  assert.doesNotMatch(markup, /Use selected alternative/u);
  assert.match(markup, /Back to shopping list/u);
  assert.doesNotMatch(markup, />Clear</u);
});

test("shared viewer page retains a supplied image for an equivalent fixture view", () => {
  const equivalentProduct: ProductView = {
    ...product,
    product: { ...product.product },
  };
  const pageProps = props("/assets/yoghurt.svg");
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen.review = {
    ...pageProps.model.screen.review,
    items: [
      {
        ...pageProps.model.screen.review.items[0]!,
        view: equivalentProduct,
      },
    ],
  };
  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, /src="\/assets\/yoghurt\.svg"/u);
  assert.doesNotMatch(markup, /data-viewer-component="image-fallback"/u);
});

test("full-screen product facts use one visible Nemlig-style information tab", () => {
  const detailedProduct: ProductView = {
    ...product,
    product: {
      ...product.product,
      description: "A creamy fixture yoghurt.",
      declaration: "MILK.",
      details: [{ key: "Origin", value: "Denmark" }],
    },
  };
  const markup = renderToStaticMarkup(
    createElement(ProductFacts, { view: detailedProduct, variant: "tabs" }),
  );
  assert.match(markup, /role="tablist"/u);
  assert.match(markup, /aria-orientation="vertical"/u);
  assert.match(markup, /aria-selected="true"/u);
  assert.match(markup, /A creamy fixture yoghurt./u);
  assert.doesNotMatch(markup, /<details/u);
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
    />Submit to Nemlig basket<\/button>/u,
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
      /<button[^>]*disabled=""[^>]*>.*Submit to Nemlig basket<\/button>/u,
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
    />Submit to Nemlig basket<\/button>/u,
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
  assert.match(missingMarkup, />Submit to Nemlig basket<\/button>/u);
  assert.match(
    missingMarkup,
    /Products Nemlig confirms are unavailable will be skipped/u,
  );
});

test("dirty native shopping-list edits require Update before Submit", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen = {
    ...pageProps.model.screen,
    review: {
      ...pageProps.model.screen.review,
      shoppingListId: 44,
      shoppingListDirty: true,
    },
  };
  const html = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(html, />Update shopping list<\/button>/u);
  assert.match(html, /Update the saved shopping list before submitting it/u);
  assert.doesNotMatch(
    html,
    /Basket submission is unavailable while we verify/u,
  );
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*>.*Submit to Nemlig basket<\/button>/u,
  );
});

test("a clean or reviewed partial native-list update can resume, but an uncertain one cannot", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  const review = pageProps.model.screen.review;
  pageProps.model.screen = {
    ...pageProps.model.screen,
    review: {
      ...review,
      shoppingListId: 44,
      shoppingListDirty: true,
      updateStatus: "partial",
      conflictItems: review.items,
      actionNotice: "Pending change is preserved.",
    },
  };
  const recoverable = renderToStaticMarkup(
    createElement(ViewerPage, pageProps),
  );
  assert.match(recoverable, />Resume update<\/button>/u);
  assert.doesNotMatch(
    recoverable,
    /<button[^>]*disabled=""[^>]*>Resume update<\/button>/u,
  );

  pageProps.model.screen = {
    ...pageProps.model.screen,
    review: {
      ...review,
      shoppingListId: 44,
      shoppingListDirty: true,
      updateStatus: "partial",
    },
  };
  const cleanRecovery = renderToStaticMarkup(
    createElement(ViewerPage, pageProps),
  );
  assert.match(cleanRecovery, />Resume update<\/button>/u);
  assert.doesNotMatch(
    cleanRecovery,
    /<button[^>]*disabled=""[^>]*>Resume update<\/button>/u,
  );

  pageProps.model.screen = {
    ...pageProps.model.screen,
    review: {
      ...pageProps.model.screen.review,
      updateStatus: "uncertain",
      conflictItems: undefined,
    },
  };
  const uncertain = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(
    uncertain,
    /<button[^>]*disabled=""[^>]*>Update shopping list<\/button>/u,
  );
});

test("a recovered native-list review exposes and runs its Resume update action", async () => {
  const pageProps = props();
  const native = {
    id: 44,
    name: "Family",
    items: [{ productId: 7, quantity: 1 }],
  };
  let operation: ReviewOperation = {
    operationId: "native-list-update:44",
    generation: "update-generation-1",
    accountIdentity: "account-1",
    kind: "update",
    name: "Family",
    listId: 44,
    baseline: [{ productId: 7, quantity: 1 }],
    items: [{ productId: 7, quantity: 2 }],
  };
  const journal: ReviewOperationJournal = {
    read: async () => structuredClone(operation),
    claim: async () => false,
    write: async (next) => {
      operation = structuredClone(next);
    },
    complete: async () => {
      operation = { ...operation, completedUntil: Date.now() + 7_200_000 };
    },
  };
  const service = new ProductReviewService({
    getProduct: async (id) => ({
      id,
      name: "Fixture yoghurt",
      price: 10,
      unitPrice: 20,
      unit: "kr/kg",
      unitSize: "500 g",
      brand: "Fixture",
      category: "",
      subcategory: "",
      imageUrl: "",
      available: true,
      labels: [],
      isOrganic: false,
      isFrozen: false,
      isRefrigerated: false,
      isDairy: true,
      isLactoseFree: false,
      isGlutenFree: false,
      isVegan: false,
      isOnDiscount: false,
    }),
    searchProducts: async () => [],
    providerIdentity: () => "account-1",
    listShoppingLists: async () => [{ id: 44, name: "Family" }],
    getShoppingList: async () => structuredClone(native),
    updateShoppingListProduct: async (_id, productId, quantity) => {
      native.items = native.items.filter(
        (item) => item.productId !== productId,
      );
      if (quantity > 0) {
        native.items.push({ productId, quantity });
      }
    },
  });
  const recovered = await service.openShoppingList(
    "owner",
    44,
    undefined,
    journal,
  );
  assert.equal(recovered.updateStatus, "partial");
  assert.equal(recovered.conflictItems?.[0]?.quantity, 1);
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen = {
    ...pageProps.model.screen,
    review: recovered,
  };
  let updateResult: ReturnType<typeof service.updateShoppingList> | undefined;
  pageProps.actions.onUpdateShoppingList = () => {
    updateResult = service.updateShoppingList(
      "owner",
      44,
      { kind: "update" },
      undefined,
      journal,
    );
  };

  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, />Resume update<\/button>/u);
  assert.doesNotMatch(
    markup,
    /<button[^>]*disabled=""[^>]*>Resume update<\/button>/u,
  );
  pageProps.actions.onUpdateShoppingList();
  assert.equal((await updateResult)?.saveStatus, "saved");
  assert.deepEqual(native.items, [{ productId: 7, quantity: 2 }]);
  assert.ok(operation.completedUntil);
});

test("busy prepared submission exposes one disabled submit action", () => {
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

  const html = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(html, /Estimated product total:/u);
  assert.match(html, /Prices may change/u);
  const submitButton = html.match(
    /<button[^>]*>Submit [^<]+Nemlig basket<\/button>/u,
  )?.[0];
  assert.ok(submitButton, "prepared submission did not render Submit");
  assert.match(submitButton, /disabled=""/u);
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
  pageProps.model.knownNoWrite = true;
  pageProps.model.message =
    "A basket safety check stopped the addition before any product was sent.";

  const html = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(html, /Addition stopped before sending/u);
  assert.match(html, /stopped the addition before any product was sent/u);
  assert.match(html, /The known result is that no product was sent/u);
  assert.doesNotMatch(html, /prior addition may have reached Nemlig/u);
  assert.match(html, /cannot be retried/u);
  assert.match(html, /Inspect Nemlig basket in conversation/u);
});

test("a submission fence without a known no-write result stays uncertain", () => {
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
  pageProps.model.message = "The host did not confirm the addition.";

  const html = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(html, /A previous addition needs checking/u);
  assert.match(html, /A prior addition may have reached Nemlig/u);
  assert.doesNotMatch(html, /Addition stopped before sending/u);
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
    cleanup_warning: "Temporary shopping-list deletion could not be confirmed.",
  };
  pageProps.model.screen.review.submissionAttempted = true;
  pageProps.model.submitBlocked = true;
  const html = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(html, /No products were added/u);
  assert.match(html, /Unavailable products were skipped: Banan/u);
  assert.match(
    html,
    /Temporary shopping-list deletion could not be confirmed/u,
  );
  assert.doesNotMatch(html, /Only the prepared products were added/u);
  assert.doesNotMatch(html, /A previous addition needs checking/u);
  assert.match(html, /Choose another shopping list/u);
  assert.doesNotMatch(html, /Continue with shopping list/u);
});
