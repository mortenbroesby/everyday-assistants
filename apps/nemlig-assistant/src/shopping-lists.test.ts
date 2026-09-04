import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { saveShoppingPlan, type PlanSnapshotStorage } from "./plans.js";
import { handleShoppingListStorageRequest, type ShoppingListObjectStorage } from "./shopping-list-worker-storage.js";
import {
  copyShoppingList,
  fileShoppingListStorage,
  httpShoppingListStorage,
  MAX_SHOPPING_LIST_LINES,
  MAX_SHOPPING_LISTS,
  migrateShoppingPlan,
  normalizeShoppingListName,
  ownerScopeFor,
  saveShoppingList,
  setShoppingListStatus,
  shoppingListLineSchema,
  shoppingListSchema,
  showShoppingLists,
  type ShoppingListCollection,
  type ShoppingListStorage,
} from "./shopping-lists.js";

const line = (id = "milk") => ({ id, name: "Mælk", quantity: 1, constraints: {}, preferences: [] });
const instant = new Date("2026-09-02T08:00:00.000Z");

const memoryStorage = (): ShoppingListStorage & { collections: Map<string, ShoppingListCollection> } => {
  const collections = new Map<string, ShoppingListCollection>();
  return {
    collections,
    read: async (ownerScope) => structuredClone(collections.get(ownerScope) ?? { schema_version: 2, owner_scope: ownerScope, generation: 0, lists: [] }),
    replace: async (ownerScope, expectedGeneration, collection) => {
      const current = collections.get(ownerScope);
      assert.equal(current?.generation ?? 0, expectedGeneration);
      collections.set(ownerScope, structuredClone(collection));
    },
  };
};

test("named-list schemas accept reusable and occasion lists and reject every hard bound", () => {
  const valid = shoppingListSchema.parse({ schema_version: 2, id: "11111111-1111-4111-8111-111111111111", name: "Ugens basis", normalized_name: "ugens basis", type: "reusable", status: "active", revision: 1, created_at: instant.toISOString(), updated_at: instant.toISOString(), lines: [line()] });
  assert.equal(valid.type, "reusable");
  assert.equal(shoppingListSchema.parse({ ...valid, type: "occasion", status: "archived", archived_at: instant.toISOString() }).type, "occasion");
  assert.equal(normalizeShoppingListName("  FØDSELSDAG   Fest  "), "fødselsdag fest");
  assert.throws(() => shoppingListLineSchema.parse({ ...line(), id: "x".repeat(81) }));
  assert.throws(() => shoppingListLineSchema.parse({ ...line(), name: "x".repeat(201) }));
  assert.throws(() => shoppingListLineSchema.parse({ ...line(), quantity: 100 }));
  assert.throws(() => shoppingListLineSchema.parse({ ...line(), note: "x".repeat(201) }));
  assert.throws(() => shoppingListSchema.parse({ ...valid, name: "x".repeat(121) }));
  assert.throws(() => shoppingListSchema.parse({ ...valid, revision: 0 }));
  assert.throws(() => shoppingListSchema.parse({ ...valid, lines: Array.from({ length: MAX_SHOPPING_LIST_LINES + 1 }, (_, index) => line(String(index))) }));
});

test("local list repository creates, enumerates, opens, edits, copies, archives, and restores atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nemlig-lists-"));
  const storage = fileShoppingListStorage(directory);
  const owner = "auth0|owner";
  const weekly = await saveShoppingList(owner, storage, { name: "Ugens basis", type: "reusable", lines: [line()] }, instant);
  assert.equal((await showShoppingLists(owner, storage))[0]?.name, "Ugens basis");
  assert.equal((await showShoppingLists(owner, storage, weekly.id))[0]?.lines[0]?.name, "Mælk");
  const edited = await saveShoppingList(owner, storage, { list: weekly.id, expected_revision: 1, name: "Fast ugekurv", type: "reusable", lines: [{ ...line(), quantity: 2 }] }, instant);
  assert.equal(edited.revision, 2);
  assert.equal(edited.lines[0]?.quantity, 2);
  await assert.rejects(saveShoppingList(owner, storage, { list: weekly.id, expected_revision: 1, name: "Stale", type: "reusable", lines: [] }), /changed/iu);
  const birthday = await copyShoppingList(owner, storage, weekly.id, "Fødselsdag", "occasion", instant);
  assert.equal(birthday.type, "occasion");
  await assert.rejects(saveShoppingList(owner, storage, { name: " FØDSELSDAG ", type: "occasion", lines: [] }), /already has that name/iu);
  const archived = await setShoppingListStatus(owner, storage, birthday.id, "archived", 1, instant);
  assert.equal(archived.status, "archived");
  assert.equal((await showShoppingLists(owner, storage)).length, 1);
  assert.equal((await showShoppingLists(owner, storage, undefined, true)).length, 2);
  const restored = await setShoppingListStatus(owner, storage, birthday.id, "active", 2, instant);
  assert.equal(restored.status, "active");
  const file = join(directory, `${ownerScopeFor(owner)}.json`);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.doesNotMatch(await readFile(file, "utf8"), /auth0\|owner/u);
});

