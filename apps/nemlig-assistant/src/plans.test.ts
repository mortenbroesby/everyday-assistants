import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Basket, Product } from "./client.js";
import { eligibleCandidates, httpPlanSnapshotStorage, loadShoppingPlan, resolveShoppingPlan, saveShoppingPlan, shoppingPlanInputSchema, type PlanSnapshotStorage } from "./plans.js";
import { principalScopeFor } from "./principal-scope.js";
import { calculateShoppingPlan } from "./plan-calculation.js";

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

test("candidate ordering uses every preference then stable price, source, and ID ties", () => {
  const candidates = eligibleCandidates([
    product(5, "Plain", { price: 5, unitPrice: 5 }),
    product(4, "Discount", { price: 1, unitPrice: 1, isOnDiscount: true, isFrozen: true }),
    product(3, "Organic", { price: 2, unitPrice: 2, isOrganic: true, isFrozen: true }),
    product(2, "Tie two", { price: 3, unitPrice: 3 }),
    product(1, "Tie one", { price: 3, unitPrice: 3 }),
  ], "catalog", {}, ["discount", "organic", "non_frozen", "lowest_unit_price"]);
  assert.deepEqual(candidates.map(({ id }) => id), [4, 3, 1, 2, 5]);
});

test("pure calculation preserves mixed selection, fractional coverage, ordering, and totals", () => {
  const input = shoppingPlanInputSchema.parse({ mode: "automatic", lines: [
    { id: "covered", name: "milk", quantity: 2 }, { id: "selected", name: "yoghurt", quantity: 2 },
    { id: "missing-price", name: "bread", quantity: 1 }, { id: "failed", name: "coffee", quantity: 1 },
    { id: "exact", name: "ignored", quantity: 1, selected_product_id: 4 },
  ] });
  const candidate = (id: number, name: string, overrides: Partial<Product> = {}) => eligibleCandidates([product(id, name, overrides)], "catalog", {}, []);
  const plan = calculateShoppingPlan(input, [
    { candidates: candidate(1, "milk", { price: 2.5 }), unavailable: false },
    { candidates: candidate(2, "yoghurt", { price: 3.335 }), unavailable: false },
    { candidates: candidate(3, "bread", { price: undefined }), unavailable: false },
    { candidates: [], unavailable: true }, { candidates: candidate(4, "exact", { price: 4 }), unavailable: false },
  ], basket([{ id: 1, name: "milk", quantity: 1, total: 2.5 }, { id: 1, name: "milk", quantity: 1, total: 2.5 }, { id: 2, name: "yoghurt", quantity: 0.5, total: 1.6 }]));
  assert.deepEqual(plan.lines.map(({ id, resolution, clarity_reason, basket_quantity, remaining_quantity, selected_product_id }) => ({ id, resolution, clarity_reason, basket_quantity, remaining_quantity, selected_product_id })), [
    { id: "covered", resolution: "covered", clarity_reason: "unique_candidate", basket_quantity: 2, remaining_quantity: 0, selected_product_id: 1 },
    { id: "selected", resolution: "selected", clarity_reason: "unique_candidate", basket_quantity: 0.5, remaining_quantity: 1.5, selected_product_id: 2 },
    { id: "missing-price", resolution: "selected", clarity_reason: "unique_candidate", basket_quantity: 0, remaining_quantity: 1, selected_product_id: 3 },
    { id: "failed", resolution: "unresolved", clarity_reason: "discovery_unavailable", basket_quantity: 0, remaining_quantity: 1, selected_product_id: undefined },
    { id: "exact", resolution: "selected", clarity_reason: "exact_product", basket_quantity: 0, remaining_quantity: 1, selected_product_id: 4 },
  ]);
  assert.deepEqual(plan.summary, { total: 5, covered: 1, automatically_selected: 2, added: 0, unresolved: 0, failed: 1, automatic_coverage_percent: 60 });
  assert.equal(plan.selected_estimated_total, 9);
});

