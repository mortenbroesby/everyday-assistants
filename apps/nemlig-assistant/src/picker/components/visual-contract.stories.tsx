import type { Meta, StoryObj } from "@storybook/react-vite";
import { type Dispatch, type SetStateAction, useState } from "react";
import { appTab, embeddedConversation } from "../../../.storybook/preview.js";
import type { ProductView } from "../../product-presentation.js";
import type {
  Review,
  ViewerPageActions,
  ViewerPageModel,
  ViewerPageProps,
  ViewerScreen,
} from "../viewer-page.js";
import { ViewerPage } from "../viewer-page.js";
import {
  alternativesFor,
  removeItem,
  replaceWithAlternative,
  updateQuantity,
} from "./visual-contract.fixture.js";

const dairyMilk = new URL(
  "../fixtures/storybook-dairy-milk.png",
  import.meta.url,
).href;
const lasagneSheets = new URL(
  "../fixtures/storybook-lasagne-sheets.png",
  import.meta.url,
).href;
const oatMilkCarton = new URL(
  "../fixtures/storybook-oat-milk.png",
  import.meta.url,
).href;
const butterPackage = new URL(
  "../fixtures/storybook-butter.svg",
  import.meta.url,
).href;
const tomatoesCan = new URL(
  "../fixtures/storybook-tomatoes.svg",
  import.meta.url,
).href;
const unavailable: ProductView = {
  context: "review",
  status: "unavailable",
  product_id: 99,
};
const milk: ProductView = {
  context: "review",
  status: "complete",
  product: {
    id: 1,
    name: "Arla ØKO Minimælk",
    brand: "Arla",
    unit_size: "1 L",
    price: 12.95,
    unit_price: 12.95,
    unit: "kr/L",
    currency: "DKK",
    description: "Økologisk minimælk til morgenmad, kaffe og madlavning.",
    declaration: "MÆLK, 1,5 % fedt.",
    details: [
      { key: "Oprindelsesland", value: "Danmark" },
      { key: "Opbevaring", value: "Opbevares køligt" },
    ],
    available: true,
    is_organic: true,
    is_frozen: false,
    is_on_discount: true,
    image_url: undefined,
    labels: ["Økologisk", "Tilbud"],
    tags: ["organic"],
  },
  review: { kind: "review", quantity: 2, line_total: 25.9, approved: false },
};
const pasta: ProductView = {
  context: "review",
  status: "complete",
  product: {
    id: 2,
    name: "Lasagneplader øko.",
    brand: "Grøn Balance",
    unit_size: "500 g",
    price: 23.95,
    unit_price: 47.9,
    unit: "kr/Kg.",
    currency: "DKK",
    description: "Økologiske lasagneplader af durumhvede til ovnbagte retter.",
    declaration: "Durumhvede, vand.",
    details: [{ key: "Tilberedning", value: "Tilberedes efter anvisning" }],
    available: true,
    is_organic: true,
    is_frozen: false,
    is_on_discount: false,
    image_url: undefined,
    labels: [],
    tags: [],
  },
  review: { kind: "review", quantity: 1, line_total: 23.95, approved: false },
};
const oatMilk: ProductView = {
  context: "review",
  status: "complete",
  product: {
    id: 3,
    name: "Havredrik øko.",
    brand: "Naturli'",
    unit_size: "1 L",
    price: 19.95,
    unit_price: 19.95,
    unit: "kr/L",
    currency: "DKK",
    description: "Økologisk havredrik med mild smag til kaffe og morgenmad.",
    declaration: "Vand, havre, rapsolie, salt.",
    details: [{ key: "Opbevaring", value: "Opbevares køligt efter åbning" }],
    available: true,
    is_organic: true,
    is_frozen: false,
    is_on_discount: false,
    image_url: undefined,
    labels: ["Økologisk"],
    tags: ["organic"],
  },
  review: { kind: "review", quantity: 1, line_total: 19.95, approved: false },
};
const butter: ProductView = {
  context: "review",
  status: "complete",
  product: {
    id: 4,
    name: "Lurpak Smørbar",
    brand: "Lurpak",
    unit_size: "200 g",
    price: 24.95,
    unit_price: 124.75,
    unit: "kr/Kg.",
    currency: "DKK",
    description: "Smørbar blanding til brød og madlavning.",
    declaration: "SMØR, rapsolie, vand, salt.",
    details: [{ key: "Opbevaring", value: "Opbevares køligt" }],
    available: true,
    is_organic: false,
    is_frozen: false,
    is_on_discount: false,
    image_url: undefined,
    labels: [],
    tags: [],
  },
  review: { kind: "review", quantity: 1, line_total: 24.95, approved: false },
};
const tomatoes: ProductView = {
  context: "review",
  status: "complete",
  product: {
    id: 5,
    name: "Hakkede tomater",
    brand: "Mutti",
    unit_size: "400 g",
    price: 11.95,
    unit_price: 29.88,
    unit: "kr/Kg.",
    currency: "DKK",
    description: "Hakkede italienske tomater til sauce og supper.",
    declaration: "Tomater, tomatjuice, salt.",
    details: [{ key: "Oprindelsesland", value: "Italien" }],
    available: true,
    is_organic: false,
    is_frozen: false,
    is_on_discount: false,
    image_url: undefined,
    labels: [],
    tags: [],
  },
  review: { kind: "review", quantity: 2, line_total: 23.9, approved: false },
};
const review: Review = {
  destination: "ready",
  items: [
    { product_id: 1, quantity: 2, state: "ready", view: milk },
    { product_id: 2, quantity: 1, state: "ready", view: pasta },
    { product_id: 3, quantity: 1, state: "ready", view: oatMilk },
    { product_id: 4, quantity: 1, state: "ready", view: butter },
    { product_id: 5, quantity: 2, state: "ready", view: tomatoes },
  ],
  alternatives: { product_id: 1, query: "minimælk", views: [milk, pasta] },
};
const longBasket: Review = {
  ...review,
  items: Array.from({ length: 12 }, (_, index) => ({
    ...review.items[index % review.items.length]!,
    product_id: index + 1,
  })),
};
const walkthroughReview: Review = {
  ...review,
  alternatives: { product_id: 1, query: "havredrik", views: [oatMilk] },
};
const legacyMixedReview: Review = {
  ...review,
  items: [review.items[0]!, { ...review.items[1]!, state: "needs-review" }],
};
const walkthroughAlternatives = new Map<number, ProductView[]>([
  [1, [oatMilk, pasta]],
  [3, [milk, pasta]],
]);
const preparedReview: Review = {
  ...review,
  destination: "ready",
  submission: {
    status: "prepared",
    submission_id: "storybook-submission",
    review: {
      lines: [
        {
          product_id: 1,
          quantity: 2,
          name: "Arla ØKO Minimælk",
          item_price: 12.95,
          line_total: 25.9,
        },
        {
          product_id: 2,
          quantity: 1,
          name: "Lasagneplader øko.",
          item_price: 23.95,
          line_total: 23.95,
        },
      ],
      expected_products_price: 49.85,
    },
  },
};
const submittedReview: Review = {
  ...preparedReview,
  submission: { ...preparedReview.submission!, status: "submitted" },
};
const uncertainReview: Review = {
  ...preparedReview,
  submission: { ...preparedReview.submission!, status: "uncertain" },
};
const noop = () => undefined;
type StoryOverrides = {
  model?: Partial<ViewerPageModel>;
  actions?: Partial<ViewerPageActions>;
};

