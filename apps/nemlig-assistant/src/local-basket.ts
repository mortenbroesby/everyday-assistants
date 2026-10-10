import { randomUUID } from "node:crypto";
import type { ProductView } from "./product-presentation.js";

export const LOCAL_BASKET_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_LOCAL_BASKET_LINES = 500;
export const MAX_LOCAL_BASKETS = 50;

export interface LocalBasketLine {
  productId: number;
  quantity: number;
  /** Safe presentation snapshot; recovery never needs a provider lookup to render. */
  view: ProductView;
}

export interface LocalBasket {
  basketId: string;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  revision: number;
  submissionAttempted?: true;
  lines: LocalBasketLine[];
}

/** The durable object stores one of these records for each authenticated owner. */
export interface OwnerLocalBasketInventory {
  ownerId: string;
  baskets: LocalBasket[];
}

export interface LocalBasketDomainOptions {
  now?: () => number;
  createId?: () => string;
}

export interface LocalBasketMutation<T> {
  inventory: OwnerLocalBasketInventory;
  value: T;
}

export class LocalBasketNotFoundError extends Error {
  override readonly name = "LocalBasketNotFoundError";
  readonly code = "LOCAL_BASKET_NOT_FOUND";

  constructor() {
    super("Local basket is unavailable.");
  }
}

class LocalBasketConflictError extends Error {
  override readonly name = "LocalBasketConflictError";
  readonly code = "LOCAL_BASKET_CONFLICT";

  constructor() {
    super("Local basket changed during product lookup. Refresh and try again.");
  }
}

type LocalBasketFailureCode =
  "LOCAL_BASKET_NOT_FOUND" | "LOCAL_BASKET_CONFLICT";

/** Read the stable own-field code preserved when a DO RPC error is reconstructed. */
export const serializedLocalBasketFailureCode = (
  error: unknown,
): LocalBasketFailureCode | undefined => {
  if (error instanceof LocalBasketNotFoundError) {
    return error.code;
  }
  if (error instanceof LocalBasketConflictError) {
    return error.code;
  }
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const { code } = error;
  return code === "LOCAL_BASKET_NOT_FOUND" || code === "LOCAL_BASKET_CONFLICT"
    ? code
    : undefined;
};

export interface CreatedLocalBasket {
  basket: LocalBasket;
  evictedBasketId?: string;
}
export interface LocalBasketSummary {
  basketId: string;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  revision: number;
  productCount: number;
  submissionAttempted: boolean;
}
export type LocalBasketCommandResult =
  LocalBasketSummary[] | LocalBasket | CreatedLocalBasket | string | undefined;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const validPositiveInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;

const viewMatchesProduct = (view: ProductView, productId: number): boolean =>
  view.status === "complete"
    ? view.product.id === productId
    : view.product_id === productId;

const cloneBasket = (basket: LocalBasket): LocalBasket => ({
  ...basket,
  lines: basket.lines.map((line) => structuredClone(line)),
});

const assertOwner = (
  inventory: OwnerLocalBasketInventory,
  ownerId: string,
): void => {
  if (!ownerId || inventory.ownerId !== ownerId) {
    throw new Error("Local basket is unavailable.");
  }
};

const assertBasketId = (basketId: string): void => {
  if (!UUID.test(basketId)) {
    throw new Error("Local basket identifier is invalid.");
  }
};

const nowFrom = (options: LocalBasketDomainOptions): number => {
  const now = (options.now ?? Date.now)();
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error("Local basket clock is invalid.");
  }
  return now;
};

const mergeLines = (
  existingLines: readonly LocalBasketLine[],
  additions: readonly LocalBasketLine[],
): LocalBasketLine[] => {
  const lines = new Map(
    existingLines.map((line) => [line.productId, structuredClone(line)]),
  );
  for (const line of additions) {
    const existing = lines.get(line.productId);
    const quantity = (existing?.quantity ?? 0) + line.quantity;
    if (!validPositiveInteger(quantity)) {
      throw new Error("Product quantity exceeds the supported range.");
    }
    lines.set(line.productId, {
      ...structuredClone(existing ?? line),
      quantity,
    });
  }
  if (lines.size > MAX_LOCAL_BASKET_LINES) {
    throw new Error(
      `A Local basket can contain at most ${MAX_LOCAL_BASKET_LINES} product lines.`,
    );
  }
  return [...lines.values()].map((line) => structuredClone(line));
};

