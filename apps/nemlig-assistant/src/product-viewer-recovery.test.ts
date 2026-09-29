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
  reportValidity(): boolean { return true; }
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
const snapshot = (reviewId: string, revision: number, state: "needs-review" | "ready" = "needs-review") => ({
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

test("host review payload stays inert until explicit Open current selection activation", async () => {
  const app = mount(reviewOutput, () => snapshot("active-review", 2));
  assert.equal(app.calls.length, 0, "receiving historical review state must not hydrate or call tools");
  assert.ok(app.controls(/Open current selection/i), "host review payload offers an explicit activation control");
  assert.equal(app.controls(/Add selected|Remove|Change product/i), undefined, "stale editing controls are withheld before activation");
  await app.controls(/Open current selection/i)!.click();
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls)), [{ name: "update_product_review", args: { action: { kind: "show" } } }]);
  assert.match(app.get("products").text, /Current milk draft/u, "the confirmed current draft is rendered after activation");
});

test("stale active revision refreshes once without replaying edit and clears selection", async () => {
  let reads = 0;
  const app = mount(reviewOutput, call => {
    if (call.args.action && (call.args.action as { kind?: string }).kind === "show") { reads++; return snapshot("fresh-review", 8); }
    return { isError: true, content: [{ type: "text", text: "Error code: INVALID_ARGUMENT; Error: RuntimeException - Selection revision is stale. Refresh before trying this action again. private detail" }] };
  });
  await app.controls(/Open current selection/i)!.click();
  const checkbox = [...app.get("products").queryAll("input")][0]!;
  checkbox.checked = true;
  for (const listener of checkbox.listeners.get("change") ?? []) listener({ target: checkbox, preventDefault() {} });
  await app.controls(/Add 1 to Ready/i)!.click();
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
    await app.controls(/Open current selection/i)!.click();
    if (scenario === "timeout") { app.expireTimers(20_000); await new Promise(resolve => setImmediate(resolve)); }
    assert.equal(app.calls.length, 1, "no stale edits or automatic retries follow a failed open");
    assert.equal(app.controls(/Add selected to local Basket|Remove|Change product/i), undefined);
    assert.match(app.get("status").text, /selection|refresh|unavailable|connect/i);
    assert.doesNotMatch(app.get("status").text, /internal trace|INVALID_ARGUMENT/i);
  });
});

test("restarting an unavailable historical review preserves quantities without restoring acceptance", async () => {
  let showCalls = 0;
  const historical = snapshot("old-review", 6, "ready");
  const app = mount(historical, call => {
    if (call.args.action && (call.args.action as { kind?: string }).kind === "show") { showCalls++; return { unavailable: true }; }
    if (call.name === "start_product_review") return snapshot("restarted-review", 1);
    return { unavailable: true };
  });
  assert.equal(app.calls.length, 0, "receiving an old review must not recover automatically");
  await app.controls(/Open current selection/i)!.click();
  assert.equal(showCalls, 1);
  assert.ok(app.controls(/Start new selection/i));
  await app.controls(/Start new selection/i)!.click();
  const restart = app.calls.find(call => call.name === "start_product_review");
  assert.deepEqual(JSON.parse(JSON.stringify(restart?.args)), { items: [{ product_id: 41, quantity: 3 }] }, "restart retains quantities and excludes prior acceptance state");
  assert.match(app.get("products").text, /Current milk draft/u);
});

test("duplicate unavailable host output keeps explicit safe restart visible", async () => {
  const app = mount(reviewOutput, () => ({ unavailable: true }));
  await app.controls(/Open current selection/i)!.click();
  assert.ok(app.controls(/Start new selection/i));
  for (const listener of app.windowListeners.get("message") ?? []) listener({
    source: app.parent, detail: undefined, preventDefault() {},
    data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { unavailable: true } },
  } as FakeEvent);
  assert.ok(app.controls(/Start new selection/i));
  assert.equal(app.controls(/Open current selection/i), undefined);
});


