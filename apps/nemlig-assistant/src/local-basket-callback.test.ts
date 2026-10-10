import assert from "node:assert/strict";
import test from "node:test";
import { handleLocalBasketStateRequest } from "./local-basket-callback.js";
import {
  attachLocalBasketCapability,
  withLocalBasketCapability,
} from "./local-basket-capability.js";
import { createOwnerLocalBasketInventory } from "./local-basket.js";

const principalKey = "a".repeat(32);

test("Local basket callback requires a live Worker capability before storage", async () => {
  let storageCalls = 0;
  const storage = {
    idFromName: (ownerId: string) => {
      storageCalls += 1;
      return ownerId;
    },
    get: () => {
      storageCalls += 1;
      return {
        read: async () => createOwnerLocalBasketInventory(principalKey),
      };
    },
  };

  const response = await handleLocalBasketStateRequest(
    new Request("http://local-basket-state.internal/inventory"),
    storage,
  );

  assert.equal(response.status, 403);
  assert.equal(storageCalls, 0);
});

test("Local basket callback derives storage identity from capability, not request data", async () => {
  const names: string[] = [];
  const storage = {
    idFromName: (ownerId: string) => {
      names.push(ownerId);
      return ownerId;
    },
    get: () => ({
      read: async (ownerId: string) => createOwnerLocalBasketInventory(ownerId),
    }),
  };
  const request = new Request("http://local-basket-state.internal/inventory", {
    headers: { "x-owner-id": "forged-owner" },
  });

  await withLocalBasketCapability(principalKey, async (capability) => {
    const response = await handleLocalBasketStateRequest(
      attachLocalBasketCapability(request, capability),
      storage,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      await response.json(),
      createOwnerLocalBasketInventory(principalKey),
    );
  });

  assert.deepEqual(names, [principalKey]);
});

test("Local basket callback rejects credential-bearing egress before storage", async () => {
  let storageCalls = 0;
  const storage = {
    idFromName: () => {
      storageCalls += 1;
      return principalKey;
    },
    get: () => {
      storageCalls += 1;
      return {
        read: async () => createOwnerLocalBasketInventory(principalKey),
      };
    },
  };
  const request = new Request("http://local-basket-state.internal/inventory", {
    headers: { authorization: "Bearer synthetic-secret" },
  });

  await withLocalBasketCapability(principalKey, async (capability) => {
    const response = await handleLocalBasketStateRequest(
      attachLocalBasketCapability(request, capability),
      storage,
    );
    assert.equal(response.status, 403);
  });

  assert.equal(storageCalls, 0);
});
