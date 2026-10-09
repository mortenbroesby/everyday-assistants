import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  safeNemligImageUrl,
  type ProductView,
} from "../product-presentation.js";
import { isUsable } from "./components/index.js";
import { ViewerPage } from "./viewer-page.js";
import type {
  PresentationDestination,
  Review,
  ReviewItem,
  ViewerPayload,
  ViewerScreen,
} from "./viewer-page.js";

declare global {
  interface Window {
    openai?: { toolOutput?: unknown };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isReview(value: unknown): value is Review {
  if (
    !isRecord(value) ||
    typeof value.review_id !== "string" ||
    !Number.isSafeInteger(value.revision) ||
    !Array.isArray(value.items)
  ) {
    return false;
  }
  if (!(
    value.destination === "needs-review" ||
    value.destination === "ready" ||
    value.destination === "alternatives"
  )) {
    return false;
  }
  if (
    !value.items.every(
      (item) =>
        isRecord(item) &&
        Number.isSafeInteger(item.product_id) &&
        typeof item.quantity === "number" &&
        Number.isSafeInteger(item.quantity) &&
        item.quantity > 0 &&
        (item.state === "needs-review" || item.state === "ready") &&
        isProductView(item.view),
    )
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
      !["prepared", "submitted", "uncertain"].includes(
        String(value.submission.status),
      ) ||
      typeof value.submission.submission_id !== "string" ||
      !isRecord(value.submission.review)
    ) {
      return false;
    }
    const submissionReview = value.submission.review;
    const validOptionalTotal = (amount: unknown) =>
      amount === undefined ||
      (typeof amount === "number" && Number.isFinite(amount) && amount >= 0);
    if (
      !validOptionalTotal(submissionReview.expected_products_price) ||
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
function isProductView(value: unknown): value is ProductView {
  if (
    !isRecord(value) ||
    !(
      value.context === "search" ||
      value.context === "details" ||
      value.context === "result" ||
      value.context === "basket" ||
      value.context === "review"
    )
  ) {
    return false;
  }
  if (value.status === "unavailable") {
    return (
      value.product_id === undefined || Number.isSafeInteger(value.product_id)
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
  if (isRecord(envelope.review) && isReview(envelope.review)) {
    const view_id =
      typeof envelope.view_id === "string" ? envelope.view_id : undefined;
    return {
      kind: "review",
      review: envelope.review,
      ...(view_id ? { view_id } : {}),
      active: Boolean(view_id),
    };
  }
  if (envelope.unavailable === true) {
    return { kind: "unavailable" };
  }
  if (envelope.ended === true) {
    return {
      kind: "empty",
      message:
        "Your local Draft list was discarded. Nothing changed in Nemlig.",
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
    if (initial?.kind === "review") {
      return { ...initial, active: false };
    }
    return initial ?? { kind: "loading" };
  });
  const [presentationDestination, setPresentationDestination] = useState<
    PresentationDestination | undefined
  >(() => (screen.kind === "review" ? screen.review.destination : undefined));
  const activeReview = useRef<
    { review: Review; view_id?: string; active: boolean } | undefined
  >(screen.kind === "review" ? screen : undefined);
  const lastConfirmedReview = useRef<Review | undefined>(
    screen.kind === "review" ? screen.review : undefined,
  );
  const callLock = useRef(false);
  const cancellationEpoch = useRef(0);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [reviewDisclosures, setReviewDisclosures] = useState<
    Map<number, { expanded: boolean; facts: Set<string> }>
  >(() => new Map());
  const [replacement, setReplacement] = useState<number>();
  const [message, setMessage] = useState("");
  const [activatingCurrent, setActivatingCurrent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [continueSubmitted, setContinueSubmitted] = useState(false);
  const [submitBlocked, setSubmitBlocked] = useState(false);
  const submitBlockedRef = useRef(false);
  const [pendingQuantities, setPendingQuantities] = useState<
    Map<number, number>
  >(() => new Map());

  const pendingQuantitiesRef = useRef(new Map<number, number>());
  const quantityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const quantityFlush = useRef<Promise<boolean> | undefined>(undefined);
  const callIdleWaiters = useRef<Array<() => void>>([]);
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
  const applyPayload = useCallback(
    (
      payload: unknown,
      current = false,
      adoptPresentationDestination = false,
    ) => {
      if (isRecord(payload) && payload.isError === true) {
        deactivateReview();
        setScreen({
          kind: "error",
          message:
            "Could not load the Draft list. Reconnect Nemlig or try again in conversation.",
        });
        return false;
      }
      const next = readPayload(payload);
      if (!next) {
        deactivateReview();
        setScreen({
          kind: "error",
          message:
            "Nemlig returned a response this view could not read. Continue in conversation to inspect the current state.",
        });
        return false;
      }
      const previous = activeReview.current;
      if (next.kind === "review") {
        if (
          !current &&
          previous &&
          !previous.active &&
          next.view_id &&
          next.view_id === previous.view_id
        ) {
          return true;
        }
        if (
          !current &&
          previous?.active &&
          previous.review.review_id !== next.review.review_id
        ) {
          return true;
        }
        const sameReview = previous?.review.review_id === next.review.review_id;
        if (!sameReview) {
          setReviewDisclosures(new Map());
        }
        if (sameReview && next.review.revision < previous.review.revision) {
          return true;
        }
        if (
          !current &&
          previous?.active &&
          sameReview &&
          next.review.revision === previous.review.revision
        ) {
          const verifiedCompletion =
            previous.review.submission?.status === "uncertain" &&
            next.review.submission?.status === "submitted" &&
            previous.review.submission.submission_id ===
              next.review.submission.submission_id;
          if (!verifiedCompletion) {
            return true;
          }
        }
        const view_id = next.view_id ?? previous?.view_id;
        const state = {
          review: next.review,
          ...(view_id ? { view_id } : {}),
          active:
            Boolean(view_id) &&
            (current ||
              Boolean(next.view_id) ||
              (sameReview && previous.active)),
        };
        activeReview.current = state;
        lastConfirmedReview.current = next.review;
        const submissionChanged =
          !sameReview ||
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
          next.review.submission?.status === "uncertain"
        ) {
          const uncertain = next.review.submission.status === "uncertain";
          submitBlockedRef.current = uncertain;
          setSubmitBlocked(uncertain);
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
        setSelected((chosen) =>
          sameReview
            ? new Set(
                [...chosen].filter((id) =>
                  next.review.items.some(
                    (item) =>
                      item.product_id === id && item.state === "needs-review",
                  ),
                ),
              )
            : new Set(),
        );
        setReplacement((chosen) =>
          sameReview &&
          next.review.alternatives?.views.some(
            (view) => view.status === "complete" && view.product.id === chosen,
          )
            ? chosen
            : undefined,
        );
        setConfirmSubmit(false);
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
        cancellationEpoch.current++;
        deactivateReview();
        setScreen({ kind: "cancelled" });
        setMessage(
          "Request cancelled. Continue in conversation when you are ready.",
        );
      };
      host.onerror = () => {
        deactivateReview();
        setMessage(
          "The Draft list connection failed. Continue in conversation or reopen your current Draft list.",
        );
      };
    },
  });
  useHostStyles(connectedApp, connectedApp?.getHostContext());
  useEffect(
    () => () => {
      if (quantityTimer.current) {
        clearTimeout(quantityTimer.current);
      }
      connectedApp?.close();
    },
    [connectedApp],
  );
  const call = async (
    name: string,
    args: Record<string, unknown>,
    recovery = true,
    adoptPresentationDestination = false,
    uncertainOnFailure = false,
  ): Promise<boolean> => {
    if (!connectedApp || !isConnected) {
      setMessage(
        error
          ? "The Draft list could not connect. Continue in conversation or reopen the current Draft list."
          : "Connecting to the current Nemlig Draft list…",
      );
      return false;
    }
    if (callLock.current) {
      return false;
    }
    callLock.current = true;
    const requestEpoch = cancellationEpoch.current;
    setBusy(true);
    setMessage("Updating…");
    try {
      const result = await connectedApp.callServerTool({
        name,
        arguments: args,
      });
      if (requestEpoch !== cancellationEpoch.current) {
        return false;
      }
      if (result.isError) {
        throw new Error(
          (result.content ?? [])
            .filter((content) => content.type === "text")
            .map((content) => content.text)
            .join(" ") || "Update failed",
        );
      }
      if (!applyPayload(result, true, adoptPresentationDestination)) {
        throw new Error("Could not confirm the updated Draft list.");
      }
      setMessage("");
      return true;
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "Update failed";
      if (/out of date/i.test(text)) {
        deactivateReview();
        activeReview.current = undefined;
        try {
          const current = await connectedApp.callServerTool({
            name: "update_product_review",
            arguments: { action: { kind: "show" } },
          });
          if (
            !current.isError &&
            requestEpoch === cancellationEpoch.current &&
            applyPayload(current, true)
          ) {
            const snapshot = readPayload(current);
            setMessage(
              snapshot?.kind === "review"
                ? "Current Draft list reloaded. This card is read-only until you make it current."
                : "No current Draft list remains. Ask before starting a new one.",
            );
          } else {
            setScreen({ kind: "stale" });
            setMessage(
              "Could not reload the current Draft list. Ask in chat to reopen it.",
            );
          }
        } catch {
          setScreen({ kind: "stale" });
          setMessage(
            "Could not reload the current Draft list. Ask in chat to reopen it.",
          );
        }
      } else if (/unavailable/i.test(text)) {
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
            const fresh = await connectedApp.callServerTool({
              name: "update_product_review",
              arguments: {
                view_id: latest.view_id,
                review_id: latest.review.review_id,
                revision: latest.review.revision,
                action: { kind: "show" },
              },
            });
            if (!fresh.isError && requestEpoch === cancellationEpoch.current) {
              applyPayload(fresh, true);
            } else {
              activeReview.current = undefined;
              setScreen({ kind: "stale" });
            }
          } else {
            activeReview.current = undefined;
            setScreen({ kind: "stale" });
          }
        } catch {
          activeReview.current = undefined;
          setScreen({ kind: "stale" });
        }
        setMessage(
          "Your last action was not applied. The current Draft list was refreshed; choose again.",
        );
      } else if (!recovery && (uncertainOnFailure || /uncertain/i.test(text))) {
        submitBlockedRef.current = true;
        setSubmitBlocked(true);
        setConfirmSubmit(false);
        setMessage(
          "Submission outcome is uncertain. Inspect the actual Nemlig basket; do not retry automatically.",
        );
      } else {
        deactivateReview();
        setPendingQuantities(new Map());
        setSelected(new Set());
        setMessage(
          "We could not confirm this action. Refresh the Draft list to check its state before trying again.",
        );
      }
      return false;
    } finally {
      callLock.current = false;
      setBusy(false);
      for (const resolve of callIdleWaiters.current.splice(0)) {
        resolve();
      }
    }
  };
  const review = screen.kind === "review" ? screen.review : undefined;
  const update = async (action: Record<string, unknown>) => {
    const latest = activeReview.current;
    if (!latest?.active || !latest.view_id || callLock.current) {
      return false;
    }
    const result = await call(
      "update_product_review",
      {
        view_id: latest.view_id,
        review_id: latest.review.review_id,
        revision: latest.review.revision,
        action,
      },
      true,
      action.kind === "alternatives" || action.kind === "replace",
    );
    if (result && action.kind === "prepare_submission") {
      setConfirmSubmit(false);
    }
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
  const flushQuantities = async () => {
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
        if (!latest.view_id) {
          return false;
        }
        const ok = await call("update_product_review", {
          view_id: latest.view_id,
          review_id: latest.review.review_id,
          revision: latest.review.revision,
          action: { kind: "quantity", product_id, quantity },
        });
        if (!ok) {
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
    void flushQuantities().then(async (ok) => {
      if (ok) {
        await update(action);
      }
    });
  };
  const navigate = (next: PresentationDestination) => {
    if (next === "alternatives" && !review?.alternatives) {
      return;
    }
    setPresentationDestination(next);
  };
  const sendFollowUp = async (text: string) => {
    if (!connectedApp || !isConnected) {
      setMessage("Continue in conversation to inspect or start a Draft list.");
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
      setMessage("Continue in conversation to inspect or start a Draft list.");
    }
  };
  const activateCurrentDraftList = async () => {
    setActivatingCurrent(true);
    try {
      // The model tool path retains the conversation scope that owns the review.
      await sendFollowUp(
        "Reopen the current Draft list without changing it. If it is no longer available, say so; do not create a new Draft list.",
      );
    } finally {
      setActivatingCurrent(false);
    }
  };
  const endDraft = async () => {
    setConfirmEnd(false);
    if (await flushQuantities()) {
      await update({ kind: "end" });
    }
  };
  // The exact submission comparison is intentionally linear and fail-closed.
  // fallow-ignore-next-line complexity
  const confirmPreparedSubmission = async () => {
    const ok = await flushQuantities();
    const confirmed = activeReview.current?.review;
    if (
      !ok ||
      !confirmed?.submission ||
      confirmed.review_id !== review?.review_id ||
      confirmed.revision !== review.revision ||
      confirmed.submission.status !== "prepared" ||
      confirmed.submission.submission_id !== review.submission?.submission_id ||
      callLock.current
    ) {
      setConfirmSubmit(false);
      setMessage(
        "The prepared change changed while quantities were being saved. Prepare and review the exact change again.",
      );
      return;
    }
    submitBlockedRef.current = true;
    setSubmitBlocked(true);
    setConfirmSubmit(false);
    const latest = activeReview.current;
    if (!latest?.view_id) {
      return;
    }
    const success = await call(
      "submit_product_review",
      {
        view_id: latest.view_id,
        review_id: confirmed.review_id,
        revision: confirmed.revision,
        submission_id: confirmed.submission.submission_id,
      },
      false,
      false,
      true,
    );
    if (!success) {
      setMessage(
        "Submission outcome is uncertain. Inspect the actual Nemlig basket; do not retry automatically.",
      );
    }
  };
  const updateDisclosure = (
    productId: number,
    change: (current: { expanded: boolean; facts: Set<string> }) => {
      expanded: boolean;
      facts: Set<string>;
    },
  ) =>
    setReviewDisclosures((previous) => {
      const next = new Map(previous);
      next.set(
        productId,
        change(
          previous.get(productId) ?? {
            expanded: false,
            facts: new Set<string>(),
          },
        ),
      );
      return next;
    });
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
        selected,
        replacement,
        reviewDisclosures,
        pendingQuantities,
        thumbnails,
        message,
        connectionMessage: !isConnected
          ? error
            ? "Could not connect to the Draft list host."
            : "Connecting to Nemlig…"
          : undefined,
        busy,
        activatingCurrent,
        confirmSubmit,
        confirmEnd,
        continueSubmitted,
        submitBlocked,
      }}
      actions={{
        onNavigate: navigate,
        onDisclosureChange: (productId, expanded) =>
          updateDisclosure(productId, (current) => ({ ...current, expanded })),
        onFactExpandedChange: (productId, factKey, expanded) =>
          updateDisclosure(productId, (current) => {
            const facts = new Set(current.facts);
            if (expanded) {
              facts.add(factKey);
            } else {
              facts.delete(factKey);
            }
            return { ...current, facts };
          }),
        onActivateCurrent: () => void activateCurrentDraftList(),
        onSelected: (productId, checked) =>
          setSelected((previous) => {
            const next = new Set(previous);
            if (checked) {
              next.add(productId);
            } else {
              next.delete(productId);
            }
            return next;
          }),
        onSelectAll: () =>
          setSelected(
            new Set(
              review?.items
                .filter(
                  (item) =>
                    item.state === "needs-review" && isUsable(item.view),
                )
                .map((item) => item.product_id) ?? [],
            ),
          ),
        onAcceptSelected: () =>
          afterFlush({ kind: "accept", product_ids: [...selected] }),
        onQuantity: setQuantity,
        onRemove: (item) =>
          afterFlush({ kind: "remove", product_ids: [item.product_id] }),
        onRevisit: (item) =>
          afterFlush({ kind: "revisit", product_ids: [item.product_id] }),
        onOpenAlternatives: (item, query) => {
          setReplacement(undefined);
          afterFlush({
            kind: "alternatives",
            product_id: item.product_id,
            query,
          });
        },
        onSearchAlternatives: (product_id, query) =>
          void update({ kind: "alternatives", product_id, query }),
        onChooseReplacement: setReplacement,
        onReplace: (product_id, replacement_id) =>
          void update({ kind: "replace", product_id, replacement_id }),
        onPrepareSubmission: () => afterFlush({ kind: "prepare_submission" }),
        onRequestSubmitConfirmation: () => setConfirmSubmit(true),
        onCancelSubmit: () => setConfirmSubmit(false),
        onConfirmSubmit: () => void confirmPreparedSubmission(),
        onContinueSubmitted: () => setContinueSubmitted(true),
        onInspectBasket: () =>
          void sendFollowUp(
            "Inspect the actual Nemlig basket for this uncertain Draft list submission. Do not retry or add anything.",
          ),
        onSendFollowUp: (text) => void sendFollowUp(text),
        onRequestEnd: () => setConfirmEnd(true),
        onCancelEnd: () => setConfirmEnd(false),
        onConfirmEnd: () => void endDraft(),
      }}
    />
  );
}
