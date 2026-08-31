#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import type { Basket, Product } from "./client.js";
import { FAVORITES_SEARCH_POOL, matchFavorites, NemligError } from "./client.js";
import { ensureLoggedIn, getClient, NEMLIG_VERSION, type ShoppingClient } from "./cli.js";
import { getCredentials, type Credentials } from "./config.js";
import {
  createFeatureRequest,
  type FeatureRequest,
  type FeatureRequestResult,
} from "./feature-request.js";
import { BasketProposalService, type ProposalOperation } from "./proposals.js";
import { loadShoppingPlan, resolveShoppingPlan, saveShoppingPlan, shoppingPlanInputSchema } from "./plans.js";

export const PICKER_URI = "ui://nemlig/picker.html";
export const PICKER_MIME_TYPE = "text/html;profile=mcp-app";

const falseValues = new Set(["0", "false", "no", "off"]);

export const appsEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  !falseValues.has((env.NEMLIG_MCP_APPS ?? "1").trim().toLowerCase());

export interface Candidate {
  id: number | undefined;
  name: string | undefined;
  price: number | undefined;
  unit_price: number | undefined;
  unit_size: string | undefined;
  brand: string | undefined;
  available: boolean;
  is_organic: boolean;
  is_frozen: boolean;
  is_on_discount: boolean;
  image_url: string | undefined;
  tags: string[];
  source?: "favorite" | "catalog";
  dietary?: { organic: boolean; vegan: boolean; gluten_free: boolean; lactose_free: boolean };
  constraint_outcomes?: Record<string, boolean>;
  basket_quantity?: number;
  remaining_quantity?: number;
}

const candidateSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().optional(),
  price: z.number().optional(),
  unit_price: z.number().optional(),
  unit_size: z.string().optional(),
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

