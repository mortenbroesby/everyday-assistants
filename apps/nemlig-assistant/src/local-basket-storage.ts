import {
  LocalBasketOperationCapacityError,
  type LocalBasketCommand,
  type ReviewOperation,
} from "./local-basket.js";

const REVIEW_OPERATION_INDEX_KEY = "owner-review-operation-index";
const REVIEW_OPERATION_RETENTION_MS = 2 * 60 * 60 * 1000;
// Direct drafts are process-local: active drafts keep their own terminal guard,
// and a restarted service cannot rehydrate an old draft after this receipt expires.
const DIRECT_SUBMIT_PREFIX = "direct-basket-submit:";
const PENDING_SAVE_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_DURABLE_VALUE_BYTES = 1024 * 1024;

const isBoundedDirectReceipt = (operation: ReviewOperation): boolean =>
  operation.kind === "basket-save" ||
  (operation.kind === "submit" &&
    operation.operationId.startsWith(DIRECT_SUBMIT_PREFIX));

const normalizeReviewOperation = (
  operation: ReviewOperation,
  now: number,
): ReviewOperation => {
  if (
    isBoundedDirectReceipt(operation) &&
    operation.completed === true &&
    operation.completedUntil === undefined
  ) {
    return {
      ...operation,
      completedUntil:
        (operation.createdAt ?? now) + REVIEW_OPERATION_RETENTION_MS,
    };
  }
  if (
    operation.kind === "save" &&
    !operation.createAttempted &&
    operation.listId === undefined &&
    operation.createdAt === undefined
  ) {
    operation = { ...operation, createdAt: now };
  }
  return operation;
};

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

const enforceValueLimit = (value: unknown): void => {
  if (
    new TextEncoder().encode(JSON.stringify(value)).byteLength >
    MAX_DURABLE_VALUE_BYTES
  ) {
    throw new LocalBasketOperationCapacityError();
  }
};

const isReviewOperationCommand = (command: LocalBasketCommand): boolean =>
  command.kind === "review-operation-read" ||
  command.kind === "review-operation-claim" ||
  command.kind === "review-operation-release" ||
  command.kind === "review-operation-write" ||
  command.kind === "review-operation-complete";

export const mutateOwnerLocalBasketInventory = async (
  storage: LocalBasketInventoryStorage,
  ownerId: string,
  command: LocalBasketCommand,
  now = Date.now(),
): Promise<unknown> => {
  if (!isReviewOperationCommand(command)) {
    throw new Error("Unsupported local basket command.");
  }
  // Keep journal pruning, claim fencing, and receipt writes atomic in one transaction.
  // fallow-ignore-next-line complexity
  return storage.transaction(async (transaction) => {
    const index = await transaction.get<OwnerReviewOperations>(
      REVIEW_OPERATION_INDEX_KEY,
    );
    if (index && index.ownerId !== ownerId) {
      throw new Error("Review operation is unavailable.");
    }
    const operations = (index?.operations ?? [])
      .map((operation) => normalizeReviewOperation(operation, now))
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
        const completed = isBoundedDirectReceipt(current)
          ? {
              ...current,
              completed: true,
              completedUntil: now + REVIEW_OPERATION_RETENTION_MS,
            }
          : current.kind === "submit"
            ? { ...current, completed: true }
            : {
                ...current,
                completedUntil: now + REVIEW_OPERATION_RETENTION_MS,
              };
        const updated = operations.map((operation) =>
          operation.operationId === command.operationId ? completed : operation,
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
    const completedBasketSave =
      current?.kind === "basket-save" &&
      current.completed === true &&
      operation.kind === "basket-save";
    const replaceCompleted =
      (current?.completed === true ||
        current?.completedUntil !== undefined ||
        (current?.kind === "submit" && !current.dispatchAttempted)) &&
      !completedBasketSave &&
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
            ...(current.listId !== undefined ? { listId: current.listId } : {}),
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
  });
};

/** Legacy basket alarms intentionally leave old records untouched. */
export const expireOwnerLocalBasketInventory = async (
  _storage: LocalBasketInventoryStorage,
  _now = Date.now(),
): Promise<void> => {};
