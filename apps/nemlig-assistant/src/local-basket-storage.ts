import {
  applyLocalBasketCommand,
  type LocalBasket,
  type LocalBasketCommand,
  type LocalBasketLine,
  type OwnerLocalBasketInventory,
} from "./local-basket.js";

const INDEX_KEY = "owner-local-basket-index";
const MAX_DURABLE_VALUE_BYTES = 1024 * 1024;

export interface LocalBasketStorageAccess {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<unknown>;
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}
export interface LocalBasketInventoryStorage extends LocalBasketStorageAccess {
  transaction<T>(
    action: (storage: LocalBasketStorageAccess) => Promise<T>,
  ): Promise<T>;
}

interface StoredBasket extends Omit<LocalBasket, "lines"> {
  productIds: number[];
}
interface OwnerBasketIndex {
  ownerId: string;
  baskets: StoredBasket[];
}

const lineKey = (basketId: string, productId: number): string =>
  `line:${basketId}:${productId}`;
const earliestExpiry = (inventory: OwnerBasketIndex): number =>
  Math.min(...inventory.baskets.map((basket) => basket.expiresAt));
const writeIndex = async (
  storage: LocalBasketStorageAccess,
  index: OwnerBasketIndex,
  previous?: OwnerBasketIndex,
): Promise<void> => {
  if (!index.baskets.length) {
    await storage.delete(INDEX_KEY);
    await storage.deleteAlarm();
    return;
  }
  enforceValueLimit(index);
  if (!previous || JSON.stringify(previous) !== JSON.stringify(index)) {
    await storage.put(INDEX_KEY, index);
  }
  await storage.setAlarm(earliestExpiry(index));
};

const enforceValueLimit = (value: unknown): void => {
  if (
    new TextEncoder().encode(JSON.stringify(value)).byteLength >
    MAX_DURABLE_VALUE_BYTES
  ) {
    throw new Error("Local basket record exceeds the durable storage limit.");
  }
};

const readIndex = async (
  storage: LocalBasketStorageAccess,
  ownerId: string,
): Promise<OwnerBasketIndex> => {
  const index = await storage.get<OwnerBasketIndex>(INDEX_KEY);
  if (!index) {
    return { ownerId, baskets: [] };
  }
  if (index.ownerId !== ownerId || !Array.isArray(index.baskets)) {
    throw new Error("Local basket is unavailable.");
  }
  return index;
};

const pruneExpired = async (
  storage: LocalBasketStorageAccess,
  index: OwnerBasketIndex,
  now: number,
): Promise<OwnerBasketIndex> => {
  const expired = index.baskets.filter((basket) => basket.expiresAt <= now);
  const active = index.baskets.filter((basket) => basket.expiresAt > now);
  if (expired.length) {
    await Promise.all(
      expired.flatMap((basket) =>
        basket.productIds.map((productId) =>
          storage.delete(lineKey(basket.basketId, productId)),
        ),
      ),
    );
    const next = { ...index, baskets: active };
    await writeIndex(storage, next);
    return next;
  }
  if (!active.length) {
    await storage.deleteAlarm();
  }
  return index;
};

const loadBasket = async (
  storage: LocalBasketStorageAccess,
  basket: StoredBasket,
): Promise<LocalBasket> => {
  const lines = await Promise.all(
    basket.productIds.map((productId) =>
      storage.get<LocalBasketLine>(lineKey(basket.basketId, productId)),
    ),
  );
  if (lines.some((line) => !line)) {
    throw new Error("Local basket storage is incomplete.");
  }
  const { productIds: _productIds, ...metadata } = basket;
  return { ...metadata, lines: lines as LocalBasketLine[] };
};

