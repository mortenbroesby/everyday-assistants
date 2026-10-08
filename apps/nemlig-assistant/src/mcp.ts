#!/usr/bin/env node

import { inputRequired, McpServer, SUPPORTED_PROTOCOL_VERSIONS, type StandardSchemaWithJSON, type ToolAnnotations, type ToolCallback, type ServerContext } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import {
  NemligError,
  type ShoppingClient,
} from "./client.js";
import {
  ensureLoggedIn,
  getClient,
  NEMLIG_CODENAME,
  NEMLIG_VERSION,
  withAuthenticatedReadRetry,
} from "./runtime.js";
import { getCredentials, type Credentials } from "./config.js";
import {
  BasketProposalService,
  basketPayload,
} from "./proposals.js";
import { IMAGE_ORIGINS, createProductViewFromSummary, createProductViews, type ProductSummaryFacts, type ProductView } from "./product-presentation.js";
import { PRODUCT_VIEWER_MIME_TYPE, PRODUCT_VIEWER_RESOURCE_DOMAINS, PRODUCT_VIEWER_RESOURCE_METADATA, PRODUCT_VIEWER_RESOURCE_URI, productViewsToText, renderProductViewerHtml } from "./product-viewer.js";
import { RETIRED_PRODUCT_VIEWER_RESOURCE_URIS } from "./product-viewer-identity.js";
import { renderRetiredProductViewerHtml } from "./retired-product-viewer.js";
import { ProductReviewService } from "./product-review.js";
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
  "find_groceries", "show_my_basket",
] as const;
export const serviceAcceptanceResourceInventory = [PRODUCT_VIEWER_RESOURCE_URI, ...RETIRED_PRODUCT_VIEWER_RESOURCE_URIS] as const;

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
  dietary: z.object({ organic: z.boolean(), vegan: z.boolean(), gluten_free: z.boolean(), lactose_free: z.boolean() }).optional(),
  constraint_outcomes: z.record(z.string(), z.boolean()).optional(),
  basket_quantity: z.number().nonnegative().optional(),
  remaining_quantity: z.number().int().nonnegative().optional(),
});

const productViewSchema = z.discriminatedUnion("status", [
  z.object({
    context: z.enum(["search", "details", "result", "basket", "review"]),
    status: z.literal("complete"),
    product: candidateSchema,
    basket: z.object({ kind: z.literal("basket").optional(), quantity: z.number().optional(), line_total: z.number().optional() }).optional(),
    review: z.object({ kind: z.literal("review").optional(), quantity: z.number().int().positive().optional(), line_total: z.number().optional(), approved: z.boolean() }).optional(),
  }),
  z.object({
    context: z.enum(["search", "details", "result", "basket", "review"]),
    status: z.literal("unavailable"),
    product_id: z.number().int().positive().optional(),
  }),
]);

const reviewSnapshotSchema = z.object({
  review_id: z.string().uuid(), revision: z.number().int().positive(),
  destination: z.enum(["needs-review", "ready", "alternatives"]),
  items: z.array(z.object({ product_id: z.number().int().positive(), quantity: z.number().int().positive(), state: z.enum(["needs-review", "ready"]), view: productViewSchema })),
  alternatives: z.object({ product_id: z.number().int().positive(), origin: z.literal("needs-review"), query: z.string(), views: z.array(productViewSchema) }).optional(),
  submission: z.object({ submission_id: z.string().uuid(), status: z.enum(["prepared", "submitted", "uncertain"]), expires_at: z.string(), review: z.record(z.string(), z.unknown()) }).optional(),
});
const reviewActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("show") }),
  z.object({ kind: z.literal("end") }),
  z.object({ kind: z.literal("add"), items: z.array(z.object({ product_id: z.number().int().positive(), quantity: z.number().int().positive() })).min(1).max(50) }),
  z.object({ kind: z.literal("revisit"), product_ids: z.array(z.number().int().positive()).min(1).max(50) }),
  z.object({ kind: z.literal("prepare_submission") }),
  z.object({ kind: z.literal("accept"), product_ids: z.array(z.number().int().positive()).min(1).max(50) }),
  z.object({ kind: z.literal("remove"), product_ids: z.array(z.number().int().positive()).min(1).max(50) }),
  z.object({ kind: z.literal("quantity"), product_id: z.number().int().positive(), quantity: z.number().int().positive() }),
  z.object({ kind: z.literal("navigate"), destination: z.enum(["needs-review", "ready", "alternatives"]) }),
  z.object({ kind: z.literal("alternatives"), product_id: z.number().int().positive(), query: z.string().trim().min(1).max(200), limit: z.number().int().positive().optional() }),
  z.object({ kind: z.literal("replace"), product_id: z.number().int().positive(), replacement_id: z.number().int().positive() }),
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
const basketResultSchema = basketSchema.extend({ views: z.array(productViewSchema) });
const applyResultSchema = z.object({
  status: z.literal("completed"),
  operation: z.literal("additions"),
  replayed: z.boolean(),
  basket: basketSchema,
  views: z.array(productViewSchema).optional(),
});

