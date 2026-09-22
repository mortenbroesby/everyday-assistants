import { Effect } from "effect";
import { NemligError, type Product } from "./client.js";
import { createReadScope, runAbortableEffect, type SettledRead } from "./read-coordination.js";

export interface ProductDiscoveryClient {
  searchProducts(query: string, limit?: number, signal?: AbortSignal): Promise<Product[]>;
  getProduct(productId: number, signal?: AbortSignal): Promise<Product>;
}

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

export const isAuthenticationFailure = (error: unknown): boolean => error instanceof NemligError && error.status === 401;

export class ProductDiscoveryDeadlineError extends Error {
  constructor() {
    super("Product discovery deadline expired.");
    this.name = "ProductDiscoveryDeadlineError";
  }
}

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

/** Hydrate provider-selected search results without discarding returned rows. */
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
    onTimeout: () => new ProductDiscoveryDeadlineError(),
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