export function rankProducts(products: Product[], query: string): Candidate[] {
  const candidates = products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    unit_price: product.unitPrice,
    unit_size: product.unitSize || undefined,
    brand: product.brand || undefined,
    available: product.available,
    is_organic: product.isOrganic,
    is_frozen: product.isFrozen,
    is_on_discount: product.isOnDiscount,
    image_url: product.imageUrl || undefined,
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

const basketPayload = (basket: Basket): Record<string, unknown> => ({
  items: basket.items,
  products_price: basket.productsPrice,
  delivery_price: basket.deliveryPrice,
  number_of_products: basket.numberOfProducts,
  delivery_time: basket.deliveryTime,
});

const success = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
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

export function createMcpServer(
  client: ShoppingClient = getClient(),
  loadCredentials: () => Promise<Credentials | undefined> = getCredentials,
  env: NodeJS.ProcessEnv = process.env,
  proposals: BasketProposalService = new BasketProposalService(client),
  requestFeature: (request: FeatureRequest) => Promise<FeatureRequestResult> = createFeatureRequest,
): McpServer {
  const server = new McpServer(
    { name: "nemlig-assistant", version: NEMLIG_VERSION },
    {
      instructions:
        "Search, favorites, departments, planning, plan snapshots, basket view, and prepare tools do not change the Nemlig basket. Preparation is not approval. Planning, selection, saving, and loading are not approval either. Show the exact proposal and invoke its matching apply tool only after the user explicitly approves that unchanged proposal. Every apply revalidates and reads back the basket. Create a feature request only when the user explicitly asks to request a feature. Never check out, pay, place an order, or change a delivery slot.",
    },
  );
  const localConnectionId = randomUUID();
  const connectionId = (sessionId: string | undefined): string => sessionId ?? localConnectionId;
  const search = async (query: string, limit: number) =>
    rankProducts(await client.searchProducts(query, limit), query);

  server.registerTool(
    "search_products",
    {
      title: "Search Nemlig products",
      description: "Search Nemlig products using Danish terms and return ranked candidates.",
      inputSchema: { query: z.string().min(1), limit: z.number().int().positive().default(8) },
      outputSchema: z.object({ result: z.array(candidateSchema) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ query, limit }) => {
      try {
        return success(await search(query, limit));
      } catch (error) {
        return failure("search_products", error);
      }
    },
  );

  server.registerTool(
    "list_favorites",
    {
      title: "List or search Nemlig favorites",
      description:
        "List or search current authenticated Nemlig favorites without changing favorites or the basket.",
      inputSchema: {
        query: z.string().trim().min(1).optional(),
        limit: z.number().int().positive().max(50).default(8),
        page: z.number().int().positive().default(1),
      },
      outputSchema: z.object({ result: z.array(candidateSchema) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ query, limit, page }) => {
      try {
        await ensureLoggedIn(client, loadCredentials);
        const favorites = await client.listFavorites(
          query === undefined ? limit : FAVORITES_SEARCH_POOL,
          query === undefined ? page : 1,
        );
        const products = query === undefined ? favorites : matchFavorites(favorites, query, page * limit).slice((page - 1) * limit);
        return success(rankProducts(products, query ?? ""));
      } catch (error) {
        return failure("list_favorites", error);
      }
    },
  );

  server.registerTool(
    "plan_shopping_list",
    {
      title: "Plan a grocery list",
      description: "Resolve 1-20 structured grocery lines favorites-first without changing the basket. Ambiguous lines stay unresolved.",
      inputSchema: shoppingPlanInputSchema.shape,
      outputSchema: z.object({ lines: z.array(z.any()), selected_estimated_total: z.number() }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      ...(appsEnabled(env) ? { _meta: { ui: { resourceUri: PICKER_URI } } } : {}),
    },
    async (input) => {
      try { await ensureLoggedIn(client, loadCredentials); return success(await resolveShoppingPlan(client, input)); }
      catch (error) { return failure("plan_shopping_list", error); }
    },
  );

  server.registerTool(
    "list_departments",
    {
      title: "List Nemlig departments", description: "Discover current department IDs without changing account data.",
      outputSchema: z.object({ departments: z.array(z.object({ id: z.string(), name: z.string() })) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async () => { try { return success({ departments: await client.listDepartments() }); } catch (error) { return failure("list_departments", error); } },
  );

  server.registerTool(
    "browse_department",
    {
      title: "Browse a Nemlig department", description: "Browse a freshly validated department page.",
      inputSchema: { department_id: z.string().min(1), limit: z.number().int().positive().max(50).default(20), page: z.number().int().positive().default(1) },
      outputSchema: z.object({ result: z.array(candidateSchema), page: z.number().int().positive(), has_next: z.boolean() }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ department_id, limit, page }) => { try { const result = await client.browseDepartment(department_id, limit, page); return success({ result: rankProducts(result.products, ""), page: result.page, has_next: result.hasNext }); } catch (error) { return failure("browse_department", error); } },
  );

  server.registerTool(
    "save_shopping_plan",
    {
      title: "Save a shopping plan", description: "Create an immutable owner-only local snapshot. This never changes the basket.",
      inputSchema: shoppingPlanInputSchema.shape,
      outputSchema: z.object({ id: z.string().uuid(), created_at: z.string().datetime() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input) => { try { return success(await saveShoppingPlan(input)); } catch (error) { return failure("save_shopping_plan", error); } },
  );

  server.registerTool(
    "load_shopping_plan",
    {
      title: "Load a shopping plan", description: "Load an immutable local snapshot and re-resolve it against current products and basket state.",
      inputSchema: { id: z.string().uuid() }, outputSchema: z.object({ lines: z.array(z.any()), selected_estimated_total: z.number() }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ id }) => { try { await ensureLoggedIn(client, loadCredentials); return success(await resolveShoppingPlan(client, await loadShoppingPlan(id))); } catch (error) { return failure("load_shopping_plan", error); } },
  );

  server.registerTool(
    "create_feature_request",
    {
      title: "Create a feature request",
      description:
        "Create a concise GitHub issue when the user explicitly requests a Nemlig Assistant feature. Supply a short title, summary, and simple acceptance criteria. Never include credentials or private account data.",
      inputSchema: {
        title: z.string().trim().min(3).max(120),
        summary: z.string().trim().min(1).max(2_000),
        acceptance_criteria: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
        context: z.string().trim().min(1).max(1_000).optional(),
      },
      outputSchema: featureRequestResultSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (request) => {
      try {
        return success({ ...await requestFeature(request) });
      } catch (error) {
        return failure("create_feature_request", error);
      }
    },
  );

  server.registerTool(
    "view_cart",
    {
      title: "View Nemlig basket",
      description: "View the current Nemlig basket and totals.",
      outputSchema: basketSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async () => {
      try {
        await ensureLoggedIn(client, loadCredentials);
        return success(basketPayload(await client.getCart()));
      } catch (error) {
        return failure("view_cart", error);
      }
    },
  );

  server.registerTool(
    "prepare_cart_additions",
    {
      title: "Prepare basket additions",
      description: "Prepare exact basket additions for review without changing the basket.",
      inputSchema: {
        items: z
          .array(
            z.object({
              product_id: z.number().int().positive(),
              quantity: z.number().int().positive(),
            }),
          )
          .min(1)
          .max(20),
      },
      outputSchema: additionsProposalSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ items }, extra) => {
      try {
        await ensureLoggedIn(client, loadCredentials);
        return success(await proposals.prepareAdditions(connectionId(extra.sessionId), items));
      } catch (error) {
        return failure("prepare_cart_additions", error);
      }
    },
  );

  const registerApply = (
    name: "apply_cart_additions" | "apply_cart_removal" | "apply_cart_replacement" | "apply_cart_clear",
    operation: ProposalOperation,
    destructiveHint: boolean,
  ): void => {
    server.registerTool(
      name,
      {
        title: `Apply basket ${operation}`,
        description: `Apply one unchanged, unexpired ${operation} proposal after explicit approval.`,
        inputSchema: { proposal_id: z.string().uuid() },
        outputSchema: applyResultSchema,
        annotations: { readOnlyHint: false, destructiveHint, openWorldHint: true },
      },
      async ({ proposal_id }, extra) => {
        try {
          await ensureLoggedIn(client, loadCredentials);
          return success(await proposals.apply(connectionId(extra.sessionId), proposal_id, operation));
        } catch (error) {
          return failure(name, error);
        }
      },
    );
  };

  registerApply("apply_cart_additions", "additions", false);

  server.registerTool(
    "prepare_cart_removal",
    {
      title: "Prepare one-line removal",
      description: "Prepare removal of one exact basket product line without changing the basket.",
      inputSchema: { product_id: z.number().int().positive() },
      outputSchema: removalProposalSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ product_id }, extra) => {
      try {
        await ensureLoggedIn(client, loadCredentials);
        return success(await proposals.prepareRemoval(connectionId(extra.sessionId), product_id));
      } catch (error) {
        return failure("prepare_cart_removal", error);
      }
    },
  );

  registerApply("apply_cart_removal", "removal", true);

  server.registerTool(
    "prepare_cart_replacement",
    {
      title: "Prepare one-line replacement",
      description:
        "Prepare replacement of one exact basket line with a distinct exact product. Reports factual basket-price change without claiming product equivalence or changing the basket.",
      inputSchema: {
        current_product_id: z.number().int().positive(),
        replacement_product_id: z.number().int().positive(),
        replacement_quantity: z.number().int().positive(),
      },
      outputSchema: replacementProposalSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ current_product_id, replacement_product_id, replacement_quantity }, extra) => {
      try {
        await ensureLoggedIn(client, loadCredentials);
        return success(await proposals.prepareReplacement(
          connectionId(extra.sessionId),
          current_product_id,
          replacement_product_id,
          replacement_quantity,
        ));
      } catch (error) {
        return failure("prepare_cart_replacement", error);
      }
    },
  );

  registerApply("apply_cart_replacement", "replacement", true);

  server.registerTool(
    "prepare_cart_clear",
    {
      title: "Prepare basket clear",
      description: "Prepare the exact current basket for destructive clearing without changing it.",
      outputSchema: clearProposalSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (extra) => {
      try {
        await ensureLoggedIn(client, loadCredentials);
        return success(await proposals.prepareClear(connectionId(extra.sessionId)));
      } catch (error) {
        return failure("prepare_cart_clear", error);
      }
    },
  );

  registerApply("apply_cart_clear", "clear", true);

  if (appsEnabled(env)) {
    server.registerTool(
      "pick_products",
      {
        title: "Open Nemlig product picker",
        description: "Show an interactive product picker; text-only clients receive the same candidates.",
        inputSchema: { query: z.string().min(1), limit: z.number().int().positive().default(8) },
        outputSchema: z.object({ result: z.array(candidateSchema) }),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
        _meta: { ui: { resourceUri: PICKER_URI } },
      },
      async ({ query, limit }) => {
        try {
          return success(await search(query, limit));
        } catch (error) {
          return failure("pick_products", error);
        }
      },
    );
    server.registerResource(
      "Nemlig product picker",
      PICKER_URI,
      {
        mimeType: PICKER_MIME_TYPE,
        _meta: { ui: { csp: { resourceDomains: ["https://unpkg.com"] } } },
      },
      async () => ({
        contents: [
          {
            uri: PICKER_URI,
            mimeType: PICKER_MIME_TYPE,
            text: PICKER_HTML,
            _meta: { ui: { csp: { resourceDomains: ["https://unpkg.com"] } } },
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

export const PICKER_HTML = `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:12px;color:#1a1a1a}.grid{display:grid;gap:10px}.card{border:1px solid #ddd;border-radius:10px;padding:12px;display:flex;justify-content:space-between;gap:12px}.name{font-weight:650}.meta{color:#555;font-size:13px}.badges{display:flex;gap:4px;margin-top:6px}.badge{font-size:11px;padding:2px 7px;border-radius:999px;background:#eef}.price{font-weight:700}button{padding:8px 14px;border:0;border-radius:8px;background:#087d33;color:white;font-weight:650}button:disabled{background:#9bbfa6}.empty{color:#666;padding:16px}
</style>
</head>
<body><main id="root" aria-live="polite"><div class="empty">Henter varer…</div></main>
<script type="module">
import { App } from "https://unpkg.com/@modelcontextprotocol/ext-apps@0.4.0/app-with-deps";
const root=document.getElementById("root");const app=new App({name:"Nemlig Picker",version:"1.0.0"});
const kr=v=>typeof v==="number"?v.toFixed(2).replace(".",",")+" kr.":"";
const read=content=>{const text=(content||[]).find(item=>item.type==="text");if(!text)return null;try{return JSON.parse(text.text)}catch{return null}};
const parse=content=>{const value=read(content);return Array.isArray(value)?value:value?.result||[]};
const render=products=>{if(!products.length){root.innerHTML='<div class="empty">Ingen varer fundet.</div>';return}const grid=document.createElement("div");grid.className="grid";for(const product of products){const card=document.createElement("article");card.className="card";const info=document.createElement("div");const name=document.createElement("div");name.className="name";name.textContent=product.name??"Ukendt vare";const meta=document.createElement("div");meta.className="meta";meta.textContent=[product.id!=null?"ID: "+product.id:"",product.brand,product.unit_size].filter(Boolean).join(" · ");const badges=document.createElement("div");badges.className="badges";for(const tag of product.tags||[]){const badge=document.createElement("span");badge.className="badge";badge.textContent=tag;badges.append(badge)}info.append(name,meta,badges);const actions=document.createElement("div");const price=document.createElement("div");price.className="price";price.textContent=kr(product.price);const prepare=document.createElement("button");prepare.textContent="Forbered";prepare.disabled=!product.available||product.id==null;prepare.onclick=async()=>prepareBatch([{product_id:product.id,quantity:1}],prepare);actions.append(price,prepare);card.append(info,actions);grid.append(card)}root.replaceChildren(grid)};
const prepareBatch=async(items,button)=>{button.disabled=true;button.textContent="Forbereder…";try{const response=await app.callServerTool({name:"prepare_cart_additions",arguments:{items}});const proposal=read(response.content);if(!proposal?.applicable||!proposal.review?.lines?.length)throw new Error("invalid proposal");const review=document.createElement("section");review.setAttribute("aria-label","Præcis kurvegennemgang");const lines=document.createElement("div");lines.className="meta";lines.textContent=proposal.review.lines.map(line=>[line.quantity+" × "+line.name,"ID "+line.product_id,kr(line.line_total)].join(" · ")).join(" | ")+" · Forventet kurvtotal: "+kr(proposal.review.expected_products_price)+" · Udløber: "+proposal.expires_at;const apply=document.createElement("button");apply.textContent="Godkend og tilføj";apply.onclick=async()=>{apply.disabled=true;apply.textContent="Afventer værtsgodkendelse…";try{const response=await app.callServerTool({name:"apply_cart_additions",arguments:{proposal_id:proposal.proposal_id}});const applied=read(response.content);if(applied?.status!=="completed"||!applied.basket)throw new Error("unverified result");apply.textContent="Tilføjet ✓";const verified=document.createElement("div");verified.className="meta";verified.textContent="Verificeret kurv: "+(applied.basket.items||[]).map(item=>(item.quantity??0)+" × "+(item.name??"Ukendt")+" ("+kr(item.total)+")").join(" · ");review.append(verified)}catch{apply.textContent="Afvist";apply.disabled=false}};review.append(lines,apply);root.replaceChildren(review)}catch{button.textContent="Fejl";button.disabled=false}};
const renderPlan=plan=>{const form=document.createElement("form");form.className="grid";const controls=[];for(const line of plan.lines){const field=document.createElement("fieldset");const legend=document.createElement("legend");legend.textContent=line.name+" · ønsket "+line.quantity;field.append(legend);if(line.resolution==="covered"){const covered=document.createElement("div");covered.textContent="Allerede dækket i kurven";field.append(covered);form.append(field);continue}const label=document.createElement("label");label.textContent="Vare ";const select=document.createElement("select");select.name=line.id;const empty=document.createElement("option");empty.value="";empty.textContent=line.candidates.length?"Vælg en vare":"Ingen egnet vare";select.append(empty);for(const candidate of line.candidates){const option=document.createElement("option");option.value=String(candidate.id);option.textContent=candidate.name+" · "+kr(candidate.price)+(candidate.source==="favorite"?" · favorit":"");option.selected=candidate.id===line.selected_product_id;select.append(option)}label.append(select);const quantity=document.createElement("input");quantity.type="number";quantity.min="1";quantity.max="99";quantity.value=String(line.remaining_quantity);quantity.setAttribute("aria-label","Antal for "+line.name);controls.push({select,quantity});field.append(label,quantity);form.append(field)}const prepare=document.createElement("button");prepare.type="submit";prepare.textContent="Forbered valgte varer";form.onsubmit=event=>{event.preventDefault();const items=controls.flatMap(({select,quantity})=>select.value?[{product_id:Number(select.value),quantity:Number(quantity.value)}]:[]);if(items.length)prepareBatch(items,prepare)};form.append(prepare);root.replaceChildren(form)};
app.ontoolresult=({content})=>{const value=read(content);if(value?.lines)renderPlan(value);else render(parse(content))};await app.connect();
</script></body></html>`;
