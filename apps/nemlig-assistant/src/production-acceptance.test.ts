import assert from "node:assert/strict";
import test from "node:test";
import {
  verifyApprovedProductionAddition,
  verifyProductionEdge,
  type AcceptanceClient,
  type ApprovedAddition,
} from "./production-acceptance.js";

const approved: ApprovedAddition = {
  productId: 7,
  productName: "Økologisk mælk",
  unitSize: "1 liter",
  quantity: 2,
  unitPrice: 12.5,
  lineTotal: 25,
};

const proposal = (overrides: Record<string, unknown> = {}) => ({
  applicable: true,
  operation: "additions",
  proposal_id: "919b4c09-704e-466b-8dda-fe4391b8561c",
  review: { lines: [{
    product_id: approved.productId,
    name: approved.productName,
    unit_size: approved.unitSize,
    quantity: approved.quantity,
    unit_price: approved.unitPrice,
    line_total: approved.lineTotal,
  }] },
  ...overrides,
});

const basket = { items: [{ id: approved.productId, name: approved.productName, quantity: approved.quantity, total: approved.lineTotal }], products_price: 25 };

test("production addition accepts only the exact prepared line and verifies a fresh basket readback", async () => {
  const calls: string[] = [];
  const client: AcceptanceClient = {
    listTools: async () => ({ tools: ["view_cart", "prepare_cart_additions", "apply_cart_additions"].map((name) => ({ name })) }),
    callTool: async ({ name }) => {
      calls.push(name);
      if (name === "prepare_cart_additions") return { structuredContent: proposal() };
      if (name === "apply_cart_additions") return { structuredContent: { status: "completed", operation: "additions", replayed: false, basket } };
      return { structuredContent: calls.length === 1 ? { items: [] } : basket };
    },
  };

  assert.deepEqual(await verifyApprovedProductionAddition(client, approved), basket);
  assert.deepEqual(calls, ["view_cart", "prepare_cart_additions", "apply_cart_additions", "view_cart"]);
});

test("production addition rejects a changed proposal before apply", async () => {
  const calls: string[] = [];
  const client: AcceptanceClient = {
    listTools: async () => ({ tools: ["view_cart", "prepare_cart_additions", "apply_cart_additions"].map((name) => ({ name })) }),
    callTool: async ({ name }) => {
      calls.push(name);
      if (name === "prepare_cart_additions") {
        return { structuredContent: proposal({ review: { lines: [{ ...proposal().review.lines[0], line_total: 26 }] } }) };
      }
      return { structuredContent: { items: [] } };
    },
  };

  await assert.rejects(verifyApprovedProductionAddition(client, approved), /differs from the exact approval/u);
  assert.deepEqual(calls, ["view_cart", "prepare_cart_additions"]);
});

test("production addition detects an unverified apply result and never calls another mutation tool", async () => {
  const calls: string[] = [];
  const client: AcceptanceClient = {
    listTools: async () => ({ tools: ["view_cart", "prepare_cart_additions", "apply_cart_additions", "apply_cart_clear"].map((name) => ({ name })) }),
    callTool: async ({ name }) => {
      calls.push(name);
      if (name === "prepare_cart_additions") return { structuredContent: proposal() };
      if (name === "apply_cart_additions") return { structuredContent: { status: "completed", operation: "additions", replayed: false, basket: { items: [] } } };
      return { structuredContent: { items: [] } };
    },
  };

  await assert.rejects(verifyApprovedProductionAddition(client, approved), /does not contain the approved line/u);
  assert.deepEqual(calls, ["view_cart", "prepare_cart_additions", "apply_cart_additions"]);
});

test("production edge probe verifies enablement, OAuth metadata, and cheap rejection paths", async () => {
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url.endsWith("/healthz")) return Response.json({ status: "ok", enabled: true });
    if (request.url.includes("oauth-protected-resource")) return Response.json({
      resource: "https://nemlig-mcp.broesby.dk/mcp",
      scopes_supported: ["use:nemlig-assistant"],
      bearer_methods_supported: ["header"],
    });
    return new Response(null, { status: request.headers.has("origin") ? 403 : 401 });
  };

  await verifyProductionEdge(new URL("https://nemlig-mcp.broesby.dk"), fetcher);
  assert.deepEqual(requests.map((request) => [new URL(request.url).pathname, request.method]), [
    ["/healthz", "GET"],
    ["/.well-known/oauth-protected-resource/mcp", "GET"],
    ["/mcp", "POST"],
    ["/mcp", "POST"],
  ]);
});
