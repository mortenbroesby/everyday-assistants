import assert from "node:assert/strict";
import test from "node:test";
import {
  LONG_OPERATION_TIMEOUT_MS,
  isBasketId,
  isKnownNoWriteFailure,
  progressMessage,
  viewerToolCallOptions,
} from "./product-viewer.js";

test("viewer actions allow long native-list work and retain cancellation", () => {
  const controller = new AbortController();
  const options = viewerToolCallOptions(controller.signal);

  assert.deepEqual(options, {
    signal: controller.signal,
    timeout: LONG_OPERATION_TIMEOUT_MS,
    maxTotalTimeout: LONG_OPERATION_TIMEOUT_MS,
  });
  assert.equal(options.timeout, 660_000);
});

test("viewer progress describes temporary drafts and separate provider actions", () => {
  assert.equal(
    progressMessage("start_product_review", {
      items: [{ product_id: 7, quantity: 2 }],
    }),
    "Preparing a temporary basket draft…",
  );
  assert.equal(
    progressMessage("update_product_review_conversation", {
      action: { kind: "quantity", product_id: 7, quantity: 3 },
    }),
    "Updating your temporary basket draft…",
  );
  assert.equal(
    progressMessage("submit_product_review_conversation", {}),
    "Adding the reviewed products to your Nemlig basket…",
  );
  assert.equal(
    progressMessage("save_basket_as_shopping_list", {}),
    "Saving the entire current Nemlig basket as a shopping list…",
  );
});

test("only an explicit pre-dispatch result is classified as a known no-write", () => {
  assert.equal(
    isKnownNoWriteFailure(
      "The basket changed before an addition; no provider write was sent.",
    ),
    true,
  );
  assert.equal(isKnownNoWriteFailure("No transfer was sent."), true);
  assert.equal(
    isKnownNoWriteFailure(
      "Shopping-list recovery storage is full. This Save or Update did not reach Nemlig; use an existing list and do not retry an uncertain Save.",
    ),
    false,
  );
  assert.equal(
    isKnownNoWriteFailure(
      "The update could not be recorded safely. No products were changed in Nemlig; refresh this list before continuing.",
    ),
    false,
  );
  assert.equal(
    isKnownNoWriteFailure(
      "Could not record this save safely. No Nemlig shopping list was created or changed.",
    ),
    false,
  );
  assert.equal(
    isKnownNoWriteFailure(
      "Cannot confirm whether the update did not reach Nemlig.",
    ),
    false,
  );
  assert.equal(
    isKnownNoWriteFailure(
      "A previous basket transfer may have completed. Inspect the actual basket; this transfer will not be retried.",
    ),
    false,
  );
  assert.equal(
    isKnownNoWriteFailure(
      "Nemlig returned HTTP 503 for the shopping-list transfer. Inspect the basket; do not retry.",
    ),
    false,
  );
  assert.equal(
    isKnownNoWriteFailure(
      "Nemlig responded to the transfer, but basket readback did not confirm the full addition.",
    ),
    false,
  );
});

test("review target validation accepts native list IDs and legacy basket UUIDs", () => {
  assert.equal(isBasketId("44"), true);
  assert.equal(isBasketId("00000000-0000-4000-8000-000000000001"), true);
  assert.equal(isBasketId("0"), false);
  assert.equal(isBasketId("not-a-list"), false);
});
