import assert from "node:assert/strict";
import { createHash } from "node:crypto";

interface ToolResult {
  isError?: boolean;
  structuredContent?: unknown;
}

export const productionToolInventory = {
  readOnly: [
    "find_groceries", "show_my_favorites", "plan_my_shopping", "show_grocery_sections",
    "browse_grocery_section", "continue_my_shopping_plan", "show_my_basket", "choose_products_visually",
  ],
  prepareOnly: [
    "review_items_to_add", "review_item_to_remove", "review_item_swap", "review_emptying_basket",
  ],
  externalState: [
    "save_my_shopping_plan", "suggest_an_improvement", "add_approved_items",
    "remove_approved_item", "make_approved_item_swap", "empty_approved_basket",
  ],
} as const;

export const productionResourceInventory = ["ui://nemlig/picker.html"] as const;
export const prohibitedProductionTools = ["checkout", "place_order", "pay", "change_delivery_slot"] as const;

type ToolName = typeof productionToolInventory[keyof typeof productionToolInventory][number];

export interface AcceptanceClient {
  listTools(): Promise<{ tools: Array<{ name: string }> }>;
  callTool(request: {
    name: ToolName;
    arguments: Record<string, unknown>;
  }): Promise<ToolResult>;
  listResources?(): Promise<{ resources: Array<{ uri: string }> }>;
  readResource?(request: { uri: string }): Promise<{ contents: unknown[] }>;
}

interface BasketItem {
  id?: number;
  name?: string;
  quantity?: number;
  total?: number;
}

interface Basket {
  items: BasketItem[];
  products_price?: number;
  delivery_price?: number;
  number_of_products?: number;
  delivery_time?: string;
}

const content = <T>(result: ToolResult, operation: string): T => {
  assert.equal(result.isError, undefined, `${operation} returned an MCP error`);
  assert.ok(result.structuredContent && typeof result.structuredContent === "object", `${operation} returned no structured content`);
  return result.structuredContent as T;
};

const basket = (result: ToolResult, operation: string): Basket => {
  const value = content<Basket>(result, operation);
  assert.ok(Array.isArray(value.items), `${operation} returned no basket items`);
  return value;
};

const expectedTools = Object.values(productionToolInventory).flat();

export function assertProductionInventory(
  tools: Array<{ name: string }>,
  resources: Array<{ uri: string }>,
): void {
  assert.deepEqual(tools.map(({ name }) => name).sort(), [...expectedTools].sort(), "Production MCP tool inventory drifted");
  assert.deepEqual(resources.map(({ uri }) => uri).sort(), [...productionResourceInventory].sort(), "Production MCP resource inventory drifted");
  for (const name of prohibitedProductionTools) assert.equal(tools.some((tool) => tool.name === name), false, `Prohibited production capability advertised: ${name}`);
}

export interface ProductionFeatureReport {
  exercised: string[];
  unavailable: string[];
}

export async function verifyReadOnlyProductionFeatures(client: AcceptanceClient): Promise<ProductionFeatureReport> {
  assert.ok(client.listResources && client.readResource, "Production resource client is required");
  assertProductionInventory((await client.listTools()).tools, (await client.listResources()).resources);
  const exercised: string[] = [];
  const unavailable: string[] = [];
  const call = async <T>(name: ToolName, args: Record<string, unknown> = {}): Promise<T> => {
    const result = await client.callTool({ name, arguments: args });
    exercised.push(name);
    return content<T>(result, name);
  };

  const searched = await call<{ result?: Array<{ id?: number }> }>("find_groceries", { search_term: "banan", result_count: 3 });
  const productIds = (searched.result ?? []).flatMap(({ id }) => typeof id === "number" && Number.isInteger(id) && id > 0 ? [id] : []);
  assert.ok(productIds.length, "Production product search returned no usable product");
  await call("show_my_favorites", { search_term: "banan", result_count: 3, page: 1 });
  await call("plan_my_shopping", { lines: [{ id: "acceptance-banan", name: "banan", quantity: 1, constraints: {}, preferences: [] }] });

  const departments = await call<{ departments?: Array<{ id?: string }> }>("show_grocery_sections");
  const departmentId = departments.departments?.find(({ id }) => id)?.id;
  if (departmentId) await call("browse_grocery_section", { section: departmentId, result_count: 3, page: 1 });
  else unavailable.push("browse_grocery_section:no_section");

  const current = await call<Basket>("show_my_basket");
  assert.ok(Array.isArray(current.items), "show_my_basket returned no basket items");
  await call("choose_products_visually", { search_term: "banan", result_count: 3 });
  const resource = await client.readResource({ uri: productionResourceInventory[0] });
  assert.ok(resource.contents.length, "Production picker resource is empty");
  exercised.push(productionResourceInventory[0]);

  const missingPlan = await client.callTool({
    name: "continue_my_shopping_plan",
    arguments: { saved_plan: "00000000-0000-4000-8000-000000000000" },
  });
  assert.equal(missingPlan.isError, true, "Missing production plan unexpectedly loaded");
  exercised.push("continue_my_shopping_plan");
  unavailable.push("continue_my_shopping_plan:no_safe_fixture");

  await call("review_items_to_add", { items: [{ product: productIds[0], quantity: 1 }] });
  const currentId = current.items.find(({ id }) => Number.isInteger(id))?.id;
  await call("review_item_to_remove", { basket_item: currentId ?? productIds[0] });
  const replacementId = productIds.find((id) => id !== currentId) ?? productIds[0] + 1;
  await call("review_item_swap", {
    current_item: currentId ?? productIds[0],
    replacement_item: replacementId,
    quantity: 1,
  });
  await call("review_emptying_basket");

  return { exercised, unavailable };
}

