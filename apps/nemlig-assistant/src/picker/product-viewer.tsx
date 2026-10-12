import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  safeNemligImageUrl,
  type ProductView,
} from "../product-presentation.js";
import { ViewerPage } from "./viewer-page.js";
import type {
  BasketSummary,
  PresentationDestination,
  Review,
  ReviewItem,
  ViewerPayload,
  ViewerScreen,
} from "./viewer-page.js";

export const LONG_OPERATION_TIMEOUT_MS = 660_000;
export const viewerToolCallOptions = (signal: AbortSignal) => ({
  signal,
  timeout: LONG_OPERATION_TIMEOUT_MS,
  maxTotalTimeout: LONG_OPERATION_TIMEOUT_MS,
});

declare global {
  interface Window {
    openai?: { toolOutput?: unknown };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUncertainFailure(
  recovery: boolean,
  uncertainOnFailure: boolean,
  text: string,
): boolean {
  return !recovery && (uncertainOnFailure || /uncertain/i.test(text));
}

function submitFailureCopy(detail: string): string | undefined {
  if (
    /Basket changed before an addition; no provider write was sent/iu.test(
      detail,
    )
  ) {
    return "The Nemlig basket changed before the addition. No product was sent.";
  }
  if (/no (?:provider|basket) write was sent/iu.test(detail)) {
    return detail;
  }
  if (
    /^Nemlig (?:responded to the transfer|did not confirm the shopping-list transfer request|returned HTTP \d{3} for the shopping-list transfer)/iu.test(
      detail,
    )
  ) {
    return detail;
  }
  return undefined;
}

function isReviewItem(value: unknown): value is ReviewItem {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.product_id) &&
    typeof value.quantity === "number" &&
    Number.isSafeInteger(value.quantity) &&
    value.quantity > 0 &&
    (value.state === "needs-review" || value.state === "ready") &&
    isProductView(value.view)
  );
}

