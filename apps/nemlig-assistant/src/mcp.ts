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
      origin: z.literal("needs-review"),
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
const reviewActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("show") }),
  z.object({ kind: z.literal("end") }),
  z.object({
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
  }),
  z.object({
    kind: z.literal("revisit"),
    product_ids: z
      .array(z.number().int().positive())
      .min(1)
      .max(MAX_DRAFT_PRODUCTS),
  }),
  z.object({ kind: z.literal("prepare_submission") }),
  z.object({
    kind: z.literal("accept"),
    product_ids: z
      .array(z.number().int().positive())
      .min(1)
      .max(MAX_DRAFT_PRODUCTS),
  }),
  z.object({
    kind: z.literal("remove"),
    product_ids: z
      .array(z.number().int().positive())
      .min(1)
      .max(MAX_DRAFT_PRODUCTS),
  }),
  z.object({
    kind: z.literal("quantity"),
    product_id: z.number().int().positive(),
    quantity: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("navigate"),
    destination: z.enum(["needs-review", "ready", "alternatives"]),
  }),
  z.object({
    kind: z.literal("alternatives"),
    product_id: z.number().int().positive(),
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal("replace"),
    product_id: z.number().int().positive(),
    replacement_id: z.number().int().positive(),
  }),
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
 * draft list submission flow, while request context binds private state to a principal.
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
      instructions: `Search Nemlig products with find_groceries, read the actual basket with show_my_basket, and use the temporary conversation draft list to review products before adding them.

The real Nemlig basket is add-only. Never remove, decrease, replace, swap, clear, check out, pay, order, or select delivery slots. An added quantity is additional units, not a new absolute total. Local draft list edits never write to Nemlig.

For product discovery, use a concise Danish catalogue phrase; preserve a distinctive brand when useful. Search returns detailed candidates from one provider response, not the entire catalogue. An empty result differs from a failed search. Search and conversation edits do not open cards. When the user asks to see products visually, use the native Draft list: search for exact IDs, then call start_product_review with those items. This creates only conversation-local review state, never changes the real basket, and requires no special wording from the user. If a Draft list already exists, keep its contents and add new finds with update_product_review_conversation add; omit items in start_product_review to open another supported card without changing the list. Supported cards share the current conversation list and remain interchangeable; show reads it or reports unavailable without recreating it. Respect an explicit instruction not to create or edit a Draft list. If a later visual request conflicts with it, explain that the native view needs local Draft state and ask whether to allow it; until then use a concise text comparison, never an imitation card or image table. If no active list remains, ask before starting over. Use update_product_review_conversation and submit_product_review_conversation for model-side text/data operations. Both widget and conversation local actions use the current owner list; only real-basket submission uses the prepared submission_id. After an unconfirmed action, show current state and never replay the action.

Only Ready lines may be prepared for the real basket. A clear instruction to add the unchanged current Ready draft list authorizes exactly that prepared payload without another chat approval; local Ready status or a request merely to inspect does not. If product IDs, quantities, or scope are unclear or changed after the instruction, ask for exact approval. Both widget and conversation submit use only the exact prepared submission_id. Fresh validation and verified basket readback are mandatory. After an uncertain write, inspect the draft list and actual basket; never retry automatically.

The local draft list is conversation-scoped and temporary. If it is unavailable, ask before starting anew; do not restore old acceptance or approval. A successful tool result or image URL does not prove the ChatGPT client rendered a card. Provide a complete text fallback when needed. check_nemlig_connection distinguishes Nemlig account access from ChatGPT app connection and directs users to the secure page without collecting credentials in chat.`,
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
        "Products and the shared local Draft list supplied by Nemlig Assistant.",
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
        title: "Updated draft list",
        description:
          "This retired draft list card is inert and contains no shopping data.",
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
        "This host did not provide a conversation session. Reopen the review in ChatGPT; no local draft list was accessed.",
      );
    }
    return connectionId(ctx.sessionId); // One process/transport session for local MCP clients.
  };

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
        "Search the current Nemlig catalogue independently with a concise Danish grocery phrase translated or normalized from the request. This is not tied to the current draft list or an alternative target. Preserve a distinctive brand and Danish category when useful (for example 'Prince biscuits' becomes 'prince kiks'); use an open phrase such as 'salmiak' or a broad category phrase such as 'smør' when the user wants matching products generally. With result_count omitted, return all unique detailed candidates from the one provider response actually received, without an application cap; this does not enumerate or guarantee completeness of the entire catalogue. A successful empty result means no matches from this response only; an error means the search failed and must not be presented as no matches. Inspect results before making a deliberate related follow-up search; do not automatically repeat a failing query, launch a synonym cascade, or silently equate categories. Read-only: does not change the local draft list or real Nemlig basket. Not for reopening an existing draft list; use update_product_review_conversation show instead.",
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
        "Show the actual Nemlig basket, not the local draft list. For Ready products in the local draft list use update_product_review_conversation show or navigate. Show the current items and totals in your Nemlig basket. This does not change your basket.",
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
      title: "Show or start your draft list",
      description:
        "Open the native visual Draft list when the user asks to see products visually, even without naming this tool. With no active list, provide exact returned product IDs and quantities; all items initially need a decision. Omit items to open another supported card for an existing list without changing its contents. Acceptance and edits are conversation-local; nothing is sent to Nemlig. Use update_product_review_conversation add for new products in an existing list. Supported cards are interchangeable clients of the current conversation list. Respect an explicit request not to create or edit a Draft list. Temporary state can be lost on server restart or memory eviction.",
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
            "Exact returned products and intended package quantities to start a list. Omit only when reopening an existing list.",
          ),
      }),
      outputSchema: z.object({
        review: reviewSnapshotSchema,
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
        return success({ review });
      }),
  );

  const draftActionOutputSchema = z.union([
    z.object({ review: reviewSnapshotSchema }),
    z.object({ ended: z.literal(true) }),
    z.object({ unavailable: z.literal(true) }),
  ]);
  const draftActionAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
  };

  registerTool(
    "update_product_review_conversation",
    {
      title: "Update your draft list",
      description:
        "Show or edit the shared temporary local draft list using exact product IDs. Add newly found products, accept selected To decide products into Ready, revisit, remove, change quantity, navigate, search alternatives or discard with end. Supported cards are interchangeable clients of the authenticated conversation's current list. Uncounted alternatives include every distinct eligible candidate in the provider response actually returned; another search replaces the candidate set. Alternatives are for To decide only; replacement stays there until accepted separately. None of these local edits writes to Nemlig. A To decide-only clarification/add leaves the prepared Ready payload unchanged; any Ready ID or quantity change invalidates it. prepare_submission prepares only Ready lines at fresh exact prices and quantities, preserving unrelated Nemlig lines. A clear conversational command to add the current unchanged Ready draft list authorizes applying only that prepared payload without a redundant approval question; otherwise require explicit approval of the exact prepared change. If intent or scope is unclear, or any Ready product ID/quantity changed after the command, ask before applying. After errors show current state; never replay the action.",
      inputSchema: z
        .object({
          action: reviewActionSchema.describe(
            "The local draft list change, navigation, refresh, or preparation requested by the user.",
          ),
        })
        .strict(),
      outputSchema: draftActionOutputSchema,
      annotations: draftActionAnnotations,
      _meta: { ui: { visibility: ["model"] } },
    },
    ({ action }, ctx) => {
      const perform = () =>
        updateDraft(reviewOwner(ctx), action, ctx.mcpReq.signal).then(
          (result) =>
            success(
              result,
              result.unavailable
                ? "No active local Draft list remains. Ask before starting a new draft list; previous choices and approval are not restored."
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

  // Keep these names for already-open supported cards using the current contract.
  registerTool(
    "update_product_review",
    {
      title: "Update the current Draft list",
      description:
        "Internal UI action for the authenticated conversation's current Draft list. Supported cards are interchangeable clients. Actions use the current owner list without card or revision IDs; a missing list stays unavailable until explicitly started.",
      inputSchema: z
        .object({
          action: reviewActionSchema,
        })
        .strict(),
      outputSchema: draftActionOutputSchema,
      annotations: draftActionAnnotations,
      _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    },
    ({ action }, ctx) => {
      const perform = async () => {
        const owner = reviewOwner(ctx);
        const result = await updateDraft(owner, action, ctx.mcpReq.signal);
        return success(result);
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
      title: "Add explicitly requested Ready products to Nemlig",
      description:
        "After a clear user command to add the current Ready draft list, apply exactly the unchanged prepared product IDs and quantities; that command is sufficient conversational authorization, so do not ask again. Alternatively, apply only after explicit approval of the displayed exact prepared submission. Local Ready acceptance alone, or a request only to inspect/prepare, is not authorization. If scope is ambiguous or Ready contents/quantities changed after intent, ask which exact products to add. Fresh price validation and verified readback are mandatory. Requires the exact prepared submission_id. No automatic retry; on any error inspect the draft list and actual basket first.",
      inputSchema: z
        .object({
          submission_id: z
            .string()
            .uuid()
            .describe(
              "The exact prepared submission reference bound to the user's clear add instruction or explicit approval.",
            ),
        })
        .strict(),
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
    ({ submission_id }, ctx) =>
      runMcpOperation("submit_product_review_conversation", async () => {
        await ensureLoggedIn(client, loadCredentials);
        return success(await reviews.submit(reviewOwner(ctx), submission_id));
      }),
  );

  registerTool(
    "submit_product_review",
    {
      title: "Confirm the current Draft list addition",
      description:
        "Internal UI action for the current Draft list. Requires only its exact prepared submission reference.",
      inputSchema: z
        .object({
          submission_id: z.string().uuid(),
        })
        .strict(),
      outputSchema: z.object({
        review: reviewSnapshotSchema,
        result: applyResultSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    },
    ({ submission_id }, ctx) =>
      runMcpOperation("submit_product_review", async () => {
        const owner = reviewOwner(ctx);
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
