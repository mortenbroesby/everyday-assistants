#!/usr/bin/env node

import {
  inputRequired,
  McpServer,
  SUPPORTED_PROTOCOL_VERSIONS,
  type StandardSchemaWithJSON,
  type ToolAnnotations,
  type ToolCallback,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import { NemligError, type ShoppingClient } from "./client.js";
import {
  ensureLoggedIn,
  getClient,
  NEMLIG_CODENAME,
  NEMLIG_VERSION,
  withAuthenticatedReadRetry,
} from "./runtime.js";
import { getCredentials, type Credentials } from "./config.js";
import { BasketProposalService, basketPayload } from "./proposals.js";
import {
  IMAGE_ORIGINS,
  createProductViewFromSummary,
  createProductViews,
  type ProductSummaryFacts,
  type ProductView,
} from "./product-presentation.js";
import {
  PRODUCT_VIEWER_CONNECT_DOMAINS,
  PRODUCT_VIEWER_MIME_TYPE,
  PRODUCT_VIEWER_RESOURCE_DOMAINS,
  PRODUCT_VIEWER_RESOURCE_METADATA,
  PRODUCT_VIEWER_RESOURCE_URI,
  productViewsToText,
  renderProductViewerHtml,
} from "./product-viewer.js";
import { RETIRED_PRODUCT_VIEWER_RESOURCE_URIS } from "./product-viewer-identity.js";
import { renderRetiredProductViewerHtml } from "./retired-product-viewer.js";
import {
  MAX_DRAFT_PRODUCTS,
  ProductReviewService,
  type ReviewOperationJournal,
} from "./product-review.js";
import { candidateSchema, productViewSchema } from "./product-view-schema.js";
import { resolveDetailedProductSearch } from "./product-discovery.js";
import {
  parseProductDiscoveryEvent,
  type ProductDiscoveryEvent,
} from "./cloudflare-observability.js";
import { NEMLIG_ASSISTANT_ICON } from "./nemlig-assistant-icon.js";
import type { LocalBasketRepository } from "./product-review.js";
import type { LocalBasketCommand } from "./local-basket.js";

export const NEMLIG_CONNECT_URL = "https://nemlig-mcp.broesby.dk/connect";
export const NEMLIG_IMAGE_ORIGINS = IMAGE_ORIGINS;

const productDiscoveryDiagnostic = (
  event: Omit<ProductDiscoveryEvent, "schema_version" | "event">,
): void => {
  console.log(
    JSON.stringify(
      parseProductDiscoveryEvent({
        schema_version: 1,
        event: "product_discovery_diagnostic",
        ...event,
      }),
    ),
  );
};

/**
 * Server-derived request identity that scopes private state and invalidates it
 * when policy changes; it is never a user credential.
 */
export interface McpRequestContext {
  principalKey: string;
  policyRevision: string;
  localBasketCapability?: string;
  kind?: "service";
}

export const serviceAcceptanceToolInventory = [
  "find_groceries",
  "show_my_basket",
] as const;
export const serviceAcceptanceResourceInventory = [
  PRODUCT_VIEWER_RESOURCE_URI,
  ...RETIRED_PRODUCT_VIEWER_RESOURCE_URIS,
] as const;

const reviewSnapshotSchema = z.object({
  draftId: z.string().uuid().optional(),
  draftExpiresAt: z.number().int().nonnegative().optional(),
  shoppingListId: z.number().int().positive().optional(),
  shoppingListName: z.string().optional(),
  saveStatus: z.enum(["saving", "saved", "partial", "uncertain"]).optional(),
  shoppingListDirty: z.boolean().optional(),
  updateStatus: z.enum(["saving", "partial", "uncertain"]).optional(),
  conflictItems: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        quantity: z.number().int().positive(),
        state: z.enum(["needs-review", "ready"]),
        view: productViewSchema,
      }),
    )
    .optional(),
  saveProgress: z
    .object({
      completed: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })
    .strict()
    .optional(),
  actionNotice: z.string().max(300).optional(),
  basketId: z.string().uuid().optional(),
  revision: z.number().int().nonnegative().optional(),
  submissionAttempted: z.boolean().optional(),
  destination: z.enum(["needs-review", "ready", "alternatives"]),
  items: z.array(
    z.object({
      product_id: z.number().int().positive(),
      quantity: z.number().int().positive(),
      state: z.enum(["needs-review", "ready"]),
      view: productViewSchema,
    }),
  ),
  alternatives: z
    .object({
      product_id: z.number().int().positive(),
      origin: z.enum(["needs-review", "ready"]),
      query: z.string(),
      views: z.array(productViewSchema),
    })
    .optional(),
  submission: z
    .object({
      submission_id: z.string().uuid(),
      status: z.enum(["prepared", "submitted", "uncertain", "partial"]),
      verified_additions: z.number().int().nonnegative().optional(),
      cleanup_warning: z.string().optional(),
      skipped_products: z
        .array(
          z.object({
            product_id: z.number().int().positive(),
            name: z.string(),
          }),
        )
        .optional(),
      expires_at: z.string(),
      review: z.record(z.string(), z.unknown()),
    })
    .optional(),
});
const showReviewActionSchema = z.object({ kind: z.literal("show") });
const endReviewActionSchema = z.object({ kind: z.literal("end") });
const localActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("list") }),
  z.object({ kind: z.literal("select") }),
  z.object({ kind: z.literal("delete") }),
  z.object({ kind: z.literal("heartbeat") }),
]);
const addReviewActionSchema = z.object({
  kind: z.literal("add"),
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(MAX_DRAFT_PRODUCTS),
});
const prepareReviewActionSchema = z.object({
  kind: z.literal("prepare_submission"),
});
const saveReviewActionSchema = z.object({
  kind: z.literal("save"),
  name: z.string().trim().min(1).max(30),
});
const updateShoppingListActionSchema = z.object({
  kind: z.literal("update"),
});
const discardPendingUpdateActionSchema = z.object({
  kind: z.literal("discard_pending_update"),
});
const removeReviewActionSchema = z.object({
  kind: z.literal("remove"),
  product_ids: z
    .array(z.number().int().positive())
    .min(1)
    .max(MAX_DRAFT_PRODUCTS),
});
const quantityReviewActionSchema = z.object({
  kind: z.literal("quantity"),
  product_id: z.number().int().positive(),
  quantity: z.number().int().positive(),
});
const navigateReviewActionSchema = z.object({
  kind: z.literal("navigate"),
  destination: z.enum(["needs-review", "ready", "alternatives"]),
});
const alternativesReviewActionSchema = z.object({
  kind: z.literal("alternatives"),
  product_id: z.number().int().positive(),
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().positive().optional(),
});
const replaceReviewActionSchema = z.object({
  kind: z.literal("replace"),
  product_id: z.number().int().positive(),
  replacement_id: z.number().int().positive(),
});
const modelReviewActionSchema = z.discriminatedUnion("kind", [
  showReviewActionSchema,
  endReviewActionSchema,
  ...localActionSchema.options,
  addReviewActionSchema,
  saveReviewActionSchema,
  updateShoppingListActionSchema,
  discardPendingUpdateActionSchema,
  prepareReviewActionSchema,
  removeReviewActionSchema,
  quantityReviewActionSchema,
  navigateReviewActionSchema,
  alternativesReviewActionSchema,
  replaceReviewActionSchema,
]);
// Older mounted cards may still send these actions; the service rejects them without changing state.
const reviewActionSchema = z.discriminatedUnion("kind", [
  showReviewActionSchema,
  endReviewActionSchema,
  ...localActionSchema.options,
  addReviewActionSchema,
  saveReviewActionSchema,
  updateShoppingListActionSchema,
  discardPendingUpdateActionSchema,
  z.object({
    kind: z.literal("revisit"),
    product_ids: z
      .array(z.number().int().positive())
      .min(1)
      .max(MAX_DRAFT_PRODUCTS),
  }),
  prepareReviewActionSchema,
  z.object({
    kind: z.literal("accept"),
    product_ids: z
      .array(z.number().int().positive())
      .min(1)
      .max(MAX_DRAFT_PRODUCTS),
  }),
  removeReviewActionSchema,
  quantityReviewActionSchema,
  navigateReviewActionSchema,
  alternativesReviewActionSchema,
  replaceReviewActionSchema,
]);
const reviewTargetFields = {
  basket_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Legacy Local basket ID. It only opens native shopping lists and is never read or changed.",
    ),
  draft_id: z
    .string()
    .uuid()
    .optional()
    .describe("Exact process-local unsaved draft ID from this card."),
  shopping_list_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Exact native Nemlig shopping-list ID from this card."),
};
const reviewInputSchema = <Action extends z.ZodTypeAny>(action: Action) =>
  z
    .object({ ...reviewTargetFields, action })
    .strict()
    .refine(
      ({ basket_id, draft_id, shopping_list_id }) =>
        [basket_id, draft_id, shopping_list_id].filter(
          (target) => target !== undefined,
        ).length <= 1,
      { message: "Target exactly one draft or shopping list." },
    );