export { rankProducts, safeNemligImageUrl } from "./product-presentation.js";

const currency = new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" });
const kr = (value: unknown): string =>
  typeof value === "number" ? currency.format(value).replaceAll("\u00a0", " ") : "ukendt pris";
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const lineText = (value: unknown, showSize = false): string => {
  const line = record(value);
  const size = showSize && typeof line.unit_size === "string" && line.unit_size ? ` (${line.unit_size})` : "";
  const quantity = typeof line.quantity === "number" ? String(line.quantity) : "Ukendt antal";
  return `${quantity} × ${typeof line.name === "string" ? line.name : "Ukendt vare"}${size} · ${kr(line.line_total ?? line.total)}`;
};
const basketText = (value: unknown, applied = false): string => {
  const basket = record(value);
  const items = Array.isArray(basket.items) ? basket.items : [];
  if (!items.length) return applied ? "Kurven er nu tom." : "Kurven er tom.";
  return `Kurven indeholder nu:\n${items.map((item) => lineText(item)).join("\n")}\nVarer i alt: ${kr(basket.products_price)}`;
};
const summaryFacts = (value: unknown): ProductSummaryFacts => {
  const item = record(value);
  const id = typeof item.product_id === "number" ? item.product_id : typeof item.id === "number" ? item.id : undefined;
  const labels = Array.isArray(item.labels) ? item.labels.filter((label): label is string => typeof label === "string") : undefined;
  return {
    ...(id === undefined ? {} : { id }),
    ...(typeof item.name === "string" ? { name: item.name } : {}),
    ...(typeof item.item_price === "number" ? { price: item.item_price } : typeof item.price === "number" ? { price: item.price } : {}),
    ...(typeof item.unit_price === "number" ? { unit_price: item.unit_price } : {}),
    ...(typeof item.unit === "string" ? { unit: item.unit } : {}),
    ...(typeof item.unit_size === "string" ? { unit_size: item.unit_size } : {}),
    ...(typeof item.category === "string" ? { category: item.category } : {}),
    ...(typeof item.subcategory === "string" ? { subcategory: item.subcategory } : {}),
    ...(typeof item.quantity === "number" ? { quantity: item.quantity } : {}),
    ...(typeof item.line_total === "number" ? { line_total: item.line_total } : typeof item.total === "number" ? { line_total: item.total } : {}),
    ...(typeof item.available === "boolean" ? { available: item.available } : {}),
    ...(labels === undefined ? {} : { labels }),
  };
};
const basketProductViews = (basket: unknown): ProductView[] => {
  const items = record(basket).items;
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const facts = summaryFacts(item);
    return createProductViewFromSummary(facts, { kind: "basket", quantity: facts.quantity, line_total: facts.line_total });
  });
};
const success = (value: unknown, text = JSON.stringify(value)) => ({
  content: [{ type: "text" as const, text }],
  structuredContent: (Array.isArray(value) ? { result: value } : value) as Record<string, unknown>,
});

const failure = (operation: string, error: unknown) => ({
  isError: true,
  content: [
    {
      type: "text" as const,
      text: error instanceof NemligError ? error.message : `${operation} failed.`,
    },
  ],
});