function isReview(value: unknown): value is Review {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return false;
  }
  if (!(
    value.destination === "needs-review" ||
    value.destination === "ready" ||
    value.destination === "alternatives"
  )) {
    return false;
  }
  if (!value.items.every(isReviewItem)) {
    return false;
  }
  if (
    (value.basketId !== undefined && !isBasketId(value.basketId)) ||
    (value.shoppingListId !== undefined &&
      !isPositiveSafeInteger(value.shoppingListId)) ||
    (value.shoppingListName !== undefined &&
      typeof value.shoppingListName !== "string") ||
    (value.draftId !== undefined && typeof value.draftId !== "string") ||
    (value.draftExpiresAt !== undefined &&
      !isNonnegativeSafeInteger(value.draftExpiresAt)) ||
    (value.saveStatus !== undefined &&
      !["saving", "saved", "partial", "uncertain"].includes(
        String(value.saveStatus),
      )) ||
    (value.shoppingListDirty !== undefined &&
      typeof value.shoppingListDirty !== "boolean") ||
    (value.updateStatus !== undefined &&
      !["saving", "partial", "uncertain"].includes(
        String(value.updateStatus),
      )) ||
    (value.conflictItems !== undefined &&
      (!Array.isArray(value.conflictItems) ||
        !value.conflictItems.every(isReviewItem))) ||
    (value.saveProgress !== undefined &&
      (!isRecord(value.saveProgress) ||
        !isNonnegativeSafeInteger(value.saveProgress.completed) ||
        !isNonnegativeSafeInteger(value.saveProgress.total))) ||
    (value.actionNotice !== undefined &&
      typeof value.actionNotice !== "string") ||
    (value.revision !== undefined &&
      (typeof value.revision !== "number" ||
        !Number.isSafeInteger(value.revision) ||
        value.revision < 0)) ||
    (value.submissionAttempted !== undefined &&
      typeof value.submissionAttempted !== "boolean")
  ) {
    return false;
  }
  if (
    value.alternatives !== undefined &&
    (!isRecord(value.alternatives) ||
      !Number.isSafeInteger(value.alternatives.product_id) ||
      typeof value.alternatives.query !== "string" ||
      !Array.isArray(value.alternatives.views) ||
      !value.alternatives.views.every(isProductView))
  ) {
    return false;
  }
  if (value.submission !== undefined) {
    if (
      !isRecord(value.submission) ||
      !["prepared", "submitted", "uncertain", "partial"].includes(
        String(value.submission.status),
      ) ||
      typeof value.submission.submission_id !== "string" ||
      !isRecord(value.submission.review) ||
      (value.submission.verified_additions !== undefined &&
        (typeof value.submission.verified_additions !== "number" ||
          !Number.isSafeInteger(value.submission.verified_additions) ||
          value.submission.verified_additions < 0)) ||
      (value.submission.cleanup_warning !== undefined &&
        typeof value.submission.cleanup_warning !== "string") ||
      (value.submission.skipped_products !== undefined &&
        (!Array.isArray(value.submission.skipped_products) ||
          !value.submission.skipped_products.every(
            (item) =>
              isRecord(item) &&
              Number.isSafeInteger(item.product_id) &&
              typeof item.name === "string",
          )))
    ) {
      return false;
    }
    const submissionReview = value.submission.review;
    const validOptionalTotal = (amount: unknown) =>
      amount === undefined ||
      (typeof amount === "number" && Number.isFinite(amount) && amount >= 0);
    if (
      !validOptionalTotal(submissionReview.expected_products_price) ||
      (submissionReview.skipped_products !== undefined &&
        (!Array.isArray(submissionReview.skipped_products) ||
          !submissionReview.skipped_products.every(
            (item) =>
              isRecord(item) &&
              Number.isSafeInteger(item.product_id) &&
              typeof item.name === "string",
          ))) ||
      (submissionReview.lines !== undefined &&
        (!Array.isArray(submissionReview.lines) ||
          !submissionReview.lines.every(
            (line) =>
              isRecord(line) &&
              Number.isSafeInteger(line.product_id) &&
              typeof line.quantity === "number" &&
              Number.isSafeInteger(line.quantity) &&
              line.quantity > 0 &&
              (line.name === undefined || typeof line.name === "string") &&
              (line.unit_size === undefined ||
                typeof line.unit_size === "string") &&
              validOptionalTotal(line.item_price) &&
              validOptionalTotal(line.line_total),
          )))
    ) {
      return false;
    }
  }
  return true;
}
export function isBasketId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      value,
    ) ||
      /^[1-9]\d{0,14}$/u.test(value))
  );
}
function isDraftId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}
function reviewTargetId(review: Review): string | undefined {
  return review.shoppingListId !== undefined
    ? String(review.shoppingListId)
    : (review.draftId ?? review.basketId);
}
function reviewTargetArgs(review: Review): Record<string, unknown> {
  if (review.draftId !== undefined) {
    return { draft_id: review.draftId };
  }
  if (review.shoppingListId !== undefined) {
    return { shopping_list_id: review.shoppingListId };
  }
  return review.basketId ? { basket_id: review.basketId } : {};
}
function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function hasValidBasketTimestamps(value: Record<string, unknown>) {
  return (
    isNonnegativeSafeInteger(value.createdAt) &&
    isNonnegativeSafeInteger(value.lastActivityAt) &&
    isNonnegativeSafeInteger(value.expiresAt)
  );
}
function hasValidBasketCounts(value: Record<string, unknown>) {
  return (
    isNonnegativeSafeInteger(value.revision) &&
    isNonnegativeSafeInteger(value.productCount)
  );
}
function hasValidBasketIdentity(value: Record<string, unknown>) {
  return (
    isBasketId(value.basketId) &&
    hasValidBasketTimestamps(value) &&
    hasValidBasketCounts(value) &&
    typeof value.submissionAttempted === "boolean"
  );
}
function isBasketSummary(value: unknown): value is BasketSummary {
  if (!isRecord(value)) {
    return false;
  }
  if (value.nativeShoppingList === true) {
    return (
      /^[1-9]\d{0,14}$/u.test(String(value.basketId)) &&
      typeof value.shoppingListName === "string" &&
      isNonnegativeSafeInteger(value.productCount) &&
      value.submissionAttempted === false
    );
  }
  return hasValidBasketIdentity(value);
}
// Keep the complete untrusted tool-payload validation at the rendering boundary.
// fallow-ignore-next-line complexity
function isProductView(value: unknown): value is ProductView {
  if (
    !isRecord(value) ||
    typeof value.context !== "string" ||
    !["search", "details", "result", "basket", "review"].includes(value.context)
  ) {
    return false;
  }
  if (value.status === "unavailable") {
    return (
      (value.product_id === undefined ||
        Number.isSafeInteger(value.product_id)) &&
      (value.missing === undefined || typeof value.missing === "boolean")
    );
  }
  if (value.status !== "complete" || !isRecord(value.product)) {
    return false;
  }
  const product = value.product;
  const optionalString = (key: string) =>
    product[key] === undefined || typeof product[key] === "string";
  const optionalNumber = (key: string) =>
    product[key] === undefined ||
    (typeof product[key] === "number" && Number.isFinite(product[key]));
  const optionalBoolean = (key: string) =>
    product[key] === undefined || typeof product[key] === "boolean";
  const optionalNonnegativeNumber = (
    record: Record<string, unknown>,
    key: string,
  ) =>
    record[key] === undefined ||
    (typeof record[key] === "number" &&
      Number.isFinite(record[key]) &&
      record[key] >= 0);
  const basketValid =
    value.basket === undefined ||
    (isRecord(value.basket) &&
      optionalNonnegativeNumber(value.basket, "quantity") &&
      optionalNonnegativeNumber(value.basket, "line_total"));
  const reviewValid =
    value.review === undefined ||
    (isRecord(value.review) &&
      optionalNonnegativeNumber(value.review, "quantity") &&
      optionalNonnegativeNumber(value.review, "line_total") &&
      (value.review.approved === undefined ||
        typeof value.review.approved === "boolean"));
  const detailsValid =
    product.details === undefined ||
    (Array.isArray(product.details) &&
      product.details.every(
        (fact) =>
          isRecord(fact) &&
          typeof fact.key === "string" &&
          typeof fact.value === "string",
      ));
  const stringArraysValid = [product.labels, product.tags].every(
    (list) =>
      list === undefined ||
      (Array.isArray(list) && list.every((entry) => typeof entry === "string")),
  );
  return (
    (product.id === undefined || Number.isSafeInteger(product.id)) &&
    [
      "name",
      "brand",
      "unit",
      "unit_size",
      "category",
      "subcategory",
      "currency",
      "description",
      "declaration",
      "image_url",
    ].every(optionalString) &&
    ["price", "unit_price"].every(optionalNumber) &&
    ["available", "is_organic", "is_frozen", "is_on_discount"].every(
      optionalBoolean,
    ) &&
    basketValid &&
    reviewValid &&
    detailsValid &&
    stringArraysValid
  );
}
function readBasketSummaries(
  envelope: Record<string, unknown>,
): BasketSummary[] | undefined {
  if (envelope.shoppingLists !== undefined) {
    if (
      !Array.isArray(envelope.shoppingLists) ||
      !envelope.shoppingLists.every(
        (list) =>
          isRecord(list) &&
          isPositiveSafeInteger(list.id) &&
          typeof list.name === "string" &&
          (list.productCount === undefined ||
            isNonnegativeSafeInteger(list.productCount)),
      )
    ) {
      return undefined;
    }
    return envelope.shoppingLists.map((list) => {
      const native = list as Record<string, unknown>;
      return {
        basketId: String(native.id),
        nativeShoppingList: true,
        shoppingListName: native.name as string,
        productCount: (native.productCount as number | undefined) ?? 0,
        submissionAttempted: false,
      };
    });
  }
  if (envelope.baskets === undefined) {
    return [];
  }
  if (
    !Array.isArray(envelope.baskets) ||
    !envelope.baskets.every(isBasketSummary)
  ) {
    return undefined;
  }
  return envelope.baskets;
}
function hasUnselectedReview(value: unknown) {
  return (
    isRecord(value) &&
    isReview(value) &&
    !isBasketId(value.basketId) &&
    !isPositiveSafeInteger(value.shoppingListId) &&
    !isDraftId(value.draftId)
  );
}
function requiresBasketPicker(envelope: Record<string, unknown>) {
  const serverRequiresSelection =
    envelope.selectionRequired === true || envelope.unavailable === true;
  return serverRequiresSelection || hasUnselectedReview(envelope.review);
}
function readPayload(value: unknown): ViewerScreen | undefined {
  if (Array.isArray(value) && value.every(isProductView)) {
    return { kind: "products", payload: { views: value }, views: value };
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const envelope = isRecord(value.structuredContent)
    ? value.structuredContent
    : value;
  const baskets = readBasketSummaries(envelope);
  if (!baskets) {
    return undefined;
  }
  const selectedBasketId = isPositiveSafeInteger(
    envelope.selectedShoppingListId,
  )
    ? String(envelope.selectedShoppingListId)
    : isBasketId(envelope.selectedBasketId)
      ? envelope.selectedBasketId
      : undefined;
  if (requiresBasketPicker(envelope)) {
    return { kind: "picker", baskets, selectedBasketId };
  }
  if (isRecord(envelope.review) && isReview(envelope.review)) {
    return {
      kind: "review",
      review: envelope.review,
      active: true,
    };
  }
  if (Array.isArray(envelope.baskets)) {
    return { kind: "picker", baskets, selectedBasketId };
  }
  if (envelope.ended === true) {
    return {
      kind: "empty",
      message: "Your unsaved draft was discarded. Nothing changed in Nemlig.",
    };
  }
  const candidate = Array.isArray(envelope.views)
    ? envelope.views
    : Array.isArray(envelope.products)
      ? envelope.products
      : Array.isArray(envelope.result)
        ? envelope.result
        : undefined;
  if (candidate && candidate.every(isProductView)) {
    return {
      kind: "products",
      payload: envelope as ViewerPayload,
      views: candidate,
    };
  }
  return undefined;
}
// The adapter intentionally owns all host state and authority checks.
// fallow-ignore-next-line complexity
export function ProductViewer() {
  const [screen, setScreen] = useState<ViewerScreen>(() => {
    const initial =
      typeof window === "undefined"
        ? undefined
        : readPayload(window.openai?.toolOutput);
    return initial ?? { kind: "loading" };
  });
  const [baskets, setBaskets] = useState<BasketSummary[]>(() =>
    screen.kind === "picker" ? screen.baskets : [],
  );
  const [selectedBasketId, setSelectedBasketId] = useState<string | undefined>(
    () =>
      screen.kind === "review"
        ? reviewTargetId(screen.review)
        : screen.kind === "picker"
          ? screen.selectedBasketId
          : undefined,
  );
  const selectedBasketIdRef = useRef(selectedBasketId);
  const selectionEpoch = useRef(0);
  const selectionContext = () => ({
    basketId: selectedBasketIdRef.current,
    epoch: selectionEpoch.current,
  });
  const isCurrentSelection = (expected: { basketId?: string; epoch: number }) =>
    expected.epoch === selectionEpoch.current &&
    expected.basketId === selectedBasketIdRef.current;
  const [presentationDestination, setPresentationDestination] = useState<
    PresentationDestination | undefined
  >(() => (screen.kind === "review" ? screen.review.destination : undefined));
  const activeReview = useRef<{ review: Review; active: boolean } | undefined>(
    screen.kind === "review" ? screen : undefined,
  );
  const lastConfirmedReview = useRef<Review | undefined>(
    screen.kind === "review" ? screen.review : undefined,
  );
  const callLock = useRef(false);
  const activeToolController = useRef<AbortController | undefined>(undefined);
  const cancelledCallPending = useRef(false);
  const ignorePassivePayloads = useRef(
    screen.kind === "review" &&
      (screen.review.submissionAttempted === true ||
        screen.review.submission?.status === "submitted" ||
        screen.review.submission?.status === "uncertain" ||
        screen.review.submission?.status === "partial"),
  );
  const cancellationEpoch = useRef(0);
  const heartbeatByBasket = useRef(
    new Map<
      string,
      { attemptedAt: number; renewedAt: number; intentAt: number }
    >(),
  );
  const [reviewDisclosures, setReviewDisclosures] = useState<
    Map<number, Set<string>>
  >(() => new Map());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [continueSubmitted, setContinueSubmitted] = useState(false);
  const [submitBlocked, setSubmitBlocked] = useState(
    screen.kind === "review" &&
      (screen.review.submissionAttempted === true ||
        screen.review.submission?.status === "uncertain"),
  );
  const submitBlockedRef = useRef(
    screen.kind === "review" &&
      (screen.review.submissionAttempted === true ||
        screen.review.submission?.status === "uncertain"),
  );
  const submissionFailure = useRef<string | undefined>(undefined);
  const [pendingQuantities, setPendingQuantities] = useState<
    Map<number, number>
  >(() => new Map());

  const pendingQuantitiesRef = useRef(new Map<number, number>());
  const quantityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const quantityFlush = useRef<Promise<boolean> | undefined>(undefined);
  const callIdleWaiters = useRef<Array<() => void>>([]);
  const resetBasketUi = () => {
    if (quantityTimer.current) {
      clearTimeout(quantityTimer.current);
    }
    quantityTimer.current = undefined;
    pendingQuantitiesRef.current.clear();
    setPendingQuantities(new Map());
    quantityFlush.current = undefined;
    activeReview.current = undefined;
    lastConfirmedReview.current = undefined;
    setPresentationDestination(undefined);
    setReviewDisclosures(new Map());
    setConfirmEnd(false);
    setContinueSubmitted(false);
    setSubmitBlocked(false);
    submitBlockedRef.current = false;
    setMessage("");
    ignorePassivePayloads.current = false;
    submissionFailure.current = undefined;
  };
  const changeBasket = (basketId: string | undefined) => {
    if (selectedBasketIdRef.current === basketId) {
      return;
    }
    activeToolController.current?.abort();
    selectionEpoch.current++;
    selectedBasketIdRef.current = basketId;
    setSelectedBasketId(basketId);
    resetBasketUi();
  };
  const clearPendingQuantities = () => {
    pendingQuantitiesRef.current.clear();
    setPendingQuantities(new Map());
  };
  const removePendingQuantity = (productId: number, quantity: number) => {
    if (pendingQuantitiesRef.current.get(productId) !== quantity) {
      return;
    }
    const next = new Map(pendingQuantitiesRef.current);
    next.delete(productId);
    pendingQuantitiesRef.current = next;
    setPendingQuantities(next);
  };
  const waitForCallIdle = async () => {
    while (callLock.current) {
      await new Promise<void>((resolve) =>
        callIdleWaiters.current.push(resolve),
      );
    }
  };
  const deactivateReview = useCallback(() => {
    if (quantityTimer.current) {
      clearTimeout(quantityTimer.current);
    }
    quantityTimer.current = undefined;
    clearPendingQuantities();
    setConfirmEnd(false);
    const current = activeReview.current;
    if (current) {
      const inactive = { ...current, active: false };
      activeReview.current = inactive;
      setScreen({ kind: "review", ...inactive });
    }
  }, []);
  const applyPayload = useCallback(
    (
      payload: unknown,
      current = false,
      adoptPresentationDestination = false,
    ) => {
      const next = readPayload(payload);
      if (!current && ignorePassivePayloads.current) {
        return true;
      }
      if (isRecord(payload) && payload.isError === true) {
        deactivateReview();
        setScreen({
          kind: "error",
          message:
            "Could not load the shopping list. Reconnect Nemlig or try again in conversation.",
        });
        return false;
      }
      if (!next) {
        deactivateReview();
        setScreen({
          kind: "error",
          message:
            "Nemlig returned a response this view could not read. Continue in conversation to inspect the current state.",
        });
        return false;
      }
      if (
        !current &&
        next.kind === "picker" &&
        activeReview.current?.active &&
        isBasketId(selectedBasketIdRef.current)
      ) {
        return true;
      }
      const previous = activeReview.current;
      if (next.kind === "picker") {
        deactivateReview();
        activeReview.current = undefined;
        if (selectedBasketIdRef.current !== next.selectedBasketId) {
          changeBasket(next.selectedBasketId);
        }
        setBaskets(next.baskets);
        setScreen(next);
        setPresentationDestination(undefined);
        return true;
      }
      if (next.kind === "review") {
        const nextTargetId = reviewTargetId(next.review);
        if (
          !current &&
          selectedBasketIdRef.current &&
          selectedBasketIdRef.current !== nextTargetId
        ) {
          return true;
        }
        if (selectedBasketIdRef.current !== nextTargetId) {
          changeBasket(nextTargetId);
        }
        if (
          next.review.submission?.status === "submitted" ||
          next.review.submission?.status === "uncertain" ||
          next.review.submission?.status === "partial"
        ) {
          ignorePassivePayloads.current = true;
        }
        const sameReview = Boolean(
          previous &&
          reviewTargetId(previous.review) === reviewTargetId(next.review),
        );
        if (!sameReview) {
          setReviewDisclosures(new Map());
        }
        const state = {
          review: next.review,
          active: true,
        };
        activeReview.current = state;
        lastConfirmedReview.current = next.review;
        const submissionChanged =
          !sameReview ||
          next.review.basketId !== previous?.review.basketId ||
          next.review.submission?.submission_id !==
            previous?.review.submission?.submission_id;
        if (submissionChanged) {
          submitBlockedRef.current = false;
          setSubmitBlocked(false);
        }
        const preserveContinuation =
          sameReview &&
          previous?.review.submission?.status === "submitted" &&
          next.review.submission?.status === "submitted" &&
          previous.review.submission.submission_id ===
            next.review.submission.submission_id;
        setContinueSubmitted((continued) => continued && preserveContinuation);
        if (
          next.review.submission?.status === "submitted" ||
          next.review.submission?.status === "uncertain" ||
          next.review.submission?.status === "partial"
        ) {
          const uncertain = next.review.submission.status === "uncertain";
          submitBlockedRef.current = uncertain;
          setSubmitBlocked(uncertain);
        }
        if (next.review.submissionAttempted) {
          ignorePassivePayloads.current = true;
          submitBlockedRef.current = true;
          setSubmitBlocked(true);
        }
        const payloadRecord = isRecord(payload)
          ? isRecord(payload.structuredContent)
            ? payload.structuredContent
            : payload
          : undefined;
        if (payloadRecord && Array.isArray(payloadRecord.baskets)) {
          setBaskets(payloadRecord.baskets as BasketSummary[]);
        }
        setScreen({ kind: "review", ...state });
        setPresentationDestination((visible) => {
          if (!sameReview || adoptPresentationDestination) {
            return next.review.destination;
          }
          if (visible === "alternatives" && !next.review.alternatives) {
            return next.review.destination;
          }
          return visible ?? next.review.destination;
        });
        setMessage("");
      } else if (next.kind === "unavailable") {
        deactivateReview();
        activeReview.current = undefined;
        setPresentationDestination(undefined);
        setScreen({
          kind: "unavailable",
          review: previous?.review ?? lastConfirmedReview.current,
        });
      } else {
        if (next.kind !== "empty" && !current && previous?.active) {
          return true;
        }
        activeReview.current = undefined;
        if (next.kind === "empty") {
          deactivateReview();
          activeReview.current = undefined;
          setPresentationDestination(undefined);
          lastConfirmedReview.current = undefined;
          submitBlockedRef.current = false;
          setSubmitBlocked(false);
          setContinueSubmitted(false);
          setReviewDisclosures(new Map());
        }
        setScreen(next);
      }
      return true;
    },
    [deactivateReview],
  );
  const {
    app: connectedApp,
    isConnected,
    error,
  } = useApp({
    appInfo: { name: "nemlig-product-viewer", version: "10.0.0" },
    capabilities: {},
    onAppCreated: (host) => {
      host.ontoolresult = (result) => applyPayload(result);
      host.ontoolcancelled = () => {
        cancelledCallPending.current = true;
        cancellationEpoch.current++;
        activeToolController.current?.abort();
        ignorePassivePayloads.current = true;
        deactivateReview();
        setScreen({ kind: "cancelled" });
        setMessage(
          "Request cancelled. Continue in conversation when you are ready.",
        );
      };
      host.onerror = () => {
        if (cancelledCallPending.current) {
          return;
        }
        ignorePassivePayloads.current = true;
        deactivateReview();
        setScreen({
          kind: "error",
          message:
            "The shopping-list connection failed. Refresh the list or continue in conversation.",
        });
      };
    },
  });
  useHostStyles(connectedApp, connectedApp?.getHostContext());
  useEffect(
    () => () => {
      activeToolController.current?.abort();
      if (quantityTimer.current) {
        clearTimeout(quantityTimer.current);
      }
      connectedApp?.close();
    },
    [connectedApp],
  );
  const handleCallFailure = (
    cause: unknown,
    recovery: boolean,
    uncertainOnFailure: boolean,
  ) => {
    ignorePassivePayloads.current = true;
    const text = cause instanceof Error ? cause.message : "Update failed";
    if (/Nemlig changed this list/iu.test(text)) {
      submissionFailure.current =
        "Nemlig changed this list. Review its refreshed contents before submitting again.";
      submitBlockedRef.current = false;
      setSubmitBlocked(false);
      setMessage(submissionFailure.current);
      return;
    }
    if (/no (?:basket|provider) write was sent/iu.test(text)) {
      submitBlockedRef.current = false;
      setSubmitBlocked(false);
      setMessage(submissionFailure.current ?? text);
      return;
    }
    if (isUncertainFailure(recovery, uncertainOnFailure, text)) {
      submitBlockedRef.current = true;
      setSubmitBlocked(true);
      setMessage(
        submissionFailure.current ??
          "Nemlig did not confirm whether the complete addition reached the basket.",
      );
      return;
    }
    deactivateReview();
    setPendingQuantities(new Map());
    setScreen({
      kind: "error",
      message:
        "We could not confirm this action. Refresh the shopping list to read its current state before continuing.",
    });
  };
  // fallow-ignore-next-line complexity
  const call = async (
    name: string,
    args: Record<string, unknown>,
    recovery = true,
    adoptPresentationDestination = false,
    uncertainOnFailure = false,
    background = false,
    expectedSelection?: { basketId?: string; epoch: number },
    preserveReviewOnFailure = false,
  ): Promise<boolean> => {
    if (!connectedApp || !isConnected) {
      if (!background) {
        setMessage(
          error
            ? "The shopping list could not connect. Continue in conversation or reopen it."
            : "Connecting to the current shopping list…",
        );
      }
      return false;
    }
    while (callLock.current) {
      if (background) {
        return false;
      }
      await waitForCallIdle();
      if (!connectedApp || !isConnected) {
        return false;
      }
      if (
        expectedSelection &&
        (expectedSelection.epoch !== selectionEpoch.current ||
          expectedSelection.basketId !== selectedBasketIdRef.current)
      ) {
        return false;
      }
    }
    if (
      expectedSelection &&
      (expectedSelection.epoch !== selectionEpoch.current ||
        expectedSelection.basketId !== selectedBasketIdRef.current)
    ) {
      return false;
    }
    const requestArgs = { ...args };
    if (name === "update_product_review") {
      const action = isRecord(requestArgs.action) ? requestArgs.action : {};
      const kind = action.kind;
      if (kind !== "list") {
        const explicitTarget =
          kind === "select" ||
          kind === "show" ||
          kind === "delete" ||
          kind === "heartbeat";
        const targetReview = activeReview.current?.review;
        const targetArgs = explicitTarget
          ? requestArgs.basket_id !== undefined
            ? { basket_id: requestArgs.basket_id }
            : requestArgs.shopping_list_id !== undefined
              ? { shopping_list_id: requestArgs.shopping_list_id }
              : requestArgs.draft_id !== undefined
                ? { draft_id: requestArgs.draft_id }
                : {}
          : targetReview
            ? reviewTargetArgs(targetReview)
            : {};
        const targetId =
          targetArgs.shopping_list_id !== undefined
            ? String(targetArgs.shopping_list_id)
            : (targetArgs.draft_id ?? targetArgs.basket_id);
        if (!isBasketId(targetId)) {
          setMessage("Choose a shopping list before continuing.");
          setScreen({ kind: "picker", baskets, selectedBasketId });
          return false;
        }
        delete requestArgs.basket_id;
        delete requestArgs.draft_id;
        delete requestArgs.shopping_list_id;
        Object.assign(requestArgs, targetArgs);
      } else {
        delete requestArgs.basket_id;
      }
    } else if (name === "submit_product_review") {
      const targetReview = activeReview.current?.review;
      if (!targetReview || targetReview.draftId) {
        setMessage("Save this draft as a Nemlig shopping list before review.");
        return false;
      }
      const targetArgs = reviewTargetArgs(targetReview);
      if (
        !isBasketId(
          targetArgs.shopping_list_id !== undefined
            ? String(targetArgs.shopping_list_id)
            : targetArgs.basket_id,
        )
      ) {
        setMessage("Choose a shopping list before continuing.");
        setScreen({ kind: "picker", baskets, selectedBasketId });
        return false;
      }
      Object.assign(requestArgs, targetArgs);
    }
    callLock.current = true;
    cancelledCallPending.current = false;
    if (name === "submit_product_review") {
      submissionFailure.current = undefined;
    }
    const requestEpoch = cancellationEpoch.current;
    const requestSelectionEpoch =
      expectedSelection?.epoch ?? selectionEpoch.current;
    const requestController = new AbortController();
    activeToolController.current = requestController;
    if (!background) {
      setBusy(true);
      setMessage("Updating…");
    }
    try {
      const result = await connectedApp.callServerTool(
        { name, arguments: requestArgs },
        viewerToolCallOptions(requestController.signal),
      );
      if (
        requestEpoch !== cancellationEpoch.current ||
        requestSelectionEpoch !== selectionEpoch.current
      ) {
        return false;
      }
      if (result.isError) {
        const detail =
          (result.content ?? [])
            .filter((content) => content.type === "text")
            .map((content) => content.text)
            .join(" ") || "Update failed";
        if (name === "submit_product_review") {
          submissionFailure.current = submitFailureCopy(detail);
        }
        throw new Error(detail);
      }
      if (background) {
        const payloadRecord = isRecord(result.structuredContent)
          ? result.structuredContent
          : undefined;
        if (
          payloadRecord &&
          Array.isArray(payloadRecord.baskets) &&
          payloadRecord.baskets.every(isBasketSummary)
        ) {
          setBaskets(payloadRecord.baskets);
        }
      } else if (!applyPayload(result, true, adoptPresentationDestination)) {
        throw new Error("Could not confirm the updated shopping list.");
      }
      if (
        !background &&
        (name === "submit_product_review" || name === "update_product_review")
      ) {
        ignorePassivePayloads.current = true;
      }
      if (!background) {
        setMessage("");
      }
      return true;
    } catch (cause) {
      if (
        !background &&
        requestEpoch === cancellationEpoch.current &&
        requestSelectionEpoch === selectionEpoch.current
      ) {
        if (preserveReviewOnFailure) {
          ignorePassivePayloads.current = true;
          setMessage(
            "Could not save the pending quantity. Keep this shopping list open and retry before switching.",
          );
        } else {
          handleCallFailure(cause, recovery, uncertainOnFailure);
        }
      }
      return false;
    } finally {
      if (activeToolController.current === requestController) {
        activeToolController.current = undefined;
      }
      callLock.current = false;
      if (!background) {
        setBusy(false);
      }
      for (const resolve of callIdleWaiters.current.splice(0)) {
        resolve();
      }
    }
  };
  const callRef = useRef(call);
  callRef.current = call;
  useEffect(() => {
    const hour = 60 * 60 * 1_000;
    const activeInteractions = new Set<string>();
    const releaseFrames = new Set<number>();
    const getHeartbeatState = (basketId: string) => {
      const state = heartbeatByBasket.current.get(basketId) ?? {
        attemptedAt: 0,
        renewedAt: 0,
        intentAt: 0,
      };
      heartbeatByBasket.current.set(basketId, state);
      return state;
    };
    const isVisibleAndFocused = () =>
      document.visibilityState === "visible" && document.hasFocus();
    const hasBasketContext = (
      basketId: string | undefined,
      current: { active: boolean } | undefined,
    ): basketId is string => Boolean(basketId && current?.active);
    const canRenewBasket = (
      basketId: string | undefined,
      current: { active: boolean } | undefined,
    ): basketId is string =>
      hasBasketContext(basketId, current) &&
      isVisibleAndFocused() &&
      !callLock.current &&
      activeInteractions.size === 0;
    const hasRenewalIntent = (state: {
      attemptedAt: number;
      renewedAt: number;
      intentAt: number;
    }) => state.intentAt > state.renewedAt;
    const rememberIntent = (basketId: string) => {
      const state = getHeartbeatState(basketId);
      const now = Date.now();
      state.intentAt = now;
      if (state.attemptedAt === 0) {
        state.attemptedAt = now;
      }
      return state;
    };
    const pointerInteractionKey = (event: Event) => {
      if (event.type !== "pointerdown" || !("pointerId" in event)) {
        return undefined;
      }
      return `pointer:${String(event.pointerId)}`;
    };
    const keyboardInteractionKey = (event: Event) => {
      if (event.type !== "keydown" || !("key" in event)) {
        return undefined;
      }
      return `key:${String(event.key)}`;
    };
    const interactionKey = (event: Event) =>
      pointerInteractionKey(event) ?? keyboardInteractionKey(event);
    const trackInteraction = (event: Event) => {
      const key = interactionKey(event);
      if (key) {
        activeInteractions.add(key);
      }
    };
    const tick = () => {
      const basketId = selectedBasketIdRef.current;
      const current = activeReview.current;
      if (!canRenewBasket(basketId, current)) {
        return;
      }
      const state = getHeartbeatState(basketId);
      const now = Date.now();
      if (!hasRenewalIntent(state) || now - state.attemptedAt < hour) {
        return;
      }
      state.attemptedAt = now;
      heartbeatByBasket.current.set(basketId, state);
      const requestEpoch = selectionEpoch.current;
      void callRef
        .current(
          "update_product_review",
          { action: { kind: "heartbeat" }, basket_id: basketId },
          true,
          false,
          false,
          true,
        )
        .then((ok) => {
          if (
            ok &&
            basketId === selectedBasketIdRef.current &&
            requestEpoch === selectionEpoch.current
          ) {
            state.renewedAt = Date.now();
          }
        });
    };
    const recordIntent = (event: Event) => {
      if (!event.isTrusted) {
        return;
      }
      const basketId = selectedBasketIdRef.current;
      if (!basketId) {
        return;
      }
      rememberIntent(basketId);
      trackInteraction(event);
    };
    const scheduleInteractionRelease = (key: string) => {
      const frame = requestAnimationFrame(() => {
        activeInteractions.delete(key);
        releaseFrames.delete(frame);
      });
      releaseFrames.add(frame);
    };
    const releasePointer = (event: PointerEvent) =>
      scheduleInteractionRelease(`pointer:${event.pointerId}`);
    const releaseKey = (event: KeyboardEvent) =>
      scheduleInteractionRelease(`key:${event.key}`);
    const pauseActivity = () => {
      activeInteractions.clear();
      const basketId = selectedBasketIdRef.current;
      const state = basketId
        ? heartbeatByBasket.current.get(basketId)
        : undefined;
      if (state) {
        state.intentAt = state.renewedAt;
      }
    };
    const visibilityChanged = () => {
      if (document.visibilityState === "visible") {
        tick();
      } else {
        pauseActivity();
      }
    };
    document.addEventListener("pointerdown", recordIntent, true);
    document.addEventListener("keydown", recordIntent, true);
    document.addEventListener("pointerup", releasePointer, true);
    document.addEventListener("pointercancel", releasePointer, true);
    document.addEventListener("keyup", releaseKey, true);
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("focus", tick);
    window.addEventListener("blur", pauseActivity);
    const timer = setInterval(tick, 60_000);
    return () => {
      clearInterval(timer);
      for (const frame of releaseFrames) {
        cancelAnimationFrame(frame);
      }
      document.removeEventListener("pointerdown", recordIntent, true);
      document.removeEventListener("keydown", recordIntent, true);
      document.removeEventListener("pointerup", releasePointer, true);
      document.removeEventListener("pointercancel", releasePointer, true);
      document.removeEventListener("keyup", releaseKey, true);
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("focus", tick);
      window.removeEventListener("blur", pauseActivity);
    };
  }, []);
  const review = screen.kind === "review" ? screen.review : undefined;
  const update = async (action: Record<string, unknown>) => {
    const expected = selectionContext();
    const latest = activeReview.current;
    if (
      !latest?.active ||
      expected.epoch !== selectionEpoch.current ||
      expected.basketId !== selectedBasketIdRef.current
    ) {
      return false;
    }
    const result = await call(
      "update_product_review",
      { action },
      true,
      action.kind === "alternatives" || action.kind === "replace",
      false,
      false,
      expected,
    );
    return result;
  };
  const setQuantity = (item: ReviewItem, next: number) => {
    const pending = new Map(pendingQuantitiesRef.current).set(
      item.product_id,
      next,
    );
    pendingQuantitiesRef.current = pending;
    setPendingQuantities(pending);
    if (quantityTimer.current) {
      clearTimeout(quantityTimer.current);
    }
    quantityTimer.current = setTimeout(() => {
      quantityTimer.current = undefined;
      void flushQuantities();
    }, 2_500);
  };
  const flushQuantities = async (expected = selectionContext()) => {
    if (quantityTimer.current) {
      clearTimeout(quantityTimer.current);
    }
    quantityTimer.current = undefined;
    if (quantityFlush.current) {
      return quantityFlush.current;
    }
    if (!pendingQuantitiesRef.current.size) {
      return true;
    }
    const operation = (async () => {
      while (pendingQuantitiesRef.current.size) {
        await waitForCallIdle();
        if (
          expected.epoch !== selectionEpoch.current ||
          expected.basketId !== selectedBasketIdRef.current
        ) {
          return false;
        }
        const latest = activeReview.current;
        if (!latest?.active) {
          return false;
        }
        const [product_id, quantity] = pendingQuantitiesRef.current
          .entries()
          .next().value as [number, number];
        const currentQuantity = latest.review.items.find(
          (item) => item.product_id === product_id,
        )?.quantity;
        if (currentQuantity === quantity) {
          removePendingQuantity(product_id, quantity);
          continue;
        }
        const ok = await call(
          "update_product_review",
          { action: { kind: "quantity", product_id, quantity } },
          true,
          false,
          false,
          false,
          expected,
          true,
        );
        if (
          !ok ||
          expected.epoch !== selectionEpoch.current ||
          expected.basketId !== selectedBasketIdRef.current
        ) {
          return false;
        }
        const confirmed = activeReview.current?.review.items.find(
          (item) => item.product_id === product_id,
        )?.quantity;
        if (confirmed !== quantity) {
          return false;
        }
        removePendingQuantity(product_id, quantity);
      }
      return activeReview.current?.active === true;
    })();
    const tracked = operation.finally(() => {
      if (quantityFlush.current === tracked) {
        quantityFlush.current = undefined;
      }
    });
    quantityFlush.current = tracked;
    return tracked;
  };
  const afterFlush = (action: Record<string, unknown>) => {
    const expected = selectionContext();
    void flushQuantities(expected).then(async (ok) => {
      if (
        ok &&
        expected.epoch === selectionEpoch.current &&
        expected.basketId === selectedBasketIdRef.current
      ) {
        await update(action);
      }
    });
  };
  const saveDraft = (name: string) => {
    afterFlush({ kind: "save", name });
  };
  const updateShoppingList = () => {
    afterFlush({ kind: "update" });
  };
  const discardPendingUpdate = () => {
    afterFlush({ kind: "discard_pending_update" });
  };
  const navigate = (next: PresentationDestination) => {
    if (next === "alternatives" && !review?.alternatives) {
      return;
    }
    setPresentationDestination(next);
  };
  const sendFollowUp = async (text: string) => {
    if (!connectedApp || !isConnected) {
      setMessage(
        "Continue in conversation to inspect a shopping list or start a draft.",
      );
      return;
    }
    try {
      const result = await connectedApp.sendMessage({
        role: "user",
        content: [{ type: "text", text }],
      });
      if (result.isError) {
        throw new Error("Host rejected the follow-up.");
      }
      setMessage("Follow-up sent to conversation.");
    } catch {
      setMessage(
        "Continue in conversation to inspect a shopping list or start a draft.",
      );
    }
  };
  const openPicker = async () => {
    if (busy) {
      return;
    }
    const expected = selectionContext();
    if (!(await flushQuantities(expected))) {
      return;
    }
    if (!isCurrentSelection(expected)) {
      return;
    }
    deactivateReview();
    setScreen({
      kind: "picker",
      baskets,
      selectedBasketId: selectedBasketIdRef.current,
    });
    setPresentationDestination(undefined);
    await call(
      "update_product_review",
      { action: { kind: "list" } },
      true,
      false,
      false,
      false,
      expected,
    );
  };
  const selectBasket = async (basketId: string) => {
    if (busy || !isBasketId(basketId)) {
      return;
    }
    const targetArgs =
      baskets.find((basket) => basket.basketId === basketId)
        ?.nativeShoppingList ||
      activeReview.current?.review.shoppingListId === Number(basketId)
        ? { shopping_list_id: Number(basketId) }
        : { basket_id: basketId };
    changeBasket(basketId);
    const heartbeat = heartbeatByBasket.current.get(basketId) ?? {
      attemptedAt: 0,
      renewedAt: 0,
      intentAt: 0,
    };
    heartbeat.intentAt = Date.now();
    heartbeatByBasket.current.set(basketId, heartbeat);
    setScreen({ kind: "picker", baskets, selectedBasketId: basketId });
    await call(
      "update_product_review",
      { action: { kind: "select" }, ...targetArgs },
      true,
      true,
    );
  };
  const deleteBasket = async (basketId: string) => {
    if (
      !busy &&
      isBasketId(basketId) &&
      !baskets.find((basket) => basket.basketId === basketId)
        ?.nativeShoppingList
    ) {
      await call(
        "update_product_review",
        { action: { kind: "delete" }, basket_id: basketId },
        true,
      );
    }
  };
  const refreshCurrentDraftList = async () => {
    if (!connectedApp || !isConnected) {
      setMessage(
        "Reconnect to read this conversation's current shopping list.",
      );
      return;
    }
    if (selectedBasketIdRef.current) {
      const targetArgs = activeReview.current?.review
        ? reviewTargetArgs(activeReview.current.review)
        : { basket_id: selectedBasketIdRef.current };
      await call(
        "update_product_review",
        {
          action: { kind: "show" },
          ...targetArgs,
        },
        true,
      );
    } else {
      await openPicker();
    }
  };
  const endDraft = async () => {
    setConfirmEnd(false);
    if (await flushQuantities()) {
      await update({ kind: "end" });
    }
  };
  // Submit the exact saved list in one action; provider checks remain server-side.
  // One user action flushes edits, binds the selected list, and fences duplicate calls.
  // fallow-ignore-next-line complexity
  const submitCurrentBasket = async () => {
    const expected = selectionContext();
    const ok = await flushQuantities(expected);
    if (ok) {
      await waitForCallIdle();
    }
    const review = activeReview.current?.review;
    if (
      !ok ||
      expected.epoch !== selectionEpoch.current ||
      expected.basketId !== selectedBasketIdRef.current ||
      !review ||
      callLock.current
    ) {
      setMessage("The shopping list changed. Refresh it before submitting.");
      return;
    }
    if (
      review.shoppingListId === undefined ||
      !review.shoppingListName ||
      review.saveStatus !== "saved" ||
      review.shoppingListDirty ||
      review.updateStatus !== undefined ||
      reviewTargetId(review) !== selectedBasketIdRef.current
    ) {
      setMessage(
        "Update and review the saved shopping list before submitting.",
      );
      return;
    }
    submitBlockedRef.current = true;
    setSubmitBlocked(true);
    if (!activeReview.current?.active) {
      return;
    }
    const success = await call(
      "submit_product_review",
      {
        submission_id: globalThis.crypto.randomUUID(),
        ...reviewTargetArgs(review),
        reviewed_list: {
          name: review.shoppingListName,
          items: review.items.map(({ product_id, quantity }) => ({
            product_id,
            quantity,
          })),
        },
      },
      false,
      false,
      true,
      false,
      expected,
    );
    if (!success) {
      try {
        await call(
          "update_product_review",
          { action: { kind: "show" }, ...reviewTargetArgs(review) },
          true,
        );
      } catch {
        // Keep the transfer failure visible if current state cannot be read.
      }
      setMessage(
        submissionFailure.current ??
          "Nemlig did not confirm whether the basket addition completed. Inspect the basket; do not retry.",
      );
    }
  };
  const displayedViews =
    screen.kind === "products"
      ? screen.views
      : screen.kind === "review"
        ? [
            ...screen.review.items.map(({ view }) => view),
            ...(screen.review.alternatives?.views ?? []),
          ]
        : [];
  const thumbnails = new Map<ProductView, string>();
  for (const view of displayedViews) {
    if (view.status === "complete") {
      const image = safeNemligImageUrl(view.product.image_url);
      if (image) {
        thumbnails.set(view, image);
      }
    }
  }

  return (
    <ViewerPage
      model={{
        screen,
        presentationDestination,
        reviewDisclosures,
        pendingQuantities,
        thumbnails,
        message,
        connectionMessage: !isConnected
          ? error
            ? "Could not connect to the shopping-list host."
            : "Connecting to Nemlig…"
          : undefined,
        busy,
        confirmEnd,
        continueSubmitted,
        submitBlocked,
        knownNoWrite: submissionFailure.current !== undefined,
        baskets,
        selectedBasketId,
      }}
      actions={{
        onNavigate: navigate,
        onRefresh: () => void refreshCurrentDraftList(),
        onOpenPicker: () => void openPicker(),
        onSelectBasket: (basketId) => void selectBasket(basketId),
        onDeleteBasket: (basketId) => void deleteBasket(basketId),
        onFactExpandedChange: (productId, factKey, expanded) =>
          setReviewDisclosures((previous) => {
            const next = new Map(previous);
            const facts = new Set(previous.get(productId));
            if (expanded) {
              facts.add(factKey);
            } else {
              facts.delete(factKey);
            }
            next.set(productId, facts);
            return next;
          }),
        onQuantity: setQuantity,
        onRemove: (item) =>
          afterFlush({ kind: "remove", product_ids: [item.product_id] }),
        onOpenAlternatives: (item, query) => {
          afterFlush({
            kind: "alternatives",
            product_id: item.product_id,
            query,
          });
        },
        onSearchAlternatives: (product_id, query) =>
          void update({ kind: "alternatives", product_id, query }),
        onReplace: (product_id, replacement_id) =>
          update({ kind: "replace", product_id, replacement_id }),
        onSaveDraft: saveDraft,
        onUpdateShoppingList: updateShoppingList,
        onDiscardPendingUpdate: discardPendingUpdate,
        onSubmit: () => void submitCurrentBasket(),
        onConfirmSubmit: () => void submitCurrentBasket(),
        onContinueSubmitted: () => {
          if (review?.submissionAttempted) {
            void openPicker();
          } else {
            setContinueSubmitted(true);
          }
        },
        onInspectBasket: () =>
          void sendFollowUp(
            "Inspect the actual Nemlig basket for this uncertain submission. Do not retry or add anything.",
          ),
        onSendFollowUp: (text) => void sendFollowUp(text),
        onRequestEnd: () => setConfirmEnd(true),
        onCancelEnd: () => setConfirmEnd(false),
        onConfirmEnd: () => void endDraft(),
      }}
    />
  );
}
