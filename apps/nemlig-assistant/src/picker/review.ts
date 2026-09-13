import { NemligError, type Product } from "../client.js";
import { rankProducts, type ProductCandidate } from "../product-presentation.js";
import { runReadPool } from "../read-coordination.js";
import { relevantProduct } from "../plans.js";

export interface ProposedBasketReviewItem {
  readonly ingredient: string;
  readonly search_term?: string;
  readonly product: number;
  readonly alternatives: readonly number[];
  readonly quantity: number;
  readonly confidence: number;
  readonly favorite_match: boolean;
  readonly changed?: boolean;
}

type ResolvedCandidate = ProductCandidate & { id: number };

export interface ProposedBasketReviewResult {
  readonly items: Array<{
    ingredient: string;
    search_term?: string;
    quantity: number;
    confidence: number;
    favorite_match: boolean;
    changed: boolean;
    product: ResolvedCandidate;
    alternatives: ResolvedCandidate[];
  }>;
  readonly rejected: Array<{ ingredient: string; reason: string }>;
}

export interface ProposedBasketReviewOptions {
  readonly signal?: AbortSignal;
}

export interface ProductReviewClient {
  getProduct(productId: number, signal?: AbortSignal): Promise<Product>;
}

export const uniqueReviewProductIds = (items: readonly ProposedBasketReviewItem[]): number[] => [
  ...new Set(items.flatMap(({ product, alternatives }) => [product, ...alternatives])),
];

const candidateFor = (
  product: Product | undefined,
  expectedId: number,
  ingredient: string,
): ResolvedCandidate | undefined => {
  if (product?.id !== expectedId || !relevantProduct(product, ingredient)) return undefined;
  const candidate = rankProducts([product], ingredient)[0];
  return candidate?.id === undefined ? undefined : { ...candidate, id: candidate.id };
};

const reconstructReview = (
  items: readonly ProposedBasketReviewItem[],
  products: ReadonlyMap<number, Product | undefined>,
): ProposedBasketReviewResult => {
  const resolved = items.map(({ ingredient, search_term, quantity, confidence, favorite_match, changed = false, product, alternatives }) => {
    const relevanceTerm = search_term ?? ingredient;
    const proposed = candidateFor(products.get(product), product, relevanceTerm);
    if (!proposed) return { rejected: { ingredient, reason: "No proposed product matched this ingredient." } };
    return {
      item: {
        ingredient,
        ...(search_term ? { search_term } : {}),
        quantity,
        confidence,
        favorite_match,
        changed,
        product: proposed,
        alternatives: alternatives.flatMap((id) => {
          const candidate = candidateFor(products.get(id), id, relevanceTerm);
          return candidate ? [candidate] : [];
        }),
      },
    };
  });
  return {
    items: resolved.flatMap((entry) => entry.item ? [entry.item] : []),
    rejected: resolved.flatMap((entry) => entry.rejected ? [entry.rejected] : []),
  };
};

/** Resolves exact products once per review while retaining ingredient-specific validation. */
export async function resolveProposedBasketReview(
  client: ProductReviewClient,
  items: readonly ProposedBasketReviewItem[],
  options: ProposedBasketReviewOptions = {},
): Promise<ProposedBasketReviewResult> {
  const ids = uniqueReviewProductIds(items);
  const products = await runReadPool(ids, async (id, signal) => {
    try {
      return [id, await client.getProduct(id, signal)] as const;
    } catch (error) {
      if (error instanceof NemligError && error.status === 404) return [id, undefined] as const;
      throw error;
    }
  }, options);
  return reconstructReview(items, new Map(products));
}
