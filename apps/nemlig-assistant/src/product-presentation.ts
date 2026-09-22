import type { Product } from "./client.js";
import type { DetailedProductSearchItem } from "./product-discovery.js";

export const IMAGE_ORIGINS = ["https://nemlig.com", "https://www.nemlig.com"] as const;

/** Keep provider-hosted images safe for model-visible product output. */
export const safeNemligImageUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && IMAGE_ORIGINS.includes(url.origin as typeof IMAGE_ORIGINS[number]) ? url.href : undefined;
  } catch { return undefined; }
};

export interface ProductCandidate {
  id: number | undefined;
  name: string | undefined;
  price: number | undefined;
  unit_price: number | undefined;
  unit_size: string | undefined;
  description?: string;
  declaration?: string;
  details?: Array<{ key: string; value: string }>;
  brand: string | undefined;
  available: boolean;
  is_organic: boolean;
  is_frozen: boolean;
  is_on_discount: boolean;
  image_url: string | undefined;
  tags: string[];
}

export type ProductViewContext =
  | { readonly kind: "search" | "details" | "result" }
  | { readonly kind: "basket"; readonly quantity?: number; readonly line_total?: number }
  | { readonly kind: "review"; readonly quantity: number; readonly line_total?: number; readonly approved: boolean };

export type ProductView = {
  readonly context: ProductViewContext["kind"];
  readonly status: "complete";
  readonly product: ProductCandidate;
  readonly basket?: Extract<ProductViewContext, { readonly kind: "basket" }>;
  readonly review?: Extract<ProductViewContext, { readonly kind: "review" }>;
} | {
  readonly context: ProductViewContext["kind"];
  readonly status: "unavailable";
  readonly product_id?: number;
};

export function rankProducts(products: Product[], query: string): ProductCandidate[] {
  const candidates = products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    unit_price: product.unitPrice,
    unit_size: product.unitSize || undefined,
    ...(product.description ? { description: product.description } : {}),
    ...(product.declaration ? { declaration: product.declaration } : {}),
    ...(product.details?.length ? { details: product.details } : {}),
    brand: product.brand || undefined,
    available: product.available,
    is_organic: product.isOrganic,
    is_frozen: product.isFrozen,
    is_on_discount: product.isOnDiscount,
    image_url: safeNemligImageUrl(product.imageUrl),
    tags: [] as string[],
  }));
  const available = candidates.filter((product) => product.available);
  if (available.length) {
    available.reduce((lowest, product) =>
      (product.price ?? Number.POSITIVE_INFINITY) < (lowest.price ?? Number.POSITIVE_INFINITY)
        ? product
        : lowest,
    ).tags.push("cheapest");
    const keyword = query.trim().split(/\s+/u)[0]?.toLocaleLowerCase("da-DK") ?? "";
    available.find((product) =>
      !product.is_frozen && (!keyword || product.name?.toLocaleLowerCase("da-DK").includes(keyword)),
    )?.tags.push("recommended");
  }
  return candidates.map((product) => ({
    ...product,
    tags: product.is_organic ? [...product.tags, "organic"] : product.tags,
  }));
}

/**
 * Builds the one display model used by product-bearing contexts. It only
 * projects returned data; rendering this value cannot fetch or mutate state.
 */
export function createProductView(
  item: DetailedProductSearchItem | Product,
  context: ProductViewContext,
): ProductView {
  if ("status" in item) {
    if (item.status !== "hydrated") return { context: context.kind, status: "unavailable", ...(item.productId === undefined ? {} : { product_id: item.productId }) };
    const candidate = rankProducts([item.product], item.product.name ?? "")[0];
    if (!candidate) return { context: context.kind, status: "unavailable", product_id: item.productId };
    return {
      context: context.kind,
      status: "complete",
      product: candidate,
      ...(context.kind === "basket" ? { basket: context } : {}),
      ...(context.kind === "review" ? { review: context } : {}),
    };
  }
  const candidate = rankProducts([item], item.name ?? "")[0];
  if (!candidate) return { context: context.kind, status: "unavailable" };
  return {
    context: context.kind,
    status: "complete",
    product: candidate,
    ...(context.kind === "basket" ? { basket: context } : {}),
    ...(context.kind === "review" ? { review: context } : {}),
  };
}

/** Maps a product-bearing result set without introducing UI-owned state. */
export function createProductViews(
  items: readonly (DetailedProductSearchItem | Product)[],
  context: ProductViewContext,
): ProductView[] {
  return items.map((item) => createProductView(item, context));
}
