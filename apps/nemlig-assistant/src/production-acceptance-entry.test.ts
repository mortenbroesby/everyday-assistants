import assert from "node:assert/strict";
import test from "node:test";
import {
  productionResourceInventory,
  productionToolInventory,
  type AcceptanceClient,
  type ApprovedProductionMutation,
} from "./production-acceptance.js";

const allTools = Object.values(productionToolInventory).flat().map((name) => ({ name }));
const removedStorageTools = [
  "save_my_shopping_plan", "continue_my_shopping_plan", "show_my_shopping_lists", "save_my_shopping_list",
  "copy_my_shopping_list", "set_my_shopping_list_status", "shop_from_my_list", "migrate_my_saved_plan",
];
const retainedTools = allTools.filter(({ name }) => !removedStorageTools.includes(name));

function edgeFetcher(calls: string[], origin = "https://nemlig-mcp.example.test/mcp"): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    calls.push(new URL(request.url).pathname);
    if (request.url.endsWith("/healthz")) return Response.json({ status: "ok", enabled: true });
    if (request.url.endsWith("/revision")) return Response.json({ revision: "test-revision" });
    if (request.url.includes("oauth-protected-resource")) return Response.json({
      resource: origin,
      scopes_supported: ["use:nemlig-assistant"],
      bearer_methods_supported: ["header"],
    });
    if (request.url.endsWith("/admin/usage")) return Response.json({ schema_version: 1, tiers: { "0": {}, "1": {}, "2": {} } });
    return new Response(null, { status: request.headers.has("origin") ? 403 : 401 });
  };
}

function readonlyClient(): AcceptanceClient {
  return {
    listTools: async () => ({ tools: retainedTools }),
    listResources: async () => ({ resources: productionResourceInventory.map((uri) => ({ uri })) }),
    readResource: async () => ({ contents: [{ text: "picker" }] }),
    callTool: async ({ name, arguments: args }) => {
      if (name === "find_groceries" || name === "choose_products_visually") return { structuredContent: { result: [{ id: 7 }] } };
      if (name === "show_my_favorites") return { structuredContent: { result: [] } };
      if (name === "plan_my_shopping") return { structuredContent: { lines: [{ selected_product_id: (args.lines as Array<{ selected_product?: number }>)[0]?.selected_product }] } };
      if (name === "show_grocery_sections") return { structuredContent: { departments: [{ id: "fruit" }] } };
      if (name === "browse_grocery_section") return { structuredContent: { result: [] } };
      return { structuredContent: { items: [] } };
    },
  };
}

