import type { ProductView } from "../../product-presentation.js";

export function money(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(2)} kr`
    : "Unknown price";
}

export function productName(view: ProductView, id?: number): string {
  return view.status === "complete"
    ? (view.product.name ??
        `Product ${view.product.id ?? id ?? "details unavailable"}`)
    : `Product ${view.product_id ?? id ?? "details"}`;
}

export function isUsable(view: ProductView): boolean {
  return view.status === "complete" && view.product.available === true;
}
