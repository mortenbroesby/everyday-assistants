import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { appTab, embeddedConversation } from "../../../.storybook/preview.js";
import type { ProductView } from "../../product-presentation.js";
import type { Review, ViewerPageProps, ViewerScreen } from "../viewer-page.js";
import { ViewerPage } from "../viewer-page.js";

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
  review_id: "storybook-review",
  revision: 4,
  destination: "needs-review",
  items: [
    { product_id: 1, quantity: 2, state: "needs-review", view: milk },
    { product_id: 2, quantity: 1, state: "ready", view: pasta },
  ],
  alternatives: { product_id: 1, query: "minimælk", views: [milk, pasta] },
};
const everythingReadyReview: Review = {
  ...review,
  items: review.items.map((item) => ({ ...item, state: "ready" })),
};
const walkthroughReview: Review = {
  ...review,
  alternatives: { product_id: 1, query: "havredrik", views: [oatMilk] },
};
const preparedReview: Review = {
  ...review,
  destination: "ready",
  submission: {
    status: "prepared",
    submission_id: "storybook-submission",
    review: {
      lines: [
        {
          product_id: 2,
          quantity: 1,
          name: "Lasagneplader øko.",
          item_price: 23.95,
          line_total: 23.95,
        },
      ],
      expected_products_price: 23.95,
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
const baseProps = (
  screen: ViewerScreen,
  overrides: Partial<ViewerPageProps> = {},
): ViewerPageProps => ({
  screen,
  selected: new Set(),
  reviewDisclosures: new Map(),
  pendingQuantities: new Map(),
  thumbnails: new Map([
    [milk, milkCarton],
    [pasta, milkCarton],
    [oatMilk, milkCarton],
  ]),
  message: "",
  busy: false,
  activatingCurrent: false,
  confirmSubmit: false,
  confirmEnd: false,
  continueSubmitted: false,
  submitBlocked: false,
  onNavigate: noop,
  onDisclosureChange: noop,
  onFactExpandedChange: noop,
  onActivateCurrent: noop,
  onSelected: noop,
  onSelectAll: noop,
  onAcceptSelected: noop,
  onQuantity: noop,
  onRemove: noop,
  onRevisit: noop,
  onOpenAlternatives: noop,
  onSearchAlternatives: noop,
  onChooseReplacement: noop,
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
  ...overrides,
});
const page = (screen: ViewerScreen, props?: Partial<ViewerPageProps>) => (
  <ViewerPage {...baseProps(screen, props)} />
);
const activeReview = (
  value: Review = review,
  destination = value.destination,
  maxWidth?: number,
  overrides: Partial<ViewerPageProps> = {},
) =>
  page(
    { kind: "review", review: value, active: true, view_id: "storybook-view" },
    { presentationDestination: destination, maxWidth, ...overrides },
  );

function replaceItem(
  review: Review,
  productId: number,
  change: (item: Review["items"][number]) => Review["items"][number],
) {
  return {
    ...review,
    items: review.items.map((item) =>
      item.product_id === productId ? change(item) : item,
    ),
  };
}

function toggleSelection(
  previous: ReadonlySet<number>,
  productId: number,
  checked: boolean,
) {
  const next = new Set(previous);
  if (checked) next.add(productId);
  else next.delete(productId);
  return next;
}

function prepareReview(review: Review): Review {
  const lines = review.items.flatMap((item) => {
    if (item.state !== "ready" || item.view.status !== "complete") return [];
    const { product } = item.view;
    return [
      {
        product_id: item.product_id,
        quantity: item.quantity,
        name: product.name,
        item_price: product.price,
        line_total:
          typeof product.price === "number"
            ? item.quantity * product.price
            : undefined,
      },
    ];
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

/** A deterministic visual walkthrough; it only projects local fixture state and never imitates MCP authority. */
function DraftListWalkthroughStory() {
  const [currentReview, setCurrentReview] = useState(walkthroughReview);
  const [destination, setDestination] =
    useState<Review["destination"]>("needs-review");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [replacement, setReplacement] = useState<number>();
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ended, setEnded] = useState(false);
  const screen: ViewerScreen = ended
    ? {
        kind: "empty",
        message:
          "Your local Draft list was discarded. Nothing changed in Nemlig.",
      }
    : {
        kind: "review",
        review: currentReview,
        active: true,
        view_id: "storybook-view",
      };
  const alternatives = currentReview.alternatives;
  const selectedAlternative = alternatives?.views.find(
    (view) =>
      (view.status === "complete" ? view.product.id : view.product_id) ===
      replacement,
  );

  return (
    <ViewerPage
      {...baseProps(screen, {
        maxWidth: 375,
        presentationDestination: destination,
        selected,
        replacement,
        confirmSubmit,
        confirmEnd,
        onNavigate: setDestination,
        onSelected: (productId, checked) =>
          setSelected((previous) =>
            toggleSelection(previous, productId, checked),
          ),
        onSelectAll: () =>
          setSelected(
            new Set(
              currentReview.items
                .filter((item) => item.state === "needs-review")
                .map((item) => item.product_id),
            ),
          ),
        onAcceptSelected: () => {
          setCurrentReview((previous) => ({
            ...previous,
            items: previous.items.map((item) =>
              selected.has(item.product_id)
                ? { ...item, state: "ready" }
                : item,
            ),
          }));
          setSelected(new Set());
        },
        onQuantity: (item, quantity) =>
          setCurrentReview((previous) =>
            replaceItem(previous, item.product_id, (current) => ({
              ...current,
              quantity,
            })),
          ),
        onRemove: (item) =>
          setCurrentReview((previous) => ({
            ...previous,
            items: previous.items.filter(
              (current) => current.product_id !== item.product_id,
            ),
          })),
        onRevisit: (item) =>
          setCurrentReview((previous) =>
            replaceItem(previous, item.product_id, (current) => ({
              ...current,
              state: "needs-review",
            })),
          ),
        onOpenAlternatives: (_, query) => {
          setCurrentReview((previous) => ({
            ...previous,
            alternatives: previous.alternatives
              ? { ...previous.alternatives, query }
              : previous.alternatives,
          }));
          setReplacement(undefined);
          setDestination("alternatives");
        },
        onSearchAlternatives: (_, query) =>
          setCurrentReview((previous) => ({
            ...previous,
            alternatives: previous.alternatives
              ? { ...previous.alternatives, query }
              : previous.alternatives,
          })),
        onChooseReplacement: setReplacement,
        onReplace: (productId) => {
          if (!selectedAlternative) return;
          setCurrentReview((previous) => ({
            ...replaceItem(previous, productId, (item) => ({
              ...item,
              view: selectedAlternative,
              quantity: 1,
              state: "needs-review",
            })),
            alternatives: undefined,
          }));
          setReplacement(undefined);
          setDestination("needs-review");
        },
        onPrepareSubmission: () =>
          setCurrentReview((previous) => prepareReview(previous)),
        onRequestSubmitConfirmation: () => setConfirmSubmit(true),
        onCancelSubmit: () => setConfirmSubmit(false),
        onConfirmSubmit: () => {
          setCurrentReview((previous) => ({
            ...previous,
            submission: previous.submission
              ? { ...previous.submission, status: "submitted" }
              : previous.submission,
          }));
          setConfirmSubmit(false);
        },
        onContinueSubmitted: () =>
          setCurrentReview((previous) => ({
            ...previous,
            submission: undefined,
          })),
        onRequestEnd: () => setConfirmEnd(true),
        onCancelEnd: () => setConfirmEnd(false),
        onConfirmEnd: () => setEnded(true),
      })}
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

export const ToDecideAt320: Story = {
  render: () => activeReview(review, "needs-review", 320),
};
export const DraftListWalkthrough: Story = {
  decorators: [embeddedConversation],
  render: () => <DraftListWalkthroughStory />,
};
export const AppTabWalkthrough: Story = {
  decorators: [appTab],
  render: () => <DraftListWalkthroughStory />,
};
export const ReadyAt375: Story = {
  render: () => activeReview(review, "ready", 375),
};
export const EverythingReady: Story = {
  render: () => activeReview(everythingReadyReview, "needs-review", 375),
};
export const Alternatives: Story = {
  render: () => activeReview(review, "alternatives", 375, { replacement: 2 }),
};
export const FactualDetails: Story = {
  render: () =>
    activeReview(review, "needs-review", 375, {
      reviewDisclosures: new Map([
        [1, { expanded: true, facts: new Set(["Varebeskrivelse"]) }],
      ]),
    }),
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
            state: "needs-review",
            view: unavailable,
          },
        ],
      },
      active: true,
      view_id: "storybook-view",
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
export const EmptyDraftList: Story = { render: () => page({ kind: "empty" }) };
export const Loading: Story = {
  render: () =>
    page({ kind: "loading" }, { connectionMessage: "Connecting to Nemlig…" }),
};
export const Error: Story = {
  render: () =>
    page({ kind: "error", message: "Could not load the Draft list." }),
};
export const Cancelled: Story = { render: () => page({ kind: "cancelled" }) };
export const Stale: Story = { render: () => page({ kind: "stale" }) };
export const Inactive: Story = {
  render: () =>
    page({ kind: "review", review, active: false, view_id: "older-view" }),
};
export const ReadOnlyProducts: Story = {
  render: () => page({ kind: "products", payload: {}, views: [milk, pasta] }),
};
export const ProductResults: Story = {
  render: () => page({ kind: "products", payload: {}, views: [milk, pasta] }),
};
export const MissingImageFallback: Story = {
  render: () =>
    page(
      { kind: "products", payload: {}, views: [pasta] },
      { thumbnails: new Map() },
    ),
};
export const FailedImageFallback: Story = {
  render: () =>
    page(
      { kind: "products", payload: {}, views: [pasta] },
      { thumbnails: new Map([[pasta, "/missing-storybook-fixture.svg"]]) },
    ),
};
