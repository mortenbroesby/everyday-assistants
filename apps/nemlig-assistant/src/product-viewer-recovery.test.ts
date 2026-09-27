import assert from "node:assert/strict";
import test from "node:test";
import { Script } from "node:vm";
import { renderProductViewerHtml } from "./product-viewer.js";

interface FakeEvent { detail?: unknown; target?: FakeNode; preventDefault(): void }
class FakeNode {
  children: FakeNode[] = [];
  listeners = new Map<string, Array<(event: FakeEvent) => void>>();
  textContent = "";
  hidden = false;
  disabled = false;
  open = false;
  checked = false;
  value = "";
  type = "";
  className = "";
  name = "";
  id = "";
  src = "";
  alt = "";
  required = false;
  maxLength = 0;
  htmlFor = "";
  attributes = new Map<string, string>();
  constructor(readonly tagName = "div") {}
  append(...nodes: FakeNode[]): void { for (const node of nodes) node.parent = this; this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]): void { this.children = [...nodes]; this.textContent = ""; }
  addEventListener(name: string, listener: (event: FakeEvent) => void): void {
    const registered = this.listeners.get(name) ?? []; registered.push(listener); this.listeners.set(name, registered);
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  replaceWith(node: FakeNode): void { this.parent?.replaceChild(this, node); }
  parent?: FakeNode;
  replaceChild(oldNode: FakeNode, newNode: FakeNode): void {
    const index = this.children.indexOf(oldNode); if (index >= 0) { newNode.parent = this; this.children[index] = newNode; }
  }
  get text(): string { return [this.textContent, ...this.children.map(child => child.text)].filter(Boolean).join(" "); }
  queryAll(tag: string): FakeNode[] {
    return [...(this.tagName === tag ? [this] : []), ...this.children.flatMap(child => child.queryAll(tag))];
  }
  async click(): Promise<void> {
    if (this.disabled) return;
    for (const listener of this.listeners.get("click") ?? []) listener({ target: this, preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
  }
}

const product = (id: number, name: string) => ({
  context: "review", status: "complete", product: {
    id, name, price: 10, unit_price: 10, unit: "10 kr/kg", unit_size: "1 kg", category: "Mad", subcategory: "",
    currency: "DKK", brand: "Test", description: "", declaration: "", details: [], labels: [], available: true,
    is_organic: false, is_frozen: false, is_on_discount: false, tags: [],
  }, review: { kind: "review", quantity: 3, approved: false },
});
const snapshot = (reviewId: string, revision: number, state: "needs-review" | "basket" = "needs-review") => ({
  review: {
    review_id: reviewId, revision, destination: state, items: [{ product_id: 41, quantity: 3, state, view: product(41, "Current milk draft") }],
  },
});

type ToolCall = { name: string; args: Record<string, unknown> };
function mount(toolOutput: unknown, respond: (call: ToolCall) => unknown | Promise<unknown>, rpcHost = false) {
  const nodes = new Map<string, FakeNode>();
  const get = (id: string) => { if (!nodes.has(id)) nodes.set(id, new FakeNode()); return nodes.get(id)!; };
  const calls: ToolCall[] = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let nextTimer = 0;
  const windowListeners = new Map<string, Array<(event: FakeEvent) => void>>();
  const parent = { postMessage(message: { jsonrpc: string; id?: string; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } }) {
    if (!rpcHost || message.id === undefined) return;
    const emit = (data: unknown) => { for (const listener of windowListeners.get("message") ?? []) listener({ source: parent, detail: undefined, target: undefined, preventDefault() {}, ...({ data } as object) } as FakeEvent); };
    if (message.method === "ui/initialize") emit({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2026-01-26" } });
    if (message.method === "tools/call") {
      const call = { name: message.params!.name!, args: message.params!.arguments! };
      calls.push(call);
      void Promise.resolve().then(() => respond(call)).then(
        result => emit({ jsonrpc: "2.0", id: message.id, result }),
        error => emit({ jsonrpc: "2.0", id: message.id, error: { message: error instanceof Error ? error.message : String(error) } }),
      );
    }
  } };
  const openai = {
    toolOutput,
    async callTool(name: string, args: Record<string, unknown>) { const call = { name, args }; calls.push(call); return respond(call); },
    setWidgetState() {},
  };
  const document = {
    getElementById: get,
    createElement: (tag: string) => new FakeNode(tag),
    querySelectorAll: (selector: string) => selector === "button" ? [...nodes.values()].flatMap(node => node.queryAll("button")) : [],
  };
  const context = {
    document, window: { parent, openai, addEventListener(name: string, fn: (event: FakeEvent) => void) {
      const registered = windowListeners.get(name) ?? []; registered.push(fn); windowListeners.set(name, registered);
    } },
    setTimeout: (callback: () => void, delay = 0) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id: number) => { timers.delete(id); }, Map, Set, URL,
  };
  const script = renderProductViewerHtml().split("<script>")[1]!.split("</script>")[0]!;
  new Script(script).runInNewContext(context);
  const controls = (label: RegExp) => [...nodes.values()].flatMap(node => node.queryAll("button")).find(button => label.test(button.text));
  return { calls, get, controls, openai, parent, windowListeners, expireTimers(delay: number) { for (const [id, timer] of timers) if (timer.delay === delay) { timers.delete(id); timer.callback(); } } };
}

const reviewOutput = snapshot("old-review", 6);

test("host review payload stays inert until explicit Open current review activation", async () => {
  const app = mount(reviewOutput, () => snapshot("active-review", 2));
  assert.equal(app.calls.length, 0, "receiving historical review state must not hydrate or call tools");
  assert.ok(app.controls(/Open current review/i), "host review payload offers an explicit activation control");
  assert.equal(app.controls(/Add selected|Remove|Change product/i), undefined, "stale editing controls are withheld before activation");
  await app.controls(/Open current review/i)!.click();
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls)), [{ name: "update_product_review", args: { action: { kind: "show" } } }]);
  assert.match(app.get("products").text, /Current milk draft/u, "the confirmed current draft is rendered after activation");
});

