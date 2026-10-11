import assert from "node:assert/strict";
import test from "node:test";
import {
  LONG_OPERATION_TIMEOUT_MS,
  isBasketId,
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

test("review target validation accepts native list IDs and legacy basket UUIDs", () => {
  assert.equal(isBasketId("44"), true);
  assert.equal(isBasketId("00000000-0000-4000-8000-000000000001"), true);
  assert.equal(isBasketId("0"), false);
  assert.equal(isBasketId("not-a-list"), false);
});
