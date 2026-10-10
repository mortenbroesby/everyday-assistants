import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_BASKET_TTL_MS, MAX_LOCAL_BASKETS } from "./local-basket.js";
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
