import { z } from "zod";
import type { ReviewOperation } from "./local-basket.js";
import type { Basket } from "./client.js";

/** Closed diagnostic vocabulary; never accept provider text or request data. */
export const basketAdditionFailureSchema = z
  .object({
    stage: z.enum(["dispatch", "readback"]),
    category: z.enum([
      "http",
      "network",
      "timeout",
      "cancelled",
      "invalid_response",
      "readback_mismatch",
    ]),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    validationFailuresPresent: z.literal(true).optional(),
  })
  .strict();

export const basketRecoverySchema = z.object({
  draft_id: z.string().uuid(),
  status: z.enum(["completed", "unconfirmed"]),
  comparison: z.enum([
    "unchanged",
    "matches_expected",
    "different",
    "unavailable",
  ]),
  basis: z.enum(["dispatched_items", "reviewed_intent"]),
  retry_allowed: z.literal(false),
  failure: basketAdditionFailureSchema.optional(),
  lines: z.array(
    z.object({
      product_id: z.number().int().positive(),
      before: z.number().int().nonnegative(),
      requested: z.number().int().positive(),
      expected: z.number().int().positive(),
      current: z.number().int().nonnegative(),
    }),
  ),
});

// Invalid provider/legacy quantities must not be interpreted as absent products.
const quantityMap = (
  items:
    | Array<{ productId: number | undefined; quantity: number | undefined }>
    | undefined,
): Map<number, number> | undefined => {
  if (!items) {
    return undefined;
  }
  const quantities = new Map<number, number>();
  for (const { productId, quantity } of items) {
    if (
      !Number.isSafeInteger(productId) ||
      productId! < 1 ||
      !Number.isSafeInteger(quantity) ||
      quantity! < 0 ||
      quantities.has(productId!)
    ) {
      return undefined;
    }
    quantities.set(productId!, quantity!);
  }
  return quantities;
};

/** Comparison is evidence of quantities, never attribution to an uncertain write. */
export const compareBasketSubmission = (
  draftId: string,
  operation: ReviewOperation,
  basket: Basket,
): z.infer<typeof basketRecoverySchema> => {
  const evidence: z.infer<typeof basketRecoverySchema> = {
    draft_id: draftId,
    status: operation.completed ? "completed" : "unconfirmed",
    comparison: "unavailable",
    basis: operation.dispatchedItems ? "dispatched_items" : "reviewed_intent",
    retry_allowed: false,
    ...(operation.failure ? { failure: operation.failure } : {}),
    lines: [],
  };
  const baseline = quantityMap(operation.baseline);
  const current = quantityMap(
    basket.items.map(({ id, quantity }) => ({ productId: id, quantity })),
  );
  if (!baseline || !current) {
    return evidence;
  }
  const requested = operation.dispatchedItems ?? operation.items;
  const lines = requested.map(({ productId, quantity }) => ({
    product_id: productId,
    before: baseline.get(productId) ?? 0,
    requested: quantity,
    expected: (baseline.get(productId) ?? 0) + quantity,
    current: current.get(productId) ?? 0,
  }));
  const unchanged =
    [...baseline].every(([id, qty]) => (current.get(id) ?? 0) === qty) &&
    [...current].every(([id, qty]) => (baseline.get(id) ?? 0) === qty);
  const preserved = [...baseline].every(
    ([id, qty]) => (current.get(id) ?? 0) >= qty,
  );
  let comparison: z.infer<typeof basketRecoverySchema>["comparison"] =
    "different";
  if (unchanged) {
    comparison = "unchanged";
  } else if (
    preserved &&
    lines.every(({ expected, current }) => expected === current)
  ) {
    comparison = "matches_expected";
  }
  return { ...evidence, comparison, lines };
};
