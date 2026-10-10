import { randomUUID } from "node:crypto";

export const LOCAL_BASKET_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_LOCAL_BASKET_LINES = 500;
export const MAX_LOCAL_BASKETS = 50;

export interface LocalBasketLine {
  productId: number;
  quantity: number;
}

export interface LocalBasket {
  basketId: string;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
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

export interface CreatedLocalBasket {
  basket: LocalBasket;
  evictedBasketId?: string;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const validPositiveInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;

const cloneBasket = (basket: LocalBasket): LocalBasket => ({
  ...basket,
  lines: basket.lines.map((line) => ({ ...line })),
});

const cloneInventory = (
  inventory: OwnerLocalBasketInventory,
): OwnerLocalBasketInventory => ({
  ...inventory,
  baskets: inventory.baskets.map(cloneBasket),
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

const normalizeLines = (
  lines: readonly LocalBasketLine[],
): LocalBasketLine[] => {
  if (!lines.length) {
    throw new Error(
      "Provide at least one exact product with a positive quantity.",
    );
  }
  const quantities = new Map<number, number>();
  for (const line of lines) {
    if (
      !validPositiveInteger(line.productId) ||
      !validPositiveInteger(line.quantity)
    ) {
      throw new Error(
        "Products and quantities must be positive safe integers.",
      );
    }
    const quantity = (quantities.get(line.productId) ?? 0) + line.quantity;
    if (!validPositiveInteger(quantity)) {
      throw new Error("Product quantity exceeds the supported range.");
    }
    quantities.set(line.productId, quantity);
  }
  if (quantities.size > MAX_LOCAL_BASKET_LINES) {
    throw new Error(
      `A Local basket can contain at most ${MAX_LOCAL_BASKET_LINES} product lines.`,
    );
  }
  return [...quantities].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
};

const withoutExpired = (
  inventory: OwnerLocalBasketInventory,
  now: number,
): OwnerLocalBasketInventory => ({
  ...cloneInventory(inventory),
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
    throw new Error("Local basket is unavailable.");
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
  const selected = refresh(basketAt(active, basketId), now);
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
  const quantities = new Map(
    current.lines.map((line) => [line.productId, line.quantity]),
  );
  for (const line of additions) {
    const quantity = (quantities.get(line.productId) ?? 0) + line.quantity;
    if (!validPositiveInteger(quantity)) {
      throw new Error("Product quantity exceeds the supported range.");
    }
    quantities.set(line.productId, quantity);
  }
  if (quantities.size > MAX_LOCAL_BASKET_LINES) {
    throw new Error(
      `A Local basket can contain at most ${MAX_LOCAL_BASKET_LINES} product lines.`,
    );
  }
  const updated = refresh(
    {
      ...current,
      lines: [...quantities].map(([productId, quantity]) => ({
        productId,
        quantity,
      })),
    },
    now,
  );
  return {
    inventory: replaceBasket(active, updated),
    value: cloneBasket(updated),
  };
};
