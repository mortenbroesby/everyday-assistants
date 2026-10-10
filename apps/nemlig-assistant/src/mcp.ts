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
import { createHash, randomUUID } from "node:crypto";
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
  type ProductReviewAction,
  type ProductReviewSnapshot,
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
  destination: z.enum(["ready", "alternatives"]),
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

const isUnavailableBasket = (error: unknown): boolean =>
  error instanceof LocalBasketRepositoryError && error.status === 404;

/**
 * Creates the explicit MCP catalog. Basket writes remain staged through the
 * Local basket submission flow, while request context binds private state to a principal.
 */
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
      instructions: `Search Nemlig products with find_groceries, read the actual basket with show_my_basket, and use durable Local baskets to review products before adding them.

The real Nemlig basket is add-only. Never remove, decrease, replace, swap, clear, check out, pay, order, or select delivery slots. Added quantities are additional units. Local basket edits never write to Nemlig.

For discovery, use a concise Danish catalogue phrase and preserve a distinctive brand when useful. Search results describe one provider response, not the entire catalogue; an empty result differs from a failure. Search and conversation edits do not open cards. When the user asks to see products visually, use start_product_review with exact returned IDs and quantities. When a new grocery request arrives and a Local basket already exists, ask whether to append the finds to that basket or create a separate basket; an explicit instruction such as “add these to this basket” already makes that choice and needs no redundant confirmation. Omit items in start_product_review to show the remembered basket or basket picker. Supported cards share durable owner baskets and every mutation targets its explicit basket ID. Respect an explicit instruction not to create or edit a Local basket; use concise text until the user allows local state. If no active basket remains, use the picker instead of silently creating or retargeting state. Use update_product_review_conversation and submit_product_review_conversation for model-side text/data operations. After an unconfirmed action, show current state; never replay it.

The Local basket has one product list. Every item is included in whole-list submission. Fresh preparation excludes products Nemlig confirms are unavailable; unresolved product identity or availability blocks preparation, while missing price, package, category, or descriptive fields may remain unknown. Alternatives can be found for any item. A clear instruction to add the exact unchanged Local basket authorizes its prepared payload without another chat approval. Inspection, local edits, or preparation alone do not authorize a real-basket write. If IDs, quantities, or scope are unclear or changed after the instruction, ask for exact approval. Both widget and conversation submission require the exact prepared submission_id, fresh validation, and verified basket readback. After an uncertain or partial write, the fenced basket is inspect-or-delete only; check the actual basket and never retry or prepare that record again. Once the outcome is understood, any further addition requires a new Local basket and fresh exact authorization.

In the hosted deployment, Local baskets are durable owner data; use the opaque basket_id on every card mutation. The host conversation may remember one selected basket only when it supplies a stable session identifier. Without that identifier, show the picker and require explicit selection. Reconnected credentials recover the same non-authorizing basket; they never restore a prepared submission or provider authority. Direct stdio use is process-local and text-only. A tool result or image URL does not prove ChatGPT rendered a card; provide a text fallback when needed. check_nemlig_connection distinguishes Nemlig account access from ChatGPT app connection and directs users to the secure page without collecting credentials in chat.`,
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
  const selectionKey = (ctx: ServerContext): string | undefined => {
    const session = ctx.mcpReq._meta?.["openai/session"];
    if (session === undefined) {
      return undefined;
    }
    if (
      typeof session !== "string" ||
      !session.trim() ||
      session.length > 512
    ) {
      throw new NemligError("Invalid shopping session context.");
    }
    return createHash("sha256").update(session).digest("hex");
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
            "Local basket storage is temporarily unavailable. Refresh and try again.",
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
                : status === 403
                  ? "Local basket access is not authorized for this request."
                  : "Local basket storage is temporarily unavailable. Refresh and try again.";
          throw new LocalBasketRepositoryError(message, status);
        }
        return response.json();
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
    selectionRequired: z.boolean().optional(),
    unavailable: z.literal(true).optional(),
    ended: z.literal(true).optional(),
  });
  const unavailableDurableBasket = async (
    repository: LocalBasketRepository,
    owner: string,
  ) =>
    success({
      baskets: await reviews.listBaskets(repository, owner),
      selectedBasketId: null,
      selectionRequired: true,
      unavailable: true as const,
    });
  const withDurableReview = async (
    owner: string,
    basketId: string,
    repository: LocalBasketRepository,
    load: () => Promise<ProductReviewSnapshot>,
  ) => {
    try {
      const review = await load();
      return success({
        review,
        baskets: await reviews.listBaskets(repository, owner),
        selectedBasketId: basketId,
      });
    } catch (error) {
      if (!isUnavailableBasket(error)) {
        throw error;
      }
      return unavailableDurableBasket(repository, owner);
    }
  };
  const mutateDurableBasket = async (
    owner: string,
    basketId: string,
    action: ProductReviewAction | { kind: "prepare_submission" },
    repository: LocalBasketRepository,
    signal: AbortSignal,
  ) => {
    return withDurableReview(owner, basketId, repository, () =>
      action.kind === "prepare_submission"
        ? reviews.prepareBasket(owner, basketId, repository, signal)
        : reviews.updateBasket(owner, basketId, action, repository, signal),
    );
  };
  const submitDurableBasket = async (
    owner: string,
    basketId: string | undefined,
    submissionId: string,
    repository: LocalBasketRepository,
    missingBasket: "unavailable" | "if-empty",
  ) => {
    if (!basketId) {
      const baskets = await reviews.listBaskets(repository, owner);
      return success({
        baskets,
        selectedBasketId: null,
        selectionRequired: true,
        ...(missingBasket === "unavailable" || baskets.length === 0
          ? { unavailable: true as const }
          : {}),
      });
    }
    await ensureLoggedIn(client, loadCredentials);
    return success(
      await reviews.submitBasket(owner, basketId, submissionId, repository),
    );
  };
  const refreshDurableBasket = async (
    owner: string,
    basketId: string,
    repository: LocalBasketRepository,
    selection: string | undefined,
    kind: "select" | "heartbeat",
  ) => {
    return withDurableReview(owner, basketId, repository, async () => {
      await repository.mutate({
        kind,
        basketId,
        ...(selection ? { selectionKey: selection } : {}),
      });
      return reviews.showBasket(owner, basketId, repository);
    });
  };
  const selectedBasket = async (
    repository: LocalBasketRepository,
    key: string | undefined,
  ): Promise<string | undefined> =>
    key
      ? ((await repository.mutate({ kind: "selection", selectionKey: key })) as
          string | undefined)
      : undefined;

  const updateDraft = async (
    owner: string,
    action: z.infer<typeof reviewActionSchema>,
    signal: AbortSignal,
  ) => {
    if (action.kind === "show") {
      const review = reviews.active(owner);
      return review ? { review } : { unavailable: true as const };
    }
    if (action.kind === "end") {
      reviews.end(owner);
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
    const review =
      action.kind === "prepare_submission"
        ? await reviews.prepare(owner, signal)
        : await reviews.update(owner, action, signal);
    return { review };
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
        "Show the actual Nemlig basket, not the Local basket. Use update_product_review_conversation show for the current Local basket. This read-only tool shows current real-basket items and totals.",
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
      title: "Show or start your Local basket",
      description:
        "Open the native visual Local basket when the user asks to see products, even without naming this tool. With exact returned product IDs and quantities, create a new Local basket. Omit items to reopen the remembered basket or show the basket picker. Every basket has an opaque ID; cards send it with mutations. Local baskets are durable for up to 24 hours after explicit activity, with bounded owner storage. Local edits do not change the real Nemlig basket. Add new products through update_product_review_conversation add. Respect an explicit request not to create or edit a Local basket.",
      inputSchema: z.object({
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
            "Exact returned products and intended package quantities to create a Local basket. Omit to reopen the remembered basket or show the picker.",
          ),
      }),
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
    ({ items }, ctx) => {
      const repository = localBasketRepository(ctx.mcpReq.signal);
      const perform = async () => {
        const owner = reviewOwner(ctx);
        if (!repository) {
          const review = await reviews.start(
            owner,
            items ?? [],
            ctx.mcpReq.signal,
          );
          return success({ review });
        }
        const key = selectionKey(ctx);
        if (items?.length) {
          const created = await reviews.createBasket(
            owner,
            items,
            repository,
            ctx.mcpReq.signal,
            key,
          );
          return success({
            review: created.review,
            baskets: created.baskets,
            selectedBasketId: created.review.basketId,
          });
        }
        const chosen = await selectedBasket(repository, key);
        const baskets = await reviews.listBaskets(repository, owner);
        if (chosen && baskets.some((basket) => basket.basketId === chosen)) {
          const review = await reviews.showBasket(owner, chosen, repository);
          return success({ review, baskets, selectedBasketId: chosen });
        }
        return success({
          baskets,
          selectedBasketId: null,
          selectionRequired: true,
          ...(baskets.length ? {} : { unavailable: true as const }),
        });
      };
      return items?.length
        ? runAuthenticatedRead("start_product_review", perform)
        : runMcpOperation("start_product_review", perform);
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
      title: "Update your Local basket",
      description:
        "List, show, select, heartbeat, delete, or edit a durable Local basket. Pass basket_id with every widget mutation; when omitted, a stable host conversation selection may identify the basket. Add, remove, change quantity, find alternatives for any item, replace, or prepare_submission. Another alternatives search replaces the candidate set. Local edits never write to Nemlig. Any ID or quantity change invalidates prepared authority. Preparation freshly validates every item and preserves unrelated real-basket lines. A clear command to add the exact unchanged Local basket authorizes its prepared payload without a redundant chat approval; otherwise require exact approval. If intent or scope is unclear or the list changed after the command, ask before applying. After errors show current state and never replay the action.",
      inputSchema: z
        .object({
          basket_id: z
            .string()
            .uuid()
            .optional()
            .describe(
              "Exact Local basket ID supplied by the current review card.",
            ),
          action: modelReviewActionSchema.describe(
            "The Local basket change, navigation, refresh, or preparation requested by the user.",
          ),
        })
        .strict(),
      outputSchema: draftActionOutputSchema,
      annotations: draftActionAnnotations,
      _meta: { ui: { visibility: ["model"] } },
    },
    ({ action, basket_id }, ctx) => {
      const repository = localBasketRepository(ctx.mcpReq.signal);
      // Ordered branches preserve the distinction between conversation selection and an explicit card ID.
      // fallow-ignore-next-line complexity
      const perform = async () => {
        const owner = reviewOwner(ctx);
        if (!repository) {
          return updateDraft(owner, action, ctx.mcpReq.signal).then((result) =>
            success(
              result,
              result.unavailable
                ? "No active Local basket remains. Ask before starting a new list; previous choices and approval are not restored."
                : JSON.stringify(result),
            ),
          );
        }
        const key = selectionKey(ctx);
        if (action.kind === "list") {
          const baskets = await reviews.listBaskets(repository, owner);
          const selected = await selectedBasket(repository, key);
          return success({
            baskets,
            selectedBasketId: selected ?? null,
            selectionRequired: true,
            ...(baskets.length ? {} : { unavailable: true as const }),
          });
        }
        if (action.kind === "select") {
          if (!basket_id) {
            return success({
              baskets: await reviews.listBaskets(repository, owner),
              selectedBasketId: null,
              selectionRequired: true,
            });
          }
          return refreshDurableBasket(
            owner,
            basket_id,
            repository,
            key,
            "select",
          );
        }
        if (action.kind === "delete" || action.kind === "end") {
          const target = basket_id;
          if (!target) {
            return success({
              baskets: await reviews.listBaskets(repository, owner),
              selectedBasketId: null,
              selectionRequired: true,
            });
          }
          try {
            await repository.mutate({ kind: "delete", basketId: target });
          } catch (error) {
            if (!isUnavailableBasket(error)) {
              throw error;
            }
            return unavailableDurableBasket(repository, owner);
          }
          reviews.forgetBasket(owner, target);
          const baskets = await reviews.listBaskets(repository, owner);
          return success({
            ended: true as const,
            baskets,
            selectedBasketId: null,
          });
        }
        if (action.kind === "heartbeat") {
          if (!basket_id) {
            return success({
              baskets: await reviews.listBaskets(repository, owner),
              selectedBasketId: null,
              selectionRequired: true,
            });
          }
          return refreshDurableBasket(
            owner,
            basket_id,
            repository,
            key,
            "heartbeat",
          );
        }
        const target = basket_id ?? (await selectedBasket(repository, key));
        if (action.kind === "show") {
          if (!target) {
            const baskets = await reviews.listBaskets(repository, owner);
            return success({
              baskets,
              selectedBasketId: null,
              selectionRequired: true,
              ...(baskets.length ? {} : { unavailable: true as const }),
            });
          }
          try {
            const review = await reviews.showBasket(owner, target, repository);
            return success({
              review,
              baskets: await reviews.listBaskets(repository, owner),
              selectedBasketId: target,
            });
          } catch (error) {
            if (!isUnavailableBasket(error)) {
              throw error;
            }
            return unavailableDurableBasket(repository, owner);
          }
        }
        if (!target) {
          const baskets = await reviews.listBaskets(repository, owner);
          return success({
            baskets,
            selectedBasketId: null,
            selectionRequired: true,
          });
        }
        return mutateDurableBasket(
          owner,
          target,
          action as ProductReviewAction | { kind: "prepare_submission" },
          repository,
          ctx.mcpReq.signal,
        );
      };
      return action.kind === "add" ||
        action.kind === "alternatives" ||
        action.kind === "replace" ||
        action.kind === "prepare_submission"
        ? runAuthenticatedRead("update_product_review_conversation", perform)
        : runMcpOperation("update_product_review_conversation", perform);
    },
  );

  // Keep these names for already-open supported cards using the current contract.
  registerTool(
    "update_product_review",
    {
      title: "Update the current Local basket",
      description:
        "Internal UI action for the exact durable Local basket. Send basket_id with every mutation; local list/show/select/delete/heartbeat do not require Nemlig credentials. A missing, expired, deleted, or evicted basket returns the picker and never redirects a mutation to another basket.",
      inputSchema: z
        .object({
          basket_id: z
            .string()
            .uuid()
            .optional()
            .describe(
              "Exact Local basket ID supplied by the current review card.",
            ),
          action: reviewActionSchema,
        })
        .strict(),
      outputSchema: draftActionOutputSchema,
      annotations: draftActionAnnotations,
      _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    },
    ({ action, basket_id }, ctx) => {
      const repository = localBasketRepository(ctx.mcpReq.signal);
      // The widget adapter is a fail-closed state machine for stale and ID-less cards.
      // fallow-ignore-next-line complexity
      const perform = async () => {
        const owner = reviewOwner(ctx);
        if (
          repository &&
          (action.kind === "show" ||
            action.kind === "delete" ||
            action.kind === "end" ||
            action.kind === "select" ||
            action.kind === "heartbeat" ||
            action.kind === "list")
        ) {
          const key = selectionKey(ctx);
          if (action.kind === "list") {
            return success({
              baskets: await reviews.listBaskets(repository, owner),
              selectedBasketId: (await selectedBasket(repository, key)) ?? null,
              selectionRequired: true,
            });
          }
          const target = basket_id;
          if (!target) {
            return success({
              baskets: await reviews.listBaskets(repository, owner),
              selectedBasketId: null,
              selectionRequired: true,
              unavailable: true as const,
            });
          }
          if (action.kind === "delete" || action.kind === "end") {
            await repository.mutate({ kind: "delete", basketId: target });
            reviews.forgetBasket(owner, target);
            return success({
              ended: true as const,
              baskets: await reviews.listBaskets(repository, owner),
              selectedBasketId: null,
            });
          }
          if (action.kind === "select" || action.kind === "heartbeat") {
            return refreshDurableBasket(
              owner,
              target,
              repository,
              key,
              action.kind,
            );
          }
          const review = await reviews.showBasket(owner, target, repository);
          return success({
            review,
            baskets: await reviews.listBaskets(repository, owner),
            selectedBasketId: target,
          });
        }
        if (repository) {
          const target = basket_id;
          if (!target) {
            return success({
              baskets: await reviews.listBaskets(repository, owner),
              selectedBasketId: null,
              selectionRequired: true,
            });
          }
          return mutateDurableBasket(
            owner,
            target,
            action as ProductReviewAction | { kind: "prepare_submission" },
            repository,
            ctx.mcpReq.signal,
          );
        }
        const result = await updateDraft(owner, action, ctx.mcpReq.signal);
        return success(result);
      };
      return action.kind === "add" ||
        action.kind === "alternatives" ||
        action.kind === "replace" ||
        action.kind === "prepare_submission"
        ? runAuthenticatedRead("update_product_review", perform)
        : runMcpOperation("update_product_review", perform);
    },
  );

  registerTool(
    "submit_product_review_conversation",
    {
      title: "Submit the exact Local basket to Nemlig",
      description:
        "After a clear user command to add the exact unchanged Local basket, apply only its prepared whole-list product IDs and quantities; that command is sufficient conversational authorization. Otherwise apply only after exact approval. Inspection, local edits, and preparation are not authorization. If scope is ambiguous or any item changed after intent, ask which exact list to add. Fresh validation and verified readback are mandatory. Requires the exact prepared submission_id. Never retry automatically; after any error inspect the Local basket and actual basket first.",
      inputSchema: z
        .object({
          basket_id: z
            .string()
            .uuid()
            .optional()
            .describe(
              "Exact Local basket ID supplied by the current review card.",
            ),
          submission_id: z
            .string()
            .uuid()
            .describe(
              "The exact prepared submission reference bound to the user's clear add instruction or explicit approval.",
            ),
        })
        .strict(),
      outputSchema: durableReviewResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { visibility: ["model"] } },
    },
    ({ basket_id, submission_id }, ctx) =>
      runMcpOperation("submit_product_review_conversation", async () => {
        const repository = localBasketRepository(ctx.mcpReq.signal);
        if (repository) {
          const owner = reviewOwner(ctx);
          const basketId =
            basket_id ?? (await selectedBasket(repository, selectionKey(ctx)));
          return submitDurableBasket(
            owner,
            basketId,
            submission_id,
            repository,
            "if-empty",
          );
        }
        await ensureLoggedIn(client, loadCredentials);
        return success(await reviews.submit(reviewOwner(ctx), submission_id));
      }),
  );

  registerTool(
    "submit_product_review",
    {
      title: "Confirm the current Local basket addition",
      description:
        "Internal UI action for the current Local basket. Requires its exact prepared submission reference.",
      inputSchema: z
        .object({
          basket_id: z
            .string()
            .uuid()
            .optional()
            .describe(
              "Exact Local basket ID supplied by the current review card.",
            ),
          submission_id: z.string().uuid(),
        })
        .strict(),
      outputSchema: durableReviewResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    },
    ({ basket_id, submission_id }, ctx) =>
      runMcpOperation("submit_product_review", async () => {
        const owner = reviewOwner(ctx);
        const repository = localBasketRepository(ctx.mcpReq.signal);
        if (repository) {
          return submitDurableBasket(
            owner,
            basket_id,
            submission_id,
            repository,
            "unavailable",
          );
        }
        await ensureLoggedIn(client, loadCredentials);
        return success(await reviews.submit(owner, submission_id));
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
