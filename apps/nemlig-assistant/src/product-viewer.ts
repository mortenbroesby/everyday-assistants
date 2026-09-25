import type { ProductView } from "./product-presentation.js";

/** MCP Apps resource identity; registration belongs to the MCP adapter. */
export const PRODUCT_VIEWER_RESOURCE_URI = "ui://nemlig/product-viewer.html";
export const PRODUCT_VIEWER_MIME_TYPE = "text/html;profile=mcp-app";

/**
 * Metadata shared by MCP tool registrations when they advertise the viewer.
 * Keeping this separate from the renderer lets headless callers use the same
 * structured result without importing an MCP server or provider client.
 */
export const PRODUCT_VIEWER_RESOURCE_METADATA = Object.freeze({
  ui: Object.freeze({ resourceUri: PRODUCT_VIEWER_RESOURCE_URI }),
  "openai/outputTemplate": PRODUCT_VIEWER_RESOURCE_URI,
});

const formatNumber = (value: unknown): string | undefined =>
  typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;

const formatMoney = (value: unknown): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown price";
  return `${value.toFixed(2)} kr`;
};

const formatProduct = (view: ProductView): string => {
  if (view.status !== "complete") {
    return view.product_id === undefined
      ? "Product details unavailable."
      : `Product ${view.product_id} details unavailable.`;
  }

  const product = view.product;
  const facts = [
    product.name ?? "Unnamed product",
    product.brand,
    `${formatMoney(product.price)}${product.currency ? ` ${product.currency}` : ""}`,
    product.unit,
    product.unit_size,
    product.available === undefined ? "availability unknown" : product.available ? "available" : "unavailable",
  ].filter((value): value is string => Boolean(value));
  const labels = product.labels.length ? `; labels: ${product.labels.join(", ")}` : "";
  const classifications = [
    product.is_organic === undefined ? undefined : `organic ${product.is_organic ? "yes" : "no"}`,
    product.is_frozen === undefined ? undefined : `frozen ${product.is_frozen ? "yes" : "no"}`,
    product.is_on_discount === undefined ? undefined : `on discount ${product.is_on_discount ? "yes" : "no"}`,
  ].filter(Boolean).join("; ");
  const category = [product.category, product.subcategory].filter((value) => value?.trim()).join(" / ");
  const context = view.context === "basket"
    ? `; basket quantity ${formatNumber(view.basket?.quantity) ?? "unknown"}; line total ${formatMoney(view.basket?.line_total)}`
    : view.context === "review"
      ? `; review quantity ${formatNumber(view.review?.quantity) ?? "unknown"}; line total ${formatMoney(view.review?.line_total)}; approved ${view.review?.approved === true ? "yes" : "no"}`
      : "";
  const details = product.details?.length
    ? `; ${product.details.map(({ key, value }) => `${key}: ${value}`).join("; ")}`
    : "";
  const description = product.description ? `; description: ${product.description}` : "";
  const declaration = product.declaration ? `; declaration: ${product.declaration}` : "";
  const unitPrice = product.unit_price === undefined ? "" : `; unit price ${formatMoney(product.unit_price)} ${product.currency}${product.unit ? ` (${product.unit})` : ""}`;
  return `${facts.filter(Boolean).join(" — ")}${category ? `; category: ${category}` : ""}${classifications ? `; ${classifications}` : ""}${unitPrice}${labels}${context}${description}${declaration}${details}.`;
};

/** Headless fallback used when the host does not support the presentation resource. */
export function productViewsToText(views: readonly ProductView[]): string {
  if (!views.length) return "No products found.";
  return views.map((view, index) => `${index + 1}. ${formatProduct(view)}`).join("\n");
}

