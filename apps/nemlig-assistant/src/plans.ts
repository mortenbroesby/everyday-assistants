import { z } from "zod";
import { NemligError, type Basket, type Product } from "./client.js";
import { calculateShoppingPlan } from "./plan-calculation.js";

const constraintsSchema = z.object({
  organic: z.boolean().optional(), vegan: z.boolean().optional(), gluten_free: z.boolean().optional(),
  lactose_free: z.boolean().optional(), available: z.boolean().optional(),
  max_price: z.number().nonnegative().optional(), max_unit_price: z.number().nonnegative().optional(),
}).strict();
const preferenceSchema = z.enum(["discount", "organic", "lowest_unit_price", "non_frozen"]);
const requestedUnitSchema = z.enum(["g", "kg", "ml", "cl", "l", "stk"]);
export const shoppingPlanLineSchema = z.object({
  id: z.string().trim().min(1).max(80).describe("A short label that keeps this grocery line distinct."),
  name: z.string().trim().min(1).max(200).describe("One short Danish catalogue phrase. Translate or normalize English, mixed-language, misspelled, or over-specific wording before this call; preserve a distinctive brand and add the Danish product category, for example 'Prince biscuits' becomes 'prince kiks'."),
  quantity: z.number().int().positive().max(99).default(1).describe("How many packages you want when no requested amount is supplied."),
  requested_amount: z.number().positive().max(100_000).optional().describe("The amount the user asked for, separate from package count."),
  requested_unit: requestedUnitSchema.optional().describe("Unit for requested_amount."),
  preferred_brands: z.array(z.string().trim().min(1).max(80)).max(5).default([]).describe("Brands the user explicitly prefers for this line."),
  require_choice: z.boolean().default(false).describe("Keep materially different candidates unresolved unless an explicit preference decides them."),
  constraints: constraintsSchema.default({}).describe("Requirements that every suggested product must meet."),
  preferences: z.array(preferenceSchema).max(4).default([]).describe("Optional preferences used to rank suitable products."),
  selected_product_id: z.number().int().positive().optional(),
}).strict();
export const shoppingPlanInputSchema = z.object({
  lines: z.array(shoppingPlanLineSchema).min(1).max(50),
  mode: z.enum(["automatic", "manual"]).default("automatic"),
}).strict().superRefine((input, context) => {
  for (const [index, line] of input.lines.entries()) if ((line.requested_amount === undefined) !== (line.requested_unit === undefined)) {
    context.addIssue({ code: "custom", path: ["lines", index], message: "requested_amount and requested_unit must be supplied together." });
  }
});
export type ShoppingPlanInput = z.input<typeof shoppingPlanInputSchema>;
export type StoredShoppingPlanInput = z.output<typeof shoppingPlanInputSchema>;
type ParsedShoppingPlanLine = z.output<typeof shoppingPlanLineSchema>;
type ClarityReason = "exact_product" | "unique_candidate" | "clear_text_match" | "preferred_brand" | "amount_match" | "manual_choice" | "brand_choice" | "close_alternatives" | "no_eligible_candidate" | "discovery_unavailable" | "unavailable";
export type PlanSource = "favorite" | "catalog";

export interface PlanCandidate {
  id: number; name: string; price: number | undefined; unit_price: number | undefined;
  unit_size: string; brand: string; available: boolean; source: PlanSource;
  description?: string;
  details?: Array<{ key: string; value: string }>;
  image_url: string | undefined;
  dietary: { organic: boolean; vegan: boolean; gluten_free: boolean; lactose_free: boolean };
  is_frozen: boolean; is_on_discount: boolean; constraint_outcomes: Record<string, boolean>; tags: string[];
  relevant: boolean; preferred_brand_match: boolean;
  package_amount?: number; package_unit?: "g" | "ml" | "stk";
  required_packages?: number; covered_amount?: number; excess_amount?: number;
}

export interface ShoppingPlan {
  mode: "automatic" | "manual";
  lines: Array<{
    id: string; name: string; quantity: number; candidates: PlanCandidate[];
    resolution: "selected" | "covered" | "unresolved";
    reason?: string; clarity: "clear" | "unclear"; clarity_reason: ClarityReason;
    selected_product_id?: number; basket_quantity: number; remaining_quantity: number;
    requested_amount?: number; requested_unit?: string;
  }>;
  selected_estimated_total: number;
  summary: { total: number; covered: number; automatically_selected: number; added: 0; unresolved: number; failed: number; automatic_coverage_percent: number };
}

