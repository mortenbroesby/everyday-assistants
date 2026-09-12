import { Cause, Effect, Exit, Option } from "effect";
import { NemligError, type Basket, type Product } from "./client.js";

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

const abortReason = (signal: AbortSignal): unknown => signal.reason ?? new DOMException("Product discovery was cancelled.", "AbortError");

const waitForAbort = (signal: AbortSignal): Effect.Effect<never, unknown> => Effect.async((resume) => {
  const abort = () => resume(Effect.fail(abortReason(signal)));
  if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  return Effect.sync(() => signal.removeEventListener("abort", abort));
});

/** Waits for an abort-aware Promise to settle when Effect interrupts its fiber. */
const settledRead = <T>(operation: (signal: AbortSignal) => Promise<T>): Effect.Effect<T, unknown> => Effect.async((resume, signal) => {
  const settled = Promise.resolve().then(() => operation(signal));
  settled.then((value) => resume(Effect.succeed(value)), (error: unknown) => resume(Effect.fail(error)));
  return Effect.promise(() => settled.then(() => undefined, () => undefined));
});

const discoveryRead = (client: ProductDiscoveryClient, retrieval: CatalogueRetrieval): Effect.Effect<Discovery, unknown> =>
  settledRead((signal) => readCatalogue(client, retrieval, signal)).pipe(
    Effect.map((products) => ({ products, unavailable: false }) satisfies Discovery),
    Effect.catchAll((error) => isAuthenticationFailure(error) ? Effect.fail(error) : Effect.succeed(unavailable)),
  );

/** Coordinates the request-local read lifetime while domain logic stays in plain TypeScript. */
export async function resolveProductDiscovery(
  client: ProductDiscoveryClient,
  retrievals: readonly CatalogueRetrieval[],
  options: ProductDiscoveryOptions = {},
): Promise<ProductDiscoveryResult> {
  if (options.signal?.aborted) throw abortReason(options.signal);
  if (options.deadlineMs !== undefined && (!Number.isFinite(options.deadlineMs) || options.deadlineMs <= 0)) {
    throw new RangeError("Product discovery deadline must be a positive finite number.");
  }
  const { unique, positions } = uniqueCatalogueRetrievals(retrievals);
  const program = Effect.all({
    basket: settledRead((signal) => client.getCart(signal)),
    uniqueDiscoveries: Effect.forEach(unique, (retrieval) => discoveryRead(client, retrieval), { concurrency: 3 }),
  }, { concurrency: "unbounded" });
  const timed = options.deadlineMs === undefined ? program : program.pipe(Effect.timeoutFail({
    duration: options.deadlineMs,
    onTimeout: () => new PlanningDeadlineError(),
  }));
  const scoped = options.signal === undefined ? timed : Effect.raceFirst(timed, waitForAbort(options.signal));
  const exit = await Effect.runPromiseExit(scoped);
  if (!Exit.isSuccess(exit)) {
    const failure = Cause.failureOption(exit.cause);
    throw (Option.isSome(failure) ? failure.value : Cause.squash(exit.cause));
  }
  return { basket: exit.value.basket, discoveries: positions.map((position) => exit.value.uniqueDiscoveries[position]!) };
}
