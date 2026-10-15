import type { Meta, StoryObj } from "@storybook/react-vite";
import { type Dispatch, type SetStateAction, useState } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
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

const savedSourceItems = [review.items[0]!, review.items[3]!];
const existingBasketItems = [{ item: review.items[4]!, quantity: 2 }];

type SimulatedBasketLine = (typeof existingBasketItems)[number];

function addSimulatedBasketRows(
  previous: SimulatedBasketLine[],
  additions: Review["items"],
): SimulatedBasketLine[] {
  const next = new Map(
    previous.map(({ item, quantity }) => [item.product_id, { item, quantity }]),
  );
  for (const item of additions) {
    const existing = next.get(item.product_id);
    next.set(item.product_id, {
      item,
      quantity: (existing?.quantity ?? 0) + item.quantity,
    });
  }
  return [...next.values()];
}

function starterProductIds(prompt: string): number[] {
  const normalized = prompt.toLocaleLowerCase("en-US");
  if (normalized.includes("groceries for the week")) {
    return [1, 2, 3, 4, 5];
  }
  if (normalized.includes("ingredients for dinner")) {
    return [2, 4, 5];
  }
  return [1];
}

function toggleFactDisclosure(
  previous: ViewerPageModel["reviewDisclosures"],
  productId: number,
  factKey: string,
  expanded: boolean,
): ViewerPageModel["reviewDisclosures"] {
  const next = new Map(previous);
  const facts = new Set(previous.get(productId));
  if (expanded) {
    facts.add(factKey);
  } else {
    facts.delete(factKey);
  }
  next.set(productId, facts);
  return next;
}

function findWalkthroughAlternatives(productId: number, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("da-DK");
  return (walkthroughAlternatives.get(productId) ?? []).filter(
    (candidate) =>
      candidate.status === "complete" &&
      (candidate.product.name ?? "")
        .toLocaleLowerCase("da-DK")
        .includes(normalizedQuery),
  );
}

function walkthroughProductName(item: Review["items"][number]): string {
  return item.view.status === "complete"
    ? (item.view.product.name ?? "Product")
    : "Product";
}

function walkthroughProgressMessage(busy: boolean, review: Review): string {
  if (!busy) {
    return "";
  }
  return review.submissionAttempted
    ? "Saving the whole basket in the simulated provider…"
    : "Adding the reviewed products in the simulated provider…";
}

function walkthroughReviewScreen(
  screen: ViewerScreen,
  review: Review,
): ViewerScreen {
  if (screen.kind !== "review") {
    return screen;
  }
  return { kind: "review", review, active: true };
}

function canAddOatMilk(
  busy: boolean,
  screen: ViewerScreen,
  review: Review,
): boolean {
  return (
    !busy &&
    screen.kind === "review" &&
    !review.submissionAttempted &&
    !review.items.some((item) => item.product_id === 3)
  );
}

type SimulatedHostPanelProps = {
  busy: boolean;
  hostMessage: string;
  currentReview: Review;
  canSelectOatMilk: boolean;
  oatMilkActionLabel: string;
  onLoadSavedLists: () => void;
  onStartEmptyDraft: () => void;
  onAddOatMilk: () => void;
  submitCount: number;
  saveCount: number;
  submitRequest?: Array<{ product_id: number; quantity: number }>;
  basketItems: SimulatedBasketLine[];
  savedBasketCopies: Record<string, Review["items"]>;
};

