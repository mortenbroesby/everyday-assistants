import { useCallback, useEffect, useRef, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useSwipeable } from "react-swipeable";
import type { ProductView } from "../product-presentation.js";
import {
  ActionFooter,
  DraftListStarters,
  isUsable,
  money,
  OutcomeSurface,
  ProductFacts,
  productName,
  ProductSummary,
  ProductSummaryButton,
  QuantityControl,
  ViewerButton as Button,
  ViewerShell,
} from "./components/index.js";

export type ReviewItem = {
  product_id: number;
  quantity: number;
  state: "needs-review" | "ready";
  view: ProductView;
};
export type Review = {
  review_id: string;
  revision: number;
  destination: "needs-review" | "ready" | "alternatives";
  items: ReviewItem[];
  alternatives?: { product_id: number; query: string; views: ProductView[] };
  submission?: {
    status: "prepared" | "submitted" | "uncertain" | "partial";
    verified_additions?: number;
    submission_id: string;
    review: {
      lines?: Array<{
        product_id: number;
        quantity: number;
        name?: string;
        unit_size?: string;
        item_price?: number;
        line_total?: number;
      }>;
      expected_products_price?: number;
    };
  };
};
export type PresentationDestination = Review["destination"];
export type ViewerPayload = {
  views?: ProductView[];
  products?: ProductView[];
  result?: ProductView[];
  items?: unknown[];
  detail_limit?: number;
  unenriched_count?: number;
  review?: Review;
  view_id?: string;
  unavailable?: boolean;
  ended?: boolean;
};
export type ViewerScreen =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "cancelled" }
  | { kind: "stale" }
  | { kind: "products"; payload: ViewerPayload; views: ProductView[] }
  | { kind: "review"; review: Review; view_id?: string; active: boolean }
  | { kind: "unavailable"; review?: Review }
  | { kind: "empty"; message?: string };

export type ViewerPageModel = {
  screen: ViewerScreen;
  maxWidth?: number;
  presentationDestination?: PresentationDestination;
  reviewDisclosures: ReadonlyMap<
    number,
    { expanded: boolean; facts: ReadonlySet<string> }
  >;
  pendingQuantities: ReadonlyMap<number, number>;
  thumbnails: ReadonlyMap<ProductView, string>;
  message: string;
  connectionMessage?: string;
  busy: boolean;
  activatingCurrent: boolean;
  confirmSubmit: boolean;
  confirmEnd: boolean;
  continueSubmitted: boolean;
  submitBlocked: boolean;
};

export type ViewerPageActions = {
  onNavigate: (destination: PresentationDestination) => void;
  onDisclosureChange: (productId: number, expanded: boolean) => void;
  onFactExpandedChange: (
    productId: number,
    factKey: string,
    expanded: boolean,
  ) => void;
  onActivateCurrent: () => void;
  onQuantity: (item: ReviewItem, quantity: number) => void;
  onRemove: (item: ReviewItem) => void;
  onOpenAlternatives: (item: ReviewItem, query: string) => void;
  onSearchAlternatives: (productId: number, query: string) => void;
  onReplace: (productId: number, replacementId: number) => void;
  onPrepareSubmission: () => void;
  onRequestSubmitConfirmation: () => void;
  onCancelSubmit: () => void;
  onConfirmSubmit: () => void;
  onContinueSubmitted: () => void;
  onInspectBasket: () => void;
  onSendFollowUp: (text: string) => void;
  onRequestEnd: () => void;
  onCancelEnd: () => void;
  onConfirmEnd: () => void;
};

export type ViewerPageProps = {
  model: ViewerPageModel;
  actions: ViewerPageActions;
};

