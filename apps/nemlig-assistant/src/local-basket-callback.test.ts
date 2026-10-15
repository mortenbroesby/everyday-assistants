import assert from "node:assert/strict";
import test from "node:test";
import { handleLocalBasketStateRequest } from "./local-basket-callback.js";
import { attachLocalBasketCapability } from "./local-basket-capability.js";
import type { LocalBasketCommand } from "./local-basket.js";
import {
  mutateOwnerLocalBasketInventory,
  type LocalBasketInventoryStorage,
  type LocalBasketStorageAccess,
} from "./local-basket-storage.js";

const principalKey = "a".repeat(32);
const capability = "container-owned-capability";
const request = (command: unknown, headers: Record<string, string> = {}) =>
  attachLocalBasketCapability(
    new Request("http://local-basket-state.internal/inventory", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(command),
    }),
    capability,
  );

test("Local basket callback requires a live Worker capability before storage", async () => {
  let storageCalls = 0;
  const response = await handleLocalBasketStateRequest(
    new Request("http://local-basket-state.internal/inventory", {
      method: "POST",
      body: JSON.stringify({ kind: "review-operation-read", operationId: "x" }),
    }),
    {
      idFromName: () => {
        storageCalls++;
        return "owner";
      },
      get: () => {
        storageCalls++;
        return { mutate: async () => undefined };
      },
    },
    async () => undefined,
  );
  assert.equal(response.status, 403);
  assert.equal(storageCalls, 0);
});

test("callback accepts all five journal commands and keeps long native names", async () => {
  const seen: string[] = [];
  const operation = {
    operationId: "save:1",
    generation: "attempt:1",
    accountIdentity: "synthetic-account",
    kind: "save",
    name: "A saved list name longer than thirty characters",
    items: [{ productId: 7, quantity: 2 }],
  };
  const commands = [
    { kind: "review-operation-read", operationId: "save:1" },
    {
      kind: "review-operation-claim",
      operationId: "save:1",
      generation: "attempt:1",
    },
    {
      kind: "review-operation-release",
      operationId: "save:1",
      generation: "attempt:1",
    },
    { kind: "review-operation-write", operation },
    {
      kind: "review-operation-complete",
      operationId: "save:1",
      generation: "attempt:1",
    },
  ];
  const response = await handleLocalBasketStateRequest(
    request(
      { kind: "review-operation-write", operation, ownerId: "forged-owner" },
      { "x-owner-id": "forged-owner" },
    ),
    {
      idFromName: (ownerId: string) => {
        seen.push(`id:${ownerId}`);
        assert.equal(ownerId, principalKey);
        return ownerId;
      },
      get: () => ({
        mutate: async (_owner: string, command: LocalBasketCommand) => {
          seen.push(command.kind);
          return command.kind;
        },
      }),
    },
    async (value) => (value === capability ? principalKey : undefined),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.json(), "review-operation-write");
  for (const command of commands) {
    const commandResponse = await handleLocalBasketStateRequest(
      request(command),
      {
        idFromName: (ownerId: string) => ownerId,
        get: () => ({ mutate: async (_owner, parsed) => parsed.kind }),
      },
      async (value) => (value === capability ? principalKey : undefined),
    );
    assert.equal(commandResponse.status, 200, command.kind);
  }
  assert.deepEqual(seen, ["id:" + principalKey, "review-operation-write"]);
});

test("callback persists normalized direct receipts through owner storage", async () => {
  const values = new Map<string, unknown>();
  const storage: LocalBasketInventoryStorage = {
    async get<T>(key: string) {
      return values.get(key) as T | undefined;
    },
    async put<T>(key: string, value: T) {
      values.set(key, structuredClone(value));
    },
    async delete(key: string) {
      values.delete(key);
    },
    async setAlarm() {},
    async deleteAlarm() {},
    async transaction<T>(
      action: (access: LocalBasketStorageAccess) => Promise<T>,
    ) {
      return action(storage);
    },
  };
  const owner = `direct-owner-${principalKey}`;
  const operation = {
    operationId: "direct-basket-save:draft-1",
    generation: "save-attempt-1",
    accountIdentity: "account-1",
    kind: "basket-save",
    name: "Save current Nemlig basket as a shopping list",
    items: [{ productId: 91, quantity: 3 }],
    baseline: [{ productId: 91, quantity: 3 }],
  };
  const response = await handleLocalBasketStateRequest(
    request({ kind: "review-operation-write", operation }),
    {
      idFromName: () => owner,
      get: () => ({
        mutate: async (authenticatedOwner, command) =>
          mutateOwnerLocalBasketInventory(storage, authenticatedOwner, command),
      }),
    },
    async (value) => (value === capability ? owner : undefined),
  );
  assert.equal(response.status, 200);
  const stored = await mutateOwnerLocalBasketInventory(storage, owner, {
    kind: "review-operation-read",
    operationId: operation.operationId,
  });
  assert.deepEqual(
    stored && (stored as typeof operation).items,
    operation.items,
  );
  assert.deepEqual(
    stored && (stored as typeof operation).baseline,
    operation.baseline,
  );
});

