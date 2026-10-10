import assert from "node:assert/strict";
import test from "node:test";
import {
  attachLocalBasketCapability,
  CAPABILITY_HEADER,
  localBasketCapabilityOwner,
  withLocalBasketCapability,
} from "./local-basket-capability.js";

const principalKey = "a".repeat(32);

test("Local basket callback capability is limited to the forwarded request", async () => {
  const request = new Request("http://local-basket-state.internal/inventory");
  assert.equal(localBasketCapabilityOwner(request), undefined);

  let forwarded: Request | undefined;
  await withLocalBasketCapability(principalKey, async (capability) => {
    forwarded = attachLocalBasketCapability(request, capability);
    assert.equal(forwarded.headers.get(CAPABILITY_HEADER), capability);
    assert.equal(localBasketCapabilityOwner(forwarded), principalKey);
    assert.equal(
      localBasketCapabilityOwner(
        new Request("http://local-basket-state.internal/inventory", {
          headers: { [CAPABILITY_HEADER]: "forged" },
        }),
      ),
      undefined,
    );
  });

  assert.ok(forwarded);
  assert.equal(localBasketCapabilityOwner(forwarded), undefined);
});

test("Local basket callback capability rejects an invalid principal key", async () => {
  await assert.rejects(
    withLocalBasketCapability("not-a-principal", async () => undefined),
    /principal is invalid/u,
  );
});
