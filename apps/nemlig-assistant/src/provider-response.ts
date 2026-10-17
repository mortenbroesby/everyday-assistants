import { compile } from "html-to-text";
import { z } from "zod";
import { NemligError } from "./nemlig-error.js";

const recordSchema = z.record(z.string(), z.unknown());
const recordsSchema = z.array(recordSchema);
const DAIRY_KEYWORDS = ["mælk", "ost", "fløde", "yoghurt", "smør", "skyr"];

export interface Product {
  id: number | undefined;
  name: string | undefined;
  price: number | undefined;
  unit: string;
  unitPrice: number | undefined;
  unitSize: string;
  description?: string;
  declaration?: string;
  details?: Array<{ key: string; value: string }>;
  brand: string;
  category: string;
  subcategory: string;
  imageUrl: string;
  available: boolean | undefined;
  labels: string[];
  isOrganic: boolean | undefined;
  isFrozen: boolean | undefined;
  isRefrigerated: boolean;
  isDairy: boolean;
  isLactoseFree: boolean;
  isGlutenFree: boolean;
  isVegan: boolean;
  isOnDiscount: boolean | undefined;
}

export interface Department {
  id: string;
  name: string;
}

export function normalizeDepartments(value: unknown): Department[] {
  const seen = new Set<string>();
  return asRecords(asRecord(value).content).flatMap((entry) => {
    const id = asString(entry.Url) ?? asString(entry.url);
    const name =
      asString(entry.Name) ?? asString(entry.Title) ?? asString(entry.name);
    if (
      !id ||
      !name ||
      !id.startsWith("/") ||
      id.startsWith("//") ||
      seen.has(id)
    ) {
      return [];
    }
    seen.add(id);
    return [{ id, name }];
  });
}

export interface Basket {
  items: Array<{
    id?: number;
    name: string | undefined;
    quantity: number | undefined;
    total: number | undefined;
  }>;
  productsPrice: number | undefined;
  deliveryPrice: number | undefined;
  numberOfProducts: number | undefined;
  deliveryTime: string | undefined;
}

/** Read-only saved-list source; temporary drafts remain process-local. */
export interface ShoppingList {
  id: number;
  name: string;
  items: Array<{ productId: number; quantity: number }>;
}
export interface ShoppingListOverview {
  id: number;
  name: string;
  productCount?: number;
  totalAmount?: number;
}

export const asRecord = (value: unknown): Record<string, unknown> => {
  const parsed = recordSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
};
export const asRecords = (value: unknown): Array<Record<string, unknown>> => {
  const parsed = recordsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
};
export const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
export const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
export const asId = (value: unknown): number | undefined => {
  const id =
    typeof value === "string" && /^\d+$/u.test(value)
      ? Number(value)
      : asNumber(value);
  return id !== undefined && Number.isSafeInteger(id) && id > 0
    ? id
    : undefined;
};

const convertProductText = compile({
  wordwrap: false,
  selectors: [
    { selector: "a", options: { ignoreHref: true } },
    { selector: "img", format: "skip" },
    { selector: "script", format: "skip" },
    { selector: "style", format: "skip" },
    { selector: "h1", options: { uppercase: false } },
    { selector: "h2", options: { uppercase: false } },
    { selector: "h3", options: { uppercase: false } },
    { selector: "h4", options: { uppercase: false } },
    { selector: "h5", options: { uppercase: false } },
    { selector: "h6", options: { uppercase: false } },
    { selector: "ul", format: "block" },
    { selector: "ol", format: "block" },
    { selector: "li", format: "block" },
  ],
  limits: { maxInputLength: 16_384, maxDepth: 32, maxChildNodes: 1_000 },
});

/** Converts untrusted provider markup to bounded plain text without fetching; raw input is capped before parsing. */
const boundedText = (value: unknown, length: number): string | undefined => {
  const html = asString(value)?.slice(0, 16_384);
  const text = html
    ? convertProductText(html).replace(/\s+/gu, " ").trim()
    : undefined;
  return text ? text.slice(0, length) : undefined;
};

