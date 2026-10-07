import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { EmptyMessage } from "@openai/apps-sdk-ui/components/EmptyMessage";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ProductView } from "../product-presentation.js";
import { safeNemligImageUrl } from "../product-presentation.js";

type ReviewItem = { product_id: number; quantity: number; state: "needs-review" | "ready"; view: ProductView };
type Review = {
  review_id: string; revision: number; destination: "needs-review" | "ready" | "alternatives";
  items: ReviewItem[];
  alternatives?: { product_id: number; query: string; views: ProductView[] };
  submission?: { status: "prepared" | "submitted" | "uncertain"; submission_id: string; review: { lines?: Array<{ product_id: number; quantity: number; name?: string; unit_size?: string; item_price?: number; line_total?: number }>; expected_products_price?: number } };
};
type Payload = { views?: ProductView[]; products?: ProductView[]; result?: ProductView[]; items?: unknown[]; detail_limit?: number; unenriched_count?: number; review?: Review; view_id?: string; unavailable?: boolean; ended?: boolean };
type Screen = { kind: "loading" } | { kind: "error"; message: string } | { kind: "cancelled" } | { kind: "stale" } | { kind: "products"; payload: Payload; views: ProductView[] } | { kind: "review"; review: Review; view_id?: string; active: boolean } | { kind: "unavailable"; review?: Review } | { kind: "empty"; message?: string };