const submitReviewInputSchema = <Submission extends z.ZodTypeAny>(
  submissionId: Submission,
) =>
  z
    .object({
      basket_id: reviewTargetFields.basket_id,
      shopping_list_id: reviewTargetFields.shopping_list_id,
      submission_id: submissionId,
    })
    .strict()
    .refine(
      ({ basket_id, shopping_list_id }) => !(basket_id && shopping_list_id),
      {
        message:
          "Target one exact native shopping list or legacy Local basket.",
      },
    );

export type Candidate = z.infer<typeof candidateSchema>;

const basketItemSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().optional(),
  quantity: z.number().optional(),
  total: z.number().optional(),
});

const basketSchema = z.object({
  items: z.array(basketItemSchema),
  products_price: z.number().optional(),
  delivery_price: z.number().optional(),
  number_of_products: z.number().optional(),
  delivery_time: z.string().optional(),
});
const basketResultSchema = basketSchema.extend({
  views: z.array(productViewSchema),
});
const applyResultSchema = z.object({
  status: z.literal("completed"),
  operation: z.literal("additions"),
  replayed: z.boolean(),
  basket: basketSchema,
  verified_additions: z.number().int().nonnegative().optional(),
  cleanup_warning: z.string().optional(),
  skipped_products: z
    .array(
      z.object({ product_id: z.number().int().positive(), name: z.string() }),
    )
    .optional(),
  views: z.array(productViewSchema).optional(),
});

export { rankProducts, safeNemligImageUrl } from "./product-presentation.js";

