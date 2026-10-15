import assert from "node:assert/strict";
import test from "node:test";
import type { LocalBasketCommand, ReviewOperation } from "./local-basket.js";
import {
  expireOwnerLocalBasketInventory,
  mutateOwnerLocalBasketInventory,
  type LocalBasketInventoryStorage,
  type LocalBasketStorageAccess,
} from "./local-basket-storage.js";

class FakeStorage implements LocalBasketInventoryStorage {
  readonly values = new Map<string, unknown>();
  readonly reads: string[] = [];
  readonly writes: string[] = [];
  alarm: number | undefined;

  async get<T>(key: string): Promise<T | undefined> {
    this.reads.push(key);
    return this.values.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.writes.push(key);
    if (
      new TextEncoder().encode(JSON.stringify(value)).byteLength >
      2 * 1024 * 1024
    ) {
      throw new Error("durable value too large");
    }
    this.values.set(key, structuredClone(value));
  }

  async transaction<T>(
    action: (storage: LocalBasketStorageAccess) => Promise<T>,
  ): Promise<T> {
    const values = structuredClone(this.values);
    const alarm = this.alarm;
    try {
      return await action(this);
    } catch (error) {
      this.values.clear();
      for (const [key, value] of values) {
        this.values.set(key, value);
      }
      this.alarm = alarm;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    this.writes.push(key);
    this.values.delete(key);
  }

  resetIo(): void {
    this.reads.length = 0;
    this.writes.length = 0;
  }

  async setAlarm(scheduledTime: number): Promise<void> {
    this.alarm = scheduledTime;
  }

  async deleteAlarm(): Promise<void> {
    this.alarm = undefined;
  }
}

test("review operation journal is owner-scoped and stores only exact IDs and quantities", async () => {
  const storage = new FakeStorage();
  const operation: ReviewOperation = {
    operationId: "draft-1",
    generation: "draft-1",
    accountIdentity: "account-1",
    kind: "save",
    name: "Meal plan",
    createAttempted: true,
    listId: 88,
    items: [{ productId: 1, quantity: 2 }],
    progress: { completed: 0, total: 1 },
  };

  await mutateOwnerLocalBasketInventory(storage, "owner-1", {
    kind: "review-operation-write",
    operation,
  });
  const stored = (await mutateOwnerLocalBasketInventory(storage, "owner-1", {
    kind: "review-operation-read",
    operationId: "draft-1",
  })) as ReviewOperation;
  const { createdAt, ...storedOperation } = stored;
  assert.equal(typeof createdAt, "number");
  assert.deepEqual(storedOperation, operation);
  assert.equal(JSON.stringify(storage.values).includes('"view"'), false);
  await assert.rejects(
    mutateOwnerLocalBasketInventory(storage, "owner-2", {
      kind: "review-operation-read",
      operationId: "draft-1",
    }),
    /Review operation is unavailable/u,
  );
});

test("native submission receipt stays durable and only pre-dispatch release removes it", async () => {
  const storage = new FakeStorage();
  const operation: ReviewOperation = {
    operationId: "native-list-submit:44",
    generation: "submit-attempt-one",
    accountIdentity: "account-1",
    kind: "submit",
    name: "Family",
    listId: 44,
    items: [
      { productId: 7, quantity: 2 },
      { productId: 8, quantity: 1 },
    ],
    baseline: [{ productId: 8, quantity: 1 }],
  };
  await mutateOwnerLocalBasketInventory(storage, "owner-1", {
    kind: "review-operation-write",
    operation,
  });
  assert.equal(
    await mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-claim",
      operationId: operation.operationId,
      generation: operation.generation,
    }),
    true,
  );
  assert.equal(
    await mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-release",
      operationId: operation.operationId,
      generation: operation.generation,
    }),
    true,
  );
  assert.equal(
    await mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-read",
      operationId: operation.operationId,
    }),
    undefined,
  );

  await mutateOwnerLocalBasketInventory(storage, "owner-1", {
    kind: "review-operation-write",
    operation,
  });
  await mutateOwnerLocalBasketInventory(storage, "owner-1", {
    kind: "review-operation-claim",
    operationId: operation.operationId,
    generation: operation.generation,
  });
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    {
      kind: "review-operation-complete",
      operationId: operation.operationId,
      generation: operation.generation,
    },
    1,
  );
  const retained = (await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    { kind: "review-operation-read", operationId: operation.operationId },
    Number.MAX_SAFE_INTEGER - 1,
  )) as ReviewOperation;
  assert.equal(retained.completed, true);
  assert.equal(retained.dispatchAttempted, true);
  await assert.rejects(
    mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-write",
      operation: {
        ...operation,
        generation: "submit-attempt-two",
        items: [...operation.items].reverse(),
      },
    }),
    /different shopping-list operation/u,
  );
  assert.equal(
    await mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-claim",
      operationId: operation.operationId,
      generation: "submit-attempt-two",
    }),
    false,
  );
});

