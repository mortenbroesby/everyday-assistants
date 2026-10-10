import assert from "node:assert/strict";
import test from "node:test";
import { isCredentialFreeMcpCall } from "./credential-free-mcp.js";

test("credential-free MCP calls accept only local basket actions", () => {
  assert.equal(isCredentialFreeMcpCall("start_product_review", {}), true);
  assert.equal(
    isCredentialFreeMcpCall("start_product_review", { items: [] }),
    false,
  );
  assert.equal(
    isCredentialFreeMcpCall("start_product_review", { extra: true }),
    false,
  );
  assert.equal(
    isCredentialFreeMcpCall("update_product_review", {
      action: { kind: "list" },
    }),
    true,
  );
  assert.equal(
    isCredentialFreeMcpCall("update_product_review_conversation", {
      basket_id: "00000000-0000-4000-8000-000000000001",
      action: { kind: "delete" },
    }),
    true,
  );
  assert.equal(
    isCredentialFreeMcpCall("update_product_review", {
      basket_id: "00000000-0000-4000-8000-000000000001",
      action: { kind: "delete" },
      items: [],
    }),
    false,
  );
  assert.equal(
    isCredentialFreeMcpCall("update_product_review", {
      action: { kind: "prepare_submission" },
    }),
    false,
  );
});
