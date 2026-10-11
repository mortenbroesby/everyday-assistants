import assert from "node:assert/strict";
import test from "node:test";
import {
  LONG_OPERATION_TIMEOUT_MS,
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