test("a different historical review arriving after explicit activation cannot fold the current selection", async t => {
  for (const bridge of ["openai", "mcp-apps"] as const) for (const channel of ["tool-result", "globals"] as const) {
    await t.test(`${bridge} bridge / ${channel} notification`, async () => {
      let reads = 0;
      const app = mount(reviewOutput, call => {
        const action = call.args.action as { kind?: string } | undefined;
        if (action?.kind === "show") {
          reads++;
          if (reads === 1) return snapshot("current-B", 2);
          return snapshot("current-C", 1, "ready");
        }
        return { isError: true, content: [{ type: "text", text: "Selection revision is stale. Refresh before trying this action again." }] };
      }, bridge === "mcp-apps");
      if (bridge === "mcp-apps") await new Promise(resolve => setImmediate(resolve));

      await app.controls(/Open current selection/i)!.click();
      assert.match(app.get("products").text, /Current milk draft/u);
      const oldA = reviewOutput;
      if (channel === "globals") {
        for (const listener of app.windowListeners.get("openai:set_globals") ?? []) listener({
          detail: { globals: { toolOutput: oldA } }, preventDefault() {},
        });
      } else {
        for (const listener of app.windowListeners.get("message") ?? []) listener({
          source: app.parent, detail: undefined, preventDefault() {},
          data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: oldA },
        } as FakeEvent);
      }
      assert.equal(app.calls.length, 1, "an unsolicited historical result cannot trigger a read");
      assert.equal(app.controls(/Open current selection/i), undefined, "the confirmed current selection stays active");
      assert.match(app.get("products").text, /Current milk draft/u);

      const checkbox = app.get("products").queryAll("input")[0]!;
      checkbox.checked = true;
      for (const listener of checkbox.listeners.get("change") ?? []) listener({ target: checkbox, preventDefault() {} });
      await app.controls(/Add 1 to Ready/i)!.click();
      assert.equal(app.calls.filter(call => call.name === "update_product_review").length, 3, "one explicit open, one failed edit, and one read-only recovery");
      assert.deepEqual(JSON.parse(JSON.stringify(app.calls.at(-1)?.args)), { action: { kind: "show" } });
      assert.equal(reads, 2, "the stale edit is not replayed; explicit recovery obtains the replacement current draft");
      assert.equal(app.get("title").textContent, "Ready");
      assert.equal(app.controls(/Open current selection/i), undefined);
      assert.match(app.get("products").text, /Current milk draft/u);
      assert.equal(app.calls.at(-1)?.args.review_id, undefined, "recovery is conversation-scoped, not bound to old A or B");
    });
  }
});

test("an older card notification received before the current show resolves cannot defeat its correlated result", async () => {
  let finishShow!: (result: unknown) => void;
  const app = mount(reviewOutput, call => call.args.action ? new Promise(resolve => { finishShow = resolve; }) : snapshot("unused", 1));
  const opening = app.controls(/Open current selection/i)!.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof finishShow, "function", "the explicit current show is pending before the old notification arrives");
  for (const listener of app.windowListeners.get("openai:set_globals") ?? []) listener({
    detail: { globals: { toolOutput: reviewOutput } }, preventDefault() {},
  });
  finishShow(snapshot("current-B", 2));
  await opening;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.get("title").textContent, "To decide");
  assert.equal(app.controls(/Open current selection/i), undefined);
  assert.equal(app.calls.length, 1, "an unsolicited snapshot does not add a recovery call");
});

test("a fresh frame remains inactive and non-review products cannot replace an active selection", async () => {
  const app = mount(reviewOutput, () => snapshot("current-B", 2));
  await app.controls(/Open current selection/i)!.click();
  for (const listener of app.windowListeners.get("message") ?? []) listener({
    source: app.parent, detail: undefined, preventDefault() {},
    data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { views: [product(99, "Unrelated butter search")] } },
  } as FakeEvent);
  assert.equal(app.get("title").textContent, "To decide");
  assert.match(app.get("products").text, /Current milk draft/u);
  assert.doesNotMatch(app.get("products").text, /Unrelated butter search/u);
  assert.equal(app.calls.length, 1, "unrelated product cards do not call review tools");

  const remounted = mount(reviewOutput, () => snapshot("current-C", 1));
  assert.equal(remounted.calls.length, 0);
  assert.ok(remounted.controls(/Open current selection/i), "activation is not persisted to a new frame");
});

