import {
  serializedLocalBasketFailureCode,
  type LocalBasketCommand,
} from "./local-basket.js";
import { localBasketCapability } from "./local-basket-capability.js";
import { productViewSchema } from "./product-view-schema.js";
import { z } from "zod";

const INTERNAL_CREDENTIAL_HEADERS = [
  "authorization",
  "x-nemlig-credential-envelope",
  "x-nemlig-principal-key",
  "x-nemlig-policy-revision",
  "x-nemlig-credential-generation",
] as const;

const MAX_CALLBACK_BODY_BYTES = 8 * 1024 * 1024;
const MAX_LINE_RECORD_BYTES = 1024 * 1024;
const basketIdSchema = z.string().uuid();
const localLineSchema = z
  .object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
    view: productViewSchema,
  })
  .superRefine((line, context) => {
    const viewedId =
      line.view.status === "complete"
        ? line.view.product.id
        : line.view.product_id;
    if (viewedId !== line.productId) {
      context.addIssue({ code: "custom", message: "Product ID mismatch." });
    }
  })
  .transform(({ view, ...line }) => ({
    ...line,
    // Review approval describes a one-time action, never a recovered authority.
    view: view.status === "complete" ? { ...view, review: undefined } : view,
  }))
  .refine(
    (line) =>
      new TextEncoder().encode(JSON.stringify(line)).byteLength <=
      MAX_LINE_RECORD_BYTES,
  );
const linesSchema = z.array(localLineSchema).min(1).max(500);
const editSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("append"), lines: linesSchema }),
  z.object({
    kind: z.literal("quantity"),
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("replace"),
    productId: z.number().int().positive(),
    line: localLineSchema,
  }),
  z
    .object({
      kind: z.literal("remove"),
      productIds: z.array(z.number().int().positive()).min(1).max(500),
    })
    .refine(({ productIds }) => new Set(productIds).size === productIds.length),
  z.object({ kind: z.literal("attempt-submission") }),
  z.object({ kind: z.literal("complete-submission") }),
]);
const callbackCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("list") }),
  z.object({
    kind: z.literal("selection"),
    selectionKey: z.string().min(1).max(128),
  }),
  z.object({
    kind: z.literal("create"),
    lines: linesSchema,
    selectionKey: z.string().min(1).max(128).optional(),
  }),
  z.object({ kind: z.literal("read"), basketId: basketIdSchema }),
  z.object({
    kind: z.literal("select"),
    basketId: basketIdSchema,
    selectionKey: z.string().min(1).max(128).optional(),
  }),
  z.object({
    kind: z.literal("heartbeat"),
    basketId: basketIdSchema,
    selectionKey: z.string().min(1).max(128).optional(),
  }),
  z.object({ kind: z.literal("delete"), basketId: basketIdSchema }),
  z.object({
    kind: z.literal("edit"),
    basketId: basketIdSchema,
    edit: editSchema,
    expectedRevision: z.number().int().nonnegative().optional(),
  }),
]);

const storageFailureResponse = (error: unknown): Response => {
  const code = serializedLocalBasketFailureCode(error);
  if (code === "LOCAL_BASKET_NOT_FOUND") {
    return new Response("Local basket is unavailable.", { status: 404 });
  }
  if (code === "LOCAL_BASKET_CONFLICT") {
    return new Response(
      "Local basket changed. Refresh it before trying again.",
      {
        status: 409,
      },
    );
  }
  return new Response("Local basket storage is temporarily unavailable.", {
    status: 500,
  });
};
const readBoundedJson = async (request: Request): Promise<unknown> => {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CALLBACK_BODY_BYTES) {
    throw new Error("too_large");
  }
  const reader = request.body?.getReader();
  if (!reader) {
    throw new Error("empty");
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    bytes += value.byteLength;
    if (bytes > MAX_CALLBACK_BODY_BYTES) {
      await reader.cancel();
      throw new Error("too_large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
};

export interface LocalBasketStateStorage {
  idFromName(name: string): unknown;
  get(id: unknown): {
    mutate(ownerId: string, command: LocalBasketCommand): Promise<unknown>;
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
  resolveOwner: (capability: string) => Promise<string | undefined>,
): Promise<Response> => {
  const capability = localBasketCapability(request);
  const ownerId = capability ? await resolveOwner(capability) : undefined;
  if (!ownerId) {
    return new Response("Local basket state is unavailable.", { status: 403 });
  }
  if (INTERNAL_CREDENTIAL_HEADERS.some((name) => request.headers.has(name))) {
    return new Response("Local basket state is unavailable.", { status: 403 });
  }
  const url = new URL(request.url);
  if (url.pathname !== "/inventory") {
    return new Response("Not found", { status: 404 });
  }
  const storage = storageNamespace.get(storageNamespace.idFromName(ownerId));
  if (request.method === "GET") {
    try {
      return Response.json(await storage.mutate(ownerId, { kind: "list" }));
    } catch (error) {
      return storageFailureResponse(error);
    }
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let command: unknown;
  try {
    command = await readBoundedJson(request);
  } catch {
    return new Response("Invalid or oversized Local basket operation.", {
      status: 400,
    });
  }
  const parsed = callbackCommandSchema.safeParse(command);
  if (!parsed.success) {
    return new Response("Invalid Local basket operation.", { status: 400 });
  }
  try {
    return Response.json(
      await storage.mutate(ownerId, parsed.data as LocalBasketCommand),
    );
  } catch (error) {
    return storageFailureResponse(error);
  }
};
