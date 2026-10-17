import type { Basket } from "./client.js";
import { NemligError } from "./nemlig-error.js";

export interface BasketPayload extends Record<string, unknown> {
  items: Basket["items"];
  products_price: number | undefined;
  delivery_price: number | undefined;
  number_of_products: number | undefined;
  delivery_time: string | undefined;
}

export interface ApplyResult extends Record<string, unknown> {
  status: "completed";
  operation: "additions";
  replayed: boolean;
  basket: BasketPayload;
  skipped_products?: Array<{ product_id: number; name: string }>;
  verified_additions?: number;
  cleanup_warning?: string;
}

/** The provider write may have completed, so the caller must not replay it. */
export class NativeTransferUnconfirmedError extends NemligError {
  override readonly name = "NativeTransferUnconfirmedError";
}

export const basketPayload = (basket: Basket): BasketPayload => ({
  items: basket.items,
  products_price: basket.productsPrice,
  delivery_price: basket.deliveryPrice,
  number_of_products: basket.numberOfProducts,
  delivery_time: basket.deliveryTime,
});