test("journal callbacks remain separated by capability-derived owner", async () => {
  const owners = new Map<string, Map<string, unknown>>();
  const storage = {
    idFromName: (ownerId: string) => ownerId,
    get: (ownerId: string) => ({
      mutate: async (_owner: string, command: LocalBasketCommand) => {
        const operations = owners.get(ownerId) ?? new Map<string, unknown>();
        owners.set(ownerId, operations);
        if (command.kind === "review-operation-write") {
          operations.set(command.operation.operationId, command.operation);
        }
        if (command.kind === "review-operation-read") {
          return operations.get(command.operationId);
        }
        return true;
      },
    }),
  };
  const byCapability = new Map([
    ["owner-a-capability", "owner-a"],
    ["owner-b-capability", "owner-b"],
  ]);
  const call = (capabilityValue: string, command: unknown) =>
    handleLocalBasketStateRequest(
      attachLocalBasketCapability(
        new Request("http://local-basket-state.internal/inventory", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
        }),
        capabilityValue,
      ),
      storage,
      async (value) => byCapability.get(value),
    );
  const operation = (accountIdentity: string) => ({
    kind: "review-operation-write",
    operation: {
      operationId: "native-submit:44",
      generation: "attempt:1",
      accountIdentity,
      kind: "submit",
      name: "Synthetic dinner",
      items: [{ productId: 7, quantity: 2 }],
    },
  });
  assert.equal(
    (await call("owner-a-capability", operation("account-a"))).status,
    200,
  );
  assert.equal(
    (await call("owner-b-capability", operation("account-b"))).status,
    200,
  );
  const read = async (cap: string) =>
    call(cap, {
      kind: "review-operation-read",
      operationId: "native-submit:44",
    }).then((response) => response.json()) as Promise<{
      accountIdentity: string;
    }>;
  assert.equal((await read("owner-a-capability")).accountIdentity, "account-a");
  assert.equal((await read("owner-b-capability")).accountIdentity, "account-b");
});

test("callback keeps capacity and generic storage failures safe", async () => {
  const command = { kind: "review-operation-read", operationId: "submit:44" };
  const call = (failure: unknown) =>
    handleLocalBasketStateRequest(
      request(command),
      {
        idFromName: (ownerId: string) => ownerId,
        get: () => ({
          mutate: async () => {
            throw failure;
          },
        }),
      },
      async () => principalKey,
    );
  const capacity = await call({ code: "LOCAL_BASKET_OPERATION_CAPACITY" });
  assert.equal(capacity.status, 429);
  assert.match(await capacity.text(), /recovery storage is full/u);
  const unavailable = await call(new Error("private storage details"));
  assert.equal(unavailable.status, 500);
  assert.doesNotMatch(await unavailable.text(), /private storage details/u);
});

test("retired inventory commands are rejected before storage access", async () => {
  let storageCalls = 0;
  const storage = {
    idFromName: () => {
      storageCalls++;
      return principalKey;
    },
    get: () => {
      storageCalls++;
      return { mutate: async () => undefined };
    },
  };
  for (const command of [
    { kind: "list" },
    { kind: "selection", selectionKey: "synthetic" },
    { kind: "create", lines: [] },
    { kind: "read", basketId: "00000000-0000-4000-8000-000000000001" },
    {
      kind: "edit",
      basketId: "00000000-0000-4000-8000-000000000001",
      edit: { kind: "remove", productIds: [7] },
    },
    { kind: "delete", basketId: "00000000-0000-4000-8000-000000000001" },
    { kind: "heartbeat", basketId: "00000000-0000-4000-8000-000000000001" },
  ]) {
    const response = await handleLocalBasketStateRequest(
      request(command),
      storage,
      async () => principalKey,
    );
    assert.equal(response.status, 400, command.kind);
  }
  assert.equal(storageCalls, 0);
});

test("credential-bearing callback egress is rejected before storage", async () => {
  let storageCalls = 0;
  const response = await handleLocalBasketStateRequest(
    request(
      { kind: "review-operation-read", operationId: "submit:44" },
      { authorization: "Bearer synthetic-secret" },
    ),
    {
      idFromName: () => {
        storageCalls++;
        return principalKey;
      },
      get: () => {
        storageCalls++;
        return { mutate: async () => undefined };
      },
    },
    async () => principalKey,
  );
  assert.equal(response.status, 403);
  assert.equal(storageCalls, 0);
});