const boundedAttributeValue = (value: unknown): string | undefined => {
  const values = (Array.isArray(value) ? value : [value]).slice(0, 20);
  let text = "";
  for (const entry of values) {
    const normalized = boundedText(entry, 300);
    if (!normalized) {
      continue;
    }
    text = `${text}${text ? ", " : ""}${normalized}`.slice(0, 300);
    if (text.length === 300) {
      break;
    }
  }
  return text ? text.slice(0, 300) : undefined;
};

export function normalizeBasket(value: unknown): Basket {
  const cart = asRecord(value);
  return {
    items: asRecords(cart.Lines).map((line) => ({
      id: asId(line.Id) ?? asId(line.ProductId),
      name: asString(line.ProductName) ?? asString(line.Name),
      quantity: asNumber(line.Quantity),
      total: asNumber(line.Total) ?? asNumber(line.Price),
    })),
    productsPrice: asNumber(cart.TotalProductsPrice),
    deliveryPrice: asNumber(cart.DeliveryPrice),
    numberOfProducts: asNumber(cart.NumberOfProducts),
    deliveryTime: asString(cart.FormattedDeliveryTime),
  };
}

const shoppingListItem = (
  value: Record<string, unknown>,
): { productId: number; quantity: number } | undefined => {
  const productId = asId(value.ProductId) ?? asId(value.Id);
  const quantity = asNumber(value.Quantity) ?? asNumber(value.Amount);
  return productId !== undefined &&
    quantity !== undefined &&
    Number.isSafeInteger(quantity) &&
    quantity > 0
    ? { productId, quantity }
    : undefined;
};

export function normalizeShoppingList(
  value: unknown,
  expectedId?: number,
): ShoppingList {
  const list = asRecord(value);
  const { id, name } = shoppingListIdentity(list, expectedId);
  const items = normalizedShoppingListItems(
    list.Lines ?? list.Products ?? list.Items ?? list.ShoppingListProducts,
  );
  assertUniqueShoppingListItems(items);
  return { id, name, items };
}

const shoppingListIdentity = (
  list: Record<string, unknown>,
  expectedId: number | undefined,
): { id: number; name: string } => {
  const id = asId(list.Id) ?? asId(list.ListId);
  const name = asString(list.Name) ?? asString(list.ListName);
  if (
    id === undefined ||
    (expectedId !== undefined && id !== expectedId) ||
    !name
  ) {
    throw new NemligError("Shopping list response is incomplete.");
  }
  return { id, name };
};

const normalizedShoppingListItems = (
  value: unknown,
): Array<{ productId: number; quantity: number }> => {
  if (!Array.isArray(value)) {
    throw new NemligError("Shopping list response is incomplete.");
  }
  const items = asRecords(value).flatMap((item) => {
    const normalized = shoppingListItem(item);
    return normalized ? [normalized] : [];
  });
  if (items.length !== value.length) {
    throw new NemligError("Shopping list response is incomplete.");
  }
  return items;
};

const assertUniqueShoppingListItems = (
  items: readonly { productId: number }[],
): void => {
  if (new Set(items.map((item) => item.productId)).size !== items.length) {
    throw new NemligError("Shopping list response is incomplete.");
  }
};

export const normalizeShoppingListOverviewPage = (
  value: unknown,
): { lists: ShoppingListOverview[]; numberOfPages: number } => {
  const response = asRecord(value);
  const rawLists = response.ShoppingListOverViewViewModels;
  const numberOfPages = asNumber(response.NumberOfPages);
  if (
    !Array.isArray(rawLists) ||
    numberOfPages === undefined ||
    !Number.isSafeInteger(numberOfPages) ||
    numberOfPages < 0
  ) {
    throw new NemligError("Shopping-list inventory response is incomplete.");
  }
  const lists = asRecords(rawLists).map((entry) => {
    const id = asId(entry.Id);
    const name = asString(entry.Name);
    const productCount = asNumber(entry.ProductsCount);
    const totalAmount = asNumber(entry.TotalAmount);
    if (
      id === undefined ||
      !name?.trim() ||
      (productCount !== undefined &&
        (!Number.isSafeInteger(productCount) || productCount < 0))
    ) {
      throw new NemligError("Shopping-list inventory response is incomplete.");
    }
    return {
      id,
      name,
      ...(productCount === undefined ? {} : { productCount }),
      ...(totalAmount === undefined ? {} : { totalAmount }),
    };
  });
  if (lists.length !== rawLists.length) {
    throw new NemligError("Shopping-list inventory response is incomplete.");
  }
  assertUniqueShoppingListOverviewIds(lists);
  return { lists, numberOfPages };
};

