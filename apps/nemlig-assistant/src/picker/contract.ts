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
  unit_size: z.string().optional(), description: z.string().optional(), brand: z.string().optional(), available: z.boolean().default(false),
  image_url: z.string().optional(), labels: z.array(z.string()).max(20).optional(),
});

export const pickerPayload = z.object({
  pantry_assumptions: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  items: z.array(z.object({
    ingredient: z.string().trim().min(1).max(120), quantity: z.number().int().positive(), confidence: z.number().int().min(0).max(100), favorite_match: z.boolean().optional(),
    product, alternatives: z.array(product).max(4).optional(),
  })).max(5),
  rejected: z.array(z.object({ ingredient: z.string().trim().min(1).max(120), reason: z.string().optional() })).max(5).optional(),
});

export type PickerPayload = z.infer<typeof pickerPayload>;

export const readPickerPayload = (result: unknown): PickerPayload | undefined => {
  const value = result as { structuredContent?: unknown; content?: unknown } | undefined;
  const text = Array.isArray(value?.content)
    ? value.content.find((entry): entry is { type: "text"; text: string } => typeof entry === "object" && entry !== null && (entry as { type?: unknown }).type === "text" && typeof (entry as { text?: unknown }).text === "string")?.text
    : undefined;
  const candidate = value?.structuredContent ?? (text ? (() => { try { return JSON.parse(text); } catch { return undefined; } })() : undefined);
  return pickerPayload.safeParse(candidate).data;
};
