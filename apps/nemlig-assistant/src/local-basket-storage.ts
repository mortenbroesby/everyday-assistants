import {
  createOwnerLocalBasketInventory,
  listLocalBaskets,
  type OwnerLocalBasketInventory,
} from "./local-basket.js";

const INVENTORY_KEY = "owner-local-basket-inventory";

export interface LocalBasketInventoryStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<unknown>;
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

const earliestExpiry = (inventory: OwnerLocalBasketInventory): number =>
  Math.min(...inventory.baskets.map((basket) => basket.expiresAt));

const persist = async (
  storage: LocalBasketInventoryStorage,
  inventory: OwnerLocalBasketInventory,
): Promise<void> => {
  if (!inventory.baskets.length) {
    await storage.delete(INVENTORY_KEY);
    await storage.deleteAlarm();
    return;
  }
  await storage.put(INVENTORY_KEY, inventory);
  await storage.setAlarm(earliestExpiry(inventory));
};

const activeInventory = (
  inventory: OwnerLocalBasketInventory | undefined,
  ownerId: string,
  now: number,
): OwnerLocalBasketInventory =>
  listLocalBaskets(
    inventory ?? createOwnerLocalBasketInventory(ownerId),
    ownerId,
    { now: () => now },
  ).inventory;

/**
 * The Durable Object identity is derived from the authenticated owner by the
 * Worker. This record adds a second owner check before returning stored data.
 */
export const readOwnerLocalBasketInventory = async (
  storage: LocalBasketInventoryStorage,
  ownerId: string,
  now = Date.now(),
): Promise<OwnerLocalBasketInventory> => {
  const inventory = activeInventory(
    await storage.get<OwnerLocalBasketInventory>(INVENTORY_KEY),
    ownerId,
    now,
  );
  await persist(storage, inventory);
  return inventory;
};

export const writeOwnerLocalBasketInventory = async (
  storage: LocalBasketInventoryStorage,
  ownerId: string,
  inventory: OwnerLocalBasketInventory,
  now = Date.now(),
): Promise<OwnerLocalBasketInventory> => {
  const active = activeInventory(inventory, ownerId, now);
  await persist(storage, active);
  return active;
};

export const expireOwnerLocalBasketInventory = async (
  storage: LocalBasketInventoryStorage,
  now = Date.now(),
): Promise<void> => {
  const inventory = await storage.get<OwnerLocalBasketInventory>(INVENTORY_KEY);
  if (!inventory) {
    await storage.deleteAlarm();
    return;
  }
  await persist(storage, activeInventory(inventory, inventory.ownerId, now));
};