function SimulatedHostPanel({
  busy,
  hostMessage,
  currentReview,
  canSelectOatMilk,
  oatMilkActionLabel,
  onLoadSavedLists,
  onStartEmptyDraft,
  onAddOatMilk,
  submitCount,
  saveCount,
  submitRequest,
  basketItems,
  savedBasketCopies,
}: SimulatedHostPanelProps) {
  const payload = JSON.stringify({
    addToExisting: true,
    Products: (submitRequest ?? []).map(({ product_id, quantity }) => ({
      ProductId: String(product_id),
      Quantity: quantity,
    })),
  });

  return (
    <section
      aria-label="Simulated host conversation and provider"
      style={{ border: "1px solid #d9d9d9", borderRadius: 12, padding: 12 }}
    >
      <h2 style={{ marginTop: 0 }}>Simulated host conversation</h2>
      <p>
        These controls model ChatGPT tool replies and provider responses. No
        tools or live Nemlig endpoints are called.
      </p>
      <p role="status">{hostMessage}</p>
      <div>
        <button type="button" disabled={busy} onClick={onLoadSavedLists}>
          Load saved shopping lists
        </button>
        <button type="button" disabled={busy} onClick={onStartEmptyDraft}>
          Start a new temporary draft
        </button>
      </div>
      <button type="button" disabled={!canSelectOatMilk} onClick={onAddOatMilk}>
        {oatMilkActionLabel}
      </button>
      <details>
        <summary>Simulation evidence and provider boundary</summary>
        <p data-testid="simulated-submit-count">
          Bulk basket submissions: {submitCount}
        </p>
        <p data-testid="simulated-save-count">
          Whole-basket list saves: {saveCount}
        </p>
        <p data-testid="simulated-draft-id">
          Current draft: {currentReview.draftId}
        </p>
        <strong>Existing basket before new submissions</strong>
        <ul aria-label="Pre-existing basket rows">
          {existingBasketItems.map(({ item, quantity }) => (
            <li key={item.product_id}>
              {quantity} × {walkthroughProductName(item)}
            </li>
          ))}
        </ul>
        <strong>Original saved source (read-only)</strong>
        <ul
          aria-label="Original saved source rows"
          data-testid="saved-source-snapshot"
        >
          {savedSourceItems.map((item) => (
            <li key={item.product_id}>
              {item.quantity} × {walkthroughProductName(item)}
            </li>
          ))}
        </ul>
        <pre data-testid="simulated-submit-payload">{payload}</pre>
        <ul
          aria-label="Current simulated basket rows"
          data-testid="current-basket-rows"
        >
          {basketItems.map(({ item, quantity }) => (
            <li key={item.product_id}>
              {quantity} × {walkthroughProductName(item)}
            </li>
          ))}
        </ul>
        {Object.entries(savedBasketCopies).map(([basketId, items]) => (
          <ul
            key={basketId}
            aria-label={`Saved whole-basket snapshot ${basketId}`}
            data-testid={`saved-basket-snapshot-${basketId}`}
          >
            {items.map((item) => (
              <li key={item.product_id}>
                {item.quantity} × {walkthroughProductName(item)}
              </li>
            ))}
          </ul>
        ))}
      </details>
    </section>
  );
}

function useWalkthroughViewState() {
  const [screen, setScreen] = useState<ViewerScreen>({ kind: "loading" });
  const [currentReview, setCurrentReview] = useState(() => directDraft([], 1));
  const [generation, setGeneration] = useState(1);
  const [connectionMessage, setConnectionMessage] = useState(
    "Waiting for a simulated host action…",
  );
  const [hostMessage, setHostMessage] = useState(
    "Synthetic walkthrough only. No MCP tools or live Nemlig requests are used.",
  );
  const [destination, setDestination] =
    useState<Review["destination"]>("ready");
  const [reviewDisclosures, setReviewDisclosures] = useState<
    ViewerPageModel["reviewDisclosures"]
  >(new Map());

  const showReview = (value: Review) => {
    setCurrentReview(value);
    setScreen({ kind: "review", review: value, active: true });
  };
  const startEmptyDraft = () => {
    const nextGeneration = generation + 1;
    setGeneration(nextGeneration);
    setDestination("ready");
    showReview(directDraft([], nextGeneration));
    setHostMessage("Simulated host started a new empty temporary draft.");
  };

  return {
    screen,
    setScreen,
    currentReview,
    setCurrentReview,
    generation,
    setGeneration,
    connectionMessage,
    setConnectionMessage,
    hostMessage,
    setHostMessage,
    destination,
    setDestination,
    reviewDisclosures,
    setReviewDisclosures,
    showReview,
    startEmptyDraft,
  };
}

type WalkthroughViewState = ReturnType<typeof useWalkthroughViewState>;