test("completed basket-save receipts expire while unresolved and native records remain fenced", async () => {
  const storage = new FakeStorage();
  const basketSave: ReviewOperation = {
    operationId: "direct-basket-save:draft-1",
    generation: "save-attempt-one",
    accountIdentity: "account-1",
    kind: "basket-save",
    name: "Save current basket",
    items: [{ productId: 1, quantity: 2 }],
    baseline: [{ productId: 1, quantity: 2 }],
  };
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    { kind: "review-operation-write", operation: basketSave },
    0,
  );
  assert.equal(
    await mutateOwnerLocalBasketInventory(
      storage,
      "owner-1",
      {
        kind: "review-operation-claim",
        operationId: basketSave.operationId,
        generation: basketSave.generation,
      },
      0,
    ),
    true,
  );
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    {
      kind: "review-operation-complete",
      operationId: basketSave.operationId,
      generation: basketSave.generation,
    },
    0,
  );
  const afterOneHour = 60 * 60 * 1000;
  const receipt = (await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    {
      kind: "review-operation-read",
      operationId: basketSave.operationId,
    },
    afterOneHour,
  )) as ReviewOperation;
  assert.equal(receipt.completed, true);
  assert.equal(receipt.completedUntil, 2 * 60 * 60 * 1000);
  const afterThreeHours = 3 * 60 * 60 * 1000;
  assert.equal(
    await mutateOwnerLocalBasketInventory(
      storage,
      "owner-1",
      {
        kind: "review-operation-read",
        operationId: basketSave.operationId,
      },
      afterThreeHours,
    ),
    undefined,
  );

  const nativeSave = {
    ...basketSave,
    operationId: "native-list-create:1",
    generation: "native-attempt",
    kind: "save" as const,
  };
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    { kind: "review-operation-write", operation: nativeSave },
    0,
  );
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    {
      kind: "review-operation-complete",
      operationId: nativeSave.operationId,
      generation: nativeSave.generation,
    },
    0,
  );
  const expiredNative = await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    {
      kind: "review-operation-read",
      operationId: nativeSave.operationId,
    },
    afterThreeHours,
  );
  assert.equal(expiredNative, undefined);

  const directSubmit: ReviewOperation = {
    ...basketSave,
    operationId: "direct-basket-submit:draft-1",
    generation: "submit-attempt",
    kind: "submit",
  };
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    { kind: "review-operation-write", operation: directSubmit },
    0,
  );
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    {
      kind: "review-operation-claim",
      operationId: directSubmit.operationId,
      generation: directSubmit.generation,
    },
    0,
  );
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    {
      kind: "review-operation-complete",
      operationId: directSubmit.operationId,
      generation: directSubmit.generation,
    },
    0,
  );
  assert.equal(
    await mutateOwnerLocalBasketInventory(
      storage,
      "owner-1",
      {
        kind: "review-operation-read",
        operationId: directSubmit.operationId,
      },
      afterThreeHours,
    ),
    undefined,
  );

  const uncertainDirect: ReviewOperation = {
    ...directSubmit,
    operationId: "direct-basket-submit:uncertain-draft",
    generation: "uncertain-submit",
    completed: undefined,
  };
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    { kind: "review-operation-write", operation: uncertainDirect },
    0,
  );
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    {
      kind: "review-operation-claim",
      operationId: uncertainDirect.operationId,
      generation: uncertainDirect.generation,
    },
    0,
  );
  const retainedUncertainDirect = (await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    {
      kind: "review-operation-read",
      operationId: uncertainDirect.operationId,
    },
    afterThreeHours,
  )) as ReviewOperation;
  assert.equal(retainedUncertainDirect.dispatchAttempted, true);
  assert.equal(retainedUncertainDirect.completedUntil, undefined);

  const nativeSubmit: ReviewOperation = {
    ...basketSave,
    operationId: "native-list-submit:44",
    generation: "native-submit",
    kind: "submit",
    listId: 44,
  };
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    { kind: "review-operation-write", operation: nativeSubmit },
    0,
  );
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    {
      kind: "review-operation-claim",
      operationId: nativeSubmit.operationId,
      generation: nativeSubmit.generation,
    },
    0,
  );
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    {
      kind: "review-operation-complete",
      operationId: nativeSubmit.operationId,
      generation: nativeSubmit.generation,
    },
    0,
  );
  const retainedNativeSubmit = (await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    {
      kind: "review-operation-read",
      operationId: nativeSubmit.operationId,
    },
    Number.MAX_SAFE_INTEGER - 1,
  )) as ReviewOperation;
  assert.equal(retainedNativeSubmit.completed, true);
  assert.equal(retainedNativeSubmit.completedUntil, undefined);
});