const assertUniqueShoppingListOverviewIds = (
  lists: readonly ShoppingListOverview[],
): void => {
  if (new Set(lists.map(({ id }) => id)).size !== lists.length) {
    throw new NemligError("Shopping-list inventory response is incomplete.");
  }
};

export function normalizeProducts(value: unknown, limit?: number): Product[] {
  const records =
    limit === undefined ? asRecords(value) : asRecords(value).slice(0, limit);
  // Keep the existing explicit provider-field mapping; this callback moved unchanged.
  // fallow-ignore-next-line complexity
  return records.map((item) => {
    const availability = asRecord(item.Availability);
    const labels = Array.isArray(item.Labels)
      ? item.Labels.filter(
          (label): label is string => typeof label === "string",
        )
      : [];
    const labelsLower = labels.map((label) => label.toLocaleLowerCase("da-DK"));
    const category = asString(item.Category) ?? "";
    const subcategory = asString(item.SubCategory) ?? "";
    const description = boundedText(item.Text, 2_000);
    const declaration = boundedText(item.DeclarationLabel, 4_000);
    const categoryLower = category.toLocaleLowerCase("da-DK");
    const subcategoryLower = subcategory.toLocaleLowerCase("da-DK");
    return {
      id: asId(item.Id),
      name: asString(item.Name),
      price: asNumber(item.Price),
      unit: asString(item.UnitPrice) ?? "",
      unitPrice: asNumber(item.UnitPriceCalc),
      unitSize: asString(item.Description) ?? "",
      ...(description ? { description } : {}),
      ...(declaration ? { declaration } : {}),
      ...(Array.isArray(item.Attributes)
        ? {
            details: asRecords(item.Attributes)
              .slice(0, 20)
              .flatMap((attribute) => {
                if (
                  attribute.IsVisible === false ||
                  attribute.Visible === false ||
                  attribute.DisplayVisible === false
                ) {
                  return [];
                }
                const key = boundedText(attribute.Key, 100);
                const value = boundedAttributeValue(attribute.Value);
                return key && value ? [{ key, value }] : [];
              }),
          }
        : {}),
      brand: asString(item.Brand) ?? "",
      category,
      subcategory,
      imageUrl: asString(item.PrimaryImage) ?? "",
      available:
        availability.IsDeliveryAvailable === false ||
        availability.IsAvailableInStock === false
          ? false
          : availability.IsDeliveryAvailable === true &&
              availability.IsAvailableInStock === true
            ? true
            : undefined,
      labels,
      isOrganic:
        labelsLower.some((label) => label.includes("øko")) || undefined,
      isFrozen: categoryLower ? categoryLower === "frost" : undefined,
      isRefrigerated: categoryLower === "køl",
      isDairy:
        categoryLower.includes("mejeri") ||
        DAIRY_KEYWORDS.some((keyword) => subcategoryLower.includes(keyword)),
      isLactoseFree: labelsLower.some((label) => label.includes("laktosefri")),
      isGlutenFree: labelsLower.some((label) => label.includes("glutenfri")),
      isVegan: labelsLower.some((label) => label.includes("vegan")),
      isOnDiscount:
        typeof item.DiscountItem === "boolean"
          ? item.DiscountItem
          : typeof item.IsDiscountItem === "boolean"
            ? item.IsDiscountItem
            : undefined,
    };
  });
}
