import { randomUUID } from "node:crypto";
import {
  NemligError,
  type BasketEdit,
  type Basket,
  type ShoppingClient,
} from "./client.js";

type Pending = {
  owner: string;
  edit: BasketEdit;
  fingerprint: string;
  id: string;
  expires: number;
};
// Hosted clients are principal-scoped and outlive individual MCP server instances.
// Keeping only the latest review also bounds memory and invalidates older prompts.
const pending = new WeakMap<ShoppingClient, Pending>();

function deletionPrompt(edit: BasketEdit, basket: Basket): string {
  const affected =
    edit.kind === "clear"
      ? basket.items
      : basket.items.filter((item) => item.id === edit.productId);
  const lines = affected.map(
    (item) => `${item.quantity} × ${item.name ?? "Product"} (#${item.id})`,
  );
  return [
    edit.kind === "clear"
      ? "Clear the entire Nemlig basket?"
      : "Remove this entire line from the Nemlig basket?",
    ...lines,
    "Please avoid editing this basket on another device until this finishes. Simultaneous changes can also be removed.",
  ].join("\n");
}

export async function reviewDeletion(
  client: ShoppingClient,
  owner: string,
  edit: BasketEdit,
  signal?: AbortSignal,
) {
  if (!client.reviewBasketEdit) {
    throw new NemligError("Basket deletion is unavailable.");
  }
  const { basket, fingerprint } = await client.reviewBasketEdit(edit, signal);
  const id = randomUUID();
  pending.set(client, {
    owner,
    edit,
    fingerprint,
    id,
    expires: Date.now() + 5 * 60_000,
  });
  return { review_id: id, prompt: deletionPrompt(edit, basket) };
}

export async function confirmDeletion(
  client: ShoppingClient,
  owner: string,
  id: string,
  signal?: AbortSignal,
) {
  const review = pending.get(client);
  if (
    !review ||
    review.owner !== owner ||
    review.id !== id ||
    Date.now() >= review.expires ||
    !client.applyReviewedBasketEdit
  ) {
    throw new NemligError(
      "This basket deletion review is unavailable. Review the current basket again.",
    );
  }
  pending.delete(client);
  return client.applyReviewedBasketEdit(
    review.edit,
    review.fingerprint,
    signal,
  );
}