test("old completed direct receipts are reclaimed during sustained operation volume", async () => {
  const storage = new FakeStorage();
  const interval = 10 * 60 * 1000;
  const count = 300;
  for (let index = 0; index < count; index++) {
    const operationId = `direct-basket-save:draft-${index}`;
    const operation: ReviewOperation = {
      operationId,
      generation: `save-${index}`,
      accountIdentity: "account-1",
      kind: "basket-save",
      name: "Save current basket",
      items: [{ productId: 1, quantity: 1 }],
      baseline: [{ productId: 1, quantity: 1 }],
    };
    const at = index * interval;
    await mutateOwnerLocalBasketInventory(
      storage,
      "owner-1",
      { kind: "review-operation-write", operation },
      at,
    );
    await mutateOwnerLocalBasketInventory(
      storage,
      "owner-1",
      {
        kind: "review-operation-claim",
        operationId,
        generation: operation.generation,
      },
      at,
    );
    await mutateOwnerLocalBasketInventory(
      storage,
      "owner-1",
      {
        kind: "review-operation-complete",
        operationId,
        generation: operation.generation,
      },
      at,
    );
  }
  const finalAt = count * interval;
  const index = storage.values.get("owner-review-operation-index") as {
    operations: ReviewOperation[];
  };
  assert.ok(index.operations.length <= 12);
  const recent = index.operations[0];
  assert.ok(recent);
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    { kind: "review-operation-read", operationId: recent.operationId },
    finalAt + 3 * 60 * 60 * 1000,
  );
  assert.equal(storage.values.has("owner-review-operation-index"), false);
});

