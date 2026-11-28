import console from "node:console";
import { URL } from "node:url";
// Deterministic control for the widget handoff when a model trial fails.
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { verifyConversationWidget } from "./conversation-widget.mjs";

import { withConversationFixture } from "./conversation-fixture.mjs";

await withConversationFixture(async ({ url }) => {
  const client = new Client({ name: "conversation-control", version: "1" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
    const started = await client.callTool({
      name: "start_product_review",
      arguments: { items: [{ product_id: 900001, quantity: 1 }] },
    });
    const { draftId, reviewContextId } = started.structuredContent.review;
    const result = await client.callTool({
      name: "show_product_review",
      arguments: { draft_id: draftId, review_context_id: reviewContextId },
    });
    await verifyConversationWidget({ url, result });
  } finally {
    await client.close();
  }
});
console.log(
  "PASS: built widget displayed the MCP result and persisted its edit on the original draft.",
);
