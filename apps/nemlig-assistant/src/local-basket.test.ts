import assert from "node:assert/strict";
import test from "node:test";
import {
  appendLocalBasketLines,
  applyLocalBasketCommand,
  createLocalBasket,
  createOwnerLocalBasketInventory,
  editLocalBasket,
  listLocalBaskets,
  LOCAL_BASKET_TTL_MS,
  MAX_LOCAL_BASKET_LINES,
  MAX_LOCAL_BASKETS,
  readLocalBasket,
  selectLocalBasket,
  type LocalBasketDomainOptions,
  type OwnerLocalBasketInventory,
} from "./local-basket.js";

const id = (value: number): string =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

class FakeClock {
  constructor(private value = 0) {}

  now = (): number => this.value;

  set(value: number): void {
    this.value = value;
  }
}

const options = (
  clock: FakeClock,
  nextId: () => string,
): LocalBasketDomainOptions => ({ now: clock.now, createId: nextId });

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

const create = (
  inventory: OwnerLocalBasketInventory,
  clock: FakeClock,
  value: number,
  lines = [line(value, 1)],
) =>
  createLocalBasket(
    inventory,
    "owner",
    lines,
    options(clock, () => id(value)),
  );

test("creates owner-scoped UUID baskets with complete product lines", () => {
  const clock = new FakeClock(100);
  const created = create(createOwnerLocalBasketInventory("owner"), clock, 1, [
    line(7, 2),
  ]);

  assert.match(created.value.basket.basketId, /^[0-9a-f-]{36}$/iu);
  assert.deepEqual(created.value.basket.lines, [line(7, 2)]);
  assert.equal(created.value.basket.createdAt, 100);
  assert.equal(created.value.basket.lastActivityAt, 100);
  assert.equal(created.value.basket.expiresAt, 100 + LOCAL_BASKET_TTL_MS);
  assert.throws(
    () =>
      readLocalBasket(
        created.inventory,
        "another-owner",
        created.value.basket.basketId,
        { now: clock.now },
      ),
    /unavailable/u,
  );
});

test("rejects malformed generated UUIDs without creating a basket", () => {
  const clock = new FakeClock();
  const inventory = createOwnerLocalBasketInventory("owner");
  assert.throws(
    () =>
      createLocalBasket(inventory, "owner", [line(1, 1)], {
        now: clock.now,
        createId: () => "not-a-uuid",
      }),
    /identifier is invalid/u,
  );
  assert.deepEqual(inventory.baskets, []);
});

test("rejects a product snapshot that does not identify its exact line", () => {
  const inventory = createOwnerLocalBasketInventory("owner");
  const mismatched = line(2, 1);
  mismatched.productId = 1;

  assert.throws(
    () => createLocalBasket(inventory, "owner", [mismatched]),
    /snapshots/u,
  );
  assert.deepEqual(inventory.baskets, []);
});

test("appends exact product IDs by quantity while retaining distinct products", () => {
  const clock = new FakeClock(10);
  const created = create(createOwnerLocalBasketInventory("owner"), clock, 1, [
    line(1, 2),
  ]);
  clock.set(20);
  const updated = appendLocalBasketLines(
    created.inventory,
    "owner",
    created.value.basket.basketId,
    [line(1, 3), line(2, 1)],
    { now: clock.now },
  );

  assert.deepEqual(updated.value.lines, [line(1, 5), line(2, 1)]);
  assert.equal(updated.value.lastActivityAt, 20);
  assert.equal(updated.value.expiresAt, 20 + LOCAL_BASKET_TTL_MS);
  assert.deepEqual(created.value.basket.lines, [line(1, 2)]);
});

test("rejects a 501st distinct line atomically", () => {
  const clock = new FakeClock();
  const lines = Array.from({ length: MAX_LOCAL_BASKET_LINES }, (_, index) =>
    line(index + 1, 1),
  );
  const created = create(
    createOwnerLocalBasketInventory("owner"),
    clock,
    1,
    lines,
  );
  const before = structuredClone(created.inventory);

  assert.throws(
    () =>
      appendLocalBasketLines(
        created.inventory,
        "owner",
        created.value.basket.basketId,
        [line(MAX_LOCAL_BASKET_LINES + 1, 1)],
        { now: clock.now },
      ),
    /at most 500/u,
  );
  assert.deepEqual(created.inventory, before);
});