export type ProductionMutationOperation = "additions" | "removal" | "replacement" | "clear";

export interface ApprovedProductionMutation {
  operation: ProductionMutationOperation;
  prepareArguments: Record<string, unknown>;
  expectedReview: Record<string, unknown>;
}

const mutationTools: Record<ProductionMutationOperation, {
  prepare: ToolName;
  apply: ToolName;
}> = {
  additions: { prepare: "review_items_to_add", apply: "add_approved_items" },
  removal: { prepare: "review_item_to_remove", apply: "remove_approved_item" },
  replacement: { prepare: "review_item_swap", apply: "make_approved_item_swap" },
  clear: { prepare: "review_emptying_basket", apply: "empty_approved_basket" },
};

export const productionBasketFingerprint = (value: Basket): string => createHash("sha256").update(JSON.stringify({
  items: value.items.map((item) => ({
    id: item.id ?? null,
    name: item.name ?? null,
    quantity: item.quantity ?? null,
    total: item.total ?? null,
  })).sort((left, right) => String(left.id).localeCompare(String(right.id))),
  products_price: value.products_price ?? null,
  delivery_price: value.delivery_price ?? null,
  number_of_products: value.number_of_products ?? null,
  delivery_time: value.delivery_time ?? null,
})).digest("hex");

export async function verifyApprovedProductionMutation(
  client: AcceptanceClient,
  approved: ApprovedProductionMutation,
): Promise<{ initial: Basket; final: Basket }> {
  assert.ok(approved.expectedReview && typeof approved.expectedReview === "object", "Exact approved review is required");
  const names = mutationTools[approved.operation];
  assert.ok(names, "Approved mutation operation is invalid");
  const tools = new Set((await client.listTools()).tools.map(({ name }) => name));
  for (const name of ["show_my_basket", names.prepare, names.apply]) assert.ok(tools.has(name), `Production MCP is missing ${name}`);

  const initial = basket(await client.callTool({ name: "show_my_basket", arguments: {} }), "initial show_my_basket");
  const prepared = content<{
    applicable?: boolean;
    operation?: string;
    proposal_id?: string;
    review?: Record<string, unknown>;
  }>(await client.callTool({ name: names.prepare, arguments: approved.prepareArguments }), names.prepare);
  assert.equal(prepared.applicable, true, `Prepared ${approved.operation} is not applicable`);
  assert.equal(prepared.operation, approved.operation, "Prepared operation changed");
  assert.match(prepared.proposal_id ?? "", /^[0-9a-f-]{36}$/iu, "Prepared proposal ID is invalid");
  assert.deepEqual(prepared.review, approved.expectedReview, "Prepared proposal differs from the exact approval");

  const applied = content<{ status?: string; operation?: string; replayed?: boolean; basket?: Basket }>(
    await client.callTool({ name: names.apply, arguments: { approved_review: prepared.proposal_id } }),
    names.apply,
  );
  assert.equal(applied.status, "completed", `${approved.operation} was not completed`);
  assert.equal(applied.operation, approved.operation, "Applied operation changed");
  assert.equal(applied.replayed, false, "Acceptance proposal was unexpectedly replayed");
  assert.ok(applied.basket && Array.isArray(applied.basket.items), "Apply returned no basket readback");

  const final = basket(await client.callTool({ name: "show_my_basket", arguments: {} }), "final show_my_basket");
  assert.deepEqual(final, applied.basket, "Apply and fresh basket readbacks differ");
  return { initial, final };
}

export async function verifyApprovedReversibleProductionMutation(
  client: AcceptanceClient,
  change: ApprovedProductionMutation,
  restoration: ApprovedProductionMutation,
): Promise<Basket> {
  const changed = await verifyApprovedProductionMutation(client, change);
  try {
    const restored = await verifyApprovedProductionMutation(client, restoration);
    assert.equal(
      productionBasketFingerprint(restored.final),
      productionBasketFingerprint(changed.initial),
      "Restored basket differs from the exact initial basket",
    );
    return restored.final;
  } catch (error) {
    throw new Error(
      `Restoration stopped at basket fingerprint ${productionBasketFingerprint(changed.final)}: ${error instanceof Error ? error.message : "unknown failure"}`,
      { cause: error },
    );
  }
}

export async function verifyProductionEdge(
  origin: URL,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const health = await fetcher(new URL("/healthz", origin));
  assert.equal(health.status, 200, "Production health check failed");
  assert.deepEqual(await health.json(), { status: "ok", enabled: true });

  const metadata = await fetcher(new URL("/.well-known/oauth-protected-resource/mcp", origin));
  assert.equal(metadata.status, 200, "OAuth resource metadata failed");
  const resource = await metadata.json() as Record<string, unknown>;
  assert.equal(resource.resource, new URL("/mcp", origin).href);
  assert.deepEqual(resource.scopes_supported, ["use:nemlig-assistant"]);
  assert.deepEqual(resource.bearer_methods_supported, ["header"]);

  const anonymous = await fetcher(new URL("/mcp", origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  assert.equal(anonymous.status, 401, "Anonymous MCP request was not rejected");

  const foreignOrigin = await fetcher(new URL("/mcp", origin), {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://example.invalid" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  assert.equal(foreignOrigin.status, 403, "Foreign Origin was not rejected");
}