function useWalkthroughListState(
  view: WalkthroughViewState,
  setBusy: Dispatch<SetStateAction<boolean>>,
) {
  const [savedBasketCopies, setSavedBasketCopies] = useState<
    Record<string, Review["items"]>
  >({ "44": savedSourceItems });
  const [savedLists, setSavedLists] = useState([
    {
      basketId: "44",
      nativeShoppingList: true as const,
      shoppingListName: "Synthetic weekly shop",
      productCount: savedSourceItems.length,
      submissionAttempted: false,
    },
  ]);

  const loadSavedLists = () => {
    setBusy(true);
    view.setConnectionMessage(
      "Simulated host is loading saved shopping lists…",
    );
    view.setScreen({ kind: "loading" });
    setTimeout(() => {
      setBusy(false);
      view.setScreen({ kind: "picker", baskets: savedLists });
      view.setHostMessage("Simulated provider returned the saved-list picker.");
    }, 180);
  };
  const selectSavedList = (basketId: string) => {
    const selectedList = savedLists.find((list) => list.basketId === basketId);
    if (!selectedList) {
      return;
    }
    const sourceItems = savedBasketCopies[basketId] ?? [];
    setBusy(true);
    view.setConnectionMessage(
      `Loading ${selectedList.shoppingListName} into a temporary draft…`,
    );
    view.setScreen({ kind: "loading" });
    setTimeout(() => {
      const nextGeneration = view.generation + 1;
      view.setGeneration(nextGeneration);
      view.setDestination("ready");
      view.showReview(directDraft(sourceItems, nextGeneration));
      setBusy(false);
      view.setHostMessage(
        `Simulated host copied ${selectedList.shoppingListName} into a temporary draft. The saved source remains unchanged.`,
      );
    }, 180);
  };
  const saveBasketSnapshot = (items: Review["items"]) => {
    const basketId = String(44 + savedLists.length);
    setSavedBasketCopies((snapshots) => ({
      ...snapshots,
      [basketId]: items,
    }));
    setSavedLists((previous) => [
      ...previous,
      {
        basketId,
        nativeShoppingList: true as const,
        shoppingListName: `Synthetic basket snapshot ${basketId}`,
        productCount: items.length,
        submissionAttempted: false,
      },
    ]);
  };

  return {
    savedBasketCopies,
    savedLists,
    loadSavedLists,
    selectSavedList,
    saveBasketSnapshot,
  };
}

function useWalkthroughProviderState(
  view: WalkthroughViewState,
  busy: boolean,
  setBusy: Dispatch<SetStateAction<boolean>>,
  saveBasketSnapshot: (items: Review["items"]) => void,
) {
  const [submitRequest, setSubmitRequest] = useState<
    Array<{ product_id: number; quantity: number }> | undefined
  >();
  const [submitCount, setSubmitCount] = useState(0);
  const [saveCount, setSaveCount] = useState(0);
  const [basketItems, setBasketItems] = useState(existingBasketItems);

  const submitReview = () => {
    if (busy || view.currentReview.submissionAttempted) {
      return;
    }
    const additions = view.currentReview.items.map(
      ({ product_id, quantity }) => ({ product_id, quantity }),
    );
    setSubmitCount((count) => count + 1);
    setSubmitRequest(additions);
    setBusy(true);
    view.setHostMessage(
      `Simulated AddManyToBasket request #${submitCount + 1}; addToExisting is true.`,
    );
    setTimeout(() => {
      view.showReview(submittedDraft(view.currentReview));
      setBasketItems((previous) =>
        addSimulatedBasketRows(previous, view.currentReview.items),
      );
      setBusy(false);
    }, 250);
  };
  const saveCurrentBasket = () => {
    if (busy || view.currentReview.submission?.status !== "submitted") {
      return;
    }
    const wholeBasket = basketItems.map(({ item, quantity }) => ({
      ...item,
      quantity,
    }));
    setBusy(true);
    setSaveCount((count) => count + 1);
    view.setHostMessage(
      `Simulated CreateShoppingListFromBasket request #${saveCount + 1}; empty request body; entire current basket included.`,
    );
    setTimeout(() => {
      saveBasketSnapshot(wholeBasket);
      const savedReview: Review = {
        ...view.currentReview,
        actionNotice:
          "Basket save acknowledged by simulated provider. The original saved source was left unchanged.",
      };
      view.setCurrentReview(savedReview);
      view.setScreen({ kind: "review", review: savedReview, active: true });
      setBusy(false);
    }, 250);
  };

  return {
    submitRequest,
    submitCount,
    saveCount,
    basketItems,
    submitReview,
    saveCurrentBasket,
  };
}

function directDraft(items: Review["items"], generation: number): Review {
  return {
    basketMode: "direct-basket",
    draftId: `storybook-draft-${generation}`,
    reviewContextId: `12345678-1234-4234-8234-${String(generation).padStart(12, "0")}`,
    destination: "ready",
    items: structuredClone(items),
  };
}

