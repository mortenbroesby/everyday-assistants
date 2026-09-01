import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductionInventory,
  productionResourceInventory,
  productionToolInventory,
  productionBasketFingerprint,
  verifyApprovedProductionMutation,
  verifyApprovedReversibleProductionMutation,
  verifyProductionEdge,
  verifyReadOnlyProductionFeatures,
  type AcceptanceClient,
  type ApprovedProductionMutation,
} from "./production-acceptance.js";

const allTools = Object.values(productionToolInventory).flat().map((name) => ({ name }));

test("production basket fingerprint is order-stable and state-sensitive", () => {
  const first = { items: [{ id: 7, name: "Milk", quantity: 1, total: 12 }, { id: 8, name: "Bread", quantity: 1, total: 20 }], products_price: 32 };
  assert.equal(productionBasketFingerprint(first), productionBasketFingerprint({ ...first, items: [...first.items].reverse() }));
  assert.notEqual(productionBasketFingerprint(first), productionBasketFingerprint({ ...first, products_price: 33 }));
});

test("production inventory fails closed for missing and unknown entries", () => {
  const resources = productionResourceInventory.map((uri) => ({ uri }));
  assert.throws(() => assertProductionInventory(allTools.slice(1), resources), /inventory drifted/u);
  assert.throws(() => assertProductionInventory([...allTools, { name: "unknown_tool" }], resources), /inventory drifted/u);
  assert.throws(() => assertProductionInventory(allTools, []), /resource inventory drifted/u);
});

test("default production feature acceptance covers safe paths and never calls external-state tools", async () => {
  const calls: string[] = [];
  const client: AcceptanceClient = {
    listTools: async () => ({ tools: allTools }),
    listResources: async () => ({ resources: productionResourceInventory.map((uri) => ({ uri })) }),
    readResource: async () => ({ contents: [{ text: "picker" }] }),
    callTool: async ({ name }) => {
      calls.push(name);
      if (name === "search_products" || name === "pick_products") {
        return { structuredContent: { result: [{ id: 7 }, { id: 8 }] } };
      }
      if (name === "list_favorites" || name === "browse_department") return { structuredContent: { result: [] } };
      if (name === "plan_shopping_list") return { structuredContent: { lines: [], selected_estimated_total: 0 } };
      if (name === "list_departments") return { structuredContent: { departments: [{ id: "fruit" }] } };
      if (name === "view_cart") return { structuredContent: { items: [] } };
      if (name === "load_shopping_plan") return { isError: true };
      return { structuredContent: { applicable: false } };
    },
  };

  const report = await verifyReadOnlyProductionFeatures(client);
  assert.deepEqual(calls, [
    "search_products", "list_favorites", "plan_shopping_list", "list_departments",
    "browse_department", "view_cart", "pick_products", "load_shopping_plan",
    "prepare_cart_additions", "prepare_cart_removal", "prepare_cart_replacement", "prepare_cart_clear",
  ]);
  assert.equal(calls.some((name) => (productionToolInventory.externalState as readonly string[]).includes(name)), false);
  assert.deepEqual(report.unavailable, ["load_shopping_plan:no_safe_fixture"]);
});

const approved: ApprovedProductionMutation = {
  operation: "additions",
  prepareArguments: { items: [{ product_id: 7, quantity: 2 }] },
  expectedReview: { lines: [{ product_id: 7, name: "Økologisk mælk", quantity: 2, line_total: 25 }] },
};
const emptyBasket: { items: Array<{ id: number; name: string; quantity: number; total: number }>; products_price: number } = { items: [], products_price: 0 };
const addedBasket = { items: [{ id: 7, name: "Økologisk mælk", quantity: 2, total: 25 }], products_price: 25 };

const proposal = (operation: ApprovedProductionMutation["operation"], review: Record<string, unknown>, overrides: Record<string, unknown> = {}) => ({
  applicable: true,
  operation,
  proposal_id: "919b4c09-704e-466b-8dda-fe4391b8561c",
  review,
  ...overrides,
});