test("whole-list resolution searches the catalogue for every line, is bounded to three searches, ambiguity-safe, and basket-aware", async () => {
  let active = 0; let maximum = 0; const searched: string[] = [];
  const plan = await resolveShoppingPlan({
    searchProducts: async (query) => { active += 1; maximum = Math.max(maximum, active); searched.push(query); await new Promise((resolve) => setTimeout(resolve, 2)); active -= 1; return query === "brød" ? [product(2, "Brød A"), product(3, "Brød B")] : [product(query === "mælk" ? 1 : query.length + 10, query)]; },
    getProduct: async (id) => product(id, `product ${id}`),
    getCart: async () => basket([{ id: 1, name: "Mælk", quantity: 1, total: 10 }]),
  }, { lines: [
    { id: "milk", name: "mælk", quantity: 2, constraints: {}, preferences: [] },
    { id: "bread", name: "brød", quantity: 1, constraints: {}, preferences: [] },
    { id: "apples", name: "æbler", quantity: 1, constraints: {}, preferences: [] },
    { id: "cheese", name: "ost", quantity: 1, constraints: {}, preferences: [] },
    { id: "coffee", name: "kaffe", quantity: 1, constraints: {}, preferences: [] },
  ] });
  assert.deepEqual(searched.sort(), ["brød", "kaffe", "mælk", "ost", "æbler"].sort());
  assert.ok(maximum <= 3);
  assert.deepEqual(plan.lines[0], { ...plan.lines[0], resolution: "selected", selected_product_id: 1, basket_quantity: 1, remaining_quantity: 1 });
  assert.equal(plan.lines[1]?.reason, "close_alternatives");
  assert.equal(plan.selected_estimated_total, 40);
});

test("invalid plans make no calls and discovery failures remain distinguishable from empty results", async () => {
  let calls = 0;
  const client = { searchProducts: async () => { throw new Error("provider detail"); }, getProduct: async () => { throw new Error("provider detail"); }, getCart: async () => { calls += 1; return basket(); } };
  await assert.rejects(resolveShoppingPlan(client, { lines: [] }), /Too small|too_small/iu);
  assert.equal(calls, 0);
  const plan = await resolveShoppingPlan(client, { lines: [{ id: "milk", name: "mælk", quantity: 1, constraints: {}, preferences: [] }] });
  assert.equal(plan.lines[0]?.reason, "discovery_unavailable");
  const empty = await resolveShoppingPlan({ ...client, searchProducts: async () => [] }, { lines: [{ id: "milk", name: "mælk", quantity: 1, constraints: {}, preferences: [] }] });
  assert.equal(empty.lines[0]?.reason, "no_eligible_candidate");
});

test("basket gaps cover absent, partial, complete, over-complete, and unresolved lines", async () => {
  const inputs = [
    { id: "absent", name: "absent", quantity: 2 }, { id: "partial", name: "partial", quantity: 3 },
    { id: "complete", name: "complete", quantity: 2 }, { id: "over", name: "over", quantity: 1 },
    { id: "ambiguous", name: "ambiguous", quantity: 1 },
  ].map((line) => ({ ...line, constraints: {}, preferences: [] }));
  const products = [product(1, "absent"), product(2, "partial"), product(3, "complete"), product(4, "over"), product(5, "ambiguous"), product(6, "ambiguous")];
  const plan = await resolveShoppingPlan({ searchProducts: async (query) => products.filter((candidate) => candidate.name === query), getProduct: async (id) => products.find((candidate) => candidate.id === id)!, getCart: async () => basket([
    { id: 2, name: "partial", quantity: 1, total: 10 }, { id: 3, name: "complete", quantity: 2, total: 20 }, { id: 4, name: "over", quantity: 3, total: 30 },
  ]) }, { lines: inputs });
  assert.deepEqual(plan.lines.map((line) => [line.id, line.remaining_quantity, line.resolution]), [
    ["absent", 2, "selected"], ["partial", 2, "selected"], ["complete", 0, "covered"], ["over", 0, "covered"], ["ambiguous", 1, "unresolved"],
  ]);
});