const saveBasket = async (
  storage: LocalBasketStorageAccess,
  index: OwnerBasketIndex,
  previous: StoredBasket | undefined,
  basket: LocalBasket | undefined,
): Promise<void> => {
  if (previous) {
    const nextIds = new Set(basket?.lines.map((line) => line.productId) ?? []);
    await Promise.all(
      previous.productIds
        .filter((productId) => !nextIds.has(productId))
        .map((productId) =>
          storage.delete(lineKey(previous.basketId, productId)),
        ),
    );
  }
  if (basket) {
    for (const line of basket.lines) {
      enforceValueLimit(line);
      await storage.put(lineKey(basket.basketId, line.productId), line);
    }
    const { lines, ...metadata } = basket;
    const record = {
      ...metadata,
      productIds: lines.map((line) => line.productId),
    };
    const nextBaskets = index.baskets.filter(
      (candidate) => candidate.basketId !== basket.basketId,
    );
    nextBaskets.push(record);
    await writeIndex(storage, { ...index, baskets: nextBaskets });
  } else {
    const nextBaskets = previous
      ? index.baskets.filter(
          (candidate) => candidate.basketId !== previous.basketId,
        )
      : index.baskets;
    await writeIndex(storage, { ...index, baskets: nextBaskets });
  }
};

export const mutateOwnerLocalBasketInventory = async (
  storage: LocalBasketInventoryStorage,
  ownerId: string,
  command: LocalBasketCommand,
  now = Date.now(),
): Promise<unknown> => {
  return storage.transaction(async (transaction) => {
    let index = await readIndex(transaction, ownerId);
    index = await pruneExpired(transaction, index, now);
    if (command.kind === "list") {
      return index.baskets.map(({ productIds, ...basket }) => ({
        ...basket,
        productCount: productIds.length,
        submissionAttempted: basket.submissionAttempted === true,
      }));
    }
    if (command.kind === "create") {
      const inventory: OwnerLocalBasketInventory = {
        ownerId,
        baskets: index.baskets.map(
          ({ productIds: _productIds, ...basket }) => ({
            ...basket,
            lines: [],
          }),
        ),
      };
      const mutation = applyLocalBasketCommand(inventory, ownerId, command, {
        now: () => now,
      });
      const created = mutation.value as {
        basket: LocalBasket;
        evictedBasketId?: string;
      };
      const evicted = created.evictedBasketId
        ? index.baskets.find(
            (basket) => basket.basketId === created.evictedBasketId,
          )
        : undefined;
      if (evicted) {
        await Promise.all(
          evicted.productIds.map((productId) =>
            transaction.delete(lineKey(evicted.basketId, productId)),
          ),
        );
      }
      const baskets = index.baskets.filter(
        (basket) => basket.basketId !== created.evictedBasketId,
      );
      await saveBasket(
        transaction,
        { ...index, baskets },
        undefined,
        created.basket,
      );
      return created;
    }
    const existing = index.baskets.find(
      (basket) => basket.basketId === command.basketId,
    );
    if (!existing) {
      throw new Error("Local basket is unavailable.");
    }
    if (command.kind === "delete") {
      await Promise.all(
        existing.productIds.map((productId) =>
          transaction.delete(lineKey(existing.basketId, productId)),
        ),
      );
      index = {
        ...index,
        baskets: index.baskets.filter(
          (basket) => basket.basketId !== existing.basketId,
        ),
      };
      await writeIndex(transaction, index);
      return { basketId: existing.basketId, deleted: true };
    }
    const current = await loadBasket(transaction, existing);
    const mutation = applyLocalBasketCommand(
      { ownerId, baskets: [current] },
      ownerId,
      command,
      { now: () => now },
    );
    const updated = mutation.inventory.baskets[0];
    await saveBasket(transaction, index, existing, updated);
    if (
      command.kind === "edit" &&
      command.edit.kind === "complete-submission"
    ) {
      return { basketId: existing.basketId, deleted: true };
    }
    return mutation.value;
  });
};

export const expireOwnerLocalBasketInventory = async (
  storage: LocalBasketInventoryStorage,
  now = Date.now(),
): Promise<void> => {
  await storage.transaction(async (transaction) => {
    const index = await transaction.get<OwnerBasketIndex>(INDEX_KEY);
    if (!index) {
      return transaction.deleteAlarm();
    }
    await pruneExpired(transaction, index, now);
  });
};
