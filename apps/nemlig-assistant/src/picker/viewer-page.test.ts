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
    continueSubmitted: false,
    submitBlocked: false,
    knownNoWrite: false,
    submitErrorOpen: false,
    baskets: [],
    selectedBasketId: undefined,
  },
  actions: {
    onNavigate: noop,
    onFactExpandedChange: noop,
    onRefresh: noop,
    onOpenPicker: noop,
    onAbandonDraft: noop,
    onSaveCurrentBasketAsShoppingList: noop,
    onSelectBasket: noop,
    onQuantity: noop,
    onRemove: noop,
    onOpenAlternatives: noop,
    onSearchAlternatives: noop,
    onReplace: noop,
    onDiscardPendingUpdate: noop,
    onUseConfirmedProducts: noop,
    onSubmit: noop,
    onConfirmSubmit: noop,
    onContinueSubmitted: noop,
    onInspectBasket: noop,
    onDismissSubmitError: noop,
    onSendFollowUp: noop,
  },
});

test("direct basket review offers explicit submit and describes its temporary draft", () => {
  const direct = props();
  if (direct.model.screen.kind !== "review") {
    throw new Error("Expected review fixture");
  }
  direct.model.screen.review = {
    ...direct.model.screen.review,
    basketMode: "direct-basket",
    draftId: "11111111-1111-4111-8111-111111111111",
    reviewContextId: "22222222-2222-4222-8222-222222222222",
  };
  const markup = renderToStaticMarkup(createElement(ViewerPage, direct));
  assert.match(markup, /Temporary basket draft/u);
  assert.match(
    markup,
    /Edits stay in this temporary draft until you explicitly submit/u,
  );
  assert.match(markup, />Add to Nemlig basket<\/button>/u);
  assert.doesNotMatch(markup, /Choose another shopping list/u);
  assert.doesNotMatch(markup, /Save current basket as shopping list/u);
});

test("a confirmed direct addition offers saving the whole current basket separately", () => {
  const direct = props();
  if (direct.model.screen.kind !== "review") {
    throw new Error("Expected review fixture");
  }
  direct.model.screen.review = {
    ...direct.model.screen.review,
    basketMode: "direct-basket",
    draftId: "11111111-1111-4111-8111-111111111111",
    reviewContextId: "22222222-2222-4222-8222-222222222222",
    submission: {
      status: "submitted",
      submission_id: "33333333-3333-4333-8333-333333333333",
      review: {},
    },
  };
  const markup = renderToStaticMarkup(createElement(ViewerPage, direct));
  assert.match(markup, />Save current basket as shopping list<\/button>/u);
  assert.match(markup, /Nemlig confirmed the addition/u);
});

test("basket save success and uncertainty remain separate from the addition", () => {
  const direct = props();
  if (direct.model.screen.kind !== "review") {
    throw new Error("Expected review fixture");
  }
  direct.model.screen.review = {
    ...direct.model.screen.review,
    basketMode: "direct-basket",
    draftId: "11111111-1111-4111-8111-111111111111",
    reviewContextId: "22222222-2222-4222-8222-222222222222",
    submission: {
      status: "submitted",
      submission_id: "33333333-3333-4333-8333-333333333333",
      review: {},
    },
    actionNotice:
      "Basket save may have completed. Inspect saved shopping lists; this action cannot be retried.",
  };
  const markup = renderToStaticMarkup(createElement(ViewerPage, direct));
  assert.match(markup, /Nemlig confirmed the addition/u);
  assert.match(markup, /Basket save may have completed/u);
  assert.match(markup, /Inspect saved shopping lists/u);
  assert.doesNotMatch(markup, /Save current basket as shopping list/u);

  direct.model.screen.review.actionNotice =
    "Basket save was not sent. Anti-forgery state could not be prepared; no provider write was sent.";
  const notSentMarkup = renderToStaticMarkup(createElement(ViewerPage, direct));
  assert.match(notSentMarkup, /Nemlig confirmed the addition/u);
  assert.match(notSentMarkup, /Basket save was not sent/u);
  assert.match(notSentMarkup, /Save current basket as shopping list/u);
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

test("an empty picker offers temporary-draft starter actions", () => {
  const pageProps = props();
  pageProps.model.screen = { kind: "picker", baskets: [] };
  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, /Start a grocery draft/u);
  assert.match(markup, /Chosen products stay in a temporary draft/u);
  assert.match(markup, /Only an explicit Submit adds the approved/u);
  assert.match(markup, /draft edits do not change them/u);
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
  assert.match(expiredMarkup, /That Nemlig shopping list is unavailable/u);
  assert.match(expiredMarkup, /Start a grocery draft/u);
});

test("only confirmed native shopping lists can be added to the basket", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen.review.shoppingListId = 44;
  pageProps.model.screen.review.saveStatus = "saved";
  const savedMarkup = renderToStaticMarkup(
    createElement(ViewerPage, pageProps),
  );
  const savedSubmit = savedMarkup.match(
    /<button[^>]*>[\s\S]*?Add to Nemlig basket[\s\S]*?<\/button>/u,
  )?.[0];
  assert.ok(savedSubmit);
  assert.doesNotMatch(savedSubmit, /\sdisabled(?:="")?/u);
});