test("stale active revision refreshes once without replaying edit and clears selection", async () => {
  let reads = 0;
  const app = mount(reviewOutput, call => {
    if (call.args.action && (call.args.action as { kind?: string }).kind === "show") { reads++; return snapshot("fresh-review", 8); }
    return { isError: true, content: [{ type: "text", text: "Error code: INVALID_ARGUMENT; Error: RuntimeException - Review revision is stale. Refresh before trying this action again. private detail" }] };
  });
  await app.controls(/Open current review/i)!.click();
  const checkbox = [...app.get("products").queryAll("input")][0]!;
  checkbox.checked = true;
  for (const listener of checkbox.listeners.get("change") ?? []) listener({ target: checkbox, preventDefault() {} });
  await app.controls(/Add selected to local Basket/i)!.click();
  assert.equal(app.calls.filter(call => call.name === "update_product_review").length, 3, "open, failed edit, and one read-only refresh");
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls[2])), { name: "update_product_review", args: { action: { kind: "show" } } });
  assert.equal(reads, 2, "one explicit open and one recovery read");
  assert.match(app.get("products").text, /Current milk draft/u);
  assert.doesNotMatch(app.get("status").text, /INVALID_ARGUMENT|private detail/u);
  assert.equal([...app.get("products").queryAll("input")][0]?.checked, false, "the refreshed draft clears old selection");
});

test("unknown, timed out, and service failures leave stale editing disabled", async t => {
  for (const scenario of ["unknown", "timeout", "service"] as const) await t.test(scenario, async () => {
    const app = mount(reviewOutput, () => scenario === "timeout" ? new Promise(() => {}) : (() => { throw new Error(scenario === "unknown" ? "INVALID_ARGUMENT: unknown review" : "Service Unavailable: internal trace"); })());
    await app.controls(/Open current review/i)!.click();
    if (scenario === "timeout") { app.expireTimers(20_000); await new Promise(resolve => setImmediate(resolve)); }
    assert.equal(app.calls.length, 1, "no stale edits or automatic retries follow a failed open");
    assert.equal(app.controls(/Add selected to local Basket|Remove|Change product/i), undefined);
    assert.match(app.get("status").text, /review|refresh|unavailable|connect/i);
    assert.doesNotMatch(app.get("status").text, /internal trace|INVALID_ARGUMENT/i);
  });
});