test("a matching host result keeps an explicitly opened frame active and ignores stale revisions", async () => {
  const current = snapshot("active-review", 3, "ready");
  const app = mount(reviewOutput, () => current);
  await app.controls(/Open current selection/i)!.click();
  assert.ok(app.controls(/To decide/i));
  for (const listener of app.windowListeners.get("message") ?? []) listener({
    source: app.parent,
    detail: undefined,
    preventDefault() {},
    data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: current },
  } as FakeEvent);
  assert.equal(app.controls(/Open current selection/i), undefined, "same-review host output must not collapse the mounted card");
  assert.ok(app.controls(/To decide/i));
  for (const listener of app.windowListeners.get("openai:set_globals") ?? []) listener({
    detail: { globals: { toolOutput: snapshot("active-review", 2) } }, preventDefault() {},
  });
  assert.equal(app.get("title").textContent, "Ready", "a delayed older result must not overwrite the confirmed destination");
  assert.equal(app.controls(/Open current selection/i), undefined);
});

test("a same-revision verified submission supersedes an uncertain host snapshot", async () => {
  const current = snapshot("active-review", 3, "ready");
  const submission = { submission_id: "submission-one", review: { lines: [], expected_products_price: 30 } };
  const uncertain = { review: { ...current.review, revision: 4, submission: { ...submission, status: "uncertain" } } };
  const submitted = { review: { ...current.review, revision: 4, submission: { ...submission, status: "submitted" } } };
  const app = mount(reviewOutput, () => current);
  await app.controls(/Open current selection/i)!.click();
  const notify = (payload: unknown) => {
    for (const listener of app.windowListeners.get("message") ?? []) listener({
      source: app.parent, detail: undefined, preventDefault() {},
      data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: payload },
    } as FakeEvent);
  };
  notify(uncertain);
  assert.match(app.get("submission").text, /Check Nemlig before trying again/u);
  notify(submitted);
  assert.match(app.get("submission").text, /Added to Nemlig — verified/u);
  assert.ok(app.controls(/Continue with selection/i), "the existing card remains active");
  notify(uncertain);
  assert.match(app.get("submission").text, /Added to Nemlig — verified/u, "an older same-revision notification cannot undo verified success");
});

test("Ready navigation and removing all Ready products stay in one active local review", async () => {
  const basket = snapshot("active-review", 4, "ready");
  const needs = snapshot("active-review", 3);
  const cleared = { review: { ...basket.review, revision: 5, items: [] } };
  const app = mount(reviewOutput, call => {
    const action = call.args.action as { kind?: string; destination?: string };
    if (action?.kind === "show") return needs;
    if (action?.kind === "navigate") return basket;
    if (action?.kind === "remove") return cleared;
    throw new Error("Unexpected tool call");
  });
  await app.controls(/Open current selection/i)!.click();
  await app.controls(/^Ready \(0\)$/i)!.click();
  assert.equal(app.get("title").textContent, "Ready");
  assert.equal(app.controls(/Open current selection/i), undefined);
  await app.controls(/Remove all Ready products/i)!.click();
  assert.equal(app.calls.length, 2, "opening a local confirmation does not mutate a basket");
  await app.controls(/^Remove Ready products$/i)!.click();
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls[2])), {
    name: "update_product_review",
    args: { review_id: "active-review", revision: 4, action: { kind: "remove", product_ids: [41] } },
  });
  assert.equal(app.controls(/Open current selection/i), undefined);
  assert.equal(app.get("title").textContent, "What should we shop for?");
  assert.equal(app.calls.some(call => call.name === "submit_product_review"), false);
});

