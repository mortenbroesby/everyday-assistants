import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readPickerPayload } from "./contract.js";
import { advancePicker, bindPickerHost, openPickerChoices, pickerModelContext } from "./session.js";

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
    if (presentation === "list") { assert.match(html, /type="checkbox"/); assert.match(html, /tell ChatGPT to add, remove, or adjust/); assert.match(html, /2 l/); }
    if (presentation === "proposal") { assert.match(html, /tell ChatGPT what to change/); assert.match(html, /optional/i); assert.match(html, /Choose alternatives/); assert.match(html, /Continue to final review/); }
    if (presentation === "choices") { assert.match(html, /tell ChatGPT what you need/); assert.match(html, /1 choice/); assert.match(html, /Use these choices/); }
    if (presentation === "recap") assert.match(html, /tell ChatGPT what to adjust before a fresh recap/);
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

test("product-backed stages traverse locally while discovery remains a coalesced host message", async () => {
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
  const proposal = readPickerPayload({ structuredContent: { presentation: "proposal", items: [item, { ...item, ingredient: "bread", product: { id: 9, name: "Bread", available: true }, alternatives: [] }], rejected: [{ ingredient: "basil", reason: "No match" }], journey } })!;
  assert.equal(proposal.presentation, "proposal");
  if (proposal.presentation !== "proposal") return;
  const choicesView = openPickerChoices(proposal, 0);
  assert.equal(choicesView?.presentation, "choices");
  const changedRecap = advancePicker(choicesView!, { 0: 8 }, proposal);
  assert.equal(changedRecap?.presentation, "recap");
  assert.deepEqual(changedRecap?.items.map(({ ingredient, product, changed }) => ({ ingredient, product: product.id, changed })), [
    { ingredient: "milk", product: 8, changed: true },
    { ingredient: "bread", product: 9, changed: false },
  ]);
  assert.deepEqual(changedRecap?.rejected, proposal.rejected);
  assert.equal(changedRecap?.journey?.choices?.items[0]?.product, 8, "Back must restore the selected replacement");
  assert.deepEqual(pickerModelContext(choicesView!, { 0: 8 }, {}), {
    stage: "choices",
    list: journey.list,
    items: [
      { ingredient: "milk", product: 8, quantity: 2, changed: true },
      { ...journey.proposal!.items[1], favorite_match: false, changed: false },
    ],
    rejected: ["basil"],
  });
  const directRecap = advancePicker(proposal, {}, proposal);
  assert.equal(directRecap?.presentation, "recap");
  assert.equal(directRecap?.journey?.previous, "proposal");
  assert.equal(directRecap?.items[0]?.confidence, 90);
  const fallback = binding.sendNavigation(choicesView!, "next", { 0: 8 }, {});
  assert.equal(messages.length, 2, "an independently rendered product stage must retain a conversational fallback");
  assert.match(messages[1]!, /"presentation":"recap"/);
  assert.match(messages[1]!, /"previous":"choices"/);
  assert.match(messages[1]!, /Do not read or change the basket/);
  resolve!(); await fallback;
});