test("restarting an unavailable historical review preserves quantities without restoring acceptance", async () => {
  let showCalls = 0;
  const historical = snapshot("old-review", 6, "basket");
  const app = mount(historical, call => {
    if (call.args.action && (call.args.action as { kind?: string }).kind === "show") { showCalls++; return { unavailable: true }; }
    if (call.name === "start_product_review") return snapshot("restarted-review", 1);
    return { unavailable: true };
  });
  assert.equal(app.calls.length, 0, "receiving an old review must not recover automatically");
  await app.controls(/Open current review/i)!.click();
  assert.equal(showCalls, 1);
  assert.ok(app.controls(/Start new review/i));
  await app.controls(/Start new review/i)!.click();
  const restart = app.calls.find(call => call.name === "start_product_review");
  assert.deepEqual(JSON.parse(JSON.stringify(restart?.args)), { items: [{ product_id: 41, quantity: 3 }] }, "restart retains quantities and excludes prior acceptance state");
  assert.match(app.get("products").text, /Current milk draft/u);
});

test("duplicate unavailable host output keeps explicit safe restart visible", async () => {
  const app = mount(reviewOutput, () => ({ unavailable: true }));
  await app.controls(/Open current review/i)!.click();
  assert.ok(app.controls(/Start new review/i));
  for (const listener of app.windowListeners.get("message") ?? []) listener({
    source: app.parent, detail: undefined, preventDefault() {},
    data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { unavailable: true } },
  } as FakeEvent);
  assert.ok(app.controls(/Start new review/i));
  assert.equal(app.controls(/Open current review/i), undefined);
});


test("a host globals update gates historical review data again", async () => {
  const app = mount(reviewOutput, () => snapshot("active-review", 2));
  await app.controls(/Open current review/i)!.click();
  assert.match(app.get("products").text, /Current milk draft/u);
  const external = snapshot("another-old-review", 4, "basket");
  for (const listener of app.windowListeners.get("openai:set_globals") ?? []) listener({
    detail: { globals: { toolOutput: external } }, preventDefault() {},
  });
  assert.equal(app.calls.length, 1, "an external payload cannot trigger another hydration call");
  assert.ok(app.controls(/Open current review/i), "the later host snapshot returns the viewer to its activation gate");
  assert.equal(app.controls(/Move to Needs review|Remove|Change product/i), undefined, "historical review controls are hidden again");
});

test("a matching host result keeps an explicitly opened frame active and ignores stale revisions", async () => {
  const current = snapshot("active-review", 3, "basket");
  const app = mount(reviewOutput, () => current);
  await app.controls(/Open current review/i)!.click();
  assert.ok(app.controls(/Needs review/i));
  for (const listener of app.windowListeners.get("message") ?? []) listener({
    source: app.parent,
    detail: undefined,
    preventDefault() {},
    data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: current },
  } as FakeEvent);
  assert.equal(app.controls(/Open current review/i), undefined, "same-review host output must not collapse the mounted card");
  assert.ok(app.controls(/Needs review/i));
  for (const listener of app.windowListeners.get("openai:set_globals") ?? []) listener({
    detail: { globals: { toolOutput: snapshot("active-review", 2) } }, preventDefault() {},
  });
  assert.equal(app.get("title").textContent, "Basket", "a delayed older result must not overwrite the confirmed destination");
  assert.equal(app.controls(/Open current review/i), undefined);
});

