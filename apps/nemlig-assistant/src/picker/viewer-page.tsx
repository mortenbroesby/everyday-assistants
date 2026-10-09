import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { ProductView } from "../product-presentation.js";
import {
  ActionFooter,
  DestinationTabs,
  DraftListOverflow,
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
  selected: ReadonlySet<number>;
  replacement?: number;
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
  onSelected: (productId: number, selected: boolean) => void;
  onSelectAll: () => void;
  onAcceptSelected: () => void;
  onQuantity: (item: ReviewItem, quantity: number) => void;
  onRemove: (item: ReviewItem) => void;
  onRevisit: (item: ReviewItem) => void;
  onOpenAlternatives: (item: ReviewItem, query: string) => void;
  onSearchAlternatives: (productId: number, query: string) => void;
  onChooseReplacement: (productId?: number) => void;
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

// Retains keyboard radio navigation without coupling it to the host adapter.
// fallow-ignore-next-line complexity
function focusAlternativeChoice(event: KeyboardEvent<HTMLButtonElement>) {
  const direction =
    event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
  if (!direction && event.key !== "Home" && event.key !== "End") {
    return;
  }
  const choices = [
    ...(event.currentTarget
      .closest('[role="radiogroup"]')
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)') ??
      []),
  ];
  const current = choices.indexOf(event.currentTarget);
  if (current < 0 || choices.length === 0) {
    return;
  }
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? choices.length - 1
        : (current + direction + choices.length) % choices.length;
  choices[next]?.focus();
  choices[next]?.click();
}

