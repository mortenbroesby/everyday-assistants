import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { NemligError } from "./client.js";
import { loadShoppingPlan, type PlanSnapshotStorage } from "./plans.js";
import {
  MAX_SHOPPING_LIST_LINES,
  MAX_SHOPPING_LISTS,
  shoppingListLineSchema,
  shoppingListSchema,
  storedShoppingListCollectionSchema,
  type ShoppingList,
  type ShoppingListCollection,
  type ShoppingListLine,
  type ShoppingListStatus,
  type ShoppingListType,
} from "./shopping-list-model.js";

export * from "./shopping-list-model.js";

export interface ShoppingListStorage {
  read(ownerScope: string): Promise<ShoppingListCollection>;
  replace(ownerScope: string, expectedGeneration: number, collection: ShoppingListCollection): Promise<void>;
}

export const shoppingListsDirectory = (): string => process.env.NEMLIG_CONFIG_DIR
  ? join(process.env.NEMLIG_CONFIG_DIR, "shopping-lists")
  : join(homedir(), ".nemlig-shopper", "shopping-lists");

export const ownerScopeFor = (ownerSubject: string): string => {
  const subject = z.string().trim().min(1).max(500).parse(ownerSubject);
  return createHash("sha256").update(subject, "utf8").digest("hex");
};

export const normalizeShoppingListName = (name: string): string => z.string().trim().min(1).max(120)
  .parse(name).normalize("NFKC").replace(/\s+/gu, " ").toLocaleLowerCase("da-DK");

const emptyCollection = (ownerScope: string): ShoppingListCollection => ({
  schema_version: 2,
  owner_scope: ownerScope,
  generation: 0,
  lists: [],
});

const parseCollection = (raw: unknown, ownerScope: string): ShoppingListCollection => {
  const collection = storedShoppingListCollectionSchema.parse(raw);
  if (collection.owner_scope !== ownerScope) throw new NemligError("Shopping lists could not be loaded.");
  return collection;
};

const fileLocks = new Map<string, Promise<void>>();
const withFileLock = async <T>(key: string, operation: () => Promise<T>): Promise<T> => {
  const previous = fileLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  fileLocks.set(key, queued);
  await previous;
  try { return await operation(); }
  finally { release(); if (fileLocks.get(key) === queued) fileLocks.delete(key); }
};

