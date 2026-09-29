import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductionInventory,
  productionResourceInventory,
  productionToolInventory,
  verifyProductionEdge,
  verifyReadOnlyProductionFeatures,
  verifyServiceAcceptanceFeatures,
  type AcceptanceClient,
} from "./production-acceptance.js";
import { serviceAcceptanceResourceInventory, serviceAcceptanceToolInventory } from "./mcp.js";
import { PRODUCT_VIEWER_MIME_TYPE, PRODUCT_VIEWER_RESOURCE_URI, renderProductViewerHtml } from "./product-viewer.js";

const viewerResource = (uri: string) => ({ contents: [{
  uri,
  mimeType: PRODUCT_VIEWER_MIME_TYPE,
  text: renderProductViewerHtml(),
  _meta: { ui: { csp: { connectDomains: [], resourceDomains: ["https://nemlig.com", "https://www.nemlig.com"] }, prefersBorder: true } },
}] });

const userToolMetadata = {
  show_my_basket_visually: { ui: { resourceUri: PRODUCT_VIEWER_RESOURCE_URI }, "openai/outputTemplate": PRODUCT_VIEWER_RESOURCE_URI },
  start_product_review: { ui: { resourceUri: PRODUCT_VIEWER_RESOURCE_URI }, "openai/outputTemplate": PRODUCT_VIEWER_RESOURCE_URI, "openai/widgetAccessible": true },
  update_product_review: { ui: { resourceUri: PRODUCT_VIEWER_RESOURCE_URI }, "openai/outputTemplate": PRODUCT_VIEWER_RESOURCE_URI, "openai/widgetAccessible": true },
  submit_product_review: { ui: { resourceUri: PRODUCT_VIEWER_RESOURCE_URI, visibility: ["model"] }, "openai/outputTemplate": PRODUCT_VIEWER_RESOURCE_URI },
};
const withUserToolMetadata = (tools: Array<{ name: string }>) => tools.map((tool) => ({
  ...tool,
  ...(tool.name in userToolMetadata ? { _meta: userToolMetadata[tool.name as keyof typeof userToolMetadata] } : {}),
}));

const allTools = withUserToolMetadata(Object.values(productionToolInventory).flat().map((name) => ({ name })));
const removedStorageTools = [
  "save_my_shopping_plan", "continue_my_shopping_plan", "show_my_shopping_lists", "save_my_shopping_list",
  "copy_my_shopping_list", "set_my_shopping_list_status", "shop_from_my_list", "migrate_my_saved_plan",
];
const retainedTools = allTools.filter(({ name }) => !removedStorageTools.includes(name));

test("production inventory fails closed for missing and unknown entries", () => {
  const resources = productionResourceInventory.map((uri) => ({ uri }));
  assert.throws(() => assertProductionInventory(allTools.slice(1), resources), /inventory drifted/u);
  assert.throws(() => assertProductionInventory([...allTools, { name: "unknown_tool" }], resources), /inventory drifted/u);
  assert.throws(() => assertProductionInventory(allTools, [{ uri: "ui://stale" }]), /resource inventory drifted/u);
});

test("production acceptance omits removed saved-storage tools while retaining direct discovery", async () => {
  const calls: string[] = [];
  const client: AcceptanceClient = {
    listTools: async () => ({ tools: withUserToolMetadata(retainedTools) }),
    listResources: async () => ({ resources: productionResourceInventory.map((uri) => ({ uri })) }),
    readResource: async ({ uri }) => viewerResource(uri),
    callTool: async ({ name, arguments: args }) => {
      calls.push(name);
      if (name === "find_groceries") {
        return { structuredContent: { result: [{ id: 7 }, { id: 8 }] } };
      }
      if (name === "get_grocery_details") return { structuredContent: { result: { id: args.product_id, name: "Milk" } } };
      if (name === "show_my_favorites") {
        assert.equal(args.result_count, 1);
        return { structuredContent: { result: [] } };
      }
      if (name === "browse_grocery_section") return { structuredContent: { result: [] } };
      if (name === "show_grocery_sections") return { structuredContent: { departments: [{ id: "fruit" }] } };
      if (name === "show_my_basket" || name === "show_my_basket_visually") return { structuredContent: { items: [] } };
      return { structuredContent: { applicable: false } };
    },
  };

  const report = await verifyReadOnlyProductionFeatures(client);
  assert.deepEqual(calls, [
    "find_groceries", "get_grocery_details", "show_my_favorites", "show_grocery_sections",
    "browse_grocery_section", "show_my_basket", "show_my_basket_visually",
  ]);
  for (const forbidden of [
    ...productionToolInventory.prepareOnly,
    ...productionToolInventory.externalState,
  ]) assert.equal(calls.includes(forbidden), false, `Read-only acceptance called ${forbidden}`);
  for (const removed of removedStorageTools) assert.equal(calls.includes(removed), false, `Read-only acceptance called removed ${removed}`);
  assert.deepEqual(report.unavailable, []);
});

