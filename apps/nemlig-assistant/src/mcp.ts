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
import { basketPayload } from "./basket-result.js";
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
  type ReviewedShoppingList,
} from "./product-review.js";
import { candidateSchema, productViewSchema } from "./product-view-schema.js";
import { reviewSnapshotSchema } from "./review-schema.js";
import { resolveDetailedProductSearch } from "./product-discovery.js";
import {
  parseProductDiscoveryEvent,
  type ProductDiscoveryEvent,
} from "./cloudflare-observability.js";
import { NEMLIG_ASSISTANT_ICON } from "./nemlig-assistant-icon.js";
import type { ReviewJournalRepository } from "./product-review.js";
import {
  LocalBasketOperationCapacityError,
  type LocalBasketCommand,
} from "./local-basket.js";

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

const showReviewActionSchema = z.object({ kind: z.literal("show") });
const localActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("list") }),
  z.object({ kind: z.literal("select") }),
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
const discardPendingUpdateActionSchema = z.object({
  kind: z.literal("discard_pending_update"),
});
const abandonDraftActionSchema = z.object({
  kind: z.literal("abandon_draft"),
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
  suggested: z.boolean().optional(),
});
const replaceReviewActionSchema = z.object({
  kind: z.literal("replace"),
  product_id: z.number().int().positive(),
  replacement_id: z.number().int().positive(),
});
const modelReviewActionSchema = z.discriminatedUnion("kind", [
  showReviewActionSchema,
  ...localActionSchema.options,
  addReviewActionSchema,
  abandonDraftActionSchema,
  removeReviewActionSchema,
  quantityReviewActionSchema,
  navigateReviewActionSchema,
  alternativesReviewActionSchema,
  replaceReviewActionSchema,
]);
const reviewActionSchema = z.discriminatedUnion("kind", [
  showReviewActionSchema,
  ...localActionSchema.options,
  addReviewActionSchema,
  discardPendingUpdateActionSchema,
  abandonDraftActionSchema,
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
  draft_id: z
    .string()
    .uuid()
    .optional()
    .describe("Exact temporary direct-basket draft ID shown in this card."),
  shopping_list_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Exact native Nemlig shopping-list ID from this card."),
  review_context_id: z
    .string()
    .uuid()
    .optional()
    .describe("Opaque temporary handle for this card's exact draft review."),
};
const showProductReviewInputSchema = z
  .object({
    view: z
      .enum(["draft", "saved_lists"])
      .default("draft")
      .describe(
        "Display the current temporary draft, or explicitly open the read-only saved-list picker.",
      ),
    draft_id: reviewTargetFields.draft_id,
    review_context_id: reviewTargetFields.review_context_id,
  })
  .strict()
  .superRefine(({ view, draft_id, review_context_id }, ctx) => {
    if ((draft_id === undefined) !== (review_context_id === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide draft_id and review_context_id together.",
      });
    }
    if (
      view === "saved_lists" &&
      (draft_id !== undefined || review_context_id !== undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Saved-list display does not accept a draft target.",
      });
    }
  })
  .meta({
    anyOf: [
      {
        properties: { view: { const: "draft" } },
        required: ["draft_id", "review_context_id"],
      },
      {
        properties: { view: { const: "draft" } },
        not: {
          anyOf: [
            { required: ["draft_id"] },
            { required: ["review_context_id"] },
          ],
        },
      },
      {
        properties: { view: { const: "saved_lists" } },
        not: {
          anyOf: [
            { required: ["draft_id"] },
            { required: ["review_context_id"] },
          ],
        },
      },
    ],
  });
const reviewInputSchema = <Action extends z.ZodTypeAny>(action: Action) =>
  z
    .object({ ...reviewTargetFields, action })
    .strict()
    .refine(
      ({ review_context_id, shopping_list_id, draft_id }) =>
        (draft_id === undefined ||
          (review_context_id !== undefined &&
            shopping_list_id === undefined)) &&
        (review_context_id === undefined ||
          (shopping_list_id !== undefined) !== (draft_id !== undefined)),
      { message: "review_context_id requires its exact list or draft ID." },
    );
