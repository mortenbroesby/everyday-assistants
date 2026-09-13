import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readPickerPayload } from "./contract.js";
import { bindPickerHost } from "./session.js";

// Node renders the component contract; Vite and the browser verify real styling.
registerHooks({ load(url, context, nextLoad) {
  return url.endsWith(".css") ? { format: "module", source: "export default {}", shortCircuit: true } : nextLoad(url, context);
} });
const { PickerView } = await import("./PickerView.js");
Object.assign(globalThis, { React });

const rows = [{ ingredient: "milk", amount: "2 l", included: true }, { ingredient: "salt", amount: "1 pinch", included: false }];
const item = { ingredient: "milk", quantity: 2, confidence: 90, changed: false, product: { id: 7, name: "Milk", available: true }, alternatives: [{ id: 8, name: "Organic milk", available: true }] };
const snapshot = { items: [{ ingredient: "milk", search_term: "mælk", product: 7, alternatives: [8], quantity: 2, confidence: 1 }, { ingredient: "bread", search_term: "brød", product: 9, alternatives: [], quantity: 1, confidence: 95 }], pantry_assumptions: ["salt"] };
const journey = { list: rows, proposal: snapshot, choices: { ...snapshot, items: [snapshot.items[0]!] }, previous: "choices" };

test("selection controls have explicit visible browser appearance", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  assert.match(css, /\.picker-list-row input\[type="checkbox"\][^{]*\{[^}]*appearance: auto/u);
  assert.match(css, /\.picker-choice > input\[type="radio"\][^{]*\{[^}]*appearance: none/u);
  assert.match(css, /\.picker-choice > input\[type="radio"\]:checked[^{]*\{[^}]*background: var\(--picker-accent\)/u);
});

test("List is bounded and preserves requested amounts and unchecked rows", () => {
  const list = readPickerPayload({ structuredContent: { presentation: "list", items: [], list: rows } });
  assert.equal(list?.presentation, "list");
  if (list?.presentation !== "list") return;
  assert.deepEqual(list.list, rows);
  assert.equal(readPickerPayload({ structuredContent: { presentation: "list", items: [], list: Array(51).fill(rows[0]) } }), undefined);
  assert.equal(readPickerPayload({ structuredContent: { presentation: "list", items: [item], list: rows } }), undefined);
});

test("all four independent screens render an accessible journey and guarded bottom actions", () => {
  for (const presentation of ["list", "proposal", "choices", "recap"] as const) {
    const payload = readPickerPayload({ structuredContent: presentation === "list" ? { presentation, items: [], list: rows } : { presentation, items: [item], journey } });
    assert.ok(payload);
    const html = renderToStaticMarkup(createElement(PickerView, { payload, choices: { 0: 7 }, onChoice() {}, onSubmit() {}, onBack() {}, onInclude() {}, pending: true }));
    for (const label of ["List", "Proposal", "Choices", "Approve"]) assert.match(html, new RegExp(label));
    assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
    assert.match(html, /picker-flow/);
    assert.match(html, /picker-actions/);
    assert.match(html, /disabled=""/);
    if (presentation === "list") { assert.match(html, /type="checkbox"/); assert.match(html, /2 l/); }
    if (presentation === "proposal") { assert.match(html, /optional/i); assert.match(html, /Continue to final review/); }
    if (presentation === "choices") { assert.match(html, /1 choice/); assert.match(html, /Use these choices/); }
    if (presentation === "recap") assert.match(html, /Nothing has been added yet/);
  }
  const direct = readPickerPayload({ structuredContent: { presentation: "recap", items: [item], journey: { ...journey, previous: "proposal" } } })!;
  const html = renderToStaticMarkup(createElement(PickerView, { payload: direct, choices: {}, onChoice() {}, onSubmit() {}, onBack() {} }));
  assert.match(html, /picker-step-skipped/);
  assert.match(html, /Skipped/);
});

test("separate picker instances use separate radio groups", () => {
  const payload = readPickerPayload({ structuredContent: { presentation: "choices", items: [item], journey } })!;
  const props = { payload, choices: { 0: 7 }, onChoice() {}, onSubmit() {}, onBack() {} };
  const html = renderToStaticMarkup(createElement("div", null, createElement(PickerView, props), createElement(PickerView, props)));
  const groups = [...html.matchAll(/name="([^"]*picker-choice-0)"/g)].map((match) => match[1]);
  assert.equal(new Set(groups).size, 2);
});

test("navigation carries exact bounded state, skips Choices, and coalesces cross-direction sends", async () => {
  const messages: string[] = [];
  let resolve: (() => void) | undefined;
  const binding = bindPickerHost({ sendMessage: ({ content }) => { messages.push(content[0]!.text); return new Promise<void>((done) => { resolve = done; }); } }, () => {});
  const list = readPickerPayload({ structuredContent: { presentation: "list", items: [], list: rows } })!;
  const sent = binding.sendNavigation(list, "next", {}, { 0: false, 1: true });
  await binding.sendNavigation(list, "next", {}, {});
  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /Search only these checked lines: \[{"ingredient":"salt"/);
  assert.match(messages[0]!, /Do not read or change the basket/);
  resolve!(); await sent;
  for (const [presentation, direction, previous, expected] of [
    ["proposal", "back", "proposal", "review_shopping_list"],
    ["proposal", "next", "proposal", '"presentation":"recap"'],
    ["choices", "back", "proposal", '"presentation":"proposal"'],
    ["choices", "next", "proposal", '"previous":"choices"'],
    ["recap", "back", "proposal", '"presentation":"proposal"'],
    ["recap", "back", "choices", '"presentation":"choices"'],
  ] as const) {
    const payload = readPickerPayload({ structuredContent: { presentation, items: [item], journey: { ...journey, previous } } })!;
    const pending = binding.sendNavigation(payload, direction, { 0: 8 });
    await binding.sendNavigation(payload, direction === "next" ? "back" : "next", {});
    assert.ok(messages.at(-1)!.includes(expected), messages.at(-1));
    assert.match(messages.at(-1)!, /Do not read or change the basket/);
    assert.doesNotMatch(messages.at(-1)!, /I approve|add_approved_items/);
    if (direction === "next") {
      const text = messages.at(-1)!;
      const args = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      assert.deepEqual(args.items.map(({ ingredient, product }: { ingredient: string; product: number }) => ({ ingredient, product })), [{ ingredient: "milk", product: presentation === "choices" ? 8 : 7 }, { ingredient: "bread", product: 9 }]);
      if (presentation === "proposal") assert.equal(args.items[0].confidence, 0.01, "normalized 1% must not become 100% when rendered again");
      if (presentation === "choices") assert.equal(args.journey.choices.items[0].product, 8, "Approve Back must restore the radio choice that was submitted");
      assert.equal(args.items[0].search_term, "mælk");
    }
    resolve!(); await pending;
  }
});