const baseProps = (
  screen: ViewerScreen,
  overrides: StoryOverrides = {},
): ViewerPageProps => ({
  model: {
    screen,
    reviewDisclosures: new Map(),
    pendingQuantities: new Map(),
    thumbnails: new Map([
      [milk, dairyMilk],
      [pasta, lasagneSheets],
      [oatMilk, oatMilkCarton],
      [butter, butterPackage],
      [tomatoes, tomatoesCan],
    ]),
    message: "",
    busy: false,
    continueSubmitted: false,
    submitBlocked: false,
    knownNoWrite: false,
    submitErrorOpen: false,
    baskets: screen.kind === "picker" ? screen.baskets : [],
    selectedBasketId: undefined,
    ...overrides.model,
  },
  actions: {
    onNavigate: noop,
    onFactExpandedChange: noop,
    onRefresh: noop,
    onOpenPicker: noop,
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
    ...overrides.actions,
  },
});

// Provides explicit Storybook-only host feedback without changing production callbacks.
// fallow-ignore-next-line complexity
function FixturePage({
  screen,
  overrides = {},
}: {
  screen: ViewerScreen;
  overrides?: StoryOverrides;
}) {
  const [hostMessage, setHostMessage] = useState("");
  const [activeScreen, setActiveScreen] = useState(screen);
  const [localBaskets] = useState(
    overrides.model?.baskets ??
      (screen.kind === "picker" ? screen.baskets : []),
  );
  const props = baseProps(screen, {
    ...overrides,
    model: {
      ...overrides.model,
      screen: activeScreen,
      baskets: localBaskets,
    },
    actions: {
      ...overrides.actions,
      onOpenPicker:
        overrides.actions?.onOpenPicker ??
        (() => {
          setActiveScreen({
            kind: "picker",
            baskets: localBaskets,
            selectedBasketId:
              activeScreen.kind === "review"
                ? activeScreen.review.shoppingListId === undefined
                  ? undefined
                  : String(activeScreen.review.shoppingListId)
                : undefined,
          });
          setHostMessage("Storybook opened the Nemlig shopping-list picker.");
        }),
      onSelectBasket:
        overrides.actions?.onSelectBasket ??
        ((basketId) => {
          setActiveScreen({
            kind: "review",
            review: {
              ...review,
              shoppingListId: Number(basketId),
              shoppingListName: localBaskets.find(
                (list) => list.basketId === basketId,
              )?.shoppingListName,
              reviewContextId: "12345678-1234-4234-8234-123456789def",
              saveStatus: "saved",
              submissionAttempted: false,
              submission: undefined,
            },
            active: true,
          });
          setHostMessage(`Storybook opened Basket ${basketId.slice(0, 8)}.`);
        }),
      onRefresh:
        overrides.actions?.onRefresh ??
        (() =>
          setHostMessage(
            "Storybook would ask ChatGPT to load this exact Nemlig shopping list.",
          )),
      onInspectBasket:
        overrides.actions?.onInspectBasket ??
        (() =>
          setHostMessage(
            "Storybook would ask ChatGPT to inspect the actual Nemlig basket.",
          )),
      onSendFollowUp:
        overrides.actions?.onSendFollowUp ??
        ((text) => setHostMessage(`Storybook would send to ChatGPT: ${text}`)),
    },
  });
  return (
    <>
      <ViewerPage {...props} />
      {hostMessage && <p role="status">{hostMessage}</p>}
    </>
  );
}

