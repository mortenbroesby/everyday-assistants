#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import {
  FAVORITES_SEARCH_POOL,
  matchFavorites,
  NemligError,
  type Basket,
  type Product,
} from "./client.js";
import { ensureLoggedIn, getClient, NEMLIG_VERSION, type ShoppingClient } from "./cli.js";
import { getCredentials, type Credentials } from "./config.js";
import {
  createFeatureRequest,
  type FeatureRequest,
  type FeatureRequestResult,
} from "./feature-request.js";
import {
  BasketProposalService,
  type ApplyResult,
  type NoopProposalView,
  type ProposalOperation,
  type ProposalView,
} from "./proposals.js";
import { configuredPlanSnapshotStorage, loadShoppingPlan, resolveShoppingPlan, saveShoppingPlan, shoppingPlanLineSchema, type ShoppingPlan } from "./plans.js";
import {
  configuredShoppingListStorage,
  copyShoppingList,
  migrateShoppingPlan,
  saveShoppingList,
  setShoppingListStatus,
  shoppingListLineSchema,
  showShoppingLists,
  type ShoppingList,
} from "./shopping-lists.js";

export const PICKER_URI = "ui://nemlig/picker.html";
export const PICKER_MIME_TYPE = "text/html;profile=mcp-app";
export const NEMLIG_CONNECT_URL = "https://nemlig-mcp.broesby.dk/connect";
export const NEMLIG_IMAGE_ORIGINS = ["https://nemlig.com", "https://www.nemlig.com"] as const;

export const safeNemligImageUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && NEMLIG_IMAGE_ORIGINS.includes(url.origin as typeof NEMLIG_IMAGE_ORIGINS[number]) ? url.href : undefined;
  } catch { return undefined; }
};

/**
 * Server-derived request identity that scopes private state and invalidates it
 * when policy changes; it is never a user credential.
 */
export interface McpRequestContext {
  principalKey: string;
  policyRevision: string;
  tier: 0 | 1 | 2;
}

const falseValues = new Set(["0", "false", "no", "off"]);

export const appsEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  !falseValues.has((env.NEMLIG_MCP_APPS ?? "1").trim().toLowerCase());

const candidateSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().optional(),
  price: z.number().optional(),
  unit_price: z.number().optional(),
  unit_size: z.string().optional(),
  description: z.string().optional(),
  details: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  brand: z.string().optional(),
  available: z.boolean(),
  is_organic: z.boolean(),
  is_frozen: z.boolean(),
  is_on_discount: z.boolean(),
  image_url: z.string().optional(),
  tags: z.array(z.string()),
  source: z.enum(["favorite", "catalog"]).optional(),
  dietary: z.object({ organic: z.boolean(), vegan: z.boolean(), gluten_free: z.boolean(), lactose_free: z.boolean() }).optional(),
  constraint_outcomes: z.record(z.string(), z.boolean()).optional(),
  basket_quantity: z.number().nonnegative().optional(),
  remaining_quantity: z.number().int().nonnegative().optional(),
});

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

const proposalBase = {
  applicable: z.literal(true),
  proposal_id: z.string().uuid(),
  connection_bound: z.literal(true),
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  basket_fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
};

const proposalLineSchema = z.object({
  product_id: z.number().int().positive(),
  name: z.string(),
  unit_size: z.string(),
  quantity: z.number().int().positive(),
  available: z.boolean(),
  unit_price: z.number(),
  line_total: z.number(),
  labels: z.array(z.string()),
});

const additionsProposalSchema = z.object({
  ...proposalBase,
  operation: z.literal("additions"),
  authorization: z.enum(["exact_review", "same_run_automatic"]),
  review: z.object({
    lines: z.array(proposalLineSchema).min(1),
    expected_products_price: z.number(),
    expected_number_of_products: z.number(),
  }),
});

const removalProposalSchema = z.object({
  applicable: z.boolean(),
  operation: z.literal("removal"),
  proposal_id: z.string().uuid().optional(),
  connection_bound: z.literal(true).optional(),
  issued_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
  basket_fingerprint: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  review: z.object({ line: basketItemSchema }).optional(),
  reason: z.string().optional(),
});

const clearProposalSchema = z.object({
  applicable: z.boolean(),
  operation: z.literal("clear"),
  proposal_id: z.string().uuid().optional(),
  connection_bound: z.literal(true).optional(),
  issued_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
  basket_fingerprint: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  review: z.object({ basket: basketSchema }).optional(),
  reason: z.string().optional(),
});

const replacementLineSchema = z.object({
  product_id: z.number().int().positive(),
  name: z.string(),
  unit: z.string(),
  unit_size: z.string(),
  quantity: z.number().int().positive(),
  available: z.boolean(),
  item_price: z.number(),
  unit_price: z.number().optional(),
  line_total: z.number(),
  labels: z.array(z.string()),
});

const replacementProposalSchema = z.object({
  applicable: z.boolean(),
  operation: z.literal("replacement"),
  proposal_id: z.string().uuid().optional(),
  connection_bound: z.literal(true).optional(),
  issued_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
  basket_fingerprint: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  review: z.object({
    current_line: replacementLineSchema,
    replacement_line: replacementLineSchema,
    existing_replacement_line: basketItemSchema.nullable(),
    current_products_price: z.number(),
    expected_products_price: z.number(),
    expected_number_of_products: z.number(),
    price_difference: z.number(),
    potential_savings: z.number().positive().optional(),
  }).optional(),
  reason: z.string().optional(),
});

const applyResultSchema = z.object({
  status: z.literal("completed"),
  operation: z.enum(["additions", "removal", "replacement", "clear"]),
  replayed: z.boolean(),
  basket: basketSchema,
});

const featureRequestResultSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string().url(),
});

const shoppingPlanToolInputSchema = z.object({
  lines: z.array(shoppingPlanLineSchema.omit({ selected_product_id: true }).extend({
    selected_product: z.number().int().positive().optional().describe("The exact product selected from an earlier result."),
  })).min(1).max(50).describe("The groceries to plan, with quantities and any requirements or preferences."),
  mode: z.enum(["automatic", "manual"]).default("automatic").describe("Automatic selects only deterministic clear matches; manual leaves candidates for choice."),
}).strict();

const shoppingRunToolInputSchema = shoppingPlanToolInputSchema.extend({
  proceed: z.boolean().default(false).describe("True only when the user explicitly asked to add sufficiently clear products in this same run."),
}).strict();

const internalShoppingPlan = (input: z.infer<typeof shoppingPlanToolInputSchema>) => ({
  lines: input.lines.map(({ selected_product, ...line }) => ({ ...line, selected_product_id: selected_product })),
  mode: input.mode,
});

const planOutputSchema = z.object({
  mode: z.enum(["automatic", "manual"]),
  lines: z.array(z.any()),
  selected_estimated_total: z.number(),
  summary: z.any(),
  automatic_authorization: z.string().uuid().optional(),
});

const selectedAdditions = (plan: ShoppingPlan): Array<{ product_id: number; quantity: number }> => {
  const quantities = new Map<number, number>();
  for (const line of plan.lines) if (line.resolution === "selected" && line.selected_product_id && line.remaining_quantity > 0) {
    quantities.set(line.selected_product_id, (quantities.get(line.selected_product_id) ?? 0) + line.remaining_quantity);
  }
  return [...quantities].map(([product_id, quantity]) => ({ product_id, quantity }));
};

const safePlanImages = (plan: ShoppingPlan): ShoppingPlan => ({
  ...plan,
  lines: plan.lines.map((line) => ({
    ...line,
    candidates: line.candidates.map((candidate) => ({ ...candidate, image_url: safeNemligImageUrl(candidate.image_url) })),
  })),
});

export function rankProducts(products: Product[], query: string): Candidate[] {
  const candidates = products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    unit_price: product.unitPrice,
    unit_size: product.unitSize || undefined,
    ...(product.description ? { description: product.description } : {}),
    ...(product.details?.length ? { details: product.details } : {}),
    brand: product.brand || undefined,
    available: product.available,
    is_organic: product.isOrganic,
    is_frozen: product.isFrozen,
    is_on_discount: product.isOnDiscount,
    image_url: safeNemligImageUrl(product.imageUrl),
    tags: [] as string[],
  }));
  const available = candidates.filter((product) => product.available);
  if (available.length) {
    available.reduce((lowest, product) =>
      (product.price ?? Number.POSITIVE_INFINITY) < (lowest.price ?? Number.POSITIVE_INFINITY)
        ? product
        : lowest,
    ).tags.push("cheapest");
    const keyword = query.trim().split(/\s+/u)[0]?.toLocaleLowerCase("da-DK") ?? "";
    available
      .find(
        (product) =>
          !product.is_frozen &&
          (!keyword || product.name?.toLocaleLowerCase("da-DK").includes(keyword)),
      )
      ?.tags.push("recommended");
  }
  for (const product of candidates) if (product.is_organic) product.tags.push("organic");
  return candidates;
}

interface BasketPayload extends Record<string, unknown> {
  items: Basket["items"];
  products_price: number | undefined;
  delivery_price: number | undefined;
  number_of_products: number | undefined;
  delivery_time: string | undefined;
}

const basketPayload = (basket: Basket): BasketPayload => ({
  items: basket.items,
  products_price: basket.productsPrice,
  delivery_price: basket.deliveryPrice,
  number_of_products: basket.numberOfProducts,
  delivery_time: basket.deliveryTime,
});

const currency = new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" });
const kr = (value: unknown): string =>
  typeof value === "number" ? currency.format(value).replaceAll("\u00a0", " ") : "ukendt pris";
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const lineText = (value: unknown, showSize = false): string => {
  const line = record(value);
  const size = showSize && typeof line.unit_size === "string" && line.unit_size ? ` (${line.unit_size})` : "";
  return `${typeof line.quantity === "number" ? line.quantity : 0} × ${typeof line.name === "string" ? line.name : "Ukendt vare"}${size} · ${kr(line.line_total ?? line.total)}`;
};
const basketText = (value: unknown, applied = false): string => {
  const basket = record(value);
  const items = Array.isArray(basket.items) ? basket.items : [];
  if (!items.length) return applied ? "Kurven er nu tom." : "Kurven er tom.";
  return `Kurven indeholder nu:\n${items.map((item) => lineText(item)).join("\n")}\nVarer i alt: ${kr(basket.products_price)}`;
};
const proposalText = (proposal: ProposalView | NoopProposalView): string => {
  if (!proposal.applicable) return "Der er ikke noget at ændre i kurven.";
  const review = record(proposal.review);
  if (proposal.operation === "additions") {
    const lines = Array.isArray(review.lines) ? review.lines : [];
    return `Tilføj til kurven:\n${lines.map((line) => lineText(line, true)).join("\n")}\nForventet varetotal: ${kr(review.expected_products_price)}${proposal.authorization === "same_run_automatic" ? "\nGodkendt af den aktuelle automatiske kørsel." : "\nSkal jeg tilføje det?"}`;
  }
  if (proposal.operation === "removal") return `Fjern ${lineText(review.line)} fra kurven?`;
  if (proposal.operation === "replacement") {
    return `Erstat ${lineText(review.current_line, true)}\nmed ${lineText(review.replacement_line, true)}\nPrisforskel: ${kr(Math.abs(Number(review.price_difference ?? 0)))}\nSkal jeg erstatte varen?`;
  }
  const basket = record(review.basket);
  const items = Array.isArray(basket.items) ? basket.items : [];
  return `Tøm kurven:\n${items.map((item) => lineText(item)).join("\n")}\nSkal jeg tømme kurven?`;
};