export interface PlanClient {
  searchProducts(query: string, limit?: number): Promise<Product[]>;
  getProduct(productId: number): Promise<Product>;
  getCart(): Promise<Basket>;
}

const outcomes = (product: Product, constraints: ParsedShoppingPlanLine["constraints"]): Record<string, boolean> => ({
  available: constraints.available === false || product.available,
  organic: constraints.organic !== true || product.isOrganic,
  vegan: constraints.vegan !== true || product.isVegan,
  gluten_free: constraints.gluten_free !== true || product.isGlutenFree,
  lactose_free: constraints.lactose_free !== true || product.isLactoseFree,
  max_price: constraints.max_price === undefined || (product.price !== undefined && product.price <= constraints.max_price),
  max_unit_price: constraints.max_unit_price === undefined || (product.unitPrice !== undefined && product.unitPrice <= constraints.max_unit_price),
});

const words = (value: string): string[] => value.toLocaleLowerCase("da-DK").normalize("NFKD").replace(/\p{M}/gu, "").match(/[a-z0-9]+/gu) ?? [];
const petWords = new Set(["kat", "katte", "kattemad", "hund", "hunde", "hundemad", "kaeledyr", "dyrefoder"]);
const quantityWords = new Set(["g", "kg", "ml", "cl", "l", "stk"]);
export const relevantProduct = (product: Product, query: string): boolean => {
  const requested = new Set(words(query).filter((word) => !quantityWords.has(word) && !/^\d+$/u.test(word)));
  if ([...requested].some((word) => petWords.has(word))) return true;
  const productWords = words(`${product.brand} ${product.category} ${product.subcategory} ${product.name}`);
  if (productWords.some((word) => petWords.has(word))) return false;
  if (requested.size === 0) return true;
  const joined = [...requested].join("");
  return productWords.includes(joined) || [...requested].every((requestedWord) => productWords.some((productWord) =>
    productWord === requestedWord || (requestedWord.length >= 5 && (productWord.startsWith(requestedWord) || requestedWord.startsWith(productWord))),
  ));
};

type BaseUnit = "g" | "ml" | "stk";
const normalizedAmount = (amount: number, unit: "g" | "kg" | "ml" | "cl" | "l" | "stk"): { amount: number; unit: BaseUnit } => {
  if (unit === "kg") return { amount: amount * 1_000, unit: "g" };
  if (unit === "cl") return { amount: amount * 10, unit: "ml" };
  if (unit === "l") return { amount: amount * 1_000, unit: "ml" };
  return { amount, unit };
};
const packageAmount = (text: string): { amount: number; unit: BaseUnit } | undefined => {
  const match = text.toLocaleLowerCase("da-DK").match(/(?<amount>\d+(?:[.,]\d+)?)\s*(?<unit>kilogram|kg|gram|g|milliliter|ml|centiliter|cl|liter|l|stk)\b/u);
  if (!match?.groups) return undefined;
  const aliases: Record<string, "g" | "kg" | "ml" | "cl" | "l" | "stk"> = { kilogram: "kg", gram: "g", milliliter: "ml", centiliter: "cl", liter: "l" };
  const unit = aliases[match.groups.unit] ?? match.groups.unit;
  return normalizedAmount(Number(match.groups.amount.replace(",", ".")), unit as "g" | "kg" | "ml" | "cl" | "l" | "stk");
};

/**
 * Returns at most five deterministically ordered candidates that meet every
 * hard constraint. The order drives automatic selection, so preferences only
 * rank eligible products and never relax a constraint.
 */
