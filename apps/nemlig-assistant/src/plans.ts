import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Basket, Product } from "./client.js";
import { NemligError, matchFavorites } from "./client.js";

const constraintsSchema = z.object({
  organic: z.boolean().optional(), vegan: z.boolean().optional(), gluten_free: z.boolean().optional(),
  lactose_free: z.boolean().optional(), available: z.boolean().optional(),
  max_price: z.number().nonnegative().optional(), max_unit_price: z.number().nonnegative().optional(),
}).strict();
const preferenceSchema = z.enum(["discount", "organic", "lowest_unit_price", "non_frozen"]);
export const shoppingPlanLineSchema = z.object({
  id: z.string().trim().min(1).max(80).describe("A short label that keeps this grocery line distinct."),
  name: z.string().trim().min(1).max(200).describe("The grocery you want, written in ordinary Danish shopping language."),
  quantity: z.number().int().positive().max(99).describe("How many you want."),
  constraints: constraintsSchema.default({}).describe("Requirements that every suggested product must meet."),
  preferences: z.array(preferenceSchema).max(4).default([]).describe("Optional preferences used to rank suitable products."),
  selected_product_id: z.number().int().positive().optional(),
}).strict();
export const shoppingPlanInputSchema = z.object({
  lines: z.array(shoppingPlanLineSchema).min(1).max(20),
}).strict();
export type ShoppingPlanInput = z.infer<typeof shoppingPlanInputSchema>;
export type PlanSource = "favorite" | "catalog";

export interface PlanCandidate {
  id: number; name: string; price: number | undefined; unit_price: number | undefined;
  unit_size: string; brand: string; available: boolean; source: PlanSource;
  image_url: string | undefined;
  dietary: { organic: boolean; vegan: boolean; gluten_free: boolean; lactose_free: boolean };
  is_frozen: boolean; is_on_discount: boolean; constraint_outcomes: Record<string, boolean>; tags: string[];
}

export interface ShoppingPlan {
  lines: Array<{
    id: string; name: string; quantity: number; candidates: PlanCandidate[];
    resolution: "selected" | "covered" | "unresolved";
    reason?: string; selected_product_id?: number; basket_quantity: number; remaining_quantity: number;
  }>;
  selected_estimated_total: number;
}

export interface PlanClient {
  listFavorites(limit?: number, page?: number): Promise<Product[]>;
  searchProducts(query: string, limit?: number): Promise<Product[]>;
  getCart(): Promise<Basket>;
}

const outcomes = (product: Product, constraints: ShoppingPlanInput["lines"][number]["constraints"]): Record<string, boolean> => ({
  available: constraints.available === false || product.available,
  organic: constraints.organic !== true || product.isOrganic,
  vegan: constraints.vegan !== true || product.isVegan,
  gluten_free: constraints.gluten_free !== true || product.isGlutenFree,
  lactose_free: constraints.lactose_free !== true || product.isLactoseFree,
  max_price: constraints.max_price === undefined || (product.price !== undefined && product.price <= constraints.max_price),
  max_unit_price: constraints.max_unit_price === undefined || (product.unitPrice !== undefined && product.unitPrice <= constraints.max_unit_price),
});