function submittedDraft(value: Review): Review {
  const prepared = prepareReview(value);
  if (!prepared?.submission) {
    return value;
  }
  return {
    ...prepared,
    submissionAttempted: true,
    submission: {
      ...prepared.submission,
      status: "submitted",
      verified_additions: prepared.submission.review.lines?.length,
    },
  };
}

/** The host and provider replies are visible fixtures; only ViewerPage controls are production UI. */
function DirectBasketWalkthrough() {
  const view = useWalkthroughViewState();
  const [busy, setBusy] = useState(false);
  const lists = useWalkthroughListState(view, setBusy);
  const provider = useWalkthroughProviderState(
    view,
    busy,
    setBusy,
    lists.saveBasketSnapshot,
  );
  const {
    screen,
    setScreen,
    currentReview,
    setCurrentReview,
    connectionMessage,
    setConnectionMessage,
    hostMessage,
    setHostMessage,
    destination,
    setDestination,
    reviewDisclosures,
    setReviewDisclosures,
    startEmptyDraft,
  } = view;
  const {
    submitRequest,
    submitCount,
    saveCount,
    basketItems,
    submitReview,
    saveCurrentBasket,
  } = provider;
  const { savedLists, savedBasketCopies, loadSavedLists, selectSavedList } =
    lists;
  const addOatMilk = () => {
    setCurrentReview((previous) => {
      if (previous.items.some(({ product_id }) => product_id === 3)) {
        return previous;
      }
      return {
        ...previous,
        items: [
          ...previous.items,
          { product_id: 3, quantity: 1, state: "ready", view: oatMilk },
        ],
      };
    });
    setHostMessage(
      "Simulated conversation selected 1 × Havredrik øko. for the current draft.",
    );
  };
  const chooseStarterProducts = (prompt: string) => {
    const chosenIds = starterProductIds(prompt);
    const chosenItems = review.items
      .filter((item) => chosenIds.includes(item.product_id))
      .map((item) => ({ ...item, quantity: 1, state: "ready" as const }));
    setBusy(true);
    setConnectionMessage("Simulated host is searching and comparing products…");
    setScreen({ kind: "loading" });
    setHostMessage(
      "Simulated conversation requested product search and comparison.",
    );
    setTimeout(() => {
      setCurrentReview((previous) => {
        const selectedIds = new Set(
          previous.items.map((item) => item.product_id),
        );
        return {
          ...previous,
          items: [
            ...previous.items,
            ...chosenItems.filter((item) => !selectedIds.has(item.product_id)),
          ],
        };
      });
      setScreen({ kind: "review", review: currentReview, active: true });
      setBusy(false);
      setHostMessage(
        `Simulated host selected ${chosenItems.length} product${chosenItems.length === 1 ? "" : "s"} into the temporary draft. No provider write was made.`,
      );
    }, 180);
  };
  const submit = submitReview;
  const openPicker = () => {
    setScreen({ kind: "picker", baskets: savedLists });
    setHostMessage("Simulated app opened saved shopping lists.");
  };
  const onContinueSubmitted = openPicker;
  const currentScreen = walkthroughReviewScreen(screen, currentReview);
  const controls = baseProps(currentScreen, {
    model: {
      busy,
      connectionMessage,
      presentationDestination: destination,
      message: walkthroughProgressMessage(busy, currentReview),
      maxWidth: 375,
      baskets: savedLists,
      selectedBasketId: undefined,
      reviewDisclosures,
      thumbnails: new Map([
        [milk, dairyMilk],
        [pasta, lasagneSheets],
        [oatMilk, oatMilkCarton],
        [butter, butterPackage],
        [tomatoes, tomatoesCan],
      ]),
    },
    actions: {
      onNavigate: setDestination,
      onFactExpandedChange: (productId, factKey, expanded) =>
        setReviewDisclosures((previous) =>
          toggleFactDisclosure(previous, productId, factKey, expanded),
        ),
      onRefresh: () =>
        setHostMessage("Simulated host refreshed the current draft."),
      onOpenPicker: openPicker,
      onAbandonDraft: () => {
        setHostMessage(
          "Discarded the temporary draft; the basket is unchanged.",
        );
        openPicker();
      },
      onSaveCurrentBasketAsShoppingList: saveCurrentBasket,
      onSelectBasket: selectSavedList,
      onQuantity: (item, quantity) =>
        setCurrentReview((previous) =>
          updateQuantity(previous, item.product_id, quantity),
        ),
      onRemove: (item) =>
        setCurrentReview((previous) => removeItem(previous, item.product_id)),
      onOpenAlternatives: (item, query) => {
        setCurrentReview((previous) =>
          alternativesFor(
            previous,
            item.product_id,
            query,
            walkthroughAlternatives.get(item.product_id) ?? [],
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
            findWalkthroughAlternatives(productId, query),
          ),
        ),
      onReplace: (productId, replacementId) => {
        setCurrentReview((previous) =>
          replaceWithAlternative(previous, productId, replacementId),
        );
        setDestination("ready");
      },
      onDiscardPendingUpdate: noop,
      onUseConfirmedProducts: noop,
      onSubmit: submit,
      onConfirmSubmit: submit,
      onContinueSubmitted,
      onInspectBasket: () =>
        setHostMessage("Simulated host opened the existing basket view."),
      onDismissSubmitError: noop,
      onSendFollowUp: chooseStarterProducts,
    },
  });
  controls.model.screen = currentScreen;

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        margin: "0 auto",
        maxWidth: 620,
        padding: 16,
      }}
    >
      <SimulatedHostPanel
        busy={busy}
        hostMessage={hostMessage}
        currentReview={currentReview}
        canSelectOatMilk={canAddOatMilk(busy, screen, currentReview)}
        oatMilkActionLabel={
          currentReview.items.some((item) => item.product_id === 3)
            ? "Havredrik øko. is already in this draft"
            : "Simulate conversation selection: add Havredrik øko."
        }
        onLoadSavedLists={loadSavedLists}
        onStartEmptyDraft={startEmptyDraft}
        onAddOatMilk={addOatMilk}
        submitCount={submitCount}
        saveCount={saveCount}
        submitRequest={submitRequest}
        basketItems={basketItems}
        savedBasketCopies={savedBasketCopies}
      />
      <section aria-label="Simulated Nemlig app tab">
        <ViewerPage {...controls} />
      </section>
    </div>
  );
}