const normalizeLines = (
  lines: readonly LocalBasketLine[],
): LocalBasketLine[] => {
  if (!lines.length) {
    throw new Error(
      "Provide at least one exact product with a positive quantity.",
    );
  }
  for (const line of lines) {
    if (
      !validPositiveInteger(line.productId) ||
      !validPositiveInteger(line.quantity) ||
      !viewMatchesProduct(line.view, line.productId)
    ) {
      throw new Error(
        "Products, snapshots, and quantities must be exact positive values.",
      );
    }
  }
  return mergeLines([], lines);
};

const withoutExpired = (
  inventory: OwnerLocalBasketInventory,
  now: number,
): OwnerLocalBasketInventory => ({
  ...inventory,
  baskets: inventory.baskets
    .filter((basket) => basket.expiresAt > now)
    .map(cloneBasket),
});

const basketAt = (
  inventory: OwnerLocalBasketInventory,
  basketId: string,
): LocalBasket => {
  assertBasketId(basketId);
  const basket = inventory.baskets.find(
    (candidate) => candidate.basketId === basketId,
  );
  if (!basket) {
    throw new LocalBasketNotFoundError();
  }
  return basket;
};

const replaceBasket = (
  inventory: OwnerLocalBasketInventory,
  replacement: LocalBasket,
): OwnerLocalBasketInventory => ({
  ...inventory,
  baskets: inventory.baskets.map((basket) =>
    basket.basketId === replacement.basketId
      ? cloneBasket(replacement)
      : cloneBasket(basket),
  ),
});

const oldestBasketIndex = (baskets: readonly LocalBasket[]): number => {
  let oldest = 0;
  for (let index = 1; index < baskets.length; index++) {
    const candidate = baskets[index]!;
    const current = baskets[oldest]!;
    if (
      candidate.lastActivityAt < current.lastActivityAt ||
      (candidate.lastActivityAt === current.lastActivityAt &&
        candidate.createdAt < current.createdAt)
    ) {
      oldest = index;
    }
  }
  return oldest;
};

export const createOwnerLocalBasketInventory = (
  ownerId: string,
): OwnerLocalBasketInventory => {
  if (!ownerId) {
    throw new Error("Local basket owner is invalid.");
  }
  return { ownerId, baskets: [] };
};

export const listLocalBaskets = (
  inventory: OwnerLocalBasketInventory,
  ownerId: string,
  options: LocalBasketDomainOptions = {},
): LocalBasketMutation<LocalBasket[]> => {
  assertOwner(inventory, ownerId);
  const active = withoutExpired(inventory, nowFrom(options));
  return { inventory: active, value: active.baskets.map(cloneBasket) };
};

export const readLocalBasket = (
  inventory: OwnerLocalBasketInventory,
  ownerId: string,
  basketId: string,
  options: LocalBasketDomainOptions = {},
): LocalBasketMutation<LocalBasket> => {
  assertOwner(inventory, ownerId);
  const active = withoutExpired(inventory, nowFrom(options));
  return { inventory: active, value: cloneBasket(basketAt(active, basketId)) };
};

export const createLocalBasket = (
  inventory: OwnerLocalBasketInventory,
  ownerId: string,
  lines: readonly LocalBasketLine[],
  options: LocalBasketDomainOptions = {},
): LocalBasketMutation<CreatedLocalBasket> => {
  assertOwner(inventory, ownerId);
  const now = nowFrom(options);
  const normalized = normalizeLines(lines);
  const basketId = (options.createId ?? randomUUID)();
  assertBasketId(basketId);
  const active = withoutExpired(inventory, now);
  if (active.baskets.some((basket) => basket.basketId === basketId)) {
    throw new Error("Local basket identifier already exists.");
  }
  const basket: LocalBasket = {
    basketId,
    createdAt: now,
    lastActivityAt: now,
    expiresAt: now + LOCAL_BASKET_TTL_MS,
    revision: 0,
    lines: normalized,
  };
  const baskets = [...active.baskets, basket];
  let evictedBasketId: string | undefined;
  if (baskets.length > MAX_LOCAL_BASKETS) {
    const oldest = baskets.splice(oldestBasketIndex(baskets), 1)[0]!;
    evictedBasketId = oldest.basketId;
  }
  return {
    inventory: { ...active, baskets: baskets.map(cloneBasket) },
    value: { basket: cloneBasket(basket), evictedBasketId },
  };
};

