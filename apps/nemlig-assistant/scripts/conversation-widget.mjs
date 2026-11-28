import assert from "node:assert/strict";
import { URL, fileURLToPath } from "node:url";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { chromium } from "playwright";
import { installViewerAssetFixture } from "./viewer-asset-fixture.ts";
import { readLocalViewerGeneration } from "./viewer-generation.ts";
import { PRODUCT_VIEWER_RESOURCE_URI } from "../src/product-viewer-identity.ts";

function assertReview(result, expected, quantity) {
  assert.notEqual(result.isError, true);
  const review = result.structuredContent?.review;
  assert.equal(review?.draftId, expected.draftId);
  assert.equal(review.reviewContextId, expected.reviewContextId);
  assert.deepEqual(
    review.items.map(({ product_id, quantity }) => [product_id, quantity]),
    [[900001, quantity]],
  );
}

// This function runs inside the browser host. All tool calls return to the same fixture.
function mountViewer(initial) {
  const { document, location, window } = globalThis;
  const frame = document.createElement("iframe");
  frame.src = "/viewer";
  const post = (message) =>
    frame.contentWindow.postMessage(
      { jsonrpc: "2.0", ...message },
      location.origin,
    );
  const publish = (result) =>
    post({ method: "ui/notifications/tool-result", params: result });
  window.addEventListener("message", async (event) => {
    if (
      event.source !== frame.contentWindow ||
      event.origin !== location.origin
    ) {
      return;
    }
    const { method, id, params } = event.data;
    if (method === "ui/initialize") {
      post({
        id,
        result: {
          protocolVersion: params.protocolVersion,
          hostInfo: { name: "conversation-test", version: "1" },
          hostCapabilities: {},
          hostContext: { theme: "light" },
        },
      });
    } else if (method === "ui/notifications/initialized") {
      frame.dataset.initialized = "true";
      publish(initial);
    } else if (method === "tools/call") {
      let result;
      try {
        result = await window.callFixtureTool(params);
      } catch {
        frame.dataset.toolFailure = "true";
        post({
          id,
          error: { code: -32603, message: "Synthetic host tool call failed" },
        });
        return;
      }
      if (
        params.name === "update_product_review" &&
        params.arguments.action.kind !== "show"
      ) {
        frame.dataset.edited = "true";
      }
      post({ id, result });
      publish(result);
    }
  });
  document.body.append(frame);
}

export async function verifyConversationWidget({ url, result }) {
  const endpoint = new URL(url);
  assert.equal(endpoint.hostname, "127.0.0.1");
  const review = result.structuredContent?.review;
  assert.ok(review?.draftId && review.reviewContextId);
  assertReview(result, review, 1);
  const generation = await readLocalViewerGeneration(
    fileURLToPath(new URL("../dist/ui-static/", import.meta.url)),
  );
  const client = new Client({ name: "conversation-widget", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { connection: "close" } },
      }),
    );
    const tools = await client.listTools();
    const show = tools.tools.find(
      (tool) => tool.name === "show_product_review",
    );
    assert.equal(show?._meta?.ui?.resourceUri, PRODUCT_VIEWER_RESOURCE_URI);
    const resource = await client.readResource({
      uri: PRODUCT_VIEWER_RESOURCE_URI,
    });
    const browser = await chromium.launch({ channel: "chrome" });
    try {
      const context = await browser.newContext({ serviceWorkers: "block" });
      await installViewerAssetFixture(context, generation);
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      // Serve the widget and its host inside Playwright. Only the Node MCP client
      // needs a socket to the synthetic fixture.
      await page.route(endpoint.origin + "/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body:
            new URL(route.request().url()).pathname === "/viewer"
              ? resource.contents[0].text
              : "<!doctype html><body></body>",
        }),
      );

      await page.exposeFunction("callFixtureTool", async (params) => {
        assert.ok(
          ["update_product_review", "show_product_review"].includes(
            params.name,
          ),
        );
        const reply = await client.callTool(params);
        if (
          params.name === "update_product_review" &&
          params.arguments.action.kind !== "show"
        ) {
          assertReview(reply, review, 2);
        }
        return reply;
      });
      await page.goto(endpoint.origin);
      await page.evaluate(mountViewer, result);
      const iframe = page.frameLocator("iframe");
      await iframe.locator("main.viewer").waitFor();
      await page.locator('iframe[data-initialized="true"]').waitFor();
      const row = page
        .frameLocator("iframe")
        .locator(".product-action-row")
        .filter({ hasText: "Synthetic oat drink" });
      const summary = row.locator(
        '[data-viewer-component="product-summary"]:enabled',
      );
      await row.waitFor();
      await Promise.race([
        summary.waitFor(),
        page
          .locator('iframe[data-tool-failure="true"]')
          .waitFor()
          .then(() => {
            throw new Error(
              "Synthetic host failed to refresh the rendered draft",
            );
          }),
      ]);
      await summary.press("Shift+F10");
      await row.getByRole("button", { name: /Increase quantity/ }).click();
      await row
        .locator(".product-action-quantity-value")
        .filter({ hasText: /^2$/ })
        .waitFor();
      await page.locator('iframe[data-edited="true"]').waitFor();
      const reopened = await client.callTool({
        name: "show_product_review",
        arguments: {
          draft_id: review.draftId,
          review_context_id: review.reviewContextId,
        },
      });
      assertReview(reopened, review, 2);
    } finally {
      await browser.close();
    }
  } finally {
    await client.close();
  }
}
