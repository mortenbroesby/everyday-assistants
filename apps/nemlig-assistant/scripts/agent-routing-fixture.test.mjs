import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import test from "node:test";
import process from "node:process";
import { setTimeout, clearTimeout } from "node:timers";
import { URL } from "node:url";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

for (const mode of ["active", "expired", "selection"]) {
  const expired = mode === "expired";
  const selection = mode === "selection";
  test(
    `routing fixture protects ${mode} state and blocks provider access`,
    {
      timeout: 30000,
    },
    async () => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/agent-routing-fixture.ts",
          ...(expired ? ["--expired-draft"] : []),
          ...(selection ? ["--selection-case", "milk-qualifier"] : []),
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const exited = once(child, "exit");
      const deadline = setTimeout(() => child.kill("SIGKILL"), 25000);
      const lines = createInterface({ input: child.stdout });
      const records = [];
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      let ready;
      const readiness = new Promise((resolve, reject) => {
        ready = resolve;
        child.once("error", reject);
        child.once("exit", () =>
          reject(new Error("Fixture exited before readiness: " + stderr)),
        );
      });
      lines.on("line", (line) => {
        const record = JSON.parse(line);
        records.push(record);
        if (record.url) {
          ready(record);
        }
      });
      const client = new Client({
        name: "routing-fixture-check",
        version: "1",
      });
      try {
        const { url, expiredDraft } = await readiness;
        assert.equal(new URL(url).hostname, "127.0.0.1");
        await client.connect(new StreamableHTTPClientTransport(new URL(url)));
        if (selection) {
          const found = await client.callTool({
            name: "find_groceries",
            arguments: { search_term: "laktosefri mælk", result_count: 5 },
          });
          assert.notEqual(found.isError, true);
          const rows = found.structuredContent.result;
          assert.deepEqual(
            rows.map((row) => row.id),
            [901001, 901002, 901003, 901004, 901005],
          );
          assert.equal(rows[0].labels.includes("Laktosefri"), false);
          assert.equal(rows[3].subcategory, "Slik");
          assert.equal(rows[3].labels.includes("Laktosefri"), true);
          assert.equal(rows[4].labels.includes("Laktosefri"), true);
          const draft = await client.callTool({
            name: "show_product_review",
            arguments: {},
          });
          assert.equal(draft.structuredContent.unavailable, true);
        } else if (expired) {
          assert.ok(expiredDraft?.draftId);
          assert.ok(expiredDraft?.reviewContextId);
          const shown = await client.callTool({
            name: "show_product_review",
            arguments: {
              draft_id: expiredDraft.draftId,
              review_context_id: expiredDraft.reviewContextId,
            },
          });
          assert.equal(shown.isError, true);
          assert.equal(shown.structuredContent?.review, undefined);
          assert.match(JSON.stringify(shown.content), /unavailable/iu);
        } else {
          const seeded = await client.callTool({
            name: "start_product_review",
            arguments: { items: [{ product_id: 900001, quantity: 1 }] },
          });
          assert.notEqual(seeded.isError, true);
          const expected = seeded.structuredContent.review;
          const shown = await client.callTool({
            name: "show_product_review",
            arguments: {
              view: "draft",
              draft_id: expected.draftId,
              review_context_id: expected.reviewContextId,
            },
          });
          assert.equal(
            shown.structuredContent.review.draftId,
            expected.draftId,
          );
          assert.equal(
            shown.structuredContent.review.reviewContextId,
            expected.reviewContextId,
          );
          assert.deepEqual(
            shown.structuredContent.review.items,
            expected.items,
          );
          const missing = await client.callTool({
            name: "show_product_review",
            arguments: { view: "draft" },
          });
          assert.equal(missing.structuredContent.unavailable, true);
          const guidance = missing.content
            .filter((item) => item.type === "text")
            .map((item) => item.text)
            .join("\n");
          assert.match(guidance, /draft_id.*review_context_id/u);
          assert.match(guidance, /do not infer expiry/iu);
          const recovered = await client.callTool({
            name: "show_product_review",
            arguments: {
              draft_id: expected.draftId,
              review_context_id: expected.reviewContextId,
            },
          });
          assert.deepEqual(
            recovered.structuredContent.review.items,
            expected.items,
          );
          assert.equal(
            recovered.structuredContent.review.draftId,
            expected.draftId,
          );
          const invalid = await client.callTool({
            name: "show_product_review",
            arguments: {
              draft_id: "00000000-0000-4000-8000-000000000001",
              review_context_id: "00000000-0000-4000-8000-000000000002",
            },
          });
          assert.equal(invalid.isError, true);
          const invalidGuidance = invalid.content
            .filter((item) => item.type === "text")
            .map((item) => item.text)
            .join("\n");
          assert.match(invalidGuidance, /unavailable/iu);
          assert.doesNotMatch(
            invalidGuidance,
            /expired|refresh the exact list/iu,
          );
        }
        const forbidden = await client.callTool({
          name: "show_my_basket",
          arguments: {},
        });
        assert.equal(forbidden.isError, true);
      } finally {
        await client.close();
        child.kill("SIGTERM");
        await exited;
        clearTimeout(deadline);
        lines.close();
      }
      const stopped = records.find((record) => record.event === "stopped");
      assert.deepEqual(stopped.counts, {
        searches: selection ? 1 : 0,
        details: selection ? 5 : 1,
        forbidden: 1,
      });
    },
  );
}
