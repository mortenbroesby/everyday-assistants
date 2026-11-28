import assert from "node:assert/strict";
import test from "node:test";
import { checkProvider } from "./local-provider-check.ts";

const responses = [
  { status: "connected" },
  { result: [{ id: 42, name: "Banan", price: 2.5 }] },
  { items: [] },
];

test("requires a live connection, priced candidate and basket including an empty basket", async () => {
  const calls = [];
  const report = await checkProvider(async (name) => {
    calls.push(name);
    return { structuredContent: responses[calls.length - 1] };
  });
  assert.deepEqual(calls, [
    "check_nemlig_connection",
    "find_groceries",
    "show_my_basket",
  ]);
  assert.deepEqual(report, calls);
});

test("stops at first unsuccessful stage and redacts private details", async () => {
  for (const [index, replacement] of [
    [0, { status: "connection_required" }],
    [1, { result: [{ id: 42, name: "private" }] }],
    [2, { items: null }],
  ]) {
    let calls = 0;
    await assert.rejects(
      checkProvider(async () => {
        const current = calls++;
        return {
          structuredContent:
            current === index ? replacement : responses[current],
        };
      }),
      {
        message: [
          "check_nemlig_connection",
          "find_groceries",
          "show_my_basket",
        ][index],
      },
    );
    assert.equal(calls, index + 1);
  }
});
