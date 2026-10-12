import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_BASKET_TTL_MS,
  MAX_LOCAL_BASKETS,
  type ReviewOperation,
} from "./local-basket.js";
import {
  expireOwnerLocalBasketInventory,
  mutateOwnerLocalBasketInventory,
  type LocalBasketInventoryStorage,
  type LocalBasketStorageAccess,
} from "./local-basket-storage.js";

const line = (productId: number, quantity: number) => ({
  productId,
  quantity,
  view: {
    context: "details" as const,
    status: "complete" as const,
    product: {
      id: productId,
      name: `Product ${productId}`,
      price: 1,
      unit_price: 1,
      unit: "1 stk.",
      unit_size: "1 stk.",
      currency: "DKK" as const,
      brand: "Fixture",
      available: true,
      is_organic: false,
      is_frozen: false,
      is_on_discount: false,
      image_url: undefined,
      labels: [],
      tags: [],
    },
  },
});

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

test("500 product snapshots stay below the Durable Object per-value limit", async () => {
  const storage = new FakeStorage();
  const owner = "owner";
  const manyLines = Array.from({ length: 500 }, (_, index) => {
    const productId = index + 1;
    const row = line(productId, 1);
    return {
      ...row,
      view: {
        ...row.view,
        product: { ...row.view.product, description: "x".repeat(5_000) },
      },
    };
  });
  const created = (await mutateOwnerLocalBasketInventory(
    storage,
    owner,
    { kind: "create", lines: manyLines },
    100,
  )) as { basket: { basketId: string } };

  assert.equal(storage.values.size, 501);
  const index = storage.values.get("owner-local-basket-index") as {
    baskets: Array<Record<string, unknown>>;
  };
  assert.equal("lines" in index.baskets[0]!, false);
  assert.equal(index.baskets[0]!.productIds instanceof Array, true);
  assert.ok(
    [...storage.values.values()].every(
      (value) =>
        new TextEncoder().encode(JSON.stringify(value)).byteLength <
        2 * 1024 * 1024,
    ),
  );
  assert.equal(
    (
      (await mutateOwnerLocalBasketInventory(
        storage,
        owner,
        { kind: "read", basketId: created.basket.basketId },
        101,
      )) as { lines: unknown[] }
    ).lines.length,
    500,
  );
});

test("explicitly unavailable product lines survive durable recovery", async () => {
  const storage = new FakeStorage();
  const unavailable = {
    productId: 17,
    quantity: 1,
    view: {
      context: "details" as const,
      status: "unavailable" as const,
      product_id: 17,
    },
  };
  const created = (await mutateOwnerLocalBasketInventory(
    storage,
    "owner",
    { kind: "create", lines: [unavailable] },
    100,
  )) as { basket: { basketId: string } };

  const recovered = (await mutateOwnerLocalBasketInventory(
    storage,
    "owner",
    { kind: "read", basketId: created.basket.basketId },
    101,
  )) as { lines: Array<{ view: { status: string; product_id?: number } }> };
  assert.deepEqual(recovered.lines[0]?.view, unavailable.view);
});

test("command reads and the Durable Object alarm remove expired baskets", async () => {
  const storage = new FakeStorage();
  const created = (await mutateOwnerLocalBasketInventory(
    storage,
    "owner",
    { kind: "create", lines: [line(3, 1)] },
    100,
  )) as { basket: { basketId: string } };
  assert.equal(storage.alarm, 100 + LOCAL_BASKET_TTL_MS);

  await expireOwnerLocalBasketInventory(storage, 100 + LOCAL_BASKET_TTL_MS);
  assert.equal(storage.values.size, 0);
  assert.equal(storage.alarm, undefined);
  await assert.rejects(
    mutateOwnerLocalBasketInventory(
      storage,
      "owner",
      { kind: "read", basketId: created.basket.basketId },
      100 + LOCAL_BASKET_TTL_MS,
    ),
    /unavailable/u,
  );
});

test("inventory listing and basket edits avoid unrelated product snapshots", async () => {
  const storage = new FakeStorage();
  const basketIds: string[] = [];
  for (let basket = 1; basket <= MAX_LOCAL_BASKETS; basket += 1) {
    const created = (await mutateOwnerLocalBasketInventory(
      storage,
      "owner",
      {
        kind: "create",
        lines: Array.from({ length: 5 }, (_, offset) =>
          line(basket * 10 + offset, 1),
        ),
      },
      100,
    )) as { basket: { basketId: string } };
    basketIds.push(created.basket.basketId);
  }
  storage.resetIo();

  const listed = await mutateOwnerLocalBasketInventory(
    storage,
    "owner",
    { kind: "list" },
    101,
  );
  assert.equal((listed as unknown[]).length, MAX_LOCAL_BASKETS);
  assert.deepEqual(storage.reads, ["owner-local-basket-index"]);
  assert.deepEqual(storage.writes, []);

  storage.resetIo();
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner",
    {
      kind: "edit",
      basketId: basketIds[24]!,
      edit: { kind: "quantity", productId: 250, quantity: 2 },
      expectedRevision: 0,
    },
    102,
  );
  assert.deepEqual(
    storage.reads.filter((key) => key.startsWith("line:")),
    Array.from(
      { length: 5 },
      (_, offset) => `line:${basketIds[24]}:${250 + offset}`,
    ),
  );
  const writtenKeys: string[] = Array.from(storage.writes as string[]);
  assert.ok(
    writtenKeys.every(
      (key) =>
        key === "owner-local-basket-index" ||
        key.startsWith(`line:${basketIds[24]}:`),
    ),
  );
});

test("passive reads and metadata-only heartbeats never rewrite product lines", async () => {
  const storage = new FakeStorage();
  const created = (await mutateOwnerLocalBasketInventory(
    storage,
    "owner",
    { kind: "create", lines: [line(5, 1), line(6, 2)] },
    100,
  )) as { basket: { basketId: string } };
  const basketId = created.basket.basketId;

  storage.resetIo();
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner",
    { kind: "read", basketId },
    101,
  );
  assert.deepEqual(storage.writes, []);

  storage.resetIo();
  await mutateOwnerLocalBasketInventory(
    storage,
    "owner",
    { kind: "heartbeat", basketId },
    102,
  );
  const heartbeatWrites: string[] = Array.from(storage.writes);
  assert.deepEqual(
    heartbeatWrites.filter((key) => key.startsWith("line:")),
    [],
  );
  assert.ok(heartbeatWrites.includes("owner-local-basket-index"));
});

test("terminal completion deletes both basket lines and its index record", async () => {
  const storage = new FakeStorage();
  const created = (await mutateOwnerLocalBasketInventory(
    storage,
    "owner",
    { kind: "create", lines: [line(5, 1)] },
    100,
  )) as { basket: { basketId: string } };
  const basketId = created.basket.basketId;

  await mutateOwnerLocalBasketInventory(
    storage,
    "owner",
    {
      kind: "edit",
      basketId,
      edit: { kind: "attempt-submission" },
      expectedRevision: 0,
    },
    101,
  );
  const completed = await mutateOwnerLocalBasketInventory(
    storage,
    "owner",
    {
      kind: "edit",
      basketId,
      edit: { kind: "complete-submission" },
      expectedRevision: 1,
    },
    102,
  );

  assert.deepEqual(completed, { basketId, deleted: true });
  assert.equal(storage.values.size, 0);
  assert.equal(
    (
      (await mutateOwnerLocalBasketInventory(
        storage,
        "owner",
        { kind: "list" },
        103,
      )) as unknown[]
    ).length,
    0,
  );
});