const page = (screen: ViewerScreen, overrides?: StoryOverrides) => (
  <FixturePage screen={screen} overrides={overrides} />
);
const activeReview = (
  value: Review = review,
  destination = value.destination,
  maxWidth?: number,
  overrides: StoryOverrides = {},
) =>
  page(
    { kind: "review", review: value, active: true },
    {
      ...overrides,
      model: {
        ...overrides.model,
        presentationDestination: destination,
        maxWidth,
      },
    },
  );

type SetState<T> = Dispatch<SetStateAction<T>>;

function prepareReview(review: Review): Review | undefined {
  if (
    review.items.length === 0 ||
    review.items.some(
      (item) =>
        item.view.status !== "complete" || item.view.product.available !== true,
    )
  ) {
    return undefined;
  }
  const lines = review.items.map((item) => {
    if (item.view.status !== "complete") {
      throw new globalThis.Error("Unavailable rows cannot be prepared.");
    }
    const { product } = item.view;
    return {
      product_id: item.product_id,
      quantity: item.quantity,
      name: product.name,
      item_price: product.price,
      line_total:
        typeof product.price === "number"
          ? item.quantity * product.price
          : undefined,
    };
  });
  return {
    ...review,
    submission: {
      status: "prepared",
      submission_id: "storybook-submission",
      review: {
        lines,
        expected_products_price: lines.reduce(
          (total, line) => total + (line.line_total ?? 0),
          0,
        ),
      },
    },
  };
}