test("same-review navigation keeps compatible selection and disclosure state", async () => {
  const needs = snapshot("active-review", 2);
  const basket = { review: { ...needs.review, revision: 3, destination: "ready" } };
  const back = { review: { ...needs.review, revision: 4 } };
  const app = mount(reviewOutput, call => {
    const action = call.args.action as { kind?: string; destination?: string };
    if (action?.kind === "show") return needs;
    if (action?.destination === "ready") return basket;
    if (action?.destination === "needs-review") return back;
    throw new Error("Unexpected tool call");
  });
  await app.controls(/Open current selection/i)!.click();
  const checkbox = app.get("products").queryAll("input")[0]!;
  checkbox.checked = true;
  for (const listener of checkbox.listeners.get("change") ?? []) listener({ target: checkbox, preventDefault() {} });
  const details = app.get("products").queryAll("details")[0]!;
  details.open = true;
  for (const listener of details.listeners.get("toggle") ?? []) listener({ target: details, preventDefault() {} });
  await app.controls(/^Ready \(0\)$/i)!.click();
  await app.controls(/^To decide \(1\)$/i)!.click();
  assert.equal(app.get("products").queryAll("input")[0]!.checked, true);
  assert.equal(app.get("products").queryAll("details")[0]!.open, true);
  assert.equal(app.controls(/Open current selection/i), undefined);
});

test("disclosure and Select all are presentation only; one batch action accepts exact rows", async () => {
  const first = snapshot("active-review", 2);
  const firstProduct = first.review.items[0]!.view.product as { description: string; declaration: string; details: Array<{ key: string; value: string }> };
  firstProduct.description = "Fresh milk";
  firstProduct.declaration = "Milk, vitamin D";
  firstProduct.details = [{ key: "Fat", value: "1.5%" }];
  const second = { product_id: 42, quantity: 1, state: "needs-review", view: product(42, "Other milk") };
  const current = { review: { ...first.review, items: [...first.review.items, second] } };
  const accepted = { review: { ...current.review, revision: 3, items: current.review.items.map(item => ({ ...item, state: "ready" })) } };
  const app = mount(reviewOutput, call => (call.args.action as { kind?: string })?.kind === "accept" ? accepted : current);
  await app.controls(/Open current selection/i)!.click();
  const initialCalls = app.calls.length;
  const disclosure = app.get("products").queryAll("details")[0]!;
  disclosure.open = true;
  for (const listener of disclosure.listeners.get("toggle") ?? []) listener({ target: disclosure, preventDefault() {} });
  const facts = app.get("products").queryAll("details").slice(1, 4);
  assert.equal(facts.length, 3);
  for (const fact of facts) {
    fact.open = true;
    for (const listener of fact.listeners.get("toggle") ?? []) listener({ target: fact, preventDefault() {} });
  }
  assert.equal(app.calls.length, initialCalls, "expansion makes no MCP call");
  await app.controls(/^Select all$/i)!.click();
  assert.equal(app.calls.length, initialCalls, "Select all makes no MCP call");
  assert.ok(app.controls(/^Add 2 to Ready$/i));
  await app.controls(/^Add 2 to Ready$/i)!.click();
  assert.equal(app.calls.length, initialCalls + 1);
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.at(-1)?.args.action)), { kind: "accept", product_ids: [41, 42] });
  assert.equal(app.get("title").textContent, "To decide");
  assert.ok(app.controls(/^Ready \(2\)$/i));
});

