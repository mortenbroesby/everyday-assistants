import assert from "node:assert/strict";
import test from "node:test";
import {
  attachLocalBasketCapability,
  localBasketCapability,
  revokeWhenBodyEnds,
} from "./local-basket-capability.js";

test("outbound requests carry the capability resolved by their Container DO", () => {
  const request = new Request("http://local-basket-state.internal/inventory", {
    headers: {
      authorization: "Bearer never-forward-this",
      "x-nemlig-local-basket-capability": "spoofed",
    },
  });
  const forwarded = attachLocalBasketCapability(request, "container-token");

  assert.equal(localBasketCapability(forwarded), "container-token");
  assert.equal(
    forwarded.headers.get("authorization"),
    "Bearer never-forward-this",
  );
  assert.equal(localBasketCapability(request), "spoofed");
});

test("capability revokes only after a streamed response completes", async () => {
  let revoked = 0;
  const response = await revokeWhenBodyEnds(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("partial"));
        },
      }),
    ),
    async () => {
      revoked += 1;
    },
  );
  assert.equal(revoked, 0);
  await response.body?.cancel();
  assert.equal(revoked, 1);
});

test("capability revokes after streamed response error", async () => {
  let revoked = 0;
  const response = await revokeWhenBodyEnds(
    new Response(
      new ReadableStream({
        pull(controller) {
          controller.error(new Error("stream failed"));
        },
      }),
    ),
    async () => {
      revoked += 1;
    },
  );
  await assert.rejects(response.arrayBuffer());
  assert.equal(revoked, 1);
});
