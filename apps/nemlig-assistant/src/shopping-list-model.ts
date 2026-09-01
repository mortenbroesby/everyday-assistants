import { z } from "zod";

export const MAX_SHOPPING_LISTS = 25;
export const MAX_SHOPPING_LIST_LINES = 50;
export const MAX_RESOLVED_LIST_LINES = 20;

const constraintsSchema = z.object({
  organic: z.boolean().optional(), vegan: z.boolean().optional(), gluten_free: z.boolean().optional(),
  lactose_free: z.boolean().optional(), available: z.boolean().optional(),
  max_price: z.number().nonnegative().optional(), max_unit_price: z.number().nonnegative().optional(),
}).strict();
const preferenceSchema = z.enum(["discount", "organic", "lowest_unit_price", "non_frozen"]);

export const shoppingListLineSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive().max(99),
  note: z.string().trim().min(1).max(200).optional(),
  constraints: constraintsSchema.default({}),
  preferences: z.array(preferenceSchema).max(4).default([]),
  preferred_product_id: z.number().int().positive().optional(),
}).strict();

export const shoppingListSchema = z.object({
  schema_version: z.literal(2), id: z.string().uuid(), name: z.string().trim().min(1).max(120),
  normalized_name: z.string().min(1).max(120), type: z.enum(["reusable", "occasion"]),
  status: z.enum(["active", "archived"]), revision: z.number().int().positive(),
  created_at: z.string().datetime(), updated_at: z.string().datetime(), archived_at: z.string().datetime().optional(),
  lines: z.array(shoppingListLineSchema).max(MAX_SHOPPING_LIST_LINES),
}).strict();

export const storedShoppingListCollectionSchema = z.object({
  schema_version: z.literal(2), owner_scope: z.string().regex(/^[0-9a-f]{64}$/u),
  generation: z.number().int().nonnegative(), lists: z.array(shoppingListSchema).max(MAX_SHOPPING_LISTS),
}).strict();

export type ShoppingListLine = z.infer<typeof shoppingListLineSchema>;
export type ShoppingList = z.infer<typeof shoppingListSchema>;
export type ShoppingListType = ShoppingList["type"];
export type ShoppingListStatus = ShoppingList["status"];
export type ShoppingListCollection = z.infer<typeof storedShoppingListCollectionSchema>;
