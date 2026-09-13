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
