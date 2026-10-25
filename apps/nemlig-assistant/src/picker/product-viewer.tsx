import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  safeNemligImageUrl,
  type ProductView,
} from "../product-presentation.js";
import { viewerReviewSchema } from "../review-schema.js";
import { toggleReviewDisclosure, ViewerPage } from "./viewer-page.js";
import type {
  BasketSummary,
  CompletedReplayReceipt,
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

const startReviewProgress = (args: Record<string, unknown>) =>
  typeof args.shopping_list_id === "number"
    ? "Loading this saved list into a temporary basket draft…"
    : Array.isArray(args.items)
      ? "Preparing a temporary basket draft…"
      : "Loading your saved shopping lists…";

const directUpdateProgress = (args: Record<string, unknown>) => {
  const action = isRecord(args.action) ? args.action : {};
  const messages: Record<string, string> = {
    alternatives: "Searching for alternatives…",
    select: "Loading the selected saved list into a temporary draft…",
    list: "Loading your saved shopping lists…",
  };
  return (
    (typeof action.kind === "string" && messages[action.kind]) ||
    "Updating your temporary basket draft…"
  );
};

export function progressMessage(name: string, args: Record<string, unknown>) {
  if (
    name === "submit_product_review" ||
    name === "submit_product_review_conversation"
  ) {
    return "Adding the reviewed products to your Nemlig basket…";
  }
  if (name === "save_basket_as_shopping_list") {
    return "Saving the entire current Nemlig basket as a shopping list…";
  }
  if (name === "start_product_review") {
    return startReviewProgress(args);
  }
  if (name === "update_product_review_conversation") {
    return directUpdateProgress(args);
  }
  const action = isRecord(args.action) ? args.action : {};
  const messages: Record<string, string> = {
    list: "Loading your saved shopping lists…",
    show: "Refreshing your temporary basket draft…",
    select: "Loading the selected saved list into a temporary draft…",
    alternatives: "Searching for alternatives…",
    replace: "Updating your temporary basket draft…",
    quantity: "Updating your temporary basket draft…",
    remove: "Updating your temporary basket draft…",
    add: "Updating your temporary basket draft…",
  };
  return (
    (typeof action.kind === "string" && messages[action.kind]) ||
    "Updating your temporary basket draft…"
  );
}

function isUncertainFailure(
  recovery: boolean,
  uncertainOnFailure: boolean,
  text: string,
): boolean {
  return !recovery && (uncertainOnFailure || /uncertain/i.test(text));
}

export function basketInspectionMessage(
  review?: Pick<Review, "basketMode" | "draftId">,
): string {
  const instruction =
    review?.basketMode === "direct-basket" && review.draftId
      ? `Call show_my_basket with draft_id: "${review.draftId}" to inspect this exact uncertain operation. Compare each product's baseline plus approved delta with its expected and current quantities. Existing products in the basket do not by themselves prove that this addition succeeded.`
      : "Call show_my_basket to inspect the actual Nemlig basket. No exact draft handle is available, so this generic read cannot verify whether this addition succeeded.";
  return `${instruction} Do not retry or add anything.`;
}

export function submitFailureCopy(detail: string): string | undefined {
  // Only fixed client copy and finite diagnostic fields may cross this boundary.
  const bulkDiagnostic = detail.match(
    /^(?:Error code: [A-Z_]+; Error calling MCP tool: )?(Bulk basket (?:write outcome is unconfirmed|write was sent, but readback is unconfirmed|readback did not confirm the exact additive quantities); inspect the basket and do not retry\.(?: Diagnostic: (?:dispatch|readback)\/(?:http|network|timeout|cancelled|invalid_response|readback_mismatch)(?:; HTTP [1-5]\d{2})?\.)?)$/u,
  );
  if (bulkDiagnostic) {
    return bulkDiagnostic[1];
  }
  if (
    /Basket changed before an addition; no provider write was sent/iu.test(
      detail,
    )
  ) {
    return "The Nemlig basket changed before the addition. No product was sent.";
  }
  if (isKnownNoWriteFailure(detail)) {
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

export function isKnownNoWriteFailure(detail: string): boolean {
  return /no (?:basket|provider) write was sent|no transfer was sent/iu.test(
    detail,
  );
}

function directDraftFailureMessage(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : "";
  // Describe recognized failures without displaying arbitrary host/provider text.
  let reason = "The service could not confirm this temporary draft request.";
  if (/draft.*(?:expired|unavailable|changed)|review expired/iu.test(detail)) {
    reason = "The service could not find this exact temporary draft.";
  } else if (
    /does not match|review_context_id|draft_id|invalid.*(?:argument|parameter)/iu.test(
      detail,
    )
  ) {
    reason = "The temporary draft response did not match this card.";
  } else if (/operation is in progress|review is opening/iu.test(detail)) {
    reason = "Another operation is still running for this temporary draft.";
  } else if (
    /unauthorized|forbidden|permission|authentication|access denied/iu.test(
      detail,
    )
  ) {
    reason = "Access to this temporary draft could not be confirmed.";
  } else if (
    /connect|network|fetch|timeout|timed out|transport/iu.test(detail)
  ) {
    reason = "The connection to this temporary draft failed.";
  } else if (/cancelled|canceled/iu.test(detail)) {
    reason = "The temporary draft request was cancelled.";
  }
  return `${reason} Your last confirmed products remain visible. Refresh this exact draft before continuing. No automatic retry was made.`;
}

function isReview(value: unknown): value is Review {
  if (!isRecord(value) || value.basketId !== undefined) {
    return false;
  }
  const parsed = viewerReviewSchema.safeParse(value);
  if (!parsed.success) {
    return false;
  }
  const review = parsed.data;
  const views = [
    ...review.items.map((item) => item.view),
    ...(review.conflictItems ?? []).map((item) => item.view),
    ...(review.alternatives?.views ?? []),
  ];
  return hasValidReviewTarget(review) && views.every(isProductView);
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
function reviewTargetId(review: Review): string | undefined {
  if (review.basketMode === "direct-basket") {
    return review.draftId;
  }
  return review.shoppingListId === undefined
    ? undefined
    : String(review.shoppingListId);
}
function hasValidReviewTarget(
  review: Pick<Review, "basketMode" | "draftId" | "shoppingListId">,
): boolean {
  return (
    review.basketMode !== "direct-basket" ||
    (review.draftId !== undefined && review.shoppingListId === undefined)
  );
}
/** Undefined preserves a pending local Submit until its correlated result arrives. */
export function reviewSubmissionBlockTransition(
  previous: Review | undefined,
  next: Review,
  sameReview: boolean,
): boolean | undefined {
  if (next.submissionAttempted) {
    return true;
  }
  if (
    next.submission?.status === "submitted" ||
    next.submission?.status === "uncertain" ||
    next.submission?.status === "partial"
  ) {
    return next.submission.status === "uncertain";
  }
  return !sameReview ||
    next.submission?.submission_id !== previous?.submission?.submission_id
    ? false
    : undefined;
}
/** Pure review-state decision; host identity and cancellation checks stay in the adapter. */
export function reconcileReviewState({
  previousVisible,
  previousConfirmed,
  next,
  current,
  acknowledgePartialList,
}: {
  previousVisible?: Review;
  previousConfirmed?: Review;
  next: Review;
  current: boolean;
  acknowledgePartialList: boolean;
}) {
  const previous = previousVisible ?? previousConfirmed;
  const sameReview = Boolean(
    previous && reviewTargetId(previous) === reviewTargetId(next),
  );
  const review =
    current &&
    !acknowledgePartialList &&
    sameReview &&
    previous?.saveStatus === "partial" &&
    next.saveStatus === "saved" &&
    previous.shoppingListId === next.shoppingListId
      ? {
          ...next,
          saveStatus: "partial" as const,
          saveProgress: previous.saveProgress,
          actionNotice:
            previous.actionNotice ??
            "Only part of the selected products was confirmed in this exact list. Review the current rows before continuing.",
        }
      : next;
  return {
    state: {
      review,
      active: !(
        review.shoppingListId === undefined &&
        (review.saveStatus === "partial" || review.saveStatus === "uncertain")
      ),
    },
    sameReview,
    submitBlocked: reviewSubmissionBlockTransition(
      previousVisible,
      next,
      sameReview,
    ),
    preserveContinuation:
      sameReview &&
      previousVisible?.submission?.status === "submitted" &&
      next.submission?.status === "submitted" &&
      previousVisible.submission.submission_id ===
        next.submission.submission_id,
  };
}
function reviewTargetArgs(review: Review): Record<string, unknown> {
  if (review.basketMode === "direct-basket" && review.draftId) {
    return {
      draft_id: review.draftId,
      ...(review.reviewContextId
        ? { review_context_id: review.reviewContextId }
        : {}),
    };
  }
  if (review.shoppingListId !== undefined) {
    return {
      shopping_list_id: review.shoppingListId,
      ...(review.reviewContextId
        ? { review_context_id: review.reviewContextId }
        : {}),
    };
  }
  return {};
}
type DirectReplayTarget = {
  draftId: string;
  reviewContextId: string;
};
function directReplayTarget(
  requestArgs: Record<string, unknown>,
): DirectReplayTarget | undefined {
  return typeof requestArgs.draft_id === "string" &&
    typeof requestArgs.review_context_id === "string"
    ? {
        draftId: requestArgs.draft_id,
        reviewContextId: requestArgs.review_context_id,
      }
    : undefined;
}
function matchesDirectReplayTarget(
  review: Review | undefined,
  target: DirectReplayTarget,
): boolean {
  return (
    review?.basketMode === "direct-basket" &&
    review.draftId === target.draftId &&
    review.reviewContextId === target.reviewContextId
  );
}
function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
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
  return envelope.baskets === undefined ? [] : undefined;
}
function hasUnselectedReview(value: unknown) {
  return (
    isRecord(value) &&
    isReview(value) &&
    value.basketMode !== "direct-basket" &&
    !isPositiveSafeInteger(value.shoppingListId) &&
    value.items.length === 0 &&
    value.actionNotice === undefined &&
    value.saveStatus === undefined
  );
}
function requiresBasketPicker(envelope: Record<string, unknown>) {
  return (
    envelope.selectionRequired === true || hasUnselectedReview(envelope.review)
  );
}
function readSelectedBasketId(envelope: Record<string, unknown>) {
  if (isPositiveSafeInteger(envelope.selectedShoppingListId)) {
    return String(envelope.selectedShoppingListId);
  }
  return isBasketId(envelope.selectedBasketId)
    ? envelope.selectedBasketId
    : undefined;
}
function readProductViews(envelope: Record<string, unknown>) {
  const candidate = [envelope.views, envelope.products, envelope.result].find(
    Array.isArray,
  );
  return candidate?.every(isProductView) ? candidate : undefined;
}
function readCompletedReplayReceipt(
  value: unknown,
): CompletedReplayReceipt | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    value.status !== "completed" ||
    value.operation !== "additions" ||
    value.replayed !== true ||
    !isRecord(value.basket)
  ) {
    return undefined;
  }
  return {
    status: "completed",
    operation: "additions",
    replayed: true,
    basket: value.basket,
  };
}
export function readPayload(value: unknown): ViewerScreen | undefined {
  if (Array.isArray(value) && value.every(isProductView)) {
    return { kind: "products", payload: { views: value }, views: value };
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const envelope = isRecord(value.structuredContent)
    ? value.structuredContent
    : value;
  const replayed = readCompletedReplayReceipt(envelope.result);
  if (replayed) {
    return { kind: "replayed", result: replayed };
  }
  const baskets = readBasketSummaries(envelope);
  if (!baskets) {
    return undefined;
  }
  const selectedBasketId = readSelectedBasketId(envelope);
  if (envelope.unavailable === true) {
    return { kind: "unavailable" };
  }
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
  if (envelope.ended === true) {
    return {
      kind: "empty",
      message: "The selection ended.",
    };
  }
  const candidate = readProductViews(envelope);
  if (candidate) {
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
    return initial?.kind === "review"
      ? { ...initial, active: false }
      : initial?.kind === "replayed"
        ? { kind: "loading" }
        : (initial ?? { kind: "loading" });
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
  const autoRefreshListId = useRef<string | undefined>(undefined);
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
  const activeDraftUpdate = useRef(false);
  const cancelledCallPending = useRef(false);
  const ignorePassivePayloads = useRef(
    screen.kind === "review" &&
      (screen.review.submissionAttempted === true ||
        screen.review.submission?.status === "submitted" ||
        screen.review.submission?.status === "uncertain" ||
        screen.review.submission?.status === "partial"),
  );
  const cancellationEpoch = useRef(0);
  const [reviewDisclosures, setReviewDisclosures] = useState<
    ReadonlyMap<number, ReadonlySet<string>>
  >(() => new Map());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [continueSubmitted, setContinueSubmitted] = useState(false);
  const [submitBlocked, setSubmitBlocked] = useState(
    screen.kind === "review" &&
      (screen.review.submissionAttempted === true ||
        screen.review.submission?.status === "uncertain"),
  );
  const [submitErrorOpen, setSubmitErrorOpen] = useState(false);
  const [recoveryOperation, setRecoveryOperation] = useState<
    "submit" | "update" | "list" | undefined
  >();
  const submissionFailure = useRef<string | undefined>(undefined);
  const submissionNoWrite = useRef(false);
  const [pendingQuantities, setPendingQuantities] = useState<
    Map<number, number>
  >(() => new Map());

  const pendingQuantitiesRef = useRef(new Map<number, number>());
  const quantityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const stopQuantityTimer = useCallback(() => {
    if (quantityTimer.current) {
      clearTimeout(quantityTimer.current);
    }
    quantityTimer.current = undefined;
  }, []);
  const showRecovery = (operation: "update" | "list", message: string) => {
    stopQuantityTimer();
    ignorePassivePayloads.current = true;
    setMessage(message);
    setRecoveryOperation(operation);
    setSubmitErrorOpen(true);
  };
  const recoverInterruptedDraft = (
    message: string,
    includeDirect = activeDraftUpdate.current,
  ) => {
    const current = activeReview.current;
    if (
      current?.review.shoppingListId !== undefined ||
      (includeDirect && current?.review.basketMode === "direct-basket")
    ) {
      const direct = current.review.basketMode === "direct-basket";
      if (direct) {
        clearPendingQuantities();
      }
      activeReview.current = { ...current, active: false };
      setScreen({ kind: "review", ...activeReview.current });
      showRecovery(
        "update",
        direct ? directDraftFailureMessage(new Error(message)) : message,
      );
      return true;
    }
    return false;
  };
  const quantityFlush = useRef<Promise<boolean> | undefined>(undefined);
  const callIdleWaiters = useRef<Array<() => void>>([]);
  const resetBasketUi = (preservePresentationDestination = false) => {
    stopQuantityTimer();
    pendingQuantitiesRef.current.clear();
    setPendingQuantities(new Map());
    quantityFlush.current = undefined;
    activeReview.current = undefined;
    lastConfirmedReview.current = undefined;
    if (!preservePresentationDestination) {
      setPresentationDestination(undefined);
    }
    setReviewDisclosures(new Map());
    setContinueSubmitted(false);
    setSubmitBlocked(false);
    setMessage("");
    ignorePassivePayloads.current = false;
    submissionFailure.current = undefined;
    submissionNoWrite.current = false;
    setSubmitErrorOpen(false);
    setRecoveryOperation(undefined);
  };
  const changeBasket = (
    basketId: string | undefined,
    preservePresentationDestination = false,
  ) => {
    if (selectedBasketIdRef.current === basketId) {
      return;
    }
    activeToolController.current?.abort();
    selectionEpoch.current++;
    selectedBasketIdRef.current = basketId;
    setSelectedBasketId(basketId);
    resetBasketUi(preservePresentationDestination);
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
    stopQuantityTimer();
    clearPendingQuantities();
    const current = activeReview.current;
    if (current) {
      const inactive = { ...current, active: false };
      activeReview.current = inactive;
      setScreen({ kind: "review", ...inactive });
    }
  }, [stopQuantityTimer]);
  const applyPayload = useCallback(
    (
      payload: unknown,
      current = false,
      adoptPresentationDestination = false,
      acknowledgePartialList = false,
      replayTarget?: DirectReplayTarget,
    ) => {
      if (!current && callLock.current) {
        return true;
      }
      const next = readPayload(payload);
      if (!current && ignorePassivePayloads.current) {
        return true;
      }
      const toolError = isRecord(payload) && payload.isError === true;
      if (toolError || !next) {
        if (activeReview.current?.review.shoppingListId !== undefined) {
          return !current;
        }
        deactivateReview();
        setScreen({
          kind: "error",
          message: toolError
            ? "Could not load the shopping list. Reconnect Nemlig or try again in conversation."
            : "Nemlig returned a response this view could not read. Continue in conversation to inspect the current state.",
        });
        return false;
      }
      if (next.kind === "replayed") {
        if (
          !current ||
          !replayTarget ||
          selectedBasketIdRef.current !== replayTarget.draftId ||
          !matchesDirectReplayTarget(activeReview.current?.review, replayTarget)
        ) {
          return !current;
        }
        stopQuantityTimer();
        clearPendingQuantities();
        activeReview.current = undefined;
        lastConfirmedReview.current = undefined;
        ignorePassivePayloads.current = true;
        setSubmitBlocked(true);
        setReviewDisclosures(new Map());
        setPresentationDestination(undefined);
        setMessage("");
        setScreen(next);
        return true;
      }
      const previous = activeReview.current;
      if (!current && next.kind === "review" && previous?.active === false) {
        return true;
      }
      if (
        !current &&
        next.kind === "picker" &&
        activeReview.current?.active &&
        isBasketId(selectedBasketIdRef.current)
      ) {
        return true;
      }
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
        const transition = reconcileReviewState({
          previousVisible: previous?.review,
          previousConfirmed: lastConfirmedReview.current,
          next: next.review,
          current,
          acknowledgePartialList,
        });
        if (!transition.sameReview) {
          setReviewDisclosures(new Map());
        }
        const { state } = transition;
        if (current && nextTargetId) {
          autoRefreshListId.current = nextTargetId;
        }
        activeReview.current = state;
        lastConfirmedReview.current = state.review;
        if (transition.submitBlocked !== undefined) {
          setSubmitBlocked(transition.submitBlocked);
        }
        setContinueSubmitted(
          (continued) => continued && transition.preserveContinuation,
        );
        if (next.review.submissionAttempted) {
          ignorePassivePayloads.current = true;
        }
        setScreen({ kind: "review", ...state });
        setPresentationDestination((visible) => {
          if (!transition.sameReview || adoptPresentationDestination) {
            return next.review.destination;
          }
          if (visible === "alternatives" && !next.review.alternatives) {
            return next.review.destination;
          }
          return visible ?? next.review.destination;
        });
        setMessage("");
        const { review } = state;
        if (
          current &&
          ((review.shoppingListId !== undefined &&
            (review.updateStatus === "partial" ||
              review.updateStatus === "uncertain")) ||
            (review.shoppingListId === undefined &&
              (review.saveStatus === "partial" ||
                review.saveStatus === "uncertain")) ||
            (review.saveStatus === "partial" &&
              review.shoppingListId !== undefined))
        ) {
          showRecovery(
            review.shoppingListId === undefined ? "list" : "update",
            review.actionNotice ??
              "Nemlig did not confirm every shopping-list change. Refresh this exact list before continuing.",
          );
        }
      } else if (next.kind === "unavailable") {
        deactivateReview();
        const cachedReview = previous?.review ?? lastConfirmedReview.current;
        if (cachedReview) {
          const inactive = { review: cachedReview, active: false };
          activeReview.current = inactive;
          setPresentationDestination(cachedReview.destination);
          setScreen({ kind: "review", ...inactive });
          showRecovery(
            cachedReview.basketMode === "direct-basket" ||
              cachedReview.shoppingListId !== undefined
              ? "update"
              : "list",
            cachedReview.basketMode === "direct-basket"
              ? directDraftFailureMessage(new Error("Draft unavailable"))
              : cachedReview.shoppingListId === undefined
                ? "The selected shopping-list creation could not be confirmed. Review its status before continuing."
                : "Could not refresh this exact Nemlig shopping list. Its last confirmed rows remain visible; retry the same list or choose another explicitly.",
          );
        } else {
          activeReview.current = undefined;
          setPresentationDestination(undefined);
          setScreen({ kind: "unavailable" });
        }
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
        if (
          !recoverInterruptedDraft(
            "The action was cancelled. Your current products and quantities remain visible; review them before continuing.",
          )
        ) {
          ignorePassivePayloads.current = true;
          deactivateReview();
          setScreen({ kind: "cancelled" });
          setMessage(
            "Request cancelled. Continue in conversation when you are ready.",
          );
        }
      };
      host.onerror = () => {
        if (cancelledCallPending.current) {
          return;
        }
        if (
          callLock.current &&
          (activeReview.current?.review.shoppingListId !== undefined ||
            activeDraftUpdate.current)
        ) {
          cancellationEpoch.current++;
          activeToolController.current?.abort();
        }
        if (
          !recoverInterruptedDraft(
            "The shopping-list connection failed. Your current products and quantities remain visible; review them before continuing.",
          )
        ) {
          ignorePassivePayloads.current = true;
          deactivateReview();
          setScreen({
            kind: "error",
            message:
              "The shopping-list connection failed. Refresh the list or continue in conversation.",
          });
        }
      };
    },
  });
  useHostStyles(connectedApp, connectedApp?.getHostContext());
  useEffect(
    () => () => {
      activeToolController.current?.abort();
      stopQuantityTimer();
      connectedApp?.close();
    },
    [connectedApp, stopQuantityTimer],
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
      setSubmitBlocked(false);
      setMessage(submissionFailure.current);
      return;
    }
    if (isKnownNoWriteFailure(text)) {
      setSubmitBlocked(false);
      setMessage(submissionFailure.current ?? text);
      return;
    }
    if (isUncertainFailure(recovery, uncertainOnFailure, text)) {
      setSubmitBlocked(true);
      setMessage(
        submissionFailure.current ??
          "Nemlig did not confirm whether the complete addition reached the basket.",
      );
      return;
    }
    deactivateReview();
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
    preserveReviewOnFailure: boolean | string = false,
    acknowledgePartialList = false,
  ): Promise<boolean> => {
    if (!connectedApp || !isConnected) {
      if (!background) {
        const detail = error
          ? "The shopping list could not connect. Your current products and quantities remain visible; review them before continuing."
          : "Connecting to the current shopping list…";
        if (
          (activeReview.current?.review.shoppingListId !== undefined ||
            (name === "update_product_review" &&
              activeReview.current?.review.basketMode === "direct-basket")) &&
          error
        ) {
          recoverInterruptedDraft(detail, name === "update_product_review");
        } else {
          setMessage(detail);
        }
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
      if (
        requestArgs.basket_id !== undefined ||
        kind === "delete" ||
        kind === "heartbeat"
      ) {
        setMessage(
          "This older selection is unsupported. Choose a native shopping list explicitly.",
        );
        return false;
      }
      if (kind !== "list") {
        const explicitTarget = kind === "select" || kind === "show";
        const targetReview = activeReview.current?.review;
        const targetArgs = explicitTarget
          ? requestArgs.shopping_list_id !== undefined ||
            requestArgs.draft_id !== undefined
            ? {
                ...(requestArgs.shopping_list_id !== undefined
                  ? { shopping_list_id: requestArgs.shopping_list_id }
                  : { draft_id: requestArgs.draft_id }),
                ...(requestArgs.review_context_id !== undefined
                  ? { review_context_id: requestArgs.review_context_id }
                  : {}),
              }
            : {}
          : targetReview
            ? reviewTargetArgs(targetReview)
            : {};
        const targetId =
          targetArgs.draft_id !== undefined
            ? String(targetArgs.draft_id)
            : targetArgs.shopping_list_id === undefined
              ? undefined
              : String(targetArgs.shopping_list_id);
        if (!isBasketId(targetId)) {
          setMessage("Choose a shopping list before continuing.");
          setScreen({ kind: "picker", baskets, selectedBasketId });
          return false;
        }
        delete requestArgs.shopping_list_id;
        delete requestArgs.draft_id;
        delete requestArgs.review_context_id;
        Object.assign(requestArgs, targetArgs);
      }
    } else if (name === "submit_product_review") {
      const targetReview = activeReview.current?.review;
      if (!targetReview) {
        setMessage(
          "Choose a Nemlig shopping list before adding it to your basket.",
        );
        return false;
      }
      const targetArgs = reviewTargetArgs(targetReview);
      const targetId = targetArgs.draft_id ?? targetArgs.shopping_list_id;
      if (!isBasketId(String(targetId))) {
        setMessage("Choose a shopping list before continuing.");
        setScreen({ kind: "picker", baskets, selectedBasketId });
        return false;
      }
      if (targetReview.basketMode === "direct-basket") {
        requestArgs.reviewed_list = {
          name: "Temporary basket draft",
          items: targetReview.items.map(({ product_id, quantity }) => ({
            product_id,
            quantity,
          })),
        };
      }
      Object.assign(requestArgs, targetArgs);
    }
    callLock.current = true;
    cancelledCallPending.current = false;
    if (name === "submit_product_review") {
      submissionFailure.current = undefined;
      submissionNoWrite.current = false;
    }
    const requestEpoch = cancellationEpoch.current;
    const requestSelectionEpoch =
      expectedSelection?.epoch ?? selectionEpoch.current;
    const requestController = new AbortController();
    activeToolController.current = requestController;
    activeDraftUpdate.current =
      name === "update_product_review" &&
      activeReview.current?.review.basketMode === "direct-basket";
    if (!background) {
      setBusy(true);
      setMessage(progressMessage(name, requestArgs));
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
          submissionNoWrite.current = isKnownNoWriteFailure(detail);
        }
        throw new Error(detail);
      }
      const exactDraft = directReplayTarget(requestArgs);
      const response = readPayload(result);
      if (
        name === "update_product_review" &&
        exactDraft &&
        isRecord(requestArgs.action) &&
        requestArgs.action.kind !== "abandon_draft" &&
        response?.kind !== "unavailable" &&
        (response?.kind !== "review" ||
          !matchesDirectReplayTarget(response.review, exactDraft))
      ) {
        throw new Error(
          "The temporary draft response does not match this card.",
        );
      }
      if (
        !background &&
        !applyPayload(
          result,
          true,
          adoptPresentationDestination,
          acknowledgePartialList,
          name === "submit_product_review"
            ? directReplayTarget(requestArgs)
            : undefined,
        )
      ) {
        throw new Error("Could not confirm the updated shopping list.");
      }
      if (
        !background &&
        (name === "submit_product_review" || name === "update_product_review")
      ) {
        ignorePassivePayloads.current = true;
      }
      if (
        name === "update_product_review" &&
        exactDraft &&
        response?.kind === "unavailable"
      ) {
        return false;
      }
      const needsNativeRecovery =
        response?.kind === "review" &&
        (response.review.updateStatus === "partial" ||
          response.review.updateStatus === "uncertain" ||
          response.review.saveStatus === "partial" ||
          response.review.saveStatus === "uncertain");
      if (!background && !needsNativeRecovery) {
        setMessage("");
      }
      return true;
    } catch (cause) {
      if (
        name === "update_product_review" &&
        !background &&
        activeReview.current?.review.basketMode === "direct-basket" &&
        requestEpoch === cancellationEpoch.current &&
        requestSelectionEpoch === selectionEpoch.current
      ) {
        deactivateReview();
        showRecovery("update", directDraftFailureMessage(cause));
        return false;
      }
      if (name === "submit_product_review") {
        const detail = cause instanceof Error ? cause.message : "Update failed";
        submissionFailure.current = submitFailureCopy(detail);
        if (isKnownNoWriteFailure(detail)) {
          submissionNoWrite.current = true;
        }
      }
      if (
        name === "update_product_review" &&
        activeReview.current?.active &&
        activeReview.current.review.shoppingListId !== undefined &&
        requestEpoch === cancellationEpoch.current &&
        requestSelectionEpoch === selectionEpoch.current
      ) {
        const detail = cause instanceof Error ? cause.message : "Update failed";
        activeReview.current = { ...activeReview.current, active: false };
        setScreen({ kind: "review", ...activeReview.current });
        showRecovery(
          "update",
          `${detail} Refresh this exact shopping list before continuing. No automatic retry was made.`,
        );
        return false;
      }
      if (
        !background &&
        requestEpoch === cancellationEpoch.current &&
        requestSelectionEpoch === selectionEpoch.current
      ) {
        if (preserveReviewOnFailure) {
          ignorePassivePayloads.current = true;
          if (typeof preserveReviewOnFailure === "string") {
            const failureMessage =
              cause instanceof Error ? cause.message : "The request failed.";
            const knownNotSent =
              /no provider write was sent|account changed before the save request/iu.test(
                failureMessage,
              );
            activeReview.current = {
              ...activeReview.current!,
              review: {
                ...activeReview.current!.review,
                actionNotice: knownNotSent
                  ? `Basket save was not sent. ${failureMessage}`
                  : preserveReviewOnFailure,
              },
            };
            setScreen({ kind: "review", ...activeReview.current });
            return false;
          }
          activeReview.current = { ...activeReview.current!, active: false };
          setScreen({ kind: "review", ...activeReview.current });
          showRecovery(
            "update",
            "Could not confirm this exact shopping-list update. Refresh the current list before continuing.",
          );
        } else {
          handleCallFailure(cause, recovery, uncertainOnFailure);
        }
      }
      return false;
    } finally {
      if (activeToolController.current === requestController) {
        activeToolController.current = undefined;
        activeDraftUpdate.current = false;
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
    stopQuantityTimer();
    quantityTimer.current = setTimeout(() => {
      quantityTimer.current = undefined;
      void flushQuantities();
    }, 2_500);
  };
  const flushQuantities = async (expected = selectionContext()) => {
    stopQuantityTimer();
    if (quantityFlush.current) {
      return quantityFlush.current;
    }
    if (!pendingQuantitiesRef.current.size) {
      return true;
    }
    const operation = (async () => {
      while (pendingQuantitiesRef.current.size) {
        await waitForCallIdle();
        if (!isCurrentSelection(expected)) {
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
        if (!ok || !isCurrentSelection(expected)) {
          if (isCurrentSelection(expected)) {
            removePendingQuantity(product_id, quantity);
          }
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
      if (ok && isCurrentSelection(expected)) {
        await update(action);
      }
    });
  };
  const discardPendingUpdate = () => {
    stopQuantityTimer();
    const expected = selectionContext();
    void (async () => {
      if (quantityFlush.current) {
        await quantityFlush.current;
      }
      await waitForCallIdle();
      if (
        expected.epoch !== selectionEpoch.current ||
        expected.basketId !== selectedBasketIdRef.current
      ) {
        return;
      }
      clearPendingQuantities();
      await update({ kind: "discard_pending_update" });
    })();
  };
  const useConfirmedProducts = () => {
    const review = activeReview.current?.review ?? lastConfirmedReview.current;
    if (busy || review?.shoppingListId === undefined) {
      return;
    }
    setSubmitErrorOpen(false);
    void call(
      "update_product_review",
      {
        action: { kind: "show" },
        shopping_list_id: review.shoppingListId,
      },
      true,
      false,
      false,
      false,
      selectionContext(),
      true,
      true,
    );
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
        "Continue in conversation to review or edit your temporary basket draft.",
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
        "Continue in conversation to review or edit your temporary basket draft.",
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
  const abandonDirectDraft = async () => {
    const review = activeReview.current?.review;
    if (
      busy ||
      review?.basketMode !== "direct-basket" ||
      !review.draftId ||
      !review.reviewContextId
    ) {
      return;
    }
    const expected = selectionContext();
    await call(
      "update_product_review",
      {
        action: { kind: "abandon_draft" },
        ...reviewTargetArgs(review),
      },
      false,
      false,
      false,
      false,
      expected,
    );
  };
  const saveCurrentBasketAsShoppingList = async () => {
    const review = activeReview.current?.review;
    if (
      busy ||
      review?.basketMode !== "direct-basket" ||
      review.submission?.status !== "submitted" ||
      !review.draftId ||
      !review.reviewContextId
    ) {
      return;
    }
    await call(
      "save_basket_as_shopping_list",
      {
        ...reviewTargetArgs(review),
        save_id: globalThis.crypto.randomUUID(),
      },
      false,
      false,
      false,
      false,
      selectionContext(),
      "Basket save may have completed. Inspect saved shopping lists; this action cannot be retried.",
    );
  };
  const selectBasket = async (basketId: string) => {
    if (busy || !isBasketId(basketId)) {
      return;
    }
    const selected = baskets.find((basket) => basket.basketId === basketId);
    const nativeShoppingList = selected
      ? selected.nativeShoppingList === true
      : activeReview.current?.review.shoppingListId === Number(basketId);
    if (!nativeShoppingList) {
      return;
    }
    const targetArgs = { shopping_list_id: Number(basketId) };
    autoRefreshListId.current = basketId;
    changeBasket(basketId);
    setScreen({ kind: "picker", baskets, selectedBasketId: basketId });
    await call(
      "update_product_review",
      {
        action: {
          kind: "select",
        },
        ...targetArgs,
      },
      true,
      true,
    );
  };
  const refreshCurrentDraftList = async () => {
    if (!connectedApp || !isConnected) {
      setMessage("Reconnect to refresh the products shown in this card.");
      return;
    }
    const knownReview =
      activeReview.current?.review ?? lastConfirmedReview.current;
    if (knownReview) {
      stopQuantityTimer();
      if (quantityFlush.current) {
        await quantityFlush.current;
      }
      await waitForCallIdle();
      clearPendingQuantities();
      if (knownReview.basketMode === "direct-basket") {
        await call(
          "update_product_review",
          { action: { kind: "show" }, ...reviewTargetArgs(knownReview) },
          true,
          false,
          false,
          false,
          selectionContext(),
          true,
        );
        return;
      }
      const listId = knownReview.shoppingListId;
      if (listId === undefined) {
        await call(
          "update_product_review",
          { action: { kind: "list" } },
          true,
          false,
          false,
          false,
          selectionContext(),
          true,
        );
        return;
      }
      await call(
        "update_product_review",
        {
          action: { kind: "show" },
          shopping_list_id: listId,
        },
        true,
        false,
        false,
        false,
        selectionContext(),
        true,
      );
    } else {
      setMessage(
        "This older selection is no longer supported. Select a native shopping list explicitly.",
      );
    }
  };
  useEffect(() => {
    if (
      screen.kind !== "review" ||
      screen.review.shoppingListId !== undefined ||
      (screen.review.saveStatus !== "partial" &&
        screen.review.saveStatus !== "uncertain")
    ) {
      return;
    }
    const inactive = { review: screen.review, active: false };
    activeReview.current = inactive;
    lastConfirmedReview.current = screen.review;
    showRecovery(
      "list",
      screen.review.actionNotice ??
        "Nemlig did not confirm which shopping-list rows were saved. Keep these selected products for review; refresh or choose a list explicitly before continuing.",
    );
  }, [screen]);
  useEffect(() => {
    if (!connectedApp || !isConnected || screen.kind !== "review") {
      return;
    }
    const listId = screen.review.shoppingListId;
    const directDraftId =
      screen.review.basketMode === "direct-basket"
        ? screen.review.draftId
        : undefined;
    if (listId === undefined && directDraftId === undefined) {
      return;
    }
    const key = directDraftId ?? String(listId);
    if (autoRefreshListId.current === key) {
      return;
    }
    autoRefreshListId.current = key;
    void call(
      "update_product_review",
      {
        action: { kind: "show" },
        ...reviewTargetArgs(screen.review),
      },
      true,
      false,
      false,
      false,
      { basketId: key, epoch: selectionEpoch.current },
      true,
    );
  }, [connectedApp, isConnected, screen]);
  // Submit the exact reviewed selection once; provider checks remain server-side.
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
    const direct = review.basketMode === "direct-basket";
    if (
      (direct
        ? !review.draftId || !review.reviewContextId
        : review.shoppingListId === undefined ||
          !review.shoppingListName ||
          review.saveStatus !== "saved" ||
          review.shoppingListDirty ||
          review.updateStatus !== undefined) ||
      reviewTargetId(review) !== selectedBasketIdRef.current
    ) {
      setMessage(
        direct
          ? "Refresh and review the exact temporary draft before adding it to the basket."
          : "Refresh and review the current Nemlig shopping list before adding it to the basket.",
      );
      return;
    }
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
          name: review.shoppingListName ?? "Temporary basket draft",
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
      setRecoveryOperation("submit");
      setSubmitErrorOpen(true);
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
        continueSubmitted,
        submitBlocked,
        knownNoWrite: submissionNoWrite.current,
        submitErrorOpen,
        recoveryOperation,
        baskets,
        selectedBasketId,
      }}
      actions={{
        onNavigate: navigate,
        onRefresh: () => void refreshCurrentDraftList(),
        onOpenPicker: () => void openPicker(),
        onAbandonDraft: () => void abandonDirectDraft(),
        onSaveCurrentBasketAsShoppingList: () =>
          void saveCurrentBasketAsShoppingList(),
        onSelectBasket: (basketId) => void selectBasket(basketId),
        onFactExpandedChange: (productId, factKey, expanded) =>
          setReviewDisclosures((previous) =>
            toggleReviewDisclosure(previous, productId, factKey, expanded),
          ),
        onQuantity: setQuantity,
        onRemove: (item) =>
          afterFlush({ kind: "remove", product_ids: [item.product_id] }),
        onOpenAlternatives: (item, query) => {
          afterFlush({
            kind: "alternatives",
            product_id: item.product_id,
            query,
            suggested: true,
          });
        },
        onSearchAlternatives: (product_id, query) =>
          void update({ kind: "alternatives", product_id, query }),
        onReplace: (product_id, replacement_id) =>
          update({ kind: "replace", product_id, replacement_id }),
        onDiscardPendingUpdate: discardPendingUpdate,
        onUseConfirmedProducts: useConfirmedProducts,
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
            basketInspectionMessage(
              activeReview.current?.review ?? lastConfirmedReview.current,
            ),
          ),
        onDismissSubmitError: () => setSubmitErrorOpen(false),
        onSendFollowUp: (text) => void sendFollowUp(text),
      }}
    />
  );
}
