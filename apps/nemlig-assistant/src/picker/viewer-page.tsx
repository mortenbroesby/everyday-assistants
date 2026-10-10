import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDrag } from "@use-gesture/react";
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
  destination: "needs-review" | "ready" | "alternatives";
  items: ReviewItem[];
  alternatives?: { product_id: number; query: string; views: ProductView[] };
  submission?: {
    status: "prepared" | "submitted" | "uncertain" | "partial";
    verified_additions?: number;
    skipped_products?: Array<{ product_id: number; name: string }>;
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
      skipped_products?: Array<{ product_id: number; name: string }>;
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
  unavailable?: boolean;
  ended?: boolean;
};
export type ViewerScreen =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "cancelled" }
  | { kind: "products"; payload: ViewerPayload; views: ProductView[] }
  | { kind: "review"; review: Review; active: boolean }
  | { kind: "unavailable"; review?: Review }
  | { kind: "empty"; message?: string };

export type ViewerPageModel = {
  screen: ViewerScreen;
  maxWidth?: number;
  presentationDestination?: PresentationDestination;
  reviewDisclosures: ReadonlyMap<number, ReadonlySet<string>>;
  pendingQuantities: ReadonlyMap<number, number>;
  thumbnails: ReadonlyMap<ProductView, string>;
  message: string;
  connectionMessage?: string;
  busy: boolean;
  confirmSubmit: boolean;
  confirmEnd: boolean;
  continueSubmitted: boolean;
  submitBlocked: boolean;
};

