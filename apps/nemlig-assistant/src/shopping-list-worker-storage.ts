import { storedShoppingListCollectionSchema, type ShoppingListCollection } from "./shopping-list-model.js";

export interface ShoppingListObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  transaction<T>(closure: () => Promise<T>): Promise<T>;
}

export async function handleShoppingListStorageRequest(
  request: Request,
  ownerScope: string,
  storage: ShoppingListObjectStorage,
): Promise<Response> {
  const respond = (body: BodyInit | null, status: number, event: string): Response => {
    console.log(JSON.stringify({ event, method: request.method, status }));
    return new Response(body, { status });
  };
  if (!/^[0-9a-f]{64}$/u.test(ownerScope)) return respond("Invalid owner scope", 400, "shopping_list_storage_scope_rejected");
  const key = `lists:${ownerScope}`;
  if (request.method === "GET") {
    const collection = await storage.get<ShoppingListCollection>(key) ?? {
      schema_version: 2 as const, owner_scope: ownerScope, generation: 0, lists: [],
    };
    console.log(JSON.stringify({ event: "shopping_list_storage_read", method: request.method, status: 200 }));
    return Response.json(collection);
  }
  if (request.method !== "PUT") return respond("Method not allowed", 405, "shopping_list_storage_method_rejected");
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared < 0 || declared > 1_048_576) return new Response("Too large", { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 1_048_576) return new Response("Too large", { status: 413 });
  const expectedGeneration = Number(request.headers.get("if-match"));
  if (!Number.isInteger(expectedGeneration) || expectedGeneration < 0) return new Response("Invalid revision", { status: 400 });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return new Response("Invalid shopping-list collection", { status: 400 }); }
  const parsed = storedShoppingListCollectionSchema.safeParse(raw);
  if (!parsed.success || parsed.data.owner_scope !== ownerScope || parsed.data.generation !== expectedGeneration + 1) {
    return new Response("Invalid shopping-list collection", { status: 400 });
  }
  const replaced = await storage.transaction(async () => {
    const current = await storage.get<ShoppingListCollection>(key);
    if ((current?.generation ?? 0) !== expectedGeneration) return false;
    await storage.put(key, parsed.data);
    return true;
  });
  return respond(replaced ? "Updated" : "Conflict", replaced ? 200 : 409, replaced ? "shopping_list_storage_updated" : "shopping_list_storage_conflict");
}