test("stale journal writes cannot release the create claim or erase a native ID", async () => {
  const storage = new FakeStorage();
  const initial: ReviewOperation = {
    operationId: "draft-2",
    generation: "attempt-2",
    accountIdentity: "account-1",
    kind: "save",
    name: "Meal plan",
    items: [{ productId: 1, quantity: 2 }],
  };
  const write = (operation: ReviewOperation) =>
    mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-write",
      operation,
    });
  const claim = () =>
    mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-claim",
      operationId: initial.operationId,
      generation: initial.generation,
    });
  const read = () =>
    mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-read",
      operationId: initial.operationId,
    }) as Promise<ReviewOperation | undefined>;

  await write(initial);
  assert.equal(await claim(), true);
  await write(initial);
  assert.equal((await read())?.createAttempted, true);
  assert.equal(await claim(), false);

  await write({ ...initial, createAttempted: true, listId: 88 });
  await write(initial);
  assert.equal((await read())?.listId, 88);
  assert.equal(
    await mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-complete",
      operationId: initial.operationId,
      generation: "stale-attempt",
    }),
    false,
  );
  assert.equal((await read())?.generation, initial.generation);
  assert.equal((await read())?.completedUntil, undefined);
  await assert.rejects(
    write({
      ...initial,
      generation: "new-attempt",
      items: [{ productId: 1, quantity: 3 }],
    }),
    /different shopping-list operation/u,
  );
  assert.deepEqual((await read())?.items, initial.items);
  assert.equal(
    await mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-complete",
      operationId: initial.operationId,
      generation: initial.generation,
    }),
    true,
  );
  const next = {
    ...initial,
    generation: "new-attempt",
    items: [{ productId: 1, quantity: 3 }],
  };
  await write(next);
  assert.equal(
    await mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-complete",
      operationId: initial.operationId,
      generation: initial.generation,
    }),
    false,
  );
  assert.equal((await read())?.generation, next.generation);
  assert.deepEqual((await read())?.items, next.items);
});

test("expired unclaimed saves are pruned while uncertain saves and updates remain fenced", async () => {
  const storage = new FakeStorage();
  const staleSave: ReviewOperation = {
    operationId: "stale-save",
    generation: "stale-save",
    accountIdentity: "account-1",
    kind: "save",
    name: "Old draft",
    items: [{ productId: 1, quantity: 1 }],
  };
  const uncertainSave: ReviewOperation = {
    ...staleSave,
    operationId: "uncertain-save",
    generation: "uncertain-save",
    createAttempted: true,
  };
  const interruptedUpdate: ReviewOperation = {
    ...staleSave,
    operationId: "interrupted-update",
    generation: "interrupted-update",
    kind: "update",
    listId: 44,
  };
  for (const operation of [staleSave, uncertainSave, interruptedUpdate]) {
    await mutateOwnerLocalBasketInventory(
      storage,
      "owner-1",
      { kind: "review-operation-write", operation },
      0,
    );
  }
  const legacyIndex = storage.values.get("owner-review-operation-index") as {
    ownerId: string;
    operations: ReviewOperation[];
  };
  storage.values.set("owner-review-operation-index", {
    ...legacyIndex,
    operations: legacyIndex.operations.map(({ createdAt, ...operation }) =>
      operation.operationId === "stale-save"
        ? operation
        : { ...operation, createdAt },
    ),
  });
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner-1",
    { kind: "review-operation-read", operationId: "stale-save" },
    0,
  );

  const afterRetention = 24 * 60 * 60 * 1000 + 1;
  for (const operationId of [
    "stale-save",
    "uncertain-save",
    "interrupted-update",
  ]) {
    await mutateOwnerLocalBasketInventory(
      storage,
      "owner-1",
      { kind: "review-operation-read", operationId },
      afterRetention,
    );
  }

  assert.equal(
    await mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-read",
      operationId: "stale-save",
    }),
    undefined,
  );
  assert.equal(
    (
      (await mutateOwnerLocalBasketInventory(storage, "owner-1", {
        kind: "review-operation-read",
        operationId: "uncertain-save",
      })) as ReviewOperation
    ).createAttempted,
    true,
  );
  assert.ok(
    await mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-read",
      operationId: "interrupted-update",
    }),
  );
});

