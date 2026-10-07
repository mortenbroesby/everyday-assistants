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
import { NEMLIG_CODENAME, NEMLIG_VERSION } from "./runtime.js";

const viewerResource = (uri: string) => ({ contents: [{
  uri,
  mimeType: PRODUCT_VIEWER_MIME_TYPE,
  text: renderProductViewerHtml(),
  _meta: { ui: { csp: { connectDomains: [], resourceDomains: ["https://nemlig.com", "https://www.nemlig.com"] }, prefersBorder: true } },
}] });

const userToolMetadata = {
  start_product_review: { ui: { resourceUri: PRODUCT_VIEWER_RESOURCE_URI, visibility: ["model"] }, "openai/outputTemplate": PRODUCT_VIEWER_RESOURCE_URI },
  update_product_review_conversation: { ui: { visibility: ["model"] } },
  submit_product_review_conversation: { ui: { visibility: ["model"] } },
  update_product_review: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  submit_product_review: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
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
    callTool: async ({ name }) => {
      calls.push(name);
      if (name === "get_profile") return { structuredContent: { id: "profile", release: { version: NEMLIG_VERSION, codename: NEMLIG_CODENAME } } };
      if (name === "find_groceries") {
        return { structuredContent: { result: [{ id: 7 }, { id: 8 }] } };
      }
      if (name === "show_my_basket") return { structuredContent: { items: [] } };
      return { structuredContent: { applicable: false } };
    },
  };

  const report = await verifyReadOnlyProductionFeatures(client);
  assert.deepEqual(calls, [
    "get_profile", "find_groceries", "show_my_basket",
  ]);
  for (const forbidden of [
    ...productionToolInventory.localState,
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
      if (["start_product_review", "update_product_review_conversation", "submit_product_review_conversation"].includes(name)) return { isError: true };
      if (name === "find_groceries") return { structuredContent: { result: [{ id: 7 }] } };
      if (name === "show_my_basket") return { structuredContent: { items: [] } };
      return { structuredContent: { result: [] } };
    },
  };
  const report = await verifyServiceAcceptanceFeatures(client);
  assert.deepEqual(calls, [
    "find_groceries", "show_my_basket", "start_product_review", "update_product_review_conversation", "submit_product_review_conversation",
  ]);
  assert.deepEqual(report.denied, ["start_product_review", "update_product_review_conversation", "submit_product_review_conversation"]);
  assert.deepEqual(resourceReads, [PRODUCT_VIEWER_RESOURCE_URI]);
  assert.equal(report.requestCount, 8);
});

test("regular read-only acceptance verifies the exact viewer resource and user tool metadata", async () => {
  const client: AcceptanceClient = {
    listTools: async () => ({ tools: withUserToolMetadata(retainedTools) }),
    listResources: async () => ({ resources: productionResourceInventory.map((uri) => ({ uri })) }),
    readResource: async ({ uri }) => viewerResource(uri),
    callTool: async ({ name }) => {
      if (name === "get_profile") return { structuredContent: { id: "profile", release: { version: NEMLIG_VERSION, codename: NEMLIG_CODENAME } } };
      if (name === "find_groceries") return { structuredContent: { result: [{ id: 7 }] } };
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
      if (["start_product_review", "update_product_review_conversation", "submit_product_review_conversation"].includes(name)) return { isError: true };
      if (name === "find_groceries") return { structuredContent: { result: [{ id: 7 }] } };
      if (name === "show_my_basket") return { structuredContent: { items: [] } };
      return { structuredContent: { result: [] } };
    },
  };
  const report = await verifyServiceAcceptanceFeatures(client);
  assert.equal(calls.includes("show_my_basket"), true);
  assert.equal(report.requestCount, 8);
});

test("service acceptance accepts only explicit HTTP 403 transport denials", async () => {
  const client = {
    listTools: async () => ({ tools: serviceAcceptanceToolInventory.map((name) => ({ name })) }),
    listResources: async () => ({ resources: serviceAcceptanceResourceInventory.map((uri) => ({ uri })) }),
    readResource: async ({ uri }: { uri: string }) => viewerResource(uri),
    callTool: async ({ name }: { name: string }) => {
      if (["start_product_review", "update_product_review_conversation", "submit_product_review_conversation"].includes(name)) throw { status: 403 };
      if (name === "find_groceries") return { structuredContent: { result: [{ id: 7 }] } };
      if (name === "show_my_basket") return { structuredContent: { items: [] } };
      return { structuredContent: { result: [] } };
    },
  };
  assert.deepEqual((await verifyServiceAcceptanceFeatures(client)).denied, ["start_product_review", "update_product_review_conversation", "submit_product_review_conversation"]);
  const failed = { ...client, callTool: async ({ name }: { name: string }) => {
    if (name === "start_product_review") throw { status: 500 };
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
