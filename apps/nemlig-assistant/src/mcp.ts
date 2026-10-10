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
import { MAX_DRAFT_PRODUCTS, ProductReviewService } from "./product-review.js";
import { resolveDetailedProductSearch } from "./product-discovery.js";
import { NEMLIG_ASSISTANT_ICON } from "./nemlig-assistant-icon.js";

export const NEMLIG_CONNECT_URL = "https://nemlig-mcp.broesby.dk/connect";
export const NEMLIG_IMAGE_ORIGINS = IMAGE_ORIGINS;

/**
 * Server-derived request identity that scopes private state and invalidates it
 * when policy changes; it is never a user credential.
 */
export interface McpRequestContext {
  principalKey: string;
  policyRevision: string;
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

const candidateSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().optional(),
  price: z.number().optional(),
  unit_price: z.number().optional(),
  unit: z.string().optional(),
  unit_size: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  currency: z.literal("DKK").optional(),
  description: z.string().max(2_000).optional(),
  declaration: z.string().max(4_000).optional(),
  details: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  brand: z.string().optional(),
  available: z.boolean().optional(),
  is_organic: z.boolean().optional(),
  is_frozen: z.boolean().optional(),
  is_on_discount: z.boolean().optional(),
  image_url: z.string().optional(),
  labels: z.array(z.string()),
  tags: z.array(z.string()),
  source: z.enum(["favorite", "catalog"]).optional(),
  dietary: z
    .object({
      organic: z.boolean(),
      vegan: z.boolean(),
      gluten_free: z.boolean(),
      lactose_free: z.boolean(),
    })
    .optional(),
  constraint_outcomes: z.record(z.string(), z.boolean()).optional(),
  basket_quantity: z.number().nonnegative().optional(),
  remaining_quantity: z.number().int().nonnegative().optional(),
});

const productViewSchema = z.discriminatedUnion("status", [
  z.object({
    context: z.enum(["search", "details", "result", "basket", "review"]),
    status: z.literal("complete"),
    product: candidateSchema,
    basket: z
      .object({
        kind: z.literal("basket").optional(),
        quantity: z.number().optional(),
        line_total: z.number().optional(),
      })
      .optional(),
    review: z
      .object({
        kind: z.literal("review").optional(),
        quantity: z.number().int().positive().optional(),
        line_total: z.number().optional(),
        approved: z.boolean(),
      })
      .optional(),
  }),
  z.object({
    context: z.enum(["search", "details", "result", "basket", "review"]),
    status: z.literal("unavailable"),
    product_id: z.number().int().positive().optional(),
  }),
]);