// Kept as one component because its local focus, disclosure, and controls share one product row.
// fallow-ignore-next-line complexity
function ProductCard({
  view,
  item,
  disabled,
  thumbnailSrc,
  onQuantity,
  onRemove,
  onChoice,
  choiceSelected,
  onOpenAlternatives,
  expanded,
  onExpandedChange,
  expandedFacts,
  onFactExpandedChange,
  comparison = false,
}: {
  view: ProductView;
  item?: ReviewItem;
  disabled: boolean;
  thumbnailSrc?: string;
  onQuantity?: (quantity: number) => void;
  onRemove?: () => void;
  onChoice?: () => void;
  choiceSelected?: boolean;
  onOpenAlternatives?: () => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  expandedFacts?: ReadonlySet<string>;
  onFactExpandedChange?: (factKey: string, expanded: boolean) => void;
  comparison?: boolean;
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeAction, setSwipeAction] = useState<"remove" | "alternative">();
  const actionPress = useRef(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const swipeHandlers = useSwipeable({
    delta: 8,
    onSwiping: ({ deltaX, dir }) => {
      if (dir !== "Left" && dir !== "Right") {
        return;
      }
      actionPress.current = false;
      setSwipeAction(undefined);
      setSwipeOffset(deltaX);
    },
    onSwiped: ({ absX, dir }) => {
      actionPress.current = false;
      setSwipeOffset(0);
      const width = rowRef.current?.clientWidth ?? 0;
      setSwipeAction(
        width > 0 && absX > width / 2
          ? dir === "Left"
            ? "remove"
            : dir === "Right"
              ? "alternative"
              : undefined
          : undefined,
      );
    },
    onTouchEndOrOnMouseUp: () => setSwipeOffset(0),
    trackMouse: true,
    preventScrollOnSwipe: false,
  });
  const setSwipeRef = useCallback(
    (element: HTMLDivElement | null) => {
      rowRef.current = element;
      swipeHandlers.ref(element);
    },
    [swipeHandlers.ref],
  );
  const transform =
    swipeOffset !== 0
      ? `${swipeOffset}px`
      : swipeAction === "remove"
        ? "-55%"
        : swipeAction === "alternative"
          ? "55%"
          : "0";
  const disclosureExpanded = expanded ?? localExpanded;
  const setDisclosureExpanded = onExpandedChange ?? setLocalExpanded;
  const quantity =
    item?.quantity ??
    (view.status === "complete"
      ? view.context === "basket"
        ? view.basket?.quantity
        : view.context === "review"
          ? view.review?.quantity
          : undefined
      : undefined);
  const count = quantity ?? 0;
  const reviewControls = item && (
    <div className="review-controls">
      <QuantityControl
        label={productName(view, item.product_id)}
        quantity={count}
        disabled={disabled}
        onQuantity={onQuantity}
      />
      <Button color="secondary" disabled={disabled} onClick={onRemove}>
        Remove from Local basket
      </Button>
      <Button
        color="secondary"
        disabled={disabled}
        onClick={onOpenAlternatives}
      >
        Find alternative
      </Button>
    </div>
  );
  const swipeActions = item && !comparison && (
    <>
      {swipeAction === "remove" && onRemove && (
        <Button
          color="secondary"
          disabled={disabled}
          className="swipe-action swipe-remove"
          aria-label={`Remove ${productName(view, item.product_id)} from Local basket`}
          onPointerDown={() => {
            actionPress.current = true;
          }}
          onPointerCancel={() => {
            actionPress.current = false;
          }}
          onClick={(event) => {
            if (event.detail !== 0 && !actionPress.current) {
              event.preventDefault();
              return;
            }
            actionPress.current = false;
            setSwipeAction(undefined);
            onRemove();
          }}
        >
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m5 4v7m4-7v7" />
          </svg>
          Remove
        </Button>
      )}
      {swipeAction === "alternative" && onOpenAlternatives && (
        <Button
          color="secondary"
          disabled={disabled}
          className="swipe-action swipe-alternative"
          aria-label={`Find an alternative to ${productName(view, item.product_id)}`}
          onPointerDown={() => {
            actionPress.current = true;
          }}
          onPointerCancel={() => {
            actionPress.current = false;
          }}
          onClick={(event) => {
            if (event.detail !== 0 && !actionPress.current) {
              event.preventDefault();
              return;
            }
            actionPress.current = false;
            setSwipeAction(undefined);
            onOpenAlternatives();
          }}
        >
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="10" cy="10" r="6" />
            <path d="m14.5 14.5 5.5 5.5" />
          </svg>
          Find alternative
        </Button>
      )}
    </>
  );
  const summary = (
    <ProductSummary
      view={view}
      quantity={quantity}
      thumbnailSrc={thumbnailSrc}
    />
  );
  const details =
    view.status === "complete" ? (
      <>
        <ProductFacts
          view={view}
          expandedFacts={expandedFacts}
          onFactExpandedChange={onFactExpandedChange}
        />
        {item && reviewControls}
      </>
    ) : (
      <>
        {item && <p>{item.quantity} ×</p>}
        {item && reviewControls}
      </>
    );
  return (
    <div
      className="basket-swipe-row"
      data-product-id={item?.product_id}
      {...(item && !comparison ? swipeHandlers : {})}
      ref={item && !comparison ? setSwipeRef : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && swipeAction) {
          actionPress.current = false;
          setSwipeAction(undefined);
          setSwipeOffset(0);
          if ((event.target as HTMLElement).closest(".swipe-action")) {
            rowRef.current
              ?.querySelector<HTMLButtonElement>("button[aria-expanded]")
              ?.focus();
          }
        }
      }}
    >
      {swipeActions}
      <article
        className={`product-card${comparison ? " product-comparison" : ""}`}
        inert={Boolean(swipeAction)}
        style={{
          transform: `translateX(${transform})`,
          transition: swipeOffset !== 0 ? "none" : undefined,
        }}
      >
        <div className="product-details">
          {comparison ? (
            onChoice ? (
              <button
                type="button"
                className="product-comparison-summary alternative-choice"
                aria-label={`Select ${productName(view)} as the alternative`}
                aria-pressed={choiceSelected === true}
                disabled={disabled || !isUsable(view)}
                onClick={onChoice}
              >
                {summary}
                <span className="alternative-choice-state" aria-hidden="true">
                  {choiceSelected ? "Selected" : "Select"}
                </span>
              </button>
            ) : (
              <div className="product-comparison-summary">{summary}</div>
            )
          ) : (
            <Collapsible.Root
              open={disclosureExpanded}
              onOpenChange={setDisclosureExpanded}
              disabled={disabled}
            >
              <Collapsible.Trigger asChild>
                <ProductSummaryButton
                  color="secondary"
                  variant="ghost"
                  data-viewer-component="product-summary"
                >
                  {summary}
                </ProductSummaryButton>
              </Collapsible.Trigger>
              <Collapsible.Content className="product-expanded">
                {details}
              </Collapsible.Content>
            </Collapsible.Root>
          )}
          {comparison && (
            <div className="product-expanded product-comparison-details">
              <ProductFacts view={view} />
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

// The existing screen state machine is rendered here so production and Storybook cannot drift.
// fallow-ignore-next-line complexity
export function ViewerPage({ model, actions }: ViewerPageProps) {
  const [alternativeChoice, setAlternativeChoice] = useState<
    { key: string; productId: number } | undefined
  >();
  const alternativeOpener = useRef<HTMLElement | null>(null);
  const alternativeProductId = useRef<number | undefined>(undefined);
  const alternativeHeading = useRef<HTMLHeadingElement | null>(null);
  const wasShowingAlternatives = useRef(false);
  const {
    screen,
    maxWidth,
    presentationDestination,
    reviewDisclosures,
    pendingQuantities,
    thumbnails,
    message,
    connectionMessage,
    busy,
    activatingCurrent,
    confirmSubmit,
    confirmEnd,
    continueSubmitted,
    submitBlocked,
  } = model;
  const review = screen.kind === "review" ? screen.review : undefined;
  const active = screen.kind === "review" && screen.active;
  const destination = review
    ? (presentationDestination ?? review.destination)
    : undefined;
  const safeTitle =
    destination === "alternatives" ? "Find an alternative" : "Local basket";
  const visibleProductCount = review?.items.length ?? 0;
  const alternatives = review?.alternatives;
  const alternativesKey = alternatives
    ? `${review?.review_id}:${alternatives.product_id}:${alternatives.query}`
    : undefined;
  const showingAlternatives = Boolean(
    review && active && destination === "alternatives" && alternatives,
  );
  useEffect(() => {
    if (showingAlternatives && !wasShowingAlternatives.current) {
      alternativeHeading.current?.focus();
    } else if (!showingAlternatives && wasShowingAlternatives.current) {
      const opener = alternativeOpener.current;
      if (opener?.isConnected) {
        opener.focus();
      } else {
        const source = alternativeProductId.current;
        const sourceSummary =
          source === undefined
            ? null
            : document.querySelector<HTMLButtonElement>(
                `.product-list [data-product-id="${source}"] button[aria-expanded]`,
              );
        (
          sourceSummary ??
          document.querySelector<HTMLButtonElement>(
            '.product-list button[aria-expanded="false"], .product-list button[aria-expanded="true"]',
          )
        )?.focus();
      }
    }
    wasShowingAlternatives.current = showingAlternatives;
  }, [showingAlternatives]);
  const selectedAlternativeId =
    alternativeChoice &&
    alternativesKey &&
    alternativeChoice.key === alternativesKey
      ? alternativeChoice.productId
      : undefined;
  const productPayload =
    screen.kind === "products" ? screen.payload : undefined;
  const basket =
    productPayload?.detail_limit !== undefined &&
    Array.isArray(productPayload.items);
  const partialSubmission = review?.submission?.status === "partial";
  const uncertainSubmission =
    submitBlocked || review?.submission?.status === "uncertain";
  const editsBlocked =
    busy ||
    uncertainSubmission ||
    partialSubmission ||
    (review?.submission?.status === "submitted" && !continueSubmitted);
  const terminalSubmission =
    uncertainSubmission ||
    partialSubmission ||
    (review?.submission?.status === "submitted" && !continueSubmitted);
  const hasActiveProducts = Boolean(
    review && active && review.items.length > 0,
  );
  const title =
    review && active && terminalSubmission
      ? review.submission?.status === "submitted"
        ? "Added to Nemlig basket"
        : partialSubmission
          ? "Addition stopped early"
          : "Check your Nemlig basket"
      : review && active
        ? review.items.length
          ? safeTitle
          : "What should we shop for?"
        : basket
          ? "Actual Nemlig basket"
          : screen.kind === "unavailable"
            ? "Local basket unavailable"
            : screen.kind === "review"
              ? "Your Local basket"
              : "Products";
  const intro = !terminalSubmission
    ? review && active
      ? review.items.length === 0
        ? "Start a Local basket in conversation."
        : safeTitle === "Find an alternative"
          ? "Compare available options for this product."
          : "Review products in your local basket. Open a product for details or swipe for an action."
      : basket
        ? "Your current Nemlig basket. This view cannot change it."
        : "Inspect product details here or continue in conversation."
    : undefined;
  const outcomeOnly =
    terminalSubmission ||
    screen.kind === "empty" ||
    (review && active && review.items.length === 0);
  const disclosureProps = (productId: number) => {
    const disclosure = reviewDisclosures.get(productId);
    return {
      expanded: disclosure?.expanded ?? false,
      onExpandedChange: (expanded: boolean) =>
        actions.onDisclosureChange(productId, expanded),
      expandedFacts: disclosure?.facts,
      onFactExpandedChange: (factKey: string, expanded: boolean) =>
        actions.onFactExpandedChange(productId, factKey, expanded),
    };
  };
  const thumbnail = (view: ProductView) => thumbnails.get(view);
  return (
    <ViewerShell
      title={outcomeOnly ? undefined : title}
      intro={outcomeOnly ? undefined : intro}
      maxWidth={maxWidth}
    >
      {screen.kind === "loading" && (
        <p className="status" role="status">
          Loading your Nemlig selection…
        </p>
      )}
      {screen.kind === "loading" && connectionMessage && (
        <p className="status" role="status">
          {connectionMessage}
        </p>
      )}
      {screen.kind === "error" && (
        <section className="status">
          <p role="alert">{screen.message}</p>
          <p>Continue in conversation to inspect the current Local basket.</p>
        </section>
      )}
      {screen.kind === "cancelled" && (
        <section className="status">
          <p>
            Request cancelled. Continue in conversation to confirm the current
            Local basket before continuing.
          </p>
        </section>
      )}
      {screen.kind === "stale" && (
        <section className="status">
          <p>This Local basket card is out of date and cannot make changes.</p>
          <Button
            color="primary"
            disabled={activatingCurrent}
            onClick={actions.onActivateCurrent}
          >
            {activatingCurrent ? "Opening…" : "Reopen in conversation"}
          </Button>
          {message && <p role="status">{message}</p>}
        </section>
      )}
      {screen.kind === "review" && review && !active && !terminalSubmission && (
        <section className="status">
          <p>
            This Local basket card is inactive.{" "}
            {review.items.length
              ? "The current Local basket is shown read-only."
              : "No current Local basket is available."}
          </p>
          {review.items.length > 0 && (
            <Button
              color="primary"
              disabled={activatingCurrent || busy}
              onClick={actions.onActivateCurrent}
            >
              {activatingCurrent ? "Opening…" : "Reopen in conversation"}
            </Button>
          )}
          {message && <p role="status">{message}</p>}
        </section>
      )}
      {review && !active && !terminalSubmission && review.items.length > 0 && (
        <section
          className="product-list"
          aria-label="Current Local basket, read only"
        >
          {review.items.map((item) => (
            <ProductCard
              key={item.product_id}
              view={item.view}
              thumbnailSrc={thumbnail(item.view)}
              disabled
            />
          ))}
        </section>
      )}
      {screen.kind === "unavailable" && (
        <section className="status">
          <p>
            This temporary Local basket is no longer available. Ask in chat
            before starting a new Local basket. Previous choices or submission
            approval are not restored.
          </p>
        </section>
      )}
      {review &&
        active &&
        !terminalSubmission &&
        destination === "alternatives" &&
        review.alternatives && (
          <section className="alternatives" aria-label="Find an alternative">
            <div className="alternatives-scroll">
              <Button
                color="secondary"
                disabled={uncertainSubmission}
                onClick={() => actions.onNavigate("ready")}
              >
                Back to Local basket
              </Button>
              <h2 ref={alternativeHeading} tabIndex={-1}>
                Find an alternative
              </h2>
              <section
                className="alternatives-current"
                aria-labelledby="current-product-title"
              >
                <h2 id="current-product-title">Current product</h2>
                {review.items
                  .filter(
                    (item) =>
                      item.product_id === review.alternatives?.product_id,
                  )
                  .map((item) => (
                    <ProductCard
                      key={item.product_id}
                      view={item.view}
                      thumbnailSrc={thumbnail(item.view)}
                      disabled={busy}
                      {...disclosureProps(item.product_id)}
                    />
                  ))}
              </section>
              <form
                key={`${review.review_id}:${review.alternatives.product_id}:${review.alternatives.query}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  const query = String(
                    new FormData(event.currentTarget).get("query") ?? "",
                  );
                  if (query.trim()) {
                    setAlternativeChoice(undefined);
                    actions.onSearchAlternatives(
                      review.alternatives!.product_id,
                      query.slice(0, 200),
                    );
                  }
                }}
              >
                <label htmlFor="alternative-query">
                  Search for more products
                </label>
                <input
                  id="alternative-query"
                  name="query"
                  type="search"
                  maxLength={200}
                  defaultValue={review.alternatives.query}
                />
                <Button color="secondary" type="submit" disabled={editsBlocked}>
                  Search products
                </Button>
              </form>
              <section
                className="alternative-options"
                aria-labelledby="alternative-options-title"
              >
                <h2 id="alternative-options-title">Alternatives</h2>
                {review.alternatives.views.length === 0 ? (
                  <p className="alternatives-empty" role="status">
                    No alternatives were returned. Try another search.
                  </p>
                ) : (
                  <div>
                    {review.alternatives.views.map((view, index) => {
                      const id =
                        view.status === "complete"
                          ? view.product.id
                          : view.product_id;
                      return (
                        <ProductCard
                          key={`${id}:${index}`}
                          view={view}
                          thumbnailSrc={thumbnail(view)}
                          disabled={editsBlocked}
                          comparison
                          choiceSelected={selectedAlternativeId === id}
                          {...(id === undefined ? {} : disclosureProps(id))}
                          onChoice={() => {
                            if (id !== undefined && alternativesKey) {
                              setAlternativeChoice({
                                key: alternativesKey,
                                productId: id,
                              });
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
            <footer className="alternative-footer">
              <Button
                color="primary"
                disabled={editsBlocked || selectedAlternativeId === undefined}
                onClick={() => {
                  if (selectedAlternativeId !== undefined) {
                    alternativeProductId.current = selectedAlternativeId;
                    actions.onReplace(
                      alternatives!.product_id,
                      selectedAlternativeId,
                    );
                    setAlternativeChoice(undefined);
                  }
                }}
              >
                Use selected alternative
              </Button>
            </footer>
          </section>
        )}
      {screen.kind === "products" && screen.views.length > 0 && (
        <section className="product-list" aria-label="Product results">
          {screen.views.map((view, index) => (
            <ProductCard
              key={`${view.status === "complete" ? view.product.id : view.product_id}:${index}`}
              view={view}
              thumbnailSrc={thumbnail(view)}
              disabled={busy}
            />
          ))}
        </section>
      )}
      {review &&
        active &&
        !terminalSubmission &&
        visibleProductCount > 0 &&
        destination !== "alternatives" && (
          <section className="product-list" aria-label="Local basket products">
            {review.items.map((item) => {
              const alternativeQuery =
                item.view.status === "complete"
                  ? (
                      item.view.product.subcategory ??
                      item.view.product.name ??
                      String(item.product_id)
                    ).slice(0, 200)
                  : String(item.product_id);
              return (
                <ProductCard
                  key={item.product_id}
                  view={item.view}
                  thumbnailSrc={thumbnail(item.view)}
                  {...disclosureProps(item.product_id)}
                  item={{
                    ...item,
                    quantity:
                      pendingQuantities.get(item.product_id) ?? item.quantity,
                  }}
                  disabled={editsBlocked}
                  onQuantity={(quantity) => actions.onQuantity(item, quantity)}
                  onRemove={() => actions.onRemove(item)}
                  onOpenAlternatives={() => {
                    alternativeProductId.current = item.product_id;
                    alternativeOpener.current =
                      document.activeElement instanceof HTMLElement
                        ? document.activeElement
                        : null;
                    actions.onOpenAlternatives(item, alternativeQuery);
                  }}
                />
              );
            })}
          </section>
        )}
      {review &&
        terminalSubmission &&
        review.submission?.status === "submitted" && (
          <OutcomeSurface tone="success" title="Nemlig confirmed the addition">
            <p role="status">
              Only the prepared products were added. Your real Nemlig basket was
              verified after the addition.
            </p>
            <Button
              color="secondary"
              disabled={busy}
              onClick={actions.onContinueSubmitted}
            >
              Continue with Local basket
            </Button>
          </OutcomeSurface>
        )}
      {review && terminalSubmission && uncertainSubmission && (
        <OutcomeSurface tone="warning" title="We could not verify the addition">
          <p role="status">
            Inspect the actual Nemlig basket before making another request.
            Nemlig Assistant will not retry automatically.
          </p>
          <Button
            color="secondary"
            disabled={busy}
            onClick={actions.onInspectBasket}
          >
            Inspect Nemlig basket in conversation
          </Button>
        </OutcomeSurface>
      )}
      {review && terminalSubmission && partialSubmission && (
        <OutcomeSurface tone="warning" title="Some additions were confirmed">
          <p role="status">
            {review.submission?.verified_additions === 1
              ? "One product was confirmed in your Nemlig basket."
              : `${review.submission?.verified_additions ?? "Some"} products were confirmed in your Nemlig basket.`}{" "}
            No later product was sent after the safety check stopped the
            addition.
          </p>
          <p>
            Inspect the actual Nemlig basket before preparing another request.
            Nemlig Assistant will not retry automatically.
          </p>
          <Button
            color="secondary"
            disabled={busy}
            onClick={actions.onInspectBasket}
          >
            Inspect Nemlig basket in conversation
          </Button>
        </OutcomeSurface>
      )}
      {review &&
        active &&
        !terminalSubmission &&
        destination !== "alternatives" && (
          <ActionFooter>
            {review.submission?.status !== "prepared" && (
              <Button
                color="primary"
                block
                disabled={editsBlocked}
                onClick={actions.onPrepareSubmission}
              >
                Submit to Nemlig
              </Button>
            )}
            {review.submission?.status === "prepared" && (
              <OutcomeSurface title="Ready to submit the Local basket">
                {review.submission.review.lines?.map((line) => (
                  <p key={line.product_id}>
                    {line.quantity} ×{" "}
                    {line.name ?? `Product ${line.product_id}`} ·{" "}
                    {money(line.item_price)} each · {money(line.line_total)}
                  </p>
                ))}
                <p>
                  Expected product total:{" "}
                  {money(review.submission.review.expected_products_price)}
                </p>
                {submitBlocked ? (
                  <p>
                    Inspect the actual Nemlig basket in conversation before
                    preparing another change.
                  </p>
                ) : confirmSubmit ? (
                  <>
                    <p>Add only these exact quantities to the Nemlig basket?</p>
                    <Button
                      color="secondary"
                      disabled={busy}
                      onClick={actions.onCancelSubmit}
                    >
                      Cancel
                    </Button>
                    <Button
                      color="primary"
                      disabled={busy}
                      onClick={actions.onConfirmSubmit}
                    >
                      Add to Nemlig
                    </Button>
                  </>
                ) : (
                  <Button
                    color="primary"
                    disabled={busy}
                    onClick={actions.onRequestSubmitConfirmation}
                  >
                    Add to Nemlig basket
                  </Button>
                )}
              </OutcomeSurface>
            )}
            {message &&
              review.submission?.status !== "uncertain" &&
              review.submission?.status !== "partial" && (
                <p className="status" role="status">
                  {message}
                </p>
              )}
          </ActionFooter>
        )}
      {review && active && !terminalSubmission && review.items.length === 0 && (
        <DraftListStarters
          message="Your Local basket is empty. Nothing changed in Nemlig."
          onChoose={actions.onSendFollowUp}
        />
      )}
      {review && active && !terminalSubmission && hasActiveProducts && (
        <>
          <Button
            color="secondary"
            block
            className="clear-local-basket"
            disabled={editsBlocked || busy}
            onClick={actions.onRequestEnd}
          >
            Clear
          </Button>
          {confirmEnd && (
            <section className="submission">
              <p>
                Discard this Local basket? The Nemlig basket will not change.
              </p>
              <Button
                color="secondary"
                disabled={busy}
                onClick={actions.onCancelEnd}
              >
                Keep Local basket
              </Button>
              <Button
                color="secondary"
                disabled={busy}
                onClick={actions.onConfirmEnd}
              >
                Confirm discard Local basket
              </Button>
            </section>
          )}
        </>
      )}
      {screen.kind === "empty" && (
        <DraftListStarters
          message={
            screen.message ??
            "Your Local basket is empty. Nothing changed in Nemlig."
          }
          onChoose={actions.onSendFollowUp}
        />
      )}
      {screen.kind === "products" && screen.views.length === 0 && (
        <div className="empty" role="status">
          {basket ? "Your Nemlig basket is empty." : "No products found."}
        </div>
      )}
      {productPayload?.unenriched_count ? (
        <p className="status">
          {productPayload.unenriched_count} basket lines do not have current
          product details.
        </p>
      ) : null}
      {message &&
        screen.kind !== "error" &&
        screen.kind !== "stale" &&
        !(screen.kind === "review" && !active) &&
        destination !== "ready" && (
          <p className="status" role="status">
            {message}
          </p>
        )}
    </ViewerShell>
  );
}