function disclosureActions(
  setReviewDisclosures: SetState<ViewerPageModel["reviewDisclosures"]>,
): Pick<ViewerPageActions, "onFactExpandedChange"> {
  return {
    onFactExpandedChange: (productId, factKey, expanded) =>
      setReviewDisclosures((previous) => {
        const facts = new Set(previous.get(productId));
        if (expanded) {
          facts.add(factKey);
        } else {
          facts.delete(factKey);
        }
        const next = new Map(previous);
        next.set(productId, facts);
        return next;
      }),
  };
}

function reviewActions(
  setCurrentReview: SetState<Review>,
): Pick<ViewerPageActions, "onQuantity" | "onRemove"> {
  return {
    onQuantity: (item, quantity) =>
      setCurrentReview((previous) =>
        updateQuantity(previous, item.product_id, quantity),
      ),
    onRemove: (item) =>
      setCurrentReview((previous) => removeItem(previous, item.product_id)),
  };
}

function alternativeActions(
  setCurrentReview: SetState<Review>,
  setDestination: SetState<Review["destination"]>,
): Pick<
  ViewerPageActions,
  "onOpenAlternatives" | "onSearchAlternatives" | "onReplace"
> {
  const alternatives = (productId: number) =>
    walkthroughAlternatives.get(productId) ?? [];
  const searchedAlternatives = (productId: number, query: string) => {
    const normalizedQuery = query.trim().toLocaleLowerCase("da-DK");
    if (!normalizedQuery) {
      return [];
    }
    return alternatives(productId).filter((view) => {
      if (view.status !== "complete") {
        return false;
      }
      return [view.product.name, view.product.brand, view.product.unit_size]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("da-DK")
        .includes(normalizedQuery);
    });
  };
  return {
    onOpenAlternatives: (item, query) => {
      setCurrentReview((previous) =>
        alternativesFor(
          previous,
          item.product_id,
          query,
          alternatives(item.product_id),
        ),
      );
      setDestination("alternatives");
    },
    onSearchAlternatives: (productId, query) =>
      setCurrentReview((previous) =>
        alternativesFor(
          previous,
          productId,
          query,
          searchedAlternatives(productId, query),
        ),
      ),
    onReplace: (productId, replacementId) => {
      setCurrentReview((previous) =>
        replaceWithAlternative(previous, productId, replacementId),
      );
      setDestination("ready");
    },
  };
}

function walkthroughScreen(review: Review): ViewerScreen {
  return {
    kind: "review",
    review,
    active: true,
  };
}

function WalkthroughPage({
  screen,
  model,
  actions,
  hostMessage,
}: {
  screen: ViewerScreen;
  model: StoryOverrides["model"];
  actions: StoryOverrides["actions"];
  hostMessage: string;
}) {
  return (
    <>
      <ViewerPage {...baseProps(screen, { model, actions })} />
      {hostMessage && <p role="status">{hostMessage}</p>}
    </>
  );
}

function submissionActions(
  currentReview: Review,
  setCurrentReview: SetState<Review>,
  setHostMessage: SetState<string>,
): Pick<
  ViewerPageActions,
  "onSubmit" | "onConfirmSubmit" | "onContinueSubmitted" | "onSendFollowUp"
> {
  return {
    onSubmit: () => {
      const next = prepareReview(currentReview);
      if (next) {
        setCurrentReview({
          ...next,
          submissionAttempted: true,
          submission: next.submission
            ? {
                ...next.submission,
                status: "submitted",
                verified_additions: next.submission.review.lines?.length,
              }
            : undefined,
        });
        setHostMessage("");
      } else {
        setHostMessage(
          "Preparation stopped. Resolve every unavailable or incomplete shopping-list row first.",
        );
      }
    },
    onConfirmSubmit: () => {
      setCurrentReview((previous) =>
        previous.submission?.status === "prepared"
          ? {
              ...previous,
              submission: {
                ...previous.submission,
                status: "submitted",
                verified_additions: previous.submission.review.lines?.length,
              },
            }
          : previous,
      );
      setHostMessage("");
    },
    onContinueSubmitted: () =>
      setCurrentReview((previous) => ({ ...previous, submission: undefined })),
    onSendFollowUp: (text) =>
      setHostMessage(`Storybook would send to ChatGPT: ${text}`),
  };
}

