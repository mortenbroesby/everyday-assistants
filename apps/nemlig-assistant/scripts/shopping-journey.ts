import assert from "node:assert/strict";
import type { Client } from "@modelcontextprotocol/client";
import { z } from "zod";
import {
  PRODUCT_VIEWER_RESOURCE_URI,
  PRODUCT_VIEWER_MIME_TYPE,
} from "../src/product-viewer.js";

export interface JourneyStep {
  operation: string;
  elapsed_ms: number;
  outcome: "pass" | "fail";
}

export async function runShoppingJourney(
  client: Client,
  expectedOrigin: string,
  report?: (step: JourneyStep) => void,
): Promise<void> {
  async function step<T>(
    operation: string,
    check: () => Promise<T>,
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await check();
      report?.({
        operation,
        elapsed_ms: Math.round(performance.now() - start),
        outcome: "pass",
      });
      return result;
    } catch {
      report?.({
        operation,
        elapsed_ms: Math.round(performance.now() - start),
        outcome: "fail",
      });
      throw new Error(`Shopping journey failed at ${operation}`);
    }
  }
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({
      name,
      arguments: args,
    });
    assert.ok(!response.isError);
    if (name === "find_groceries") {
      assert.ok(
        response.content.some(
          (block) =>
            block.type === "text" && block.text.includes("Laktosefri letmælk"),
        ),
      );
    }
    return response.structuredContent;
  };
  await step("list_tools", async () => {
    const { tools } = await client.listTools();
    const renderer = tools.find((tool) => tool.name === "show_product_review");
    assert.equal(
      z
        .object({ ui: z.object({ resourceUri: z.string() }) })
        .parse(renderer?._meta).ui.resourceUri,
      PRODUCT_VIEWER_RESOURCE_URI,
    );
    assert.ok(tools.some((tool) => tool.name === "find_groceries"));
  });
  const productId = await step("search", async () => {
    const value = z
      .object({
        result: z.array(
          z.object({ id: z.number(), name: z.string(), brand: z.string() }),
        ),
      })
      .parse(
        await call("find_groceries", {
          search_term: "laktosefri mælk",
          result_count: 1,
        }),
      );
    const milk = value.result.find(
      (item) => item.name === "Laktosefri letmælk" && item.brand === "Journey",
    );
    assert.ok(milk);
    return milk.id;
  });
  const checkReview = (value: unknown, quantity: number) => {
    const { review } = z
      .object({
        review: z.object({
          draftId: z.uuid(),
          reviewContextId: z.uuid(),
          items: z.array(
            z.object({ product_id: z.number(), quantity: z.number() }),
          ),
        }),
      })
      .parse(value);
    assert.deepEqual(review.items, [{ product_id: productId, quantity }]);
    return {
      draft_id: review.draftId,
      review_context_id: review.reviewContextId,
    };
  };
  const target = await step("create_draft", async () =>
    checkReview(
      await call("start_product_review", {
        items: [{ product_id: productId, quantity: 1 }],
      }),
      1,
    ),
  );
  await step("open_draft", async () =>
    assert.deepEqual(
      checkReview(await call("show_product_review", target), 1),
      target,
    ),
  );
  await step("read_viewer", async () => {
    const { contents } = await client.readResource({
      uri: PRODUCT_VIEWER_RESOURCE_URI,
    });
    const viewer = contents.find(
      (content) => content.uri === PRODUCT_VIEWER_RESOURCE_URI,
    );
    assert.ok(
      viewer &&
        viewer.mimeType === PRODUCT_VIEWER_MIME_TYPE &&
        "text" in viewer &&
        viewer.text.includes("nemlig-viewer-shell") &&
        viewer.text.includes(`const assetOrigin = "${expectedOrigin}";`),
    );
  });
  const edited = await step("edit_quantity", async () => {
    const result = checkReview(
      await call("update_product_review_conversation", {
        ...target,
        action: { kind: "quantity", product_id: productId, quantity: 2 },
      }),
      2,
    );
    assert.equal(result.draft_id, target.draft_id);
    return result;
  });
  await step("reopen_draft", async () =>
    assert.deepEqual(
      checkReview(await call("show_product_review", edited), 2),
      edited,
    ),
  );
}
