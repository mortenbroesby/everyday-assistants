import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { EmptyMessage } from "@openai/apps-sdk-ui/components/EmptyMessage";
import { useEffect, useId, useState } from "react";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { ProductView } from "../product-presentation.js";
import { safeNemligImageUrl } from "../product-presentation.js";

type ProductPayload = {
  views?: ProductView[];
  products?: ProductView[];
  result?: ProductView[];
  items?: unknown[];
  detail_limit?: number;
  unenriched_count?: number;
};

type CandidateGlobals = { toolOutput?: unknown };
declare global {
  interface Window {
    openai?: CandidateGlobals;
  }
}

type ViewState = { payload: ProductPayload; views?: ProductView[]; unsupportedReview?: boolean } | undefined;

function readPayload(value: unknown): ViewState {
  if (!value || typeof value !== "object") return undefined;
  const envelope = value as { structuredContent?: unknown };
  const payload = (envelope.structuredContent && typeof envelope.structuredContent === "object"
    ? envelope.structuredContent
    : value) as ProductPayload;
  const views = Array.isArray(payload.views) ? payload.views
    : Array.isArray(payload.products) ? payload.products
      : Array.isArray(payload.result) ? payload.result
        : Array.isArray(value) ? value as ProductView[] : undefined;
  if (views) return { payload, views };
  return payload && typeof payload === "object" && "review" in payload
    ? { payload, unsupportedReview: true }
    : undefined;
}

function useToolOutput(): ViewState {
  const [state, setState] = useState(() => readPayload(window.openai?.toolOutput));

  useApp({
    appInfo: { name: "nemlig-product-viewer-candidate", version: "0.1.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolresult = (result) => {
        const next = readPayload(result);
        if (next) setState(next);
      };
    },
  });

  useEffect(() => {
    const onGlobals = (event: Event) => {
      const detail = (event as CustomEvent<{ globals?: CandidateGlobals }>).detail;
      const next = readPayload(detail?.globals?.toolOutput);
      if (next) setState(next);
    };
    // OpenAI hosts may provide the initial globals before the standard MCP Apps notification.
    window.addEventListener("openai:set_globals", onGlobals);
    return () => {
      window.removeEventListener("openai:set_globals", onGlobals);
    };
  }, []);

  return state;
}

function money(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} kr` : "Unknown price";
}

function ProductCard({ view }: { view: ProductView }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  if (view.status !== "complete") {
    return <article className="product-card"><p>Product {view.product_id ?? "details"} details unavailable.</p></article>;
  }

  const { product } = view;
  const imageUrl = safeNemligImageUrl(product.image_url);
  const quantity = view.context === "basket" ? view.basket?.quantity
    : view.context === "review" ? view.review?.quantity : undefined;
  const linePrice = quantity !== undefined && product.price !== undefined ? quantity * product.price : product.price;
  const facts = product.details?.filter(({ key, value }) => key.trim() && value.trim()) ?? [];

  return <article className="product-card">
    <div className="product-details">
      <Button color="secondary" variant="ghost" pill={false} block className="product-summary" aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpanded((value) => !value)}>
        {imageUrl && !imageFailed
          ? <img className="product-image" src={imageUrl} alt={product.name ?? "Product"} onError={() => setImageFailed(true)} />
          : <span className="product-image product-image-fallback" aria-hidden="true">No image</span>}
        <span className="product-copy">
          <span className="product-heading"><strong>{product.name ?? `Product ${product.id ?? "details unavailable"}`}</strong><span>{money(linePrice)}</span></span>
          <span className="product-meta">{[product.brand, product.unit_size].filter(Boolean).join(" · ") || "Package details unavailable"}</span>
          <span className="product-meta">{product.unit_price === undefined ? product.unit ?? "Unit price unavailable" : `${money(product.unit_price)}${product.unit ? ` · ${product.unit}` : ""}`}</span>
          {quantity !== undefined && <span className="product-quantity">{quantity} ×</span>}
          {product.available === false && <Badge color="danger">Unavailable</Badge>}
          {product.available === undefined && <Badge color="warning">Availability unknown</Badge>}
        </span>
      </Button>
      <div id={detailId} className="product-expanded" hidden={!expanded}>
        <p>Product ID: {product.id ?? "Unknown"}</p>
        {product.description && <details className="product-fact"><summary>Varebeskrivelse</summary><p>{product.description}</p></details>}
        {product.declaration && <details className="product-fact"><summary>Varedeklaration</summary><p>{product.declaration}</p></details>}
        {facts.length > 0 && <details className="product-fact"><summary>Detaljer om varen</summary>{facts.map(({ key, value }) => <p key={`${key}:${value}`}>{key}: {value}</p>)}</details>}
        {quantity !== undefined && <p>{view.context === "basket" ? "Basket" : "Selection"} quantity: {quantity} · Line total: {money(view.context === "basket" ? view.basket?.line_total : view.review?.line_total)}</p>}
      </div>
    </div>
  </article>;
}

export function ProductViewer() {
  const state = useToolOutput();
  const actualBasket = state?.payload.detail_limit !== undefined && Array.isArray(state.payload.items);

  return <div className="app-frame"><main className="viewer" aria-labelledby="title">
    <h1 id="title">{actualBasket ? "Actual Nemlig basket" : "Nemlig products"}</h1>
    <p className="intro">{actualBasket ? "Your current Nemlig basket. This view cannot change it." : "Inspect product details here or continue in conversation."}</p>
    {!state
      ? <p className="status" role="status">Loading your Nemlig selection…</p>
      : state.unsupportedReview
        ? <p className="status" role="status">Interactive local review is not implemented in this candidate. The current production viewer remains unchanged.</p>
        : state.views?.length
          ? <section className="product-list" aria-label="Product results">{state.views.map((view, index) => <ProductCard key={`${view.status === "complete" ? view.product.id : view.product_id}-${index}`} view={view} />)}</section>
          : <div className="empty" role="status"><EmptyMessage><EmptyMessage.Title>{actualBasket ? "Your Nemlig basket is empty." : "No products found."}</EmptyMessage.Title></EmptyMessage></div>}
    {actualBasket && state.payload.unenriched_count ? <p className="status">{state.payload.unenriched_count} basket lines do not have current product details.</p> : null}
  </main></div>;
}