test("Basket navigation and Clear Basket stay in one active local review", async () => {
  const basket = snapshot("active-review", 4, "basket");
  const needs = snapshot("active-review", 3);
  const cleared = snapshot("active-review", 5);
  const app = mount(reviewOutput, call => {
    const action = call.args.action as { kind?: string; destination?: string };
    if (action?.kind === "show") return needs;
    if (action?.kind === "navigate") return basket;
    if (action?.kind === "revisit") return cleared;
    throw new Error("Unexpected tool call");
  });
  await app.controls(/Open current review/i)!.click();
  await app.controls(/^Basket \(0\)$/i)!.click();
  assert.equal(app.get("title").textContent, "Basket");
  assert.equal(app.controls(/Open current review/i), undefined);
  await app.controls(/Clear local Basket/i)!.click();
  assert.equal(app.calls.length, 2, "opening a local confirmation does not mutate a basket");
  await app.controls(/Move all to Needs review/i)!.click();
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls[2])), {
    name: "update_product_review",
    args: { review_id: "active-review", revision: 4, action: { kind: "revisit", product_ids: [41] } },
  });
  assert.equal(app.controls(/Open current review/i), undefined);
  assert.equal(app.get("title").textContent, "Needs review");
  assert.equal(app.calls.some(call => call.name === "submit_product_review"), false);
});

test("same-review navigation keeps compatible selection and disclosure state", async () => {
  const needs = snapshot("active-review", 2);
  const basket = { review: { ...needs.review, revision: 3, destination: "basket" } };
  const back = { review: { ...needs.review, revision: 4 } };
  const app = mount(reviewOutput, call => {
    const action = call.args.action as { kind?: string; destination?: string };
    if (action?.kind === "show") return needs;
    if (action?.destination === "basket") return basket;
    if (action?.destination === "needs-review") return back;
    throw new Error("Unexpected tool call");
  });
  await app.controls(/Open current review/i)!.click();
  const checkbox = app.get("products").queryAll("input")[0]!;
  checkbox.checked = true;
  for (const listener of checkbox.listeners.get("change") ?? []) listener({ target: checkbox, preventDefault() {} });
  const details = app.get("products").queryAll("details")[0]!;
  details.open = true;
  for (const listener of details.listeners.get("toggle") ?? []) listener({ target: details, preventDefault() {} });
  await app.controls(/^Basket \(0\)$/i)!.click();
  await app.controls(/^Needs review \(1\)$/i)!.click();
  assert.equal(app.get("products").queryAll("input")[0]!.checked, true);
  assert.equal(app.get("products").queryAll("details")[0]!.open, true);
  assert.equal(app.controls(/Open current review/i), undefined);
});

test("viewer submission requires a separate exact confirmation after preparation", async () => {
  const basket = snapshot("active-review", 2, "basket");
  const prepared = { review: { ...basket.review, revision: 3, submission: {
    submission_id: "prepared-id", status: "prepared", expires_at: "2099-01-01T00:00:00Z",
    review: { lines: [{ product_id: 41, quantity: 3, name: "Current milk draft", item_price: 10, line_total: 30 }], expected_products_price: 30 },
  } } };
  const submitted = { review: { ...prepared.review, revision: 4, submission: { ...prepared.review.submission, status: "submitted" } } };
  const app = mount(reviewOutput, call => {
    if (call.name === "submit_product_review") return submitted;
    const action = call.args.action as { kind?: string };
    if (action?.kind === "show") return basket;
    if (action?.kind === "prepare_submission") return prepared;
    throw new Error("Unexpected tool call");
  });
  await app.controls(/Open current review/i)!.click();
  await app.controls(/^Update Nemlig basket$/i)!.click();
  assert.equal(app.calls.some(call => call.name === "submit_product_review"), false, "preparing never submits");
  assert.match(app.get("submission").text, /30\.00 kr/u);
  assert.equal(app.calls.some(call => call.name === "submit_product_review"), false, "showing confirmation never submits");
  await app.controls(/^Cancel$/i)!.click();
  assert.equal(app.calls.some(call => call.name === "submit_product_review"), false, "cancel never submits");
  await app.controls(/^Review prepared update$/i)!.click();
  await app.controls(/Confirm update to Nemlig/i)!.click();
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.find(call => call.name === "submit_product_review"))), {
    name: "submit_product_review", args: { review_id: "active-review", revision: 3, submission_id: "prepared-id" },
  });
  assert.match(app.get("submission").text, /Submitted to Nemlig/u);
  assert.equal(app.controls(/Confirm update to Nemlig/i), undefined);
});

