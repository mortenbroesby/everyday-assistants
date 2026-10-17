import { createHash, randomUUID } from "node:crypto";
import { compile } from "html-to-text";
import { z } from "zod";
import { NemligError } from "./nemlig-error.js";

export { NemligError } from "./nemlig-error.js";

const API_BASE_URL = "https://www.nemlig.com/webapi";
export const SEARCH_GATEWAY_URL =
  "https://webapi.prod.knl.nemlig.it/searchgateway/api";
export const NEMLIG_API_ATTEMPT_TIMEOUT_MS = 120_000;
const NEMLIG_READ_MAX_RETRIES = 1;
const KNOWN_PRODUCT_LIMIT = 1_000;
const SHOPPING_LIST_PAGE_SIZE = 6;
const MAX_SHOPPING_LIST_PAGES = 100;

const recordSchema = z.record(z.string(), z.unknown());
const recordsSchema = z.array(recordSchema);
const DAIRY_KEYWORDS = ["mælk", "ost", "fløde", "yoghurt", "smør", "skyr"];
const DEFAULT_PRODUCT_TIMESTAMP = "AAAAAAAA-YFA_17hS";
const DEFAULT_CORRELATION_ID = "YFA_17hS";

/** A failure known to occur before the provider's basket-write request was dispatched. */
export class BasketPreflightError extends NemligError {
  override readonly name: string = "BasketPreflightError";
}

export class BasketSnapshotChangedError extends BasketPreflightError {
  override readonly name = "BasketSnapshotChangedError";

  constructor() {
    super("Basket changed since the last verified read.");
  }
}

/** Only a 404 from the exact product endpoint establishes a missing product. */
export class ProductNotFoundError extends NemligError {
  override readonly name = "ProductNotFoundError";

