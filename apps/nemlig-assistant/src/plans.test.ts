import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Basket, Product } from "./client.js";
import { eligibleCandidates, loadShoppingPlan, resolveShoppingPlan, saveShoppingPlan, shoppingPlanInputSchema } from "./plans.js";

const product = (id: number, name: string, overrides: Partial<Product> = {}): Product => ({
  id, name, price: 10, unit: "10 kr/kg", unitPrice: 10, unitSize: "1 kg", brand: "Test",
  category: "", subcategory: "", imageUrl: "", available: true, labels: [], isOrganic: false,
  isFrozen: false, isRefrigerated: false, isDairy: false, isLactoseFree: false,
  isGlutenFree: false, isVegan: false, isOnDiscount: false, ...overrides,
});
const basket = (items: Basket["items"] = []): Basket => ({ items, productsPrice: 0, deliveryPrice: 0, numberOfProducts: 0, deliveryTime: undefined });

test("constraints exclude unknown or failing data and preferences rank deterministically", () => {
  const candidates = eligibleCandidates([
    product(1, "Cheap", { price: 5, unitPrice: undefined, isOrganic: true }),
    product(2, "Sale", { price: 9, unitPrice: 9, isOrganic: true, isOnDiscount: true }),
    product(3, "Not organic", { price: 1, unitPrice: 1 }),
  ], "catalog", { organic: true, max_unit_price: 10 }, ["discount", "lowest_unit_price"]);
  assert.deepEqual(candidates.map(({ id }) => id), [2]);
  assert.equal(candidates[0]?.constraint_outcomes.organic, true);
});

test("whole-list resolution is favorites-first, bounded to three searches, ambiguity-safe, and basket-aware", async () => {
  let active = 0; let maximum = 0; const searched: string[] = [];
  const plan = await resolveShoppingPlan({
    listFavorites: async () => [product(1, "Mælk favorit")],
    searchProducts: async (query) => { active += 1; maximum = Math.max(maximum, active); searched.push(query); await new Promise((resolve) => setTimeout(resolve, 2)); active -= 1; return query === "brød" ? [product(2, "Brød A"), product(3, "Brød B")] : [product(query.length + 10, query)]; },
    getCart: async () => basket([{ id: 1, name: "Mælk favorit", quantity: 1, total: 10 }]),
  }, { lines: [
    { id: "milk", name: "mælk", quantity: 2, constraints: {}, preferences: [] },
    { id: "bread", name: "brød", quantity: 1, constraints: {}, preferences: [] },
    { id: "apples", name: "æbler", quantity: 1, constraints: {}, preferences: [] },
    { id: "cheese", name: "ost", quantity: 1, constraints: {}, preferences: [] },
    { id: "coffee", name: "kaffe", quantity: 1, constraints: {}, preferences: [] },
  ] });
  assert.equal(searched.includes("mælk"), false);
  assert.ok(maximum <= 3);
  assert.deepEqual(plan.lines[0], { ...plan.lines[0], resolution: "selected", selected_product_id: 1, basket_quantity: 1, remaining_quantity: 1 });
  assert.equal(plan.lines[1]?.reason, "multiple_candidates");
  assert.equal(plan.selected_estimated_total, 40);
});

test("invalid plans make no calls and failed fallback lines remain unresolved", async () => {
  let calls = 0;
  const client = { listFavorites: async () => { calls += 1; return []; }, searchProducts: async () => { throw new Error("provider detail"); }, getCart: async () => { calls += 1; return basket(); } };
  await assert.rejects(resolveShoppingPlan(client, { lines: [] }), /Too small|too_small/iu);
  assert.equal(calls, 0);
  const plan = await resolveShoppingPlan(client, { lines: [{ id: "milk", name: "mælk", quantity: 1, constraints: {}, preferences: [] }] });
  assert.equal(plan.lines[0]?.reason, "no_eligible_candidate");
});

test("basket gaps cover absent, partial, complete, over-complete, and unresolved lines", async () => {
  const inputs = [
    { id: "absent", name: "absent", quantity: 2 }, { id: "partial", name: "partial", quantity: 3 },
    { id: "complete", name: "complete", quantity: 2 }, { id: "over", name: "over", quantity: 1 },
    { id: "ambiguous", name: "ambiguous", quantity: 1 },
  ].map((line) => ({ ...line, constraints: {}, preferences: [] }));
  const products = [product(1, "absent"), product(2, "partial"), product(3, "complete"), product(4, "over"), product(5, "ambiguous"), product(6, "ambiguous")];
  const plan = await resolveShoppingPlan({ listFavorites: async () => products, searchProducts: async () => [], getCart: async () => basket([
    { id: 2, name: "partial", quantity: 1, total: 10 }, { id: 3, name: "complete", quantity: 2, total: 20 }, { id: 4, name: "over", quantity: 3, total: 30 },
  ]) }, { lines: inputs });
  assert.deepEqual(plan.lines.map((line) => [line.id, line.remaining_quantity, line.resolution]), [
    ["absent", 2, "selected"], ["partial", 2, "selected"], ["complete", 0, "covered"], ["over", 0, "covered"], ["ambiguous", 1, "unresolved"],
  ]);
});

test("plan snapshots are owner-only, immutable, schema-validated, and contain only structured input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nemlig-plans-"));
  const input = shoppingPlanInputSchema.parse({ lines: [{ id: "milk", name: "mælk", quantity: 1 }] });
  const saved = await saveShoppingPlan(input, directory);
  assert.deepEqual(await loadShoppingPlan(saved.id, directory), input);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(join(directory, `${saved.id}.json`))).mode & 0o777, 0o600);
  const text = await readFile(join(directory, `${saved.id}.json`), "utf8");
  assert.doesNotMatch(text, /password|proposal|basket_fingerprint/iu);
  await assert.rejects(saveShoppingPlan(input, directory, saved.id), /EEXIST/);
  await assert.rejects(loadShoppingPlan("not-a-uuid", directory), /must be a UUID/);
  const malformed = "11111111-1111-4111-8111-111111111111";
  await writeFile(join(directory, `${malformed}.json`), "{}\n");
  await assert.rejects(loadShoppingPlan(malformed, directory), /could not be loaded/);
});
