import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ProductView } from "../product-presentation.js";
import { safeNemligImageUrl } from "../product-presentation.js";

export function money(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} kr` : "Unknown price";
}

export function productName(view: ProductView, id?: number): string {
  return view.status === "complete"
    ? view.product.name ?? `Product ${view.product.id ?? id ?? "details unavailable"}`
    : `Product ${view.product_id ?? id ?? "details"}`;
}

export function isUsable(view: ProductView): boolean {
  return view.status === "complete" && view.product.available === true;
}

type ViewerButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  color?: "primary" | "secondary";
  variant?: "ghost";
  block?: boolean;
};

/** Viewer-local controls deliberately avoid host UI-kit layout defaults. */
export const ViewerButton = forwardRef<HTMLButtonElement, ViewerButtonProps>(function ViewerButton({
  color = "secondary", variant, block, className, type = "button", ...props
}, ref) {
  const classes = [
    "viewer-button",
    `viewer-button--${color}`,
    variant && `viewer-button--${variant}`,
    block && "viewer-button--block",
    className,
  ].filter(Boolean).join(" ");
  return <button ref={ref} type={type} className={classes} {...props} />;
});

function ProductStatusChips({ view }: { view: ProductView }) {
  if (view.status !== "complete") return null;
  const product = view.product;
  const chips = [
    product.is_organic === true && "Organic",
    product.is_frozen === true && "Frozen",
    product.is_on_discount === true && "Offer",
    product.available === false && "Unavailable",
    product.available === undefined && "Availability unknown",
  ].filter((chip): chip is string => Boolean(chip));
  return chips.length ? <span className="product-status-chips">{chips.map((chip) => <span key={chip} className="product-status-chip">{chip}</span>)}</span> : null;
}

export function ProductSummary({ view, quantity }: { view: ProductView; quantity?: number }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (view.status !== "complete") return <span>Product {view.product_id ?? "details"} details unavailable.</span>;

  const product = view.product;
  const image = safeNemligImageUrl(product.image_url);
  const quantityTotal = quantity !== undefined && typeof product.price === "number" ? quantity * product.price : product.price;

  return <span className="product-summary-content">
    {image && !imageFailed
      ? <img className="product-image" src={image} alt={product.name ?? "Product"} onError={() => setImageFailed(true)} />
      : <span className="product-image product-image-fallback" aria-hidden="true">No image</span>}
    <span className="product-copy"><span className="product-heading"><strong>{productName(view)}</strong><span>{money(quantityTotal)}</span></span>
      <span className="product-meta">{[product.brand, product.unit_size].filter(Boolean).join(" · ") || "Package details unavailable"}</span>
      <span className="product-meta">{product.unit_price === undefined ? product.unit ?? "Unit price unavailable" : `${money(product.unit_price)}${product.unit ? ` · ${product.unit}` : ""}`}</span>
      {quantity !== undefined && <span className="product-quantity">{quantity} ×</span>}
      <ProductStatusChips view={view} />
    </span>
  </span>;
}

export function QuantityControl({ label, quantity, disabled, onQuantity }: {
  label: string; quantity: number; disabled: boolean; onQuantity?: (quantity: number) => void;
}) {
  return <div className="quantity-control"><span>Quantity</span>
    <ViewerButton color="secondary" aria-label={`Decrease quantity of ${label}`} disabled={disabled || quantity <= 1} onClick={() => onQuantity?.(quantity - 1)}>−</ViewerButton>
    <span aria-live="polite">{quantity}</span>
    <ViewerButton color="secondary" aria-label={`Increase quantity of ${label}`} disabled={disabled || quantity >= Number.MAX_SAFE_INTEGER} onClick={() => onQuantity?.(quantity + 1)}>+</ViewerButton>
  </div>;
}

export function ProductFacts({ view, expandedFacts, onFactExpandedChange }: {
  view: ProductView; expandedFacts?: ReadonlySet<string>; onFactExpandedChange?: (factKey: string, expanded: boolean) => void;
}) {
  if (view.status !== "complete") return null;
  const product = view.product;
  const suppliedDetails = product.details?.filter((fact) => fact.key.trim() && fact.value.trim()) ?? [];
  return <>
    {product.description && <details className="product-fact" open={expandedFacts?.has("Varebeskrivelse")} onToggle={onFactExpandedChange ? (event) => onFactExpandedChange("Varebeskrivelse", event.currentTarget.open) : undefined}><summary>Varebeskrivelse</summary><p>{product.description}</p></details>}
    {product.declaration && <details className="product-fact" open={expandedFacts?.has("Varedeklaration")} onToggle={onFactExpandedChange ? (event) => onFactExpandedChange("Varedeklaration", event.currentTarget.open) : undefined}><summary>Varedeklaration</summary><p>{product.declaration}</p></details>}
    {suppliedDetails.length > 0 && <details className="product-fact" open={expandedFacts?.has("Detaljer om varen")} onToggle={onFactExpandedChange ? (event) => onFactExpandedChange("Detaljer om varen", event.currentTarget.open) : undefined}><summary>Detaljer om varen</summary><dl className="product-fact-list">{suppliedDetails.map(({ key, value }) => <div key={`${key}:${value}`}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details>}
  </>;
}

export function DestinationTabs({ destination, toDecideCount, readyCount, hasAlternatives, disabled, onNavigate }: {
  destination: "needs-review" | "ready" | "alternatives"; toDecideCount: number; readyCount: number; hasAlternatives: boolean; disabled: boolean;
  onNavigate: (destination: "needs-review" | "ready" | "alternatives") => void;
}) {
  return <nav className="destination-tabs" aria-label="Draft list destinations">
    <span className="destination-tabs-segments" data-viewer-control="segmented-tabs">
      <ViewerButton color="secondary" aria-current={destination === "needs-review" ? "page" : undefined} disabled={disabled} onClick={() => onNavigate("needs-review")}>To decide ({toDecideCount})</ViewerButton>
      <ViewerButton color="secondary" aria-current={destination === "ready" ? "page" : undefined} disabled={disabled} onClick={() => onNavigate("ready")}>Ready ({readyCount})</ViewerButton>
    </span>
    {hasAlternatives && destination !== "alternatives" && <ViewerButton color="secondary" variant="ghost" className="destination-tabs-return" disabled={disabled} onClick={() => onNavigate("alternatives")}>Return to existing alternatives</ViewerButton>}
  </nav>;
}

export function ActionFooter({ children }: { children: ReactNode }) {
  return <footer className="review-footer">{children}</footer>;
}