export type ViewerPageActions = {
  onNavigate: (destination: PresentationDestination) => void;
  onFactExpandedChange: (
    productId: number,
    factKey: string,
    expanded: boolean,
  ) => void;
  onRefresh: () => void;
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

// Kept as one component because its swipe gesture, details, and controls share one product row.
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
  expandedFacts?: ReadonlySet<string>;
  onFactExpandedChange?: (factKey: string, expanded: boolean) => void;
  comparison?: boolean;
}) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const cancelSwipe = useRef<(() => void) | undefined>(undefined);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const summaryRef = useRef<HTMLButtonElement | null>(null);
  const closeActions = () => {
    setActionsOpen(false);
    requestAnimationFrame(() =>
      summaryRef.current?.focus({ preventScroll: true }),
    );
  };
  useLayoutEffect(() => {
    if (actionsOpen) {
      actionsRef.current?.focus({ preventScroll: true });
    }
  }, [actionsOpen]);
  useLayoutEffect(() => {
    if (disabled) {
      cancelSwipe.current?.();
      setSwipeOffset(0);
    }
  }, [disabled]);
  const bindSwipe = useDrag(
    ({
      active,
      down,
      last,
      cancel,
      canceled,
      event,
      xy: [x, y],
      initial: [startX, startY],
    }) => {
      cancelSwipe.current = down && !canceled ? cancel : undefined;
      const dx = x - startX;
      const dy = Math.abs(y - startY);
      setSwipeOffset(active ? Math.min(0, dx) : 0);
      // The library also ends drags on cancellation or lost capture; only release opens actions.
      if (
        last &&
        !canceled &&
        ["pointerup", "touchend", "mouseup"].includes(event.type) &&
        dx <= -48 &&
        -dx > dy * 1.5
      ) {
        setActionsOpen(true);
      }
    },
    {
      enabled: Boolean(item) && !comparison && !disabled,
      axis: "x",
      axisThreshold: { mouse: 10, touch: 10, pen: 10 },
      threshold: 10,
      filterTaps: true,
      // Capture cancellation even before the movement threshold is crossed.
      triggerAllEvents: true,
      tapsThreshold: 10,
      pointer: { keys: false },
    },
  );
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
  const quantityControl = item && (
    <QuantityControl
      label={productName(view, item.product_id)}
      quantity={count}
      disabled={disabled}
      onQuantity={onQuantity}
    />
  );
  const actionControls = (
    <div className="product-action-controls">
      <button
        type="button"
        className="product-action-item product-action-icon"
        aria-label="Remove product"
        disabled={!onRemove || disabled}
        onClick={() => {
          setOverlayOpen(false);
          rowRef.current?.closest<HTMLElement>(".viewer")?.focus();
          onRemove?.();
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
        </svg>
      </button>
      <button
        type="button"
        className="product-action-item product-action-icon"
        aria-label="Find alternatives"
        title="Find alternatives"
        disabled={!onOpenAlternatives || disabled}
        onClick={() => {
          setActionsOpen(false);
          setOverlayOpen(false);
          onOpenAlternatives?.();
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8h14m-4-4 4 4-4 4M19 16H5m4-4-4 4 4 4" />
        </svg>
      </button>
      {quantityControl}
    </div>
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
      </>
    ) : (
      <>{item && <p>{item.quantity} ×</p>}</>
    );
  return (
    <div
      className="product-action-row"
      data-actions-open={actionsOpen || undefined}
      data-swiping={swipeOffset !== 0 || undefined}
      data-product-id={item?.product_id}
      role={item && !comparison ? "group" : undefined}
      aria-label={
        item && !comparison ? productName(view, item.product_id) : undefined
      }
      ref={rowRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && actionsOpen) {
          event.stopPropagation();
          closeActions();
        }
      }}
    >
      <Dialog.Root open={overlayOpen} onOpenChange={setOverlayOpen}>
        <article
          className={`product-card${comparison ? " product-comparison" : ""}`}
          inert={actionsOpen}
          style={{
            transform: `translateX(${actionsOpen ? "-100%" : `${swipeOffset}px`})`,
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
              <ProductSummaryButton
                ref={summaryRef}
                color="secondary"
                variant="ghost"
                data-viewer-component="product-summary"
                aria-label={`Show details for ${productName(view, item?.product_id)}`}
                aria-keyshortcuts={item ? "Shift+F10" : undefined}
                aria-description={
                  item
                    ? "Swipe from right to left for actions or press Shift+F10"
                    : undefined
                }
                disabled={disabled}
                {...bindSwipe()}
                onContextMenu={(event) => event.preventDefault()}
                onKeyDown={(event) => {
                  if (
                    item &&
                    (event.key === "ContextMenu" ||
                      (event.shiftKey && event.key === "F10"))
                  ) {
                    event.preventDefault();
                    setActionsOpen(true);
                  }
                }}
                onClick={() => setOverlayOpen(true)}
              >
                {summary}
              </ProductSummaryButton>
            )}
            {comparison && (
              <div className="product-expanded product-comparison-details">
                <ProductFacts view={view} />
              </div>
            )}
          </div>
        </article>
        {actionsOpen && (
          <div
            className="product-inline-actions"
            role="group"
            aria-label={`Actions for ${productName(view, item?.product_id)}`}
            tabIndex={-1}
            ref={actionsRef}
          >
            <div className="product-inline-header">
              <strong>{productName(view, item?.product_id)}</strong>
              <button
                type="button"
                aria-label="Close product actions"
                onClick={closeActions}
              >
                ×
              </button>
            </div>
            {actionControls}
          </div>
        )}
        {!comparison && (
          <Dialog.Portal>
            <Dialog.Overlay className="product-overlay-backdrop" />
            <Dialog.Content
              className="product-detail-modal"
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (actionsOpen) {
                  actionsRef.current?.focus({ preventScroll: true });
                } else {
                  summaryRef.current?.focus();
                }
              }}
            >
              <div className="product-overlay-header">
                <Dialog.Title>
                  {productName(view, item?.product_id)}
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" aria-label="Close product overlay">
                    ×
                  </button>
                </Dialog.Close>
              </div>
              <div className="product-overlay-details">
                {summary}
                {details}
                {item && actionControls}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </Dialog.Root>
    </div>
  );
}

function BasketList({
  items,
  renderItem,
}: {
  items: ReviewItem[];
  renderItem: (item: ReviewItem) => ReactNode;
}) {
  // Keep virtual rows mounted as the basket shrinks so removal does not drop focus.
  const [virtual, setVirtual] = useState(() => items.length > 8);
  useEffect(() => {
    if (items.length > 8) {
      setVirtual(true);
    }
  }, [items.length]);
  const listRef = useRef<HTMLElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    if (!virtual) {
      return;
    }
    const list = listRef.current;
    const scroller = list?.closest<HTMLElement>(".viewer");
    if (list && scroller) {
      setScrollMargin(
        list.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop,
      );
    }
  }, [virtual]);
  const virtualizer = useVirtualizer({
    count: virtual ? items.length : 0,
    getScrollElement: () =>
      listRef.current?.closest<HTMLElement>(".viewer") ?? null,
    estimateSize: () => 140,
    getItemKey: (index) => items[index]?.product_id ?? index,
    scrollMargin,
    overscan: 3,
    useFlushSync: false,
  });
  return (
    <section
      ref={listRef}
      className="product-list"
      aria-label="Local basket products"
    >
      {virtual ? (
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              ref={virtualizer.measureElement}
              data-index={row.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${row.start - scrollMargin}px)`,
              }}
            >
              {renderItem(items[row.index]!)}
            </div>
          ))}
        </div>
      ) : (
        items.map(renderItem)
      )}
    </section>
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
  const removalFocus = useRef<{ removedId: number; nextId?: number } | null>(
    null,
  );
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
    confirmSubmit,
    confirmEnd,
    continueSubmitted,
    submitBlocked,
  } = model;
  const review = screen.kind === "review" ? screen.review : undefined;
  const active = screen.kind === "review" && screen.active;
  useLayoutEffect(() => {
    const pending = removalFocus.current;
    if (
      !pending ||
      review?.items.some((item) => item.product_id === pending.removedId)
    ) {
      return;
    }
    removalFocus.current = null;
    const nextRow =
      pending.nextId === undefined
        ? null
        : document.querySelector<HTMLElement>(
            `.product-list [data-product-id="${pending.nextId}"]`,
          );
    const next = nextRow?.querySelector<HTMLElement>(
      '.product-inline-actions, article:not([inert]) [data-viewer-component="product-summary"]',
    );
    (next ?? document.querySelector<HTMLElement>(".viewer"))?.focus();
  }, [review?.items]);
  const destination = review
    ? (presentationDestination ?? review.destination)
    : undefined;
  const safeTitle =
    destination === "alternatives" ? "Find an alternative" : "Local basket";
  const visibleProductCount = review?.items.length ?? 0;
  const hasUnreadyItem = review?.items.some(({ view }) =>
    view.status === "unavailable"
      ? view.missing !== true
      : view.product.available === undefined,
  );
  const hasUnavailableItem = review?.items.some(({ view }) =>
    view.status === "unavailable"
      ? view.missing === true
      : view.product.available === false,
  );
  const alternatives = review?.alternatives;
  const alternativesKey = alternatives
    ? `${alternatives.product_id}:${alternatives.query}`
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
                `.product-list [data-product-id="${source}"] [data-viewer-component="product-summary"]`,
              );
        (
          sourceSummary ??
          document.querySelector<HTMLButtonElement>(
            '.product-list [data-viewer-component="product-summary"]',
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
        ? review.submission.skipped_products?.length
          ? "Nemlig basket update"
          : "Added to Nemlig basket"
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
          : "Tap a product for details, or swipe from right to left for actions."
      : basket
        ? "Your current Nemlig basket. This view cannot change it."
        : "Inspect product details here or continue in conversation."
    : undefined;
  const outcomeOnly =
    terminalSubmission ||
    screen.kind === "empty" ||
    (review && active && review.items.length === 0);
  const disclosureProps = (productId: number) => ({
    expandedFacts: reviewDisclosures.get(productId),
    onFactExpandedChange: (factKey: string, expanded: boolean) =>
      actions.onFactExpandedChange(productId, factKey, expanded),
  });
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
          <Button color="primary" disabled={busy} onClick={actions.onRefresh}>
            Refresh Local basket
          </Button>
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
      {screen.kind === "review" && review && !active && !terminalSubmission && (
        <section className="status">
          <p>
            This Local basket card is inactive.{" "}
            {review.items.length
              ? "The current Local basket is shown read-only."
              : "No current Local basket is available."}
          </p>
          {review.items.length > 0 && (
            <Button color="primary" disabled={busy} onClick={actions.onRefresh}>
              Refresh Local basket
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
          <Button color="secondary" disabled={busy} onClick={actions.onRefresh}>
            Refresh Local basket
          </Button>
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
                key={`${review.alternatives.product_id}:${review.alternatives.query}`}
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
          <BasketList
            items={review.items}
            renderItem={(item) => {
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
                  onRemove={() => {
                    const index = review.items.findIndex(
                      (current) => current.product_id === item.product_id,
                    );
                    const neighbor =
                      review.items[index + 1] ?? review.items[index - 1];
                    removalFocus.current = {
                      removedId: item.product_id,
                      nextId: neighbor?.product_id,
                    };
                    actions.onRemove(item);
                  }}
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
            }}
          />
        )}
      {review &&
        terminalSubmission &&
        review.submission?.status === "submitted" && (
          <OutcomeSurface
            tone={
              review.submission.skipped_products?.length ? "warning" : "success"
            }
            title={
              review.submission.verified_additions === 0
                ? "No products were added"
                : "Nemlig confirmed the addition"
            }
          >
            <p role="status">
              {review.submission.skipped_products?.length
                ? `${review.submission.verified_additions === 0 ? "No approved products were added" : `${review.submission.verified_additions} approved product additions were verified`}. Unavailable products were skipped: ${review.submission.skipped_products.map(({ name }) => name).join(", ")}. Check the actual Nemlig basket before trying them again.`
                : "Only the prepared products were added. Your real Nemlig basket was verified after the addition."}
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
        <OutcomeSurface
          tone="warning"
          title={
            message.includes("No product was sent.")
              ? "Addition stopped before sending"
              : "We could not verify the addition"
          }
        >
          {message && !busy && <p role="status">{message}</p>}
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
        visibleProductCount > 0 &&
        destination !== "alternatives" && (
          <ActionFooter>
            {review.submission?.status !== "prepared" && (
              <Button
                color="primary"
                block
                disabled={editsBlocked || hasUnreadyItem}
                onClick={actions.onPrepareSubmission}
              >
                Submit to Nemlig
              </Button>
            )}
            {hasUnreadyItem && review.submission?.status !== "prepared" && (
              <p className="status" role="status">
                Resolve products with missing details before submitting.
              </p>
            )}
            {hasUnavailableItem &&
              !hasUnreadyItem &&
              review.submission?.status !== "prepared" && (
                <p className="status" role="status">
                  Products Nemlig confirms are unavailable will be skipped.
                </p>
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
                {review.submission.review.skipped_products?.length ? (
                  <p role="status">
                    Currently unavailable and excluded:{" "}
                    {review.submission.review.skipped_products
                      .map(({ name }) => name)
                      .join(", ")}
                    .
                  </p>
                ) : null}
                <p>
                  Estimated product total:{" "}
                  {money(review.submission.review.expected_products_price)}
                </p>
                <p>
                  Prices may change. Check the actual Nemlig basket afterward.
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
        !(screen.kind === "review" && !active) &&
        destination !== "ready" && (
          <p className="status" role="status">
            {message}
          </p>
        )}
    </ViewerShell>
  );
}
