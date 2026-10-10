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
  selections?: Record<string, string>;
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

const withSelection = (
  index: OwnerBasketIndex,
  selectionKey: string,
  basketId: string | undefined,
): OwnerBasketIndex => {
  const selections = { ...index.selections };
  if (basketId) {
    selections[selectionKey] = basketId;
    const keys = Object.keys(selections);
    for (const expiredKey of keys.slice(0, Math.max(0, keys.length - 1_000))) {
      delete selections[expiredKey];
    }
  } else {
    delete selections[selectionKey];
  }
  return { ...index, selections };
};

const removeDeletedBasketSelections = (
  index: OwnerBasketIndex,
  basketIds: ReadonlySet<string>,
): OwnerBasketIndex => {
  const selections = Object.fromEntries(
    Object.entries(index.selections ?? {}).filter(
      ([, basketId]) => !basketIds.has(basketId),
    ),
  );
  return { ...index, selections };
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
    const next = removeDeletedBasketSelections(
      { ...index, baskets: active },
      new Set(expired.map((basket) => basket.basketId)),
    );
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
  previousLines: readonly LocalBasketLine[] = [],
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
    const previousById = new Map(
      previousLines.map((line) => [line.productId, line]),
    );
    for (const line of basket.lines) {
      if (
        JSON.stringify(previousById.get(line.productId)) !==
        JSON.stringify(line)
      ) {
        enforceValueLimit(line);
        await storage.put(lineKey(basket.basketId, line.productId), line);
      }
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
    const nextIndex = previous
      ? removeDeletedBasketSelections(
          { ...index, baskets: nextBaskets },
          new Set([previous.basketId]),
        )
      : { ...index, baskets: nextBaskets };
    await writeIndex(storage, nextIndex);
  }
};

const readSelection = async (
  transaction: LocalBasketStorageAccess,
  index: OwnerBasketIndex,
  selectionKey: string,
): Promise<string | undefined> => {
  const selectedId = index.selections?.[selectionKey];
  if (
    !selectedId ||
    !index.baskets.some((item) => item.basketId === selectedId)
  ) {
    if (selectedId) {
      index = withSelection(index, selectionKey, undefined);
      await writeIndex(transaction, index);
    }
    return undefined;
  }
  return selectedId;
};

const createStoredBasket = async (
  transaction: LocalBasketStorageAccess,
  index: OwnerBasketIndex,
  command: Extract<LocalBasketCommand, { kind: "create" }>,
  now: number,
): Promise<unknown> => {
  const ownerId = index.ownerId;
  const inventory: OwnerLocalBasketInventory = {
    ownerId,
    baskets: index.baskets.map(({ productIds: _productIds, ...basket }) => ({
      ...basket,
      lines: [],
    })),
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
  if (command.selectionKey) {
    const nextIndex = await readIndex(transaction, ownerId);
    await writeIndex(
      transaction,
      withSelection(nextIndex, command.selectionKey, created.basket.basketId),
    );
  }
  return created;
};

export const mutateOwnerLocalBasketInventory = async (
  storage: LocalBasketInventoryStorage,
  ownerId: string,
  command: LocalBasketCommand,
  now = Date.now(),
): Promise<unknown> => {
  // Dispatch stays inside one transaction so cleanup and record edits cannot partially persist.
  // fallow-ignore-next-line complexity
  return storage.transaction(async (transaction) => {
    let index = await readIndex(transaction, ownerId);
    index = await pruneExpired(transaction, index, now);
    if (command.kind === "selection") {
      return readSelection(transaction, index, command.selectionKey);
    }
    if (command.kind === "list") {
      return index.baskets.map(({ productIds, ...basket }) => ({
        ...basket,
        productCount: productIds.length,
        submissionAttempted: basket.submissionAttempted === true,
      }));
    }
    if (command.kind === "create") {
      return createStoredBasket(transaction, index, command, now);
    }
    const existing = index.baskets.find(
      (basket) => basket.basketId === command.basketId,
    );
    if (!existing) {
      throw new Error("Local basket is unavailable.");
    }
    if (command.kind === "delete") {
      await saveBasket(transaction, index, existing, undefined);
      return { basketId: existing.basketId, deleted: true };
    }
    const current = await loadBasket(transaction, existing);
    if (command.kind === "read") {
      return current;
    }
    const mutation = applyLocalBasketCommand(
      { ownerId, baskets: [current] },
      ownerId,
      command,
      { now: () => now },
    );
    const updated = mutation.inventory.baskets[0];
    await saveBasket(transaction, index, existing, updated, current.lines);
    if (
      (command.kind === "select" || command.kind === "heartbeat") &&
      command.selectionKey
    ) {
      const nextIndex = await readIndex(transaction, ownerId);
      await writeIndex(
        transaction,
        withSelection(nextIndex, command.selectionKey, existing.basketId),
      );
    }
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
