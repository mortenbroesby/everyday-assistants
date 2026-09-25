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
  return { calls, get, controls, openai, windowListeners, expireTimers(delay: number) { for (const [id, timer] of timers) if (timer.delay === delay) { timers.delete(id); timer.callback(); } } };
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