declare global {
  interface Window { openai?: { toolOutput?: unknown } }
}

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isReview(value: unknown): value is Review {
  if (!isRecord(value) || typeof value.review_id !== "string" || !Number.isSafeInteger(value.revision) || !Array.isArray(value.items)) return false;
  if (!(value.destination === "needs-review" || value.destination === "ready" || value.destination === "alternatives")) return false;
  if (!value.items.every((item) => isRecord(item) && Number.isSafeInteger(item.product_id) && typeof item.quantity === "number" && Number.isSafeInteger(item.quantity) && item.quantity > 0 && (item.state === "needs-review" || item.state === "ready") && isProductView(item.view))) return false;
  if (value.alternatives !== undefined && (!isRecord(value.alternatives) || !Number.isSafeInteger(value.alternatives.product_id) || typeof value.alternatives.query !== "string" || !Array.isArray(value.alternatives.views) || !value.alternatives.views.every(isProductView))) return false;
  if (value.submission !== undefined) {
    if (!isRecord(value.submission) || !["prepared", "submitted", "uncertain"].includes(String(value.submission.status)) || typeof value.submission.submission_id !== "string" || !isRecord(value.submission.review)) return false;
    const submissionReview = value.submission.review;
    const validOptionalTotal = (amount: unknown) => amount === undefined || typeof amount === "number" && Number.isFinite(amount) && amount >= 0;
    if (!validOptionalTotal(submissionReview.expected_products_price) || submissionReview.lines !== undefined && (!Array.isArray(submissionReview.lines) || !submissionReview.lines.every((line) => isRecord(line)
      && Number.isSafeInteger(line.product_id) && typeof line.quantity === "number" && Number.isSafeInteger(line.quantity) && line.quantity > 0
      && (line.name === undefined || typeof line.name === "string") && (line.unit_size === undefined || typeof line.unit_size === "string")
      && validOptionalTotal(line.item_price) && validOptionalTotal(line.line_total)))) return false;
  }
  return true;
}
function isProductView(value: unknown): value is ProductView {
  if (!isRecord(value) || !(value.context === "search" || value.context === "details" || value.context === "result" || value.context === "basket" || value.context === "review")) return false;
  if (value.status === "unavailable") return value.product_id === undefined || Number.isSafeInteger(value.product_id);
  if (value.status !== "complete" || !isRecord(value.product)) return false;
  const product = value.product;
  const optionalString = (key: string) => product[key] === undefined || typeof product[key] === "string";
  const optionalNumber = (key: string) => product[key] === undefined || typeof product[key] === "number" && Number.isFinite(product[key]);
  const optionalBoolean = (key: string) => product[key] === undefined || typeof product[key] === "boolean";
  const optionalNonnegativeNumber = (record: Record<string, unknown>, key: string) => record[key] === undefined || typeof record[key] === "number" && Number.isFinite(record[key]) && record[key] >= 0;
  const basketValid = value.basket === undefined || isRecord(value.basket) && optionalNonnegativeNumber(value.basket, "quantity") && optionalNonnegativeNumber(value.basket, "line_total");
  const reviewValid = value.review === undefined || isRecord(value.review) && optionalNonnegativeNumber(value.review, "quantity") && optionalNonnegativeNumber(value.review, "line_total") && (value.review.approved === undefined || typeof value.review.approved === "boolean");
  const detailsValid = product.details === undefined || Array.isArray(product.details) && product.details.every((fact) => isRecord(fact) && typeof fact.key === "string" && typeof fact.value === "string");
  const stringArraysValid = [product.labels, product.tags].every((list) => list === undefined || Array.isArray(list) && list.every((entry) => typeof entry === "string"));
  return (product.id === undefined || Number.isSafeInteger(product.id))
    && ["name", "brand", "unit", "unit_size", "category", "subcategory", "currency", "description", "declaration", "image_url"].every(optionalString)
    && ["price", "unit_price"].every(optionalNumber)
    && ["available", "is_organic", "is_frozen", "is_on_discount"].every(optionalBoolean)
    && basketValid && reviewValid
    && detailsValid && stringArraysValid;
}
function readPayload(value: unknown): Screen | undefined {
  if (Array.isArray(value) && value.every(isProductView)) return { kind: "products", payload: { views: value }, views: value };
  if (!isRecord(value)) return undefined;
  const envelope = isRecord(value.structuredContent) ? value.structuredContent : value;
  if (isRecord(envelope.review) && isReview(envelope.review)) {
    const view_id = typeof envelope.view_id === "string" ? envelope.view_id : undefined;
    return { kind: "review", review: envelope.review, ...(view_id ? { view_id } : {}), active: Boolean(view_id) };
  }
  if (envelope.unavailable === true) return { kind: "unavailable" };
  if (envelope.ended === true) return { kind: "empty", message: "Your local Draft list was discarded. Nothing changed in Nemlig." };
  const candidate = Array.isArray(envelope.views) ? envelope.views : Array.isArray(envelope.products) ? envelope.products : Array.isArray(envelope.result) ? envelope.result : undefined;
  if (candidate && candidate.every(isProductView)) return { kind: "products", payload: envelope as Payload, views: candidate };
  return undefined;
}
function money(value: unknown): string { return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} kr` : "Unknown price"; }
function productName(view: ProductView, id?: number): string { return view.status === "complete" ? view.product.name ?? `Product ${view.product.id ?? id ?? "details unavailable"}` : `Product ${view.product_id ?? id ?? "details"}`; }
function isUsable(view: ProductView): boolean { return view.status === "complete" && view.product.available === true; }
const EMPTY_REVIEW_FACTS = new Set<string>();

function ProductCard({ view, item, disabled, onQuantity, onRemove, onRevisit, selected, onSelected, choice, onChoice, onOpenAlternatives, expanded, onExpandedChange, expandedFacts, onFactExpandedChange, comparison = false }: {
  view: ProductView; item?: ReviewItem; disabled: boolean; onQuantity?: (quantity: number) => void; onRemove?: () => void; onRevisit?: () => void;
  selected?: boolean; onSelected?: (selected: boolean) => void; choice?: boolean; onChoice?: () => void; onOpenAlternatives?: () => void;
  expanded?: boolean; onExpandedChange?: (expanded: boolean) => void; expandedFacts?: ReadonlySet<string>; onFactExpandedChange?: (factKey: string, expanded: boolean) => void; comparison?: boolean;
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const removeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const removalPromptRef = useRef<HTMLParagraphElement | null>(null);
  const wasConfirmingRemoval = useRef(false);
  useEffect(() => {
    if (confirmingRemoval) removalPromptRef.current?.focus();
    else if (wasConfirmingRemoval.current) removeTriggerRef.current?.focus();
    wasConfirmingRemoval.current = confirmingRemoval;
  }, [confirmingRemoval]);
  const detailsId = useId();
  const disclosureExpanded = expanded ?? localExpanded;
  const quantity = item?.quantity ?? (view.status === "complete" ? (view.context === "basket" ? view.basket?.quantity : view.context === "review" ? view.review?.quantity : undefined) : undefined);
  const count = quantity ?? 0;
  const removeControl = onRemove && <div className="local-removal">
    <Button ref={removeTriggerRef} color="secondary" disabled={disabled} hidden={confirmingRemoval} onClick={() => setConfirmingRemoval(true)}>Remove from Draft list</Button>
    {confirmingRemoval && <div className="local-confirmation" role="group" aria-label={`Confirm removing ${productName(view, item?.product_id)}`}>
      <p ref={removalPromptRef} tabIndex={-1} role="alert">Remove this product from the local Draft list? The Nemlig basket will not change.</p>
      <Button color="secondary" disabled={disabled} onClick={() => setConfirmingRemoval(false)}>Keep product</Button>
      <Button color="secondary" disabled={disabled} onClick={() => { setConfirmingRemoval(false); onRemove(); }}>Confirm remove</Button>
    </div>}
  </div>;
  const reviewControls = item && <div className="review-controls"><div className="quantity-control"><span>Quantity</span><Button color="secondary" aria-label={`Decrease quantity of ${productName(view, item.product_id)}`} disabled={disabled || count <= 1} onClick={() => onQuantity?.(count - 1)}>−</Button><span aria-live="polite">{count}</span><Button color="secondary" aria-label={`Increase quantity of ${productName(view, item.product_id)}`} disabled={disabled || count >= Number.MAX_SAFE_INTEGER} onClick={() => onQuantity?.(count + 1)}>+</Button></div>
    {item.state === "needs-review" && removeControl}{item.state === "needs-review" && onOpenAlternatives && <Button color="secondary" disabled={disabled} onClick={onOpenAlternatives}>Choose alternative</Button>}
  </div>;
  const readyActions = item?.state === "ready" && <div className="review-controls ready-row-actions">
    {removeControl}{onRevisit && <Button color="secondary" disabled={disabled} onClick={onRevisit}>Move to To decide</Button>}
  </div>;
  if (view.status !== "complete") return <article className={`product-card${comparison ? " product-comparison" : ""}`}>
    {onSelected && <label className="product-select"><input type="checkbox" aria-label={`Select ${productName(view, item?.product_id)}`} disabled={disabled || !isUsable(view)} checked={selected === true} onChange={(event) => onSelected(event.currentTarget.checked)} /></label>}
    <p>Product {view.product_id ?? item?.product_id ?? "details"} details unavailable.</p>{item && <p>{item.quantity} ×</p>}{reviewControls}{readyActions}
  </article>;
  const product = view.product;
  const image = safeNemligImageUrl(product.image_url);
  const quantityTotal = quantity !== undefined && typeof product.price === "number" ? quantity * product.price : product.price;
  const suppliedDetails = product.details?.filter((fact) => fact.key.trim() && fact.value.trim()) ?? [];
  const summary = <span className="product-summary-content">
    {image && !imageFailed ? <img className="product-image" src={image} alt={product.name ?? "Product"} onError={() => setImageFailed(true)} /> : <span className="product-image product-image-fallback" aria-hidden="true">No image</span>}
    <span className="product-copy"><span className="product-heading"><strong>{productName(view)}</strong><span>{money(quantityTotal)}</span></span>
      <span className="product-meta">{[product.brand, product.unit_size].filter(Boolean).join(" · ") || "Package details unavailable"}</span>
      <span className="product-meta">{product.unit_price === undefined ? product.unit ?? "Unit price unavailable" : `${money(product.unit_price)}${product.unit ? ` · ${product.unit}` : ""}`}</span>
      {quantity !== undefined && <span className="product-quantity">{quantity} ×</span>}
      {product.is_organic === true && <Badge color="success">Organic</Badge>}{product.is_frozen === true && <Badge color="info">Frozen</Badge>}{product.is_on_discount === true && <Badge color="warning">Offer</Badge>}
      {product.available === false && <Badge color="danger">Unavailable</Badge>}{product.available === undefined && <Badge color="warning">Availability unknown</Badge>}
    </span>
  </span>;
  return <article className={`product-card${comparison ? " product-comparison" : ""}`}>
    {onSelected && <label className="product-select"><input type="checkbox" aria-label={`Select ${productName(view)}`} disabled={disabled || !isUsable(view)} checked={selected === true} onChange={(event) => onSelected(event.currentTarget.checked)} /></label>}
    <div className="product-details">
      {comparison ? onChoice ? <button type="button" className="product-comparison-summary alternative-choice" role="radio" aria-checked={choice === true} aria-label={`Choose ${productName(view)}`} disabled={disabled || !isUsable(view)} onClick={onChoice} onKeyDown={(event) => {
        const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
        if (!direction && event.key !== "Home" && event.key !== "End") return;
        const choices = [...(event.currentTarget.closest('[role="radiogroup"]')?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)') ?? [])];
        const current = choices.indexOf(event.currentTarget);
        if (current < 0 || choices.length === 0) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : (current + direction + choices.length) % choices.length;
        choices[next]?.focus();
        choices[next]?.click();
      }}>{summary}<span className="alternative-choice-state" aria-hidden="true">{choice ? "Selected" : "Select"}</span></button> : <div className="product-comparison-summary">{summary}</div> : <Button color="secondary" variant="ghost" pill={false} block className="product-summary" aria-expanded={disclosureExpanded} aria-controls={detailsId} onClick={() => {
        const next = !disclosureExpanded;
        if (onExpandedChange) onExpandedChange(next); else setLocalExpanded(next);
      }}>{summary}</Button>}
      <div id={detailsId} className="product-expanded" hidden={!comparison && !disclosureExpanded}>
        {product.description && <details className="product-fact" open={expandedFacts?.has("Varebeskrivelse")} onToggle={onFactExpandedChange ? (event) => onFactExpandedChange("Varebeskrivelse", event.currentTarget.open) : undefined}><summary>Varebeskrivelse</summary><p>{product.description}</p></details>}
        {product.declaration && <details className="product-fact" open={expandedFacts?.has("Varedeklaration")} onToggle={onFactExpandedChange ? (event) => onFactExpandedChange("Varedeklaration", event.currentTarget.open) : undefined}><summary>Varedeklaration</summary><p>{product.declaration}</p></details>}
        {suppliedDetails.length > 0 && <details className="product-fact" open={expandedFacts?.has("Detaljer om varen")} onToggle={onFactExpandedChange ? (event) => onFactExpandedChange("Detaljer om varen", event.currentTarget.open) : undefined}><summary>Detaljer om varen</summary><dl className="product-fact-list">{suppliedDetails.map(({ key, value }) => <div key={`${key}:${value}`}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details>}
        {readyActions}
      </div>
      {reviewControls}
    </div>
  </article>;
}

export function ProductViewer() {
  const [screen, setScreen] = useState<Screen>(() => {
    const initial = typeof window === "undefined" ? undefined : readPayload(window.openai?.toolOutput);
    return initial ?? { kind: "loading" };
  });
  const activeReview = useRef<{ review: Review; view_id?: string; active: boolean } | undefined>(screen.kind === "review" ? screen : undefined);
  const lastConfirmedReview = useRef<Review | undefined>(screen.kind === "review" ? screen.review : undefined);
  const callLock = useRef(false);
  const cancellationEpoch = useRef(0);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [reviewDisclosures, setReviewDisclosures] = useState<Map<number, { expanded: boolean; facts: Set<string> }>>(() => new Map());
  const [replacement, setReplacement] = useState<number>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [continueSubmitted, setContinueSubmitted] = useState(false);
  const [submitBlocked, setSubmitBlocked] = useState(false);
  const submitBlockedRef = useRef(false);
  const [pendingQuantities, setPendingQuantities] = useState<Map<number, number>>(() => new Map());
  const pendingQuantitiesRef = useRef(new Map<number, number>());
  const quantityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const quantityFlush = useRef<Promise<boolean> | undefined>(undefined);
  const callIdleWaiters = useRef<Array<() => void>>([]);
  const clearPendingQuantities = () => {
    pendingQuantitiesRef.current.clear();
    setPendingQuantities(new Map());
  };
  const removePendingQuantity = (productId: number, quantity: number) => {
    if (pendingQuantitiesRef.current.get(productId) !== quantity) return;
    const next = new Map(pendingQuantitiesRef.current);
    next.delete(productId);
    pendingQuantitiesRef.current = next;
    setPendingQuantities(next);
  };
  const waitForCallIdle = async () => {
    while (callLock.current) {
      await new Promise<void>((resolve) => callIdleWaiters.current.push(resolve));
    }
  };
  const deactivateReview = useCallback(() => {
    if (quantityTimer.current) clearTimeout(quantityTimer.current);
    quantityTimer.current = undefined;
    clearPendingQuantities();
    setSelected(new Set());
    setReplacement(undefined);
    setConfirmEnd(false);
    const current = activeReview.current;
    if (current) {
      const inactive = { ...current, active: false };
      activeReview.current = inactive;
      setScreen({ kind: "review", ...inactive });
    }
    setConfirmSubmit(false);
  }, []);
  const applyPayload = useCallback((payload: unknown, current = false) => {
    if (isRecord(payload) && payload.isError === true) { deactivateReview(); setScreen({ kind: "error", message: "Could not load the Draft list. Reconnect Nemlig or try again in conversation." }); return false; }
    const next = readPayload(payload);
    if (!next) { deactivateReview(); setScreen({ kind: "error", message: "Nemlig returned a response this view could not read. Continue in conversation to inspect the current state." }); return false; }
    const previous = activeReview.current;
    if (next.kind === "review") {
      if (!current && previous && !previous.active && next.view_id && next.view_id === previous.view_id) return true;
      if (!current && previous?.active && previous.review.review_id !== next.review.review_id) return true;
      const sameReview = previous?.review.review_id === next.review.review_id;
      if (!sameReview) setReviewDisclosures(new Map());
      if (sameReview && next.review.revision < previous.review.revision) return true;
      if (!current && previous?.active && sameReview && next.review.revision === previous.review.revision) {
        const verifiedCompletion = previous.review.submission?.status === "uncertain"
          && next.review.submission?.status === "submitted"
          && previous.review.submission.submission_id === next.review.submission.submission_id;
        if (!verifiedCompletion) return true;
      }
      const view_id = next.view_id ?? previous?.view_id;
      const state = { review: next.review, ...(view_id ? { view_id } : {}), active: Boolean(view_id) && (current || Boolean(next.view_id) || (sameReview && previous.active)) };
      activeReview.current = state;
      lastConfirmedReview.current = next.review;
      const submissionChanged = !sameReview || next.review.submission?.submission_id !== previous?.review.submission?.submission_id;
      if (submissionChanged) {
        submitBlockedRef.current = false;
        setSubmitBlocked(false);
      }
      const preserveContinuation = sameReview
        && previous?.review.submission?.status === "submitted"
        && next.review.submission?.status === "submitted"
        && previous.review.submission.submission_id === next.review.submission.submission_id;
      setContinueSubmitted((continued) => continued && preserveContinuation);
      if (next.review.submission?.status === "submitted" || next.review.submission?.status === "uncertain") {
        const uncertain = next.review.submission.status === "uncertain";
        submitBlockedRef.current = uncertain;
        setSubmitBlocked(uncertain);
      }
      setScreen({ kind: "review", ...state });
      setMessage("");
      setSelected((chosen) => sameReview ? new Set([...chosen].filter((id) => next.review.items.some((item) => item.product_id === id && item.state === "needs-review"))) : new Set());
      setReplacement((chosen) => sameReview && next.review.alternatives?.views.some((view) => view.status === "complete" && view.product.id === chosen) ? chosen : undefined);
      setConfirmSubmit(false);
    } else if (next.kind === "unavailable") {
      deactivateReview();
      activeReview.current = undefined;
      setScreen({ kind: "unavailable", review: previous?.review ?? lastConfirmedReview.current });
    } else {
      if (next.kind !== "empty" && !current && previous?.active) return true;
      activeReview.current = undefined;
      if (next.kind === "empty") {
        deactivateReview();
        activeReview.current = undefined;
        lastConfirmedReview.current = undefined;
        submitBlockedRef.current = false;
        setSubmitBlocked(false);
        setContinueSubmitted(false);
        setReviewDisclosures(new Map());
      }
      setScreen(next);
    }
    return true;
  }, [deactivateReview]);
  const { app: connectedApp, isConnected, error } = useApp({ appInfo: { name: "nemlig-product-viewer", version: "10.0.0" }, capabilities: {}, onAppCreated: (host) => {
    host.ontoolresult = (result) => applyPayload(result);
    host.ontoolcancelled = () => { cancellationEpoch.current++; deactivateReview(); setScreen({ kind: "cancelled" }); setMessage("Request cancelled. Continue in conversation when you are ready."); };
    host.onerror = () => { deactivateReview(); setMessage("The Draft list connection failed. Continue in conversation or reopen your current Draft list."); };
  } });
  useHostStyles(connectedApp, connectedApp?.getHostContext());
  useEffect(() => () => { if (quantityTimer.current) clearTimeout(quantityTimer.current); connectedApp?.close(); }, [connectedApp]);

  const call = async (name: string, args: Record<string, unknown>, recovery = true): Promise<boolean> => {
    if (!connectedApp || !isConnected) { setMessage(error ? "The Draft list could not connect. Continue in conversation or reopen the current Draft list." : "Connecting to the current Nemlig Draft list…"); return false; }
    if (callLock.current) return false;
    callLock.current = true;
    const requestEpoch = cancellationEpoch.current;
    setBusy(true); setMessage("Updating…");
    try {
      const result = await connectedApp.callServerTool({ name, arguments: args });
      if (requestEpoch !== cancellationEpoch.current) return false;
      if (result.isError) throw new Error((result.content ?? []).filter((content) => content.type === "text").map((content) => content.text).join(" ") || "Update failed");
      if (!applyPayload(result, true)) throw new Error("Could not confirm the updated Draft list.");
      setMessage(""); return true;
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "Update failed";
      if (/out of date|unavailable/i.test(text)) {
        deactivateReview();
        activeReview.current = undefined;
        setScreen({ kind: "stale" });
        setMessage("");
      } else if (recovery && /stale|no active draft/i.test(text)) {
        deactivateReview();
        setSelected(new Set());
        setReplacement(undefined);
        const latest = activeReview.current;
        try {
          if (latest?.view_id) {
            const fresh = await connectedApp.callServerTool({ name: "update_product_review", arguments: { view_id: latest.view_id, review_id: latest.review.review_id, revision: latest.review.revision, action: { kind: "show" } } });
            if (!fresh.isError && requestEpoch === cancellationEpoch.current) applyPayload(fresh, true);
            else { activeReview.current = undefined; setScreen({ kind: "stale" }); }
          } else { activeReview.current = undefined; setScreen({ kind: "stale" }); }
        } catch { activeReview.current = undefined; setScreen({ kind: "stale" }); }
        setMessage("Your last action was not applied. The current Draft list was refreshed; choose again.");
      } else {
        deactivateReview();
        setPendingQuantities(new Map());
        setSelected(new Set());
        setMessage("We could not confirm this action. Refresh the Draft list to check its state before trying again.");
      }
      return false;
    } finally {
      callLock.current = false;
      setBusy(false);
      for (const resolve of callIdleWaiters.current.splice(0)) resolve();
    }
  };
  const validatedViewId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const latest = activeReview.current;
    if (!connectedApp || !isConnected || !latest?.view_id || validatedViewId.current === latest.view_id) return;
    validatedViewId.current = latest.view_id;
    void call("update_product_review", {
      view_id: latest.view_id,
      review_id: latest.review.review_id,
      revision: latest.review.revision,
      action: { kind: "show" },
    }, false);
  }, [connectedApp, isConnected, call]);
  const review = screen.kind === "review" ? screen.review : undefined;
  const active = screen.kind === "review" && screen.active;
  const update = async (action: Record<string, unknown>) => {
    const latest = activeReview.current;
    if (!latest?.active || !latest.view_id || callLock.current) return false;
    const result = await call("update_product_review", { view_id: latest.view_id, review_id: latest.review.review_id, revision: latest.review.revision, action });
    if (result && action.kind === "prepare_submission") setConfirmSubmit(false);
    return result;
  };
  const setQuantity = (item: ReviewItem, next: number) => {
    const pending = new Map(pendingQuantitiesRef.current).set(item.product_id, next);
    pendingQuantitiesRef.current = pending;
    setPendingQuantities(pending);
    if (quantityTimer.current) clearTimeout(quantityTimer.current);
    quantityTimer.current = setTimeout(() => {
      quantityTimer.current = undefined;
      void flushQuantities();
    }, 400);
  };
  const flushQuantities = async () => {
    if (quantityTimer.current) clearTimeout(quantityTimer.current);
    quantityTimer.current = undefined;
    if (quantityFlush.current) return quantityFlush.current;
    if (!pendingQuantitiesRef.current.size) return true;
    const operation = (async () => {
      while (pendingQuantitiesRef.current.size) {
        await waitForCallIdle();
        const latest = activeReview.current;
        if (!latest?.active) return false;
        const [product_id, quantity] = pendingQuantitiesRef.current.entries().next().value as [number, number];
        const currentQuantity = latest.review.items.find((item) => item.product_id === product_id)?.quantity;
        if (currentQuantity === quantity) {
          removePendingQuantity(product_id, quantity);
          continue;
        }
        if (!latest.view_id) return false;
        const ok = await call("update_product_review", { view_id: latest.view_id, review_id: latest.review.review_id, revision: latest.review.revision, action: { kind: "quantity", product_id, quantity } });
        if (!ok) return false;
        const confirmed = activeReview.current?.review.items.find((item) => item.product_id === product_id)?.quantity;
        if (confirmed !== quantity) return false;
        removePendingQuantity(product_id, quantity);
      }
      return activeReview.current?.active === true;
    })();
    const tracked = operation.finally(() => {
      if (quantityFlush.current === tracked) quantityFlush.current = undefined;
    });
    quantityFlush.current = tracked;
    return tracked;
  };
  const navigate = async (destination: "needs-review" | "ready" | "alternatives") => { if (await flushQuantities()) await update({ kind: "navigate", destination }); };
  const afterFlush = (action: Record<string, unknown>) => {
    void flushQuantities().then(async (ok) => { if (ok) await update(action); });
  };
  const safeTitle = review?.destination === "ready" ? "Ready" : review?.destination === "alternatives" ? "Choose an alternative" : "To decide";
  const productPayload = screen.kind === "products" ? screen.payload : undefined;
  const basket = productPayload?.detail_limit !== undefined && Array.isArray(productPayload.items);
  const uncertainSubmission = submitBlocked || review?.submission?.status === "uncertain";
  const editsBlocked = busy || uncertainSubmission || review?.submission?.status === "submitted" && !continueSubmitted;
  const sendFollowUp = async (text: string) => {
    if (!connectedApp || !isConnected) { setMessage("Continue in conversation to inspect or start a Draft list."); return; }
    try {
      const result = await connectedApp.sendMessage({ role: "user", content: [{ type: "text", text }] });
      if (result.isError) throw new Error("Host rejected the follow-up.");
      setMessage("Follow-up sent to conversation.");
    } catch {
      setMessage("Continue in conversation to inspect or start a Draft list.");
    }
  };
  const endDraft = async () => {
    setConfirmEnd(false);
    if (await flushQuantities()) await update({ kind: "end" });
  };
  const reviewDisclosureProps = (productId: number) => {
    const disclosure = reviewDisclosures.get(productId);
    return {
      expanded: disclosure?.expanded ?? false,
      onExpandedChange: (expanded: boolean) => setReviewDisclosures((previous) => {
        const next = new Map(previous);
        const current = previous.get(productId) ?? { expanded: false, facts: new Set<string>() };
        next.set(productId, { ...current, expanded });
        return next;
      }),
      expandedFacts: disclosure?.facts ?? EMPTY_REVIEW_FACTS,
      onFactExpandedChange: (factKey: string, expanded: boolean) => setReviewDisclosures((previous) => {
        const next = new Map(previous);
        const current = previous.get(productId) ?? { expanded: false, facts: new Set<string>() };
        const facts = new Set(current.facts);
        if (expanded) facts.add(factKey); else facts.delete(factKey);
        next.set(productId, { ...current, facts });
        return next;
      }),
    };
  };

  return <div className="app-frame"><main className="viewer" aria-labelledby="title">
    <h1 id="title">{review && active ? (review.items.length ? safeTitle : "What should we shop for?") : basket ? "Actual Nemlig basket" : screen.kind === "unavailable" ? "Start a new Draft list" : screen.kind === "review" ? "Your Draft list" : "Nemlig products"}</h1>
    <p className="intro">{review && active ? (safeTitle === "Ready" ? "Adjust quantities directly. Open a product to move it back or remove it. Prepare the exact change before adding anything to Nemlig." : safeTitle === "Choose an alternative" ? "Compare available options for this product." : "Select products to move them into Ready. Open a product for details.") : basket ? "Your current Nemlig basket. This view cannot change it." : "Inspect product details here or continue in conversation."}</p>
    {review && <nav className="destination-tabs" aria-label="Draft list destinations"><Button color="secondary" aria-current={review.destination === "needs-review" ? "page" : undefined} disabled={editsBlocked || !active} onClick={() => void navigate("needs-review")}>To decide ({review.items.filter((item) => item.state === "needs-review").length})</Button><Button color="secondary" aria-current={review.destination === "ready" ? "page" : undefined} disabled={editsBlocked || !active} onClick={() => void navigate("ready")}>Ready ({review.items.filter((item) => item.state === "ready").length})</Button>{review.alternatives && review.destination !== "alternatives" && <Button color="secondary" disabled={editsBlocked || !active} onClick={() => void navigate("alternatives")}>Return to existing alternatives</Button>}</nav>}
    {screen.kind === "loading" && <p className="status" role="status">Loading your Nemlig selection…</p>}
    {screen.kind === "error" && <section className="status"><p role="alert">{screen.message}</p><p>Continue in conversation to inspect the current Draft list.</p></section>}
    {screen.kind === "cancelled" && <section className="status"><p>Request cancelled. Continue in conversation to confirm the current Draft list before continuing.</p></section>}
    {screen.kind === "stale" && <section className="status"><p>This Draft list card is out of date and cannot make changes. Use the newest card or ask in chat to reopen the current Draft list.</p></section>}
    {!isConnected && screen.kind === "loading" && <p className="status" role="status">{error ? "Could not connect to the Draft list host." : "Connecting to Nemlig…"}</p>}
    {screen.kind === "review" && !active && <section className="status"><p>This Draft list card is inactive. Ask in chat to reopen the current Draft list.</p></section>}
    {screen.kind === "unavailable" && <section className="status"><p>This temporary Draft list is no longer available. Ask in chat before starting a new Draft list. Previous choices or submission approval are not restored.</p></section>}
    {review && active && review.destination === "alternatives" && review.alternatives && <section className="alternatives">
      <section className="alternatives-current" aria-labelledby="current-product-title">
        <h2 id="current-product-title">Current product</h2>
        {review.items.filter((item) => item.product_id === review.alternatives?.product_id).map((item) => <ProductCard key={item.product_id} view={item.view} disabled={busy} {...reviewDisclosureProps(item.product_id)} />)}
      </section>
      <form key={`${review.review_id}:${review.alternatives.product_id}:${review.alternatives.query}`} onSubmit={(event) => { event.preventDefault(); const target = review.alternatives!.product_id; const query = String(new FormData(event.currentTarget).get("query") ?? ""); if (query.trim()) void update({ kind: "alternatives", product_id: target, query: query.slice(0, 200) }); }}>
        <label htmlFor="alternative-query">Search for more products</label><input id="alternative-query" name="query" type="search" maxLength={200} defaultValue={review.alternatives.query} /><Button color="secondary" type="submit" disabled={editsBlocked}>Search products</Button>
      </form>
      <section className="alternative-options" aria-labelledby="alternative-options-title">
        <h2 id="alternative-options-title">Alternatives</h2>
        {review.alternatives.views.length === 0 ? <p className="alternatives-empty" role="status">No alternatives were returned. Try another search.</p> : <div role="radiogroup" aria-labelledby="alternative-options-title">{review.alternatives.views.map((view, index) => {
          const id = view.status === "complete" ? view.product.id : view.product_id;
          return <ProductCard key={`${id}:${index}`} view={view} disabled={editsBlocked} comparison {...(id === undefined ? {} : reviewDisclosureProps(id))} choice={replacement === id} onChoice={() => setReplacement(id)} />;
        })}</div>}
        <Button color="primary" disabled={editsBlocked || replacement === undefined} onClick={() => { const target = review.alternatives!.product_id; if (replacement !== undefined) void update({ kind: "replace", product_id: target, replacement_id: replacement }); }}>Use selected alternative</Button>
        <Button color="secondary" disabled={editsBlocked} onClick={() => void navigate("needs-review")}>Back to To decide</Button>
      </section>
    </section>}
    {screen.kind === "products" && screen.views.length > 0 && <section className="product-list" aria-label="Product results">{screen.views.map((view, index) => <ProductCard key={`${view.status === "complete" ? view.product.id : view.product_id}:${index}`} view={view} disabled={busy} />)}</section>}
    {review && active && review.items.length > 0 && review.destination !== "alternatives" && <section className="product-list" aria-label={`${safeTitle} products`}>
      {review.items.filter((item) => item.state === review.destination).map((item) => {
        const alternativeQuery = item.view.status === "complete"
          ? (item.view.product.subcategory ?? item.view.product.name ?? String(item.product_id)).slice(0, 200)
          : String(item.product_id);
        return <ProductCard
          key={item.product_id}
          view={item.view}
          {...reviewDisclosureProps(item.product_id)}
          item={{ ...item, quantity: pendingQuantities.get(item.product_id) ?? item.quantity }}
          disabled={editsBlocked}
          selected={selected.has(item.product_id)}
          onSelected={(checked) => setSelected((previous) => {
            const next = new Set(previous);
            if (checked) next.add(item.product_id); else next.delete(item.product_id);
            return next;
          })}
          onQuantity={(quantity) => setQuantity(item, quantity)}
          onRemove={() => afterFlush({ kind: "remove", product_ids: [item.product_id] })}
          onRevisit={item.state === "ready" ? () => afterFlush({ kind: "revisit", product_ids: [item.product_id] }) : undefined}
          onOpenAlternatives={item.state === "needs-review" ? () => {
            setReplacement(undefined);
            afterFlush({ kind: "alternatives", product_id: item.product_id, query: alternativeQuery });
          } : undefined}
        />;
      })}
    </section>}
    {review && active && review.destination === "needs-review" && <footer className="review-footer">
      {review.items.some((item) => item.state === "needs-review" && isUsable(item.view)) && <>
        <Button color="secondary" disabled={editsBlocked} onClick={() => setSelected(new Set(review.items.filter((item) => item.state === "needs-review" && isUsable(item.view)).map((item) => item.product_id)))}>Select all</Button>
      </>}
      {selected.size > 0 && <Button color="primary" disabled={editsBlocked} onClick={() => afterFlush({ kind: "accept", product_ids: [...selected] })}>Add selected to Ready ({selected.size})</Button>}
    </footer>}
    {review && active && review.destination === "ready" && <footer className="review-footer">
      {review.submission?.status === "submitted" ? <>
        <p className="status" role="status">Nemlig confirmed this Draft list was added successfully.</p>
        {!continueSubmitted && <Button color="secondary" disabled={busy} onClick={() => setContinueSubmitted(true)}>Continue with Draft list</Button>}
      </> : review.submission?.status === "uncertain" ? <>
        <p className="status" role="status">Submission outcome is uncertain. Inspect the actual Nemlig basket; do not retry automatically.</p>
        <Button color="secondary" disabled={busy} onClick={() => void sendFollowUp("Inspect the actual Nemlig basket for this uncertain Draft list submission. Do not retry or add anything.")}>Inspect Nemlig basket in conversation</Button>
      </> : review.submission?.status !== "prepared" && <Button color="primary" disabled={editsBlocked || !review.items.some((item) => item.state === "ready")} onClick={() => afterFlush({ kind: "prepare_submission" })}>Prepare exact change</Button>}
      {review.submission?.status === "prepared" && <section className="submission"><h2>Confirm the exact Nemlig change</h2>{review.submission.review.lines?.map((line) => <p key={line.product_id}>{line.quantity} × {line.name ?? `Product ${line.product_id}`} · {money(line.item_price)} each · {money(line.line_total)}</p>)}<p>Expected product total: {money(review.submission.review.expected_products_price)}</p>
        {submitBlocked ? <p>Inspect the actual Nemlig basket in conversation before preparing another change.</p> : confirmSubmit ? <><p>Add only these exact quantities to the Nemlig basket?</p><Button color="secondary" onClick={() => setConfirmSubmit(false)}>Cancel</Button><Button color="primary" disabled={busy} onClick={() => void flushQuantities().then(async (ok) => {
          const confirmed = activeReview.current?.review;
          if (!ok || !confirmed?.submission || confirmed.review_id !== review.review_id || confirmed.revision !== review.revision || confirmed.submission.status !== "prepared" || confirmed.submission.submission_id !== review.submission?.submission_id || callLock.current) {
            setConfirmSubmit(false);
            setMessage("The prepared change changed while quantities were being saved. Prepare and review the exact change again.");
            return;
          }
          submitBlockedRef.current = true; setSubmitBlocked(true); setConfirmSubmit(false);
          const latest = activeReview.current;
          if (!latest?.view_id) return;
          const success = await call("submit_product_review", { view_id: latest.view_id, review_id: confirmed.review_id, revision: confirmed.revision, submission_id: confirmed.submission.submission_id }, false);
          if (!success) setMessage("Submission outcome is uncertain. Inspect the actual Nemlig basket; do not retry automatically.");
        })}>Add to Nemlig</Button></> : <Button color="primary" disabled={busy} onClick={() => setConfirmSubmit(true)}>Review exact change</Button>}
      </section>}
      {message && <p className="status" role="status">{message}</p>}
    </footer>}
    {review && active && review.items.length === 0 && <section className="empty"><EmptyMessage><EmptyMessage.Title>Your Draft list is empty.</EmptyMessage.Title></EmptyMessage><p>Continue in conversation to add products or start a new Draft list. Nothing changed in Nemlig.</p><Button color="secondary" disabled={busy} onClick={() => void sendFollowUp("Help me start a new Draft list from products we discuss. Do not restore previous choices.")}>Continue in conversation</Button></section>}
    {review && active && review.submission?.status !== "uncertain" && <section className="review-footer"><Button color="secondary" disabled={editsBlocked || busy} onClick={() => setConfirmEnd(true)}>End Draft list</Button>{confirmEnd && <section className="submission"><p>Discard this local Draft list? The Nemlig basket will not change.</p><Button color="secondary" disabled={busy} onClick={() => setConfirmEnd(false)}>Keep Draft list</Button><Button color="secondary" disabled={busy} onClick={() => void endDraft()}>Confirm discard Draft list</Button></section>}</section>}
    {screen.kind === "empty" && <div className="empty"><EmptyMessage><EmptyMessage.Title>{screen.message ?? "No products found."}</EmptyMessage.Title></EmptyMessage><p>Continue in conversation to inspect the Nemlig basket or start a new Draft list.</p><Button color="secondary" disabled={busy} onClick={() => void sendFollowUp("Help me continue shopping or inspect my Nemlig basket. Do not restore a discarded Draft list.")}>Continue in conversation</Button></div>}
    {screen.kind === "products" && screen.views.length === 0 && <div className="empty" role="status">{basket ? "Your Nemlig basket is empty." : "No products found."}</div>}
    {productPayload?.unenriched_count ? <p className="status">{productPayload.unenriched_count} basket lines do not have current product details.</p> : null}
    {message && screen.kind !== "error" && !(review?.destination === "ready") && <p className="status" role="status">{message}</p>}
    {screen.kind === "review" && !active && <p className="status" role="status">{message}</p>}
  </main></div>;
}