const currency = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "DKK",
});
const kr = (value: unknown): string =>
  typeof value === "number"
    ? currency.format(value).replaceAll("\u00a0", " ")
    : "ukendt pris";
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const lineText = (value: unknown, showSize = false): string => {
  const line = record(value);
  const size =
    showSize && typeof line.unit_size === "string" && line.unit_size
      ? ` (${line.unit_size})`
      : "";
  const quantity =
    typeof line.quantity === "number" ? String(line.quantity) : "Ukendt antal";
  return `${quantity} × ${typeof line.name === "string" ? line.name : "Ukendt vare"}${size} · ${kr(line.line_total ?? line.total)}`;
};
const basketText = (value: unknown, applied = false): string => {
  const basket = record(value);
  const items = Array.isArray(basket.items) ? basket.items : [];
  if (!items.length) {
    return applied ? "Kurven er nu tom." : "Kurven er tom.";
  }
  return `Kurven indeholder nu:\n${items.map((item) => lineText(item)).join("\n")}\nVarer i alt: ${kr(basket.products_price)}`;
};
const summaryFacts = (value: unknown): ProductSummaryFacts => {
  const item = record(value);
  const id =
    typeof item.product_id === "number"
      ? item.product_id
      : typeof item.id === "number"
        ? item.id
        : undefined;
  const labels = Array.isArray(item.labels)
    ? item.labels.filter((label): label is string => typeof label === "string")
    : undefined;
  return {
    ...(id === undefined ? {} : { id }),
    ...(typeof item.name === "string" ? { name: item.name } : {}),
    ...(typeof item.item_price === "number"
      ? { price: item.item_price }
      : typeof item.price === "number"
        ? { price: item.price }
        : {}),
    ...(typeof item.unit_price === "number"
      ? { unit_price: item.unit_price }
      : {}),
    ...(typeof item.unit === "string" ? { unit: item.unit } : {}),
    ...(typeof item.unit_size === "string"
      ? { unit_size: item.unit_size }
      : {}),
    ...(typeof item.category === "string" ? { category: item.category } : {}),
    ...(typeof item.subcategory === "string"
      ? { subcategory: item.subcategory }
      : {}),
    ...(typeof item.quantity === "number" ? { quantity: item.quantity } : {}),
    ...(typeof item.line_total === "number"
      ? { line_total: item.line_total }
      : typeof item.total === "number"
        ? { line_total: item.total }
        : {}),
    ...(typeof item.available === "boolean"
      ? { available: item.available }
      : {}),
    ...(labels === undefined ? {} : { labels }),
  };
};
const basketProductViews = (basket: unknown): ProductView[] => {
  const items = record(basket).items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => {
    const facts = summaryFacts(item);
    return createProductViewFromSummary(facts, {
      kind: "basket",
      quantity: facts.quantity,
      line_total: facts.line_total,
    });
  });
};
const success = (value: unknown, text = JSON.stringify(value)) => ({
  content: [{ type: "text" as const, text }],
  structuredContent: (Array.isArray(value)
    ? { result: value }
    : value) as Record<string, unknown>,
});

const failure = (operation: string, error: unknown) => ({
  isError: true,
  content: [
    {
      type: "text" as const,
      text:
        error instanceof NemligError ? error.message : `${operation} failed.`,
    },
  ],
});

const runMcpOperation = async <Result>(
  operation: string,
  action: () => Promise<Result>,
): Promise<Result | ReturnType<typeof failure>> => {
  try {
    return await action();
  } catch (error) {
    return failure(operation, error);
  }
};
class LocalBasketRepositoryError extends NemligError {
  override readonly name = "LocalBasketRepositoryError";
}