test("list collection and owner bounds fail before changing state", async () => {
  const storage = memoryStorage();
  const owner = "auth0|owner";
  for (let index = 0; index < MAX_SHOPPING_LISTS; index += 1) {
    await saveShoppingList(owner, storage, { name: `List ${index}`, type: "occasion", lines: [] }, instant);
  }
  const before = structuredClone(storage.collections);
  await assert.rejects(saveShoppingList(owner, storage, { name: "One too many", type: "occasion", lines: [] }), /up to 25/iu);
  assert.deepEqual(storage.collections, before);
  assert.equal((await showShoppingLists("auth0|other", storage)).length, 0);
});

test("HTTP list storage is owner-scoped, bounded, and uses one versioned internal request per operation", async () => {
  const calls: Array<{ url: string; method: string; protocol: string | null; match: string | null }> = [];
  const ownerScope = ownerScopeFor("auth0|owner");
  const collection: ShoppingListCollection = { schema_version: 2, owner_scope: ownerScope, generation: 0, lists: [] };
  const fetcher: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), method: init?.method ?? "GET", protocol: headers.get("x-nemlig-storage-protocol"), match: headers.get("if-match") });
    return Response.json(collection);
  };
  const storage = httpShoppingListStorage("http://nemlig-plan-storage.internal/", fetcher);
  assert.deepEqual(await storage.read(ownerScope), collection);
  await storage.replace(ownerScope, 0, { ...collection, generation: 1 });
  assert.deepEqual(calls, [
    { url: `http://nemlig-plan-storage.internal/named-lists-v2/${ownerScope}`, method: "GET", protocol: null, match: null },
    { url: `http://nemlig-plan-storage.internal/named-lists-v2/${ownerScope}`, method: "PUT", protocol: null, match: "0" },
  ]);
  assert.throws(() => httpShoppingListStorage("https://lookalike.invalid/", fetcher), /storage is invalid/iu);
});

test("fixed storage object atomically isolates version-routed owners and revisions", async () => {
  const values = new Map<string, unknown>();
  const storage: ShoppingListObjectStorage = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    put: async (key, value) => { values.set(key, structuredClone(value)); },
    transaction: async (operation) => operation(),
  };
  const owner = ownerScopeFor("auth0|owner");
  const other = ownerScopeFor("auth0|other");
  const url = (scope: string) => `http://nemlig-plan-storage.internal/named-lists-v2/${scope}`;
  const get = (scope: string) => handleShoppingListStorageRequest(new Request(url(scope)), scope, storage);
  assert.equal(((await (await get(owner)).json()) as ShoppingListCollection).lists.length, 0);
  const base: ShoppingListCollection = { schema_version: 2, owner_scope: owner, generation: 1, lists: [] };
  const put = (scope: string, expected: number, body: unknown) => handleShoppingListStorageRequest(new Request(url(scope), {
    method: "PUT", headers: { "if-match": String(expected), "content-type": "application/json" }, body: JSON.stringify(body),
  }), scope, storage);
  assert.equal((await put(owner, 0, base)).status, 200);
  assert.equal((await put(owner, 0, base)).status, 409);
  assert.equal((await put(other, 0, base)).status, 400);
  assert.equal(((await (await get(other)).json()) as ShoppingListCollection).lists.length, 0);
  assert.equal((await put(owner, 1, { ...base, generation: 2, lists: Array.from({ length: MAX_SHOPPING_LISTS + 1 }, () => ({})) })).status, 400);
  const malformed = await handleShoppingListStorageRequest(new Request(url(owner), { method: "PUT", headers: { "if-match": "1" }, body: "{" }), owner, storage);
  assert.equal(malformed.status, 400);
  assert.doesNotMatch(await malformed.text(), /Zod|owner_scope|stack/iu);
});

test("legacy snapshot migration creates a list and leaves its source unchanged", async () => {
  const snapshots = new Map<string, string>();
  const snapshotStorage: PlanSnapshotStorage = {
    create: async (id, value) => { snapshots.set(id, value); },
    read: async (id) => { const value = snapshots.get(id); if (!value) throw new Error("missing"); return value; },
  };
  const id = "11111111-1111-4111-8111-111111111111";
  await saveShoppingPlan({ lines: [{ ...line(), selected_product_id: 42 }] }, snapshotStorage, id);
  const original = snapshots.get(id);
  const listStorage = memoryStorage();
  const migrated = await migrateShoppingPlan("auth0|owner", listStorage, snapshotStorage, id, "Imported", "reusable", instant);
  assert.equal(migrated.lines[0]?.preferred_product_id, 42);
  assert.equal(snapshots.get(id), original);
  await assert.rejects(migrateShoppingPlan("auth0|owner", listStorage, snapshotStorage, id, "IMPORTED", "reusable", instant), /already has that name/iu);
  snapshots.set(id, "{}\n");
  await assert.rejects(migrateShoppingPlan("auth0|owner", listStorage, snapshotStorage, id, "Broken", "reusable", instant), /could not be loaded/iu);
});