/** A deterministic visual walkthrough; it only projects local fixture state and never imitates MCP authority. */
function ShoppingListWalkthroughStory({
  initialReview = walkthroughReview,
  initialDestination = initialReview.destination,
}: {
  initialReview?: Review;
  initialDestination?: Review["destination"];
}) {
  const [currentReview, setCurrentReview] = useState(initialReview);
  const [destination, setDestination] =
    useState<Review["destination"]>(initialDestination);
  const [reviewDisclosures, setReviewDisclosures] = useState<
    ViewerPageModel["reviewDisclosures"]
  >(new Map());
  const [hostMessage, setHostMessage] = useState("");
  const disclosures = disclosureActions(setReviewDisclosures);
  const reviews = reviewActions(setCurrentReview);
  const alternatives = alternativeActions(setCurrentReview, setDestination);
  const submission = submissionActions(
    currentReview,
    setCurrentReview,
    setHostMessage,
  );
  return (
    <WalkthroughPage
      screen={walkthroughScreen(currentReview)}
      model={{
        maxWidth: 375,
        presentationDestination: destination,
        reviewDisclosures,
      }}
      actions={{
        onNavigate: setDestination,
        ...disclosures,
        ...reviews,
        ...alternatives,
        ...submission,
      }}
      hostMessage={hostMessage}
    />
  );
}

const meta = {
  title: "Picker/Visual contract",
  parameters: {
    docs: {
      description: {
        component:
          "AppTabWalkthrough, Alternatives, FactualDetails, submission, and empty-state walkthroughs are interactive local fixtures. The remaining state stories are visual snapshots. None initialize MCP, call tools, or contact Nemlig.",
      },
    },
  },
} satisfies Meta;

const inventory = [
  {
    basketId: "44",
    nativeShoppingList: true as const,
    shoppingListName: "Synthetic weekly shop",
    productCount: 4,
    submissionAttempted: false,
  },
  {
    basketId: "45",
    nativeShoppingList: true as const,
    shoppingListName: "Synthetic pantry list",
    productCount: 2,
    submissionAttempted: false,
  },
];

export default meta;
type Story = StoryObj<typeof meta>;

