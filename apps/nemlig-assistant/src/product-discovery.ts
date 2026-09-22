import { Effect } from "effect";
import { NemligError, type Basket, type Product } from "./client.js";
import { createReadScope, runAbortableEffect, type SettledRead } from "./read-coordination.js";

export interface ProductDiscoveryClient {
  searchProducts(query: string, limit?: number, signal?: AbortSignal): Promise<Product[]>;
  getProduct(productId: number, signal?: AbortSignal): Promise<Product>;
  getCart(signal?: AbortSignal): Promise<Basket>;
}

export type CatalogueRetrieval =
  | { readonly kind: "search"; readonly query: string; readonly limit: number }
  | { readonly kind: "product"; readonly productId: number };

export interface ProductDiscoveryOptions {
  readonly signal?: AbortSignal;
  readonly deadlineMs?: number;
}

export interface DetailedProductSearchOptions extends ProductDiscoveryOptions {
  readonly concurrency?: number;
}

export type DetailedProductSearchItem =
  | { readonly status: "hydrated"; readonly productId: number; readonly product: Product }
  | { readonly status: "unavailable"; readonly productId: number }
  | { readonly status: "invalid"; readonly productId: undefined };

export interface DetailedProductSearchResult {
  readonly query: string;
  readonly items: ReadonlyArray<DetailedProductSearchItem>;
}

export interface ProductDiscoveryResult {
  readonly basket: Basket;
  readonly discoveries: ReadonlyArray<{ readonly products: Product[]; readonly unavailable: boolean }>;
}

/**
 * A request-local key. Inputs have already passed the planning schema, so this
 * intentionally preserves case, accents, and internal whitespace.
 */
export const catalogueRetrievalKey = (retrieval: CatalogueRetrieval): string =>
  retrieval.kind === "search"
    ? JSON.stringify(["search", retrieval.query.trim(), retrieval.limit])
    : JSON.stringify(["product", retrieval.productId]);

export const isAuthenticationFailure = (error: unknown): boolean => error instanceof NemligError && error.status === 401;
type Discovery = { readonly products: Product[]; readonly unavailable: boolean };
const unavailable: Discovery = { products: [], unavailable: true };

const detailedSearchRead = (
  client: ProductDiscoveryClient,
  productId: number,
  read: SettledRead,
): Effect.Effect<DetailedProductSearchItem, unknown> => read(async (signal) => {
  const product = await client.getProduct(productId, signal);
  if (product.id !== productId) throw new Error("Exact product identity did not match the search result.");
  return { status: "hydrated", productId, product } satisfies DetailedProductSearchItem;
}).pipe(
  Effect.catchAll((error) => isAuthenticationFailure(error)
    ? Effect.fail(error)
    : Effect.succeed({ status: "unavailable", productId } satisfies DetailedProductSearchItem)),
);

/**
 * Hydrates the ordered result set returned by catalogue search.
 * Shallow search rows are never returned as successful products: each
 * addressable row is either exactly resolved or explicitly unavailable.
 */
export async function resolveDetailedProductSearch(
  client: ProductDiscoveryClient,
  query: string,
  limit?: number,
  options: DetailedProductSearchOptions = {},
): Promise<DetailedProductSearchResult> {
  if (!query.trim()) throw new NemligError("Search query is required.");
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new NemligError("Search limit must be positive.");
  const concurrency = options.concurrency ?? 3;
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError("Read concurrency must be a positive integer.");
  if (options.deadlineMs !== undefined && (!Number.isFinite(options.deadlineMs) || options.deadlineMs <= 0)) {
    throw new RangeError("Product discovery deadline must be a positive finite number.");
  }

  const shallow = await client.searchProducts(query, limit, options.signal);
  const uniqueIds: number[] = [];
  const seenIds = new Set<number>();
  for (const candidate of shallow) {
    if (candidate.id === undefined || seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);
    uniqueIds.push(candidate.id);
  }

  const reads = createReadScope();
  const program = Effect.forEach(uniqueIds, (productId) => detailedSearchRead(client, productId, reads.read), { concurrency });
  const timed = options.deadlineMs === undefined ? program : program.pipe(Effect.timeoutFail({
    duration: options.deadlineMs,
    onTimeout: () => new PlanningDeadlineError(),
  }));
  try {
    const hydrated = await runAbortableEffect(timed, options.signal);
    const byId = new Map(hydrated.map((item) => [item.productId, item]));
    const emitted = new Set<number>();
    const items: DetailedProductSearchItem[] = [];
    for (const candidate of shallow) {
      if (candidate.id === undefined) {
        items.push({ status: "invalid", productId: undefined });
        continue;
      }
      if (emitted.has(candidate.id)) continue;
      emitted.add(candidate.id);
      items.push(byId.get(candidate.id)!);
    }
    return { query, items };
  } finally {
    await reads.awaitQuiescence();
  }
}

export const readCatalogue = (client: ProductDiscoveryClient, retrieval: CatalogueRetrieval, signal?: AbortSignal): Promise<Product[]> =>
  retrieval.kind === "search"
    ? client.searchProducts(retrieval.query, retrieval.limit, signal)
    : client.getProduct(retrieval.productId, signal).then((product) => [product]);

export const uniqueCatalogueRetrievals = (retrievals: readonly CatalogueRetrieval[]) => {
  const indexes = new Map<string, number>();
  const unique: CatalogueRetrieval[] = [];
  const positions = retrievals.map((retrieval) => {
    const key = catalogueRetrievalKey(retrieval);
    const existing = indexes.get(key);
    if (existing !== undefined) return existing;
    const index = unique.length;
    indexes.set(key, index);
    unique.push(retrieval);
    return index;
  });
  return { unique, positions };
};

export class PlanningDeadlineError extends Error {
  constructor() {
    super("Product discovery deadline expired.");
    this.name = "PlanningDeadlineError";
  }
}

const discoveryRead = (client: ProductDiscoveryClient, retrieval: CatalogueRetrieval, read: SettledRead): Effect.Effect<Discovery, unknown> =>
  read((signal) => readCatalogue(client, retrieval, signal)).pipe(
    Effect.map((products) => ({ products, unavailable: false }) satisfies Discovery),
    Effect.catchAll((error) => isAuthenticationFailure(error) ? Effect.fail(error) : Effect.succeed(unavailable)),
  );

/** Coordinates the request-local read lifetime while domain logic stays in plain TypeScript. */
export async function resolveProductDiscovery(
  client: ProductDiscoveryClient,
  retrievals: readonly CatalogueRetrieval[],
  options: ProductDiscoveryOptions = {},
): Promise<ProductDiscoveryResult> {
  if (options.deadlineMs !== undefined && (!Number.isFinite(options.deadlineMs) || options.deadlineMs <= 0)) {
    throw new RangeError("Product discovery deadline must be a positive finite number.");
  }
  const { unique, positions } = uniqueCatalogueRetrievals(retrievals);
  const reads = createReadScope();
  const program = Effect.all({
    basket: reads.read((signal) => client.getCart(signal)),
    uniqueDiscoveries: Effect.forEach(unique, (retrieval) => discoveryRead(client, retrieval, reads.read), { concurrency: 3 }),
  }, { concurrency: "unbounded" });
  const timed = options.deadlineMs === undefined ? program : program.pipe(Effect.timeoutFail({
    duration: options.deadlineMs,
    onTimeout: () => new PlanningDeadlineError(),
  }));
  try {
    const result = await runAbortableEffect(timed, options.signal);
    return { basket: result.basket, discoveries: positions.map((position) => result.uniqueDiscoveries[position]!) };
  } finally {
    await reads.awaitQuiescence();
  }
}
