import { createHash } from "node:crypto";
import type { ProductView } from "./product-presentation.js";
import { PRODUCT_VIEWER_RESOURCE_URI } from "./product-viewer-identity.js";
import { VIEWER_ASSET_ORIGIN } from "./viewer-asset-contract.js";

export { PRODUCT_VIEWER_RESOURCE_URI } from "./product-viewer-identity.js";
export const PRODUCT_VIEWER_MIME_TYPE = "text/html;profile=mcp-app";
export const PRODUCT_VIEWER_BUILD_MARKER = "nemlig-shell-1";
export const PRODUCT_VIEWER_RESOURCE_DOMAINS = Object.freeze([
  VIEWER_ASSET_ORIGIN,
  "https://nemlig.com",
  "https://www.nemlig.com",
]);
export const PRODUCT_VIEWER_CONNECT_DOMAINS = Object.freeze([
  VIEWER_ASSET_ORIGIN,
]);

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="nemlig-viewer-shell" content="${PRODUCT_VIEWER_BUILD_MARKER}">
  <meta name="nemlig-viewer-bundle" content="loading">
  <title>Nemlig Assistant</title>
  <style>
    body{font:15px/1.45 system-ui,sans-serif;margin:0;padding:16px;color:#273329;background:#fff}
    #load-error{max-width:36rem;margin:1rem auto;padding:1rem;border:1px solid #d9dfd8;border-radius:12px}
    button{font:inherit;min-height:44px;padding:8px 16px;border:0;border-radius:8px;background:#426744;color:#fff}
    [hidden]{display:none!important}
  </style>
</head>
<body>
  <p id="loading" role="status">Loading the current Local basket…</p>
  <p id="load-error" role="alert" hidden>The current Local basket could not be loaded. Nothing has been changed. <button id="retry" type="button">Try again</button></p>
  <div id="root"></div>
  <script>
    (() => {
      const assetOrigin = "${VIEWER_ASSET_ORIGIN}";
      const loading = document.getElementById("loading");
      const error = document.getElementById("load-error");
      const meta = document.querySelector('meta[name="nemlig-viewer-bundle"]');
      let attempt = 0;
      let loadingAttempt = false;
      let mounted = false;

      const validAsset = (asset, extension) => {
        if (!asset || typeof asset !== "object") throw Error("Invalid UI asset");
        if (typeof asset.url !== "string" || typeof asset.integrity !== "string") throw Error("Invalid UI asset");
        const match = /^\\/ui\\/nemlig\\/assets\\/([a-f0-9]{64})\\.(js|css)$/.exec(asset.url);
        const integrity = /^sha256-([A-Za-z0-9+/]{43}=)$/.exec(asset.integrity);
        if (!match || match[2] !== extension || !integrity) throw Error("Invalid UI asset");
        const digest = Array.from(atob(integrity[1]), (byte) => byte.charCodeAt(0).toString(16).padStart(2, "0")).join("");
        if (digest !== match[1]) throw Error("Invalid UI asset");
        return asset;
      };

      const load = (element) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error("UI asset timed out")), 5000);
        element.onload = () => { clearTimeout(timer); resolve(); };
        element.onerror = () => { clearTimeout(timer); reject(Error("UI asset unavailable")); };
        document.head.append(element);
      });

      const mount = async () => {
        if (loadingAttempt || mounted) return;
        loadingAttempt = true;
        loading.hidden = false;
        error.hidden = true;
        const currentAttempt = String(++attempt);
        window.__nemligViewerAttempt = currentAttempt;
        let link;
        let script;
        try {
          const manifestUrl = assetOrigin + "/ui/nemlig/manifest.json";
          const response = await fetch(manifestUrl, {
            cache: "no-store",
            credentials: "omit",
            redirect: "error",
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) throw Error("UI manifest unavailable");
          const manifest = await response.json();
          if (
            manifest?.schemaVersion !== 1 ||
            typeof manifest.build !== "string" ||
            !/^[a-f0-9]{64}$/.test(manifest.build)
          ) {
            throw Error("UI manifest invalid");
          }

          const css = validAsset(manifest.css, "css");
          const js = validAsset(manifest.js, "js");
          const buildDigest = Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(js.integrity + "\\n" + css.integrity),
              ),
            ),
            (byte) => byte.toString(16).padStart(2, "0"),
          ).join("");
          if (buildDigest !== manifest.build) throw Error("UI manifest invalid");
          link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = assetOrigin + css.url;
          link.integrity = css.integrity;
          link.crossOrigin = "anonymous";
          await load(link);

          script = document.createElement("script");
          script.type = "module";
          script.src = assetOrigin + js.url + "?attempt=" + currentAttempt;
          script.integrity = js.integrity;
          script.crossOrigin = "anonymous";
          await load(script);

          mounted = true;
          meta.content = manifest.build;
          loading.hidden = true;
        } catch {
          window.__nemligViewerAttempt = "";
          link?.remove();
          script?.remove();
          loading.hidden = true;
          error.hidden = false;
        } finally {
          loadingAttempt = false;
        }
      };

      document.getElementById("retry").addEventListener("click", mount);
      void mount();
    })();
  </script>
