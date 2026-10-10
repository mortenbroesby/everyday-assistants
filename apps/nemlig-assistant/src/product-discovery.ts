import { Effect } from "effect";
import type { Product } from "./client.js";
import type { ProductDiscoveryEvent } from "./cloudflare-observability.js";
import { NemligError } from "./nemlig-error.js";
import {
  createReadScope,
  runAbortableEffect,
  type SettledRead,
} from "./read-coordination.js";

export interface ProductDiscoveryClient {
  searchProducts(
    query: string,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<Product[]>;
  getProduct(productId: number, signal?: AbortSignal): Promise<Product>;
}

export interface ProductDiscoveryOptions {
  readonly signal?: AbortSignal;
  readonly deadlineMs?: number;
}

export interface DetailedProductSearchOptions extends ProductDiscoveryOptions {
  readonly concurrency?: number;
  readonly onDiagnostic?: (event: ProductDiscoveryDiagnostic) => void;
}

export type ProductDiscoveryDiagnostic = {
  readonly stage: ProductDiscoveryEvent["stage"];
  readonly errorClass: ProductDiscoveryEvent["error_class"];
  /** Aggregate active detail reads across this MCP process, not this chat. */
  readonly activeReadCount: number;
};

let activeProviderReads = 0;

export type DetailedProductSearchItem =
  | {
      readonly status: "hydrated";
      readonly productId: number;
      readonly product: Product;
    }
  | { readonly status: "unavailable"; readonly productId: number }
  | { readonly status: "invalid"; readonly productId: undefined };

export interface DetailedProductSearchResult {
  readonly query: string;
  readonly items: ReadonlyArray<DetailedProductSearchItem>;
}

export const isAuthenticationFailure = (error: unknown): boolean =>
  error instanceof NemligError && error.status === 401;

const diagnosticErrorClass = (
  error: unknown,
  signal?: AbortSignal,
): ProductDiscoveryDiagnostic["errorClass"] => {
  if (isAuthenticationFailure(error)) {
    return "authentication";
  }
  if (error instanceof ProductDiscoveryDeadlineError) {
    return "deadline";
  }
  if (
    error === signal?.reason ||
    (error instanceof DOMException && error.name === "AbortError")
  ) {
    return "cancelled";
  }
  return error instanceof NemligError ? "provider" : "unknown";
};

/** Diagnostics are optional observability; they must not change read behavior. */
const emitDiagnostic = (
  callback: DetailedProductSearchOptions["onDiagnostic"],
  event: ProductDiscoveryDiagnostic,
): void => {
  try {
    callback?.(event);
  } catch {
    // A diagnostic sink must never replace the provider result.
  }
};

const diagnosticStage = (
  error: unknown,
  signal?: AbortSignal,
): ProductDiscoveryDiagnostic["stage"] => {
  const errorClass = diagnosticErrorClass(error, signal);
  if (errorClass === "deadline") {
    return "deadline";
  }
  return errorClass === "cancelled" ? "cancelled" : "detail";
};

const emitShallowDiagnostic = (
  options: DetailedProductSearchOptions,
  error: unknown,
): void => {
  const errorClass = diagnosticErrorClass(error, options.signal);
  emitDiagnostic(options.onDiagnostic, {
    stage:
      errorClass === "deadline"
        ? "deadline"
        : errorClass === "cancelled"
          ? "cancelled"
          : "shallow",
    errorClass,
    activeReadCount: activeProviderReads,
  });
};

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
  options: Pick<DetailedProductSearchOptions, "onDiagnostic">,
): Effect.Effect<DetailedProductSearchItem, unknown> =>
  read(async (signal) => {
    activeProviderReads += 1;
    try {
      const product = await client.getProduct(productId, signal);
      if (product.id !== productId) {
        throw new Error(
          "Exact product identity did not match the search result.",
        );
      }
      return {
        status: "hydrated",
        productId,
        product,
      } satisfies DetailedProductSearchItem;
    } catch (error) {
      if (!signal.aborted) {
        emitDiagnostic(options.onDiagnostic, {
          stage: diagnosticStage(error, signal),
          errorClass: diagnosticErrorClass(error, signal),
          activeReadCount: activeProviderReads,
        });
      }
      throw error;
    } finally {
      activeProviderReads -= 1;
    }
  }).pipe(
    Effect.catchAll((error) =>
      isAuthenticationFailure(error)
        ? Effect.fail(error)
        : Effect.succeed({
            status: "unavailable",
            productId,
          } satisfies DetailedProductSearchItem),
    ),
  );