test("review-operation claim only fences the generation that wrote its intent", async () => {
  const storage = new FakeStorage();
  const operation: ReviewOperation = {
    operationId: "draft-claim-generation",
    generation: "generation-one",
    accountIdentity: "account-1",
    kind: "submit",
    name: "Meal plan",
    listId: 44,
    items: [{ productId: 1, quantity: 1 }],
    baseline: [],
  };
  await mutateOwnerLocalBasketInventory(storage, "owner-1", {
    kind: "review-operation-write",
    operation,
  });
  await mutateOwnerLocalBasketInventory(storage, "owner-1", {
    kind: "review-operation-write",
    operation: {
      ...operation,
      generation: "generation-two",
      items: [{ productId: 1, quantity: 2 }],
    },
  });
  assert.equal(
    await mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-claim",
      operationId: operation.operationId,
      generation: "generation-one",
    }),
    false,
  );
  assert.equal(
    await mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-claim",
      operationId: operation.operationId,
      generation: "generation-two",
    }),
    true,
  );
});

test("completed records do not block unresolved operations before the byte bound", async () => {
  const storage = new FakeStorage();
  const write = (operationId: string) =>
    mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-write",
      operation: {
        operationId,
        generation: operationId,
        accountIdentity: "account-1",
        kind: "save",
        name: operationId,
        items: [{ productId: 1, quantity: 1 }],
      },
    });
  for (let index = 0; index < 8; index += 1) {
    const operationId = `completed-${index}`;
    await write(operationId);
    await mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-complete",
      operationId,
      generation: operationId,
    });
  }
  for (let index = 0; index < 24; index += 1) {
    await write(`active-${index}`);
  }
  const active = (await mutateOwnerLocalBasketInventory(storage, "owner-1", {
    kind: "review-operation-read",
    operationId: "active-23",
  })) as ReviewOperation;
  const { createdAt, ...activeOperation } = active;
  assert.equal(typeof createdAt, "number");
  assert.deepEqual(activeOperation, {
    operationId: "active-23",
    generation: "active-23",
    accountIdentity: "account-1",
    kind: "save",
    name: "active-23",
    items: [{ productId: 1, quantity: 1 }],
  });
});

test("oversized recovery journals preserve fences and return an actionable error", async () => {
  const storage = new FakeStorage();
  const items = Array.from({ length: 500 }, (_, index) => ({
    productId: index + 1,
    quantity: 1,
  }));
  let lastWritten: string | undefined;
  let capacityError: unknown;
  for (let index = 0; index < 100; index += 1) {
    const operationId = `large-save-${index}`;
    try {
      await mutateOwnerLocalBasketInventory(storage, "owner-1", {
        kind: "review-operation-write",
        operation: {
          operationId,
          generation: operationId,
          accountIdentity: "account-1",
          kind: "save",
          name: operationId,
          createAttempted: true,
          items,
        },
      });
      lastWritten = operationId;
    } catch (error) {
      capacityError = error;
      break;
    }
  }
  assert.ok(lastWritten);
  assert.match(
    (capacityError as Error | undefined)?.message ?? "",
    /recovery storage is full.*did not reach Nemlig.*do not retry an uncertain Save/iu,
  );
  assert.ok(
    await mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "review-operation-read",
      operationId: lastWritten,
    }),
    "the last preserved recovery fence remains readable after capacity failure",
  );
});

test("retired inventory commands fail before touching legacy storage", async () => {
  const storage = new FakeStorage();
  storage.values.set("owner-local-basket-index", {
    ownerId: "owner-1",
    baskets: [
      {
        basketId: "00000000-0000-4000-8000-000000000001",
        productIds: [7],
        expiresAt: 1,
      },
    ],
  });
  storage.values.set("line:00000000-0000-4000-8000-000000000001:7", {
    productId: 7,
    quantity: 1,
    view: { status: "legacy" },
  });
  storage.alarm = 1234;
  const before = structuredClone(storage.values);
  storage.resetIo();

  await assert.rejects(
    mutateOwnerLocalBasketInventory(storage, "owner-1", {
      kind: "list",
    } as unknown as LocalBasketCommand),
    /Unsupported local basket command/u,
  );
  assert.deepEqual(storage.reads, []);
  assert.deepEqual(storage.writes, []);

  await expireOwnerLocalBasketInventory(storage, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(storage.values, before);
  assert.equal(storage.alarm, 1234);
  assert.deepEqual(storage.writes, []);
});