  constructor(productId: number) {
    super(`Product ${productId} could not be resolved exactly.`, 404);
  }
}

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
export interface ProductPage {
  products: Product[];
  page: number;
  hasNext: boolean;
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

export function matchFavorites(
  products: Product[],
  query: string,
  limit?: number,
): Product[] {
  const needle = query.trim().toLocaleLowerCase("da-DK");
  if (!needle) {
    throw new NemligError("Favorites query is required.");
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new NemligError("Favorites limit must be positive.");
  }
  const matches = products.filter((product) =>
    product.name?.toLocaleLowerCase("da-DK").includes(needle),
  );
  return limit === undefined ? matches : matches.slice(0, limit);
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

export interface BasketAddition {
  productId: number;
  quantity: number;
}

/** Provider-owned contents used as the durable backing for a Local basket. */
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

/** Stable basket identity for additive writes; prices are estimates, not approval limits. */
const basketFingerprint = (basket: Basket): string => {
  const stable = {
    items: basket.items
      .map((item) => ({
        id: item.id ?? null,
        name: item.name ?? null,
        quantity: item.quantity ?? null,
      }))
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
    numberOfProducts: basket.numberOfProducts ?? null,
    deliveryTime: basket.deliveryTime ?? null,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
};

const basketQuantities = (
  basket: Basket,
  message: string,
  ErrorType: typeof NemligError | typeof BasketPreflightError,
): Map<number, number> => {
  const quantities = new Map<number, number>();
  for (const item of basket.items) {
    if (
      !Number.isSafeInteger(item.id) ||
      item.id! < 1 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity! < 0 ||
      quantities.has(item.id!)
    ) {
      throw new ErrorType(message);
    }
    quantities.set(item.id!, item.quantity!);
  }
  return quantities;
};

const parseBasketAdditions = (
  additions: BasketAddition[],
): Map<number, number> => {
  if (!Array.isArray(additions) || additions.length === 0) {
    throw new BasketPreflightError("At least one basket addition is required.");
  }
  const requested = new Map<number, number>();
  for (const addition of additions) {
    if (
      !Number.isSafeInteger(addition.productId) ||
      addition.productId < 1 ||
      !Number.isSafeInteger(addition.quantity) ||
      addition.quantity < 1 ||
      requested.has(addition.productId)
    ) {
      throw new BasketPreflightError(
        "Basket additions must have unique positive product IDs and quantities.",
      );
    }
    requested.set(addition.productId, addition.quantity);
  }
  return requested;
};

const assertBasketAdditionReadback = (
  before: Basket,
  after: Basket,
  requested: Map<number, number>,
): void => {
  const baseline = basketQuantities(
    before,
    "Basket baseline is ambiguous; inspect the basket and do not retry.",
    NemligError,
  );
  const observed = basketQuantities(
    after,
    "Basket readback is ambiguous; inspect the basket and do not retry.",
    NemligError,
  );
  for (const [id, oldQuantity] of baseline) {
    if ((observed.get(id) ?? 0) < oldQuantity) {
      throw new NemligError(
        "A previous basket line was not preserved; inspect the basket and do not retry.",
      );
    }
  }
  for (const [id, quantity] of requested) {
    if (observed.get(id) !== (baseline.get(id) ?? 0) + quantity) {
      throw new NemligError(
        "Bulk basket readback did not confirm the exact additive quantities; inspect the basket and do not retry.",
      );
    }
  }
};

const assertSafeBasketIncreases = (
  baseline: Map<number, number>,
  requested: Map<number, number>,
): void => {
  for (const [id, quantity] of requested) {
    if ((baseline.get(id) ?? 0) + quantity > Number.MAX_SAFE_INTEGER) {
      throw new BasketPreflightError(
        "Basket quantity cannot be increased safely; no provider write was sent.",
      );
    }
  }
};

const asRecord = (value: unknown): Record<string, unknown> => {
  const parsed = recordSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
};
const asRecords = (value: unknown): Array<Record<string, unknown>> => {
  const parsed = recordsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
};
const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const asId = (value: unknown): number | undefined => {
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

function normalizeBasket(value: unknown): Basket {
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

function normalizeShoppingList(
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

const normalizeShoppingListOverviewPage = (
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

type Fetch = typeof fetch;

const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("Read cancelled.", "AbortError");
const throwIfAborted = (signal: AbortSignal | null | undefined): void => {
  if (signal?.aborted) {
    throw abortReason(signal);
  }
};
const xsrfCookieName = "XSRF-TOKEN";
const xsrfHeaderName = "X-XSRF-TOKEN";

const decodeCookie = (value: string): string | undefined => {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

export class NemligClient {
  private readonly cookies = new Map<string, Map<string, string>>();
  private readonly defaultTimeslot: string;
  private loggedIn = false;
  private sessionGeneration = 0;
  private accessToken?: string;
  private userId?: string;
  private productTimestamp?: string;
  private correlationId?: string;
  private deliveryZoneId = 1;
  private readonly knownProducts = new Map<number, Product>();
  private readonly hydratedProductIds = new Set<number>();
  private timeslot: string;
  private timeslotId = 0;

  constructor(
    private readonly fetcher: Fetch = fetch,
    now: Date = new Date(),
  ) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = [
      tomorrow.getFullYear(),
      tomorrow.getMonth() + 1,
      tomorrow.getDate(),
    ]
      .map((part) =>
        String(part).padStart(part === tomorrow.getFullYear() ? 4 : 2, "0"),
      )
      .join("");
    this.defaultTimeslot = `${date}15-60-240`;
    this.timeslot = this.defaultTimeslot;
  }

  isLoggedIn(): boolean {
    return this.loggedIn;
  }

  // Called structurally by runtime.ts to fence reads after a session refresh.
  // fallow-ignore-next-line unused-class-member
  getSessionGeneration(): number {
    return this.sessionGeneration;
  }

  async login(username: string, password: string): Promise<void> {
    this.resetSessionState();
    if (!username || !password) {
      throw new NemligError("Nemlig username and password are required.");
    }
    try {
      const response = await this.json(
        `${API_BASE_URL}/login`,
        {
          method: "POST",
          body: JSON.stringify({
            Username: username,
            Password: password,
            CheckForExistingProducts: true,
            DoMerge: true,
            AppInstalled: false,
            SaveExistingBasket: false,
          }),
        },
        "Login",
        false,
        false,
        false,
      );
      const data = asRecord(response);
      if (data.MergeSuccessful === false) {
        throw new NemligError(
          "Nemlig requires a basket decision. Resolve it on Nemlig.com; the assistant will not choose a remove or save option.",
        );
      }
      if (!data.RedirectUrl && !data.MergeSuccessful) {
        throw new NemligError("Login failed: invalid credentials");
      }
      const timeslot = asString(data.TimeslotUtc);
      await this.refreshSession();
      if (timeslot) {
        this.timeslot = timeslot;
      }
      this.loggedIn = true;
      this.sessionGeneration += 1;
    } catch (error) {
      this.resetSessionState();
      throw error instanceof NemligError
        ? error
        : new NemligError("Login failed: session bootstrap unavailable.");
    }
  }

  async validateCredentials(
    username: string,
    password: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!username || !password) {
      throw new NemligError("Nemlig username and password are required.");
    }
    const response = asRecord(
      await this.json(
        `${API_BASE_URL}/login`,
        {
          method: "POST",
          signal,
          body: JSON.stringify({
            Username: username,
            Password: password,
            CheckForExistingProducts: true,
            DoMerge: true,
            AppInstalled: false,
            SaveExistingBasket: false,
          }),
        },
        "Validate login",
        false,
        false,
        false,
      ),
    );
    if (response.MergeSuccessful === false) {
      throw new NemligError(
        "Nemlig requires a basket decision. Resolve it on Nemlig.com; the assistant will not choose a remove or save option.",
      );
    }
    if (!response.RedirectUrl && !response.MergeSuccessful) {
      throw new NemligError("Login failed: invalid credentials");
    }
    const token = asRecord(
      await this.json(
        `${API_BASE_URL}/Token`,
        { signal },
        "Validate account",
        false,
        false,
        false,
      ),
    );
    if (!asString(token.access_token)) {
      throw new NemligError("Validate account failed: invalid response data.");
    }
  }

  async searchProducts(
    query: string,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<Product[]> {
    if (!query.trim()) {
      throw new NemligError("Search query is required.");
    }
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new NemligError("Search limit must be positive.");
    }
    throwIfAborted(signal);
    if (!this.productTimestamp) {
      await this.refreshSession(signal);
    }

    const primary = this.rememberProducts(
      await this.searchGateway(query, limit, signal),
    );
    if (primary.length || !this.accessToken) {
      return primary;
    }

    const quick = await this.optionalJson(
      `${SEARCH_GATEWAY_URL}/quick?${new URLSearchParams({
        query,
        correlationId: this.correlationId ?? "",
      })}`,
      "Quick search",
      true,
      signal,
    );
    for (const category of asRecords(asRecord(quick).Categories).slice(0, 3)) {
      const path = asString(category.Url);
      if (!path) {
        continue;
      }
      const products = this.rememberProducts(
        await this.productsByCategory(path, limit, 1, signal),
      );
      if (products.length) {
        return products;
      }
    }
    return [];
  }

  /**
   * Returns an already observed exact product without another provider request,
   * or resolves it from the catalogue when absent. Use `getFreshProduct` for
   * the final comparison immediately before a basket mutation.
   */
  async getProduct(productId: number, signal?: AbortSignal): Promise<Product> {
    this.validateProductId(productId);
    throwIfAborted(signal);
    const known = this.knownProducts.get(productId);
    if (known && this.hydratedProductIds.has(productId)) {
      return known;
    }
    return this.fetchExactProduct(productId, signal);
  }

  /**
   * Resolves the exact product from the current catalogue, bypassing this
   * client's observed-product cache for final pre-mutation revalidation.
   */
  async getFreshProduct(
    productId: number,
    signal?: AbortSignal,
  ): Promise<Product> {
    this.validateProductId(productId);
    return this.fetchExactProduct(productId, signal);
  }

  private validateProductId(productId: number): void {
    if (!Number.isInteger(productId) || productId < 1) {
      throw new NemligError("Product ID must be positive.");
    }
  }

  private async fetchExactProduct(
    productId: number,
    signal?: AbortSignal,
  ): Promise<Product> {
    throwIfAborted(signal);
    if (!this.productTimestamp) {
      await this.refreshSession(signal);
    }
    const endpoint = `${API_BASE_URL}/${this.productTimestamp ?? DEFAULT_PRODUCT_TIMESTAMP}/${this.timeslot}/${this.deliveryZoneId}/${this.userId ?? "0"}/Products/Get`;
    let response: Record<string, unknown>;
    try {
      response = asRecord(
        await this.json(
          `${endpoint}?${new URLSearchParams({ id: String(productId) })}`,
          { signal },
          `Get product ${productId}`,
        ),
      );
    } catch (error) {
      if (error instanceof NemligError && error.status === 404) {
        throw new ProductNotFoundError(productId);
      }
      throw error;
    }
    const payload =
      asRecord(response.Product).Id === undefined
        ? response
        : asRecord(response.Product);
    const product = normalizeProducts([payload], 1)[0];
    if (!product || product.id !== productId) {
      throw new NemligError(
        `Product ${productId} could not be resolved exactly.`,
      );
    }
    return this.rememberProducts([product], true)[0]!;
  }

  async listFavorites(
    limit?: number,
    page = 1,
    signal?: AbortSignal,
  ): Promise<Product[]> {
    this.requireLogin("view favorites");
    throwIfAborted(signal);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new NemligError("Favorites limit must be positive.");
    }
    if (!Number.isInteger(page) || page < 1) {
      throw new NemligError("Favorites page must be positive.");
    }
    const offset = limit === undefined ? 0 : (page - 1) * limit;
    if (!this.productTimestamp) {
      await this.refreshSession(signal);
    }

    const pageUrl = new URL("/favoritter", "https://www.nemlig.com");
    pageUrl.searchParams.set("GetAsJson", "1");
    pageUrl.searchParams.set("t", this.timeslot);
    pageUrl.searchParams.set("d", "1");
    const favoritesPage = asRecord(
      await this.json(pageUrl.toString(), { signal }, "Get favorites page"),
    );
    const groups = asRecords(favoritesPage.content)
      .filter((entry) => entry.TemplateName === "productlistshowallspot")
      .map((entry) => entry.ProductGroupId)
      .filter(
        (id): id is string | number =>
          typeof id === "string" || typeof id === "number",
      );
    const products: Product[] = [];
    const seen = new Set<number | string>();
    const target =
      limit === undefined ? Number.POSITIVE_INFINITY : offset + limit;
    for (const group of groups) {
      let groupPage = 1;
      const seenPageSignatures = new Set<string>();
      while (products.length < target) {
        throwIfAborted(signal);
        const pageSize =
          limit === undefined ? 50 : Math.min(50, target - products.length);
        const batch = await this.productsByGroup(
          group,
          pageSize,
          "Get favorite products",
          groupPage,
          signal,
        );
        const pageSignature = JSON.stringify(
          batch.map((product) => product.id ?? null),
        );
        if (seenPageSignatures.has(pageSignature)) {
          break;
        }
        seenPageSignatures.add(pageSignature);
        for (const product of batch) {
          if (product.id === undefined || seen.has(product.id)) {
            continue;
          }
          seen.add(product.id);
          products.push(product);
        }
        if (batch.length < pageSize) {
          break;
        }
        groupPage += 1;
      }
      if (products.length === target) {
        break;
      }
    }
    return this.rememberProducts(products.slice(offset, target));
  }

  async listDepartments(): Promise<Department[]> {
    const page = await this.optionalJson(
      "https://www.nemlig.com/?GetAsJson=1",
      "Get departments",
    );
    return normalizeDepartments(page);
  }

  async browseDepartment(
    departmentId: string,
    limit = 20,
    page = 1,
  ): Promise<ProductPage> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new NemligError("Department page size must be positive.");
    }
    if (!Number.isInteger(page) || page < 1) {
      throw new NemligError("Department page must be positive.");
    }
    const department = (await this.listDepartments()).find(
      (item) => item.id === departmentId,
    );
    if (!department) {
      throw new NemligError("Unknown department ID; list departments again.");
    }
    const products = this.rememberProducts(
      await this.productsByCategory(department.id, limit, page),
    );
    const seen = new Set<number>();
    const unique = products.filter((product) => {
      if (product.id === undefined) {
        return true;
      }
      if (seen.has(product.id)) {
        return false;
      }
      seen.add(product.id);
      return true;
    });
    return { products: unique, page, hasNext: products.length === limit };
  }

  async getCart(signal?: AbortSignal): Promise<Basket> {
    this.requireLogin("view the basket");
    throwIfAborted(signal);
    return normalizeBasket(
      await this.json(
        `${API_BASE_URL}/basket/GetBasket`,
        { signal },
        "Get basket",
      ),
    );
  }

  providerIdentity(): string {
    this.requireLogin("identify the connected Nemlig account");
    if (!this.userId) {
      throw new NemligError(
        "Connected Nemlig account identity is unavailable.",
      );
    }
    return this.userId;
  }

  // Reject incomplete or changing pages instead of exposing a partial inventory.
  // fallow-ignore-next-line complexity
  async listShoppingLists(
    signal?: AbortSignal,
  ): Promise<ShoppingListOverview[]> {
    this.requireLogin("list shopping lists");
    this.providerIdentity();
    const take = SHOPPING_LIST_PAGE_SIZE;
    const first = await this.getShoppingLists(0, take, signal);
    const pageCount = Math.max(
      Math.ceil(first.lists.length / take),
      first.numberOfPages,
    );
    if (
      (first.numberOfPages === 0 && first.lists.length > 0) ||
      first.lists.length > take ||
      pageCount > MAX_SHOPPING_LIST_PAGES ||
      (pageCount > 1 && first.lists.length !== take)
    ) {
      throw new NemligError("Shopping-list inventory is incomplete.");
    }
    const lists = [...first.lists];
    const ids = new Set(lists.map(({ id }) => id));
    for (let page = 1; page < pageCount; page += 1) {
      const next = await this.getShoppingLists(page * take, take, signal);
      if (
        next.numberOfPages !== first.numberOfPages ||
        next.lists.length === 0 ||
        next.lists.length > take ||
        (page < pageCount - 1 && next.lists.length !== take) ||
        next.lists.some(({ id }) => ids.has(id))
      ) {
        throw new NemligError(
          "Shopping-list inventory changed or is incomplete.",
        );
      }
      for (const list of next.lists) {
        ids.add(list.id);
        lists.push(list);
      }
    }
    return lists;
  }

  async getShoppingLists(
    skip = 0,
    take = SHOPPING_LIST_PAGE_SIZE,
    signal?: AbortSignal,
  ): Promise<{ lists: ShoppingListOverview[]; numberOfPages: number }> {
    this.requireLogin("list shopping lists");
    if (
      !Number.isSafeInteger(skip) ||
      skip < 0 ||
      !Number.isSafeInteger(take) ||
      take < 1 ||
      take > 100
    ) {
      throw new NemligError("Shopping-list page is invalid.");
    }
    const params = new URLSearchParams({
      skip: String(skip),
      take: String(take),
    });
    const response = await this.json(
      `${API_BASE_URL}/ShoppingList/GetShoppingLists?${params}`,
      { signal },
      "List shopping lists",
    );
    return normalizeShoppingListOverviewPage(response);
  }

  async getShoppingList(
    listId: number,
    signal?: AbortSignal,
  ): Promise<ShoppingList> {
    this.requireLogin("view a shopping list");
    if (!Number.isSafeInteger(listId) || listId < 1) {
      throw new NemligError("Shopping list ID must be positive.");
    }
    const params = new URLSearchParams({ listId: String(listId) });
    return normalizeShoppingList(
      await this.json(
        `${API_BASE_URL}/ShoppingList/getShoppingList?${params}`,
        { signal },
        "Get shopping list",
      ),
      listId,
    );
  }

  async createShoppingList(
    name: string,
    signal?: AbortSignal,
  ): Promise<number> {
    this.requireLogin("create a shopping list");
    const normalized = name.trim();
    if (!normalized || normalized.length > 30) {
      throw new NemligError("Shopping list name must contain 1–30 characters.");
    }
    const query = `name=${encodeURIComponent(normalized)}`;
    const value = await this.json(
      `${API_BASE_URL}/ShoppingList/CreateShoppingList?${query}`,
      { method: "POST", signal },
      "Create shopping list",
      false,
    );
    const record = asRecord(value);
    const id = asId(record.Id) ?? asId(record.ListId) ?? asId(value);
    if (id === undefined) {
      throw new NemligError(
        "Create shopping list failed: invalid response data.",
      );
    }
    return id;
  }

  async updateShoppingListProduct(
    listId: number,
    productId: number,
    quantity: number,
    signal?: AbortSignal,
  ): Promise<void> {
    this.requireLogin("update a shopping list");
    if (
      !Number.isSafeInteger(listId) ||
      listId < 1 ||
      !Number.isSafeInteger(productId) ||
      productId < 1 ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0
    ) {
      throw new NemligError("Shopping list product update is invalid.");
    }
    const params = new URLSearchParams({
      listId: String(listId),
      productId: String(productId),
      amount: String(quantity),
    });
    const response = await this.json(
      `${API_BASE_URL}/ShoppingList/UpdateProductInShoppingList?${params}`,
      { method: "POST", signal },
      "Update shopping list product",
      false,
      false,
      true,
      true,
    );
    const failures = asRecord(asRecord(response).List).ValidationFailures;
    if (Array.isArray(failures) && failures.length > 0) {
      throw new NemligError("Nemlig rejected the shopping-list update.");
    }
  }

  async deleteShoppingList(
    listId: number,
    signal?: AbortSignal,
  ): Promise<void> {
    this.requireLogin("delete a shopping list");
    if (!Number.isSafeInteger(listId) || listId < 1) {
      throw new NemligError("Shopping list ID must be positive.");
    }
    const params = new URLSearchParams({ listId: String(listId) });
    await this.json(
      `${API_BASE_URL}/ShoppingList/RemoveShoppingList?${params}`,
      { method: "POST", signal },
      "Delete shopping list",
      false,
      false,
      true,
      true,
    );
  }

  async addShoppingListToCart(
    listId: number,
    signal?: AbortSignal,
  ): Promise<void> {
    this.requireLogin("add a shopping list to the basket");
    if (!Number.isSafeInteger(listId) || listId < 1) {
      throw new NemligError("Shopping list ID must be positive.");
    }
    await this.json(
      `${API_BASE_URL}/basket/addShoppingListToBasket`,
      {
        method: "POST",
        body: JSON.stringify({ ListId: listId, ConfirmMissingProducts: false }),
        signal,
      },
      "Add shopping list to basket",
      false,
      false,
      true,
      true,
    );
  }

  /** Add a positive quantity delta; the provider adapter translates it to its absolute-quantity endpoint. */
  async addToCart(
    productId: number,
    quantity = 1,
    expectedBasket?: Basket,
  ): Promise<Basket> {
    if (!this.loggedIn) {
      throw new BasketPreflightError("Must be logged in to add items.");
    }
    if (!Number.isInteger(productId) || productId < 1) {
      throw new BasketPreflightError("Product ID must be positive.");
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BasketPreflightError("Quantity must be at least 1.");
    }
    let before: Basket;
    try {
      before = await this.getCart();
    } catch {
      throw new BasketPreflightError(
        "Basket could not be re-read before addition; no provider write was sent.",
      );
    }
    if (
      expectedBasket &&
      basketFingerprint(before) !== basketFingerprint(expectedBasket)
    ) {
      throw new BasketSnapshotChangedError();
    }
    if (
      before.items.some(
        (item) =>
          item.id === undefined ||
          typeof item.quantity !== "number" ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 0,
      )
    ) {
      throw new BasketPreflightError(
        "Basket lines cannot be verified safely; no provider write was sent.",
      );
    }
    const matches = before.items.filter(
      (item) => String(item.id) === String(productId),
    );
    if (matches.length > 1) {
      throw new BasketPreflightError(
        "Duplicate basket lines prevent a safe addition; no provider write was sent.",
      );
    }
    const currentQuantity = matches[0]?.quantity ?? 0;
    if (
      !Number.isInteger(currentQuantity) ||
      currentQuantity < 0 ||
      currentQuantity + quantity > Number.MAX_SAFE_INTEGER
    ) {
      throw new BasketPreflightError(
        "Current basket quantity cannot be increased safely; no provider write was sent.",
      );
    }
    try {
      await this.ensureAntiForgery();
    } catch {
      throw new BasketPreflightError(
        "Anti-forgery state could not be prepared; no provider write was sent.",
      );
    }
    const targetQuantity = currentQuantity + quantity;
    await this.writeBasket(productId, targetQuantity, "Add to basket");
    const after = await this.readback("Product was added");
    const addedLine = after.items.find(
      (item) => String(item.id) === String(productId),
    );
    if (
      !addedLine ||
      typeof addedLine.quantity !== "number" ||
      addedLine.quantity < targetQuantity
    ) {
      throw new NemligError(
        "Basket readback did not confirm the additive quantity; inspect the basket and do not retry.",
      );
    }
    for (const previous of before.items) {
      if (previous.id === undefined) {
        throw new NemligError(
          "Basket line identity could not be verified; inspect the basket and do not retry.",
        );
      }
      const current = after.items.find(
        (item) => String(item.id) === String(previous.id),
      );
      if (
        !current ||
        typeof current.quantity !== "number" ||
        typeof previous.quantity !== "number" ||
        current.quantity < previous.quantity
      ) {
        throw new NemligError(
          "A previous basket line was not preserved; inspect the basket and do not retry.",
        );
      }
    }
    return after;
  }

  private async prepareBasketMutation(
    basket: Basket,
    signal: AbortSignal | undefined,
    beforeDispatch: ((baseline: Basket) => void | Promise<void>) | undefined,
  ): Promise<void> {
    throwIfAborted(signal);
    try {
      await this.ensureAntiForgery(signal);
    } catch {
      throw new BasketPreflightError(
        "Anti-forgery state could not be prepared; no provider write was sent.",
      );
    }
    throwIfAborted(signal);
    await beforeDispatch?.(basket);
  }

  /** Send approved positive basket deltas in one provider request. */
  async addManyToCart(
    additions: BasketAddition[],
    options: {
      signal?: AbortSignal;
      expectedBasket?: Basket;
      beforeDispatch?: (baseline: Basket) => Promise<void>;
    } = {},
  ): Promise<Basket> {
    const requested = parseBasketAdditions(additions);
    this.requireLogin("add items to the basket");
    const products = [...requested].map(([productId, quantity]) => ({
      ProductId: String(productId),
      Quantity: quantity,
    }));
    const { signal, expectedBasket } = options;
    throwIfAborted(signal);
    let before: Basket;
    try {
      before = await this.getCart(signal);
    } catch {
      throw new BasketPreflightError(
        "Basket could not be verified before addition; no provider write was sent.",
      );
    }
    if (
      expectedBasket &&
      basketFingerprint(before) !== basketFingerprint(expectedBasket)
    ) {
      throw new BasketSnapshotChangedError();
    }
    const baseline = basketQuantities(
      before,
      "Basket lines cannot be verified safely; no provider write was sent.",
      BasketPreflightError,
    );
    assertSafeBasketIncreases(baseline, requested);
    await this.prepareBasketMutation(before, signal, options.beforeDispatch);
    try {
      await this.json(
        `${API_BASE_URL}/Basket/AddManyToBasket`,
        {
          method: "POST",
          body: JSON.stringify({
            addToExisting: true,
            Products: products,
          }),
          signal,
        },
        "Add items to basket",
        false,
      );
    } catch {
      throw new NemligError(
        "Bulk basket write outcome is unconfirmed; inspect the basket and do not retry.",
      );
    }
    let after: Basket;
    try {
      after = await this.getCart(signal);
    } catch {
      throw new NemligError(
        "Bulk basket write was sent, but readback is unconfirmed; inspect the basket and do not retry.",
      );
    }
    assertBasketAdditionReadback(before, after, requested);
    return after;
  }

  async createShoppingListFromBasket(
    options: {
      signal?: AbortSignal;
      beforeDispatch?: (basket: Basket) => void | Promise<void>;
    } = {},
  ): Promise<Basket> {
    const { signal } = options;
    this.requireLogin("save the current basket as a shopping list");
    throwIfAborted(signal);
    let before: Basket;
    try {
      before = await this.getCart(signal);
    } catch {
      throw new BasketPreflightError(
        "Basket could not be verified before saving; no provider write was sent.",
      );
    }
    basketQuantities(
      before,
      "Basket lines cannot be verified safely; no provider write was sent.",
      BasketPreflightError,
    );
    await this.prepareBasketMutation(before, signal, options.beforeDispatch);
    try {
      await this.json(
        `${API_BASE_URL}/ShoppingList/CreateShoppingListFromBasket`,
        { method: "POST", body: null, signal },
        "Save current basket as a shopping list",
        false,
        false,
        true,
        true,
      );
    } catch {
      throw new NemligError(
        "Saving the basket as a shopping list is unconfirmed; inspect saved lists and do not retry blindly.",
      );
    }
    let after: Basket;
    try {
      after = await this.getCart(signal);
    } catch {
      throw new NemligError(
        "The list endpoint acknowledged the request, but basket readback is unconfirmed; inspect saved lists and the basket before continuing.",
      );
    }
    basketQuantities(
      after,
      "The basket did not read back unambiguously after saving; inspect saved lists and do not retry.",
      NemligError,
    );
    if (basketFingerprint(before) !== basketFingerprint(after)) {
      throw new NemligError(
        "The list endpoint acknowledged the request, but the basket changed during verification; inspect saved lists and the basket.",
      );
    }
    return after;
  }

  private async readback(action: string): Promise<Basket> {
    try {
      return await this.getCart();
    } catch {
      throw new NemligError(
        `${action}, but basket verification failed; stop before further mutations.`,
      );
    }
  }

  private async writeBasket(
    productId: number,
    quantity: number,
    operation: string,
  ): Promise<void> {
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new NemligError(
        "Provider basket quantity must be a positive absolute value.",
      );
    }
    await this.json(
      `${API_BASE_URL}/basket/AddToBasket`,
      {
        method: "POST",
        body: JSON.stringify({
          ProductId: productId,
          quantity,
          AffectPartialQuantity: false,
          disableQuantityValidation: false,
        }),
      },
      operation,
      false,
    );
  }

  private requireLogin(operation: string): void {
    if (!this.loggedIn) {
      throw new NemligError(`Must be logged in to ${operation}.`);
    }
  }

  private resetSessionState(): void {
    this.loggedIn = false;
    this.accessToken = undefined;
    this.userId = undefined;
    this.productTimestamp = undefined;
    this.correlationId = undefined;
    this.timeslot = this.defaultTimeslot;
    this.timeslotId = 0;
    this.deliveryZoneId = 1;
    this.knownProducts.clear();
    this.hydratedProductIds.clear();
  }

  private async ensureAntiForgery(signal?: AbortSignal): Promise<void> {
    const host = new URL(API_BASE_URL).host;
    const existingCookie = this.cookies.get(host)?.get(xsrfCookieName);
    if (existingCookie) {
      if (!decodeCookie(existingCookie)) {
        throw new NemligError(
          "Get anti-forgery state failed: invalid response data.",
        );
      }
      return;
    }
    const response = asRecord(
      await this.json(
        `${API_BASE_URL}/AntiForgery`,
        { signal },
        "Get anti-forgery state",
        false,
        false,
        false,
      ),
    );
    const cookie = this.cookies.get(host)?.get(xsrfCookieName);
    const value = asString(response.Value);
    if (
      response.Header !== xsrfHeaderName ||
      !cookie ||
      !value ||
      decodeCookie(cookie) !== value
    ) {
      throw new NemligError(
        "Get anti-forgery state failed: invalid response data.",
      );
    }
  }

  private async refreshSession(signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const token = asRecord(
      await this.json(`${API_BASE_URL}/Token`, { signal }, "Get token", true),
    );
    this.accessToken = asString(token.access_token);
    if (!this.accessToken) {
      throw new NemligError("Get token failed: invalid response data.");
    }
    const settings = asRecord(
      await this.optionalJson(
        `${API_BASE_URL}/v2/AppSettings/Website`,
        "Get app settings",
        false,
        signal,
      ),
    );
    this.productTimestamp =
      asString(settings.CombinedProductsAndSitecoreTimestamp) ??
      DEFAULT_PRODUCT_TIMESTAMP;
    this.correlationId =
      asString(settings.SitecorePublishedStamp) ?? DEFAULT_CORRELATION_ID;
    const user = asRecord(
      await this.optionalJson(
        `${API_BASE_URL}/user/GetCurrentUser`,
        "Get current user",
        false,
        signal,
      ),
    );
    const userId = user.DebitorId ?? user.Id;
    if (typeof userId === "number" || typeof userId === "string") {
      this.userId = String(userId);
    }
    const delivery = asRecord(
      await this.optionalJson(
        `${API_BASE_URL}/Order/DeliverySpot`,
        "Get delivery spot",
        false,
        signal,
      ),
    );
    this.timeslot = asString(delivery.TimeslotUtc) ?? this.timeslot;
    this.timeslotId = asNumber(delivery.TimeslotId) ?? this.timeslotId;
    this.deliveryZoneId = asId(delivery.DeliveryZoneId) ?? this.deliveryZoneId;
  }

  private async searchGateway(
    query: string,
    limit: number | undefined,
    signal?: AbortSignal,
  ): Promise<Product[]> {
    if (!this.accessToken || !this.productTimestamp) {
      return [];
    }
    const params = new URLSearchParams({
      query,
      skip: "0",
      recipeCount: "0",
      timestamp: this.productTimestamp,
      timeslotUtc: this.timeslot,
      deliveryZoneId: String(this.deliveryZoneId),
      includeFavorites: this.userId ?? "0",
      TimeSlotId: String(this.timeslotId),
    });
    params.set("take", String(limit ?? 20));
    const response = asRecord(
      await this.json(
        `${SEARCH_GATEWAY_URL}/search?${params}`,
        { signal },
        "Search products",
        true,
        true,
      ),
    );
    const products = response.Products;
    return normalizeProducts(
      Array.isArray(products) ? products : asRecord(products).Products,
      limit,
    );
  }

  private rememberProducts(products: Product[], hydrated = false): Product[] {
    for (const product of products) {
      if (product.id === undefined) {
        continue;
      }
      if (!hydrated && this.hydratedProductIds.has(product.id)) {
        continue;
      }
      this.knownProducts.delete(product.id);
      this.knownProducts.set(product.id, product);
      if (hydrated) {
        this.hydratedProductIds.add(product.id);
      }
      while (this.knownProducts.size > KNOWN_PRODUCT_LIMIT) {
        const oldest = this.knownProducts.keys().next().value as
          number | undefined;
        if (oldest === undefined) {
          break;
        }
        this.knownProducts.delete(oldest);
        this.hydratedProductIds.delete(oldest);
      }
    }
    return products;
  }

  private async productsByCategory(
    path: string,
    limit: number | undefined,
    page = 1,
    signal?: AbortSignal,
  ): Promise<Product[]> {
    const pageUrl = new URL(path, "https://www.nemlig.com");
    if (pageUrl.origin !== "https://www.nemlig.com") {
      return [];
    }
    pageUrl.searchParams.set("GetAsJson", "1");
    const categoryPage = asRecord(
      await this.optionalJson(
        pageUrl.toString(),
        "Get category",
        false,
        signal,
      ),
    );
    const group = asRecords(categoryPage.content).find(
      (entry) => entry.ProductGroupId,
    )?.ProductGroupId;
    if (typeof group !== "string" && typeof group !== "number") {
      return [];
    }

    return this.productsByGroup(
      group,
      limit,
      "Get category products",
      page,
      signal,
    );
  }

  private async productsByGroup(
    group: string | number,
    limit: number | undefined,
    operation: string,
    page = 1,
    signal?: AbortSignal,
  ): Promise<Product[]> {
    const endpoint = `${API_BASE_URL}/${this.productTimestamp ?? DEFAULT_PRODUCT_TIMESTAMP}/${this.timeslot}/1/${this.userId ?? "0"}/Products/GetByProductGroupId`;
    const params = new URLSearchParams({
      productGroupId: String(group),
      pageIndex: String(page - 1),
      sortorder: "default",
    });
    if (limit !== undefined) {
      params.set("pagesize", String(limit));
    }
    const response = asRecord(
      await this.optionalJson(
        `${endpoint}?${params}`,
        operation,
        false,
        signal,
      ),
    );
    return normalizeProducts(response.Products, limit);
  }

  private async optionalJson(
    url: string,
    operation: string,
    gateway = false,
    signal?: AbortSignal,
  ): Promise<unknown> {
    try {
      return await this.json(url, { signal }, operation, true, gateway);
    } catch (error) {
      if (signal?.aborted) {
        throw abortReason(signal);
      }
      if (error instanceof NemligError && error.status === 401) {
        throw error;
      }
      return {};
    }
  }

  private async json(
    url: string,
    init: RequestInit,
    operation: string,
    retry = true,
    gateway = false,
    includeSession = true,
    allowEmpty = false,
  ): Promise<unknown> {
    throwIfAborted(init.signal);
    const target = new URL(url);
    const targetMethod = (init.method ?? "GET").toUpperCase();
    const targetIsNemligApi =
      target.origin === new URL(API_BASE_URL).origin &&
      target.pathname.startsWith("/webapi");
    if (
      targetIsNemligApi &&
      !["GET", "HEAD", "OPTIONS"].includes(targetMethod) &&
      !this.cookies.get(target.host)?.has(xsrfCookieName)
    ) {
      await this.ensureAntiForgery(init.signal ?? undefined);
    }
    for (
      let attempt = 0;
      attempt <= (retry ? NEMLIG_READ_MAX_RETRIES : 0);
      attempt += 1
    ) {
      throwIfAborted(init.signal);
      const attemptSignal = AbortSignal.timeout(NEMLIG_API_ATTEMPT_TIMEOUT_MS);
      try {
        const headers = new Headers(init.headers);
        headers.set("Accept", "application/json, text/plain, */*");
        const requestUrl = new URL(url);
        const api = requestUrl.pathname.startsWith("/webapi");
        if (api || gateway) {
          headers.set(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/143 Safari/537.36",
          );
          headers.set("Referer", "https://www.nemlig.com/");
        }
        if (gateway) {
          headers.set("Origin", "https://www.nemlig.com");
          headers.set("X-Correlation-Id", randomUUID());
        } else if (api) {
          if (
            init.body !== undefined &&
            init.body !== null &&
            !headers.has("Content-Type")
          ) {
            headers.set("Content-Type", "application/json");
          }
          headers.set("version", "11.201.0");
          headers.set("platform", "web");
          headers.set("device-size", "desktop");
        }
        if (includeSession && this.accessToken) {
          headers.set("Authorization", `Bearer ${this.accessToken}`);
        }
        const host = requestUrl.host;
        const sameOriginApi =
          api && requestUrl.origin === new URL(API_BASE_URL).origin;
        const cookies = this.cookies.get(host);
        if (includeSession && cookies?.size) {
          headers.set(
            "Cookie",
            [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
          );
        } else if (!includeSession && sameOriginApi && cookies) {
          const antiForgeryCookies = [...cookies].filter(([name]) =>
            name.startsWith("XSRF-"),
          );
          if (antiForgeryCookies.length) {
            headers.set(
              "Cookie",
              antiForgeryCookies
                .map(([name, value]) => `${name}=${value}`)
                .join("; "),
            );
          }
        }
        const method = (init.method ?? "GET").toUpperCase();
        const xsrfValue = cookies?.get(xsrfCookieName);
        const mutatingMethod = !["GET", "HEAD", "OPTIONS"].includes(method);
        if (sameOriginApi && mutatingMethod) {
          headers.set("Origin", requestUrl.origin);
        }
        if (sameOriginApi && mutatingMethod && xsrfValue) {
          const decoded = decodeCookie(xsrfValue);
          if (!decoded) {
            throw new NemligError(
              `${operation} failed: invalid anti-forgery state.`,
            );
          }
          headers.set(xsrfHeaderName, decoded);
        }

        const signal = init.signal
          ? AbortSignal.any([init.signal, attemptSignal])
          : attemptSignal;
        const response = await this.fetcher(url, {
          ...init,
          headers,
          signal,
        });
        this.captureCookies(host, response.headers);
        if (!response.ok) {
          throw new NemligError(
            `${operation} failed (HTTP ${response.status}).`,
            response.status,
          );
        }
        try {
          if (allowEmpty) {
            const body = await response.text();
            return body.trim() ? JSON.parse(body) : undefined;
          }
          return await response.json();
        } catch {
          if (init.signal?.aborted) {
            throw abortReason(init.signal);
          }
          throw new NemligError(`${operation} failed: invalid response data.`);
        }
      } catch (error) {
        if (init.signal?.aborted) {
          throw abortReason(init.signal);
        }
        if (error instanceof NemligError) {
          throw error;
        }
        if (init.signal?.aborted || attemptSignal.aborted) {
          break;
        }
      }
    }
    throw new NemligError(`${operation} failed: network unavailable.`);
  }

  private captureCookies(host: string, headers: Headers): void {
    const values = headers.getSetCookie();
    if (!values.length) {
      return;
    }
    const jar = this.cookies.get(host) ?? new Map<string, string>();
    for (const value of values) {
      const [pair] = value.split(";", 1);
      const separator = pair?.indexOf("=") ?? -1;
      if (separator > 0 && pair) {
        jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    }
    this.cookies.set(host, jar);
  }
}

/** The provider surface shared by CLI, MCP, and HTTP flows. */
export type ShoppingClient = Pick<
  NemligClient,
  | "isLoggedIn"
  | "login"
  | "searchProducts"
  | "getProduct"
  | "getFreshProduct"
  | "listFavorites"
  | "listDepartments"
  | "browseDepartment"
  | "getCart"
  | "addToCart"
> &
  Partial<Pick<NemligClient, "addManyToCart" | "createShoppingListFromBasket">>;

export type ShoppingListClient = Pick<
  NemligClient,
  | "providerIdentity"
  | "listShoppingLists"
  | "getShoppingList"
  | "createShoppingList"
  | "updateShoppingListProduct"
  | "deleteShoppingList"
  | "addShoppingListToCart"
>;