export const fileShoppingListStorage = (directory = shoppingListsDirectory()): ShoppingListStorage => {
  const fileFor = (ownerScope: string): string => join(directory, `${ownerScope}.json`);
  const read = async (ownerScope: string): Promise<ShoppingListCollection> => {
    try { return parseCollection(JSON.parse(await readFile(fileFor(ownerScope), "utf8")), ownerScope); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyCollection(ownerScope);
      if (error instanceof NemligError) throw error;
      throw new NemligError("Shopping lists could not be loaded.");
    }
  };
  return {
    read,
    async replace(ownerScope, expectedGeneration, rawCollection) {
      await withFileLock(fileFor(ownerScope), async () => {
        const current = await read(ownerScope);
        if (current.generation !== expectedGeneration) throw new NemligError("This shopping list changed. Open it again before saving.");
        const collection = parseCollection(rawCollection, ownerScope);
        if (collection.generation !== expectedGeneration + 1) throw new NemligError("Shopping list revision is invalid.");
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await chmod(directory, 0o700);
        const target = fileFor(ownerScope);
        const temporary = `${target}.${randomUUID()}.tmp`;
        await writeFile(temporary, `${JSON.stringify(collection)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
        await chmod(temporary, 0o600);
        await rename(temporary, target);
        await chmod(target, 0o600);
      });
    },
  };
};

export const httpShoppingListStorage = (
  baseUrl: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 3_000,
): ShoppingListStorage => {
  const base = new URL(baseUrl);
  if (base.origin !== "http://nemlig-plan-storage.internal") throw new NemligError("Shopping list storage is invalid.");
  const request = async (ownerScope: string, init?: RequestInit): Promise<Response> => {
    const response = await fetcher(new URL(`named-lists-v2/${ownerScope}`, base), {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "content-type": "application/json", ...init?.headers },
    });
    if (!response.ok) {
      if (response.status === 409) throw new NemligError("This shopping list changed. Open it again before saving.");
      throw new NemligError("Shopping lists are temporarily unavailable.");
    }
    return response;
  };
  return {
    read: async (ownerScope) => parseCollection(await request(ownerScope).then((response) => response.json()), ownerScope),
    replace: async (ownerScope, expectedGeneration, collection) => {
      await request(ownerScope, { method: "PUT", body: JSON.stringify(collection), headers: { "if-match": String(expectedGeneration) } });
    },
  };
};

export const configuredShoppingListStorage = (env: NodeJS.ProcessEnv = process.env): ShoppingListStorage => env.NEMLIG_PLAN_STORAGE_URL
  ? httpShoppingListStorage(env.NEMLIG_PLAN_STORAGE_URL)
  : fileShoppingListStorage(env.NEMLIG_CONFIG_DIR ? join(env.NEMLIG_CONFIG_DIR, "shopping-lists") : shoppingListsDirectory());

const findList = (collection: ShoppingListCollection, selector: string): ShoppingList | undefined => {
  const byId = z.string().uuid().safeParse(selector).success ? collection.lists.find(({ id }) => id === selector) : undefined;
  if (byId) return byId;
  const normalized = normalizeShoppingListName(selector);
  const matches = collection.lists.filter(({ normalized_name: name }) => name === normalized);
  if (matches.length > 1) throw new NemligError(`More than one archived list is named “${selector}”. Use the exact list reference.`);
  return matches[0];
};

const assertNameAvailable = (collection: ShoppingListCollection, normalizedName: string, exceptId?: string): void => {
  if (collection.lists.some((list) => list.status === "active" && list.normalized_name === normalizedName && list.id !== exceptId)) {
    throw new NemligError("An active shopping list already has that name.");
  }
};

const replaceCollection = async (
  storage: ShoppingListStorage,
  collection: ShoppingListCollection,
  lists: ShoppingList[],
): Promise<void> => storage.replace(collection.owner_scope, collection.generation, {
  ...collection,
  generation: collection.generation + 1,
  lists,
});

export const showShoppingLists = async (
  ownerSubject: string,
  storage: ShoppingListStorage,
  selector?: string,
  includeArchived = false,
): Promise<ShoppingList[]> => {
  const collection = await storage.read(ownerScopeFor(ownerSubject));
  if (selector) {
    const list = findList(collection, selector);
    if (!list || (!includeArchived && list.status === "archived")) throw new NemligError(`Shopping list “${selector}” was not found.`);
    return [list];
  }
  return collection.lists.filter(({ status }) => includeArchived || status === "active")
    .sort((left, right) => left.name.localeCompare(right.name, "da-DK"));
};

export const saveShoppingList = async (
  ownerSubject: string,
  storage: ShoppingListStorage,
  input: { name: string; type: ShoppingListType; lines: ShoppingListLine[]; list?: string; expected_revision?: number },
  now = new Date(),
): Promise<ShoppingList> => {
  const ownerScope = ownerScopeFor(ownerSubject);
  const collection = await storage.read(ownerScope);
  const name = z.string().trim().min(1).max(120).parse(input.name);
  const normalizedName = normalizeShoppingListName(name);
  const lines = z.array(shoppingListLineSchema).max(MAX_SHOPPING_LIST_LINES).parse(input.lines);
  const timestamp = now.toISOString();
  if (!input.list) {
    if (input.expected_revision !== undefined) throw new NemligError("A new shopping list does not have an existing revision.");
    if (collection.lists.length >= MAX_SHOPPING_LISTS) throw new NemligError(`You can keep up to ${MAX_SHOPPING_LISTS} shopping lists.`);
    assertNameAvailable(collection, normalizedName);
    const created = shoppingListSchema.parse({ schema_version: 2, id: randomUUID(), name, normalized_name: normalizedName, type: input.type, status: "active", revision: 1, created_at: timestamp, updated_at: timestamp, lines });
    await replaceCollection(storage, collection, [...collection.lists, created]);
    return created;
  }
  const current = findList(collection, input.list);
  if (!current) throw new NemligError(`Shopping list “${input.list}” was not found.`);
  if (input.expected_revision !== current.revision) throw new NemligError(`“${current.name}” changed. Open it again before saving.`);
  assertNameAvailable(collection, normalizedName, current.id);
  const updated = shoppingListSchema.parse({ ...current, name, normalized_name: normalizedName, type: input.type, lines, revision: current.revision + 1, updated_at: timestamp });
  await replaceCollection(storage, collection, collection.lists.map((list) => list.id === current.id ? updated : list));
  return updated;
};

export const copyShoppingList = async (
  ownerSubject: string,
  storage: ShoppingListStorage,
  source: string,
  name: string,
  type?: ShoppingListType,
  now = new Date(),
): Promise<ShoppingList> => {
  const [current] = await showShoppingLists(ownerSubject, storage, source, true);
  return saveShoppingList(ownerSubject, storage, { name, type: type ?? current!.type, lines: current!.lines }, now);
};

export const setShoppingListStatus = async (
  ownerSubject: string,
  storage: ShoppingListStorage,
  selector: string,
  status: ShoppingListStatus,
  expectedRevision: number,
  now = new Date(),
): Promise<ShoppingList> => {
  const collection = await storage.read(ownerScopeFor(ownerSubject));
  const current = findList(collection, selector);
  if (!current) throw new NemligError(`Shopping list “${selector}” was not found.`);
  if (current.revision !== expectedRevision) throw new NemligError(`“${current.name}” changed. Open it again before updating it.`);
  if (current.status === status) return current;
  if (status === "active") assertNameAvailable(collection, current.normalized_name, current.id);
  const timestamp = now.toISOString();
  const updated = shoppingListSchema.parse({ ...current, status, revision: current.revision + 1, updated_at: timestamp, archived_at: status === "archived" ? timestamp : undefined });
  await replaceCollection(storage, collection, collection.lists.map((list) => list.id === current.id ? updated : list));
  return updated;
};

export const migrateShoppingPlan = async (
  ownerSubject: string,
  listStorage: ShoppingListStorage,
  snapshotStorage: PlanSnapshotStorage,
  savedPlan: string,
  name: string,
  type: ShoppingListType,
  now = new Date(),
): Promise<ShoppingList> => {
  const plan = await loadShoppingPlan(savedPlan, snapshotStorage);
  const lines = plan.lines.map(({ selected_product_id, ...line }) => ({ ...line, preferred_product_id: selected_product_id }));
  return saveShoppingList(ownerSubject, listStorage, { name, type, lines }, now);
};