test("importing the acceptance entry performs no work", async () => {
  const calls: string[] = [];
  const output: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalFetch = globalThis.fetch;
  console.log = (...args: unknown[]) => output.push(args.join(" "));
  console.error = (...args: unknown[]) => output.push(args.join(" "));
  globalThis.fetch = edgeFetcher(calls);
  try {
    await import("../scripts/production-acceptance.js");
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.error = originalError;
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(output, []);
});

test("default acceptance connects after edge, verifies read-only paths, aggregates, and closes", async () => {
  const calls: string[] = [];
  const events: string[] = [];
  await (await import("../scripts/production-acceptance.js")).main([], {
    NEMLIG_PRODUCTION_MCP_URL: "https://nemlig-mcp.example.test/mcp",
    NEMLIG_MCP_ACCESS_TOKEN: "test-token",
  }, {
    fetcher: edgeFetcher(calls),
    connect: async () => {
      events.push("connect");
      return { client: readonlyClient(), close: async () => { events.push("close"); } };
    },
  });
  assert.deepEqual(events, ["connect", "close"]);
  assert.deepEqual(calls, ["/healthz", "/revision", "/.well-known/oauth-protected-resource/mcp", "/mcp", "/mcp", "/admin/usage"]);
});

test("edge-only skips credentials and connect", async () => {
  const calls: string[] = [];
  let connected = false;
  await (await import("../scripts/production-acceptance.js")).main(["--edge-only"], {}, {
    fetcher: edgeFetcher(calls, "https://nemlig-mcp.broesby.dk/mcp"),
    connect: async () => { connected = true; throw new Error("must not connect"); },
  });
  assert.equal(connected, false);
  assert.equal(calls.length, 5);
});

test("malformed flags and envelopes fail before network or connect", async () => {
  const calls: string[] = [];
  let connected = false;
  const dependencies = { fetcher: edgeFetcher(calls), connect: async () => { connected = true; throw new Error("must not connect"); } };
  const entry = await import("../scripts/production-acceptance.js");
  await assert.rejects(entry.main(["--edge-only", "--mutation"], {}, dependencies), /cannot be combined/u);
  await assert.rejects(entry.main(["--edge-only", "--edge-only"], {}, dependencies), /must not be repeated/u);
  await assert.rejects(entry.main(["--mutation", "--mutation"], {}, dependencies), /must not be repeated/u);
  await assert.rejects(entry.main(["--unknown"], {}, dependencies), /Unknown acceptance argument/u);
  await assert.rejects(entry.main(["positional"], {}, dependencies), /Unknown acceptance argument/u);
  await assert.rejects(entry.main(["--mutation"], { NEMLIG_PRODUCTION_MUTATION: "{}" }, dependencies), /CONFIRMATION is required/u);
  await assert.rejects(entry.main(["--mutation"], {
    NEMLIG_PRODUCTION_MUTATION: "not-json",
    NEMLIG_PRODUCTION_MUTATION_CONFIRMATION: "not-json",
  }, dependencies), /valid JSON/u);
  await assert.rejects(entry.main(["--mutation"], {
    NEMLIG_PRODUCTION_MUTATION: "{}",
    NEMLIG_PRODUCTION_MUTATION_CONFIRMATION: "different",
  }, dependencies), /must exactly repeat/u);
  assert.equal(connected, false);
  assert.deepEqual(calls, []);
});

test("missing token is rejected before connect", async () => {
  const calls: string[] = [];
  let connected = false;
  const entry = await import("../scripts/production-acceptance.js");
  await assert.rejects(entry.main([], {}, {
    fetcher: edgeFetcher(calls, "https://nemlig-mcp.broesby.dk/mcp"),
    connect: async () => { connected = true; throw new Error("must not connect"); },
  }), /NEMLIG_MCP_ACCESS_TOKEN is required/u);
  assert.equal(connected, false);
  assert.equal(calls.length, 5);
});

test("mutation validates both envelopes, applies, restores once, and closes", async () => {
  const edgeCalls: string[] = [];
  const calls: string[] = [];
  const events: string[] = [];
  const change: ApprovedProductionMutation = { operation: "additions", prepareArguments: {}, expectedReview: { exact: "change" } };
  const restoration: ApprovedProductionMutation = { operation: "removal", prepareArguments: {}, expectedReview: { exact: "restore" } };
  const serializedChange = JSON.stringify(change);
  const serializedRestoration = JSON.stringify(restoration);
  const client: AcceptanceClient = {
    listTools: async () => ({ tools: allTools }),
    callTool: async ({ name }) => {
      calls.push(name);
      if (name === "show_my_basket") return { structuredContent: { items: [], products_price: 0 } };
      if (name === "review_items_to_add") return { structuredContent: { applicable: true, operation: "additions", proposal_id: "919b4c09-704e-466b-8dda-fe4391b8561c", review: change.expectedReview } };
      if (name === "review_item_to_remove") return { structuredContent: { applicable: true, operation: "removal", proposal_id: "919b4c09-704e-466b-8dda-fe4391b8561c", review: restoration.expectedReview } };
      if (name === "add_approved_items") return { structuredContent: { status: "completed", operation: "additions", replayed: false, basket: { items: [], products_price: 0 } } };
      return { structuredContent: { status: "completed", operation: "removal", replayed: false, basket: { items: [], products_price: 0 } } };
    },
  };
  const entry = await import("../scripts/production-acceptance.js");
  await entry.main(["--mutation"], {
    NEMLIG_PRODUCTION_MCP_URL: "https://nemlig-mcp.example.test/mcp",
    NEMLIG_MCP_ACCESS_TOKEN: "test-token",
    NEMLIG_PRODUCTION_MUTATION: serializedChange,
    NEMLIG_PRODUCTION_MUTATION_CONFIRMATION: serializedChange,
    NEMLIG_PRODUCTION_RESTORATION: serializedRestoration,
    NEMLIG_PRODUCTION_RESTORATION_CONFIRMATION: serializedRestoration,
  }, {
    fetcher: edgeFetcher(edgeCalls),
    connect: async () => ({ client, close: async () => { events.push("close"); } }),
  });
  assert.deepEqual(events, ["close"]);
  assert.deepEqual(calls, [
    "show_my_basket", "review_items_to_add", "add_approved_items", "show_my_basket",
    "show_my_basket", "review_item_to_remove", "remove_approved_item", "show_my_basket",
  ]);
  assert.equal(calls.filter((name) => name === "add_approved_items").length, 1);
  assert.equal(calls.filter((name) => name === "remove_approved_item").length, 1);
});

test("read-only failure after connect still closes the client", async () => {
  const calls: string[] = [];
  let closed = 0;
  const entry = await import("../scripts/production-acceptance.js");
  await assert.rejects(entry.main([], {
    NEMLIG_PRODUCTION_MCP_URL: "https://nemlig-mcp.example.test/mcp",
    NEMLIG_MCP_ACCESS_TOKEN: "test-token",
  }, {
    fetcher: edgeFetcher(calls),
    connect: async () => ({
      client: {
        listTools: async () => { throw new Error("provider detail with secret"); },
        listResources: async () => ({ resources: [] }),
        readResource: async () => ({ contents: [] }),
        callTool: async () => ({}),
      },
      close: async () => { closed += 1; },
    }),
  }), /provider detail with secret/u);
  assert.equal(closed, 1);
});