test("generic production mutation uses the matching prepare/apply pair for every operation", async () => {
  const pairs = {
    additions: ["prepare_cart_additions", "apply_cart_additions"],
    removal: ["prepare_cart_removal", "apply_cart_removal"],
    replacement: ["prepare_cart_replacement", "apply_cart_replacement"],
    clear: ["prepare_cart_clear", "apply_cart_clear"],
  } as const;
  for (const [operation, [prepare, apply]] of Object.entries(pairs)) {
    const calls: string[] = [];
    const envelope: ApprovedProductionMutation = { operation: operation as ApprovedProductionMutation["operation"], prepareArguments: {}, expectedReview: { exact: operation } };
    const client: AcceptanceClient = {
      listTools: async () => ({ tools: ["view_cart", prepare, apply].map((name) => ({ name })) }),
      callTool: async ({ name }) => {
        calls.push(name);
        if (name === prepare) return { structuredContent: proposal(envelope.operation, envelope.expectedReview) };
        if (name === apply) return { structuredContent: { status: "completed", operation, replayed: false, basket: addedBasket } };
        return { structuredContent: calls.length === 1 ? emptyBasket : addedBasket };
      },
    };
    assert.deepEqual((await verifyApprovedProductionMutation(client, envelope)).final, addedBasket);
    assert.deepEqual(calls, ["view_cart", prepare, apply, "view_cart"]);
  }
});

test("generic production mutation rejects price or proposal drift before apply", async () => {
  const calls: string[] = [];
  const client: AcceptanceClient = {
    listTools: async () => ({ tools: ["view_cart", "prepare_cart_additions", "apply_cart_additions"].map((name) => ({ name })) }),
    callTool: async ({ name }) => {
      calls.push(name);
      if (name === "prepare_cart_additions") {
        return { structuredContent: proposal("additions", { lines: [{ product_id: 7, line_total: 26 }] }) };
      }
      return { structuredContent: emptyBasket };
    },
  };

  await assert.rejects(verifyApprovedProductionMutation(client, approved), /differs from the exact approval/u);
  assert.deepEqual(calls, ["view_cart", "prepare_cart_additions"]);
});

test("indeterminate apply is not retried and does not call a sibling mutation", async () => {
  const calls: string[] = [];
  const client: AcceptanceClient = {
    listTools: async () => ({ tools: ["view_cart", "prepare_cart_additions", "apply_cart_additions", "apply_cart_clear"].map((name) => ({ name })) }),
    callTool: async ({ name }) => {
      calls.push(name);
      if (name === "prepare_cart_additions") return { structuredContent: proposal("additions", approved.expectedReview) };
      if (name === "apply_cart_additions") return { isError: true };
      return { structuredContent: emptyBasket };
    },
  };

  await assert.rejects(verifyApprovedProductionMutation(client, approved), /returned an MCP error/u);
  assert.deepEqual(calls, ["view_cart", "prepare_cart_additions", "apply_cart_additions"]);
});

test("reversible acceptance restores the exact initial basket fingerprint", async () => {
  const restoration: ApprovedProductionMutation = {
    operation: "removal",
    prepareArguments: { product_id: 7 },
    expectedReview: { line: addedBasket.items[0] },
  };
  let state = emptyBasket;
  const client: AcceptanceClient = {
    listTools: async () => ({ tools: allTools }),
    callTool: async ({ name }) => {
      if (name === "view_cart") return { structuredContent: state };
      if (name === "prepare_cart_additions") return { structuredContent: proposal("additions", approved.expectedReview) };
      if (name === "apply_cart_additions") state = addedBasket;
      if (name === "prepare_cart_removal") return { structuredContent: proposal("removal", restoration.expectedReview) };
      if (name === "apply_cart_removal") state = emptyBasket;
      return { structuredContent: { status: "completed", operation: name.includes("removal") ? "removal" : "additions", replayed: false, basket: state } };
    },
  };
  assert.deepEqual(await verifyApprovedReversibleProductionMutation(client, approved, restoration), emptyBasket);
});

test("unavailable inverse stops with the last verified basket fingerprint", async () => {
  let state = emptyBasket;
  const client: AcceptanceClient = {
    listTools: async () => ({ tools: allTools }),
    callTool: async ({ name }) => {
      if (name === "view_cart") return { structuredContent: state };
      if (name === "prepare_cart_additions") return { structuredContent: proposal("additions", approved.expectedReview) };
      if (name === "apply_cart_additions") { state = addedBasket; return { structuredContent: { status: "completed", operation: "additions", replayed: false, basket: state } }; }
      if (name === "prepare_cart_removal") return { structuredContent: { applicable: false, operation: "removal", reason: "unavailable" } };
      throw new Error(`Unexpected ${name}`);
    },
  };
  const restoration: ApprovedProductionMutation = { operation: "removal", prepareArguments: { product_id: 7 }, expectedReview: { line: addedBasket.items[0] } };
  await assert.rejects(verifyApprovedReversibleProductionMutation(client, approved, restoration), /Restoration stopped at basket fingerprint/u);
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