export const AppTabWalkthrough: Story = {
  decorators: [appTab],
  render: () => <ShoppingListWalkthroughStory />,
};
export const ShoppingListWalkthrough: Story = {
  decorators: [embeddedConversation],
  render: () => <ShoppingListWalkthroughStory />,
};
export const ShoppingListAt320: Story = {
  render: () => activeReview(review, "ready", 320),
};
export const ShoppingListAt375: Story = {
  render: () => activeReview(review, "ready", 375),
};
export const ScrollableShoppingList: Story = {
  decorators: [embeddedConversation],
  render: () => <ShoppingListWalkthroughStory initialReview={longBasket} />,
};
export const LegacyMixedShoppingList: Story = {
  render: () => activeReview(legacyMixedReview, "ready", 375),
};
export const Alternatives: Story = {
  decorators: [embeddedConversation],
  render: () => (
    <ShoppingListWalkthroughStory initialDestination="alternatives" />
  ),
};
export const FactualDetails: Story = {
  decorators: [embeddedConversation],
  render: () => <ShoppingListWalkthroughStory />,
  play: ({ canvasElement }) => {
    canvasElement
      .querySelector<HTMLButtonElement>(
        '[data-viewer-component="product-summary"]',
      )
      ?.click();
  },
};
export const Unavailable: Story = {
  render: () =>
    page({
      kind: "review",
      review: {
        ...review,
        items: [
          {
            product_id: 99,
            quantity: 1,
            state: "ready",
            view: unavailable,
          },
        ],
      },
      active: true,
    }),
};
export const UnavailableShoppingList: Story = {
  render: () => page({ kind: "unavailable", review }),
};
export const PreparedConfirmation: Story = {
  decorators: [embeddedConversation],
  render: () => <ShoppingListWalkthroughStory initialReview={preparedReview} />,
};
export const VerifiedSuccess: Story = {
  decorators: [embeddedConversation],
  render: () => (
    <ShoppingListWalkthroughStory initialReview={submittedReview} />
  ),
};
export const UncertainOutcome: Story = {
  render: () => activeReview(uncertainReview, "ready"),
};
export const UncertainSubmissionRecovery: Story = {
  render: () =>
    page(
      { kind: "review", review: uncertainReview, active: true },
      {
        model: {
          submitErrorOpen: true,
          submitBlocked: true,
          recoveryOperation: "submit",
          message:
            "Nemlig returned HTTP 503 for the shopping-list transfer. Inspect the basket; do not retry.",
        },
      },
    ),
};
export const ShoppingListRecovery: Story = {
  render: () =>
    page(
      { kind: "review", review, active: true },
      {
        model: {
          submitErrorOpen: true,
          recoveryOperation: "update",
          message:
            "Nemlig did not confirm every change. Refresh this exact list before continuing.",
        },
      },
    ),
};
export const PartialNativeListRecovery: Story = {
  render: () =>
    page(
      {
        kind: "review",
        review: {
          ...review,
          updateStatus: "partial",
          actionNotice:
            "Nemlig did not confirm every change. Refresh this exact list before continuing.",
          items: review.items.map((item) => ({ ...item, quantity: 2 })),
        },
        active: true,
      },
      {
        model: {
          submitErrorOpen: true,
          recoveryOperation: "update",
          message:
            "The action could not be confirmed. Your current products and quantities remain visible; review them before continuing. No automatic retry was made.",
        },
      },
    ),
};
export const NativeListReadRecovery: Story = {
  render: () =>
    page(
      { kind: "review", review, active: true },
      {
        model: {
          submitErrorOpen: true,
          recoveryOperation: "list",
          message:
            "Nemlig could not confirm the current contents of this exact list. Refresh it or choose another list.",
        },
      },
    ),
};
export const NativeShoppingListInventory: Story = {
  render: () =>
    page(
      { kind: "picker", baskets: inventory },
      { model: { baskets: inventory } },
    ),
};
export const SecondChatPicker: Story = {
  decorators: [embeddedConversation],
  render: () =>
    page(
      { kind: "picker", baskets: inventory },
      { model: { baskets: inventory } },
    ),
};
export const NoStableChatSelection: Story = {
  render: () => page({ kind: "picker", baskets: inventory }),
};
export const ExpiredOrEvictedBasket: Story = {
  render: () =>
    page({
      kind: "picker",
      baskets: [],
      selectedBasketId: inventory[0]!.basketId,
    }),
};
export const RestartFencedBasket: Story = {
  render: () => {
    const fencedReview = {
      ...review,
      shoppingListId: Number(inventory[1]!.basketId),
      shoppingListName: inventory[1]!.shoppingListName,
      reviewContextId: "12345678-1234-4234-8234-123456789def",
      saveStatus: "saved",
      submissionAttempted: true,
      submission: undefined,
    } satisfies Review;
    return page(
      { kind: "review", review: fencedReview, active: true },
      {
        model: {
          baskets: inventory,
          selectedBasketId: inventory[1]!.basketId,
          submitBlocked: true,
        },
      },
    );
  },
};
export const Loading: Story = {
  render: () =>
    page(
      { kind: "loading" },
      {
        model: { connectionMessage: "Connecting to Nemlig…" },
      },
    ),
};
export const Error: Story = {
  render: () =>
    page({
      kind: "error",
      message: "Could not load the Nemlig shopping list.",
    }),
};
export const Cancelled: Story = { render: () => page({ kind: "cancelled" }) };
export const Inactive: Story = {
  render: () => page({ kind: "review", review, active: false }),
};
export const ReadOnlyProducts: Story = {
  render: () =>
    page({
      kind: "products",
      payload: { detail_limit: 2, items: [], views: [milk, pasta] },
      views: [milk, pasta],
    }),
};
export const ProductResults: Story = {
  render: () => page({ kind: "products", payload: {}, views: [milk, pasta] }),
};
