import assert from "node:assert/strict";
import test from "node:test";
import { readPickerPayload, safePickerImageUrl } from "./contract.js";
import { createPickerSession, type PickerHost } from "./session.js";

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

test("picker session registers callbacks before connecting, sends once, and ignores callbacks after close", async () => {
  const received: unknown[] = [];
  const themes: string[] = [];
  const messages: unknown[] = [];
  let closed = false;
  let resizeStarted = 0;
  let resizeStopped = 0;
  const host: PickerHost = {
    connect: async () => { assert.equal(typeof host.ontoolresult, "function"); assert.equal(typeof host.onhostcontextchanged, "function"); },
    close: async () => { closed = true; },
    getHostContext: () => ({ theme: "light" }),
    setupSizeChangedNotifications: () => { resizeStarted += 1; return () => { resizeStopped += 1; }; },
    sendMessage: async (message) => { messages.push(message); },
  };
  const session = createPickerSession(host, (result) => received.push(result), (theme) => themes.push(theme));
  await session.connected;
  host.ontoolresult?.({ structuredContent: { items: [] } });
  host.onhostcontextchanged?.({ theme: "dark" });
  await session.sendChoice(7, "mælk");
  assert.deepEqual(messages, [{ role: "user", content: [{ type: "text", text: "Choose product 7 for mælk instead." }] }]);
  assert.deepEqual(received, [{ structuredContent: { items: [] } }]);
  assert.deepEqual(themes, ["light", "dark"]);
  assert.equal(resizeStarted, 1);
  await session.close();
  assert.equal(closed, true);
  assert.equal(resizeStopped, 1);
  host.ontoolresult?.({ stale: true });
  assert.deepEqual(received, [{ structuredContent: { items: [] } }]);
});

test("picker exposes connection failure for the component without retrying", async () => {
  const host: PickerHost = {
    connect: async () => { throw new Error("offline"); },
    close: async () => undefined,
    sendMessage: async () => undefined,
  };
  await assert.rejects(createPickerSession(host, () => undefined, () => undefined).connected, /offline/);
});