test("planning aggregates duplicate basket lines, preserves mixed summaries, and keeps its provider call envelope", async () => {
  const calls: string[] = [];
  const plan = await resolveShoppingPlan({
    searchProducts: async (query) => {
      calls.push(`search:${query}`);
      if (query === "failed") throw new Error("provider unavailable");
      if (query === "uncertain") return [product(4, "Uncertain A"), product(5, "Uncertain B")];
      return [product(query === "milk" ? 1 : 2, query)];
    },
    getProduct: async (id) => { calls.push(`product:${id}`); return product(id, "Exact"); },
    getCart: async () => {
      calls.push("cart");
      return basket([
        { id: 1, name: "Milk", quantity: 1, total: 10 },
        { id: 1, name: "Milk", quantity: 2, total: 20 },
        { id: 2, name: "Yoghurt", quantity: 1, total: 10 },
      ]);
    },
  }, { lines: [
    { id: "milk", name: "milk", quantity: 3 },
    { id: "yoghurt", name: "yoghurt", quantity: 2 },
    { id: "uncertain", name: "uncertain", quantity: 1 },
    { id: "failed", name: "failed", quantity: 1 },
    { id: "exact", name: "ignored", quantity: 1, selected_product_id: 3 },
  ] });
  assert.equal(calls[0], "cart");
  assert.deepEqual(calls.slice(1).sort(), ["product:3", "search:failed", "search:milk", "search:uncertain", "search:yoghurt"]);
  assert.deepEqual(plan.lines.map(({ id, basket_quantity, remaining_quantity, resolution, clarity_reason }) =>
    ({ id, basket_quantity, remaining_quantity, resolution, clarity_reason })), [
    { id: "milk", basket_quantity: 3, remaining_quantity: 0, resolution: "covered", clarity_reason: "unique_candidate" },
    { id: "yoghurt", basket_quantity: 1, remaining_quantity: 1, resolution: "selected", clarity_reason: "unique_candidate" },
    { id: "uncertain", basket_quantity: 0, remaining_quantity: 1, resolution: "unresolved", clarity_reason: "close_alternatives" },
    { id: "failed", basket_quantity: 0, remaining_quantity: 1, resolution: "unresolved", clarity_reason: "discovery_unavailable" },
    { id: "exact", basket_quantity: 0, remaining_quantity: 1, resolution: "selected", clarity_reason: "exact_product" },
  ]);
  assert.deepEqual(plan.summary, {
    total: 5, covered: 1, automatically_selected: 1, added: 0, unresolved: 1, failed: 1,
    automatic_coverage_percent: 40,
  });
});

test("basket transport failures propagate after one read without being relabeled as discovery failures", async () => {
  const failure = new Error("basket transport unavailable");
  let basketReads = 0; let searches = 0;
  await assert.rejects(resolveShoppingPlan({
    searchProducts: async () => { searches += 1; return [product(1, "Milk")]; },
    getProduct: async (id) => product(id, "Exact"),
    getCart: async () => { basketReads += 1; throw failure; },
  }, { lines: [{ id: "milk", name: "milk", quantity: 1 }] }), (error) => error === failure);
  assert.equal(basketReads, 1);
  assert.equal(searches, 1);
});

test("an explicitly selected product is resolved by id without reconstructing its catalogue wording", async () => {
  let searches = 0;
  const exact = product(38424, "7-Morgen Kakao Crunchers");
  const plan = await resolveShoppingPlan({
    searchProducts: async () => { searches += 1; return []; },
    getProduct: async (id) => { assert.equal(id, exact.id); return exact; },
    getCart: async () => basket(),
  }, { lines: [{ id: "cereal", name: "kakao crunchers", quantity: 1, selected_product_id: 38424, constraints: {}, preferences: [] }] });
  assert.equal(searches, 0);
  assert.equal(plan.lines[0]?.selected_product_id, 38424);
  assert.equal(plan.lines[0]?.resolution, "selected");
});

test("automatic planning selects only deterministic clear matches and reports honest coverage", async () => {
  const products = [
    product(1, "Arla minimælk", { brand: "Arla", description: "Frisk mælk", details: [{ key: "Fedt", value: "0,4 %" }] }),
    product(2, "Minimælk", { brand: "Andet" }),
  ];
  const client = { searchProducts: async () => products, getProduct: async (id: number) => products.find((item) => item.id === id)!, getCart: async () => basket() };
  const automatic = await resolveShoppingPlan(client, { lines: [{ id: "milk", name: "arla minimælk", quantity: 1 }] });
  assert.equal(automatic.mode, "automatic");
  assert.equal(automatic.lines[0]?.clarity_reason, "clear_text_match");
  assert.equal(automatic.lines[0]?.selected_product_id, 1);
  assert.deepEqual(automatic.lines[0]?.candidates[0]?.details, [{ key: "Fedt", value: "0,4 %" }]);
  assert.deepEqual(automatic.summary, { total: 1, covered: 0, automatically_selected: 1, added: 0, unresolved: 0, failed: 0, automatic_coverage_percent: 100 });

  const manual = await resolveShoppingPlan(client, { mode: "manual", lines: [{ id: "milk", name: "arla minimælk", quantity: 1 }] });
  assert.equal(manual.lines[0]?.resolution, "unresolved");
  assert.equal(manual.lines[0]?.clarity_reason, "manual_choice");
  assert.equal(manual.summary.automatic_coverage_percent, 0);
});