// Kept as one component because its local focus, disclosure, and controls share one product row.
// fallow-ignore-next-line complexity
function ProductCard({
  view,
  item,
  disabled,
  thumbnailSrc,
  onQuantity,
  onRemove,
  onRevisit,
  selected,
  onSelected,
  choice,
  onChoice,
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
  onRevisit?: () => void;
  selected?: boolean;
  onSelected?: (selected: boolean) => void;
  choice?: boolean;
  onChoice?: () => void;
  onOpenAlternatives?: () => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  expandedFacts?: ReadonlySet<string>;
  onFactExpandedChange?: (factKey: string, expanded: boolean) => void;
  comparison?: boolean;
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const removeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const removalPromptRef = useRef<HTMLParagraphElement | null>(null);
  const wasConfirmingRemoval = useRef(false);
  useEffect(() => {
    if (confirmingRemoval) {
      removalPromptRef.current?.focus();
    } else if (wasConfirmingRemoval.current) {
      removeTriggerRef.current?.focus();
    }
    wasConfirmingRemoval.current = confirmingRemoval;
  }, [confirmingRemoval]);
  const detailsId = useId();
  const disclosureExpanded = expanded ?? localExpanded;
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
  const removeControl = onRemove && (
    <div className="local-removal">
      <Button
        ref={removeTriggerRef}
        color="secondary"
        disabled={disabled}
        hidden={confirmingRemoval}
        onClick={() => setConfirmingRemoval(true)}
      >
        Remove from Draft list
      </Button>
      {confirmingRemoval && (
        <div
          className="local-confirmation"
          role="group"
          aria-label={`Confirm removing ${productName(view, item?.product_id)}`}
        >
          <p ref={removalPromptRef} tabIndex={-1} role="alert">
            Remove this product from the local Draft list? The Nemlig basket
            will not change.
          </p>
          <Button
            color="secondary"
            disabled={disabled}
            onClick={() => setConfirmingRemoval(false)}
          >
            Keep product
          </Button>
          <Button
            color="secondary"
            disabled={disabled}
            onClick={() => {
              setConfirmingRemoval(false);
              onRemove();
            }}
          >
            Confirm remove
          </Button>
        </div>
      )}
    </div>
  );
  const reviewControls = item && (
    <div className="review-controls">
      <QuantityControl
        label={productName(view, item.product_id)}
        quantity={count}
        disabled={disabled}
        onQuantity={onQuantity}
      />
      {item.state === "needs-review" && removeControl}
      {item.state === "needs-review" && onOpenAlternatives && (
        <Button
          color="secondary"
          disabled={disabled}
          onClick={onOpenAlternatives}
        >
          Choose alternative
        </Button>
      )}
    </div>
  );
  const readyActions = item?.state === "ready" && (
    <div className="review-controls ready-row-actions">
      {removeControl}
      {onRevisit && (
        <Button color="secondary" disabled={disabled} onClick={onRevisit}>
          Move to To decide
        </Button>
      )}
    </div>
  );
  if (view.status !== "complete") {
    return (
      <article
        className={`product-card${comparison ? " product-comparison" : ""}`}
      >
        {onSelected && (
          <label className="product-select">
            <input
              type="checkbox"
              aria-label={`Select ${productName(view, item?.product_id)}`}
              disabled={disabled || !isUsable(view)}
              checked={selected === true}
              onChange={(event) => onSelected(event.currentTarget.checked)}
            />
          </label>
        )}
        <div className="product-details">
          <ProductSummaryButton
            color="secondary"
            variant="ghost"
            data-viewer-component="product-summary"
            aria-expanded={disclosureExpanded}
            aria-controls={detailsId}
            onClick={() => {
              const next = !disclosureExpanded;
              if (onExpandedChange) {
                onExpandedChange(next);
              } else {
                setLocalExpanded(next);
              }
            }}
          >
            <ProductSummary view={view} />
          </ProductSummaryButton>
          <div
            id={detailsId}
            className="product-expanded"
            hidden={!disclosureExpanded}
          >
            {item && <p>{item.quantity} ×</p>}
            {item?.state === "needs-review" && reviewControls}
            {readyActions}
          </div>
          {item?.state === "ready" && reviewControls}
        </div>
      </article>
    );
  }
  const summary = (
    <ProductSummary
      view={view}
      quantity={quantity}
      thumbnailSrc={thumbnailSrc}
    />
  );
  return (
    <article
      className={`product-card${comparison ? " product-comparison" : ""}`}
    >
      {onSelected && (
        <label className="product-select">
          <input
            type="checkbox"
            aria-label={`Select ${productName(view)}`}
            disabled={disabled || !isUsable(view)}
            checked={selected === true}
            onChange={(event) => onSelected(event.currentTarget.checked)}
          />
        </label>
      )}
      <div className="product-details">
        {comparison ? (
          onChoice ? (
            <button
              type="button"
              className="product-comparison-summary alternative-choice"
              role="radio"
              aria-checked={choice === true}
              aria-label={`Choose ${productName(view)}`}
              disabled={disabled || !isUsable(view)}
              onClick={onChoice}
              onKeyDown={focusAlternativeChoice}
            >
              {summary}
              <span className="alternative-choice-state" aria-hidden="true">
                {choice ? "Selected" : "Select"}
              </span>
            </button>
          ) : (
            <div className="product-comparison-summary">{summary}</div>
          )
        ) : (
          <ProductSummaryButton
            color="secondary"
            variant="ghost"
            data-viewer-component="product-summary"
            aria-expanded={disclosureExpanded}
            aria-controls={detailsId}
            onClick={() => {
              const next = !disclosureExpanded;
              if (onExpandedChange) {
                onExpandedChange(next);
              } else {
                setLocalExpanded(next);
              }
            }}
          >
            {summary}
          </ProductSummaryButton>
        )}
        <div
          id={detailsId}
          className="product-expanded"
          hidden={!comparison && !disclosureExpanded}
        >
          <ProductFacts
            view={view}
            expandedFacts={expandedFacts}
            onFactExpandedChange={onFactExpandedChange}
          />
          {item?.state === "needs-review" && reviewControls}
          {readyActions}
        </div>
        {item?.state === "ready" && reviewControls}
      </div>
    </article>
  );
}

// The existing screen state machine is rendered here so production and Storybook cannot drift.
// fallow-ignore-next-line complexity
export function ViewerPage({ model, actions }: ViewerPageProps) {
  const {
    screen,
    maxWidth,
    presentationDestination,
    selected,
    replacement,
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
  const needsReviewCount =
    review?.items.filter((item) => item.state === "needs-review").length ?? 0;
  const readyCount =
    review?.items.filter((item) => item.state === "ready").length ?? 0;
  const safeTitle =
    destination === "ready"
      ? "Ready"
      : destination === "alternatives"
        ? "Choose an alternative"
        : "To decide";
  const visibleProductCount =
    destination === "ready" ? readyCount : needsReviewCount;
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
  const decisionsComplete = Boolean(
    review &&
    active &&
    !terminalSubmission &&
    destination === "needs-review" &&
    needsReviewCount === 0 &&
    readyCount > 0,
  );
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
          ? decisionsComplete
            ? "Everything is ready"
            : safeTitle
          : "What should we shop for?"
        : basket
          ? "Actual Nemlig basket"
          : screen.kind === "unavailable"
            ? "Draft list unavailable"
            : screen.kind === "review"
              ? "Your Draft list"
              : "Products";
  const intro = !terminalSubmission
    ? review && active
      ? review.items.length === 0
        ? "Start another local Draft list in conversation."
        : decisionsComplete
          ? "All products are Ready for your final check. Nothing has been added to Nemlig."
          : safeTitle === "Ready"
            ? "Adjust quantities directly. Open a product to move it back or remove it. Prepare the exact change before adding anything to Nemlig."
            : safeTitle === "Choose an alternative"
              ? "Compare available options for this product."
              : "Select products to move them into Ready. Open a product for details."
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
      {review && review.items.length > 0 && !terminalSubmission && (
        <DestinationTabs
          destination={destination ?? review.destination}
          toDecideCount={needsReviewCount}
          readyCount={readyCount}
          hasAlternatives={Boolean(review.alternatives)}
          disabled={uncertainSubmission || !active}
          onNavigate={actions.onNavigate}
        />
      )}
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
          <p>Continue in conversation to inspect the current Draft list.</p>
        </section>
      )}
      {screen.kind === "cancelled" && (
        <section className="status">
          <p>
            Request cancelled. Continue in conversation to confirm the current
            Draft list before continuing.
          </p>
        </section>
      )}
      {screen.kind === "stale" && (
        <section className="status">
          <p>This Draft list card is out of date and cannot make changes.</p>
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
            This Draft list card is inactive.{" "}
            {review.items.length
              ? "The current Draft list is shown read-only."
              : "No current Draft list is available."}
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
          aria-label="Current Draft list, read only"
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
            This temporary Draft list is no longer available. Ask in chat before
            starting a new Draft list. Previous choices or submission approval
            are not restored.
          </p>
        </section>
      )}
      {review &&
        active &&
        !terminalSubmission &&
        destination === "alternatives" &&
        review.alternatives && (
          <section className="alternatives">
            <section
              className="alternatives-current"
              aria-labelledby="current-product-title"
            >
              <h2 id="current-product-title">Current product</h2>
              {review.items
                .filter(
                  (item) => item.product_id === review.alternatives?.product_id,
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
                <div
                  role="radiogroup"
                  aria-labelledby="alternative-options-title"
                >
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
                        {...(id === undefined ? {} : disclosureProps(id))}
                        choice={replacement === id}
                        onChoice={() => actions.onChooseReplacement(id)}
                      />
                    );
                  })}
                </div>
              )}
              <Button
                color="primary"
                disabled={editsBlocked || replacement === undefined}
                onClick={() => {
                  if (replacement !== undefined) {
                    actions.onReplace(
                      review.alternatives!.product_id,
                      replacement,
                    );
                  }
                }}
              >
                Use selected alternative
              </Button>
              <Button
                color="secondary"
                disabled={uncertainSubmission}
                onClick={() => actions.onNavigate("needs-review")}
              >
                Back to To decide
              </Button>
            </section>
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
          <section
            className="product-list"
            aria-label={`${safeTitle} products`}
          >
            {review.items
              .filter((item) => item.state === destination)
              .map((item) => {
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
                    {...(item.state === "needs-review"
                      ? {
                          selected: selected.has(item.product_id),
                          onSelected: (checked: boolean) =>
                            actions.onSelected(item.product_id, checked),
                        }
                      : {})}
                    onQuantity={(quantity) =>
                      actions.onQuantity(item, quantity)
                    }
                    onRemove={() => actions.onRemove(item)}
                    onRevisit={
                      item.state === "ready"
                        ? () => actions.onRevisit(item)
                        : undefined
                    }
                    onOpenAlternatives={
                      item.state === "needs-review"
                        ? () =>
                            actions.onOpenAlternatives(item, alternativeQuery)
                        : undefined
                    }
                  />
                );
              })}
          </section>
        )}
      {decisionsComplete && (
        <OutcomeSurface title="Ready for your final check">
          <p>
            Review the local Ready products before deciding whether to add them
            to Nemlig.
          </p>
          <Button
            color="primary"
            disabled={editsBlocked}
            onClick={() => actions.onNavigate("ready")}
          >
            View Ready products
          </Button>
        </OutcomeSurface>
      )}
      {review &&
        active &&
        !terminalSubmission &&
        destination === "needs-review" &&
        needsReviewCount > 0 && (
          <ActionFooter>
            {review.items.some(
              (item) => item.state === "needs-review" && isUsable(item.view),
            ) && (
              <Button
                color="secondary"
                disabled={editsBlocked}
                onClick={actions.onSelectAll}
              >
                Select all
              </Button>
            )}
            {selected.size > 0 && (
              <Button
                color="primary"
                disabled={editsBlocked}
                onClick={actions.onAcceptSelected}
              >
                Add selected to Ready ({selected.size})
              </Button>
            )}
          </ActionFooter>
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
              Continue with Draft list
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
      {review && active && !terminalSubmission && destination === "ready" && (
        <ActionFooter>
          {review.submission?.status !== "prepared" && (
            <Button
              color="primary"
              disabled={
                editsBlocked ||
                !review.items.some((item) => item.state === "ready")
              }
              onClick={actions.onPrepareSubmission}
            >
              Review exact Nemlig change
            </Button>
          )}
          {review.submission?.status === "prepared" && (
            <OutcomeSurface title="Ready to add to Nemlig basket">
              {review.submission.review.lines?.map((line) => (
                <p key={line.product_id}>
                  {line.quantity} × {line.name ?? `Product ${line.product_id}`}{" "}
                  · {money(line.item_price)} each · {money(line.line_total)}
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
          message="Your local Draft list is empty. Nothing changed in Nemlig."
          onChoose={actions.onSendFollowUp}
        />
      )}
      {review && active && !terminalSubmission && hasActiveProducts && (
        <DraftListOverflow>
          <Button
            color="secondary"
            disabled={editsBlocked || busy}
            onClick={actions.onRequestEnd}
          >
            End Draft list
          </Button>
          {confirmEnd && (
            <section className="submission">
              <p>
                Discard this local Draft list? The Nemlig basket will not
                change.
              </p>
              <Button
                color="secondary"
                disabled={busy}
                onClick={actions.onCancelEnd}
              >
                Keep Draft list
              </Button>
              <Button
                color="secondary"
                disabled={busy}
                onClick={actions.onConfirmEnd}
              >
                Confirm discard Draft list
              </Button>
            </section>
          )}
        </DraftListOverflow>
      )}
      {screen.kind === "empty" && (
        <DraftListStarters
          message={
            screen.message ??
            "Your local Draft list is empty. Nothing changed in Nemlig."
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