const runMcpOperation = async <Result>(operation: string, action: () => Promise<Result>): Promise<Result | ReturnType<typeof failure>> => {
  try {
    return await action();
  } catch (error) {
    return failure(operation, error);
  }
};

export const NEMLIG_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAYAAAB/HSuDAAAACXBIWXMAACxLAAAsSwGlPZapAAAgAElEQVR42uzdiZdU9YH34fmLRhTBJYkxEidxScZ4Ju/JpsYlzpyTvGZzsNk3FYKaqIDghiLuohMlGkUjism8GEFEBQfZZJGuqq7qruquru5af2/dImbUqGy9VN37fM55zpkzM1GD9L3396WWf+r+z5MCAAAAEG//5BcBAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAADAAAAAAAAYAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAAAwAPhFAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAADAB+EQAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAAADAAAAAGAAAAAAAAOAXwgAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAADAAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAAADAAAAAGAAAAAAAAwAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAADAAAAAAAAYAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAIABAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAAMAAAAAGAAAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAAADAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAABgAAAAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAAAYAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAAADAAAAAGAAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAwADgFwEAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAADAA+EUAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAADAA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AAAAgAEAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAABgAAAAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAAAYAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAPD/27FDAgAAAABB/1+7wU7ggFEwAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAADQAQAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAMAAEAEAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAADAARAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAAAwAIQAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAACeAJ4FMreMD0GTAAAAAElFTkSuQmCC";

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
  reviews: ProductReviewService = new ProductReviewService(client, { proposals }),
): McpServer {
  const server = new McpServer(
    {
      name: "nemlig-assistant",
      title: "Nemlig Assistant",
      version: NEMLIG_VERSION,
      icons: [{ src: NEMLIG_ASSISTANT_ICON, mimeType: "image/svg+xml", sizes: ["1024x1024"] }],
    },
    {
      instructions:
        `Search Nemlig products with find_groceries, read the actual basket with show_my_basket, and use the temporary conversation draft list to review products before adding them.

The real Nemlig basket is add-only. Never remove, decrease, replace, swap, clear, check out, pay, order, or select delivery slots. An added quantity is additional units, not a new absolute total. Local draft list edits never write to Nemlig.

For product discovery, use a concise Danish catalogue phrase; preserve a distinctive brand when useful. Search returns detailed candidates from one provider response, not the entire catalogue. An empty result differs from a failed search. Search and conversation edits do not open cards. When the user asks to see products visually, use the native Draft list: search for exact IDs, then call start_product_review with those items. This creates only conversation-local review state, never changes the real basket, and requires no special wording from the user. If a Draft list already exists, keep its contents and add new finds with update_product_review_conversation add; omit items in start_product_review to reopen its native card only when asked to see it again or the current card is stale. Repeating start_product_review renders another card and makes older cards read-only. Respect an explicit instruction not to create or edit a Draft list. If a later visual request conflicts with it, explain that the native view needs local Draft state and ask whether to allow it; until then use a concise text comparison, never an imitation card or image table. If no active list remains, ask before starting over. A stale card may automatically read and display the active list without a view token, but remains read-only. Only an explicit user action may activate that card and issue a new view token; it never starts a missing list. Widget edits stay in the same card. Use update_product_review_conversation and submit_product_review_conversation for model-side text/data operations. The legacy update_product_review and submit_product_review names require the newest card's view token for edits, so cached older cards cannot edit. After a stale edit, show current state and never replay the edit.

Only Ready lines may be prepared for the real basket. A clear instruction to add the unchanged current Ready draft list authorizes exactly that prepared payload without another chat approval; local Ready status or a request merely to inspect does not. If product IDs, quantities, or scope are unclear or changed after the instruction, ask for exact approval. For a model-side add, call submit_product_review_conversation only with the current review ID, revision, and submission ID. The widget submit action additionally requires its newest view token. Fresh validation and verified basket readback are mandatory. After an uncertain write, inspect the draft list and actual basket; never retry automatically.

The local draft list is conversation-scoped and temporary. If it is unavailable, ask before starting anew; do not restore old acceptance or approval. A successful tool result or image URL does not prove the ChatGPT client rendered a card. Provide a complete text fallback when needed. check_nemlig_connection distinguishes Nemlig account access from ChatGPT app connection and directs users to the secure page without collecting credentials in chat.`,
      supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    },
  );
  const allowedTools = requestContext?.kind === "service" ? new Set<string>(serviceAcceptanceToolInventory) : undefined;
  const securitySchemes = [{ type: "oauth2", scopes: [env.NEMLIG_MCP_REQUIRED_SCOPE?.trim() || "use:nemlig-assistant"] }];
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
    if (allowedTools && !allowedTools.has(name)) return undefined;
    return server.registerTool(name, {
      ...config,
      _meta: { ...config._meta, securitySchemes },
    }, handler);
  };
  server.registerResource(
    "nemlig-product-viewer",
    PRODUCT_VIEWER_RESOURCE_URI,
    { title: "Your draft list", description: "Product results and the shared local shopping draft list supplied by Nemlig Assistant.", mimeType: PRODUCT_VIEWER_MIME_TYPE },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: PRODUCT_VIEWER_MIME_TYPE, text: renderProductViewerHtml(), _meta: { ui: { csp: { connectDomains: [], resourceDomains: [...PRODUCT_VIEWER_RESOURCE_DOMAINS] }, prefersBorder: true } } }] }),
  );
  for (const [index, uri] of RETIRED_PRODUCT_VIEWER_RESOURCE_URIS.entries()) {
    server.registerResource(
      `nemlig-retired-product-viewer-v${index}`,
      uri,
      { title: "Updated draft list", description: "This retired draft list card is inert and contains no shopping data.", mimeType: PRODUCT_VIEWER_MIME_TYPE },
      async (resource) => ({ contents: [{ uri: resource.href, mimeType: PRODUCT_VIEWER_MIME_TYPE, text: renderRetiredProductViewerHtml() }] }),
    );
  }
  const localConnectionId = randomUUID();
  const connectionId = (sessionId: string | undefined): string =>
    requestContext ? `${requestContext.principalKey}\0${requestContext.policyRevision}` : sessionId ?? localConnectionId;
  const reviewOwner = (ctx: ServerContext): string => {
    const session = ctx.mcpReq._meta?.["openai/session"];
    if (session !== undefined && (typeof session !== "string" || !session.trim() || session.length > 512)) throw new NemligError("Invalid shopping session context.");
    // Conversation metadata scopes state; authenticated principal/policy still authorizes access.
    if (typeof session === "string") return JSON.stringify([connectionId(ctx.sessionId), session]);
    if (requestContext) throw new NemligError("This host did not provide a conversation session. Reopen the review in ChatGPT; no local draft list was accessed.");
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
      const review = review_id ? reviews.show(owner, review_id) : reviews.active(owner);
      return review
        ? { review }
        : { unavailable: true as const };
    }
    if (!review_id) throw new NemligError("Show the active draft list before editing it.");
    if (revision === undefined) throw new NemligError("Current draft list revision is required. Show the draft list first.");
    if (action.kind === "end") { reviews.end(owner, review_id, revision); return { ended: true as const }; }
    const review = action.kind === "prepare_submission"
      ? await reviews.prepare(owner, review_id, revision, signal)
      : await reviews.update(owner, review_id, revision, action, signal);
    return { review };
  };

  const runAuthenticatedRead = async <Result>(operation: string, action: () => Promise<Result>) =>
    runMcpOperation(operation, () => withAuthenticatedReadRetry(client, loadCredentials, action));

  registerTool(
    "get_profile",
    {
      title: "Get my Nemlig profile",
      description: "Show the authenticated profile and the live assistant release handling this request. This does not contact Nemlig or change shopping data.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        id: z.string().trim().min(1),
        release: z.object({ version: z.string().trim().min(1), codename: z.string().trim().min(1) }).strict(),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: { "openai/profile": true },
    },
    async () => {
      const id = requestContext?.principalKey;
      if (!id) return { isError: true, content: [{ type: "text" as const, text: "Authenticated profile unavailable." }] };
      return success({ id, release: { version: NEMLIG_VERSION, codename: NEMLIG_CODENAME } });
    },
  );

  registerTool(
    "check_nemlig_connection",
    {
      title: "Check my Nemlig connection",
      description: "Check whether your Nemlig account is connected. If needed, open the secure connection page; never send login details in chat.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        status: z.enum(["connected", "connection_required", "reconnect_required", "provider_unavailable"]),
        connection_url: z.literal(NEMLIG_CONNECT_URL),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, ctx) => {
      const credentials = await loadCredentials();
      if (!credentials && server.server.getClientCapabilities()?.elicitation?.url) {
        if (!ctx.mcpReq.inputResponses?.connect) {
          return inputRequired({
            inputRequests: {
              connect: inputRequired.elicitUrl({
                message: "Open the secure Nemlig connection page. Do not enter your password in chat.",
                url: NEMLIG_CONNECT_URL,
              }),
            },
          });
        }
      }
      if (!credentials) return success({ status: "connection_required", connection_url: NEMLIG_CONNECT_URL });
      try {
        await withAuthenticatedReadRetry(client, async () => credentials, () => client.getCart());
        return success({ status: "connected", connection_url: NEMLIG_CONNECT_URL });
      } catch (error) {
        if (error instanceof NemligError && error.status === 401) {
          return success({ status: "reconnect_required", connection_url: NEMLIG_CONNECT_URL });
        }
        if (error instanceof NemligError) {
          return success({ status: "provider_unavailable", connection_url: NEMLIG_CONNECT_URL });
        }
        throw error;
      }
    },
  );

  registerTool(
    "find_groceries",
    {
      title: "Search Nemlig products",
      description: "Search the current Nemlig catalogue independently with a concise Danish grocery phrase translated or normalized from the request. This is not tied to the current draft list or an alternative target. Preserve a distinctive brand and Danish category when useful (for example 'Prince biscuits' becomes 'prince kiks'); use an open phrase such as 'salmiak' or a broad category phrase such as 'smør' when the user wants matching products generally. With result_count omitted, return all unique detailed candidates from the one provider response actually received, without an application cap; this does not enumerate or guarantee completeness of the entire catalogue. A successful empty result means no matches from this response only; an error means the search failed and must not be presented as no matches. Inspect results before making a deliberate related follow-up search; do not automatically repeat a failing query, launch a synonym cascade, or silently equate categories. Read-only: does not change the local draft list or real Nemlig basket. Not for reopening an existing draft list; use update_product_review_conversation show instead.",
      inputSchema: z.object({
        search_term: z.string().min(1).describe("A concise Danish catalogue phrase. Use a broad phrase for all matching products; retain a distinctive brand when it matters. For example, 'Prince biscuits' becomes 'prince kiks'."),
        result_count: z.number().int().positive().optional().describe("Optional requested provider result count. If omitted, do not impose an application cap; the search still covers only the single provider response received."),
      }),
      outputSchema: z.object({ result: z.array(candidateSchema), views: z.array(productViewSchema) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ search_term, result_count }, ctx) => runAuthenticatedRead("find_groceries", async () => {
      const detailed = await resolveDetailedProductSearch(client, search_term, result_count, { signal: ctx.mcpReq.signal });
      const views = createProductViews(detailed.items, { kind: "search" });
      const result = views.flatMap((view) => view.status === "complete" ? [view.product] : []);
      return success({ result, views }, productViewsToText(views));
    }),
  );

  registerTool(
    "show_my_basket",
    {
      title: "Show my Nemlig basket",
      description: "Show the actual Nemlig basket, not the local draft list. For Ready products in the local draft list use update_product_review_conversation show or navigate. Show the current items and totals in your Nemlig basket. This does not change your basket.",
      outputSchema: basketResultSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    () => runAuthenticatedRead("show_my_basket", async () => {
      const basket = basketPayload(await client.getCart());
      const views = basketProductViews(basket);
      return success({ ...basket, views }, `${basketText(basket)}\n${productViewsToText(views)}`);
    }),
  );

  registerTool("start_product_review", {
    title: "Show or start your draft list",
    description: "Open the native visual Draft list when the user asks to see products visually, even without naming this tool. With no active list, provide exact returned product IDs and quantities; all items initially need a decision. Omit items to reopen an existing list without changing its contents. Acceptance and edits are conversation-local; nothing is sent to Nemlig. Use update_product_review_conversation add for new products in an existing list. Each call renders a new card and makes older cards read-only, so do not repeat while the current card is usable. Respect an explicit request not to create or edit a Draft list. Temporary state can be lost on server restart or memory eviction.",
    inputSchema: z.object({ items: z.array(z.object({ product_id: z.number().int().positive(), quantity: z.number().int().positive() })).min(1).max(50).optional().describe("Exact returned products and intended package quantities to start a list. Omit only when reopening an existing list.") }),
    outputSchema: z.object({ review: reviewSnapshotSchema, view_id: z.string().uuid() }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { ...PRODUCT_VIEWER_RESOURCE_METADATA, ui: { resourceUri: PRODUCT_VIEWER_RESOURCE_URI, visibility: ["model"] } },
  }, ({ items }, ctx) => runAuthenticatedRead("start_product_review", async () => {
    const owner = reviewOwner(ctx);
    const review = await reviews.start(owner, items ?? [], ctx.mcpReq.signal);
    return success(reviews.createView(owner, review.review_id));
  }));

  registerTool("update_product_review_conversation", {
    title: "Update your draft list",
    description: "Show or edit the shared temporary local draft list using exact product IDs. By conversation or viewer, add newly found products, accept selected To decide products into Ready, revisit, remove, change quantity, navigate, search alternatives or discard with end. The draft list state is server-authoritative; use its current revision. Uncounted alternatives include every distinct eligible candidate in the provider response actually returned; another search replaces the candidate set. Alternatives are for To decide only; replacement stays there until accepted separately. None of these local edits writes to Nemlig. A To decide-only clarification/add leaves the prepared Ready payload unchanged; any Ready ID or quantity change invalidates it. prepare_submission prepares only Ready lines at fresh exact prices and quantities, preserving unrelated Nemlig lines. A clear conversational command to add the current unchanged Ready draft list authorizes applying only that prepared payload without a redundant approval question; otherwise require explicit approval of the exact prepared change. If intent or scope is unclear, or any Ready product ID/quantity changed after the command, ask before applying. After errors show current state; never replay a stale edit.",
    inputSchema: z.object({ review_id: z.string().uuid().optional().describe("The current local draft list reference. May be omitted for show to recover this conversation’s active draft list."), revision: z.number().int().positive().optional().describe("Current draft list revision required for every action except show."), action: reviewActionSchema.describe("The local draft list change, navigation, refresh, or preparation requested by the user.") }),
    outputSchema: z.union([z.object({ review: reviewSnapshotSchema }), z.object({ ended: z.literal(true) }), z.object({ unavailable: z.literal(true) })]),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { visibility: ["model"] } },
  }, ({ review_id, revision, action }, ctx) => {
    const perform = () => updateDraft(reviewOwner(ctx), review_id, revision, action, ctx.mcpReq.signal)
      .then((result) => success(result, result.unavailable ? "No active local Draft list remains. Ask before starting a new draft list; previous choices and approval are not restored." : JSON.stringify(result)));
    return action.kind === "add" || action.kind === "alternatives" || action.kind === "prepare_submission"
      ? runAuthenticatedRead("update_product_review_conversation", perform)
      : runMcpOperation("update_product_review_conversation", perform);
  });

  // Keep these names for already-open cards. Tokenless show stays read-only;
  // every mutation requires the current view token.
  registerTool("update_product_review", {
    title: "Update the current Draft list view",
    description: "Internal UI action for the current Draft list. Edits require the newest rendered view token; older card view IDs are rejected before any local change. A show without view or draft IDs reads the current conversation draft without authority. Only the explicit activate option, used after a user click, issues a new view token; neither show nor activate can change or recreate the draft.",
    inputSchema: z.object({ view_id: z.string().uuid().optional(), review_id: z.string().uuid().optional(), revision: z.number().int().positive().optional(), action: reviewActionSchema, activate: z.boolean().optional() }),
    outputSchema: z.union([z.object({ review: reviewSnapshotSchema, view_id: z.string().uuid().optional() }), z.object({ ended: z.literal(true) }), z.object({ unavailable: z.literal(true) })]),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  }, ({ view_id, review_id, revision, action, activate }, ctx) => {
    const perform = async () => {
      const owner = reviewOwner(ctx);
      if (action.kind === "show" && (!view_id || !review_id || revision === undefined)) {
        // Stale-card lifecycle reads stay read-only; only a deliberate user action may take authority.
        const current = await updateDraft(owner, undefined, undefined, action, ctx.mcpReq.signal);
        return success(activate && current.review ? reviews.createView(owner, current.review.review_id) : current);
      }
      if (activate) throw new NemligError("Only show can activate the current Draft list view.");
      if (!view_id || !review_id || revision === undefined) {
        throw new NemligError("A current Draft list view_id is required for this action.");
      }
      reviews.assertCurrentView(owner, review_id, view_id);
      const result = await updateDraft(owner, review_id, revision, action, ctx.mcpReq.signal);
      return success(result.review ? { ...result, view_id } : result);
    };
    return action.kind === "add" || action.kind === "alternatives" || action.kind === "prepare_submission"
      ? runAuthenticatedRead("update_product_review", perform)
      : runMcpOperation("update_product_review", perform);
  });

  registerTool("submit_product_review_conversation", {
    title: "Add explicitly requested Ready products to Nemlig",
    description: "After a clear user command to add the current Ready draft list, apply exactly the unchanged prepared product IDs and quantities; that command is sufficient conversational authorization, so do not ask again. Alternatively, apply only after explicit approval of the displayed exact prepared submission. Local Ready acceptance alone, or a request only to inspect/prepare, is not authorization. If scope is ambiguous or Ready contents/quantities changed after intent, ask which exact products to add. Fresh price validation and verified readback are mandatory. Requires the current draft list revision and its submission_id. No automatic retry; on any error inspect the draft list and actual basket first.",
    inputSchema: z.object({ review_id: z.string().uuid().describe("The private local draft list reference."), revision: z.number().int().positive().describe("The latest draft list revision matching the prepared submission."), submission_id: z.string().uuid().describe("The exact prepared submission reference bound to the user's clear add instruction or explicit approval.") }),
    outputSchema: z.object({ review: reviewSnapshotSchema, result: applyResultSchema }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { visibility: ["model"] } },
  }, ({ review_id, revision, submission_id }, ctx) => runMcpOperation("submit_product_review_conversation", async () => {
    await ensureLoggedIn(client, loadCredentials);
    return success(await reviews.submit(reviewOwner(ctx), review_id, revision, submission_id));
  }));

  registerTool("submit_product_review", {
    title: "Confirm the current Draft list addition",
    description: "Internal UI action for the newest rendered Draft list only. Requires its current view, review revision, and prepared submission reference.",
    inputSchema: z.object({ view_id: z.string().uuid(), review_id: z.string().uuid(), revision: z.number().int().positive(), submission_id: z.string().uuid() }),
    outputSchema: z.object({ review: reviewSnapshotSchema, result: applyResultSchema, view_id: z.string().uuid() }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  }, ({ view_id, review_id, revision, submission_id }, ctx) => runMcpOperation("submit_product_review", async () => {
    const owner = reviewOwner(ctx);
    reviews.assertCurrentView(owner, review_id, view_id);
    await ensureLoggedIn(client, loadCredentials);
    return success({ ...(await reviews.submit(owner, review_id, revision, submission_id)), view_id });
  }));

  return server;
}

export async function main(): Promise<void> {
  serveStdio(() => createMcpServer(), { legacy: "reject" });
}

if (process.argv[1] && ["mcp.js", "mcp.ts"].includes(basename(realpathSync(process.argv[1])))) {
  main().catch(() => {
    console.error("Nemlig MCP server failed.");
    process.exitCode = 1;
  });
}
