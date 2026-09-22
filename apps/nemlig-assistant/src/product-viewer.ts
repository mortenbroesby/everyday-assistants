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
    formatMoney(product.price),
    product.unit_size,
    product.available ? "available" : "unavailable",
  ].filter((value): value is string => Boolean(value));
  const tags = product.tags.length ? ` (${product.tags.join(", ")})` : "";
  const context = view.context === "basket" && view.basket?.quantity !== undefined
    ? `, quantity ${formatNumber(view.basket.quantity)}`
    : view.context === "review"
      ? `, approved ${view.review?.approved === true ? "yes" : "no"}`
      : "";
  const detail = product.description ?? product.declaration;
  const details = product.details?.length
    ? `; ${product.details.map(({ key, value }) => `${key}: ${value}`).join(", ")}`
    : "";
  return `${facts.join(" — ")}${tags}${context}${detail ? `: ${detail}` : ""}${details}.`;
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

        const money = (value) =>
          typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) + " kr" : "Unknown price";

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
            const facts = document.createElement("p");
            facts.textContent = [money(product.price), text(product.unit_size, "Unknown unit"), product.available ? "Available" : "Unavailable"].join(" · ");
            content.append(facts);
            if (typeof product.description === "string" && product.description.trim()) {
              const description = document.createElement("p");
              description.textContent = product.description;
              content.append(description);
            }
            const imageUrl = safeImageUrl(product.image_url);
            if (imageUrl) {
              const image = document.createElement("img");
              image.src = imageUrl;
              image.alt = text(product.name, "Product image");
              content.prepend(image);
            }
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