</body>
</html>`;

/** Metadata shared by MCP tool registrations when they advertise the viewer. */
export const PRODUCT_VIEWER_RESOURCE_METADATA = Object.freeze({
  ui: Object.freeze({ resourceUri: PRODUCT_VIEWER_RESOURCE_URI }),
  "openai/outputTemplate": PRODUCT_VIEWER_RESOURCE_URI,
});

const formatNumber = (value: unknown): string | undefined =>
  typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : undefined;

const formatMoney = (value: unknown): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "unknown price";
  }
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
    product.available === undefined
      ? "availability unknown"
      : product.available
        ? "available"
        : "unavailable",
  ].filter((value): value is string => Boolean(value));
  const labels = product.labels.length
    ? `labels: ${product.labels.join(", ")}`
    : "";
  const classifications = [
    product.is_organic === undefined
      ? undefined
      : `organic ${product.is_organic ? "yes" : "no"}`,
    product.is_frozen === undefined
      ? undefined
      : `frozen ${product.is_frozen ? "yes" : "no"}`,
    product.is_on_discount === undefined
      ? undefined
      : `on discount ${product.is_on_discount ? "yes" : "no"}`,
  ]
    .filter(Boolean)
    .join("; ");
  const category = [product.category, product.subcategory]
    .filter((value) => value?.trim())
    .join(" / ");
  const context =
    view.context === "basket"
      ? `Nemlig basket quantity ${formatNumber(view.basket?.quantity) ?? "unknown"}; line total ${formatMoney(view.basket?.line_total)}`
      : view.context === "review"
        ? `draft list quantity ${formatNumber(view.review?.quantity) ?? "unknown"}; line total ${formatMoney(view.review?.line_total)}; approved ${view.review?.approved === true ? "yes" : "no"}`
        : "";
  const details = product.details?.length
    ? product.details.map(({ key, value }) => `${key}: ${value}`).join("; ")
    : "";
  const description = product.description
    ? `description: ${product.description}`
    : "";
  const declaration = product.declaration
    ? `declaration: ${product.declaration}`
    : "";
  const unitPrice =
    product.unit_price === undefined
      ? ""
      : `unit price ${formatMoney(product.unit_price)} ${product.currency}${product.unit ? ` (${product.unit})` : ""}`;
  const content = [
    category ? `category: ${category}` : "",
    classifications,
    unitPrice,
    labels,
    context,
    description,
    declaration,
    details,
  ].filter(Boolean);
  return `${facts.join(" — ")}${content.length ? `; ${content.join("; ")}` : ""}.`;
};

/** Complete headless result retained when the host cannot display the UI resource. */
export function productViewsToText(views: readonly ProductView[]): string {
  if (!views.length) {
    return "No products found.";
  }
  return views
    .map((view, index) => `${index + 1}. ${formatProduct(view)}`)
    .join("\n");
}

export interface ProductViewerArtifact {
  readonly html: string;
  /** SHA-256 of the stable shell returned by the current resource. */
  readonly artifactId: string;
}

/** Returns the stable shell; its manifest selects the current UI bundle on mount. */
export function readProductViewerArtifact(): ProductViewerArtifact {
  return { html, artifactId: createHash("sha256").update(html).digest("hex") };
}

/** Serves the exact self-contained artifact included in the package. */
export function renderProductViewerHtml(): string {
  return readProductViewerArtifact().html;
}
