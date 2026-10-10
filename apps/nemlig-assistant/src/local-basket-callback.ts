import type { OwnerLocalBasketInventory } from "./local-basket.js";
import { localBasketCapabilityOwner } from "./local-basket-capability.js";

const INTERNAL_CREDENTIAL_HEADERS = [
  "authorization",
  "x-nemlig-credential-envelope",
  "x-nemlig-principal-key",
  "x-nemlig-policy-revision",
  "x-nemlig-credential-generation",
] as const;

export interface LocalBasketStateStorage {
  idFromName(name: string): unknown;
  get(id: unknown): {
    read(ownerId: string): Promise<OwnerLocalBasketInventory>;
  };
}

/**
 * Container egress reaches this Worker-owned callback only while an admitted
 * gateway request holds a capability. The owner comes from that capability,
 * never from Container JSON.
 */
export const handleLocalBasketStateRequest = async (
  request: Request,
  storageNamespace: LocalBasketStateStorage,
): Promise<Response> => {
  const ownerId = localBasketCapabilityOwner(request);
  if (!ownerId) {
    return new Response("Local basket state is unavailable.", { status: 403 });
  }
  if (INTERNAL_CREDENTIAL_HEADERS.some((name) => request.headers.has(name))) {
    return new Response("Local basket state is unavailable.", { status: 403 });
  }
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== "/inventory") {
    return new Response("Not found", { status: 404 });
  }
  return Response.json(
    await storageNamespace
      .get(storageNamespace.idFromName(ownerId))
      .read(ownerId),
  );
};
