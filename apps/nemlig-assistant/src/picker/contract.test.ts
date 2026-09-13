import assert from "node:assert/strict";
import test from "node:test";
import { pickerProductEvidence, readPickerPayload, safePickerImageUrl } from "./contract.js";
import { safeAreaStyle } from "./PickerFrame.js";
import { bindPickerHost, type PickerHost } from "./session.js";

test("picker reads structured content before a JSON text fallback and rejects unsafe images", () => {
  const structured = { items: [{ ingredient: "mælk", quantity: 1, confidence: 95, product: { id: 7, available: true, description: "Frisk", declaration: "MÆLK", details: [{ key: "Fedt", value: "1,5 %" }] } }] };
  const fallback = { items: [{ ingredient: "brød", quantity: 2, confidence: 80, product: { id: 8, available: true } }] };
  assert.equal(readPickerPayload({ structuredContent: structured, content: [{ type: "text", text: JSON.stringify(fallback) }] })?.items[0]?.ingredient, "mælk");
  assert.deepEqual(readPickerPayload({ structuredContent: structured })?.items[0]?.product, structured.items[0]!.product);
  const nineAlternatives = Array.from({ length: 9 }, (_, index) => ({ id: index + 10, available: true }));
  assert.equal(readPickerPayload({ structuredContent: { items: [{ ...structured.items[0], alternatives: nineAlternatives }] } })?.items[0]?.alternatives?.length, 9);
  assert.equal(readPickerPayload({ structuredContent: { items: [{ ...structured.items[0], alternatives: [...nineAlternatives, { id: 99, available: true }] }] } }), undefined);
  assert.equal(readPickerPayload({ content: [{ type: "text", text: JSON.stringify(fallback) }] })?.items[0]?.ingredient, "brød");
  assert.equal(readPickerPayload({ content: [{ type: "text", text: "not json" }] }), undefined);
  assert.equal(readPickerPayload({ structuredContent: { items: Array.from({ length: 50 }, () => structured.items[0]) } })?.items.length, 50);
  assert.equal(readPickerPayload({ structuredContent: { items: Array.from({ length: 51 }, () => structured.items[0]) } }), undefined);
  assert.equal(readPickerPayload({ structuredContent: { items: [{ ...structured.items[0], quantity: 1.5 }] } }), undefined);
  assert.equal(readPickerPayload({ structuredContent: { items: [{ ...structured.items[0], confidence: 101 }] } }), undefined);
  assert.equal(safePickerImageUrl("https://nemlig.com/scommerce/images/milk.jpg"), "https://nemlig.com/scommerce/images/milk.jpg");
  assert.equal(safePickerImageUrl("javascript:alert(1)"), undefined);
});

test("picker accepts nine alternatives and exposes only populated evidence sections", () => {
  const alternatives = Array.from({ length: 9 }, (_, index) => ({
    id: index + 10, name: `Alternativ ${index + 1}`, available: true,
  }));
  const payload = readPickerPayload({ structuredContent: { items: [{
    ingredient: "mælk", quantity: 1, confidence: 80,
    product: { id: 7, name: "Letmælk", available: true, declaration: "MÆLK" },
    alternatives,
  }] } });
  assert.equal(payload?.items[0]?.alternatives?.length, 9);
  assert.deepEqual(pickerProductEvidence(payload!.items[0]!.product), [{ label: "Varedeklaration", text: "MÆLK" }]);
});

test("picker accepts the three shopping-flow presentations and changed recap lines", () => {
  const item = {
    ingredient: "mælk", quantity: 1, confidence: 80, changed: true,
    product: { id: 7, name: "Letmælk", available: true },
  };
  assert.equal(readPickerPayload({ structuredContent: { items: [item] } })?.presentation, "proposal");
  assert.equal(readPickerPayload({ structuredContent: { presentation: "choices", items: [item] } })?.presentation, "choices");
  const recap = readPickerPayload({ structuredContent: { presentation: "recap", items: [item] } });
  assert.equal(recap?.presentation, "recap");
  assert.equal(recap?.items[0]?.changed, true);
  assert.equal(readPickerPayload({ structuredContent: { presentation: "search", items: [item] } }), undefined);
});

test("picker host binding disposes stale callbacks before a remount", async () => {
  const received: unknown[] = [];
  const contexts: unknown[] = [];
  const messages: unknown[] = [];
  const host: PickerHost = {
    sendMessage: async (message) => { messages.push(message); },
  };
  const first = bindPickerHost(host, (result) => received.push(result), (context) => contexts.push(context));
  const staleHandler = host.ontoolresult;
  const staleContextHandler = host.onhostcontextchanged;
  host.ontoolresult?.({ structuredContent: { items: [] } });
  host.onhostcontextchanged?.({ theme: "light" });
  first.dispose();
  staleHandler?.({ stale: true });
  staleContextHandler?.({ theme: "dark" });

  const second = bindPickerHost(host, (result) => received.push(result));
  const selections = [{ ingredient: "mælk", product: 7, quantity: 1 }];
  await second.sendSelections(selections);
  await second.sendApproval(selections);
  assert.deepEqual(messages, [
    { role: "user", content: [{ type: "text", text: 'Use these replacement choices and keep every unchallenged selection unchanged: [{"ingredient":"mælk","product":7,"quantity":1}]. Show one complete final basket recap with review_proposed_basket in recap mode. Do not change the basket.' }] },
    { role: "user", content: [{ type: "text", text: 'I approve this exact final basket recap: [{"ingredient":"mælk","product":7,"quantity":1}]. If I requested any change after this recap was shown, treat this card as obsolete and render a fresh complete recap instead of applying it. Otherwise continue through the protected exact basket-addition review and apply only this unchanged selection. Freshly validate before writing, do not retry an uncertain write, and show the basket readback.' }] },
  ]);
  assert.deepEqual(received, [{ structuredContent: { items: [] } }]);
  assert.deepEqual(contexts, [{ theme: "light" }]);
  second.dispose();
});

test("picker host sends one pending message and recovers after failure", async () => {
  const messages: unknown[] = [];
  let settle: ((value: unknown) => void) | undefined;
  let fail = false;
  const host: PickerHost = {
    sendMessage: (message) => {
      messages.push(message);
      if (fail) return Promise.reject(new Error("send failed"));
      return new Promise((resolve) => { settle = resolve; });
    },
  };
  const binding = bindPickerHost(host, () => undefined);
  const selection = [{ ingredient: "mælk", product: 7, quantity: 1 }];
  const first = binding.sendSelections(selection);
  await binding.sendSelections(selection);
  assert.equal(messages.length, 1);
  settle?.(undefined);
  await first;
  fail = true;
  await assert.rejects(binding.sendApproval(selection), /send failed/);
  fail = false;
  const recovered = binding.sendApproval(selection);
  assert.equal(messages.length, 3);
  settle?.(undefined);
  await recovered;
  binding.dispose();
  await binding.sendApproval(selection);
  assert.equal(messages.length, 3);
});

test("picker frame translates host safe-area insets to CSS variables", () => {
  assert.deepEqual(safeAreaStyle({ top: 7, right: 8, bottom: 9, left: 10 }), {
    "--safe-area-top": "7px",
    "--safe-area-right": "8px",
    "--safe-area-bottom": "9px",
    "--safe-area-left": "10px",
  });
  assert.deepEqual(safeAreaStyle(undefined), {});
});