export function eligibleCandidates(
  products: Product[], source: PlanSource, constraints: ParsedShoppingPlanLine["constraints"],
  preferences: ParsedShoppingPlanLine["preferences"],
  planning: Pick<ParsedShoppingPlanLine, "name" | "requested_amount" | "requested_unit" | "preferred_brands"> = { name: "", preferred_brands: [] },
): PlanCandidate[] {
  const requestedWords = new Set(words(planning.name));
  const preferred = new Set([
    ...planning.preferred_brands.map((brand) => brand.toLocaleLowerCase("da-DK")),
    ...products.map((product) => product.brand).filter((brand) => {
      const brandWords = words(brand);
      return brandWords.length > 0 && brandWords.every((word) => requestedWords.has(word));
    }).map((brand) => brand.toLocaleLowerCase("da-DK")),
  ]);
  return products.flatMap((product) => {
    if (product.id === undefined || !product.name) return [];
    if (!relevantProduct(product, planning.name)) return [];
    const constraintOutcomes = outcomes(product, constraints);
    if (Object.values(constraintOutcomes).includes(false)) return [];
    const preferredBrandMatch = preferred.has(product.brand.toLocaleLowerCase("da-DK"));
    const parsedPackage = packageAmount(product.unitSize);
    const requested = planning.requested_amount !== undefined && planning.requested_unit
      ? normalizedAmount(planning.requested_amount, planning.requested_unit) : undefined;
    const comparable = requested && parsedPackage?.unit === requested.unit ? parsedPackage : undefined;
    const requiredPackages = comparable && requested ? Math.ceil(requested.amount / comparable.amount) : undefined;
    const candidate: PlanCandidate = {
      id: product.id, name: product.name, price: product.price, unit_price: product.unitPrice,
      unit_size: product.unitSize, brand: product.brand, available: product.available, source,
      ...(product.description ? { description: product.description } : {}),
      ...(product.details?.length ? { details: product.details } : {}),
      image_url: product.imageUrl || undefined,
      dietary: { organic: product.isOrganic, vegan: product.isVegan, gluten_free: product.isGlutenFree, lactose_free: product.isLactoseFree },
      is_frozen: product.isFrozen, is_on_discount: product.isOnDiscount,
      constraint_outcomes: constraintOutcomes, tags: [source, ...(product.isOnDiscount ? ["discount"] : []), ...(product.isOrganic ? ["organic"] : [])],
      relevant: true, preferred_brand_match: preferredBrandMatch,
      ...(parsedPackage ? { package_amount: parsedPackage.amount, package_unit: parsedPackage.unit } : {}),
      ...(requiredPackages !== undefined && comparable && requested ? { required_packages: requiredPackages, covered_amount: requiredPackages * comparable.amount, excess_amount: requiredPackages * comparable.amount - requested.amount } : {}),
    };
    return [candidate];
  }).sort((a, b) => {
    if (a.preferred_brand_match !== b.preferred_brand_match) return Number(b.preferred_brand_match) - Number(a.preferred_brand_match);
    if (planning.requested_amount !== undefined) {
      if ((a.required_packages !== undefined) !== (b.required_packages !== undefined)) return a.required_packages === undefined ? 1 : -1;
      if ((a.excess_amount ?? Infinity) !== (b.excess_amount ?? Infinity)) return (a.excess_amount ?? Infinity) - (b.excess_amount ?? Infinity);
    }
    for (const preference of preferences) {
      const av = preference === "discount" ? a.is_on_discount : preference === "organic" ? a.dietary.organic : preference === "non_frozen" ? !a.is_frozen : -(a.unit_price ?? Number.POSITIVE_INFINITY);
      const bv = preference === "discount" ? b.is_on_discount : preference === "organic" ? b.dietary.organic : preference === "non_frozen" ? !b.is_frozen : -(b.unit_price ?? Number.POSITIVE_INFINITY);
      if (av !== bv) return Number(bv) - Number(av);
    }
    return (a.unit_price ?? Infinity) - (b.unit_price ?? Infinity) || (a.price ?? Infinity) - (b.price ?? Infinity) || a.source.localeCompare(b.source) || a.id - b.id;
  }).slice(0, 5);
}

const mapLimit = async <T, R>(values: T[], limit: number, work: (value: T) => Promise<R>): Promise<R[]> => {
  const result = new Array<R>(values.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) { const index = next++; result[index] = await work(values[index]!); }
  }));
  return result;
};

/**
 * Resolves a validated plan with one basket read and at most three concurrent
 * catalogue reads. It never mutates: discovery failures stay per-line while a
 * basket failure propagates because coverage cannot be trusted without it.
 */
export async function resolveShoppingPlan(client: PlanClient, raw: ShoppingPlanInput): Promise<ShoppingPlan> {
  const input = shoppingPlanInputSchema.parse(raw);
  const basketPromise = client.getCart();
  const discovered = await mapLimit(input.lines, 3, async (line) => {
    try {
      const products = line.selected_product_id === undefined
        ? await client.searchProducts(line.name, 20)
        : [await client.getProduct(line.selected_product_id)];
      return { candidates: eligibleCandidates(products, "catalog", line.constraints, line.preferences,
        line.selected_product_id === undefined ? line : { ...line, name: "" }), unavailable: false };
    } catch (error) {
      if (error instanceof NemligError && error.status === 401) throw error;
      return { candidates: [], unavailable: true };
    }
  });
  const basket = await basketPromise;
  return calculateShoppingPlan(input, discovered, basket);
}
