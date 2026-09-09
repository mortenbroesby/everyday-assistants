import { z } from "zod";
import { NemligError, type Basket, type Product } from "./client.js";
import { calculateShoppingPlan } from "./plan-calculation.js";

const constraintsSchema = z.object({
  organic: z.boolean().optional(), vegan: z.boolean().optional(), gluten_free: z.boolean().optional(),
  lactose_free: z.boolean().optional(), available: z.boolean().optional(),
  max_price: z.number().nonnegative().optional(), max_unit_price: z.number().nonnegative().optional(),
}).strict();
const preferenceSchema = z.enum(["discount", "organic", "lowest_unit_price", "non_frozen"]);
export const shoppingPlanLineSchema = z.object({
  id: z.string().trim().min(1).max(80).describe("A short label that keeps this grocery line distinct."),
  name: z.string().trim().min(1).max(200).describe("One short Danish catalogue phrase. Translate or normalize English, mixed-language, misspelled, or over-specific wording before this call; preserve a distinctive brand and add the Danish product category, for example 'Prince biscuits' becomes 'prince kiks'."),
  quantity: z.number().int().positive().max(99).describe("How many you want."),
  constraints: constraintsSchema.default({}).describe("Requirements that every suggested product must meet."),
  preferences: z.array(preferenceSchema).max(4).default([]).describe("Optional preferences used to rank suitable products."),
  selected_product_id: z.number().int().positive().optional(),
}).strict();
export const shoppingPlanInputSchema = z.object({
  lines: z.array(shoppingPlanLineSchema).min(1).max(50),
  mode: z.enum(["automatic", "manual"]).default("automatic"),
}).strict();
export type ShoppingPlanInput = z.input<typeof shoppingPlanInputSchema>;
export type StoredShoppingPlanInput = z.output<typeof shoppingPlanInputSchema>;
type ParsedShoppingPlanLine = z.output<typeof shoppingPlanLineSchema>;
type ClarityReason = "exact_product" | "unique_candidate" | "clear_text_match" | "manual_choice" | "close_alternatives" | "no_eligible_candidate" | "discovery_unavailable" | "unavailable";
export type PlanSource = "favorite" | "catalog";

export interface PlanCandidate {
  id: number; name: string; price: number | undefined; unit_price: number | undefined;
  unit_size: string; brand: string; available: boolean; source: PlanSource;
  description?: string;
  details?: Array<{ key: string; value: string }>;
  image_url: string | undefined;
  dietary: { organic: boolean; vegan: boolean; gluten_free: boolean; lactose_free: boolean };
  is_frozen: boolean; is_on_discount: boolean; constraint_outcomes: Record<string, boolean>; tags: string[];
}

export interface ShoppingPlan {
  mode: "automatic" | "manual";
  lines: Array<{
    id: string; name: string; quantity: number; candidates: PlanCandidate[];
    resolution: "selected" | "covered" | "unresolved";
    reason?: string; clarity: "clear" | "unclear"; clarity_reason: ClarityReason;
    selected_product_id?: number; basket_quantity: number; remaining_quantity: number;
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

/**
 * Returns at most five deterministically ordered candidates that meet every
 * hard constraint. The order drives automatic selection, so preferences only
 * rank eligible products and never relax a constraint.
 */
export function eligibleCandidates(
  products: Product[], source: PlanSource, constraints: ParsedShoppingPlanLine["constraints"],
  preferences: ParsedShoppingPlanLine["preferences"],
): PlanCandidate[] {
  return products.flatMap((product) => {
    if (product.id === undefined || !product.name) return [];
    const constraintOutcomes = outcomes(product, constraints);
    if (Object.values(constraintOutcomes).includes(false)) return [];
    const candidate: PlanCandidate = {
      id: product.id, name: product.name, price: product.price, unit_price: product.unitPrice,
      unit_size: product.unitSize, brand: product.brand, available: product.available, source,
      ...(product.description ? { description: product.description } : {}),
      ...(product.details?.length ? { details: product.details } : {}),
      image_url: product.imageUrl || undefined,
      dietary: { organic: product.isOrganic, vegan: product.isVegan, gluten_free: product.isGlutenFree, lactose_free: product.isLactoseFree },
      is_frozen: product.isFrozen, is_on_discount: product.isOnDiscount,
      constraint_outcomes: constraintOutcomes, tags: [source, ...(product.isOnDiscount ? ["discount"] : []), ...(product.isOrganic ? ["organic"] : [])],
    };
    return [candidate];
  }).sort((a, b) => {
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
      return { candidates: eligibleCandidates(products, "catalog", line.constraints, line.preferences), unavailable: false };
    } catch (error) {
      if (error instanceof NemligError && error.status === 401) throw error;
      return { candidates: [], unavailable: true };
    }
  });
  const basket = await basketPromise;
  return calculateShoppingPlan(input, discovered, basket);
}