test("service acceptance has a closed read-only fixture inventory and denies basket preparation and mutation", async () => {
  const calls: string[] = [];
  const resourceReads: string[] = [];
  const client: AcceptanceClient = {
    listTools: async () => ({ tools: serviceAcceptanceToolInventory.map((name) => ({ name })) }),
    listResources: async () => ({ resources: serviceAcceptanceResourceInventory.map((uri) => ({ uri })) }),
    readResource: async ({ uri }) => {
      resourceReads.push(uri);
      return viewerResource(uri);
    },
    callTool: async ({ name }) => {
      calls.push(name);
      if (["review_items_to_add", "add_approved_items"].includes(name)) return { isError: true };
      if (name === "find_groceries") return { structuredContent: { result: [{ id: 7 }] } };
      if (name === "get_grocery_details") return { structuredContent: { result: { id: 7, name: "Milk" } } };
      if (name === "show_grocery_sections") return { structuredContent: { departments: [{ id: "fruit" }] } };
      if (name === "show_my_basket" || name === "show_my_basket_visually") return { structuredContent: { items: [] } };
      return { structuredContent: { result: [] } };
    },
  };
  const report = await verifyServiceAcceptanceFeatures(client);
  assert.deepEqual(calls, [
    "find_groceries", "get_grocery_details", "show_my_favorites", "show_grocery_sections", "browse_grocery_section", "show_my_basket", "show_my_basket_visually",
    "review_items_to_add", "add_approved_items",
  ]);
  assert.deepEqual(report.denied, ["review_items_to_add", "add_approved_items"]);
  assert.deepEqual(resourceReads, [PRODUCT_VIEWER_RESOURCE_URI]);
  assert.equal(report.requestCount, 12);
});

test("regular read-only acceptance verifies the exact viewer resource and user tool metadata", async () => {
  const client: AcceptanceClient = {
    listTools: async () => ({ tools: withUserToolMetadata(retainedTools) }),
    listResources: async () => ({ resources: productionResourceInventory.map((uri) => ({ uri })) }),
    readResource: async ({ uri }) => viewerResource(uri),
    callTool: async ({ name, arguments: args }) => {
      if (name === "find_groceries") return { structuredContent: { result: [{ id: 7 }] } };
      if (name === "show_grocery_sections") return { structuredContent: { departments: [{ id: "fruit" }] } };
      if (name === "show_my_favorites") return { structuredContent: { result: [] } };
      if (name === "browse_grocery_section") return { structuredContent: { result: [] } };
      if (name === "get_grocery_details") return { structuredContent: { result: { id: args.product_id } } };
      return { structuredContent: { items: [] } };
    },
  };
  const report = await verifyReadOnlyProductionFeatures(client);
  assert.ok(report.exercised.includes("read product viewer resource"));

  await assert.rejects(verifyReadOnlyProductionFeatures({
    ...client,
    readResource: async ({ uri }) => ({ contents: [{ ...viewerResource(uri).contents[0], text: "<html>stale</html>" }] }),
  }), /HTML drifted/u);
  await assert.rejects(verifyReadOnlyProductionFeatures({
    ...client,
    readResource: async ({ uri }) => ({ contents: [{
      ...viewerResource(uri).contents[0],
      _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true } },
    }] }),
  }), /CSP metadata drifted/u);
  await assert.rejects(verifyReadOnlyProductionFeatures({
    ...client,
    listTools: async () => ({ tools: withUserToolMetadata(retainedTools).map((tool) => tool.name === "start_product_review" ? { ...tool, _meta: {} } : tool) }),
  }), /metadata drifted/u);
});

test("service acceptance closes its inventory when Apps are disabled", async () => {
  const calls: string[] = [];
  const client: AcceptanceClient = {
    listTools: async () => ({ tools: serviceAcceptanceToolInventory.map((name) => ({ name })) }),
    listResources: async () => ({ resources: serviceAcceptanceResourceInventory.map((uri) => ({ uri })) }),
    readResource: async ({ uri }) => viewerResource(uri),
    callTool: async ({ name }) => {
      calls.push(name);
      if (["review_items_to_add", "add_approved_items"].includes(name)) return { isError: true };
      if (name === "find_groceries") return { structuredContent: { result: [{ id: 7 }] } };
      if (name === "show_grocery_sections") return { structuredContent: { departments: [{ id: "fruit" }] } };
      if (name === "show_my_basket" || name === "show_my_basket_visually") return { structuredContent: { items: [] } };
      return { structuredContent: { result: [] } };
    },
  };
  const report = await verifyServiceAcceptanceFeatures(client);
  assert.equal(calls.includes("get_grocery_details"), true);
  assert.equal(report.requestCount, 12);
});