const meta = {
  title: "Picker/Visual contract",
  parameters: {
    docs: {
      description: {
        component:
          "AppTabWalkthrough is the primary simulated host-to-viewer journey. It uses the production ViewerPage with local host/provider fixtures and never initializes MCP, calls tools, or contacts Nemlig. Other stories are focused local interactions or visual snapshots.",
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
  render: () => <DirectBasketWalkthrough />,
  parameters: {
    docs: {
      description: {
        story:
          "Manual local journey: load a saved source into a temporary draft, simulate a host product selection, edit through ViewerPage, explicitly submit, save the whole simulated basket, then open the unchanged source as a fresh draft.",
      },
    },
  },
};
export const AppTabWalkthroughChecks: Story = {
  decorators: [appTab],
  render: () => <DirectBasketWalkthrough />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Load saved shopping lists" }),
    );
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Open shopping list Synthetic weekly shop",
      }),
    );
    await canvas.findByRole("heading", { name: "Temporary basket draft" });
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Simulate conversation selection: add Havredrik øko.",
      }),
    );

    const milkRow = canvas.getByRole("group", { name: "Arla ØKO Minimælk" });
    await userEvent.click(
      within(milkRow).getByRole("button", {
        name: "Show details for Arla ØKO Minimælk",
      }),
    );
    const documentCanvas = within(canvasElement.ownerDocument.body);
    const milkDetails = await documentCanvas.findByRole("dialog");
    await userEvent.click(
      within(milkDetails).getByRole("button", {
        name: "Increase quantity of Arla ØKO Minimælk",
      }),
    );
    await userEvent.click(
      within(milkDetails).getByRole("button", {
        name: "Back to shopping list",
      }),
    );

    const butterSummary = canvas.getByRole("button", {
      name: "Show details for Lurpak Smørbar",
    });
    await fireEvent.keyDown(butterSummary, { key: "F10", shiftKey: true });
    const butterActions = await canvas.findByRole("group", {
      name: "Actions for Lurpak Smørbar",
    });
    await userEvent.click(
      within(butterActions).getByRole("button", { name: "Remove product" }),
    );

    const milkSummary = canvas.getByRole("button", {
      name: "Show details for Arla ØKO Minimælk",
    });
    await fireEvent.keyDown(milkSummary, { key: "F10", shiftKey: true });
    const milkActions = await canvas.findByRole("group", {
      name: "Actions for Arla ØKO Minimælk",
    });
    await userEvent.click(
      within(milkActions).getByRole("button", { name: "Find alternatives" }),
    );
    await canvas.findByRole("heading", { name: "Find an alternative" });
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Use Lasagneplader øko. as the alternative",
      }),
    );
    await canvas.findByRole("group", { name: "Lasagneplader øko." });

    await userEvent.click(
      canvas.getByRole("button", { name: "Add to Nemlig basket" }),
    );
    await canvas.findByRole("heading", {
      name: "Nemlig confirmed the addition",
    });
    await userEvent.click(
      canvas.getByText("Simulation evidence and provider boundary"),
    );
    expect(canvas.getByTestId("simulated-submit-count").textContent).toContain(
      "1",
    );
    expect(
      canvas.getByTestId("simulated-submit-payload").textContent,
    ).toContain('"addToExisting":true');
    expect(canvas.getByTestId("current-basket-rows").textContent).toContain(
      "Hakkede tomater",
    );

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Save current basket as shopping list",
      }),
    );
    await canvas.findByText(/Basket save acknowledged by simulated provider/u);
    expect(canvas.getByTestId("simulated-save-count").textContent).toContain(
      "1",
    );
    expect(
      canvas.getByTestId("saved-basket-snapshot-45").textContent,
    ).toContain("Hakkede tomater");

    await userEvent.click(
      canvas.getByRole("button", { name: "Choose saved shopping lists" }),
    );
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Open shopping list Synthetic weekly shop",
      }),
    );
    await canvas.findByRole("heading", { name: "Temporary basket draft" });
    expect(canvas.getByTestId("simulated-draft-id").textContent).toContain(
      "storybook-draft-3",
    );
    expect(
      canvas.getByRole("group", { name: "Arla ØKO Minimælk" }),
    ).toBeTruthy();
    expect(canvas.getByRole("group", { name: "Lurpak Smørbar" })).toBeTruthy();
    expect(canvas.queryByRole("group", { name: "Havredrik øko." })).toBeNull();
    expect(canvas.getByTestId("simulated-submit-count").textContent).toContain(
      "1",
    );
    await waitFor(() =>
      expect(canvas.getByTestId("saved-source-snapshot").textContent).toContain(
        "Lurpak Smørbar",
      ),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Start a new temporary draft" }),
    );
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Simulate conversation selection: add Havredrik øko.",
      }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Add to Nemlig basket" }),
    );
    await canvas.findByRole("heading", {
      name: "Nemlig confirmed the addition",
    });
    expect(canvas.getByTestId("simulated-submit-count").textContent).toContain(
      "2",
    );
    const finalBasketRows = canvas.getByTestId(
      "current-basket-rows",
    ).textContent;
    expect(finalBasketRows).toContain("Hakkede tomater");
    expect(finalBasketRows).toContain("Lasagneplader øko.");
    expect(finalBasketRows).toContain("Havredrik øko.");

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Save current basket as shopping list",
      }),
    );
    await canvas.findByText(/Basket save acknowledged by simulated provider/u);
    expect(canvas.getByTestId("simulated-save-count").textContent).toContain(
      "2",
    );
    expect(
      canvas.getByTestId("saved-basket-snapshot-46").textContent,
    ).toContain("Lasagneplader øko.");

    await userEvent.click(
      canvas.getByRole("button", { name: "Choose saved shopping lists" }),
    );
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Open shopping list Synthetic basket snapshot 46",
      }),
    );
    await canvas.findByRole("group", { name: "Hakkede tomater" });
    await canvas.findByRole("group", { name: "Lasagneplader øko." });

    await userEvent.click(
      canvas.getByRole("button", { name: "Start a new temporary draft" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Plan groceries for the week" }),
    );
    await canvas.findByRole("group", { name: "Arla ØKO Minimælk" });
    await canvas.findByRole("group", { name: "Lasagneplader øko." });
    expect(canvas.getByTestId("simulated-submit-count").textContent).toContain(
      "2",
    );
  },
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
export const SavingShoppingListEdit: Story = {
  render: () =>
    activeReview(review, "ready", undefined, {
      model: {
        busy: true,
        message: "Saving quantity change to your Nemlig shopping list…",
        pendingQuantities: new Map([[milk.product.id!, 3]]),
      },
    }),
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
