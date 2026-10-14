import {
  serializedLocalBasketFailureCode,
  type LocalBasketCommand,
} from "./local-basket.js";
import { localBasketCapability } from "./local-basket-capability.js";
import { z } from "zod";

const INTERNAL_CREDENTIAL_HEADERS = [
  "authorization",
  "x-nemlig-credential-envelope",
  "x-nemlig-principal-key",
  "x-nemlig-policy-revision",
  "x-nemlig-credential-generation",
] as const;

const MAX_CALLBACK_BODY_BYTES = 8 * 1024 * 1024;
const reviewOperationSchema = z
  .object({
    operationId: z.string().min(1).max(128),
    generation: z.string().min(1).max(128),
    accountIdentity: z.string().min(1).max(512),
    kind: z.enum(["save", "update", "submit", "basket-save"]),
    name: z.string().min(1).max(512),
    createAttempted: z.boolean().optional(),
    dispatchAttempted: z.boolean().optional(),
    completed: z.boolean().optional(),
    cleanupStatus: z
      .enum(["pending", "deleted", "retained", "uncertain"])
      .optional(),
    cleanupWarning: z.string().max(500).optional(),
    listId: z.number().int().positive().optional(),
    items: z
      .array(
        z.object({
          productId: z.number().int().positive(),
          quantity: z.number().int().positive(),
        }),
      )
      .max(500),
    baseline: z
      .array(
        z.object({
          productId: z.number().int().positive(),
          quantity: z.number().int().positive(),
        }),
      )
      .max(500)
      .optional(),
    progress: z
      .object({
        completed: z.number().int().nonnegative(),
        total: z.number().int().positive().max(500),
      })
      .optional(),
    completedUntil: z.number().int().nonnegative().optional(),
  })
  .superRefine((operation, context) => {
    if (operation.kind === "save" && !operation.items.length) {
      context.addIssue({ code: "custom", message: "Save intent is empty." });
    }
  });
const callbackCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("review-operation-read"),
    operationId: z.string().min(1).max(128),
  }),
  z.object({
    kind: z.literal("review-operation-claim"),
    operationId: z.string().min(1).max(128),
    generation: z.string().min(1).max(128),
  }),
  z.object({
    kind: z.literal("review-operation-release"),
    operationId: z.string().min(1).max(128),
    generation: z.string().min(1).max(128),
  }),
  z.object({
    kind: z.literal("review-operation-write"),
    operation: reviewOperationSchema,
  }),
  z.object({
    kind: z.literal("review-operation-complete"),
    operationId: z.string().min(1).max(128),
    generation: z.string().min(1).max(128),
  }),
]);

const storageFailureResponse = (error: unknown): Response => {
  if (
    serializedLocalBasketFailureCode(error) ===
    "LOCAL_BASKET_OPERATION_CAPACITY"
  ) {
    return new Response(
      "Shopping-list recovery storage is full. This Save, Update, or Submit did not reach Nemlig; use an existing list and do not retry an uncertain transfer.",
      { status: 429 },
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
  const storage = storageNamespace.get(storageNamespace.idFromName(ownerId));
  try {
    return Response.json(
      (await storage.mutate(ownerId, parsed.data as LocalBasketCommand)) ??
        null,
    );
  } catch (error) {
    return storageFailureResponse(error);
  }
};