const submitReviewInputSchema = <Submission extends z.ZodTypeAny>(
  submissionId: Submission,
) =>
  z
    .object({
      shopping_list_id: reviewTargetFields.shopping_list_id
        .unwrap()
        .optional()
        .describe("Exact native Nemlig shopping-list ID from this card."),
      draft_id: reviewTargetFields.draft_id,
      review_context_id: reviewTargetFields.review_context_id,
      submission_id: submissionId,
      reviewed_list: z
        .object({
          name: z.string().min(1),
          items: z
            .array(
              z
                .object({
                  product_id: z.number().int().positive(),
                  quantity: z.number().int().positive(),
                })
                .strict(),
            )
            .min(1)
            .max(MAX_DRAFT_PRODUCTS),
        })
        .strict()
        .optional()
        .describe(
          "The reviewed draft name, product IDs, and quantities. The server compares product IDs and quantities with the current draft before basket submission.",
        ),
    })
    .strict()
    .refine(
      ({ shopping_list_id, draft_id }) =>
        (shopping_list_id !== undefined) !== (draft_id !== undefined),
      {
        message:
          "Provide the exact native shopping-list ID or direct draft ID, not both.",
      },
    )
    .refine(
      ({ draft_id, review_context_id, reviewed_list }) =>
        draft_id === undefined ||
        (review_context_id !== undefined && reviewed_list !== undefined),
      {
        message:
          "Direct basket submission requires its exact review context and reviewed contents.",
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
// Tool registration shares one request-scoped auth, ownership, and catalog closure;
// splitting direct-flow tools would thread these guards through parallel plumbing.
// fallow-ignore-next-line complexity
export function createMcpServer(
  client: ShoppingClient = getClient(),
  loadCredentials: () => Promise<Credentials | undefined> = getCredentials,
  env: NodeJS.ProcessEnv = process.env,
  requestContext?: McpRequestContext,
  reviews: ProductReviewService = new ProductReviewService(client),
): McpServer {
  const basketReviewGuidance = `Search Nemlig products with find_groceries and read the actual basket with show_my_basket. Submit to the real basket only when the user clearly directs addition of the exact reviewed products and quantities, or explicitly approves them. Search, display, selection, draft edits, and a remembered ChatGPT tool approval are not authorization for a new addition. When users ask to show, display, open, browse, review, or compare their current temporary draft (for example “show my draft”, “open the list”, “let me compare them”, “vis mig listen”, or “åbn kladden”), use show_product_review. It is read-only and may use an exact draft_id/review_context_id pair or a trustworthy current conversation. For saved-list discovery, use show_product_review with view=saved_lists; it does not load a list into a draft. Do not use it for the actual Nemlig basket, a text-only explanation, unrelated displays, or an ambiguous target. When users choose exact products and quantities for editing, use start_product_review to create a temporary process-local draft, then use show_product_review when a visual review is wanted. Edits affect only the draft; carry its exact draft_id and review_context_id through card actions. Unprotected drafts expire after two hours of inactivity; drafts with unresolved work remain until resolved. All process-local drafts disappear after a server restart.

Only explicit Submit may add products to the actual basket. It sends every exact reviewed line in one additive request, preserves existing basket items, independently validates readback, and never retries an uncertain request. The actual Nemlig basket is add-only. Never remove, decrease, replace, swap, clear, check out, pay, order, or select delivery slots.

Saved Nemlig shopping lists are read-only sources. A user may load an exact saved list into a new temporary draft; subsequent edits and Submit affect only the draft and actual basket, never the source list. After a verified basket addition, offer the separate optional action to save the entire current basket as a shopping list. This includes existing basket rows, preserves the basket, and never clears it. This integration does not establish or return a verified saved-list ID for this action; let the user find the list in the picker. Never retry an uncertain save.

Search and browsing are read-only. Search results cover one provider response, not the full catalogue; an empty result differs from a failure. Use concise Danish search phrases and preserve distinctive brands when useful. Do not infer a saved-list target from its name, replay a stale card, or claim provider atomicity.`;
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
      instructions: `${basketReviewGuidance}

Only explicit Submit may add to the actual basket. Verify additive basket readback and never retry an uncertain write. Direct stdio is process-local and text-only; provide a text fallback when a card is not rendered. check_nemlig_connection distinguishes Nemlig account access from ChatGPT app connection and directs users to the secure page without collecting credentials in chat.`,
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
        title: "Nemlig shopping list",
        description:
          "This older shopping-list card is unavailable and contains no shopping data.",
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
  // Keep principal, exact-list, expiry, and explicit-target routing together.
  // fallow-ignore-next-line complexity
  const reviewOwner = (
    ctx: ServerContext,
    target?: {
      shoppingListId?: number;
      draftId?: string;
      reviewContextId?: string;
      allowMissingReviewContext?: boolean;
    },
  ): string => {
    const session = ctx.mcpReq._meta?.["openai/session"];
    if (
      session !== undefined &&
      (typeof session !== "string" || !session.trim() || session.length > 512)
    ) {
      throw new NemligError("Invalid shopping session context.");
    }
    const context = target?.reviewContextId
      ? reviews.reviewContextOwner(target.reviewContextId)
      : undefined;
    if (
      target?.reviewContextId &&
      requestContext &&
      context &&
      (!context.owner.startsWith(`${requestContext.principalKey}\0`) ||
        context.shoppingListId !== target.shoppingListId ||
        context.draftId !== target.draftId)
    ) {
      throw new NemligError(
        "This review handle does not match the authenticated account and exact shopping list.",
      );
    }
    if (
      context &&
      context.shoppingListId === target?.shoppingListId &&
      context.draftId === target?.draftId
    ) {
      return context.owner;
    }
    if (
      target?.reviewContextId &&
      (!target.allowMissingReviewContext ||
        (target.shoppingListId === undefined && target.draftId === undefined))
    ) {
      throw new NemligError(
        "This shopping-list review expired. Refresh the exact list before editing it.",
      );
    }
    if (requestContext) {
      const principalPrefix = `${requestContext.principalKey}\0`;
      if (session) {
        return `${principalPrefix}${session}`;
      }
      // Stateless MCP requests cannot safely share an implicit list selection.
      return `${principalPrefix}${randomUUID()}`;
    }
    return ctx.sessionId ?? localConnectionId;
  };
  const localBasketRepository = (
    signal: AbortSignal,
  ): ReviewJournalRepository | undefined => {
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
      // One transport boundary keeps command binding and storage failures fail-closed.
      // fallow-ignore-next-line complexity
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
              ? "Shopping-list recovery state is unavailable. Refresh the exact list."
              : status === 409
                ? "Shopping-list recovery state changed or is busy. Refresh before continuing."
                : status === 429
                  ? new LocalBasketOperationCapacityError().message
                  : status === 403
                    ? "Shopping-list recovery is not authorized for this request."
                    : "Shopping-list recovery storage is temporarily unavailable. Refresh the exact list before continuing.";
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
      async write(operation) {
        await repository.mutate({
          kind: "review-operation-write",
          operation,
        });
      },
      async complete(operationId, generation) {
        return (await repository.mutate({
          kind: "review-operation-complete",
          operationId,
          generation,
        })) as boolean;
      },
    };
  };
  const durableReviewResultSchema = z.object({
    review: reviewSnapshotSchema.optional(),
    result: applyResultSchema.optional(),
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
  const listNativeShoppingLists = async (signal: AbortSignal) =>
    success({
      shoppingLists: await reviews.getShoppingLists(signal),
      selectedShoppingListId: null,
      selectionRequired: true,
    });
  const showProductReview = (owner: string, draftId: string | undefined) => {
    const review = reviews.active(owner, draftId);
    if (!review || review.basketMode !== "direct-basket") {
      return success(
        { unavailable: true as const },
        "This temporary draft is unavailable. Start a new draft from exact products, or display saved lists to choose a source.",
      );
    }
    return success({ review, selectedShoppingListId: null });
  };
  // Target routing keeps stale cards, account scope, and list identity checks together.
  // fallow-ignore-next-line complexity
  const updateReviewTarget = async (
    owner: string,
    action: z.infer<typeof reviewActionSchema>,
    targets: {
      shoppingListId?: number;
      draftId?: string;
      reviewContextId?: string;
    },
    signal: AbortSignal,
  ) => {
    if (targets.draftId) {
      if (targets.shoppingListId !== undefined) {
        throw new NemligError(
          "This card does not match the active basket mode.",
        );
      }
      const active = reviews.active(owner, targets.draftId);
      if (!active || active.basketMode !== "direct-basket") {
        throw new NemligError("This direct basket draft is unavailable.");
      }
      if (
        !targets.reviewContextId ||
        targets.reviewContextId !== active.reviewContextId
      ) {
        throw new NemligError(
          "This direct basket card has expired. Use its exact review context or start a new draft.",
        );
      }
      if (action.kind === "show" || action.kind === "select") {
        return success({ review: active, selectedShoppingListId: null });
      }
      if (action.kind === "list" || action.kind === "prepare_submission") {
        throw new NemligError(
          "Direct basket drafts are temporary; Submit the exact draft or start a new selection.",
        );
      }
      if (action.kind === "abandon_draft") {
        reviews.end(owner, targets.draftId);
        return success({ ended: true });
      }
      return success({
        review: await reviews.update(owner, action, signal, targets.draftId),
      });
    }
    if (action.kind === "abandon_draft") {
      throw new NemligError(
        "Only a temporary direct-basket draft can be abandoned this way.",
      );
    }
    if (action.kind === "list") {
      return listNativeShoppingLists(signal);
    }
    if (action.kind === "select") {
      if (targets.shoppingListId) {
        await ensureLoggedIn(client, loadCredentials);
        return success({
          review: await reviews.loadShoppingListIntoDirectBasket(
            owner,
            targets.shoppingListId,
            signal,
          ),
          selectedShoppingListId: targets.shoppingListId,
        });
      }
      return listNativeShoppingLists(signal);
    }
    if (targets.shoppingListId !== undefined) {
      throw new NemligError(
        "This card targets a saved list. Load it again to create a temporary draft before editing or submitting.",
      );
    }
    if (action.kind === "show") {
      return success({ unavailable: true as const });
    }
    throw new NemligError("Start a temporary draft before editing products.");
  };
  const submitReview = async (
    owner: string,
    shoppingListId: number | undefined,
    submissionId: string,
    signal: AbortSignal,
    reviewedList?: ReviewedShoppingList,
    draftId?: string,
    reviewContextId?: string,
  ) => {
    if (shoppingListId !== undefined || draftId === undefined) {
      throw new NemligError("This card does not match the active basket mode.");
    }
    if (!reviewedList) {
      throw new NemligError(
        "Direct basket submission requires the exact reviewed draft contents.",
      );
    }
    const active = reviews.active(owner, draftId);
    if (active && active.reviewContextId !== reviewContextId) {
      throw new NemligError(
        "This direct basket card has expired. Use its exact review context or start a new draft.",
      );
    }
    await ensureLoggedIn(client, loadCredentials);
    return success(
      await reviews.submitDirectBasket(
        owner,
        draftId,
        submissionId,
        reviewedList.items,
        signal,
        reviewOperationJournal(signal),
      ),
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
        "Search the current Nemlig catalogue independently with a concise Danish grocery phrase translated or normalized from the request. This is not tied to the current temporary draft or an alternative target. Preserve a distinctive brand and Danish category when useful (for example 'Prince biscuits' becomes 'prince kiks'); use an open phrase such as 'salmiak' or a broad category phrase such as 'smør' when the user wants matching products generally. With result_count omitted, return all unique detailed candidates from the one provider response actually received, without an application cap; this does not enumerate or guarantee completeness of the entire catalogue. A successful empty result means no matches from this response only; an error means the search failed and must not be presented as no matches. Inspect results before making a deliberate related follow-up search; do not automatically repeat a failing query, launch a synonym cascade, or silently equate categories. Read-only: does not change the temporary draft or real Nemlig basket. To show the current review, use show_product_review; use start_product_review with an exact shopping_list_id to load a saved list as a read-only draft source.",
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
        "Show the actual Nemlig basket, not a temporary draft or saved shopping list. Use show_product_review with view=saved_lists to inspect native shopping lists. This read-only tool shows current real-basket items and totals.",
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
      title: "Review products before a basket addition",
      description:
        "Create a temporary process-local draft from exact returned product IDs and quantities. Edits affect only this draft. Submit only after separate explicit authorization; one additive request sends the exact reviewed lines. Load saved lists as read-only sources, and never retry an uncertain provider write.",
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
              "Exact returned products and package quantities to add to a temporary draft. Omit to discover saved lists without creating or changing one.",
            ),
          shopping_list_name: z
            .string()
            .trim()
            .min(1)
            .max(30)
            .optional()
            .describe("Not used by temporary direct basket drafts."),
          creation_id: z
            .string()
            .uuid()
            .optional()
            .describe("Not used by temporary direct basket drafts."),
          shopping_list_id: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
              "Exact saved Nemlig shopping-list ID to load as a read-only source.",
            ),
        })
        .strict()
        .refine(
          ({ items, shopping_list_id }) => !(items?.length && shopping_list_id),
          {
            message: "Create a list or open an exact shopping list, not both.",
          },
        )
        .refine(({ creation_id }) => creation_id === undefined, {
          message: "Direct basket drafts do not use a native-list creation_id.",
        })
        .meta({
          anyOf: [
            {
              required: ["items"],
              not: {
                anyOf: [
                  { required: ["shopping_list_id"] },
                  { required: ["creation_id"] },
                ],
              },
            },
            {
              required: ["shopping_list_id"],
              not: {
                anyOf: [{ required: ["items"] }, { required: ["creation_id"] }],
              },
            },
            {
              not: {
                anyOf: [
                  { required: ["items"] },
                  { required: ["shopping_list_id"] },
                  { required: ["creation_id"] },
                ],
              },
            },
          ],
        }),
      outputSchema: durableReviewResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Preparing your Nemlig basket draft…",
        "openai/toolInvocation/invoked": "Draft prepared; display it to review",
        ui: { visibility: ["model"] },
      },
    },
    ({ items, shopping_list_id }, ctx) => {
      const perform = async () => {
        const owner = reviewOwner(ctx);
        if (shopping_list_id) {
          await ensureLoggedIn(client, loadCredentials);
          return success({
            review: await reviews.loadShoppingListIntoDirectBasket(
              owner,
              shopping_list_id,
              ctx.mcpReq.signal,
            ),
            selectedShoppingListId: shopping_list_id,
          });
        }
        if (!items?.length) {
          return success({
            shoppingLists: await reviews.getShoppingLists(ctx.mcpReq.signal),
            selectedShoppingListId: null,
            selectionRequired: true,
          });
        }
        await ensureLoggedIn(client, loadCredentials);
        return success({
          review: await reviews.startDirectBasket(
            owner,
            items,
            ctx.mcpReq.signal,
          ),
        });
      };
      return items?.length
        ? runMcpOperation("start_product_review", perform)
        : runAuthenticatedRead("start_product_review", perform);
    },
  );

  const draftActionOutputSchema = durableReviewResultSchema;
  const reviewActionAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  };

  registerTool(
    "show_product_review",
    {
      title: "Show my temporary draft",
      description:
        "Use this when the user wants to show, display, open, browse, review, or compare an existing current draft, including Danish requests such as “vis mig listen” or “åbn kladden”. It displays the draft without changing it. Use view=saved_lists only to display the read-only saved-list picker. Do not use for the actual Nemlig basket, text-only explanations, unrelated displays, or to create, edit, load, submit, or authorize a draft.",
      inputSchema: showProductReviewInputSchema,
      outputSchema: durableReviewResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
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
        "openai/toolInvocation/invoking": "Opening your temporary draft…",
        "openai/toolInvocation/invoked": "Draft ready to review",
      },
    },
    ({ view, draft_id, review_context_id }, ctx) => {
      if (view === "saved_lists") {
        return runAuthenticatedRead("show_product_review", () =>
          listNativeShoppingLists(ctx.mcpReq.signal),
        );
      }
      return runMcpOperation("show_product_review", async () => {
        const owner = reviewOwner(ctx, {
          draftId: draft_id,
          reviewContextId: review_context_id,
        });
        return showProductReview(owner, draft_id);
      });
    },
  );

  registerTool(
    "update_product_review_conversation",
    {
      title: "Edit the temporary basket draft",
      description:
        "Update the exact temporary draft identified by draft_id and review_context_id. Product edits remain local; they do not change Nemlig until explicit Submit. Use show_product_review when a visual review is wanted.",
      inputSchema: reviewInputSchema(
        modelReviewActionSchema.describe(
          "Edit the exact temporary draft. Use show_product_review to display it. After the user clearly approves adding its exact reviewed contents, submit it with submit_product_review_conversation.",
        ),
      ),
      outputSchema: draftActionOutputSchema,
      annotations: reviewActionAnnotations,
      _meta: {
        ui: { visibility: ["model"] },
        "openai/toolInvocation/invoking":
          "Updating your temporary basket draft…",
        "openai/toolInvocation/invoked": "Draft result received",
      },
    },
    ({ action, shopping_list_id, draft_id, review_context_id }, ctx) => {
      const perform = async () => {
        const owner = reviewOwner(ctx, {
          shoppingListId: shopping_list_id,
          draftId: draft_id,
          reviewContextId: review_context_id,
          allowMissingReviewContext:
            action.kind === "show" || action.kind === "select",
        });
        return updateReviewTarget(
          owner,
          action,
          {
            shoppingListId: shopping_list_id,
            draftId: draft_id,
            reviewContextId: review_context_id,
          },
          ctx.mcpReq.signal,
        );
      };
      const writesShoppingList = [
        "add",
        "remove",
        "quantity",
        "replace",
      ].includes(action.kind);
      return writesShoppingList
        ? runMcpOperation("update_product_review_conversation", async () => {
            await ensureLoggedIn(client, loadCredentials);
            return perform();
          })
        : runAuthenticatedRead("update_product_review_conversation", perform);
    },
  );

  // Keep these names for already-open supported cards using the current contract.
  registerTool(
    "update_product_review",
    {
      title: "Edit the temporary basket draft",
      description:
        "Internal UI action for this exact temporary basket draft. Product edits remain local until explicit Submit.",
      inputSchema: reviewInputSchema(reviewActionSchema),
      outputSchema: draftActionOutputSchema,
      annotations: reviewActionAnnotations,
      _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    },
    // Model may resolve a conversation target; widget mutations are tied to this card's exact list ID.
    // fallow-ignore-next-line code-duplication
    ({ action, shopping_list_id, draft_id, review_context_id }, ctx) => {
      const perform = async () => {
        const owner = reviewOwner(ctx, {
          shoppingListId: shopping_list_id,
          draftId: draft_id,
          reviewContextId: review_context_id,
          allowMissingReviewContext:
            action.kind === "show" || action.kind === "select",
        });
        return updateReviewTarget(
          owner,
          action,
          {
            shoppingListId: shopping_list_id,
            draftId: draft_id,
            reviewContextId: review_context_id,
          },
          ctx.mcpReq.signal,
        );
      };
      const writesShoppingList = [
        "add",
        "remove",
        "quantity",
        "replace",
      ].includes(action.kind);
      return writesShoppingList
        ? runMcpOperation("update_product_review", async () => {
            await ensureLoggedIn(client, loadCredentials);
            return perform();
          })
        : runAuthenticatedRead("update_product_review", perform);
    },
  );

  registerTool(
    "submit_product_review_conversation",
    {
      title: "Submit the reviewed products to Nemlig",
      description:
        "Use only after the user clearly requests or explicitly approves adding the exact reviewed draft products and quantities. Selection, display, and draft edits are not approval. The server freshly checks product identity and package, skips confirmed unavailable products, and adds the remaining approved quantities in one request with a durable no-replay fence. Price changes alone do not block addition. Never retry an uncertain result.",
      inputSchema: submitReviewInputSchema(
        z
          .string()
          .uuid()
          .describe(
            "A fresh unique UUID for this exact submission after the user's clear add instruction or explicit approval. If the result is uncertain, inspect the basket and do not retry with this or a new ID.",
          ),
      ),
      outputSchema: durableReviewResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: {
        ui: { visibility: ["model"] },
        "openai/toolInvocation/invoking":
          "Adding reviewed products to Nemlig basket…",
        "openai/toolInvocation/invoked": "Basket-transfer result received",
      },
    },
    (
      {
        shopping_list_id,
        draft_id,
        submission_id,
        reviewed_list,
        review_context_id,
      },
      ctx,
    ) =>
      runMcpOperation("submit_product_review_conversation", () =>
        submitReview(
          reviewOwner(ctx, {
            shoppingListId: shopping_list_id,
            draftId: draft_id,
            reviewContextId: review_context_id,
            allowMissingReviewContext: true,
          }),
          shopping_list_id,
          submission_id,
          ctx.mcpReq.signal,
          reviewed_list,
          draft_id,
          review_context_id,
        ),
      ),
  );

  registerTool(
    "submit_product_review",
    {
      title: "Submit the current draft to Nemlig",
      description:
        "Internal one-click action for the exact temporary draft shown in this viewer. It sends all approved lines once and verifies additive basket readback.",
      inputSchema: submitReviewInputSchema(z.string().uuid()),
      outputSchema: durableReviewResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    },
    (
      {
        shopping_list_id,
        draft_id,
        submission_id,
        reviewed_list,
        review_context_id,
      },
      ctx,
    ) =>
      runMcpOperation("submit_product_review", () =>
        submitReview(
          reviewOwner(ctx, {
            shoppingListId: shopping_list_id,
            draftId: draft_id,
            reviewContextId: review_context_id,
            allowMissingReviewContext: true,
          }),
          shopping_list_id,
          submission_id,
          ctx.mcpReq.signal,
          reviewed_list,
          draft_id,
          review_context_id,
        ),
      ),
  );

  registerTool(
    "save_basket_as_shopping_list",
    {
      title: "Save the current basket as a shopping list",
      description:
        "After a verified basket addition, this optional action saves the entire current Nemlig basket as a new shopping list. It includes existing basket items, preserves the basket, and never clears it. This integration does not establish or return a verified saved-list ID; use the saved-list picker to find the result. An uncertain request is never retried.",
      inputSchema: z.object({
        draft_id: z.string().uuid(),
        review_context_id: z.string().uuid(),
        save_id: z.string().uuid(),
      }),
      outputSchema: z.object({
        saved: z.literal(true),
        replayed: z.boolean(),
        basket: basketSchema,
        review: reviewSnapshotSchema.optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    },
    ({ draft_id, review_context_id, save_id }, ctx) =>
      runMcpOperation("save_basket_as_shopping_list", async () => {
        const owner = reviewOwner(ctx, {
          draftId: draft_id,
          reviewContextId: review_context_id,
        });
        const result = await reviews.saveCurrentBasketAsShoppingList(
          owner,
          draft_id,
          save_id,
          ctx.mcpReq.signal,
          reviewOperationJournal(ctx.mcpReq.signal),
        );
        return success({
          saved: true,
          replayed: result.replayed,
          basket: result.basket,
          review: reviews.active(owner, draft_id),
        });
      }),
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