test("Ready has no alternative action; returning an item to To decide enables it", async () => {
  const ready = snapshot("active-review", 2, "ready");
  const revisited = { review: { ...ready.review, revision: 3, items: ready.review.items.map(item => ({ ...item, state: "needs-review" })) } };
  const inReview = { review: { ...revisited.review, revision: 4, destination: "needs-review" } };
  const app = mount(reviewOutput, call => {
    const action = call.args.action as { kind?: string; destination?: string };
    if (action?.kind === "revisit") return revisited;
    if (action?.kind === "navigate") return inReview;
    return ready;
  });
  await app.controls(/Open current selection/i)!.click();
  const productDetails = app.get("products").queryAll("details")[0]!;
  productDetails.open = true;
  for (const listener of productDetails.listeners.get("toggle") ?? []) listener({ target: productDetails, preventDefault() {} });
  assert.equal(app.controls(/Choose alternative/i), undefined);
  await app.controls(/Move to To decide/i)!.click();
  await app.controls(/^To decide \(1\)$/i)!.click();
  const reopened = app.get("products").queryAll("details")[0]!;
  reopened.open = true;
  for (const listener of reopened.listeners.get("toggle") ?? []) listener({ target: reopened, preventDefault() {} });
  assert.ok(app.controls(/Choose alternative/i));
});

test("empty contextual search can be refined without changing selection membership or forcing a result count", async () => {
  const needs = snapshot("active-review", 2);
  const empty = { review: { ...needs.review, revision: 3, destination: "alternatives", alternatives: { product_id: 41, origin: "needs-review", query: "Dairy", views: [] } } };
  const found = { review: { ...empty.review, revision: 4, alternatives: { ...empty.review.alternatives, query: "butter", views: [product(42, "Butter option")] } } };
  const back = { review: { ...found.review, revision: 5, destination: "needs-review" } };
  const app = mount(reviewOutput, call => {
    const action = call.args.action as { kind?: string; query?: string };
    if (action?.kind === "show") return needs;
    if (action?.kind === "alternatives") return action.query === "butter" ? found : empty;
    if (action?.kind === "navigate") return back;
    throw new Error("Unexpected tool call");
  });
  await app.controls(/Open current selection/i)!.click();
  const details = app.get("products").queryAll("details")[0]!;
  details.open = true;
  for (const listener of details.listeners.get("toggle") ?? []) listener({ target: details, preventDefault() {} });
  await app.controls(/Choose alternative/i)!.click();
  assert.match(app.get("products").text, /No new alternatives for this selection/u);
  assert.equal(app.calls.at(-1)?.args.action && (app.calls.at(-1)!.args.action as { limit?: number }).limit, undefined);
  assert.equal(app.get("context").queryAll("input")[0]?.value, "Dairy");
  assert.equal(needs.review.items.length, 1, "an empty result does not remove or accept the target product");

  const form = app.get("context").queryAll("form")[0]!;
  app.get("context").queryAll("input")[0]!.value = "butter";
  for (const listener of form.listeners.get("submit") ?? []) listener({ target: form, preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((app.calls.at(-1)?.args.action as { query?: string; limit?: number }).query, "butter");
  assert.equal((app.calls.at(-1)?.args.action as { limit?: number }).limit, undefined);
  assert.match(app.get("products").text, /Butter option/u);
  assert.equal(found.review.items.length, 1, "searching does not change local selection membership");
  await app.controls(/Back to To decide/i)!.click();
  assert.equal(app.get("title").textContent, "To decide");
  assert.equal(app.calls.length, 4, "show, contextual search, deliberate follow-up, and navigation are explicit calls");
});

test("quantity bursts update totals immediately, debounce at 400 ms, and flush before navigation, prepare, and submit", async () => {
  let current: ReturnType<typeof snapshot> & { review: ReturnType<typeof snapshot>["review"] & { submission?: { submission_id: string; status: string; expires_at: string; review: unknown } } } = snapshot("active-review", 1, "ready");
  let submissions = 0;
  const app = mount(reviewOutput, call => {
    const action = call.args.action as { kind?: string; destination?: string; quantity?: number; product_id?: number };
    if (action?.kind === "show") return current;
    if (action?.kind === "quantity") {
      current = { review: { ...current.review, revision: current.review.revision + 1, submission: undefined, items: current.review.items.map(item => item.product_id === action.product_id ? { ...item, quantity: action.quantity! } : item) } };
      return current;
    }
    if (action?.kind === "navigate") {
      current = { review: { ...current.review, revision: current.review.revision + 1, destination: action.destination as "needs-review" | "ready" } };
      return current;
    }
    if (action?.kind === "prepare_submission") {
      current = { review: { ...current.review, revision: current.review.revision + 1, submission: {
        submission_id: "prepared-quantity", status: "prepared", expires_at: "2099-01-01T00:00:00Z",
        review: { lines: [{ product_id: 41, quantity: current.review.items[0]!.quantity, name: "Current milk draft", item_price: 10, line_total: current.review.items[0]!.quantity * 10 }], expected_products_price: current.review.items[0]!.quantity * 10 },
      } } };
      return current;
    }
    if (call.name === "submit_product_review") { submissions++; return current; }
    throw new Error("Unexpected tool call");
  });
  const settle = async () => { for (let index = 0; index < 5; index++) await new Promise(resolve => setImmediate(resolve)); };
  const plus = () => app.get("products").queryAll("button").find(button => button.attributes.get("aria-label") === "Increase quantity of Current milk draft")!;
  const pressPlus = async () => { assert.ok(plus()); await plus().click(); };
  await app.controls(/Open current selection/i)!.click();
  const details = app.get("products").queryAll("details")[0]!;
  details.open = true;
  for (const listener of details.listeners.get("toggle") ?? []) listener({ target: details, preventDefault() {} });

  await pressPlus(); await pressPlus(); await pressPlus();
  assert.equal(app.calls.length, 1, "rapid +/- presses do not send immediate updates");
  assert.match(app.get("products").text, /6 ×/u, "quantity renders optimistically");
  assert.match(app.get("products").text, /60\.00 kr/u, "line total renders optimistically");
  app.expireTimers(400); await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.at(-1)?.args.action)), { kind: "quantity", product_id: 41, quantity: 6 });

  await pressPlus();
  await app.controls(/^To decide \(0\)$/i)!.click();
  assert.deepEqual(app.calls.slice(-2).map(call => (call.args.action as { kind: string }).kind), ["quantity", "navigate"], "navigation waits for a flushed quantity revision");
  await app.controls(/^Ready \(1\)$/i)!.click();
  await pressPlus();
  await app.controls(/^Send to Nemlig basket$/i)!.click();
  assert.deepEqual(app.calls.slice(-2).map(call => (call.args.action as { kind: string }).kind), ["quantity", "prepare_submission"], "prepare uses the flushed Ready quantity");
  assert.match(app.get("submission").text, /80\.00 kr/u);

  await pressPlus();
  await app.controls(/^Add to Nemlig$/i)!.click();
  await settle();
  assert.equal(submissions, 0, "a pending Ready quantity invalidates the old exact submission before any provider write");
  assert.equal(app.calls.at(-1)?.name, "update_product_review");
  assert.equal((app.calls.at(-1)?.args.action as { kind: string }).kind, "quantity");
  assert.match(app.get("status").text, /Ready quantities changed.*Prepare the exact Nemlig basket change again/u);
});

