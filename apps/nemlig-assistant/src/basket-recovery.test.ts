import assert from "node:assert/strict";
import test from "node:test";
import { compareBasketSubmission } from "./basket-recovery.js";
import type { Basket } from "./client.js";
import type { ReviewOperation } from "./local-basket.js";

const draftId = "11111111-1111-4111-8111-111111111111";
const operation: ReviewOperation = {
  operationId: `direct-basket-submit:${draftId}`,
  generation: "22222222-2222-4222-8222-222222222222",
  accountIdentity: "fixture-account",
  kind: "submit",
  name: "Direct basket draft",
  items: [{ productId: 7, quantity: 1 }],
  baseline: [{ productId: 7, quantity: 1 }],
};
const basket: Basket = {
  items: [{ id: 7, quantity: 2, name: undefined, total: undefined }],
  productsPrice: undefined,
  deliveryPrice: undefined,
  numberOfProducts: undefined,
  deliveryTime: undefined,
};

test("legacy inspection labels reviewed intent and never infers operation completion", () => {
  const result = compareBasketSubmission(draftId, operation, basket);
  assert.equal(result.basis, "reviewed_intent");
  assert.equal(result.comparison, "matches_expected");
  assert.equal(result.status, "unconfirmed");
  assert.equal(result.retry_allowed, false);
  assert.equal(
    compareBasketSubmission(draftId, { ...operation, completed: true }, basket)
      .status,
    "completed",
  );
});

test("missing or invalid quantity evidence is unavailable rather than an absent product", () => {
  const invalidOperations = [
    { ...operation, baseline: undefined },
    { ...operation, baseline: [{ productId: 7, quantity: -1 }] },
    {
      ...operation,
      baseline: [...operation.baseline!, ...operation.baseline!],
    },
  ];
  for (const invalid of invalidOperations) {
    const result = compareBasketSubmission(draftId, invalid, basket);
    assert.equal(result.comparison, "unavailable");
    assert.deepEqual(result.lines, []);
  }
  for (const items of [
    [{ ...basket.items[0]!, id: undefined }],
    [{ ...basket.items[0]!, quantity: undefined }],
    [{ ...basket.items[0]!, quantity: -1 }],
    [...basket.items, ...basket.items],
  ]) {
    assert.equal(
      compareBasketSubmission(draftId, operation, { ...basket, items })
        .comparison,
      "unavailable",
    );
  }
});
