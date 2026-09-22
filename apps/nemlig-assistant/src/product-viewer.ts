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

/**
 * Return a self-contained MCP Apps HTML resource.
 *
 * The resource only consumes tool output delivered by its host. It deliberately
 * has no provider client, network API, mutation control, or durable state.
 */
export function renderProductViewerHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Nemlig products</title>
    <style>
      :root { color-scheme: light dark; font: 16px/1.45 system-ui, sans-serif; }
      body { margin: 0; padding: 1rem; }
      main { max-width: 48rem; margin: 0 auto; }
      #status { min-height: 1.5em; }
      .products { display: grid; gap: .75rem; }
      article { border: 1px solid CanvasText; border-radius: .5rem; padding: .75rem; }
      article > div { display: grid; gap: .2rem; }
      img { display: block; max-width: 7rem; max-height: 7rem; object-fit: contain; }
      .muted { opacity: .75; }
    </style>
  </head>
  <body>
    <main aria-labelledby="title">
      <h1 id="title">Nemlig products</h1>
      <p id="status" role="status" aria-live="polite">Waiting for product results.</p>
      <section id="products" class="products" aria-label="Product results"></section>
    </main>
    <script>
      (() => {
        "use strict";
        const productRoot = document.getElementById("products");
        const status = document.getElementById("status");
        const safeImageOrigins = new Set(["https://nemlig.com", "https://www.nemlig.com"]);

        const safeImageUrl = (value) => {
          if (typeof value !== "string") return undefined;
          try {
            const url = new URL(value);
            return url.protocol === "https:" && safeImageOrigins.has(url.origin) ? url.href : undefined;
          } catch {
            return undefined;
          }
        };

        const text = (value, fallback = "Unknown") =>
          typeof value === "string" && value.trim() ? value : fallback;

        const money = (value, currency = "DKK") =>
          typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) + " " + currency : "Unknown price";

        const viewList = (payload) => {
          const value = payload && typeof payload === "object" && "structuredContent" in payload
            ? payload.structuredContent
            : payload;
          if (Array.isArray(value)) return value;
          if (!value || typeof value !== "object") return undefined;
          if (Array.isArray(value.views)) return value.views;
          if (Array.isArray(value.products)) return value.products;
          if (Array.isArray(value.result)) return value.result;
          return undefined;
        };

        const render = (payload) => {
          const views = viewList(payload);
          if (!views) return;
          productRoot.replaceChildren();
          views.forEach((view, index) => {
            const card = document.createElement("article");
            card.setAttribute("aria-labelledby", "product-title-" + index);
            if (!view || view.status !== "complete" || !view.product) {
              const unavailable = document.createElement("p");
              unavailable.className = "muted";
              unavailable.textContent = view && view.product_id === undefined
                ? "Product details unavailable."
                : "Product " + String(view.product_id) + " details unavailable.";
              card.append(unavailable);
              productRoot.append(card);
              return;
            }
            const product = view.product;
            const content = document.createElement("div");
            const heading = document.createElement("h2");
            heading.id = "product-title-" + index;
            heading.textContent = text(product.name, "Unnamed product");
            content.append(heading);
            if (typeof product.id === "number") {
              const identifier = document.createElement("p");
              identifier.textContent = "Product ID: " + product.id;
              content.append(identifier);
            }
            if (typeof product.brand === "string" && product.brand.trim()) {
              const brand = document.createElement("p");
              brand.textContent = product.brand;
              content.append(brand);
            }
            if (typeof product.category === "string" && product.category.trim()) {
              const category = document.createElement("p");
              category.textContent = [product.category, product.subcategory].filter((value) => typeof value === "string" && value.trim()).join(" · ");
              content.append(category);
            }
            const facts = document.createElement("p");
            const availability = product.available === undefined ? "Availability unknown" : product.available ? "Available" : "Unavailable";
            facts.textContent = [money(product.price, product.currency), text(product.unit, "Unknown unit-price basis"), text(product.unit_size, "Unknown package size"), availability].join(" · ");
            content.append(facts);
            if (view.context === "basket" || view.context === "review") {
              const context = view.context === "basket" ? view.basket : view.review;
              const summary = document.createElement("p");
              const quantity = context && typeof context.quantity === "number" ? context.quantity : "Unknown";
              const total = context && typeof context.line_total === "number" ? money(context.line_total, product.currency) : "Unknown total";
              summary.textContent = view.context === "basket"
                ? "Basket quantity: " + quantity + " · Line total: " + total
                : "Review quantity: " + quantity + " · Line total: " + total + " · " + (context && context.approved === true ? "Approved" : "Not approved");
              content.append(summary);
            }
            const more = document.createElement("details");
            const summary = document.createElement("summary");
            summary.textContent = "More product information";
            more.append(summary);
            const addFact = (label, value) => {
              if (typeof value !== "string" || !value.trim()) return;
              const paragraph = document.createElement("p");
              const strong = document.createElement("strong");
              strong.textContent = label + ": ";
              paragraph.append(strong, document.createTextNode(value));
              more.append(paragraph);
            };
            for (const [label, value] of [["Organic", product.is_organic], ["Frozen", product.is_frozen], ["Discount", product.is_on_discount]]) {
              if (typeof value === "boolean") addFact(label, value ? "Yes" : "No");
            }
            if (typeof product.unit_price === "number" && Number.isFinite(product.unit_price)) {
              addFact("Unit price", money(product.unit_price, product.currency) + (product.unit ? " (" + product.unit + ")" : ""));
            }
            addFact("Labels", Array.isArray(product.labels) ? product.labels.join(", ") : undefined);
            addFact("Description", product.description);
            addFact("Declaration", product.declaration);
            if (Array.isArray(product.details)) {
              for (const detail of product.details) {
                if (detail && typeof detail.key === "string" && typeof detail.value === "string") addFact(detail.key, detail.value);
              }
            }
            const imageUrl = safeImageUrl(product.image_url);
            if (imageUrl) {
              const image = document.createElement("img");
              image.src = imageUrl;
              image.alt = text(product.name, "Product image");
              image.addEventListener("error", () => {
                const unavailable = document.createElement("p");
                unavailable.className = "muted";
                unavailable.textContent = "Product image unavailable.";
                image.replaceWith(unavailable);
              }, { once: true });
              content.prepend(image);
            }
            if (more.childElementCount > 1) content.append(more);
            card.append(content);
            productRoot.append(card);
          });
          status.textContent = views.length + (views.length === 1 ? " product" : " products") + " shown.";
        };

        window.addEventListener("message", (event) => {
          const message = event.data;
          if (message && message.method === "ui/notifications/tool-result") {
            render(message.params && (message.params.result || message.params));
          }
        });
        if (window.openai && "toolOutput" in window.openai) render(window.openai.toolOutput);
      })();
    </script>
  </body>
</html>`;
}