test("pending quantity edits are labeled until Nemlig confirms them", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen.review.shoppingListId = 44;
  pageProps.model.screen.review.saveStatus = "saved";
  pageProps.model.pendingQuantities = new Map([[7, 2]]);

  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));

  assert.match(
    markup,
    /Quantity change pending; waiting for Nemlig to confirm it/u,
  );
  assert.match(markup, /2 ×/u);
  assert.match(markup, /Add to Nemlig basket/u);
});

test("loading and provider operations show accessible progress without hiding the list", () => {
  const pageProps = props();
  pageProps.model.busy = true;
  pageProps.model.message =
    "Saving quantity change to your Nemlig shopping list…";
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen.review.shoppingListId = 44;
  pageProps.model.screen.review.saveStatus = "saved";

  const busyMarkup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(busyMarkup, /role="status"[^>]*aria-live="polite"/u);
  assert.match(busyMarkup, /progress-spinner/u);
  assert.match(busyMarkup, /<main[^>]*aria-busy="true"/u);
  assert.match(
    busyMarkup,
    /Saving quantity change to your Nemlig shopping list/u,
  );
  assert.match(busyMarkup, /Fixture yoghurt/u);
  const submit = busyMarkup.match(
    /<button[^>]*>[\s\S]*?Add to Nemlig basket[\s\S]*?<\/button>/u,
  )?.[0];
  assert.ok(submit);
  assert.match(submit, /\sdisabled(?:="")?/u);

  pageProps.model.busy = false;
  pageProps.model.screen = { kind: "loading" };
  const loadingMarkup = renderToStaticMarkup(
    createElement(ViewerPage, pageProps),
  );
  assert.match(loadingMarkup, /Loading your Nemlig shopping list/u);
  assert.match(loadingMarkup, /progress-spinner/u);
  assert.match(loadingMarkup, /<main[^>]*aria-busy="true"/u);
});

test("partial native creation offers an exact-list review and blocks basket addition", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  Object.assign(pageProps.model.screen.review, {
    shoppingListId: 44,
    saveStatus: "partial",
    saveProgress: { completed: 1, total: 2 },
  });
  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, /Nemlig confirmed only the products shown below/u);
  assert.match(markup, />Review products currently in the list<\/button>/u);
  const submit = markup.match(
    /<button[^>]*>[\s\S]*?Add to Nemlig basket<\/button>/u,
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

test("a deleted native list directs the user to select another exact list", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen.review = {
    destination: "ready",
    items: [],
    actionNotice:
      "This shopping list was deleted in Nemlig. Choose another list or create a new list in conversation.",
  };
  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, /deleted in Nemlig/u);
  assert.match(markup, /Choose another list or create a new list/u);
});

test("a recovered submission fence explains the uncertainty without inventing an id", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen.review = {
    ...pageProps.model.screen.review,
    shoppingListId: 44,
    shoppingListName: "Synthetic saved list",
    reviewContextId: "12345678-1234-4234-8234-123456789def",
    saveStatus: "saved",
    submissionAttempted: true,
  };
  pageProps.model.selectedBasketId = "44";
  pageProps.model.submitBlocked = true;
  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, /A previous addition needs checking/u);
  assert.match(markup, /may have reached Nemlig/u);
  assert.doesNotMatch(markup, /synthetic-submission|fixture-submission/u);
  assert.doesNotMatch(markup, />Add to Nemlig basket<\/button>/u);
});

