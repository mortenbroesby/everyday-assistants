import {
  applyLocalBasketCommand,
  LocalBasketOperationCapacityError,
  LocalBasketNotFoundError,
  type LocalBasket,
  type LocalBasketCommand,
  type LocalBasketLine,
  type OwnerLocalBasketInventory,
  type ReviewOperation,
} from "./local-basket.js";

const INDEX_KEY = "owner-local-basket-index";
const REVIEW_OPERATION_INDEX_KEY = "owner-review-operation-index";
const REVIEW_OPERATION_RETENTION_MS = 2 * 60 * 60 * 1000;
const PENDING_SAVE_RETENTION_MS = 24 * 60 * 60 * 1000;
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
interface OwnerReviewOperations {
  ownerId: string;
  operations: ReviewOperation[];
}

const sameReviewItems = (
  left: ReviewOperation["items"],
  right: ReviewOperation["items"],
): boolean =>
  JSON.stringify([...left].sort((a, b) => a.productId - b.productId)) ===
  JSON.stringify([...right].sort((a, b) => a.productId - b.productId));

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
    if (
      command.kind === "review-operation-read" ||
      command.kind === "review-operation-claim" ||
      command.kind === "review-operation-release" ||
      command.kind === "review-operation-write" ||
      command.kind === "review-operation-complete"
    ) {
      const index = await transaction.get<OwnerReviewOperations>(
        REVIEW_OPERATION_INDEX_KEY,
      );
      if (index && index.ownerId !== ownerId) {
        throw new Error("Review operation is unavailable.");
      }
      const operations = (index?.operations ?? [])
        .map((operation) =>
          operation.kind === "save" &&
          !operation.createAttempted &&
          operation.listId === undefined &&
          operation.createdAt === undefined
            ? { ...operation, createdAt: now }
            : operation,
        )
        .filter((operation) => {
          if (operation.completedUntil !== undefined) {
            return operation.completedUntil > now;
          }
          // A claimed create may have reached Nemlig without returning its list ID.
          return !(
            operation.kind === "save" &&
            !operation.createAttempted &&
            operation.listId === undefined &&
            operation.createdAt !== undefined &&
            operation.createdAt + PENDING_SAVE_RETENTION_MS <= now
          );
        });
      if (
        index &&
        JSON.stringify(operations) !== JSON.stringify(index.operations)
      ) {
        if (operations.length) {
          await transaction.put(REVIEW_OPERATION_INDEX_KEY, {
            ownerId,
            operations,
          });
        } else {
          await transaction.delete(REVIEW_OPERATION_INDEX_KEY);
        }
      }
      if (command.kind === "review-operation-claim") {
        const current = operations.find(
          ({ operationId }) => operationId === command.operationId,
        );
        if (
          !current ||
          current.generation !== command.generation ||
          current.completed ||
          (current.kind === "submit"
            ? current.dispatchAttempted
            : current.createAttempted)
        ) {
          return false;
        }
        const updated = operations.map((operation) =>
          operation.operationId === command.operationId
            ? operation.kind === "submit"
              ? { ...operation, dispatchAttempted: true }
              : { ...operation, createAttempted: true }
            : operation,
        );
        await transaction.put(REVIEW_OPERATION_INDEX_KEY, {
          ownerId,
          operations: updated,
        });
        return true;
      }
      if (command.kind === "review-operation-release") {
        const current = operations.find(
          ({ operationId }) => operationId === command.operationId,
        );
        if (
          !current ||
          current.kind !== "submit" ||
          current.generation !== command.generation ||
          current.completed
        ) {
          return false;
        }
        const updated = operations.filter(
          ({ operationId }) => operationId !== command.operationId,
        );
        if (updated.length) {
          await transaction.put(REVIEW_OPERATION_INDEX_KEY, {
            ownerId,
            operations: updated,
          });
        } else {
          await transaction.delete(REVIEW_OPERATION_INDEX_KEY);
        }
        return true;
      }
      if (command.kind === "review-operation-read") {
        return structuredClone(
          operations.find(
            ({ operationId }) => operationId === command.operationId,
          ),
        );
      }
      if (command.kind === "review-operation-complete") {
        const current = operations.find(
          ({ operationId }) => operationId === command.operationId,
        );
        if (current && current.generation !== command.generation) {
          return false;
        }
        if (current) {
          const completed =
            current.kind === "submit"
              ? { ...current, completed: true }
              : {
                  ...current,
                  completedUntil: now + REVIEW_OPERATION_RETENTION_MS,
                };
          const updated = operations.map((operation) =>
            operation.operationId === command.operationId
              ? completed
              : operation,
          );
          await transaction.put(REVIEW_OPERATION_INDEX_KEY, {
            ownerId,
            operations: updated,
          });
        }
        return Boolean(current);
      }
      const operation = command.operation;
      const current = operations.find(
        ({ operationId }) => operationId === operation.operationId,
      );
      if (
        current?.kind === "save" &&
        current.completedUntil !== undefined &&
        operation.kind === "save" &&
        current.generation === operation.generation
      ) {
        throw new Error("A completed shopping-list save cannot be resumed.");
      }
      const sameCompletedSubmission =
        current?.kind === "submit" &&
        current.completed === true &&
        operation.kind === "submit" &&
        current.accountIdentity === operation.accountIdentity &&
        current.listId === operation.listId &&
        sameReviewItems(current.items, operation.items);
      const replaceCompleted =
        (current?.completed === true ||
          current?.completedUntil !== undefined ||
          (current?.kind === "submit" && !current.dispatchAttempted)) &&
        operation.generation !== current.generation &&
        !sameCompletedSubmission;
      if (
        current &&
        !replaceCompleted &&
        (current.accountIdentity !== operation.accountIdentity ||
          current.generation !== operation.generation ||
          current.kind !== operation.kind ||
          current.name !== operation.name ||
          JSON.stringify(current.items) !== JSON.stringify(operation.items) ||
          JSON.stringify(current.baseline) !==
            JSON.stringify(operation.baseline) ||
          (current.listId !== undefined &&
            operation.listId !== undefined &&
            current.listId !== operation.listId))
      ) {
        throw new Error(
          "A different shopping-list operation is already pending.",
        );
      }
      const merged = current
        ? replaceCompleted
          ? { ...operation, createdAt: operation.createdAt ?? now }
          : {
              ...operation,
              createdAt: current.createdAt ?? operation.createdAt ?? now,
              createAttempted:
                current.createAttempted || operation.createAttempted,
              dispatchAttempted:
                current.dispatchAttempted || operation.dispatchAttempted,
              completed: current.completed || operation.completed,
              ...(current.listId !== undefined
                ? { listId: current.listId }
                : {}),
              ...(current.progress && operation.progress
                ? {
                    progress: {
                      completed: Math.max(
                        current.progress.completed,
                        operation.progress.completed,
                      ),
                      total: operation.progress.total,
                    },
                  }
                : current.progress && !operation.progress
                  ? { progress: current.progress }
                  : {}),
              ...(current.completedUntil !== undefined
                ? { completedUntil: current.completedUntil }
                : {}),
            }
        : { ...operation, createdAt: operation.createdAt ?? now };
      const updated = [
        ...operations.filter(
          ({ operationId }) => operationId !== operation.operationId,
        ),
        merged,
      ];
      try {
        enforceValueLimit({ ownerId, operations: updated });
      } catch {
        throw new LocalBasketOperationCapacityError();
      }
      await transaction.put(REVIEW_OPERATION_INDEX_KEY, {
        ownerId,
        operations: updated,
      });
      return undefined;
    }
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
      throw new LocalBasketNotFoundError();
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