const refresh = (basket: LocalBasket, now: number): LocalBasket => ({
  ...cloneBasket(basket),
  lastActivityAt: now,
  expiresAt: now + LOCAL_BASKET_TTL_MS,
  revision: basket.revision + 1,
});

const refreshActivity = (basket: LocalBasket, now: number): LocalBasket => ({
  ...cloneBasket(basket),
  lastActivityAt: now,
  expiresAt: now + LOCAL_BASKET_TTL_MS,
});

/** Explicit selection is intentional activity; passive reads are not. */
export const selectLocalBasket = (
  inventory: OwnerLocalBasketInventory,
  ownerId: string,
  basketId: string,
  options: LocalBasketDomainOptions = {},
): LocalBasketMutation<LocalBasket> => {
  assertOwner(inventory, ownerId);
  const now = nowFrom(options);
  const active = withoutExpired(inventory, now);
  const selected = refreshActivity(basketAt(active, basketId), now);
  return {
    inventory: replaceBasket(active, selected),
    value: cloneBasket(selected),
  };
};

export const appendLocalBasketLines = (
  inventory: OwnerLocalBasketInventory,
  ownerId: string,
  basketId: string,
  lines: readonly LocalBasketLine[],
  options: LocalBasketDomainOptions = {},
): LocalBasketMutation<LocalBasket> => {
  assertOwner(inventory, ownerId);
  const now = nowFrom(options);
  const active = withoutExpired(inventory, now);
  const current = basketAt(active, basketId);
  const additions = normalizeLines(lines);
  const updated = refresh(
    {
      ...current,
      lines: mergeLines(current.lines, additions),
    },
    now,
  );
  return {
    inventory: replaceBasket(active, updated),
    value: cloneBasket(updated),
  };
};

export type LocalBasketEdit =
  | { kind: "append"; lines: LocalBasketLine[] }
  | { kind: "quantity"; productId: number; quantity: number }
  | { kind: "replace"; productId: number; line: LocalBasketLine }
  | { kind: "remove"; productIds: number[] }
  | { kind: "attempt-submission" }
  | { kind: "complete-submission" };

const basketLineAt = (
  basket: LocalBasket,
  productId: number,
): LocalBasketLine => {
  const line = basket.lines.find((item) => item.productId === productId);
  if (!line) {
    throw new Error("Exact product is not in this Local basket.");
  }
  return line;
};

// Keep the exhaustive product-edit cases together after the lifecycle guards.
// fallow-ignore-next-line complexity
const applyBasketEdit = (
  current: LocalBasket,
  edit: LocalBasketEdit,
): LocalBasket | undefined => {
  const updated = cloneBasket(current);
  switch (edit.kind) {
    case "append":
      updated.lines = mergeLines(current.lines, normalizeLines(edit.lines));
      break;
    case "quantity": {
      if (!validPositiveInteger(edit.quantity)) {
        throw new Error("Quantity must be a positive integer.");
      }
      basketLineAt(updated, edit.productId).quantity = edit.quantity;
      break;
    }
    case "replace": {
      basketLineAt(updated, edit.productId);
      if (
        updated.lines.some((item) => item.productId === edit.line.productId)
      ) {
        throw new Error("Replacement product already exists.");
      }
      updated.lines = mergeLines(
        updated.lines.filter((item) => item.productId !== edit.productId),
        [edit.line],
      );
      break;
    }
    case "remove":
      if (
        !edit.productIds.length ||
        new Set(edit.productIds).size !== edit.productIds.length
      ) {
        throw new Error("Select unique exact products.");
      }
      updated.lines = updated.lines.filter(
        (line) => !edit.productIds.includes(line.productId),
      );
      break;
    case "attempt-submission":
      updated.submissionAttempted = true;
      break;
    case "complete-submission":
      return undefined;
  }
  return updated;
};

