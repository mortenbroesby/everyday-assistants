import { z } from "zod";

export const IMAGE_ORIGINS = ["https://nemlig.com", "https://www.nemlig.com"] as const;

export const safePickerImageUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && IMAGE_ORIGINS.includes(url.origin as typeof IMAGE_ORIGINS[number]) ? url.href : undefined;
  } catch { return undefined; }
};

const product = z.object({
  id: z.number().int().positive(), name: z.string().optional(), price: z.number().optional(), unit_price: z.number().optional(),
  unit_size: z.string().optional(), description: z.string().max(2_000).optional(), declaration: z.string().max(4_000).optional(), brand: z.string().optional(), available: z.boolean().default(false),
  details: z.array(z.object({ key: z.string().max(100), value: z.string().max(300) }).strict()).max(20).optional(),
  image_url: z.string().optional(), labels: z.array(z.string()).max(20).optional(),
});

export const shoppingListRows = z.array(z.object({
  ingredient: z.string().trim().min(1).max(120),
  amount: z.string().trim().min(1).max(80),
  included: z.boolean().default(true),
}).strict()).min(1).max(50);

/** Bounded navigation data is display intent, never an authorization to write. */
export const reviewSnapshot = z.object({
  items: z.array(z.object({
    ingredient: z.string().trim().min(1).max(120),
    search_term: z.string().trim().min(1).max(120).optional(),
    product: z.number().int().positive(), alternatives: z.array(z.number().int().positive()).max(9).default([]),
    quantity: z.number().int().positive(), confidence: z.number().int().min(0).max(100),
    favorite_match: z.boolean().default(false), changed: z.boolean().default(false),
  }).strict()).max(50),
  pantry_assumptions: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
}).strict();

export const shoppingJourney = z.object({
  list: shoppingListRows,
  proposal: reviewSnapshot.optional(),
  choices: reviewSnapshot.optional(),
  previous: z.enum(["proposal", "choices"]).optional(),
}).strict();

export const listPayload = z.object({
  presentation: z.literal("list"), items: z.array(z.never()).max(0).default([]), list: shoppingListRows,
});

const productPayload = z.object({
  presentation: z.enum(["proposal", "choices", "recap"]).default("proposal"),
  journey: shoppingJourney.optional(),
  pantry_assumptions: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  items: z.array(z.object({
    search_term: z.string().trim().min(1).max(120).optional(),
    ingredient: z.string().trim().min(1).max(120), quantity: z.number().int().positive(), confidence: z.number().int().min(0).max(100), favorite_match: z.boolean().optional(),
    changed: z.boolean().default(false), product, alternatives: z.array(product).max(9).optional(),
  })).max(50),
  rejected: z.array(z.object({ ingredient: z.string().trim().min(1).max(120), reason: z.string().optional() })).max(50).optional(),
});

export const pickerPayload = z.union([listPayload, productPayload]);

export type PickerPayload = z.infer<typeof pickerPayload>;
export type PickerProduct = PickerPayload["items"][number]["product"];
export type ShoppingJourney = z.infer<typeof shoppingJourney>;

export const journeyFor = (payload: Exclude<PickerPayload, { presentation: "list" }>): ShoppingJourney => {
  const snapshot = {
    items: payload.items.map(({ product, alternatives, ...item }) => ({
      ...item,
      search_term: item.search_term ?? payload.journey?.[payload.presentation === "choices" ? "choices" : "proposal"]?.items.find((line) => line.ingredient === item.ingredient)?.search_term,
      favorite_match: item.favorite_match ?? false, product: product.id, alternatives: alternatives?.map(({ id }) => id) ?? [],
    })),
    pantry_assumptions: payload.pantry_assumptions ?? [],
  };
  return {
    list: payload.items.map(({ ingredient, quantity }) => ({ ingredient, amount: `${quantity} packages`, included: true })),
    ...payload.journey,
    ...(payload.presentation === "proposal" ? { proposal: payload.journey?.proposal ?? snapshot } : {}),
    ...(payload.presentation === "choices" ? { choices: snapshot } : {}),
  };
};

export const pickerProductEvidence = (product: PickerProduct): Array<{
  label: "Varebeskrivelse" | "Varedeklaration" | "Detaljer om varen";
  text?: string;
  details?: Array<{ key: string; value: string }>;
}> => [
  ...(product.description ? [{ label: "Varebeskrivelse" as const, text: product.description }] : []),
  ...(product.declaration ? [{ label: "Varedeklaration" as const, text: product.declaration }] : []),
  ...(product.details?.length ? [{ label: "Detaljer om varen" as const, details: product.details }] : []),
];

export const readPickerPayload = (result: unknown): PickerPayload | undefined => {
  const value = result as { structuredContent?: unknown; content?: unknown } | undefined;
  const text = Array.isArray(value?.content)
    ? value.content.find((entry): entry is { type: "text"; text: string } => typeof entry === "object" && entry !== null && (entry as { type?: unknown }).type === "text" && typeof (entry as { text?: unknown }).text === "string")?.text
    : undefined;
  const candidate = value?.structuredContent ?? (text ? (() => { try { return JSON.parse(text); } catch { return undefined; } })() : undefined);
  return pickerPayload.safeParse(candidate).data;
};