test("uncertain submission never retries and removes the UI confirmation", async () => {
  const basket = snapshot("active-review", 2, "basket");
  const prepared = { review: { ...basket.review, revision: 3, submission: {
    submission_id: "prepared-id", status: "prepared", expires_at: "2099-01-01T00:00:00Z",
    review: { lines: [{ product_id: 41, quantity: 3, name: "Current milk draft", item_price: 10, line_total: 30 }], expected_products_price: 30 },
  } } };
  const uncertain = { review: { ...prepared.review, revision: 4, submission: { ...prepared.review.submission, status: "uncertain" } } };
  let shows = 0;
  const app = mount(reviewOutput, call => {
    if (call.name === "submit_product_review") throw new Error("provider response lost");
    const action = call.args.action as { kind?: string };
    if (action?.kind === "show") return ++shows === 1 ? basket : uncertain;
    if (action?.kind === "prepare_submission") return prepared;
    throw new Error("Unexpected tool call");
  });
  await app.controls(/Open current review/i)!.click();
  await app.controls(/^Update Nemlig basket$/i)!.click();
  await app.controls(/Confirm update to Nemlig/i)!.click();
  assert.equal(app.calls.filter(call => call.name === "submit_product_review").length, 1);
  assert.equal(shows, 2, "one read-only outcome check is allowed after uncertain submission");
  assert.match(app.get("submission").text, /Check Nemlig before trying again/u);
  assert.equal(app.controls(/Confirm update to Nemlig/i), undefined);
  assert.match(app.get("status").text, /do not retry automatically/u);
});

test("a JSON-RPC thrown stale edit refreshes once and never replays the edit", async () => {
  const error = new Error("Error code: INVALID_ARGUMENT; Error: RuntimeException - Review revision is stale. Refresh before trying this action again. private detail");
  const app = mount(reviewOutput, call => {
    if ((call.args.action as { kind?: string } | undefined)?.kind === "show") return snapshot("active-review", 2);
    throw error;
  }, true);
  await app.controls(/Open current review/i)!.click();
  const checkbox = [...app.get("products").queryAll("input")][0]!;
  checkbox.checked = true;
  for (const listener of checkbox.listeners.get("change") ?? []) listener({ target: checkbox, preventDefault() {} });
  await app.controls(/Add selected to local Basket/i)!.click();
  assert.equal(app.calls.length, 3, "explicit show, one edit, and one read-only refresh");
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls[2])), { name: "update_product_review", args: { action: { kind: "show" } } });
  assert.doesNotMatch(app.get("status").text, /INVALID_ARGUMENT|private detail/u);
});

test("submitted or uncertain historical reviews cannot restart and show basket inspection guidance", async t => {
  for (const status of ["submitted", "uncertain"] as const) await t.test(status, async () => {
    const base = snapshot("old-review", 6, "basket");
    const historical = {
      ...base,
      review: {
        ...base.review,
        submission: {
          submission_id: "submission-reference",
          status,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          review: { lines: [{ product_id: 41, quantity: 3 }], expected_products_price: 30 },
        },
      },
    };
    const app = mount(historical, call => call.args.action ? { unavailable: true } : { unavailable: true });
    await app.controls(/Open current review/i)!.click();
    assert.equal(app.calls.length, 1, "only explicit read-only recovery is allowed");
    assert.equal(app.controls(/Start new review/i), undefined, "an old submitted or uncertain draft cannot seed another submission");
    assert.match(app.get("products").text, /Check your actual Nemlig basket in conversation/u);
    assert.equal(app.controls(/Add selected|Remove|Change product/i), undefined);
  });
});
