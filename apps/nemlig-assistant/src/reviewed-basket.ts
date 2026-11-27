import { createHash } from "node:crypto";
import { z } from "zod";
import { NemligError } from "./nemlig-error.js";
import { asId, normalizeBasket, type Basket } from "./provider-response.js";

export type BasketEdit =
  { kind: "remove"; productId: number } | { kind: "clear" };

export interface BasketEditReview {
  basket: Basket;
  fingerprint: string;
}

const noOrderNumber = z
  .union([z.literal(""), z.literal(0), z.null()])
  .optional();
const productBasket = z.object({
  BasketGuid: z
    .string()
    .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu)
    .refine((guid) => guid !== "00000000-0000-0000-0000-000000000000"),
  IsBackedByOrder: z.literal(false),
  BackedByOrderNumber: noOrderNumber,
  OrderNumber: noOrderNumber,
  Recipes: z.tuple([]),
  MealBoxes: z.tuple([]),
  Coupons: z.tuple([]),
  Lines: z.array(z.record(z.string(), z.unknown())),
  TimeslotUtc: z.string().nullish(),
});

/** The display parser tolerates partial responses. Deletion needs evidence that
 * every part of the provider basket is represented by the reviewed lines. */
export function inspectEditableBasket(raw: unknown) {
  const parsed = productBasket.safeParse(raw);
  if (!parsed.success) {
    throw new NemligError(
      "Only fully identified ordinary product baskets can be reviewed for removal.",
    );
  }
  const cart = parsed.data;
  const basket = normalizeBasket(raw);
  const ids = new Set<number>();
  let units = 0;
  if (basket.items.length !== cart.Lines.length) {
    throw new NemligError("Basket lines are incomplete.");
  }
  for (const [index, item] of basket.items.entries()) {
    const line = cart.Lines[index]!;
    if (
      item.id === undefined ||
      (line.Id !== undefined && asId(line.Id) !== item.id) ||
      (line.ProductId !== undefined && asId(line.ProductId) !== item.id) ||
      ids.has(item.id) ||
      !item.name?.trim() ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity! <= 0
    ) {
      throw new NemligError("Basket line identity or quantity is ambiguous.");
    }
    ids.add(item.id);
    units += item.quantity!;
  }
  if (!Number.isSafeInteger(units) || units !== basket.numberOfProducts) {
    throw new NemligError("Basket unit count is incomplete.");
  }
  return { basket, guid: cart.BasketGuid, timeslot: cart.TimeslotUtc ?? null };
}

type EditableBasket = ReturnType<typeof inspectEditableBasket>;

function contentKey(items: Basket["items"]): string {
  return JSON.stringify(
    items
      .map(({ id, name, quantity }) => [id, name, quantity])
      .sort(([a], [b]) => Number(a) - Number(b)),
  );
}

export function reviewedFingerprint(
  edit: BasketEdit,
  snapshot: EditableBasket,
  account: string,
): string {
  if (
    edit.kind !== "clear" &&
    (edit.kind !== "remove" ||
      !snapshot.basket.items.some((item) => item.id === edit.productId))
  ) {
    throw new NemligError("Select an exact product line from this basket.");
  }
  if (!snapshot.basket.items.length) {
    throw new NemligError("The basket is already empty.");
  }
  const scope = edit.kind === "remove" ? edit.productId : "clear";
  return createHash("sha256")
    .update(
      JSON.stringify([
        account,
        snapshot.guid,
        snapshot.timeslot,
        scope,
        contentKey(snapshot.basket.items),
      ]),
    )
    .digest("hex");
}

export function verifyEditedBasket(
  edit: BasketEdit,
  before: EditableBasket,
  after: EditableBasket,
) {
  const remaining =
    edit.kind === "clear"
      ? []
      : before.basket.items.filter((item) => item.id !== edit.productId);
  if (
    before.guid !== after.guid ||
    before.timeslot !== after.timeslot ||
    contentKey(remaining) !== contentKey(after.basket.items)
  ) {
    throw new NemligError(
      "Basket edit readback did not match the reviewed change.",
    );
  }
}