const searchShallow = async (
  client: ProductDiscoveryClient,
  query: string,
  limit: number | undefined,
  options: DetailedProductSearchOptions,
): Promise<Product[]> => {
  activeProviderReads += 1;
  try {
    return await client.searchProducts(query, limit, options.signal);
  } catch (error) {
    emitShallowDiagnostic(options, error);
    throw error;
  } finally {
    activeProviderReads -= 1;
  }
};

const uniqueProductIds = (products: readonly Product[]): number[] => {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const product of products) {
    if (product.id !== undefined && !seen.has(product.id)) {
      seen.add(product.id);
      ids.push(product.id);
    }
  }
  return ids;
};

const orderedItems = (
  shallow: readonly Product[],
  hydrated: readonly DetailedProductSearchItem[],
): DetailedProductSearchItem[] => {
  const byId = new Map(hydrated.map((item) => [item.productId, item]));
  const emitted = new Set<number>();
  const items: DetailedProductSearchItem[] = [];
  for (const product of shallow) {
    if (product.id === undefined) {
      items.push({ status: "invalid", productId: undefined });
    } else if (!emitted.has(product.id)) {
      emitted.add(product.id);
      items.push(byId.get(product.id)!);
    }
  }
  return items;
};

const hydrateDetails = async (
  client: ProductDiscoveryClient,
  productIds: readonly number[],
  options: DetailedProductSearchOptions,
): Promise<readonly DetailedProductSearchItem[]> => {
  const reads = createReadScope();
  const program = Effect.forEach(
    productIds,
    (productId) => detailedSearchRead(client, productId, reads.read, options),
    { concurrency: options.concurrency },
  );
  const timed =
    options.deadlineMs === undefined
      ? program
      : program.pipe(
          Effect.timeoutFail({
            duration: options.deadlineMs,
            onTimeout: () => new ProductDiscoveryDeadlineError(),
          }),
        );
  try {
    return await runAbortableEffect(timed, options.signal);
  } catch (error) {
    const errorClass = diagnosticErrorClass(error, options.signal);
    if (errorClass === "deadline" || errorClass === "cancelled") {
      emitDiagnostic(options.onDiagnostic, {
        stage: errorClass === "deadline" ? "deadline" : "cancelled",
        errorClass,
        activeReadCount: activeProviderReads,
      });
    }
    throw error;
  } finally {
    await reads.awaitQuiescence();
  }
};

/** Hydrate provider-selected search results without discarding returned rows. */
export async function resolveDetailedProductSearch(
  client: ProductDiscoveryClient,
  query: string,
  limit?: number,
  options: DetailedProductSearchOptions = {},
): Promise<DetailedProductSearchResult> {
  if (!query.trim()) {
    throw new NemligError("Search query is required.");
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new NemligError("Search limit must be positive.");
  }
  const concurrency = options.concurrency ?? 3;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("Read concurrency must be a positive integer.");
  }
  if (
    options.deadlineMs !== undefined &&
    (!Number.isFinite(options.deadlineMs) || options.deadlineMs <= 0)
  ) {
    throw new RangeError(
      "Product discovery deadline must be a positive finite number.",
    );
  }

  const shallow = await searchShallow(client, query, limit, options);
  const productIds = uniqueProductIds(shallow);
  const hydrated = await hydrateDetails(client, productIds, {
    ...options,
    concurrency,
  });
  return { query, items: orderedItems(shallow, hydrated) };
}
