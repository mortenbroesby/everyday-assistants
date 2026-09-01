import assert from "node:assert/strict";

export interface ApprovedAddition {
  productId: number;
  productName: string;
  unitSize: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface ToolResult {
  isError?: boolean;
  structuredContent?: unknown;
}

export interface AcceptanceClient {
  listTools(): Promise<{ tools: Array<{ name: string }> }>;
  callTool(request: {
    name: "view_cart" | "prepare_cart_additions" | "apply_cart_additions";
    arguments: Record<string, unknown>;
  }): Promise<ToolResult>;
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

const hasApprovedQuantity = (value: Basket, approved: ApprovedAddition): boolean =>
  value.items.some((item) => item.id === approved.productId && item.name === approved.productName && item.quantity === approved.quantity);

export async function verifyApprovedProductionAddition(
  client: AcceptanceClient,
  approved: ApprovedAddition,
): Promise<Basket> {
  assert.ok(Number.isInteger(approved.productId) && approved.productId > 0, "Approved product ID must be a positive integer");
  assert.ok(approved.productName.trim(), "Approved product name is required");
  assert.ok(approved.unitSize.trim(), "Approved unit size is required");
  assert.ok(Number.isInteger(approved.quantity) && approved.quantity > 0, "Approved quantity must be a positive integer");
  assert.ok(Number.isFinite(approved.unitPrice) && approved.unitPrice >= 0, "Approved unit price must be non-negative");
  assert.ok(Number.isFinite(approved.lineTotal) && approved.lineTotal >= 0, "Approved line total must be non-negative");

  const tools = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["view_cart", "prepare_cart_additions", "apply_cart_additions"]) {
    assert.ok(tools.has(name), `Production MCP is missing ${name}`);
  }

  await client.callTool({ name: "view_cart", arguments: {} }).then((result) => basket(result, "initial view_cart"));
  const prepared = content<{
    applicable?: boolean;
    operation?: string;
    proposal_id?: string;
    review?: { lines?: Array<{
      product_id?: number;
      name?: string;
      unit_size?: string;
      quantity?: number;
      unit_price?: number;
      line_total?: number;
    }> };
  }>(await client.callTool({
    name: "prepare_cart_additions",
    arguments: { items: [{ product_id: approved.productId, quantity: approved.quantity }] },
  }), "prepare_cart_additions");

  assert.equal(prepared.applicable, true, "Prepared addition is not applicable");
  assert.equal(prepared.operation, "additions", "Prepared operation changed");
  assert.match(prepared.proposal_id ?? "", /^[0-9a-f-]{36}$/iu, "Prepared proposal ID is invalid");
  assert.equal(prepared.review?.lines?.length, 1, "Prepared proposal must contain exactly one line");
  const line = prepared.review?.lines?.[0];
  assert.deepEqual(line && {
    product_id: line.product_id,
    name: line.name,
    unit_size: line.unit_size,
    quantity: line.quantity,
    unit_price: line.unit_price,
    line_total: line.line_total,
  }, {
    product_id: approved.productId,
    name: approved.productName,
    unit_size: approved.unitSize,
    quantity: approved.quantity,
    unit_price: approved.unitPrice,
    line_total: approved.lineTotal,
  }, "Prepared proposal differs from the exact approval");

  const applied = content<{ status?: string; operation?: string; replayed?: boolean; basket?: Basket }>(
    await client.callTool({ name: "apply_cart_additions", arguments: { proposal_id: prepared.proposal_id } }),
    "apply_cart_additions",
  );
  assert.equal(applied.status, "completed", "Addition was not completed");
  assert.equal(applied.operation, "additions", "Applied operation changed");
  assert.equal(applied.replayed, false, "Acceptance proposal was unexpectedly replayed");
  assert.ok(applied.basket && hasApprovedQuantity(applied.basket, approved), "Apply readback does not contain the approved line");

  const fresh = basket(await client.callTool({ name: "view_cart", arguments: {} }), "final view_cart");
  assert.ok(hasApprovedQuantity(fresh, approved), "Fresh basket readback does not contain the approved line");
  assert.deepEqual(fresh, applied.basket, "Apply and fresh basket readbacks differ");
  return fresh;
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
