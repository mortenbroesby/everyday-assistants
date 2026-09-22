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
  unit: string | undefined;
  unit_size: string | undefined;
  category?: string;
  subcategory?: string;
  currency: "DKK";
  description?: string;
  declaration?: string;
  details?: Array<{ key: string; value: string }>;
  brand: string | undefined;
  available: boolean | undefined;
  is_organic: boolean | undefined;
  is_frozen: boolean | undefined;
  is_on_discount: boolean | undefined;
  image_url: string | undefined;
  labels: string[];
  tags: string[];
}

export interface ProductSummaryFacts {
  readonly id?: number;
  readonly name?: string;
  readonly price?: number;
  readonly unit_price?: number;
  readonly unit?: string;
  readonly unit_size?: string;
  readonly category?: string;
  readonly subcategory?: string;
  readonly quantity?: number;
  readonly line_total?: number;
  readonly available?: boolean;
  readonly labels?: readonly string[];
  readonly is_organic?: boolean;
  readonly is_frozen?: boolean;
  readonly is_on_discount?: boolean;
}

export type ProductViewContext =
  | { readonly kind: "search" | "details" | "result" }
  | { readonly kind: "basket"; readonly quantity?: number; readonly line_total?: number }
  | { readonly kind: "review"; readonly quantity?: number; readonly line_total?: number; readonly approved: boolean };

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
  void query;
  const candidates = products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    unit_price: product.unitPrice,
    unit: product.unit || undefined,
    unit_size: product.unitSize || undefined,
    category: product.category || undefined,
    subcategory: product.subcategory || undefined,
    currency: "DKK" as const,
    ...(product.description ? { description: product.description } : {}),
    ...(product.declaration ? { declaration: product.declaration } : {}),
    ...(product.details?.length ? { details: product.details } : {}),
    brand: product.brand || undefined,
    available: product.available,
    is_organic: product.isOrganic || product.labels.some((label) => label.toLocaleLowerCase("da-DK").includes("øko")),
    is_frozen: product.isFrozen,
    is_on_discount: product.isOnDiscount,
    image_url: safeNemligImageUrl(product.imageUrl),
    labels: [...product.labels],
    tags: [] as string[],
  }));
  return candidates.map((product) => ({
    ...product,
    tags: product.is_organic ? [...product.tags, "organic"] : product.tags,
  }));
}

/** Adapts facts already present in basket/review output; it never fetches details. */
export function createProductViewFromSummary(
  facts: ProductSummaryFacts,
  context: Extract<ProductViewContext, { readonly kind: "basket" | "review" }>,
): ProductView {
  const product: ProductCandidate = {
    id: facts.id,
    name: facts.name,
    price: facts.price,
    unit_price: facts.unit_price,
    unit: facts.unit,
    unit_size: facts.unit_size,
    category: facts.category,
    subcategory: facts.subcategory,
    currency: "DKK",
    brand: undefined,
    available: facts.available,
    is_organic: facts.is_organic === true || facts.labels?.some((label) => label.toLocaleLowerCase("da-DK").includes("øko")) ? true : facts.is_organic,
    is_frozen: facts.is_frozen,
    is_on_discount: facts.is_on_discount ?? (facts.labels?.some((label) => label.toLocaleLowerCase("da-DK").includes("tilbud")) || undefined),
    image_url: undefined,
    labels: [...(facts.labels ?? [])],
    tags: (facts.is_organic ?? facts.labels?.some((label) => label.toLocaleLowerCase("da-DK").includes("øko"))) ? ["organic"] : [],
  };
  return {
    context: context.kind,
    status: "complete",
    product,
    ...(context.kind === "basket" ? { basket: { kind: context.kind, quantity: facts.quantity ?? context.quantity, line_total: facts.line_total ?? context.line_total } } : {}),
    ...(context.kind === "review" ? { review: context } : {}),
  };
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
