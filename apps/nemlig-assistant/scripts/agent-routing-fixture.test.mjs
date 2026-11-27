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

test(
  "routing fixture preserves exact drafts and blocks provider access",
  {
    timeout: 30000,
  },
  async () => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/agent-routing-fixture.ts"],
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
        ready(record.url);
      }
    });
    const client = new Client({ name: "routing-fixture-check", version: "1" });
    try {
      const url = await readiness;
      assert.equal(new URL(url).hostname, "127.0.0.1");
      await client.connect(new StreamableHTTPClientTransport(new URL(url)));
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
      assert.equal(shown.structuredContent.review.draftId, expected.draftId);
      assert.equal(
        shown.structuredContent.review.reviewContextId,
        expected.reviewContextId,
      );
      assert.deepEqual(shown.structuredContent.review.items, expected.items);
      const missing = await client.callTool({
        name: "show_product_review",
        arguments: { view: "draft" },
      });
      assert.equal(missing.structuredContent.unavailable, true);
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
    assert.deepEqual(stopped.counts, { searches: 0, details: 1, forbidden: 1 });
  },
);