const success = (value: unknown, text = JSON.stringify(value)) => ({
  content: [{ type: "text" as const, text }],
  structuredContent: (Array.isArray(value) ? { result: value } : value) as Record<string, unknown>,
});

const listPayload = (list: ShoppingList) => ({
  schema_version: list.schema_version,
  id: list.id,
  name: list.name,
  type: list.type,
  status: list.status,
  revision: list.revision,
  created_at: list.created_at,
  updated_at: list.updated_at,
  ...(list.archived_at ? { archived_at: list.archived_at } : {}),
  lines: list.lines,
});
const listText = (list: ShoppingList): string => `${list.name} · ${list.lines.length} ${list.lines.length === 1 ? "vare" : "varer"}`;

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

const NEMLIG_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAYAAAB/HSuDAAAACXBIWXMAACxLAAAsSwGlPZapAAAgAElEQVR42uzdiZdU9YH34fmLRhTBJYkxEidxScZ4Ju/JpsYlzpyTvGZzsNk3FYKaqIDghiLuohMlGkUjism8GEFEBQfZZJGuqq7qruquru5af2/dImbUqGy9VN37fM55zpkzM1GD9L3396WWf+r+z5MCAAAAEG//5BcBAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAADAAAAAAAAYAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAAAwAPhFAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAADAB+EQAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAAADAAAAAGAAAAAAAAOAXwgAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAADAAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAAADAAAAAGAAAAAAAAwAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAADAAAAAAAAYAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAIABAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAAMAAAAAGAAAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAAADAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAABgAAAAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAAAYAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAAADAAAAAGAAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAwADgFwEAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAABgAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAYAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAADAA+EUAAAAAAwAAAABgAAAAAAAMAAAAAIABAAAAADAA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AAAAgAEAAAAADAAAAACAAQAAAAAwAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAABgAAAAAAAMAAAAAIABAAAAADAAAAAAAAYAAAAAwAAAAAAAGAAAAAAAAwAAAAAYAAAAAAADAAAAAGAAAAAAAAwAAAAAgAEAAAAAMAAAAAAABgAAAADAAAAAAAAGAAAAAMAAAAAAABgAAAAAAAMAAAAAYAAAAAAADAAAAACAAQAAAAAwAAAAAPD/27FDAgAAAABB/1+7wU7ggFEwAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAADQAQAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAMAAEAEAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAADAARAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAAAwAIQAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAAAMAAAAAMAAAAAAAAwAAAAAMAAAAAMAAAAAAAAwAAAAAwAAAAAAADAAAAADAAAAAAACeAJ4FMreMD0GTAAAAAElFTkSuQmCC";

/**
 * Creates the explicit MCP catalog. Basket writes remain staged through the
 * review/apply tools, while request context binds private state to a principal.
 */