test("planning accepts fifty lines and rejects fifty-one before external reads", async () => {
  let calls = 0;
  const client = { searchProducts: async (query: string) => { calls += 1; return [product(Number(query), query)]; }, getProduct: async (id: number) => product(id, String(id)), getCart: async () => { calls += 1; return basket(); } };
  const lines = Array.from({ length: 50 }, (_, index) => ({ id: `line-${index}`, name: String(index + 1), quantity: 1 }));
  const plan = await resolveShoppingPlan(client, { lines });
  assert.equal(plan.lines.length, 50);
  assert.equal(calls, 51);
  calls = 0;
  await assert.rejects(resolveShoppingPlan(client, { lines: [...lines, { id: "extra", name: "51", quantity: 1 }] }), /Too big|too_big/iu);
  assert.equal(calls, 0);
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

test("plan snapshot schema and identity checks are shared by storage implementations", async () => {
  const snapshots = new Map<string, string>();
  const storage: PlanSnapshotStorage = {
    create: async (id, snapshot) => { if (snapshots.has(id)) throw new Error("collision"); snapshots.set(id, snapshot); },
    read: async (id) => { const snapshot = snapshots.get(id); if (!snapshot) throw new Error("missing"); return snapshot; },
  };
  const id = "11111111-1111-4111-8111-111111111111";
  const input = shoppingPlanInputSchema.parse({ lines: [{ id: "milk", name: "mælk", quantity: 1 }] });
  await saveShoppingPlan(input, storage, id);
  assert.deepEqual(await loadShoppingPlan(id, storage), input);
  snapshots.set(id, "{}\n");
  await assert.rejects(loadShoppingPlan(id, storage), /could not be loaded/);
});

test("Cloudflare plan storage uses one bounded internal request per immutable read or write", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    return new Response(init?.body ? "Created" : "{\"stored\":true}\n", { status: init?.body ? 201 : 200 });
  };
  const storage = httpPlanSnapshotStorage("http://nemlig-plan-storage.internal/", fetcher);
  const id = "2ee94544-5f0a-4c89-95f0-f6af88f45ba1";
  await storage.create(id, "{}\n");
  assert.equal(await storage.read(id), "{\"stored\":true}\n");
  assert.deepEqual(calls, [
    { url: `http://nemlig-plan-storage.internal/${id}`, method: "PUT" },
    { url: `http://nemlig-plan-storage.internal/${id}`, method: "GET" },
  ]);
  assert.throws(() => httpPlanSnapshotStorage("https://example.test/", fetcher), /storage is invalid/u);
});

test("hosted plan snapshots are principal-scoped and only Tier 0 can copy a legacy snapshot", async () => {
  const values = new Map<string, string>();
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (init?.method === "PUT") {
      if (values.has(url)) return new Response("Already exists", { status: 409 });
      values.set(url, String(init.body));
      return new Response("Created", { status: 201 });
    }
    const value = values.get(url);
    return value === undefined ? new Response("Not found", { status: 404 }) : new Response(value);
  };
  const id = "2ee94544-5f0a-4c89-95f0-f6af88f45ba1";
  const input = shoppingPlanInputSchema.parse({ lines: [{ id: "milk", name: "mælk", quantity: 1 }] });
  const legacy = `${JSON.stringify({ schema_version: 1, id, created_at: new Date().toISOString(), input })}\n`;
  values.set(`http://nemlig-plan-storage.internal/${id}`, legacy);
  const owner = httpPlanSnapshotStorage("http://nemlig-plan-storage.internal/", fetcher, 3_000, { key: "owner-key", allowLegacyRead: true });
  const invitee = httpPlanSnapshotStorage("http://nemlig-plan-storage.internal/", fetcher, 3_000, { key: "invitee-key", allowLegacyRead: false });

  assert.deepEqual(await loadShoppingPlan(id, owner), input);
  await assert.rejects(loadShoppingPlan(id, invitee), /could not be loaded/u);
  await saveShoppingPlan(input, owner, id);

  const ownerUrl = `http://nemlig-plan-storage.internal/plans-v2/${principalScopeFor("owner-key")}/${id}`;
  const inviteeUrl = `http://nemlig-plan-storage.internal/plans-v2/${principalScopeFor("invitee-key")}/${id}`;
  assert.ok(values.has(ownerUrl));
  assert.ok(values.has(`http://nemlig-plan-storage.internal/${id}`));
  assert.equal(values.has(inviteeUrl), false);
});
