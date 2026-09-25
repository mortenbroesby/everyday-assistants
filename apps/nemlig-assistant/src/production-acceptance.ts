import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { serviceAcceptanceResourceInventory, serviceAcceptanceToolInventory } from "./mcp.js";
import { PRODUCT_VIEWER_MIME_TYPE, PRODUCT_VIEWER_RESOURCE_METADATA, PRODUCT_VIEWER_RESOURCE_URI, renderProductViewerHtml } from "./product-viewer.js";
import { RETIRED_PRODUCT_VIEWER_RESOURCE_URIS } from "./product-viewer-identity.js";

interface ToolResult {
  isError?: boolean;
  structuredContent?: unknown;
}

export const productionToolInventory = {
  readOnly: [
    "find_groceries", "get_profile", "show_my_favorites", "show_grocery_sections",
    "browse_grocery_section", "check_nemlig_connection", "reconnect_nemlig_assistant", "show_my_basket", "get_grocery_details",
  ],
  prepareOnly: [
    "review_items_to_add", "review_item_to_remove", "review_item_swap", "review_emptying_basket",
  ],
  localState: ["start_product_review", "update_product_review"],
  externalState: [
    "submit_product_review",
    "add_approved_items",
    "remove_approved_item", "make_approved_item_swap", "empty_approved_basket",
  ],
} as const;

export const productionResourceInventory = [PRODUCT_VIEWER_RESOURCE_URI, ...RETIRED_PRODUCT_VIEWER_RESOURCE_URIS] as const;
export const prohibitedProductionTools = ["checkout", "place_order", "pay", "change_delivery_slot"] as const;

type ToolName = typeof productionToolInventory[keyof typeof productionToolInventory][number];