test("native-list recovery keeps the latest rows visible and blocks basket addition", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen.review = {
    ...pageProps.model.screen.review,
    items: pageProps.model.screen.review.items.map((item) => ({
      ...item,
      quantity: 3,
    })),
    shoppingListId: 44,
    saveStatus: "uncertain",
    updateStatus: "uncertain",
    actionNotice:
      "Nemlig did not confirm the current list. Refresh this exact list before continuing.",
  };
  pageProps.model.presentationDestination = "ready";

  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));

  assert.match(markup, /Refresh this exact list/u);
  assert.match(markup, /Fixture yoghurt/u);
  assert.match(markup, />3 ×</u);
  assert.match(markup, /disabled=""[^>]*>.*Add to Nemlig basket/u);
  assert.doesNotMatch(markup, /Request cancelled/u);
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
  assert.match(withFixture, /Tap a product for details, or press and hold/u);
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
    />Add to Nemlig basket<\/button>/u,
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
      /<button[^>]*disabled=""[^>]*>.*Add to Nemlig basket<\/button>/u,
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
    />Add to Nemlig basket<\/button>/u,
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
  assert.match(missingMarkup, />Add to Nemlig basket<\/button>/u);
  assert.match(
    missingMarkup,
    /Products Nemlig confirms are unavailable will be skipped/u,
  );
});

test("native shopping-list edits do not expose a manual Update step", () => {
  const pageProps = props();
  if (pageProps.model.screen.kind !== "review") {
    throw new Error("review fixture missing");
  }
  pageProps.model.screen = {
    ...pageProps.model.screen,
    review: {
      ...pageProps.model.screen.review,
      shoppingListId: 44,
      saveStatus: "saved",
      shoppingListDirty: true,
    },
  };
  const html = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.doesNotMatch(html, />Update shopping list<\/button>/u);
  assert.doesNotMatch(
    html,
    /Update the saved shopping list before submitting it/u,
  );
  assert.doesNotMatch(
    html,
    /Basket submission is unavailable while we verify/u,
  );
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*>.*Add to Nemlig basket<\/button>/u,
  );
});

test("partial native-list updates expose discard recovery without a replay action", () => {
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
  assert.match(recoverable, /Discard pending changes and use current list/u);
  assert.doesNotMatch(recoverable, /Resume update|Update shopping list/u);

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
  assert.doesNotMatch(cleanRecovery, /Resume update|Update shopping list/u);

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
    /<button[^>]*disabled=""[^>]*>.*Add to Nemlig basket<\/button>/u,
  );
});

test("a recovered native-list review exposes and runs explicit discard recovery", async () => {
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
  pageProps.actions.onDiscardPendingUpdate = () => {
    updateResult = service.updateShoppingList(
      "owner",
      44,
      { kind: "discard_pending_update" },
      undefined,
      journal,
    );
  };

  const markup = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(markup, /Discard pending changes and use current list/u);
  assert.doesNotMatch(markup, /Resume update|Update shopping list/u);
  pageProps.actions.onDiscardPendingUpdate();
  assert.equal((await updateResult)?.updateStatus, undefined);
  assert.deepEqual(native.items, [{ productId: 7, quantity: 1 }]);
  assert.ok(operation.completedUntil);
});

test("pending prepared submission shows progress while keeping replay fenced", () => {
  const pageProps = props();
  assert.equal(pageProps.model.screen.kind, "review");
  if (pageProps.model.screen.kind !== "review") {
    return;
  }
  pageProps.model.screen = {
    ...pageProps.model.screen,
    review: {
      ...pageProps.model.screen.review,
      shoppingListId: 44,
      saveStatus: "saved",
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
  pageProps.model.submitBlocked = true;

  const html = renderToStaticMarkup(createElement(ViewerPage, pageProps));
  assert.match(html, /Estimated product total:/u);
  assert.match(html, /Prices may change/u);
  assert.match(html, /Adding the reviewed products to your Nemlig basket/u);
  assert.doesNotMatch(html, /Submit 0 products to Nemlig basket/u);
  assert.doesNotMatch(html, /We could not verify the addition/u);
  assert.doesNotMatch(
    html,
    /Inspect the actual Nemlig basket in conversation/u,
  );
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
  assert.match(html, /Choose saved shopping lists/u);
  assert.doesNotMatch(html, /Continue with shopping list/u);
});