export function createMcpServer(
  client: ShoppingClient = getClient(),
  loadCredentials: () => Promise<Credentials | undefined> = getCredentials,
  env: NodeJS.ProcessEnv = process.env,
  proposals: BasketProposalService = new BasketProposalService(client),
  requestFeature: (request: FeatureRequest) => Promise<FeatureRequestResult> = createFeatureRequest,
  requestContext?: McpRequestContext,
): McpServer {
  const server = new McpServer(
    {
      name: "nemlig-assistant",
      title: "Nemlig Assistant",
      version: NEMLIG_VERSION,
      icons: [{ src: NEMLIG_ICON, mimeType: "image/png", sizes: ["1024x1024"] }],
    },
    {
      instructions:
        "Use Nemlig Assistant for current Nemlig products, prices, availability, favourites, basket contents, saved shopping lists, recipes, conversation lists, or choosing and adding groceries. For ordinary find or add requests, use plan_my_shopping in automatic mode with one short Danish catalogue phrase per line; use manual mode only when the user asks to choose or when automatic results are unclear. Translate or normalize English, mixed-language, misspelled, and over-specific wording before the tool call: keep distinctive brand words, replace a foreign generic category with the intended Danish category, and omit conversational context. Ordinary planning searches the current Nemlig catalogue once per line, never favourites. Use find_groceries only for a direct catalogue search and show_my_favorites only when explicitly requested. For 'use this recipe/list and go ahead', set proceed true, then pass the returned same-run authorization through review_items_to_add and immediately use add_approved_items for its unchanged proposal; do not ask for redundant approval. Without explicit proceed intent, a plan, saved or resumed plan, candidate choice, or exact review never authorizes mutation. A same-run authorization covers only clear additions from that run, never unresolved lines, removals, replacements, clearing, checkout, payment, ordering, or delivery slots. Named lists can refresh up to fifty selected lines. Present concise added, already-covered, unresolved, failed, and automatic-coverage results; omit internal references unless troubleshooting. Every basket change revalidates exact data, is single-use, stops on uncertainty, and reads back the basket. Suggest an improvement only when the user explicitly asks.",
    },
  );
  const localConnectionId = randomUUID();
  const connectionId = (sessionId: string | undefined): string =>
    requestContext ? `${requestContext.principalKey}\0${requestContext.policyRevision}` : sessionId ?? localConnectionId;
  const search = async (query: string, limit: number) =>
    rankProducts(await client.searchProducts(query, limit), query);
  const planStorage = configuredPlanSnapshotStorage(env, requestContext);
  const listStorage = configuredShoppingListStorage(env);
  const ownerSubject = requestContext?.principalKey ?? env.NEMLIG_MCP_AUTH0_OWNER_SUBJECT ?? "local-owner";
  const resolveRun = async (input: z.infer<typeof shoppingRunToolInputSchema>, sessionId?: string) => {
    const plan = safePlanImages(await resolveShoppingPlan(client, internalShoppingPlan(input)));
    const items = selectedAdditions(plan);
    return {
      ...plan,
      ...(input.proceed && input.mode === "automatic" && items.length ? {
        automatic_authorization: proposals.createAutomaticAuthorization(connectionId(sessionId), items),
      } : {}),
    };
  };

  server.registerTool(
    "check_nemlig_connection",
    {
      title: "Check my Nemlig connection",
      description: "Check whether your Nemlig account is connected. If needed, open the secure connection page; never send login details in chat.",
      inputSchema: {},
      outputSchema: z.object({
        status: z.enum(["connected", "connection_required", "reconnect_required"]),
        connection_url: z.literal(NEMLIG_CONNECT_URL),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async () => {
      const connected = Boolean(requestContext || await loadCredentials());
      if (!connected && server.server.getClientCapabilities()?.elicitation?.url) {
        await server.server.elicitInput({
          mode: "url",
          message: "Open the secure Nemlig connection page. Do not enter your password in chat.",
          elicitationId: randomUUID(),
          url: NEMLIG_CONNECT_URL,
        });
      }
      const status = connected ? "connected" as const : "connection_required" as const;
      return success({ status, connection_url: NEMLIG_CONNECT_URL });
    },
  );

  server.registerTool(
    "find_groceries",
    {
      title: "Find groceries",
      description: "Search the current Nemlig catalogue directly with one short Danish grocery phrase translated or normalized before the call. Keep a distinctive brand plus its Danish category, for example 'Prince biscuits' becomes 'prince kiks'. This does not change your basket.",
      inputSchema: {
        search_term: z.string().min(1).describe("One short Danish catalogue phrase, translated or normalized from the request before this call. Preserve a distinctive brand and add the Danish category; use 'prince kiks', not 'Prince biscuits' or a full sentence."),
        result_count: z.number().int().positive().default(8).describe("The maximum number of products to show."),
      },
      outputSchema: z.object({ result: z.array(candidateSchema) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ search_term, result_count }) => runMcpOperation("find_groceries", async () => success(await search(search_term, result_count))),
  );

  server.registerTool(
    "show_my_favorites",
    {
      title: "Show my favourites",
      description: "Show or search your saved Nemlig favourites. This does not change your favourites or basket.",
      inputSchema: {
        search_term: z.string().trim().min(1).optional().describe("Optional text for narrowing your saved favourites."),
        result_count: z.number().int().positive().max(50).default(8).describe("The maximum number of favourites to show."),
        page: z.number().int().positive().default(1).describe("Which page of favourites to show, starting at 1."),
      },
      outputSchema: z.object({ result: z.array(candidateSchema) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ search_term, result_count, page }) => runMcpOperation("show_my_favorites", async () => {
        await ensureLoggedIn(client, loadCredentials);
        const favorites = await client.listFavorites(
          search_term === undefined ? result_count : FAVORITES_SEARCH_POOL,
          search_term === undefined ? page : 1,
        );
        const products = search_term === undefined ? favorites : matchFavorites(favorites, search_term, page * result_count).slice((page - 1) * result_count);
        return success(rankProducts(products, search_term ?? ""));
      }),
  );

  server.registerTool(
    "plan_my_shopping",
    {
      title: "Plan my shopping",
      description: "Resolve 1–50 groceries automatically by default, or leave choices open in manual mode. Set proceed only for the user's explicit same-run instruction to add clear results. Planning itself never changes the basket.",
      inputSchema: shoppingRunToolInputSchema.shape,
      outputSchema: planOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      ...(appsEnabled(env) ? { _meta: { ui: { resourceUri: PICKER_URI } } } : {}),
    },
    (input, extra) => runMcpOperation("plan_my_shopping", async () => {
      await ensureLoggedIn(client, loadCredentials);
      return success(await resolveRun(input, extra.sessionId));
    }),
  );

  server.registerTool(
    "show_grocery_sections",
    {
      title: "Show grocery sections", description: "Show the grocery sections currently available at Nemlig. This does not change your account or basket.",
      outputSchema: z.object({ departments: z.array(z.object({ id: z.string(), name: z.string() })) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    () => runMcpOperation("show_grocery_sections", async () => success({ departments: await client.listDepartments() })),
  );

  server.registerTool(
    "browse_grocery_section",
    {
      title: "Browse a grocery section", description: "Browse current products in one Nemlig grocery section. This does not change your basket.",
      inputSchema: {
        section: z.string().min(1).describe("The exact section reference returned by Show grocery sections."),
        result_count: z.number().int().positive().max(50).default(20).describe("The maximum number of products to show."),
        page: z.number().int().positive().default(1).describe("Which page of products to show, starting at 1."),
      },
      outputSchema: z.object({ result: z.array(candidateSchema), page: z.number().int().positive(), has_next: z.boolean() }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ section, result_count, page }) => runMcpOperation("browse_grocery_section", async () => {
      const result = await client.browseDepartment(section, result_count, page);
      return success({ result: rankProducts(result.products, ""), page: result.page, has_next: result.hasNext });
    }),
  );

  server.registerTool(
    "save_my_shopping_plan",
    {
      title: "Save my shopping plan", description: "Save this private shopping plan so you can continue later. This creates saved state but does not change your basket.",
      inputSchema: shoppingPlanToolInputSchema.shape,
      outputSchema: z.object({ id: z.string().uuid(), created_at: z.string().datetime() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (input) => runMcpOperation("save_my_shopping_plan", async () => success(await saveShoppingPlan(internalShoppingPlan(input), planStorage))),
  );

  server.registerTool(
    "continue_my_shopping_plan",
    {
      title: "Continue my shopping plan", description: "Continue a saved shopping plan using current products, prices, and basket contents. This does not change your basket.",
      inputSchema: { saved_plan: z.string().uuid().describe("The saved-plan reference returned when the plan was saved.") }, outputSchema: planOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ saved_plan }) => runMcpOperation("continue_my_shopping_plan", async () => {
      await ensureLoggedIn(client, loadCredentials);
      return success(safePlanImages(await resolveShoppingPlan(client, await loadShoppingPlan(saved_plan, planStorage))));
    }),
  );

  server.registerTool(
    "show_my_shopping_lists",
    {
      title: "Show my shopping lists",
      description: "Show your active named shopping lists, or open one list by name. This only reads private saved lists and does not contact Nemlig or change your basket.",
      inputSchema: {
        list: z.string().trim().min(1).max(120).optional().describe("Optional list name to open."),
        include_archived: z.boolean().default(false).describe("Also show archived lists."),
      },
      outputSchema: z.object({ lists: z.array(z.any()) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    ({ list, include_archived }) => runMcpOperation("show_my_shopping_lists", async () => {
        const lists = await showShoppingLists(ownerSubject, listStorage, list, include_archived);
        return success({ lists: lists.map(listPayload) }, lists.length ? lists.map(listText).join("\n") : "Du har ingen aktive indkøbslister endnu.");
      }),
  );

  server.registerTool(
    "save_my_shopping_list",
    {
      title: "Save my shopping list",
      description: "Create a named shopping list or replace the current version of one. This saves private list state only and does not contact Nemlig or change your basket.",
      inputSchema: {
        list: z.string().trim().min(1).max(120).optional().describe("For an edit, the existing list name or exact reference. Omit when creating a list."),
        expected_revision: z.number().int().positive().optional().describe("For an edit, the current revision returned when the list was opened."),
        name: z.string().trim().min(1).max(120).describe("The human-readable list name."),
        type: z.enum(["reusable", "occasion"]).describe("Reusable for regular shopping, or occasion for an event. Neither runs automatically."),
        lines: z.array(shoppingListLineSchema).max(50).describe("The ordered groceries to keep on the list, up to fifty."),
      },
      outputSchema: z.object({ list: z.any() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (input) => runMcpOperation("save_my_shopping_list", async () => {
        const saved = await saveShoppingList(ownerSubject, listStorage, input);
        return success({ list: listPayload(saved) }, `${saved.name} er gemt med ${saved.lines.length} ${saved.lines.length === 1 ? "vare" : "varer"}.`);
      }),
  );

  server.registerTool(
    "copy_my_shopping_list",
    {
      title: "Copy my shopping list",
      description: "Copy an existing named list under a new name. This only saves private list state and does not contact Nemlig or change your basket.",
      inputSchema: {
        source_list: z.string().trim().min(1).max(120).describe("The name or exact reference of the list to copy."),
        new_name: z.string().trim().min(1).max(120).describe("The name for the copy."),
        type: z.enum(["reusable", "occasion"]).optional().describe("Optional list kind for the copy; otherwise it keeps the source kind."),
      },
      outputSchema: z.object({ list: z.any() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ source_list, new_name, type }) => runMcpOperation("copy_my_shopping_list", async () => {
        const copied = await copyShoppingList(ownerSubject, listStorage, source_list, new_name, type);
        return success({ list: listPayload(copied) }, `${copied.name} er gemt som en ny liste.`);
      }),
  );

  server.registerTool(
    "set_my_shopping_list_status",
    {
      title: "Archive or restore my shopping list",
      description: "Archive a named shopping list or restore it later. This is reversible and does not contact Nemlig or change your basket.",
      inputSchema: {
        list: z.string().trim().min(1).max(120).describe("The list name or exact reference."),
        status: z.enum(["active", "archived"]).describe("Active restores the list; archived hides it from the normal list view."),
        expected_revision: z.number().int().positive().describe("The current revision returned when the list was opened."),
      },
      outputSchema: z.object({ list: z.any() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ list, status, expected_revision }) => runMcpOperation("set_my_shopping_list_status", async () => {
        const updated = await setShoppingListStatus(ownerSubject, listStorage, list, status, expected_revision);
        return success({ list: listPayload(updated) }, status === "archived" ? `${updated.name} er arkiveret.` : `${updated.name} er aktiv igen.`);
      }),
  );

  server.registerTool(
    "shop_from_my_list",
    {
      title: "Shop from my list",
      description: "Refresh selected groceries from a named list using current Nemlig favourites, products, prices, availability, and basket coverage. This does not save live results or change your basket.",
      inputSchema: {
        list: z.string().trim().min(1).max(120).describe("The list name or exact reference."),
        line_ids: z.array(z.string().trim().min(1).max(80)).min(1).max(50).describe("One to fifty exact grocery-line references from the opened list."),
        mode: z.enum(["automatic", "manual"]).default("automatic").describe("Automatic selects only deterministic clear matches; manual leaves candidates for choice."),
        proceed: z.boolean().default(false).describe("True only when the user explicitly asked to add clear results in this same run."),
      },
      outputSchema: planOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      ...(appsEnabled(env) ? { _meta: { ui: { resourceUri: PICKER_URI } } } : {}),
    },
    ({ list, line_ids, mode, proceed }, extra) => runMcpOperation("shop_from_my_list", async () => {
        const [saved] = await showShoppingLists(ownerSubject, listStorage, list, true);
        const requested = new Set(line_ids);
        if (requested.size !== line_ids.length) throw new NemligError("Choose each grocery line only once.");
        const selected = saved!.lines.filter(({ id }) => requested.has(id));
        if (selected.length !== requested.size) throw new NemligError(`One or more selected groceries are not in “${saved!.name}”. Open the list again.`);
        await ensureLoggedIn(client, loadCredentials);
        return success(await resolveRun({ lines: selected.map((line) => ({
          id: line.id, name: line.name, quantity: line.quantity, constraints: line.constraints,
          preferences: line.preferences, selected_product: line.preferred_product_id,
        })), mode, proceed }, extra.sessionId));
      }),
  );

  server.registerTool(
    "migrate_my_saved_plan",
    {
      title: "Turn a saved plan into a shopping list",
      description: "Copy an older saved shopping plan into a new named list while keeping the original plan unchanged. This does not contact Nemlig or change your basket.",
      inputSchema: {
        saved_plan: z.string().uuid().describe("The older saved-plan reference."),
        name: z.string().trim().min(1).max(120).describe("The name for the new shopping list."),
        type: z.enum(["reusable", "occasion"]).describe("Reusable for regular shopping, or occasion for an event. Neither runs automatically."),
      },
      outputSchema: z.object({ list: z.any() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ saved_plan, name, type }) => runMcpOperation("migrate_my_saved_plan", async () => {
        const migrated = await migrateShoppingPlan(ownerSubject, listStorage, planStorage, saved_plan, name, type);
        return success({ list: listPayload(migrated) }, `${migrated.name} er oprettet fra den gemte plan.`);
      }),
  );

  server.registerTool(
    "suggest_an_improvement",
    {
      title: "Suggest an improvement",
      description: "Send a Nemlig Assistant suggestion by creating a GitHub issue. This changes an external system but never your Nemlig basket.",
      inputSchema: {
        title: z.string().trim().min(3).max(120).describe("A short title for the suggestion."),
        summary: z.string().trim().min(1).max(2_000).describe("What should improve and why it would help."),
        acceptance_criteria: z.array(z.string().trim().min(1).max(300)).max(10).default([]).describe("Simple observable outcomes that would make the improvement complete."),
        context: z.string().trim().min(1).max(1_000).optional().describe("Optional non-sensitive context that helps explain the suggestion."),
      },
      outputSchema: featureRequestResultSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    (request) => runMcpOperation("suggest_an_improvement", async () => success({ ...await requestFeature(request) })),
  );

  server.registerTool(
    "show_my_basket",
    {
      title: "Show my basket",
      description: "Show the current items and totals in your Nemlig basket. This does not change your basket.",
      outputSchema: basketSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    () => runMcpOperation("show_my_basket", async () => {
        await ensureLoggedIn(client, loadCredentials);
        const basket = basketPayload(await client.getCart());
        return success(basket, basketText(basket));
      }),
  );

  server.registerTool(
    "review_items_to_add",
    {
      title: "Review items to add",
      description: "Review exact products and quantities before adding them. This does not change your basket.",
      inputSchema: {
        items: z
          .array(
            z.object({
              product: z.number().int().positive().describe("The exact product reference returned by a grocery search or plan."),
              quantity: z.number().int().positive().describe("How many of this product to add."),
            }),
          )
          .min(1)
          .max(50)
          .describe("The exact products and quantities to review together."),
        authorization: z.enum(["exact_review", "same_run_automatic"]).describe("Use same_run_automatic only with the token from an explicitly authorized current run."),
        automatic_authorization: z.string().uuid().optional().describe("The same-run token returned by automatic planning."),
      },
      outputSchema: additionsProposalSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ items, authorization, automatic_authorization }, extra) => runMcpOperation("review_items_to_add", async () => {
        await ensureLoggedIn(client, loadCredentials);
        if (authorization === "same_run_automatic" && !automatic_authorization) throw new NemligError("The current automatic authorization is required.");
        if (authorization === "exact_review" && automatic_authorization) throw new NemligError("Automatic authorization cannot be attached to an exact review.");
        const proposal = await proposals.prepareAdditions(
          connectionId(extra.sessionId),
          items.map(({ product, quantity }) => ({ product_id: product, quantity })),
          authorization === "same_run_automatic"
            ? { kind: authorization, token: automatic_authorization! }
            : { kind: authorization },
        );
        return success(proposal, proposalText(proposal));
      }),
  );

  const registerAction = (
    name: "add_approved_items" | "remove_approved_item" | "make_approved_item_swap" | "empty_approved_basket",
    operation: ProposalOperation,
    title: string,
    description: string,
    destructiveHint: boolean,
  ): void => {
    server.registerTool(
      name,
      {
        title,
        description,
        inputSchema: { approved_review: z.string().uuid().describe("The private reference returned by the matching unchanged review.") },
        outputSchema: applyResultSchema,
        annotations: { readOnlyHint: false, destructiveHint, openWorldHint: true },
      },
      ({ approved_review }, extra) => runMcpOperation(name, async () => {
          await ensureLoggedIn(client, loadCredentials);
          const result: ApplyResult = await proposals.apply(connectionId(extra.sessionId), approved_review, operation);
          return success(result, basketText(result.basket, true));
        }),
    );
  };

  registerAction("add_approved_items", "additions", "Add the approved items", "Add exactly the items from the approved unchanged review, then show the verified basket. This changes your basket.", false);

  server.registerTool(
    "review_item_to_remove",
    {
      title: "Review an item to remove",
      description: "Review one exact basket item before removing it. This does not change your basket.",
      inputSchema: { basket_item: z.number().int().positive().describe("The exact item reference shown in your current basket.") },
      outputSchema: removalProposalSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ basket_item }, extra) => runMcpOperation("review_item_to_remove", async () => {
        await ensureLoggedIn(client, loadCredentials);
        const proposal = await proposals.prepareRemoval(connectionId(extra.sessionId), basket_item);
        return success(proposal, proposalText(proposal));
      }),
  );

  registerAction("remove_approved_item", "removal", "Remove the approved item", "Remove exactly the item from the approved unchanged review, then show the verified basket. This changes your basket.", true);

  server.registerTool(
    "review_item_swap",
    {
      title: "Review swapping an item",
      description: "Compare swapping one basket item for one exact product, including the basket-price difference. This does not change your basket or claim the products are equivalent.",
      inputSchema: {
        current_item: z.number().int().positive().describe("The exact item reference shown in your current basket."),
        replacement_item: z.number().int().positive().describe("The exact replacement product reference returned by a search or plan."),
        quantity: z.number().int().positive().describe("The final quantity of the replacement product."),
      },
      outputSchema: replacementProposalSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ current_item, replacement_item, quantity }, extra) => runMcpOperation("review_item_swap", async () => {
        await ensureLoggedIn(client, loadCredentials);
        const proposal = await proposals.prepareReplacement(
          connectionId(extra.sessionId),
          current_item,
          replacement_item,
          quantity,
        );
        return success(proposal, proposalText(proposal));
      }),
  );

  registerAction("make_approved_item_swap", "replacement", "Make the approved swap", "Make exactly the swap from the approved unchanged review, then show the verified basket. This changes your basket.", true);

  server.registerTool(
    "review_emptying_basket",
    {
      title: "Review emptying my basket",
      description: "Review every current basket item before emptying the basket. This does not change your basket.",
      outputSchema: clearProposalSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    (extra) => runMcpOperation("review_emptying_basket", async () => {
        await ensureLoggedIn(client, loadCredentials);
        const proposal = await proposals.prepareClear(connectionId(extra.sessionId));
        return success(proposal, proposalText(proposal));
      }),
  );

  registerAction("empty_approved_basket", "clear", "Empty my approved basket", "Empty exactly the approved unchanged basket, then verify that it is empty. This changes your basket.", true);

  if (appsEnabled(env)) {
    server.registerTool(
      "choose_products_visually",
      {
        title: "Choose products visually",
        description: "Show an interactive product chooser. This does not change your basket, and text-only clients receive the same products.",
        inputSchema: {
          search_term: z.string().min(1).describe("What to search for, preferably using Danish grocery terms."),
          result_count: z.number().int().positive().default(8).describe("The maximum number of products to show."),
        },
        outputSchema: z.object({ result: z.array(candidateSchema) }),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
        _meta: { ui: { resourceUri: PICKER_URI } },
      },
      ({ search_term, result_count }) => runMcpOperation("choose_products_visually", async () => success(await search(search_term, result_count))),
    );
    server.registerResource(
      "Nemlig product picker",
      PICKER_URI,
      {
        mimeType: PICKER_MIME_TYPE,
        _meta: { ui: { csp: { resourceDomains: ["https://unpkg.com", ...NEMLIG_IMAGE_ORIGINS] } } },
      },
      async () => ({
        contents: [
          {
            uri: PICKER_URI,
            mimeType: PICKER_MIME_TYPE,
            text: PICKER_HTML,
            _meta: { ui: { csp: { resourceDomains: ["https://unpkg.com", ...NEMLIG_IMAGE_ORIGINS] } } },
          },
        ],
      }),
    );
  }
  return server;
}

export async function main(): Promise<void> {
  await createMcpServer().connect(new StdioServerTransport());
}

if (process.argv[1] && ["mcp.js", "mcp.ts"].includes(basename(realpathSync(process.argv[1])))) {
  main().catch(() => {
    console.error("Nemlig MCP server failed.");
    process.exitCode = 1;
  });
}

const PICKER_HTML = `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:12px;color:#1a1a1a}.grid{display:grid;gap:10px}.card{border:1px solid #ddd;border-radius:10px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:12px}.product{display:flex;align-items:center;gap:12px;min-width:0}.product-image{width:72px;height:72px;object-fit:contain;border-radius:8px;background:#f7f7f7;flex:none}.name{font-weight:650}.meta{color:#555;font-size:13px}.badges{display:flex;gap:4px;margin-top:6px}.badge{font-size:11px;padding:2px 7px;border-radius:999px;background:#eef}.price{font-weight:700}button{padding:8px 14px;border:0;border-radius:8px;background:#087d33;color:white;font-weight:650}button:disabled{background:#9bbfa6}.empty{color:#666;padding:16px}.choices{display:grid;gap:8px;margin:8px 0}.choice{display:flex;align-items:center;gap:8px;border:1px solid #ddd;border-radius:8px;padding:8px}.choice input{flex:none}
</style>
</head>
<body><main id="root" aria-live="polite"><div class="empty">Henter varer…</div></main>
<script type="module">
import { App } from "https://unpkg.com/@modelcontextprotocol/ext-apps@0.4.0/app-with-deps";
const root=document.getElementById("root");const app=new App({name:"Nemlig Picker",version:"1.0.0"});
const kr=v=>typeof v==="number"?v.toFixed(2).replace(".",",")+" kr.":"";
const imageOrigins=new Set(["https://nemlig.com","https://www.nemlig.com"]);const safeImage=value=>{try{const url=new URL(value);return url.protocol==="https:"&&imageOrigins.has(url.origin)?url.href:null}catch{return null}};
const imageFor=product=>{const src=safeImage(product.image_url);if(!src)return null;const image=document.createElement("img");image.className="product-image";image.src=src;image.alt=product.name?"Billede af "+product.name:"Varebillede";image.loading="lazy";image.referrerPolicy="no-referrer";image.onerror=()=>image.remove();return image};
const read=result=>{if(result?.structuredContent)return result.structuredContent;const text=(result?.content||result||[]).find(item=>item.type==="text");if(!text)return null;try{return JSON.parse(text.text)}catch{return null}};
const parse=result=>{const value=read(result);return Array.isArray(value)?value:value?.result||[]};
const render=products=>{if(!products.length){root.innerHTML='<div class="empty">Ingen varer fundet.</div>';return}const grid=document.createElement("div");grid.className="grid";for(const product of products){const card=document.createElement("article");card.className="card";const productArea=document.createElement("div");productArea.className="product";const image=imageFor(product);if(image)productArea.append(image);const info=document.createElement("div");const name=document.createElement("div");name.className="name";name.textContent=product.name??"Ukendt vare";const meta=document.createElement("div");meta.className="meta";meta.textContent=[product.brand,product.unit_size].filter(Boolean).join(" · ");const badges=document.createElement("div");badges.className="badges";for(const tag of product.tags||[]){const badge=document.createElement("span");badge.className="badge";badge.textContent=tag;badges.append(badge)}info.append(name,meta,badges);productArea.append(info);const actions=document.createElement("div");const price=document.createElement("div");price.className="price";price.textContent=kr(product.price);const prepare=document.createElement("button");prepare.textContent="Forbered";prepare.disabled=!product.available||product.id==null;prepare.onclick=async()=>prepareBatch([{product:product.id,quantity:1}],prepare);actions.append(price,prepare);card.append(productArea,actions);grid.append(card)}root.replaceChildren(grid)};
const prepareBatch=async(items,button)=>{button.disabled=true;button.textContent="Forbereder…";try{const response=await app.callServerTool({name:"review_items_to_add",arguments:{items,authorization:"exact_review"}});const proposal=read(response);if(!proposal?.applicable||!proposal.review?.lines?.length)throw new Error("invalid proposal");const review=document.createElement("section");review.setAttribute("aria-label","Præcis kurvegennemgang");const lines=document.createElement("div");lines.className="meta";lines.textContent=proposal.review.lines.map(line=>[line.quantity+" × "+line.name,line.unit_size,kr(line.line_total)].filter(Boolean).join(" · ")).join(" | ")+" · Forventet varetotal: "+kr(proposal.review.expected_products_price);const apply=document.createElement("button");apply.textContent="Godkend og tilføj";apply.onclick=async()=>{apply.disabled=true;apply.textContent="Afventer værtsgodkendelse…";try{const response=await app.callServerTool({name:"add_approved_items",arguments:{approved_review:proposal.proposal_id}});const applied=read(response);if(applied?.status!=="completed"||!applied.basket)throw new Error("unverified result");apply.textContent="Tilføjet ✓";const verified=document.createElement("div");verified.className="meta";verified.textContent="Kurven indeholder nu: "+(applied.basket.items||[]).map(item=>(item.quantity??0)+" × "+(item.name??"Ukendt")+" ("+kr(item.total)+")").join(" · ");review.append(verified)}catch{apply.textContent="Afvist";apply.disabled=false}};review.append(lines,apply);root.replaceChildren(review)}catch{button.textContent="Fejl";button.disabled=false}};
const renderPlan=plan=>{const form=document.createElement("form");form.className="grid";const controls=[];for(const line of plan.lines){if(plan.mode==="automatic"&&line.resolution==="selected")continue;const field=document.createElement("fieldset");const legend=document.createElement("legend");legend.textContent=line.name+" · ønsket "+line.quantity;field.append(legend);if(line.resolution==="covered"){const covered=document.createElement("div");covered.textContent="Allerede dækket i kurven";field.append(covered);form.append(field);continue}const choices=document.createElement("div");choices.className="choices";for(const candidate of line.candidates){const label=document.createElement("label");label.className="choice";const radio=document.createElement("input");radio.type="radio";radio.name=line.id;radio.value=String(candidate.id);radio.checked=candidate.id===line.selected_product_id;const image=imageFor(candidate);if(image)label.append(radio,image);else label.append(radio);const text=document.createElement("span");text.textContent=[candidate.name,candidate.brand,candidate.unit_size,candidate.description,...(candidate.details||[]).map(detail=>detail.key+": "+detail.value),kr(candidate.price),candidate.available?"Tilgængelig":"Ikke tilgængelig"].filter(Boolean).join(" · ");label.append(text);choices.append(label)}if(!line.candidates.length){const empty=document.createElement("div");empty.className="meta";empty.textContent="Ingen egnet vare";choices.append(empty)}const quantity=document.createElement("input");quantity.type="number";quantity.min="1";quantity.max="99";quantity.value=String(line.remaining_quantity);quantity.setAttribute("aria-label","Antal for "+line.name);controls.push({field,quantity});field.append(choices,quantity);form.append(field)}if(controls.length){const prepare=document.createElement("button");prepare.type="submit";prepare.textContent="Forbered valgte varer";form.onsubmit=event=>{event.preventDefault();const items=controls.flatMap(({field,quantity})=>{const selected=field.querySelector('input[type="radio"]:checked');return selected?[{product:Number(selected.value),quantity:Number(quantity.value)}]:[]});if(items.length)prepareBatch(items,prepare)};form.append(prepare)}else{const done=document.createElement("div");done.className="empty";done.textContent="Alle varer blev afgjort automatisk.";form.append(done)}root.replaceChildren(form)};
app.ontoolresult=result=>{const value=read(result);if(value?.lines)renderPlan(value);else render(parse(result))};await app.connect();
</script></body></html>`;
