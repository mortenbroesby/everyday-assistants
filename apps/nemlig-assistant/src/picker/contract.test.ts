import assert from "node:assert/strict";
import test from "node:test";
import { readPickerPayload, safePickerImageUrl } from "./contract.js";
import { safeAreaStyle } from "../ui/AppFrame.js";
import { bindPickerHost, type PickerHost } from "./session.js";

test("picker reads structured content before a JSON text fallback and rejects unsafe images", () => {
  const structured = { items: [{ ingredient: "mælk", quantity: 1, confidence: 95, product: { id: 7, available: true } }] };
  const fallback = { items: [{ ingredient: "brød", quantity: 2, confidence: 80, product: { id: 8, available: true } }] };
  assert.equal(readPickerPayload({ structuredContent: structured, content: [{ type: "text", text: JSON.stringify(fallback) }] })?.items[0]?.ingredient, "mælk");
  assert.equal(readPickerPayload({ content: [{ type: "text", text: JSON.stringify(fallback) }] })?.items[0]?.ingredient, "brød");
  assert.equal(readPickerPayload({ content: [{ type: "text", text: "not json" }] }), undefined);
  assert.equal(readPickerPayload({ structuredContent: { items: Array.from({ length: 6 }, () => structured.items[0]) } }), undefined);
  assert.equal(readPickerPayload({ structuredContent: { items: [{ ...structured.items[0], quantity: 1.5 }] } }), undefined);
  assert.equal(readPickerPayload({ structuredContent: { items: [{ ...structured.items[0], confidence: 101 }] } }), undefined);
  assert.equal(safePickerImageUrl("https://nemlig.com/scommerce/images/milk.jpg"), "https://nemlig.com/scommerce/images/milk.jpg");
  assert.equal(safePickerImageUrl("javascript:alert(1)"), undefined);
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
  await second.sendChoice(7, "mælk");
  assert.deepEqual(messages, [{ role: "user", content: [{ type: "text", text: "Choose product 7 for mælk instead." }] }]);
  assert.deepEqual(received, [{ structuredContent: { items: [] } }]);
  assert.deepEqual(contexts, [{ theme: "light" }]);
  second.dispose();
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