/** Creates the MCP catalog, with private state bound to the request principal. */
export function createMcpServer(
  client: ShoppingClient = getClient(),
  loadCredentials: () => Promise<Credentials | undefined> = getCredentials,
  env: NodeJS.ProcessEnv = process.env,
  proposals: BasketProposalService = new BasketProposalService(client),
  requestContext?: McpRequestContext,
  reviews: ProductReviewService = new ProductReviewService(client, {
    proposals,
  }),
): McpServer {
  const server = new McpServer(
    {
      name: "nemlig-assistant",
      title: "Nemlig Assistant",
      version: NEMLIG_VERSION,
      icons: [
        {
          src: NEMLIG_ASSISTANT_ICON,
          mimeType: "image/svg+xml",
          sizes: ["1024x1024"],
        },
      ],
    },
    {
      instructions: `Search Nemlig products with find_groceries, read the actual basket with show_my_basket, and use native Nemlig shopping lists to review products before adding them.

The real Nemlig basket is add-only. Never remove, decrease, replace, swap, clear, check out, pay, order, or select delivery slots. Added quantities are additional units. Local basket edits never write to Nemlig.

For discovery, use a concise Danish catalogue phrase and preserve a distinctive brand when useful. Search results describe one provider response, not the entire catalogue; an empty result differs from a failure. Search and conversation edits do not open cards. When the user asks to see products visually, use start_product_review with exact returned IDs and quantities. Omit items in start_product_review to show the native shopping-list picker. New products start in an unsaved draft; only explicit Save creates a native shopping list. Native-list edits stay staged until explicit Update verifies the same list. Honor explicit requests not to start a draft, save a list, or edit a saved list; continue in text. Existing Local basket cards are stale: show the native shopping-list picker and never read, edit, delete, or submit their old Local basket IDs. Use update_product_review_conversation for model-side list and draft operations. After an unconfirmed action, show current state; never replay it.

Only an explicit Submit action from a clean, saved native shopping list may add to the actual basket. Submit uses that exact list ID once, verifies additive basket readback, keeps the source list, and never retries an uncertain transfer. Nemlig may change a list concurrently between the final check and dispatch; report this limitation without claiming atomicity. Searching, drafts, Save, and Update never change the actual basket.

When a stale card supplies basket_id without a draft_id or shopping_list_id, show native shopping lists and explain that the old Local basket is no longer active. Never infer a native list from an old basket ID or matching name. Direct stdio use is process-local and text-only. A tool result or image URL does not prove ChatGPT rendered a card; provide a text fallback when needed. check_nemlig_connection distinguishes Nemlig account access from ChatGPT app connection and directs users to the secure page without collecting credentials in chat.`,
      supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    },
  );
  const allowedTools =
    requestContext?.kind === "service"
      ? new Set<string>(serviceAcceptanceToolInventory)
      : undefined;
  const securitySchemes = [
    {
      type: "oauth2",
      scopes: [env.NEMLIG_MCP_REQUIRED_SCOPE?.trim() || "use:nemlig-assistant"],
    },
  ];
  const registerTool = <InputArgs extends StandardSchemaWithJSON | undefined>(
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: InputArgs;
      outputSchema?: StandardSchemaWithJSON;
      annotations?: ToolAnnotations;
      _meta?: Record<string, unknown>;
    },
    handler: ToolCallback<InputArgs>,
  ) => {
    if (allowedTools && !allowedTools.has(name)) {
      return undefined;
    }
    return server.registerTool(
      name,
      {
        ...config,
        _meta: { ...config._meta, securitySchemes },
      },
      handler,
    );
  };
  server.registerResource(
    "nemlig-product-viewer",
    PRODUCT_VIEWER_RESOURCE_URI,
    {
      title: "Nemlig Assistant",
      description:
        "Products and the shared Local basket supplied by Nemlig Assistant.",
      mimeType: PRODUCT_VIEWER_MIME_TYPE,
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: PRODUCT_VIEWER_MIME_TYPE,
          text: renderProductViewerHtml(),
          _meta: {
            ui: {
              csp: {
                connectDomains: [...PRODUCT_VIEWER_CONNECT_DOMAINS],
                resourceDomains: [...PRODUCT_VIEWER_RESOURCE_DOMAINS],
              },
              prefersBorder: true,
            },
          },
        },
      ],
    }),
  );
  for (const [index, uri] of RETIRED_PRODUCT_VIEWER_RESOURCE_URIS.entries()) {
    server.registerResource(
      `nemlig-retired-product-viewer-v${index}`,
      uri,
      {
        title: "Updated Local basket",
        description:
          "This retired Local basket card is inert and contains no shopping data.",
        mimeType: PRODUCT_VIEWER_MIME_TYPE,
      },
      async (resource) => ({
        contents: [
          {
            uri: resource.href,
            mimeType: PRODUCT_VIEWER_MIME_TYPE,
            text: renderRetiredProductViewerHtml(),
          },
        ],
      }),
    );
  }
  const localConnectionId = randomUUID();
  const reviewOwner = (ctx: ServerContext): string => {
    const session = ctx.mcpReq._meta?.["openai/session"];
    if (
      session !== undefined &&
      (typeof session !== "string" || !session.trim() || session.length > 512)
    ) {
      throw new NemligError("Invalid shopping session context.");
    }
    if (requestContext) {
      return requestContext.principalKey;
    }
    return ctx.sessionId ?? localConnectionId;
  };
  const localBasketRepository = (
    signal: AbortSignal,
  ): LocalBasketRepository | undefined => {
    const capability = requestContext?.localBasketCapability;
    if (!capability) {
      if (requestContext) {
        throw new NemligError(
          "Local basket state is unavailable for this request.",
        );
      }
      return undefined;
    }
    return {
      async mutate(command: LocalBasketCommand): Promise<unknown> {
        let response: Response;
        try {
          response = await fetch(
            "http://local-basket-state.internal/inventory",
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-nemlig-local-basket-capability": capability,
              },
              body: JSON.stringify(command),
              signal,
            },
          );
        } catch (error) {
          if (signal.aborted) {
            throw error;
          }
          throw new LocalBasketRepositoryError(
            "Local basket storage is temporarily unavailable. Refresh its state before continuing.",
            503,
          );
        }
        if (!response.ok) {
          const status = response.status;
          const message =
            status === 404
              ? "Local basket is unavailable. Refresh it."
              : status === 409
                ? "Local basket changed or is busy. Refresh before trying again."
                : status === 429
                  ? "Shopping-list recovery storage is full. This Save, Update, or Submit did not reach Nemlig; use an existing list and do not retry an uncertain transfer."
                  : status === 403
                    ? "Local basket access is not authorized for this request."
                    : "Local basket storage is temporarily unavailable. Refresh its state before continuing.";
          throw new LocalBasketRepositoryError(message, status);
        }
        return response.json();
      },
    };
  };
  const reviewOperationJournal = (
    signal: AbortSignal,
  ): ReviewOperationJournal | undefined => {
    const repository = localBasketRepository(signal);
    if (!repository) {
      return undefined;
    }
    return {
      async read(operationId) {
        return (await repository.mutate({
          kind: "review-operation-read",
          operationId,
        })) as Awaited<ReturnType<ReviewOperationJournal["read"]>>;
      },
      async claim(operationId, generation) {
        return (await repository.mutate({
          kind: "review-operation-claim",
          operationId,
          generation,
        })) as boolean;
      },
      async release(operationId, generation) {
        return (await repository.mutate({
          kind: "review-operation-release",
          operationId,
          generation,
        })) as boolean;
      },
      async write(operation) {
        await repository.mutate({
          kind: "review-operation-write",
          operation,
        });
      },
      async complete(operationId, generation) {
        await repository.mutate({
          kind: "review-operation-complete",
          operationId,
          generation,
        });
      },
    };
  };
  const basketSummarySchema = z.object({
    basketId: z.string().uuid(),
    createdAt: z.number().int().nonnegative(),
    lastActivityAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    productCount: z.number().int().nonnegative(),
    submissionAttempted: z.boolean(),
  });
  const durableReviewResultSchema = z.object({
    review: reviewSnapshotSchema.optional(),
    result: applyResultSchema.optional(),
    baskets: z.array(basketSummarySchema).optional(),
    selectedBasketId: z.string().uuid().nullable().optional(),
    shoppingLists: z
      .array(
        z.object({
          id: z.number().int().positive(),
          name: z.string(),
          productCount: z.number().int().nonnegative().optional(),
          totalAmount: z.number().finite().optional(),
        }),
      )
      .optional(),
    selectedShoppingListId: z.number().int().positive().nullable().optional(),
    selectionRequired: z.boolean().optional(),
    unavailable: z.literal(true).optional(),
    ended: z.literal(true).optional(),
  });
  // Keep process-local draft actions separate from durable and native targets.
  // fallow-ignore-next-line complexity
  const updateDraft = async (
    owner: string,
    action: z.infer<typeof reviewActionSchema>,
    signal: AbortSignal,
    draftId?: string,
  ) => {
    if (action.kind === "show") {
      const review = reviews.active(owner, draftId);
      return review ? { review } : { unavailable: true as const };
    }
    if (action.kind === "end") {
      reviews.end(owner, draftId);
      return { ended: true as const };
    }
    if (
      action.kind === "list" ||
      action.kind === "select" ||
      action.kind === "delete" ||
      action.kind === "heartbeat"
    ) {
      throw new NemligError("Durable Local basket storage is unavailable.");
    }
    if (action.kind === "prepare_submission") {
      const review = reviews.active(owner, draftId);
      if (!review?.shoppingListId) {
        throw new NemligError(
          "Save this draft as a Nemlig shopping list before reviewing basket additions.",
        );
      }
      return { review: await reviews.prepare(owner, signal, draftId) };
    }
    const review = await reviews.update(
      owner,
      action,
      signal,
      draftId,
      reviewOperationJournal(signal),
    );
    return { review };
  };
  const updateUnsavedDraft = async (
    owner: string,
    action: z.infer<typeof reviewActionSchema>,
    signal: AbortSignal,
    draftId: string | undefined,
    unavailableText: string,
  ) => {
    const result = await updateDraft(owner, action, signal, draftId);
    return success(
      result,
      result.unavailable ? unavailableText : JSON.stringify(result),
    );
  };
  const listNativeShoppingLists = async (
    signal: AbortSignal,
    message = "Select a native Nemlig shopping list, or start a new draft.",
  ) =>
    success(
      {
        shoppingLists: await reviews.getShoppingLists(signal),
        selectedShoppingListId: null,
        selectionRequired: true,
      },
      message,
    );
  const listNativeListsForLegacyBasket = (signal: AbortSignal) =>
    listNativeShoppingLists(
      signal,
      "Local baskets are no longer active. Select a native Nemlig shopping list; saved account data was not changed.",
    );
  const updateReviewTarget = async (
    owner: string,
    action: z.infer<typeof reviewActionSchema>,
    targets: {
      basketId?: string;
      draftId?: string;
      shoppingListId?: number;
    },
    signal: AbortSignal,
  ) => {
    if (action.kind === "list") {
      return listNativeShoppingLists(signal);
    }
    if (action.kind === "select") {
      return targets.shoppingListId
        ? openNativeShoppingList(owner, targets.shoppingListId, signal)
        : listNativeShoppingLists(signal);
    }
    if (targets.shoppingListId) {
      return updateNativeShoppingList(
        owner,
        targets.shoppingListId,
        action,
        signal,
      );
    }
    if (targets.draftId) {
      if (action.kind === "discard_pending_update") {
        throw new NemligError(
          "Select the exact saved shopping list to reconcile an interrupted update.",
        );
      }
      return updateUnsavedDraft(
        owner,
        action,
        signal,
        targets.draftId,
        "Unsaved draft expired or is unavailable. Start a new draft; old cards cannot restore it.",
      );
    }
    if (
      targets.basketId ||
      action.kind === "delete" ||
      action.kind === "heartbeat"
    ) {
      return targets.basketId
        ? listNativeListsForLegacyBasket(signal)
        : listNativeShoppingLists(signal);
    }
    if (action.kind === "show" && !reviews.active(owner)) {
      return listNativeShoppingLists(signal);
    }
    return updateUnsavedDraft(
      owner,
      action,
      signal,
      undefined,
      "Unsaved draft expired or is unavailable. Start a new draft; old cards cannot restore it.",
    );
  };
  const openNativeShoppingList = async (
    owner: string,
    listId: number,
    signal: AbortSignal,
  ) => {
    try {
      return success({
        review: await reviews.openShoppingList(
          owner,
          listId,
          signal,
          reviewOperationJournal(signal),
        ),
        shoppingLists: await reviews.getShoppingLists(signal),
        selectedShoppingListId: listId,
      });
    } catch (error) {
      if (
        !(error instanceof NemligError) ||
        error.message !== "Shopping list is unavailable or was deleted."
      ) {
        throw error;
      }
      const retired = await reviews.retireDeletedNativeListUpdate(
        owner,
        listId,
        signal,
        reviewOperationJournal(signal),
      );
      if (!retired) {
        return listNativeShoppingLists(
          signal,
          "That shopping list is unavailable. Choose another list or start a draft.",
        );
      }
      return success({
        review: retired,
        shoppingLists: await reviews.getShoppingLists(signal),
        selectedShoppingListId: null,
      });
    }
  };
  // This dispatcher preserves the native list's read, edit, and no-delete boundaries.
  // fallow-ignore-next-line complexity
  const updateNativeShoppingList = async (
    owner: string,
    listId: number,
    action: z.infer<typeof reviewActionSchema>,
    signal: AbortSignal,
  ) => {
    if (action.kind === "prepare_submission") {
      if (reviews.active(owner)?.shoppingListId !== listId) {
        throw new NemligError("Select this exact shopping list again.");
      }
      return success({ review: await reviews.prepare(owner, signal) });
    }
    if (action.kind === "show") {
      return openNativeShoppingList(owner, listId, signal);
    }
    if (action.kind === "select") {
      return openNativeShoppingList(owner, listId, signal);
    }
    if (
      action.kind === "list" ||
      action.kind === "delete" ||
      action.kind === "end" ||
      action.kind === "heartbeat"
    ) {
      throw new NemligError(
        "Native shopping lists cannot be deleted or cleared here.",
      );
    }
    const review = await reviews.updateShoppingList(
      owner,
      listId,
      action,
      signal,
      reviewOperationJournal(signal),
    );
    return success({ review });
  };
  const submitProcessReview = async (
    owner: string,
    submissionId: string,
    shoppingListId: number,
    signal: AbortSignal,
  ) => {
    await ensureLoggedIn(client, loadCredentials);
    return success(
      await reviews.submit(
        owner,
        submissionId,
        shoppingListId,
        signal,
        reviewOperationJournal(signal),
      ),
    );
  };
  const submitReview = async (
    owner: string,
    basketId: string | undefined,
    shoppingListId: number | undefined,
    submissionId: string,
    signal: AbortSignal,
  ) => {
    if (basketId) {
      throw new NemligError(
        "Local basket submission is no longer supported. Select a native Nemlig shopping list.",
      );
    }
    if (shoppingListId) {
      return submitProcessReview(owner, submissionId, shoppingListId, signal);
    }
    throw new NemligError(
      "Select the exact native Nemlig shopping list before submitting.",
    );
  };

  const runAuthenticatedRead = async <Result>(
    operation: string,
    action: () => Promise<Result>,
  ) =>
    runMcpOperation(operation, () =>
      withAuthenticatedReadRetry(client, loadCredentials, action),
    );

  registerTool(
    "get_profile",
    {
      title: "Get my Nemlig profile",
      description:
        "Show the authenticated profile and the live assistant release handling this request. This does not contact Nemlig or change shopping data.",
      inputSchema: z.object({}),
      outputSchema: z
        .object({
          id: z.string().trim().min(1),
          release: z
            .object({
              version: z.string().trim().min(1),
              codename: z.string().trim().min(1),
            })
            .strict(),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: { "openai/profile": true },
    },
    async () => {
      const id = requestContext?.principalKey;
      if (!id) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "Authenticated profile unavailable.",
            },
          ],
        };
      }
      return success({
        id,
        release: { version: NEMLIG_VERSION, codename: NEMLIG_CODENAME },
      });
    },
  );

  registerTool(
    "check_nemlig_connection",
    {
      title: "Check my Nemlig connection",
      description:
        "Check whether your Nemlig account is connected. If needed, open the secure connection page; never send login details in chat.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        status: z.enum([
          "connected",
          "connection_required",
          "reconnect_required",
          "provider_unavailable",
        ]),
        connection_url: z.literal(NEMLIG_CONNECT_URL),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (_args, ctx) => {
      const credentials = await loadCredentials();
      if (
        !credentials &&
        server.server.getClientCapabilities()?.elicitation?.url
      ) {
        if (!ctx.mcpReq.inputResponses?.connect) {
          return inputRequired({
            inputRequests: {
              connect: inputRequired.elicitUrl({
                message:
                  "Open the secure Nemlig connection page. Do not enter your password in chat.",
                url: NEMLIG_CONNECT_URL,
              }),
            },
          });
        }
      }
      if (!credentials) {
        return success({
          status: "connection_required",
          connection_url: NEMLIG_CONNECT_URL,
        });
      }
      try {
        await withAuthenticatedReadRetry(
          client,
          async () => credentials,
          () => client.getCart(),
        );
        return success({
          status: "connected",
          connection_url: NEMLIG_CONNECT_URL,
        });
      } catch (error) {
        if (error instanceof NemligError && error.status === 401) {
          return success({
            status: "reconnect_required",
            connection_url: NEMLIG_CONNECT_URL,
          });
        }
        if (error instanceof NemligError) {
          return success({
            status: "provider_unavailable",
            connection_url: NEMLIG_CONNECT_URL,
          });
        }
        throw error;
      }
    },
  );

  registerTool(
    "find_groceries",
    {
      title: "Search Nemlig products",
      description:
        "Search the current Nemlig catalogue independently with a concise Danish grocery phrase translated or normalized from the request. This is not tied to the current Local basket or an alternative target. Preserve a distinctive brand and Danish category when useful (for example 'Prince biscuits' becomes 'prince kiks'); use an open phrase such as 'salmiak' or a broad category phrase such as 'smør' when the user wants matching products generally. With result_count omitted, return all unique detailed candidates from the one provider response actually received, without an application cap; this does not enumerate or guarantee completeness of the entire catalogue. A successful empty result means no matches from this response only; an error means the search failed and must not be presented as no matches. Inspect results before making a deliberate related follow-up search; do not automatically repeat a failing query, launch a synonym cascade, or silently equate categories. Read-only: does not change the Local basket or real Nemlig basket. Not for reopening an existing Local basket; use update_product_review_conversation show instead.",
      inputSchema: z.object({
        search_term: z
          .string()
          .min(1)
          .describe(
            "A concise Danish catalogue phrase. Use a broad phrase for all matching products; retain a distinctive brand when it matters. For example, 'Prince biscuits' becomes 'prince kiks'.",
          ),
        result_count: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Optional requested provider result count. If omitted, do not impose an application cap; the search still covers only the single provider response received.",
          ),
      }),
      outputSchema: z.object({
        result: z.array(candidateSchema),
        views: z.array(productViewSchema),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    ({ search_term, result_count }, ctx) =>
      runAuthenticatedRead("find_groceries", async () => {
        const detailed = await resolveDetailedProductSearch(
          client,
          search_term,
          result_count,
          {
            signal: ctx.mcpReq.signal,
            onDiagnostic: ({ stage, errorClass, activeReadCount }) =>
              productDiscoveryDiagnostic({
                stage,
                error_class: errorClass,
                active_read_count: activeReadCount,
              }),
          },
        );
        const views = createProductViews(detailed.items, { kind: "search" });
        const result = views.flatMap((view) =>
          view.status === "complete" ? [view.product] : [],
        );
        return success({ result, views }, productViewsToText(views));
      }),
  );

  registerTool(
    "show_my_basket",
    {
      title: "Show my Nemlig basket",
      description:
        "Show the actual Nemlig basket, not a saved shopping list. Use update_product_review_conversation with action=list to inspect native shopping lists. This read-only tool shows current real-basket items and totals.",
      outputSchema: basketResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    () =>
      runAuthenticatedRead("show_my_basket", async () => {
        const basket = basketPayload(await client.getCart());
        const views = basketProductViews(basket);
        return success(
          { ...basket, views },
          `${basketText(basket)}\n${productViewsToText(views)}`,
        );
      }),
  );

  registerTool(
    "start_product_review",
    {
      title: "Show or start a shopping list",
      description:
        "Open the visual review when the user asks to see products. With exact returned product IDs and quantities, start an unsaved process-local draft; nothing is written to Nemlig until explicit Save. Omit items to list native Nemlig shopping lists, or pass shopping_list_id to reopen one. Native-list edits remain staged until explicit action=update verifies the same list. Basket submission from native lists is disabled until Nemlig's exact-transfer and concurrency guarantees are verified. Cards carry the exact draft_id or shopping_list_id. Never infer a target from its name or replay an uncertain write.",
      inputSchema: z
        .object({
          items: z
            .array(
              z.object({
                product_id: z.number().int().positive(),
                quantity: z.number().int().positive(),
              }),
            )
            .min(1)
            .max(MAX_DRAFT_PRODUCTS)
            .optional()
            .describe(
              "Exact returned products and intended package quantities to start an unsaved draft. Omit to show native Nemlig shopping lists.",
            ),
          shopping_list_id: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Exact native Nemlig shopping-list ID from this card."),
        })
        .strict()
        .refine(
          ({ items, shopping_list_id }) => !(items?.length && shopping_list_id),
          { message: "Start a draft or open a shopping list, not both." },
        ),
      outputSchema: durableReviewResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: {
        ...(requestContext ? PRODUCT_VIEWER_RESOURCE_METADATA : {}),
        ui: {
          ...(requestContext
            ? { resourceUri: PRODUCT_VIEWER_RESOURCE_URI }
            : {}),
          visibility: ["model"],
        },
      },
    },
    ({ items, shopping_list_id }, ctx) => {
      const perform = async () => {
        const owner = reviewOwner(ctx);
        if (shopping_list_id) {
          return openNativeShoppingList(
            owner,
            shopping_list_id,
            ctx.mcpReq.signal,
          );
        }
        if (!items?.length) {
          return success({
            shoppingLists: await reviews.getShoppingLists(ctx.mcpReq.signal),
            selectedShoppingListId: null,
            selectionRequired: true,
          });
        }
        const review = await reviews.start(owner, items, ctx.mcpReq.signal);
        return success({
          review,
        });
      };
      return runAuthenticatedRead("start_product_review", perform);
    },
  );

  const draftActionOutputSchema = durableReviewResultSchema;
  const draftActionAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
  };

  registerTool(
    "update_product_review_conversation",
    {
      title: "Update your shopping list",
      description:
        "List native Nemlig shopping lists with action=list, open one by passing shopping_list_id with action=select, and target every edit with its exact shopping_list_id. Native-list edits are staged locally and only action=update writes the exact selected list; an uncertain or partial Update blocks Submit. Unsaved drafts require explicit Save before basket submission. Save and Update never authorize basket additions; only the user's explicit Submit action does. Never infer a target from a matching name. After an error, refresh the exact list and never replay an uncertain write.",
      inputSchema: reviewInputSchema(
        modelReviewActionSchema.describe(
          "The Local basket change, navigation, refresh, or preparation requested by the user.",
        ),
      ),
      outputSchema: draftActionOutputSchema,
      annotations: draftActionAnnotations,
      _meta: { ui: { visibility: ["model"] } },
    },
    ({ action, basket_id, draft_id, shopping_list_id }, ctx) => {
      const perform = async () => {
        return updateReviewTarget(
          reviewOwner(ctx),
          action,
          {
            basketId: basket_id,
            draftId: draft_id,
            shoppingListId: shopping_list_id,
          },
          ctx.mcpReq.signal,
        );
      };
      return action.kind === "add" ||
        action.kind === "alternatives" ||
        action.kind === "replace" ||
        action.kind === "save" ||
        action.kind === "list" ||
        action.kind === "select" ||
        action.kind === "prepare_submission"
        ? runAuthenticatedRead("update_product_review_conversation", perform)
        : runMcpOperation("update_product_review_conversation", perform);
    },
  );

  // Keep these names for already-open supported cards using the current contract.
  registerTool(
    "update_product_review",
    {
      title: "Update your shopping list",
      description:
        "Internal UI action for this exact unsaved draft or native shopping list. Legacy Local basket IDs only open the native shopping-list picker and never mutate the old saved data.",
      inputSchema: reviewInputSchema(reviewActionSchema),
      outputSchema: draftActionOutputSchema,
      annotations: draftActionAnnotations,
      _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    },
    // Model may resolve a conversation target; widget mutations are tied to this card's exact list ID.
    // fallow-ignore-next-line code-duplication
    ({ action, basket_id, draft_id, shopping_list_id }, ctx) => {
      const perform = async () => {
        return updateReviewTarget(
          reviewOwner(ctx),
          action,
          {
            basketId: basket_id,
            draftId: draft_id,
            shoppingListId: shopping_list_id,
          },
          ctx.mcpReq.signal,
        );
      };
      return action.kind === "add" ||
        action.kind === "alternatives" ||
        action.kind === "replace" ||
        action.kind === "save" ||
        action.kind === "prepare_submission" ||
        action.kind === "list" ||
        action.kind === "select"
        ? runAuthenticatedRead("update_product_review", perform)
        : runMcpOperation("update_product_review", perform);
    },
  );

  registerTool(
    "submit_product_review_conversation",
    {
      title: "Submit the exact shopping list to Nemlig",
      description:
        "Add the exact contents of the selected saved Nemlig shopping list to the basket once. This action requires explicit user authorization, uses the same native shopping_list_id without creating a temporary list or showing another review screen, and verifies additive basket readback. The source list is kept. A simultaneous Nemlig edit can race the final check; uncertain transfers are never retried. Legacy Local basket IDs are rejected.",
      inputSchema: submitReviewInputSchema(
        z
          .string()
          .uuid()
          .describe(
            "The exact prepared submission reference bound to the user's clear add instruction or explicit approval.",
          ),
      ),
      outputSchema: durableReviewResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { visibility: ["model"] } },
    },
    ({ basket_id, shopping_list_id, submission_id }, ctx) =>
      runMcpOperation("submit_product_review_conversation", () =>
        submitReview(
          reviewOwner(ctx),
          basket_id,
          shopping_list_id,
          submission_id,
          ctx.mcpReq.signal,
        ),
      ),
  );

  registerTool(
    "submit_product_review",
    {
      title: "Submit the current shopping list",
      description:
        "Internal one-click action for the exact saved native shopping list shown in the viewer. Uses its same shopping_list_id, writes a durable attempt fence before transfer, verifies additive basket readback, keeps the source list, and never retries an uncertain transfer. Legacy Local basket IDs are rejected.",
      inputSchema: submitReviewInputSchema(z.string().uuid()),
      outputSchema: durableReviewResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    },
    ({ basket_id, shopping_list_id, submission_id }, ctx) =>
      runMcpOperation("submit_product_review", () =>
        submitReview(
          reviewOwner(ctx),
          basket_id,
          shopping_list_id,
          submission_id,
          ctx.mcpReq.signal,
        ),
      ),
  );

  return server;
}

export async function main(): Promise<void> {
  serveStdio(() => createMcpServer(), { legacy: "reject" });
}

if (
  process.argv[1] &&
  ["mcp.js", "mcp.ts"].includes(basename(realpathSync(process.argv[1])))
) {
  main().catch(() => {
    console.error("Nemlig MCP server failed.");
    process.exitCode = 1;
  });
}