test("failed or stale debounced quantity refreshes once, drops optimistic values, and does not continue the queued action", async () => {
  const current = snapshot("active-review", 3, "ready");
  const app = mount(reviewOutput, call => {
    const action = call.args.action as { kind?: string };
    if (action?.kind === "show") return current;
    if (action?.kind === "quantity") return { isError: true, content: [{ type: "text", text: "Selection revision is stale. Refresh before trying again." }] };
    throw new Error("A failed quantity must stop later actions");
  });
  await app.controls(/Open current selection/i)!.click();
  const details = app.get("products").queryAll("details")[0]!;
  details.open = true;
  for (const listener of details.listeners.get("toggle") ?? []) listener({ target: details, preventDefault() {} });
  const plus = app.get("products").queryAll("button").find(button => button.attributes.get("aria-label") === "Increase quantity of Current milk draft")!;
  await plus.click();
  await app.controls(/^To decide \(0\)$/i)!.click();
  assert.deepEqual(app.calls.map(call => (call.args.action as { kind: string }).kind), ["show", "quantity", "show"]);
  assert.match(app.get("products").text, /3 ×/u, "optimistic quantity is discarded in favor of the recovered server state");
  assert.match(app.get("status").text, /quantity change was not saved.*action was not applied/i);
});

test("viewer submission requires a separate exact confirmation after preparation", async () => {
  const basket = snapshot("active-review", 2, "ready");
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
  await app.controls(/Open current selection/i)!.click();
  await app.controls(/^Send to Nemlig basket$/i)!.click();
  assert.equal(app.calls.some(call => call.name === "submit_product_review"), false, "preparing never submits");
  assert.match(app.get("submission").text, /30\.00 kr/u);
  assert.equal(app.calls.some(call => call.name === "submit_product_review"), false, "showing confirmation never submits");
  await app.controls(/^Cancel$/i)!.click();
  assert.equal(app.calls.some(call => call.name === "submit_product_review"), false, "cancel never submits");
  await app.controls(/^Review exact change$/i)!.click();
  await app.controls(/^Add to Nemlig$/i)!.click();
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.find(call => call.name === "submit_product_review"))), {
    name: "submit_product_review", args: { review_id: "active-review", revision: 3, submission_id: "prepared-id" },
  });
  assert.match(app.get("submission").text, /Added to Nemlig — verified/u);
  assert.equal(app.controls(/^Add to Nemlig$/i), undefined);
});