export interface AcceptanceClient {
  listTools(): Promise<{ tools: Array<{ name: string; _meta?: unknown }> }>;
  callTool(request: {
    name: string;
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

const isServiceForbiddenResponse = (error: unknown): boolean =>
  !!error && typeof error === "object"
  && (("status" in error && (error as { status?: unknown }).status === 403)
    || ("code" in error && (error as { code?: unknown }).code === 403));

const listResourcesOrEmpty = async (
  client: AcceptanceClient,
  withinTotalDeadline: <T>(label: string, work: () => Promise<T>) => Promise<T>,
  label: string,
): Promise<Array<{ uri: string }>> => {
  assert.ok(client.listResources, `${label} resource inventory client is required`);
  try {
    return (await withinTotalDeadline("resource inventory", () => client.listResources!())).resources;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === -32601) return [];
    throw error;
  }
};

const expectedTools = Object.values(productionToolInventory).flat();

export function assertProductionInventory(
  tools: Array<{ name: string; _meta?: unknown }>,
  resources: Array<{ uri: string }>,
): void {
  assert.deepEqual(tools.map(({ name }) => name).sort(), [...expectedTools].sort(), "Production MCP tool inventory drifted");
  assert.deepEqual(resources.map(({ uri }) => uri).sort(), [...productionResourceInventory].sort(), "Production MCP resource inventory drifted");
  for (const name of prohibitedProductionTools) assert.equal(tools.some((tool) => tool.name === name), false, `Prohibited production capability advertised: ${name}`);
  const metadata = new Map(tools.map(({ name, _meta }) => [name, _meta]));
  for (const name of ["start_product_review", "update_product_review", "submit_product_review"] as const) {
    const actual = metadata.get(name);
    assert.ok(actual && typeof actual === "object", `Production ${name} metadata drifted`);
    const value = actual as Record<string, unknown>;
    const expectedUi = name === "submit_product_review"
      ? { resourceUri: PRODUCT_VIEWER_RESOURCE_URI, visibility: ["model"] }
      : PRODUCT_VIEWER_RESOURCE_METADATA.ui;
    assert.deepEqual(value.ui, expectedUi, `Production ${name} UI metadata drifted`);
    assert.equal(value["openai/outputTemplate"], PRODUCT_VIEWER_RESOURCE_URI, `Production ${name} output template metadata drifted`);
    if (name === "submit_product_review") {
      assert.equal(value["openai/widgetAccessible"], undefined, `Production ${name} widget accessibility metadata drifted`);
    } else {
      assert.equal(value["openai/widgetAccessible"], true, `Production ${name} widget accessibility metadata drifted`);
    }
  }
}

/** Bounded evidence: never classify or report an assertion's complete HTML diff. */
export class ProductViewerHtmlMismatchError extends Error {
  readonly code = "product_viewer_html_mismatch";
  readonly lastCompletedBoundary = "product_viewer_resource_read";
  constructor() {
    super("Product-viewer resource HTML drifted from the released renderer");
  }
}

const assertProductViewerResource = (viewer: { contents: unknown[] }, label: string): void => {
  assert.equal(viewer.contents.length, 1, `${label} product-viewer resource returned an unexpected content count`);
  const viewerContent = viewer.contents[0];
  assert.ok(viewerContent && typeof viewerContent === "object", `${label} product-viewer resource returned no content object`);
  const viewerRecord = viewerContent as { uri?: unknown; mimeType?: unknown; text?: unknown; _meta?: unknown };
  assert.equal(viewerRecord.uri, PRODUCT_VIEWER_RESOURCE_URI, `${label} product-viewer URI did not match the inventory`);
  assert.equal(viewerRecord.mimeType, PRODUCT_VIEWER_MIME_TYPE, `${label} product-viewer MIME type drifted`);
  if (viewerRecord.text !== renderProductViewerHtml()) throw new ProductViewerHtmlMismatchError();
  assert.match(viewerRecord.text as string, /<html[\s\S]*<\/html>/u, `${label} product-viewer resource was not fetchable HTML`);
  assert.ok(viewerRecord._meta && typeof viewerRecord._meta === "object", `${label} product-viewer resource metadata is missing`);
  const ui = (viewerRecord._meta as Record<string, unknown>).ui;
  assert.ok(ui && typeof ui === "object", `${label} product-viewer UI metadata is missing`);
  const metadata = ui as Record<string, unknown>;
  assert.deepEqual(metadata.csp, { connectDomains: [], resourceDomains: ["https://nemlig.com", "https://www.nemlig.com"] }, `${label} product-viewer CSP metadata drifted`);
  assert.equal(metadata.prefersBorder, true, `${label} product-viewer border metadata drifted`);
};

export interface ProductionFeatureReport {
  exercised: string[];
  unavailable: string[];
}

export interface ServiceAcceptanceFeatureReport {
  exercised: string[];
  denied: string[];
  requestCount: number;
}

export interface AcceptanceDeadlineOptions {
  totalTimeoutMs?: number;
  signal?: AbortSignal;
}

const abortError = (signal: AbortSignal): Error => signal.reason instanceof Error
  ? signal.reason
  : new Error("Production acceptance deadline exceeded");

const bounded = async <T>(label: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return await work();
  if (signal.aborted) throw abortError(signal);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const result = await Promise.race([work(), aborted]);
    if (signal.aborted) throw abortError(signal);
    return result;
  } catch (error) {
    if (signal.aborted) throw new Error(`Production acceptance deadline exceeded during ${label}`, { cause: error });
    throw error;
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
};

const createTotalDeadline = (
  deadline: number,
  context: string,
  signal?: AbortSignal,
): (<T>(label: string, work: () => Promise<T>) => Promise<T>) => async <T>(label: string, work: () => Promise<T>): Promise<T> => {
  const remaining = deadline - Date.now();
  assert.ok(remaining > 0, `${context} timed out before ${label}`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      bounded(label, work, signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${context} timed out during ${label}`)), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export async function verifyAggregateTierUsage(
  origin: URL,
  token: string,
  fetcher: typeof fetch = fetch,
  options: Pick<AcceptanceDeadlineOptions, "signal"> = {},
): Promise<void> {
  const response = await fetcher(new URL("/admin/usage", origin), {
    headers: { authorization: `Bearer ${token}` },
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(3_000)]) : AbortSignal.timeout(3_000),
  });
  assert.equal(response.status, 200, "Tier usage acceptance failed");
  const usage = await response.json() as Record<string, unknown>;
  assert.equal(usage.schema_version, 1, "Tier usage schema is invalid");
  const tiers = usage.tiers as Record<string, unknown> | undefined;
  assert.deepEqual(Object.keys(tiers ?? {}).sort(), ["0", "1", "2"]);
  const text = JSON.stringify(usage);
  assert.doesNotMatch(text, /principals|principal_key|subject|username|password|credential/iu);
  assert.doesNotMatch(text, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
}

export async function verifyReadOnlyProductionFeatures(
  client: AcceptanceClient,
  options: AcceptanceDeadlineOptions = {},
): Promise<ProductionFeatureReport> {
  const withinTotalDeadline = createTotalDeadline(
    Date.now() + (options.totalTimeoutMs ?? 90_000),
    "Production read-only acceptance",
    options.signal,
  );
  assertProductionInventory(
    (await withinTotalDeadline("tool inventory", () => client.listTools())).tools,
    await listResourcesOrEmpty(client, withinTotalDeadline, "Production"),
  );
  assert.ok(client.readResource, "Production product-viewer resource reader is required");
  const viewer = await withinTotalDeadline("product viewer resource", () => client.readResource!({ uri: PRODUCT_VIEWER_RESOURCE_URI }));
  assertProductViewerResource(viewer, "Production");
  const exercised: string[] = [];
  const unavailable: string[] = [];
  exercised.push("read product viewer resource");
  const call = async <T>(name: ToolName, args: Record<string, unknown> = {}): Promise<T> => {
    assert.ok((productionToolInventory.readOnly as readonly string[]).includes(name), `Read-only acceptance prohibited ${name}`);
    const result = await withinTotalDeadline(name, () => client.callTool({ name, arguments: args }));
    exercised.push(name);
    return content<T>(result, name);
  };

  const searched = await call<{ result?: Array<{ id?: number }> }>("find_groceries", { search_term: "banan", result_count: 3 });
  const productIds = (searched.result ?? []).flatMap(({ id }) => typeof id === "number" && Number.isInteger(id) && id > 0 ? [id] : []);
  assert.ok(productIds.length, "Production product search returned no usable product");
  await call("get_grocery_details", { product_id: productIds[0] });
  const favorites = await call<{ result?: unknown[] }>("show_my_favorites", { search_term: "banan", result_count: 1, page: 1 });
  assert.ok(Array.isArray(favorites.result) && favorites.result.length <= 1, "Favorites acceptance exceeded one result");
  const departments = await call<{ departments?: Array<{ id?: string }> }>("show_grocery_sections");
  const departmentId = departments.departments?.find(({ id }) => id)?.id;
  if (departmentId) await call("browse_grocery_section", { section: departmentId, result_count: 3, page: 1 });
  else unavailable.push("browse_grocery_section:no_section");

  const current = await call<Basket>("show_my_basket");
  assert.ok(Array.isArray(current.items), "show_my_basket returned no basket items");
  return { exercised, unavailable };
}

/** Verify the deliberately closed, machine-authenticated MCP fixture surface. */
export async function verifyServiceAcceptanceFeatures(
  client: AcceptanceClient,
  options: AcceptanceDeadlineOptions = {},
): Promise<ServiceAcceptanceFeatureReport> {
  const withinTotalDeadline = createTotalDeadline(
    Date.now() + (options.totalTimeoutMs ?? 90_000),
    "Service acceptance",
    options.signal,
  );
  const tools = (await withinTotalDeadline("tool inventory", () => client.listTools())).tools;
  const resources = await listResourcesOrEmpty(client, withinTotalDeadline, "Service");
  const names = tools.map(({ name }) => name).sort();
  assert.deepEqual(names, [...serviceAcceptanceToolInventory].sort(), "Service MCP tool inventory drifted");
  assert.deepEqual(resources.map(({ uri }) => uri).sort(), [...serviceAcceptanceResourceInventory].sort(), "Service MCP resource inventory drifted");

  assert.ok(client.readResource, "Service product-viewer resource reader is required");
  const viewer = await withinTotalDeadline("product viewer resource", () => client.readResource!({ uri: PRODUCT_VIEWER_RESOURCE_URI }));
  assertProductViewerResource(viewer, "Service");

  const exercised: string[] = [];
  let requestCount = 3;
  exercised.push("read product viewer resource");
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<ToolResult> => {
    requestCount += 1;
    const result = await withinTotalDeadline(name, () => client.callTool({ name, arguments: args }));
    exercised.push(name);
    return result;
  };
  const searched = content<{ result?: Array<{ id?: number }> }>(await call("find_groceries", { search_term: "banan", result_count: 1 }), "find_groceries");
  const productId = searched.result?.find(({ id }) => typeof id === "number")?.id;
  assert.ok(productId, "Service product search returned no usable product");
  content(await call("get_grocery_details", { product_id: productId }), "get_grocery_details");
  content(await call("show_my_favorites", { search_term: "banan", result_count: 1, page: 1 }), "show_my_favorites");
  const sections = content<{ departments?: Array<{ id?: string }> }>(await call("show_grocery_sections"), "show_grocery_sections");
  const section = sections.departments?.find(({ id }) => id)?.id;
  assert.ok(section, "Service grocery sections returned no usable section");
  content(await call("browse_grocery_section", { section, result_count: 1, page: 1 }), "browse_grocery_section");
  basket(await call("show_my_basket"), "show_my_basket");
  const denied: string[] = [];
  for (const name of ["review_items_to_add", "add_approved_items"]) {
    try {
      requestCount += 1;
      const result = await withinTotalDeadline(name, () => client.callTool({ name, arguments: {} }));
      exercised.push(name);
      assert.equal(result.isError, true, `Service acceptance allowed forbidden ${name}`);
    } catch (error) {
      assert.ok(isServiceForbiddenResponse(error), `Service acceptance failed ${name} without a precise HTTP 403 denial`);
    }
    denied.push(name);
  }
  assert.ok(requestCount <= 11, "Service MCP acceptance exceeded its request budget");
  return { exercised, denied, requestCount };
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
  options: { stepTimeoutMs?: number; expectedRevision?: string; expectedScopes?: string[]; signal?: AbortSignal } = {},
): Promise<{ revision: string; lastCompletedBoundary: string; steps: Array<{ boundary: string; latencyMs: number }>; correlationIds: string[] }> {
  const stepTimeoutMs = options.stepTimeoutMs ?? 3_000;
  const steps: Array<{ boundary: string; latencyMs: number }> = [];
  const correlationIds: string[] = [];
  let lastCompletedBoundary = "none";
  const step = async (boundary: string, input: URL, init?: RequestInit): Promise<Response> => {
    const started = Date.now();
    try {
      const timeout = AbortSignal.timeout(stepTimeoutMs);
      const response = await fetcher(input, { ...init, signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout });
      const correlationId = response.headers.get("x-nemlig-request-id");
      if (correlationId && /^[A-Za-z0-9_-]{1,128}$/u.test(correlationId)) correlationIds.push(correlationId);
      steps.push({ boundary, latencyMs: Date.now() - started });
      lastCompletedBoundary = boundary;
      return response;
    } catch (error) {
      throw new Error(`Production edge probe stopped after ${lastCompletedBoundary}; ${boundary} failed or timed out.`, { cause: error });
    }
  };
  const health = await step("health", new URL("/healthz", origin));
  assert.equal(health.status, 200, "Production health check failed");
  assert.deepEqual(await health.json(), { status: "ok", enabled: true });

  const revisionResponse = await step("revision", new URL("/revision", origin));
  assert.equal(revisionResponse.status, 200, "Production revision check failed");
  const revisionBody = await revisionResponse.json() as { revision?: unknown };
  assert.equal(typeof revisionBody.revision, "string", "Production revision metadata is missing");
  const revision = revisionBody.revision as string;
  if (options.expectedRevision) assert.equal(revision, options.expectedRevision, "Production revision metadata does not match the expected deployment");

  const metadata = await step("oauth_metadata", new URL("/.well-known/oauth-protected-resource/mcp", origin));
  assert.equal(metadata.status, 200, "OAuth resource metadata failed");
  const resource = await metadata.json() as Record<string, unknown>;
  assert.equal(resource.resource, new URL("/mcp", origin).href);
  assert.deepEqual(resource.scopes_supported, options.expectedScopes ?? ["use:nemlig-assistant"], "OAuth scopes do not match production configuration");
  assert.deepEqual(resource.bearer_methods_supported, ["header"]);

  const anonymous = await step("anonymous_rejection", new URL("/mcp", origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  assert.equal(anonymous.status, 401, "Anonymous MCP request was not rejected");

  const foreignOrigin = await step("foreign_origin_rejection", new URL("/mcp", origin), {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://example.invalid" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  assert.equal(foreignOrigin.status, 403, "Foreign Origin was not rejected");
  return { revision, lastCompletedBoundary, steps, correlationIds };
}
