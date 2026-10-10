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

const milkCarton = new URL("../fixtures/milk-carton.svg", import.meta.url).href;
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
    image_url: "https://example.invalid/ignored-story-image.png",
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
const review: Review = {
  destination: "ready",
  items: [
    { product_id: 1, quantity: 2, state: "ready", view: milk },
    { product_id: 2, quantity: 1, state: "ready", view: pasta },
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
  [1, [oatMilk]],
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
    thumbnails: new Map([[milk, milkCarton]]),
    message: "",
    busy: false,
    confirmSubmit: false,
    confirmEnd: false,
    continueSubmitted: false,
    submitBlocked: false,
    ...overrides.model,
  },
  actions: {
    onNavigate: noop,
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
  const props = baseProps(screen, {
    ...overrides,
    actions: {
      ...overrides.actions,
      onRefresh:
        overrides.actions?.onRefresh ??
        (() =>
          setHostMessage(
            "Storybook would ask ChatGPT to load the current Local basket.",
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
        alternativesFor(previous, productId, query, alternatives(productId)),
      ),
    onReplace: (productId, replacementId) => {
      setCurrentReview((previous) =>
        replaceWithAlternative(previous, productId, replacementId),
      );
      setDestination("ready");
    },
  };
}

function walkthroughScreen(ended: boolean, review: Review): ViewerScreen {
  return ended
    ? {
        kind: "empty",
        message: "Your Local basket was discarded. Nothing changed in Nemlig.",
      }
    : {
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
  setConfirmSubmit: SetState<boolean>,
  setConfirmEnd: SetState<boolean>,
  setEnded: SetState<boolean>,
  setHostMessage: SetState<string>,
): Pick<
  ViewerPageActions,
  | "onPrepareSubmission"
  | "onRequestSubmitConfirmation"
  | "onCancelSubmit"
  | "onConfirmSubmit"
  | "onContinueSubmitted"
  | "onRequestEnd"
  | "onCancelEnd"
  | "onConfirmEnd"
  | "onSendFollowUp"
> {
  return {
    onPrepareSubmission: () => {
      const next = prepareReview(currentReview);
      if (next) {
        setCurrentReview(next);
        setHostMessage("");
      } else {
        setHostMessage(
          "Preparation stopped. Resolve every unavailable or incomplete Local basket row first.",
        );
      }
    },
    onRequestSubmitConfirmation: () => setConfirmSubmit(true),
    onCancelSubmit: () => setConfirmSubmit(false),
    onConfirmSubmit: () => {
      setConfirmSubmit(false);
      setHostMessage(
        "This walkthrough does not submit to Nemlig. Continue in conversation to add the prepared items.",
      );
    },
    onContinueSubmitted: () =>
      setCurrentReview((previous) => ({ ...previous, submission: undefined })),
    onRequestEnd: () => setConfirmEnd(true),
    onCancelEnd: () => setConfirmEnd(false),
    onConfirmEnd: () => setEnded(true),
    onSendFollowUp: (text) =>
      setHostMessage(`Storybook would send to ChatGPT: ${text}`),
  };
}

/** A deterministic visual walkthrough; it only projects local fixture state and never imitates MCP authority. */
function LocalBasketWalkthroughStory({
  initialReview = walkthroughReview,
}: {
  initialReview?: Review;
}) {
  const [currentReview, setCurrentReview] = useState(initialReview);
  const [destination, setDestination] =
    useState<Review["destination"]>("ready");
  const [reviewDisclosures, setReviewDisclosures] = useState<
    ViewerPageModel["reviewDisclosures"]
  >(new Map());
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ended, setEnded] = useState(false);
  const [hostMessage, setHostMessage] = useState("");
  const disclosures = disclosureActions(setReviewDisclosures);
  const reviews = reviewActions(setCurrentReview);
  const alternatives = alternativeActions(setCurrentReview, setDestination);
  const submission = submissionActions(
    currentReview,
    setCurrentReview,
    setConfirmSubmit,
    setConfirmEnd,
    setEnded,
    setHostMessage,
  );
  return (
    <WalkthroughPage
      screen={walkthroughScreen(ended, currentReview)}
      model={{
        maxWidth: 375,
        presentationDestination: destination,
        reviewDisclosures,
        confirmSubmit,
        confirmEnd,
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
          "Full pages rendered by the same effect-free ViewerPage used by ProductViewer. These fixtures do not initialize MCP, call tools, or contact Nemlig.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LocalBasketAt320: Story = {
  render: () => activeReview(review, "ready", 320),
};
export const LocalBasketWalkthrough: Story = {
  decorators: [embeddedConversation],
  render: () => <LocalBasketWalkthroughStory />,
};
export const AppTabWalkthrough: Story = {
  decorators: [appTab],
  render: () => <LocalBasketWalkthroughStory />,
};
export const LocalBasketAt375: Story = {
  render: () => activeReview(review, "ready", 375),
};
export const ScrollableLocalBasket: Story = {
  decorators: [embeddedConversation],
  render: () => <LocalBasketWalkthroughStory initialReview={longBasket} />,
};
export const LegacyMixedLocalBasket: Story = {
  render: () => activeReview(legacyMixedReview, "ready", 375),
};
export const Alternatives: Story = {
  render: () => activeReview(walkthroughReview, "alternatives", 375),
};
export const FactualDetails: Story = {
  render: () =>
    activeReview(review, "ready", 375, {
      model: {
        reviewDisclosures: new Map([[1, new Set(["Varebeskrivelse"])]]),
      },
    }),
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
export const UnavailableDraft: Story = {
  render: () => page({ kind: "unavailable", review }),
};
export const PreparedConfirmation: Story = {
  render: () => activeReview(preparedReview, "ready"),
};
export const VerifiedSuccess: Story = {
  render: () => activeReview(submittedReview, "ready"),
};
export const UncertainOutcome: Story = {
  render: () => activeReview(uncertainReview, "ready"),
};
export const EmptyLocalBasket: Story = {
  render: () => page({ kind: "empty" }),
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
    page({ kind: "error", message: "Could not load the Local basket." }),
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
export const MissingImageFallback: Story = {
  render: () =>
    page(
      { kind: "products", payload: {}, views: [pasta] },
      { model: { thumbnails: new Map() } },
    ),
};
export const FailedImageFallback: Story = {
  render: () =>
    page(
      { kind: "products", payload: {}, views: [pasta] },
      {
        model: {
          thumbnails: new Map([[pasta, "/missing-storybook-fixture.svg"]]),
        },
      },
    ),
};
