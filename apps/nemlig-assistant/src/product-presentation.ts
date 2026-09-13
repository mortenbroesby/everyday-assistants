import type { Product } from "./client.js";
import { safePickerImageUrl } from "./picker/contract.js";

export interface ProductCandidate {
  id: number | undefined;
  name: string | undefined;
  price: number | undefined;
  unit_price: number | undefined;
  unit_size: string | undefined;
  description?: string;
  details?: Array<{ key: string; value: string }>;
  brand: string | undefined;
  available: boolean;
  is_organic: boolean;
  is_frozen: boolean;
  is_on_discount: boolean;
  image_url: string | undefined;
  tags: string[];
}

export function rankProducts(products: Product[], query: string): ProductCandidate[] {
  const candidates = products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    unit_price: product.unitPrice,
    unit_size: product.unitSize || undefined,
    ...(product.description ? { description: product.description } : {}),
    ...(product.details?.length ? { details: product.details } : {}),
    brand: product.brand || undefined,
    available: product.available,
    is_organic: product.isOrganic,
    is_frozen: product.isFrozen,
    is_on_discount: product.isOnDiscount,
    image_url: safePickerImageUrl(product.imageUrl),
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