/** Self-contained host-rendered view; authoritative shopping state stays in the server. */
export function renderProductViewerHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nemlig product review</title>
<style>
:root { color-scheme: light dark; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --line: #e7eae5; --accent: #426744; --soft: #f1f5ee; --muted: #6b736b; }
* { box-sizing: border-box; }
body { margin: 0; padding: 12px; background: #fff; color: #252c25; }
main { max-width: 560px; margin: auto; }
h1 { font-size: 1.15rem; font-weight: 650; text-align: center; letter-spacing: -.025em; margin: 8px 0 5px; } h2 { font-size: .8rem; font-weight: 600; margin: 18px 0 7px; color: var(--muted); }
p { margin: 6px 0; } .muted { color: var(--muted); font-size: .8rem; }
#intro { text-align: center; max-width: 35ch; margin: 0 auto 14px; }
button, input { font: inherit; } button, summary { cursor: pointer; }
button { min-height: 44px; padding: 8px 12px; color: inherit; background: var(--soft); border: 1px solid transparent; border-radius: 9px; font-size: .86rem; }
button:disabled { opacity: .45; cursor: default; }
button.primary { background: var(--accent); color: white; }
button[aria-current="page"] { background: var(--accent); color: white; }
button:focus-visible, summary:focus-visible, input:focus-visible { outline: 3px solid #4b94dd; outline-offset: 2px; }
nav, .actions, form { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
nav { margin-bottom: 10px; padding: 4px; background: var(--soft); border-radius: 12px; } nav button { flex: 1; background: transparent; }
.actions { margin-top: 10px; } .actions > button { flex: 1; }
#status { margin: 6px 0; font-size: .8rem; color: var(--muted); } #status:empty { display: none; } #fallback { white-space: pre-wrap; overflow-wrap: anywhere; }
article { border-bottom: 1px solid var(--line); padding: 9px 0; display: flex; align-items: flex-start; gap: 3px; }
article > details { flex: 1; min-width: 0; } article > label { display: flex; min-width: 30px; min-height: 54px; align-items: center; justify-content: center; }
input[type="checkbox"], input[type="radio"] { width: 17px; height: 17px; accent-color: var(--accent); }
summary.row { list-style: none; display: grid; grid-template-columns: 44px minmax(0, 1fr) 12px; gap: 8px; min-height: 54px; align-items: center; }
summary.row::-webkit-details-marker { display: none; }
summary.row::after { content: "⌄"; font-size: 1rem; color: var(--muted); }
details[open] > summary.row::after { content: "⌃"; }
.photo { width: 44px; height: 48px; object-fit: contain; font-size: .6rem; display: grid; place-items: center; background: var(--soft); border-radius: 6px; text-align: center; color: var(--muted); }
.headline { display: flex; justify-content: space-between; gap: 8px; } .name { font-weight: 550; overflow-wrap: anywhere; } .price { white-space: nowrap; font-size: .85rem; font-variant-numeric: tabular-nums; }
.meta { font-size: .75rem; color: var(--muted); overflow-wrap: anywhere; } .badge { font-size: .67rem; color: var(--accent); background: var(--soft); border-radius: 4px; padding: 1px 4px; margin-right: 4px; }
.detail-body { padding: 12px 0 4px; overflow-wrap: anywhere; } .fact { border-top: 1px solid var(--line); padding: 8px 0; } .fact > summary { min-height: 32px; }
input[type="search"] { min-width: 0; flex: 1; width: 100%; } input[type="search"], input[type="number"] { min-height: 44px; border: 1px solid var(--line); border-radius: 8px; padding: 8px; color: inherit; background: transparent; }
input[type="number"] { width: 76px; } form { margin: 10px 0; } form label { width: 100%; }
footer { padding-top: 12px; margin-top: 4px; } footer > button { width: 100%; margin-top: 6px; }
footer > button.quiet { background: transparent; color: var(--muted); font-size: .78rem; }
#submission { background: var(--soft); border-radius: 12px; padding: 14px; margin-top: 12px; }
#context > article { background: var(--soft); border: 0; padding: 8px; border-radius: 10px; }
@media (prefers-color-scheme: dark) { :root { --line: #394238; --accent: #52794f; --soft: #252e25; --muted: #acb6aa; } body { background: #191e19; color: #f1f4ee; } .badge { color: #bdd7b5; } }
[hidden] { display: none !important; }
</style>
</head>
<body><main aria-labelledby="title">
<nav id="navigation" aria-label="Product review destinations" hidden></nav>
<h1 id="title" tabindex="-1">Nemlig products</h1>
<p id="intro" class="muted">Inspect products here or continue in conversation.</p>
<p id="status" role="status" aria-live="polite">Loading your shopping review…</p>
<div id="context"></div>
<section id="products" aria-label="Product results"></section>
<footer id="actions" hidden></footer>
<section id="submission" aria-label="Exact Nemlig submission review" hidden></section>
<p id="fallback" class="muted" hidden></p>
</main><script>
(() => {
  "use strict";
  const root = document.getElementById("products"), nav = document.getElementById("navigation"), context = document.getElementById("context");
  const status = document.getElementById("status"), title = document.getElementById("title"), intro = document.getElementById("intro");
  const footer = document.getElementById("actions"), submissionRoot = document.getElementById("submission"), fallback = document.getElementById("fallback");
  const safeImageOrigins = new Set(["https://nemlig.com", "https://www.nemlig.com"]);
  let review, busy = false, selected = new Set(), replacement;
  let bridgeReady = false, received = false, requestId = 0;
  const pending = new Map();
  const notify = (method, params) => window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = "nemlig-" + ++requestId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("The host has not confirmed the action. Refresh before trying again.")); }, 20000);
    pending.set(id, { resolve, reject, timer });
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  });
  const callTool = (name, args) => bridgeReady ? rpc("tools/call", { name, arguments: args }) : window.openai.callTool(name, args);
  const text = (value, empty = "Unknown") => typeof value === "string" && value.trim() ? value : empty;
  const money = value => typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) + " kr" : "Unknown price";
  const el = (tag, value, className) => { const node = document.createElement(tag); if (value !== undefined) node.textContent = value; if (className) node.className = className; return node; };
  const safeImageUrl = value => { try { const url = new URL(value); return url.protocol === "https:" && safeImageOrigins.has(url.origin) ? url.href : undefined; } catch { return undefined; } };
  const canUse = view => view && view.status === "complete" && view.product.available === true;
  const nameOf = item => item.view.status === "complete" ? text(item.view.product.name) : "Product " + item.product_id;
  const button = (label, action, primary = false) => { const node = el("button", label, primary ? "primary" : ""); node.type = "button"; node.disabled = busy; node.addEventListener("click", action); return node; };
  const explain = message => { fallback.hidden = false; fallback.textContent = message; };
  const followUp = async (prompt, guidance = "Continue in conversation to review the exact submission. Nothing has been sent to Nemlig.") => {
    if (bridgeReady) {
      try { await rpc("ui/message", { role: "user", content: [{ type: "text", text: prompt }] }); return; } catch { /* Show conversational fallback. */ }
    }
    if (window.openai && typeof window.openai.sendFollowUpMessage === "function") {
      try { await window.openai.sendFollowUpMessage({ prompt }); return; } catch { /* Keep the exact request available if the host fails. */ }
    }
    explain(guidance);
  };
  const update = async action => {
    if (!review || busy) return;
    const args = { review_id: review.review_id, revision: review.revision, action };
    if (!bridgeReady && (!window.openai || typeof window.openai.callTool !== "function")) {
      const descriptions = {
        show: "refresh your local review", end: "finish shopping and discard the temporary local basket", revisit: "move selected products back to Needs review", accept: "accept the selected products into your local Basket",
        remove: "remove the selected products locally", quantity: "change this product's local quantity",
        alternatives: "find alternatives for this product", replace: "use the selected alternative",
        navigate: "open " + (action.destination === "basket" ? "your local Basket" : action.destination === "alternatives" ? "the current alternatives" : "Needs review"),
        prepare_submission: "review your local Basket before submitting it to Nemlig"
      };
      await followUp("Please use update_product_review with " + JSON.stringify(args) + ". This is a local review action, not approval to submit to Nemlig.",
        "Continue in conversation: ask to " + descriptions[action.kind] + ". No change has been confirmed here.");
      return;
    }
    busy = true;
    document.querySelectorAll("button").forEach(node => { node.disabled = true; });
    status.textContent = "Updating…";
    try {
      let timer;
      const result = await Promise.race([
        callTool("update_product_review", args),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("The host has not confirmed the update.")), 20000); })
      ]).finally(() => clearTimeout(timer));
      if (result && result.isError) throw new Error((result.content || []).filter(c => c.type === "text").map(c => c.text).join(" ") || "Update failed.");
      if (!receive(result)) throw new Error("No updated review was returned. Refresh before trying again.");
      if (review && window.openai && typeof window.openai.setWidgetState === "function") {
        window.openai.setWidgetState({ review_id: review.review_id, revision: review.revision, destination: review.destination });
      }
    } catch (error) {
      status.textContent = (error && error.message ? error.message : "Update failed.") + " Refresh the review before trying again.";
    } finally {
      busy = false;
      // Preserve selection-specific disabled states by rendering the last confirmed snapshot.
      const message = status.textContent;
      renderReview();
      status.textContent = message;
    }
  };
  const detailsFact = (body, label, value) => {
    if (typeof value !== "string" || !value.trim()) return;
    const details = el("details", undefined, "fact");
    details.append(el("summary", label), el("p", value)); body.append(details);
  };
  const row = (view, item, mode) => {
    const article = el("article");
    const product = view && view.status === "complete" ? view.product : {};
    const id = item ? item.product_id : product.id;
    if (mode === "select" || mode === "alternative") {
      const label = el("label"), input = el("input");
      input.type = mode === "select" ? "checkbox" : "radio";
      input.name = mode === "select" ? "accepted" : "replacement";
      input.setAttribute("aria-label", (mode === "select" ? "Select " : "Choose ") + text(product.name, "product " + id));
      input.disabled = !canUse(view) || busy;
      input.checked = mode === "select" ? selected.has(id) : replacement === id;
      input.addEventListener("change", () => {
        if (mode === "select") { if (input.checked) selected.add(id); else selected.delete(id); }
        else replacement = id;
        renderFooter();
      });
      label.append(input); article.append(label);
    }
    const details = el("details"), summary = el("summary", undefined, "row");
    const imageUrl = safeImageUrl(product.image_url);
    if (imageUrl) {
      const image = el("img", undefined, "photo"); image.src = imageUrl; image.alt = text(product.name, "Product image");
      image.addEventListener("error", () => image.replaceWith(el("span", "No image", "photo")), { once: true }); summary.append(image);
    } else summary.append(el("span", "No image", "photo"));
    const info = el("div"), headline = el("div", undefined, "headline");
    headline.append(el("span", text(product.name, "Product " + (id || "details unavailable")), "name"), el("span", money(product.price), "price"));
    info.append(headline, el("div", [product.brand, product.unit_size].filter(Boolean).join(" · ") || "Package details unavailable", "meta"));
    info.append(el("div", product.unit_price === undefined ? text(product.unit, "Unit price unavailable") : money(product.unit_price) + (product.unit ? " · " + product.unit : ""), "meta"));
    if (item && item.quantity !== 1) info.append(el("div", item.quantity + " packages", "meta"));
    for (const [label, value] of [["Organic", product.is_organic], ["Frozen", product.is_frozen], ["Offer", product.is_on_discount]]) if (value === true) info.append(el("span", label, "badge"));
    if (product.available !== true) info.append(el("div", product.available === undefined ? "Availability unknown" : "Unavailable", "meta"));
    summary.append(info); details.append(summary);
    const body = el("div", undefined, "detail-body");
    if (!view || view.status !== "complete") body.append(el("p", "Product details unavailable."));
    else {
      body.append(el("p", "Product ID: " + product.id, "muted"));
      detailsFact(body, "Description", product.description);
      detailsFact(body, "Ingredients / declaration", product.declaration);
      detailsFact(body, "Category", [product.category, product.subcategory].filter(Boolean).join(" / "));
      detailsFact(body, "Labels", Array.isArray(product.labels) ? product.labels.join(", ") : undefined);
      for (const detail of Array.isArray(product.details) ? product.details : []) if (detail) detailsFact(body, detail.key, detail.value);
      if (view.context === "basket" || view.context === "review") {
        const quantities = view.context === "basket" ? view.basket : view.review;
        body.append(el("p", (view.context === "basket" ? "Basket quantity: " : "Review quantity: ") + (quantities && quantities.quantity || "Unknown") + " · Line total: " + money(quantities && quantities.line_total)));
      }
    }
    if (item && mode !== "alternative") {
      const form = el("form"), label = el("label", "Package quantity"), quantity = el("input");
      quantity.type = "number"; quantity.min = "1"; quantity.step = "1"; quantity.required = true; quantity.value = item.quantity;
      quantity.id = "quantity-" + id; label.htmlFor = quantity.id;
      const save = button("Update quantity", () => {}); save.type = "submit";
      form.append(label, quantity, save);
      form.addEventListener("submit", event => { event.preventDefault(); if (form.reportValidity()) void update({ kind: "quantity", product_id: id, quantity: Number(quantity.value) }); });
      body.append(form);
      const actions = el("div", undefined, "actions");
      actions.append(button(item.state === "basket" ? "Change product" : "Find alternatives", () => {
        if (review.alternatives && review.alternatives.product_id === id && review.alternatives.origin === item.state) void update({ kind: "navigate", destination: "alternatives" });
        else void update({ kind: "alternatives", product_id: id, query: text(product.name, String(id)).slice(0, 200) });
      }), button("Remove", () => void update({ kind: "remove", product_ids: [id] })));
      if (item.state === "needs-review") {
        const accept = button("Add to local Basket", () => void update({ kind: "accept", product_ids: [id] }), true);
        accept.disabled = busy || !canUse(view); actions.append(accept);
      }
      if (item.state === "basket") actions.append(button("Move to Needs review", () => void update({ kind: "revisit", product_ids: [id] })));
      body.append(actions);
    }
    details.append(body); article.append(details); return article;
  };
  const renderFooter = () => {
    footer.replaceChildren(); footer.hidden = !review; if (!review) return;
    if (review.destination === "needs-review") {
      const accept = button("Add selected to local Basket (" + selected.size + ")", () => void update({ kind: "accept", product_ids: [...selected] }), true);
      accept.disabled = busy || !selected.size; footer.append(accept);
    } else if (review.destination === "basket") {
      const items = review.items.filter(i => i.state === "basket");
      const known = items.every(i => i.view.status === "complete" && typeof i.view.product.price === "number");
      footer.append(el("p", "Local total: " + (known ? money(items.reduce((sum, i) => sum + i.quantity * i.view.product.price, 0)) : "Unavailable")));
      const prepare = button("Review submission to Nemlig", () => void update({ kind: "prepare_submission" }), true);
      prepare.disabled = busy || !items.length || !!(review.submission && review.submission.status !== "prepared");
      footer.append(prepare, el("p", "Nothing is sent until you approve the exact review in conversation. Unresolved items are excluded.", "muted"));
    } else if (review.alternatives) {
      const target = review.items.find(i => i.product_id === review.alternatives.product_id);
      const replace = button("Replace with selected", () => void update({ kind: "replace", product_id: target.product_id, replacement_id: replacement }), true);
      replace.disabled = busy || replacement === undefined; footer.append(replace);
      const keep = button("Keep current product", async () => {
        if (target.state === "needs-review") await update({ kind: "accept", product_ids: [target.product_id] });
        if (review.alternatives) await update({ kind: "navigate", destination: review.alternatives.origin });
      });
      keep.disabled = busy || !canUse(target.view);
      footer.append(keep, button("Cancel · back to " + (review.alternatives.origin === "basket" ? "Basket" : "Needs review"), () => void update({ kind: "navigate", destination: review.alternatives.origin })));
    }
    const refresh = button("Refresh review", () => void update({ kind: "show" })); refresh.className = "quiet";
    const finish = button("Finish shopping", () => {
      footer.replaceChildren(el("p", "Discard this temporary local basket? Your Nemlig basket will not change."),
        button("Discard local basket", () => void update({ kind: "end" })), button("Keep shopping", renderFooter));
    }); finish.className = "quiet";
    footer.append(refresh, finish);
  };
  const renderSubmission = () => {
    submissionRoot.replaceChildren(); submissionRoot.hidden = !review.submission; if (!review.submission) return;
    const submission = review.submission;
    submissionRoot.append(el("h2", submission.status === "submitted" ? "Submitted to Nemlig" : submission.status === "uncertain" ? "Check Nemlig before trying again" : "Review before sending"));
    const lines = Array.isArray(submission.review.lines) ? submission.review.lines : [];
    for (const line of lines) submissionRoot.append(el("p", line.quantity + " × " + text(line.name, "Product " + line.product_id) + " · " + text(line.unit_size, "") + " · " + money(line.item_price) + " each · " + money(line.line_total)));
    submissionRoot.append(el("p", "Expected Nemlig product total: " + money(submission.review.expected_products_price)));
    if (submission.status === "prepared") {
      submissionRoot.append(el("p", "These quantities replace the quantities of the same products in Nemlig. Other products stay unchanged.", "muted"));
      submissionRoot.append(button("Review in conversation", () => void followUp("Please present the exact prepared submission for local review " + review.review_id + ", revision " + review.revision + ", submission " + submission.submission_id + ", and ask for my explicit approval. Do not submit yet.")));
    } else submissionRoot.append(el("p", submission.status === "submitted" ? "Nemlig readback verified. Your local basket remains available." : "The submission outcome is uncertain. Inspect the actual Nemlig basket; do not retry automatically."));
  };
  const renderReview = () => {
    if (!review) return;
    nav.hidden = false; nav.replaceChildren(); context.replaceChildren(); root.replaceChildren();
    for (const [destination, label] of [["needs-review", "Needs review"], ["basket", "Basket"]]) {
      const control = button(label + " (" + review.items.filter(i => i.state === destination).length + ")", () => void update({ kind: "navigate", destination }));
      if (review.destination === destination) control.setAttribute("aria-current", "page"); nav.append(control);
    }
    intro.textContent = review.destination === "basket" ? "The products you’ve chosen. Send to Nemlig when you’re ready." : review.destination === "alternatives" ? "Compare options and choose a replacement, or keep the current product." : "Keep the products you like. Find alternatives for the rest.";
    if (review.destination === "alternatives" && review.alternatives) {
      const alternatives = review.alternatives, target = review.items.find(i => i.product_id === alternatives.product_id);
      title.textContent = "Alternatives for " + nameOf(target);
      context.append(el("h2", "Current product"), row(target.view, target, "current"), el("h2", "Alternatives"));
      const form = el("form"), label = el("label", "Find or refine alternatives"), query = el("input");
      query.id = "alternative-query"; label.htmlFor = query.id; query.type = "search"; query.required = true; query.maxLength = 200; query.value = alternatives.query;
      const search = button("Search", () => {}); search.type = "submit"; form.append(label, query, search);
      form.addEventListener("submit", event => { event.preventDefault(); if (form.reportValidity()) void update({ kind: "alternatives", product_id: target.product_id, query: query.value, limit: 10 }); });
      context.append(form);
      alternatives.views.forEach(view => root.append(row(view, undefined, "alternative")));
      if (!alternatives.views.length) root.append(el("p", "No alternatives returned. Refine the search, keep the current product, or go back."));
    } else {
      title.textContent = review.destination === "basket" ? "Basket" : "Needs review";
      if (review.alternatives) context.append(button("Return to alternatives for " + nameOf(review.items.find(i => i.product_id === review.alternatives.product_id)), () => void update({ kind: "navigate", destination: "alternatives" })));
      const items = review.items.filter(i => i.state === review.destination);
      items.forEach(item => root.append(row(item.view, item, item.state === "needs-review" ? "select" : "basket")));
      if (!items.length) root.append(el("p", review.destination === "basket" ? "Your local Basket is empty. Accept products from Needs review." : "All products are resolved. Your local Basket is ready to inspect."));
    }
    status.textContent = "";
    renderFooter(); renderSubmission();
  };
  const receive = payload => {
    if (payload && payload.isError) {
      received = true;
      status.textContent = (payload.content || []).filter(item => item.type === "text").map(item => item.text).join(" ") || "Could not load products. Continue in conversation.";
      return false;
    }
    const value = payload && payload.structuredContent || payload;
    if (!value || typeof value !== "object") return false;
    if (value.ended) {
      received = true; review = undefined;
      nav.hidden = true; footer.hidden = true; submissionRoot.hidden = true;
      context.replaceChildren(); root.replaceChildren();
      title.textContent = "Shopping finished"; intro.textContent = "Your temporary local basket has been discarded.";
      status.textContent = "Nothing was changed in Nemlig."; return true;
    }
    if (value.review && Array.isArray(value.review.items) && value.review.review_id) {
      if (review && review.review_id === value.review.review_id && value.review.revision < review.revision) return true;
      received = true; review = value.review; selected = new Set(); replacement = undefined; fallback.hidden = true; renderReview(); return true;
    }
    const views = Array.isArray(value.views) ? value.views : Array.isArray(value.products) ? value.products : Array.isArray(value.result) ? value.result : Array.isArray(value) ? value : undefined;
    if (!views) return false;
    received = true; review = undefined; nav.hidden = true; footer.hidden = true; submissionRoot.hidden = true; context.replaceChildren(); root.replaceChildren();
    title.textContent = "Nemlig products"; intro.textContent = "Inspect product details here or continue in conversation.";
    views.forEach(view => root.append(row(view, undefined, "result"))); status.textContent = views.length + " products shown."; return true;
  };
  window.addEventListener("message", event => {
    if (event.source !== window.parent || window.parent === window) return;
    const message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    const request = pending.get(message.id);
    if (request && ("result" in message || "error" in message)) {
      pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message || "Host request failed."));
      else request.resolve(message.result);
    }
    if (message.method === "ping" && message.id !== undefined) window.parent.postMessage({ jsonrpc: "2.0", id: message.id, result: {} }, "*");
    if (message.method === "ui/notifications/tool-result") {
      const payload = message.params && (message.params.result || message.params);
      if (!receive(payload) && !(payload && payload.isError)) {
        received = true; status.textContent = "No product review was returned. Ask to show your current shopping review.";
      }
    }
    if (message.method === "ui/notifications/tool-cancelled") {
      received = true; status.textContent = "Request cancelled. Continue in conversation when you are ready.";
    }
  });
  window.addEventListener("openai:set_globals", event => {
    if (event.detail && event.detail.globals && event.detail.globals.toolOutput) receive(event.detail.globals.toolOutput);
  });
  if (window.openai && window.openai.toolOutput) receive(window.openai.toolOutput);
  if (window.parent !== window) {
    rpc("ui/initialize", { protocolVersion: "2026-01-26", appInfo: { name: "nemlig-product-review", version: "1.0.0" }, appCapabilities: {} }).then(result => {
      if (!result || result.protocolVersion !== "2026-01-26") throw new Error("Unsupported host UI protocol.");
      bridgeReady = true; notify("ui/notifications/initialized", {});
      if (typeof ResizeObserver !== "undefined") {
        let lastHeight;
        new ResizeObserver(() => {
          const height = Math.ceil(document.querySelector("main").getBoundingClientRect().height + 24);
          if (height !== lastHeight) { lastHeight = height; notify("ui/notifications/size-changed", { height }); }
        }).observe(document.querySelector("main"));
      }
    }).catch(() => { if (!received) status.textContent = "The review could not connect. Continue in conversation or reopen the review."; });
  }
  setTimeout(() => { if (!received) status.textContent = "Products have not arrived. Ask to show your current review, or reconnect Nemlig if needed."; }, 25000);
})();
</script></body></html>`;
}