test("service acceptance accepts only explicit HTTP 403 transport denials", async () => {
  const client = {
    listTools: async () => ({ tools: serviceAcceptanceToolInventory.map((name) => ({ name })) }),
    listResources: async () => ({ resources: serviceAcceptanceResourceInventory.map((uri) => ({ uri })) }),
    readResource: async ({ uri }: { uri: string }) => viewerResource(uri),
    callTool: async ({ name }: { name: string }) => {
      if (["review_items_to_add", "add_approved_items"].includes(name)) throw { status: 403 };
      if (name === "find_groceries") return { structuredContent: { result: [{ id: 7 }] } };
      if (name === "show_grocery_sections") return { structuredContent: { departments: [{ id: "fruit" }] } };
      if (name === "show_my_basket" || name === "show_my_basket_visually") return { structuredContent: { items: [] } };
      return { structuredContent: { result: [] } };
    },
  };
  assert.deepEqual((await verifyServiceAcceptanceFeatures(client)).denied, ["review_items_to_add", "add_approved_items"]);
  const failed = { ...client, callTool: async ({ name }: { name: string }) => {
    if (name === "review_items_to_add") throw { status: 500 };
    return await client.callTool({ name });
  } };
  await assert.rejects(verifyServiceAcceptanceFeatures(failed), /precise HTTP 403/u);
});

test("read-only acceptance has one total deadline", async () => {
  const client: AcceptanceClient = {
    listTools: async () => new Promise(() => {}),
    listResources: async () => ({ resources: [] }),
    readResource: async () => ({ contents: [] }),
    callTool: async () => ({ structuredContent: {} }),
  };
  await assert.rejects(verifyReadOnlyProductionFeatures(client, { totalTimeoutMs: 5 }), /timed out during tool inventory/u);
});

test("service acceptance preserves its operation-specific total deadline context", async () => {
  const client: AcceptanceClient = {
    listTools: async () => new Promise(() => {}),
    listResources: async () => ({ resources: [] }),
    readResource: async () => ({ contents: [] }),
    callTool: async () => ({ structuredContent: {} }),
  };
  await assert.rejects(verifyServiceAcceptanceFeatures(client, { totalTimeoutMs: 5 }), /Service acceptance timed out during tool inventory/u);
});

 test("production edge probe verifies enablement, OAuth metadata, and cheap rejection paths", async () => {
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url.endsWith("/healthz")) return Response.json({ status: "ok", enabled: true });
    if (request.url.endsWith("/revision")) return Response.json({ revision: "expected-revision" });
    if (request.url.includes("oauth-protected-resource")) return Response.json({
      resource: "https://nemlig-mcp.broesby.dk/mcp",
      scopes_supported: ["use:nemlig-assistant"],
      bearer_methods_supported: ["header"],
    });
    return new Response(null, { status: request.headers.has("origin") ? 403 : 401 });
  };

  const report = await verifyProductionEdge(new URL("https://nemlig-mcp.broesby.dk"), fetcher, { expectedRevision: "expected-revision" });
  assert.equal(report.revision, "expected-revision");
  assert.equal(report.lastCompletedBoundary, "foreign_origin_rejection");
  assert.deepEqual(requests.map((request) => [new URL(request.url).pathname, request.method]), [
    ["/healthz", "GET"],
    ["/revision", "GET"],
    ["/.well-known/oauth-protected-resource/mcp", "GET"],
    ["/mcp", "POST"],
    ["/mcp", "POST"],
  ]);
});

test("production edge probe reports wrong revision and the last completed boundary", async () => {
  const fetcher: typeof fetch = async (input) => {
    const path = new URL(input instanceof Request ? input.url : input).pathname;
    if (path === "/healthz") return Response.json({ status: "ok", enabled: true });
    return Response.json({ revision: "wrong" });
  };
  await assert.rejects(
    verifyProductionEdge(new URL("https://nemlig-mcp.broesby.dk"), fetcher, { expectedRevision: "expected" }),
    /does not match/u,
  );
});

test("production edge probe times out a stalled step with boundary evidence", async () => {
  const fetcher: typeof fetch = async (input, init) => {
    const path = new URL(input instanceof Request ? input.url : input).pathname;
    if (path === "/healthz") return Response.json({ status: "ok", enabled: true });
    return new Promise((_resolve, reject) => {
      const openConnection = setTimeout(() => {}, 1_000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(openConnection);
        reject(init.signal?.reason);
      }, { once: true });
    });
  };
  await assert.rejects(
    verifyProductionEdge(new URL("https://nemlig-mcp.broesby.dk"), fetcher, { stepTimeoutMs: 5 }),
    /stopped after health; revision failed or timed out/u,
  );
});
