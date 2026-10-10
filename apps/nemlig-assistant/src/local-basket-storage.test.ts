import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocalBasket,
  createOwnerLocalBasketInventory,
  LOCAL_BASKET_TTL_MS,
  MAX_LOCAL_BASKETS,
  selectLocalBasket,
  type OwnerLocalBasketInventory,
} from "./local-basket.js";
import {
  expireOwnerLocalBasketInventory,
  readOwnerLocalBasketInventory,
  writeOwnerLocalBasketInventory,
  type LocalBasketInventoryStorage,
} from "./local-basket-storage.js";

const id = (value: number): string =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

class FakeStorage implements LocalBasketInventoryStorage {
  readonly values = new Map<string, unknown>();
  alarm: number | undefined;

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async setAlarm(scheduledTime: number): Promise<void> {
    this.alarm = scheduledTime;
  }

  async deleteAlarm(): Promise<void> {
    this.alarm = undefined;
  }
}

const create = (
  inventory: OwnerLocalBasketInventory,
  value: number,
  now: number,
) =>
  createLocalBasket(inventory, "owner", [{ productId: value, quantity: 1 }], {
    now: () => now,
    createId: () => id(value),
  });

test("persists an owner inventory across Durable Object restarts", async () => {
  const storage = new FakeStorage();
  const created = create(createOwnerLocalBasketInventory("owner"), 1, 100);
  await writeOwnerLocalBasketInventory(
    storage,
    "owner",
    created.inventory,
    100,
  );

  const recovered = await readOwnerLocalBasketInventory(storage, "owner", 101);

  assert.deepEqual(recovered, created.inventory);
  assert.equal(storage.alarm, 100 + LOCAL_BASKET_TTL_MS);
});

test("prunes expiry on reads, writes, and the earliest-expiry alarm", async () => {
  const storage = new FakeStorage();
  let inventory = createOwnerLocalBasketInventory("owner");
  const first = create(inventory, 1, 100);
  inventory = first.inventory;
  const second = create(inventory, 2, 200);
  inventory = second.inventory;
  await writeOwnerLocalBasketInventory(storage, "owner", inventory, 200);
  assert.equal(storage.alarm, 100 + LOCAL_BASKET_TTL_MS);

  const expiredOnRead = await readOwnerLocalBasketInventory(
    storage,
    "owner",
    100 + LOCAL_BASKET_TTL_MS,
  );
  assert.deepEqual(expiredOnRead.baskets, [second.value.basket]);
  assert.equal(storage.alarm, 200 + LOCAL_BASKET_TTL_MS);

  const expiredOnWrite = await writeOwnerLocalBasketInventory(
    storage,
    "owner",
    expiredOnRead,
    200 + LOCAL_BASKET_TTL_MS,
  );
  assert.deepEqual(expiredOnWrite.baskets, []);
  assert.equal(storage.values.size, 0);
  assert.equal(storage.alarm, undefined);

  const alarmStorage = new FakeStorage();
  await writeOwnerLocalBasketInventory(alarmStorage, "owner", inventory, 200);
  await expireOwnerLocalBasketInventory(
    alarmStorage,
    100 + LOCAL_BASKET_TTL_MS,
  );
  assert.deepEqual(
    (
      await readOwnerLocalBasketInventory(
        alarmStorage,
        "owner",
        100 + LOCAL_BASKET_TTL_MS,
      )
    ).baskets,
    [second.value.basket],
  );
  assert.equal(alarmStorage.alarm, 200 + LOCAL_BASKET_TTL_MS);
  await expireOwnerLocalBasketInventory(
    alarmStorage,
    200 + LOCAL_BASKET_TTL_MS,
  );
  assert.equal(alarmStorage.values.size, 0);
  assert.equal(alarmStorage.alarm, undefined);
});

test("persists domain LRU tie-breaking without crossing owner inventories", async () => {
  const storage = new FakeStorage();
  let inventory = createOwnerLocalBasketInventory("owner");
  const first = create(inventory, 1, 100);
  inventory = first.inventory;
  const second = create(inventory, 2, 101);
  inventory = second.inventory;
  inventory = selectLocalBasket(
    inventory,
    "owner",
    first.value.basket.basketId,
    {
      now: () => 200,
    },
  ).inventory;
  inventory = selectLocalBasket(
    inventory,
    "owner",
    second.value.basket.basketId,
    {
      now: () => 200,
    },
  ).inventory;
  for (let value = 3; value <= MAX_LOCAL_BASKETS; value++) {
    inventory = create(inventory, value, 200).inventory;
  }
  const overflow = create(inventory, MAX_LOCAL_BASKETS + 1, 201);
  assert.equal(overflow.value.evictedBasketId, first.value.basket.basketId);

  await writeOwnerLocalBasketInventory(
    storage,
    "owner",
    overflow.inventory,
    201,
  );
  await assert.rejects(
    readOwnerLocalBasketInventory(storage, "another-owner", 201),
    /unavailable/u,
  );
  assert.equal(
    (await readOwnerLocalBasketInventory(storage, "owner", 201)).baskets.length,
    MAX_LOCAL_BASKETS,
  );
});