test("uses last activity and then creation time for capacity eviction", () => {
  const clock = new FakeClock();
  let inventory = createOwnerLocalBasketInventory("owner");
  const created: string[] = [];
  for (let value = 1; value <= MAX_LOCAL_BASKETS; value++) {
    clock.set(value);
    const result = create(inventory, clock, value);
    inventory = result.inventory;
    created.push(result.value.basket.basketId);
  }
  clock.set(MAX_LOCAL_BASKETS + 1);
  inventory = selectLocalBasket(inventory, "owner", created[0]!, {
    now: clock.now,
  }).inventory;
  clock.set(MAX_LOCAL_BASKETS + 2);
  const overflow = create(inventory, clock, MAX_LOCAL_BASKETS + 1);

  assert.equal(overflow.value.evictedBasketId, created[1]);
  assert.equal(overflow.inventory.baskets.length, MAX_LOCAL_BASKETS);
  assert.ok(
    overflow.inventory.baskets.some((basket) => basket.basketId === created[0]),
  );

  const tieClock = new FakeClock(100);
  let tieInventory = createOwnerLocalBasketInventory("owner");
  const first = create(tieInventory, tieClock, 1000);
  tieInventory = first.inventory;
  tieClock.set(101);
  const second = create(tieInventory, tieClock, 1001);
  tieInventory = second.inventory;
  tieClock.set(200);
  tieInventory = selectLocalBasket(
    tieInventory,
    "owner",
    first.value.basket.basketId,
    { now: tieClock.now },
  ).inventory;
  tieInventory = selectLocalBasket(
    tieInventory,
    "owner",
    second.value.basket.basketId,
    { now: tieClock.now },
  ).inventory;
  for (let value = 1002; value < 1050; value++) {
    tieInventory = create(tieInventory, tieClock, value).inventory;
  }
  const tiedOverflow = create(tieInventory, tieClock, 1050);
  assert.equal(tiedOverflow.value.evictedBasketId, first.value.basket.basketId);
});

test("uses sliding one-day expiry only for intentional activity", () => {
  const clock = new FakeClock(1_000);
  const created = create(createOwnerLocalBasketInventory("owner"), clock, 1);
  const basketId = created.value.basket.basketId;

  clock.set(1_000 + LOCAL_BASKET_TTL_MS - 1);
  const passive = readLocalBasket(created.inventory, "owner", basketId, {
    now: clock.now,
  });
  assert.equal(passive.value.expiresAt, 1_000 + LOCAL_BASKET_TTL_MS);

  const selected = selectLocalBasket(passive.inventory, "owner", basketId, {
    now: clock.now,
  });
  assert.equal(selected.value.expiresAt, clock.now() + LOCAL_BASKET_TTL_MS);

  clock.set(1_000 + LOCAL_BASKET_TTL_MS);
  assert.equal(
    listLocalBaskets(selected.inventory, "owner", { now: clock.now }).value
      .length,
    1,
  );
  clock.set(selected.value.expiresAt);
  const expired = listLocalBaskets(selected.inventory, "owner", {
    now: clock.now,
  });
  assert.deepEqual(expired.value, []);
  assert.throws(
    () =>
      readLocalBasket(expired.inventory, "owner", basketId, {
        now: clock.now,
      }),
    /unavailable/u,
  );
  assert.throws(
    () =>
      selectLocalBasket(expired.inventory, "owner", basketId, {
        now: clock.now,
      }),
    /unavailable/u,
  );
});

test("preserves same-owner inventory across a credential reconnect without crossing owners", () => {
  const clock = new FakeClock();
  const created = create(createOwnerLocalBasketInventory("owner"), clock, 1);
  const recoveredAfterReconnect = structuredClone(created.inventory);

  assert.deepEqual(
    listLocalBaskets(recoveredAfterReconnect, "owner", { now: clock.now })
      .value,
    [created.value.basket],
  );
  assert.throws(
    () =>
      listLocalBaskets(recoveredAfterReconnect, "other-owner", {
        now: clock.now,
      }),
    /unavailable/u,
  );
});

test("submission fence survives edits and only terminally closes a fenced basket", () => {
  const start = createLocalBasket(
    createOwnerLocalBasketInventory("owner"),
    "owner",
    [line(1, 1)],
    { now: () => 100, createId: () => id(1) },
  );
  const fenced = editLocalBasket(
    start.inventory,
    "owner",
    id(1),
    { kind: "attempt-submission" },
    { now: () => 200 },
  );
  assert.equal(fenced.value?.submissionAttempted, true);
  assert.throws(
    () =>
      editLocalBasket(
        fenced.inventory,
        "owner",
        id(1),
        {
          kind: "quantity",
          productId: 1,
          quantity: 2,
        },
        { now: () => 201 },
      ),
    /Inspect the Nemlig basket/u,
  );
  assert.throws(
    () =>
      editLocalBasket(
        start.inventory,
        "owner",
        id(1),
        {
          kind: "complete-submission",
        },
        { now: () => 200 },
      ),
    /Inspect the Nemlig basket/u,
  );
  const closed = editLocalBasket(
    fenced.inventory,
    "owner",
    id(1),
    { kind: "complete-submission" },
    { now: () => 300 },
  );
  assert.equal(closed.value, undefined);
  assert.deepEqual(closed.inventory.baskets, []);
});

test("stale asynchronous product work fails without persisting its append", () => {
  const start = createLocalBasket(
    createOwnerLocalBasketInventory("owner"),
    "owner",
    [line(1, 1)],
    { now: () => 100, createId: () => id(1) },
  );
  const edited = selectLocalBasket(start.inventory, "owner", id(1), {
    now: () => 101,
  });
  assert.throws(
    () =>
      applyLocalBasketCommand(
        edited.inventory,
        "owner",
        {
          kind: "edit",
          basketId: id(1),
          expectedRevision: 0,
          edit: { kind: "append", lines: [line(2, 1)] },
        },
        { now: () => 102 },
      ),
    /changed during product lookup/u,
  );
  assert.deepEqual(
    edited.inventory.baskets[0]?.lines.map(({ productId }) => productId),
    [1],
  );
});