export function eligibleCandidates(
  products: Product[], source: PlanSource, constraints: ShoppingPlanInput["lines"][number]["constraints"],
  preferences: ShoppingPlanInput["lines"][number]["preferences"],
): PlanCandidate[] {
  return products.flatMap((product) => {
    if (product.id === undefined || !product.name) return [];
    const constraintOutcomes = outcomes(product, constraints);
    if (Object.values(constraintOutcomes).includes(false)) return [];
    const candidate: PlanCandidate = {
      id: product.id, name: product.name, price: product.price, unit_price: product.unitPrice,
      unit_size: product.unitSize, brand: product.brand, available: product.available, source,
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

export async function resolveShoppingPlan(client: PlanClient, raw: ShoppingPlanInput): Promise<ShoppingPlan> {
  const input = shoppingPlanInputSchema.parse(raw);
  const [favorites, basket] = await Promise.all([client.listFavorites(1000, 1), client.getCart()]);
  const favoriteMatches = input.lines.map((line) => eligibleCandidates(matchFavorites(favorites, line.name, 1000), "favorite", line.constraints, line.preferences));
  const fallbackIndexes = input.lines.flatMap((_, index) => favoriteMatches[index]!.length ? [] : [index]);
  const fallback = new Map<number, PlanCandidate[]>();
  const searched = await mapLimit(fallbackIndexes, 3, async (index) => {
    try { return eligibleCandidates(await client.searchProducts(input.lines[index]!.name, 20), "catalog", input.lines[index]!.constraints, input.lines[index]!.preferences); }
    catch { return []; }
  });
  fallbackIndexes.forEach((index, position) => fallback.set(index, searched[position]!));
  let selectedEstimatedTotal = 0;
  const lines = input.lines.map((line, index) => {
    const candidates = favoriteMatches[index]!.length ? favoriteMatches[index]! : fallback.get(index) ?? [];
    const selected = line.selected_product_id === undefined
      ? (candidates.length === 1 ? candidates[0] : undefined)
      : candidates.find((candidate) => candidate.id === line.selected_product_id);
    const basketQuantity = selected ? basket.items.filter((item) => item.id === selected.id).reduce((sum, item) => sum + (item.quantity ?? 0), 0) : 0;
    const remainingQuantity = selected ? Math.max(0, line.quantity - basketQuantity) : line.quantity;
    if (selected?.price !== undefined) selectedEstimatedTotal += selected.price * remainingQuantity;
    const resolution: "selected" | "covered" | "unresolved" = selected ? (remainingQuantity === 0 ? "covered" : "selected") : "unresolved";
    return { id: line.id, name: line.name, quantity: line.quantity, candidates, resolution, reason: selected ? undefined : candidates.length ? "multiple_candidates" : "no_eligible_candidate", selected_product_id: selected?.id, basket_quantity: basketQuantity, remaining_quantity: remainingQuantity };
  });
  return { lines, selected_estimated_total: Math.round(selectedEstimatedTotal * 100) / 100 };
}

const snapshotSchema = z.object({ schema_version: z.literal(1), id: z.string().uuid(), created_at: z.string().datetime(), input: shoppingPlanInputSchema }).strict();
export const plansDirectory = (): string => process.env.NEMLIG_CONFIG_DIR ? join(process.env.NEMLIG_CONFIG_DIR, "plans") : join(homedir(), ".nemlig-shopper", "plans");
export interface PlanSnapshotStorage {
  create(id: string, snapshot: string): Promise<void>;
  read(id: string): Promise<string>;
}
export const filePlanSnapshotStorage = (directory = plansDirectory()): PlanSnapshotStorage => ({
  async create(id, snapshot) {
    await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
    const file = join(directory, `${id}.json`);
    await writeFile(file, snapshot, { encoding: "utf8", mode: 0o600, flag: "wx" }); await chmod(file, 0o600);
  },
  read: async (id) => readFile(join(directory, `${id}.json`), "utf8"),
});
export const httpPlanSnapshotStorage = (
  baseUrl: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 3_000,
): PlanSnapshotStorage => {
  const base = new URL(baseUrl);
  if (base.origin !== "http://nemlig-plan-storage.internal") throw new NemligError("Shopping plan storage is invalid.");
  const request = async (id: string, init?: RequestInit): Promise<Response> => {
    const response = await fetcher(new URL(id, base), { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new NemligError(`Shopping plan ${id} could not be ${init ? "saved" : "loaded"}.`);
    return response;
  };
  return {
    create: async (id, snapshot) => { await request(id, { method: "PUT", body: snapshot, headers: { "content-type": "application/json" } }); },
    read: async (id) => request(id).then((response) => response.text()),
  };
};
export const configuredPlanSnapshotStorage = (env: NodeJS.ProcessEnv = process.env): PlanSnapshotStorage =>
  env.NEMLIG_PLAN_STORAGE_URL ? httpPlanSnapshotStorage(env.NEMLIG_PLAN_STORAGE_URL) : filePlanSnapshotStorage();
const snapshotStorage = (storage: string | PlanSnapshotStorage): PlanSnapshotStorage =>
  typeof storage === "string" ? filePlanSnapshotStorage(storage) : storage;
export async function saveShoppingPlan(input: ShoppingPlanInput, storage: string | PlanSnapshotStorage = plansDirectory(), id: string = randomUUID()): Promise<{ id: string; created_at: string }> {
  const valid = shoppingPlanInputSchema.parse(input); if (!z.string().uuid().safeParse(id).success) throw new NemligError("Shopping plan ID must be a UUID."); const createdAt = new Date().toISOString();
  await snapshotStorage(storage).create(id, `${JSON.stringify({ schema_version: 1, id, created_at: createdAt, input: valid })}\n`);
  return { id, created_at: createdAt };
}
export async function loadShoppingPlan(id: string, storage: string | PlanSnapshotStorage = plansDirectory()): Promise<ShoppingPlanInput> {
  if (!z.string().uuid().safeParse(id).success) throw new NemligError("Shopping plan ID must be a UUID.");
  try { const snapshot = snapshotSchema.parse(JSON.parse(await snapshotStorage(storage).read(id))); if (snapshot.id !== id) throw new Error(); return snapshot.input; }
  catch { throw new NemligError(`Shopping plan ${id} could not be loaded.`); }
}