test("uncertain submission never retries and removes the UI confirmation", async () => {
  const basket = snapshot("active-review", 2, "ready");
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
  await app.controls(/Open current selection/i)!.click();
  await app.controls(/^Send to Nemlig basket$/i)!.click();
  await app.controls(/^Add to Nemlig$/i)!.click();
  assert.equal(app.calls.filter(call => call.name === "submit_product_review").length, 1);
  assert.equal(shows, 2, "one read-only outcome check is allowed after uncertain submission");
  assert.match(app.get("submission").text, /Check Nemlig before trying again/u);
  assert.equal(app.controls(/^Add to Nemlig$/i), undefined);
  assert.match(app.get("status").text, /do not retry automatically/u);
});

test("a JSON-RPC thrown stale edit refreshes once and never replays the edit", async () => {
  const error = new Error("Error code: INVALID_ARGUMENT; Error: RuntimeException - Selection revision is stale. Refresh before trying this action again. private detail");
  const app = mount(reviewOutput, call => {
    if ((call.args.action as { kind?: string } | undefined)?.kind === "show") return snapshot("active-review", 2);
    throw error;
  }, true);
  await app.controls(/Open current selection/i)!.click();
  const checkbox = [...app.get("products").queryAll("input")][0]!;
  checkbox.checked = true;
  for (const listener of checkbox.listeners.get("change") ?? []) listener({ target: checkbox, preventDefault() {} });
  await app.controls(/Add 1 to Ready/i)!.click();
  assert.equal(app.calls.length, 3, "explicit show, one edit, and one read-only refresh");
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls[2])), { name: "update_product_review", args: { action: { kind: "show" } } });
  assert.doesNotMatch(app.get("status").text, /INVALID_ARGUMENT|private detail/u);
});

test("submitted or uncertain historical reviews cannot restart and show basket inspection guidance", async t => {
  for (const status of ["submitted", "uncertain"] as const) await t.test(status, async () => {
    const base = snapshot("old-review", 6, "ready");
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
    await app.controls(/Open current selection/i)!.click();
    assert.equal(app.calls.length, 1, "only explicit read-only recovery is allowed");
    assert.equal(app.controls(/Start new selection/i), undefined, "an old submitted or uncertain draft cannot seed another submission");
    assert.match(app.get("products").text, /Check your actual Nemlig basket in conversation/u);
    assert.equal(app.controls(/Add selected|Remove|Change product/i), undefined);
  });
});