const reviewSnapshotSchema = z.object({
  review_id: z.string().uuid(),
  revision: z.number().int().positive(),
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
      verified_additions: z.number().int().positive().optional(),
      expires_at: z.string(),
      review: z.record(z.string(), z.unknown()),
    })
    .optional(),
});
const showReviewActionSchema = z.object({ kind: z.literal("show") });
const endReviewActionSchema = z.object({ kind: z.literal("end") });
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
const revisitReviewActionSchema = z.object({
  kind: z.literal("revisit"),
  product_ids: z
    .array(z.number().int().positive())
    .min(1)
    .max(MAX_DRAFT_PRODUCTS),
});
const prepareReviewActionSchema = z.object({
  kind: z.literal("prepare_submission"),
});
const acceptReviewActionSchema = z.object({
  kind: z.literal("accept"),
  product_ids: z
    .array(z.number().int().positive())
    .min(1)
    .max(MAX_DRAFT_PRODUCTS),
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
const reviewActionSchema = z.discriminatedUnion("kind", [
  showReviewActionSchema,
  endReviewActionSchema,
  addReviewActionSchema,
  revisitReviewActionSchema,
  prepareReviewActionSchema,
  acceptReviewActionSchema,
  removeReviewActionSchema,
  quantityReviewActionSchema,
  navigateReviewActionSchema,
  alternativesReviewActionSchema,
  replaceReviewActionSchema,
]);
const modelReviewActionSchema = z.discriminatedUnion("kind", [
  showReviewActionSchema,
  endReviewActionSchema,
  addReviewActionSchema,
  prepareReviewActionSchema,
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
      instructions: `Search Nemlig products with find_groceries, read the actual basket with show_my_basket, and use the temporary Local basket to review products before adding them.

The real Nemlig basket is add-only. Never remove, decrease, replace, swap, clear, check out, pay, order, or select delivery slots. An added quantity is additional units, not a new absolute total. Local basket edits never write to Nemlig.

For product discovery, use a concise Danish catalogue phrase; preserve a distinctive brand when useful. Search returns detailed candidates from one provider response, not the entire catalogue. An empty result differs from a failed search. Search and conversation edits do not open cards. When the user asks to see products visually, use the native Local basket: search for exact IDs, then call start_product_review with those items. This creates only conversation-local review state, never changes the real basket, and requires no special wording from the user. If a Local basket already exists, keep its contents and add new finds with update_product_review_conversation add; omit items in start_product_review to reopen its native card only when asked to see it again or the current card is stale. Repeating start_product_review renders another card and makes older cards read-only. Respect an explicit instruction not to create or edit a Local basket. If a later visual request conflicts with it, explain that the native view needs Local basket state and ask whether to allow it; until then use a concise text comparison, never an imitation card or image table. If no active Local basket remains, ask before starting over. A stale card may automatically read and display the active Local basket without a view token, but remains read-only. Only an explicit user action may activate that card and issue a new view token; it never starts a missing list. Widget edits stay in the same card. Use update_product_review_conversation and submit_product_review_conversation for model-side text/data operations. The legacy update_product_review and submit_product_review names require the newest card's view token for edits, so cached older cards cannot edit. After a stale edit, show current state and never replay the edit.

Prepare every current Local basket item, regardless of any legacy stored review state. If any item is unavailable or incomplete, preparation must stop without omitting that item or preparing a partial selection. A clear instruction to add the unchanged current Local basket authorizes exactly that prepared payload without another chat approval; local state or a request merely to inspect does not. If product IDs, quantities, or scope are unclear or changed after the instruction, ask for exact approval. For a model-side add, call submit_product_review_conversation only with the current review ID, revision, and submission ID. The widget submit action additionally requires its newest view token. Fresh validation and verified basket readback are mandatory. After an uncertain write, inspect the Local basket and actual Nemlig basket; never retry automatically.

The Local basket is conversation-scoped and temporary. If it is unavailable, ask before starting anew; do not restore old acceptance or approval. A successful tool result or image URL does not prove the ChatGPT client rendered a card. Provide a complete text fallback when needed. check_nemlig_connection distinguishes Nemlig account access from ChatGPT app connection and directs users to the secure page without collecting credentials in chat.`,
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
        "Products and the shared temporary Local basket supplied by Nemlig Assistant.",
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
  const connectionId = (sessionId: string | undefined): string =>
    requestContext
      ? `${requestContext.principalKey}\0${requestContext.policyRevision}`
      : (sessionId ?? localConnectionId);
  const reviewOwner = (ctx: ServerContext): string => {
    const session = ctx.mcpReq._meta?.["openai/session"];
    if (
      session !== undefined &&
      (typeof session !== "string" || !session.trim() || session.length > 512)
    ) {
      throw new NemligError("Invalid shopping session context.");
    }
    // Conversation metadata scopes state; authenticated principal/policy still authorizes access.
    if (typeof session === "string") {
      return JSON.stringify([connectionId(ctx.sessionId), session]);
    }
    if (requestContext) {
      throw new NemligError(
        "This host did not provide a conversation session. Reopen the review in ChatGPT; no Local basket was accessed.",
      );
    }
    return connectionId(ctx.sessionId); // One process/transport session for local MCP clients.
  };

  const updateDraft = async (
    owner: string,
    review_id: string | undefined,
    revision: number | undefined,
    action: z.infer<typeof reviewActionSchema>,
    signal: AbortSignal,
  ) => {
    if (action.kind === "show") {
      const review = review_id
        ? reviews.show(owner, review_id)
        : reviews.active(owner);
      return review ? { review } : { unavailable: true as const };
    }
    if (!review_id) {
      throw new NemligError("Show the active Local basket before editing it.");
    }
    if (revision === undefined) {
      throw new NemligError(
        "Current Local basket revision is required. Show it first.",
      );
    }
    if (action.kind === "end") {
      reviews.end(owner, review_id, revision);
      return { ended: true as const };
    }
    const review =
      action.kind === "prepare_submission"
        ? await reviews.prepare(owner, review_id, revision, signal)
        : await reviews.update(owner, review_id, revision, action, signal);
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
          { signal: ctx.mcpReq.signal },
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
        "Show only the actual Nemlig basket and its current items and totals. To inspect local shopping choices, use the Local basket view. This tool does not change your basket.",
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
        "Open the native Local basket when the user asks to see products visually, even without naming this tool. With no active list, provide exact returned product IDs and quantities; every item is Ready for whole-basket submission. Omit items only to reopen an existing list without changing its contents. Local edits never write to Nemlig. Use update_product_review_conversation add for new products in an existing list. Each call renders a new card and makes older cards read-only, so do not repeat while the current card is usable. Respect an explicit request not to create or edit a Local basket. Temporary state can be lost on server restart or memory eviction.",
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
            "Exact returned products and intended package quantities to start a Local basket. Every row is a Ready submission candidate. Omit only when reopening an existing Local basket.",
          ),
      }),
      outputSchema: z.object({
        review: reviewSnapshotSchema,
        view_id: z.string().uuid(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: {
        ...PRODUCT_VIEWER_RESOURCE_METADATA,
        ui: { resourceUri: PRODUCT_VIEWER_RESOURCE_URI, visibility: ["model"] },
      },
    },
    ({ items }, ctx) =>
      runAuthenticatedRead("start_product_review", async () => {
        const owner = reviewOwner(ctx);
        const review = await reviews.start(
          owner,
          items ?? [],
          ctx.mcpReq.signal,
        );
        return success(reviews.createView(owner, review.review_id));
      }),
  );

  registerTool(
    "update_product_review_conversation",
    {
      title: "Update your Local basket",
      description:
        "Show or edit the shared temporary Local basket using exact product IDs. New products are Ready submission candidates immediately. Use the current revision to remove a local row, change its quantity, or search alternatives. Alternatives search does not change the row; explicitly choosing an available exact result replaces it locally at the same quantity and keeps it Ready. None of these local edits writes to the Nemlig basket. Every current Local basket item is included in prepare_submission regardless of legacy stored state; fresh validation must stop on any unavailable or incomplete row rather than silently omitting it. Any item ID or quantity change invalidates a prepared submission. A clear conversational command to add the unchanged current Local basket authorizes only that exact prepared payload without redundant approval; otherwise require explicit approval of the exact prepared change. If intent or scope is unclear, or any item ID/quantity changes after the command, ask before applying. After errors show current state; never replay a stale edit.",
      inputSchema: z.object({
        review_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "The current Local basket reference. May be omitted for show to recover this conversation’s active Local basket.",
          ),
        revision: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Current Local basket revision required for every action except show.",
          ),
        action: modelReviewActionSchema.describe(
          "A Local basket quantity/removal/alternative action, refresh, or whole-basket preparation. Every item remains a submission candidate.",
        ),
      }),
      outputSchema: z.union([
        z.object({ review: reviewSnapshotSchema }),
        z.object({ ended: z.literal(true) }),
        z.object({ unavailable: z.literal(true) }),
      ]),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { visibility: ["model"] } },
    },
    ({ review_id, revision, action }, ctx) => {
      const perform = () =>
        updateDraft(
          reviewOwner(ctx),
          review_id,
          revision,
          action,
          ctx.mcpReq.signal,
        ).then((result) =>
          success(
            result,
            result.unavailable
              ? "No active Local basket remains. Ask before starting a new Local basket; previous choices and approval are not restored."
              : JSON.stringify(result),
          ),
        );
      return action.kind === "add" ||
        action.kind === "alternatives" ||
        action.kind === "prepare_submission"
        ? runAuthenticatedRead("update_product_review_conversation", perform)
        : runMcpOperation("update_product_review_conversation", perform);
    },
  );

  // Keep these names for already-open cards. Tokenless show stays read-only;
  // every mutation requires the current view token.
  registerTool(
    "update_product_review",
    {
      title: "Update the current Local basket view",
      description:
        "Internal UI action for the current Local basket. Edits require the newest rendered view token; older card view IDs are rejected before any local change. A show without view or draft IDs reads the current conversation draft without authority. Only the explicit activate option, used after a user click, issues a new view token; neither show nor activate can change or recreate the draft.",
      inputSchema: z.object({
        view_id: z.string().uuid().optional(),
        review_id: z.string().uuid().optional(),
        revision: z.number().int().positive().optional(),
        action: reviewActionSchema,
        activate: z.boolean().optional(),
      }),
      outputSchema: z.union([
        z.object({
          review: reviewSnapshotSchema,
          view_id: z.string().uuid().optional(),
        }),
        z.object({ ended: z.literal(true) }),
        z.object({ unavailable: z.literal(true) }),
      ]),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    },
    ({ view_id, review_id, revision, action, activate }, ctx) => {
      const perform = async () => {
        const owner = reviewOwner(ctx);
        if (
          action.kind === "show" &&
          (!view_id || !review_id || revision === undefined)
        ) {
          // Stale-card lifecycle reads stay read-only; only a deliberate user action may take authority.
          const current = await updateDraft(
            owner,
            undefined,
            undefined,
            action,
            ctx.mcpReq.signal,
          );
          return success(
            activate && current.review
              ? reviews.createView(owner, current.review.review_id)
              : current,
          );
        }
        if (activate) {
          throw new NemligError(
            "Only show can activate the current Local basket view.",
          );
        }
        if (!view_id || !review_id || revision === undefined) {
          throw new NemligError(
            "A current Local basket view_id is required for this action.",
          );
        }
        reviews.assertCurrentView(owner, review_id, view_id);
        const result = await updateDraft(
          owner,
          review_id,
          revision,
          action,
          ctx.mcpReq.signal,
        );
        return success(result.review ? { ...result, view_id } : result);
      };
      return action.kind === "add" ||
        action.kind === "alternatives" ||
        action.kind === "prepare_submission"
        ? runAuthenticatedRead("update_product_review", perform)
        : runMcpOperation("update_product_review", perform);
    },
  );

  registerTool(
    "submit_product_review_conversation",
    {
      title: "Submit the approved Local basket to Nemlig",
      description:
        "After a clear user command to add the current Local basket, apply exactly the unchanged prepared product IDs and quantities; that command is sufficient conversational authorization, so do not ask again. Alternatively, apply only after explicit approval of the displayed exact prepared submission. Local presence or a request only to inspect/prepare is not authorization. If scope is ambiguous or any Local basket item or quantity changed after intent, ask which exact products to add. The prepared submission must contain every current item and stop before writing if any item is unavailable or incomplete. Fresh price validation and verified readback are mandatory. Requires the current review revision and its submission_id. No automatic retry; on any error inspect the Local basket and actual Nemlig basket first.",
      inputSchema: z.object({
        review_id: z
          .string()
          .uuid()
          .describe("The private Local basket reference."),
        revision: z
          .number()
          .int()
          .positive()
          .describe(
            "The latest Local basket revision matching the prepared submission.",
          ),
        submission_id: z
          .string()
          .uuid()
          .describe(
            "The exact prepared submission reference bound to the user's clear add instruction or explicit approval.",
          ),
      }),
      outputSchema: z.object({
        review: reviewSnapshotSchema,
        result: applyResultSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { visibility: ["model"] } },
    },
    ({ review_id, revision, submission_id }, ctx) =>
      runMcpOperation("submit_product_review_conversation", async () => {
        await ensureLoggedIn(client, loadCredentials);
        return success(
          await reviews.submit(
            reviewOwner(ctx),
            review_id,
            revision,
            submission_id,
          ),
        );
      }),
  );

  registerTool(
    "submit_product_review",
    {
      title: "Confirm the current Local basket submission",
      description:
        "Internal UI action for the newest rendered Local basket only. Requires its current view, review revision, and prepared submission reference.",
      inputSchema: z.object({
        view_id: z.string().uuid(),
        review_id: z.string().uuid(),
        revision: z.number().int().positive(),
        submission_id: z.string().uuid(),
      }),
      outputSchema: z.object({
        review: reviewSnapshotSchema,
        result: applyResultSchema,
        view_id: z.string().uuid(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    },
    ({ view_id, review_id, revision, submission_id }, ctx) =>
      runMcpOperation("submit_product_review", async () => {
        const owner = reviewOwner(ctx);
        reviews.assertCurrentView(owner, review_id, view_id);
        await ensureLoggedIn(client, loadCredentials);
        return success({
          ...(await reviews.submit(owner, review_id, revision, submission_id)),
          view_id,
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
