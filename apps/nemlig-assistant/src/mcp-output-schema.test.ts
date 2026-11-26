import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { compactOutputSchema } from "./mcp-output-schema.js";
import { reviewSnapshotSchema } from "./review-schema.js";

test("compact output schema keeps the exact validator and parsed results", async () => {
  const compact = compactOutputSchema(reviewSnapshotSchema);
  assert.equal(
    compact["~standard"].validate,
    reviewSnapshotSchema["~standard"].validate,
  );
  for (const value of [
    { destination: "ready", items: [] },
    { destination: "ready", items: [], extra: true },
    { destination: "unknown", items: [] },
    { destination: "ready", items: [], revision: -1 },
    { destination: "ready", items: [{ product_id: 1, quantity: 0 }] },
  ]) {
    assert.deepEqual(
      await compact["~standard"].validate(value),
      await reviewSnapshotSchema["~standard"].validate(value),
    );
  }
});

test("compact schema uses local definitions and reduces repeated review facts", () => {
  const compact = compactOutputSchema(reviewSnapshotSchema)[
    "~standard"
  ].jsonSchema.output({ target: "draft-2020-12" });
  const inline = z.toJSONSchema(reviewSnapshotSchema, {
    io: "output",
    target: "draft-2020-12",
  });
  assert.ok(
    Buffer.byteLength(JSON.stringify(compact)) <
      Buffer.byteLength(JSON.stringify(inline)) * 0.6,
  );
  const serialized = JSON.stringify(compact);
  assert.match(serialized, /"\$defs"/u);
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") {
      return;
    }
    const object = value as Record<string, unknown>;
    if (typeof object.$ref === "string") {
      assert.ok(object.$ref.startsWith("#/$defs/"));
      const key = object.$ref.slice("#/$defs/".length);
      assert.ok(Object.hasOwn(compact.$defs as object, key));
    }
    for (const child of Object.values(object)) {
      visit(child);
    }
  };
  visit(compact);
});
