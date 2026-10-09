import type { ProductView } from "../../product-presentation.js";
import type { Review, ReviewItem } from "../viewer-page.js";

function withoutPreparedSubmission(review: Review): Review {
  return review.submission === undefined
    ? review
    : { ...review, submission: undefined };
}

function replaceItem(
  review: Review,
  productId: number,
  change: (item: ReviewItem) => ReviewItem,
): Review {
  return {
    ...review,
    items: review.items.map((item) =>
      item.product_id === productId ? change(item) : item,
    ),
  };
}

export function acceptSelected(review: Review, selected: ReadonlySet<number>) {
  return withoutPreparedSubmission({
    ...review,
    items: review.items.map((item) =>
      selected.has(item.product_id) ? { ...item, state: "ready" } : item,
    ),
  });
}

export function updateQuantity(
  review: Review,
  productId: number,
  quantity: number,
) {
  return withoutPreparedSubmission(
    replaceItem(review, productId, (item) => ({ ...item, quantity })),
  );
}

export function removeItem(review: Review, productId: number) {
  return withoutPreparedSubmission({
    ...review,
    items: review.items.filter((item) => item.product_id !== productId),
  });
}

export function withoutSelected(
  selected: ReadonlySet<number>,
  productId: number,
) {
  const next = new Set(selected);
  next.delete(productId);
  return next;
}

export function revisitItem(review: Review, productId: number) {
  return withoutPreparedSubmission(
    replaceItem(review, productId, (item) => ({
      ...item,
      state: "needs-review",
    })),
  );
}

export function alternativesFor(
  review: Review,
  productId: number,
  query: string,
  views: ProductView[],
) {
  return {
    ...review,
    alternatives: { product_id: productId, query, views },
  };
}

export function replaceWithAlternative(
  review: Review,
  productId: number,
  replacementId: number,
) {
  const replacement = review.alternatives?.views.find((view) =>
    view.status === "complete"
      ? view.product.id === replacementId
      : view.product_id === replacementId,
  );
  if (!replacement) {
    return review;
  }
  return withoutPreparedSubmission({
    ...replaceItem(review, productId, (item) => ({
      ...item,
      product_id: replacementId,
      view: replacement,
      state: "needs-review",
    })),
    alternatives: undefined,
  });
}