export const editLocalBasket = (
  inventory: OwnerLocalBasketInventory,
  ownerId: string,
  basketId: string,
  edit: LocalBasketEdit,
  options: LocalBasketDomainOptions = {},
): LocalBasketMutation<LocalBasket | undefined> => {
  assertOwner(inventory, ownerId);
  const now = nowFrom(options);
  const active = withoutExpired(inventory, now);
  const current = basketAt(active, basketId);
  if (edit.kind === "complete-submission" && !current.submissionAttempted) {
    throw new Error(
      "Inspect the Nemlig basket before closing this Local basket.",
    );
  }
  if (current.submissionAttempted && edit.kind !== "complete-submission") {
    throw new Error(
      "Inspect the Nemlig basket before changing this Local basket.",
    );
  }
  const edited = applyBasketEdit(current, edit);
  if (!edited) {
    return {
      inventory: {
        ...active,
        baskets: active.baskets.filter((item) => item.basketId !== basketId),
      },
      value: undefined,
    };
  }
  const updated = refresh(edited, now);
  return {
    inventory: replaceBasket(active, updated),
    value: cloneBasket(updated),
  };
};

const deleteLocalBasket = (
  inventory: OwnerLocalBasketInventory,
  ownerId: string,
  basketId: string,
  options: LocalBasketDomainOptions = {},
): LocalBasketMutation<undefined> => {
  assertOwner(inventory, ownerId);
  const active = withoutExpired(inventory, nowFrom(options));
  basketAt(active, basketId);
  return {
    inventory: {
      ...active,
      baskets: active.baskets.filter((basket) => basket.basketId !== basketId),
    },
    value: undefined,
  };
};

const heartbeatLocalBasket = (
  inventory: OwnerLocalBasketInventory,
  ownerId: string,
  basketId: string,
  options: LocalBasketDomainOptions = {},
): LocalBasketMutation<LocalBasket> =>
  selectLocalBasket(inventory, ownerId, basketId, options);

export type LocalBasketCommand =
  | { kind: "list" }
  | { kind: "selection"; selectionKey: string }
  | { kind: "read"; basketId: string }
  | { kind: "create"; lines: LocalBasketLine[]; selectionKey?: string }
  | { kind: "select" | "heartbeat"; basketId: string; selectionKey?: string }
  | { kind: "delete"; basketId: string }
  | {
      kind: "edit";
      basketId: string;
      edit: LocalBasketEdit;
      expectedRevision?: number;
    };

export const applyLocalBasketCommand = (
  inventory: OwnerLocalBasketInventory,
  ownerId: string,
  command: LocalBasketCommand,
  options: LocalBasketDomainOptions = {},
): LocalBasketMutation<LocalBasketCommandResult> => {
  switch (command.kind) {
    case "list": {
      const active = listLocalBaskets(inventory, ownerId, options);
      return {
        inventory: active.inventory,
        value: active.value.map(
          ({ lines, submissionAttempted, ...basket }) => ({
            ...basket,
            productCount: lines.length,
            submissionAttempted: submissionAttempted === true,
          }),
        ),
      };
    }
    case "selection":
      return { inventory, value: undefined };
    case "read":
      return readLocalBasket(inventory, ownerId, command.basketId, options);
    case "create":
      return createLocalBasket(inventory, ownerId, command.lines, options);
    case "select":
      return selectLocalBasket(inventory, ownerId, command.basketId, options);
    case "heartbeat":
      return heartbeatLocalBasket(
        inventory,
        ownerId,
        command.basketId,
        options,
      );
    case "delete":
      return deleteLocalBasket(inventory, ownerId, command.basketId, options);
    case "edit": {
      const current = readLocalBasket(
        inventory,
        ownerId,
        command.basketId,
        options,
      ).value;
      if (
        command.expectedRevision !== undefined &&
        command.edit.kind !== "complete-submission" &&
        command.expectedRevision !== current.revision
      ) {
        throw new LocalBasketConflictError();
      }
      return editLocalBasket(
        inventory,
        ownerId,
        command.basketId,
        command.edit,
        options,
      );
    }
  }
};
