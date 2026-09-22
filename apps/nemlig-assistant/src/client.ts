import { randomUUID } from "node:crypto";
import { compile } from "html-to-text";
import { z } from "zod";

export const API_BASE_URL = "https://www.nemlig.com/webapi";
export const SEARCH_GATEWAY_URL = "https://webapi.prod.knl.nemlig.it/searchgateway/api";
export const NEMLIG_READ_ATTEMPT_TIMEOUT_MS = 60_000;
export const NEMLIG_READ_MAX_RETRIES = 1;
const KNOWN_PRODUCT_LIMIT = 1_000;

const recordSchema = z.record(z.string(), z.unknown());
const recordsSchema = z.array(recordSchema);
const DAIRY_KEYWORDS = ["mælk", "ost", "fløde", "yoghurt", "smør", "skyr"];
const DEFAULT_PRODUCT_TIMESTAMP = "AAAAAAAA-YFA_17hS";
const DEFAULT_CORRELATION_ID = "YFA_17hS";

export class NemligError extends Error {
  override readonly name = "NemligError";

  constructor(message: string, readonly status?: number) {
    super(message);
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
  available: boolean;
  labels: string[];
  isOrganic: boolean;
  isFrozen: boolean;
  isRefrigerated: boolean;
  isDairy: boolean;
  isLactoseFree: boolean;
  isGlutenFree: boolean;
  isVegan: boolean;
  isOnDiscount: boolean;
}

export interface Department { id: string; name: string }
export interface ProductPage { products: Product[]; page: number; hasNext: boolean }

export function normalizeDepartments(value: unknown): Department[] {
  const seen = new Set<string>();
  return asRecords(asRecord(value).content).flatMap((entry) => {
    const id = asString(entry.Url) ?? asString(entry.url);
    const name = asString(entry.Name) ?? asString(entry.Title) ?? asString(entry.name);
    if (!id || !name || !id.startsWith("/") || id.startsWith("//") || seen.has(id)) return [];
    seen.add(id); return [{ id, name }];
  });
}

// ponytail: bounded prefix; add upstream cursors if real accounts exceed this ceiling.
export const FAVORITES_SEARCH_POOL = 1000;

export function matchFavorites(products: Product[], query: string, limit: number): Product[] {
  const needle = query.trim().toLocaleLowerCase("da-DK");
  if (!needle) throw new NemligError("Favorites query is required.");
  if (!Number.isInteger(limit) || limit < 1) throw new NemligError("Favorites limit must be positive.");
  return products
    .filter((product) => product.name?.toLocaleLowerCase("da-DK").includes(needle))
    .slice(0, limit);
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
  const id = typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : asNumber(value);
  return id !== undefined && Number.isSafeInteger(id) && id > 0 ? id : undefined;
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
  const text = html ? convertProductText(html).replace(/\s+/gu, " ").trim() : undefined;
  return text ? text.slice(0, length) : undefined;
};

const boundedAttributeValue = (value: unknown): string | undefined => {
  const values = (Array.isArray(value) ? value : [value]).slice(0, 20);
  let text = "";
  for (const entry of values) {
    const normalized = boundedText(entry, 300);
    if (!normalized) continue;
    text = `${text}${text ? ", " : ""}${normalized}`.slice(0, 300);
    if (text.length === 300) break;
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

export function normalizeProducts(value: unknown, limit?: number): Product[] {
  const records = limit === undefined ? asRecords(value) : asRecords(value).slice(0, limit);
  return records
    .map((item) => {
      const availability = asRecord(item.Availability);
      const labels = Array.isArray(item.Labels)
        ? item.Labels.filter((label): label is string => typeof label === "string")
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
        ...(Array.isArray(item.Attributes) ? {
          details: asRecords(item.Attributes).slice(0, 20).flatMap((attribute) => {
            if (attribute.IsVisible === false || attribute.Visible === false || attribute.DisplayVisible === false) return [];
            const key = boundedText(attribute.Key, 100); const value = boundedAttributeValue(attribute.Value);
            return key && value ? [{ key, value }] : [];
          }),
        } : {}),
        brand: asString(item.Brand) ?? "",
        category,
        subcategory,
        imageUrl: asString(item.PrimaryImage) ?? "",
        available:
          availability.IsDeliveryAvailable !== false && availability.IsAvailableInStock !== false,
        labels,
        isOrganic: labelsLower.some((label) => label.includes("øko")),
        isFrozen: categoryLower === "frost",
        isRefrigerated: categoryLower === "køl",
        isDairy:
          categoryLower.includes("mejeri") ||
          DAIRY_KEYWORDS.some((keyword) => subcategoryLower.includes(keyword)),
        isLactoseFree: labelsLower.some((label) => label.includes("laktosefri")),
        isGlutenFree: labelsLower.some((label) => label.includes("glutenfri")),
        isVegan: labelsLower.some((label) => label.includes("vegan")),
        isOnDiscount: item.DiscountItem === true || item.IsDiscountItem === true,
      };
    });
}

type Fetch = typeof fetch;

const abortReason = (signal: AbortSignal): unknown => signal.reason ?? new DOMException("Read cancelled.", "AbortError");
const throwIfAborted = (signal: AbortSignal | null | undefined): void => {
  if (signal?.aborted) throw abortReason(signal);
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
    const date = [tomorrow.getFullYear(), tomorrow.getMonth() + 1, tomorrow.getDate()]
      .map((part) => String(part).padStart(part === tomorrow.getFullYear() ? 4 : 2, "0"))
      .join("");
    this.defaultTimeslot = `${date}15-60-240`;
    this.timeslot = this.defaultTimeslot;
  }

  isLoggedIn(): boolean {
    return this.loggedIn;
  }

  getSessionGeneration(): number {
    return this.sessionGeneration;
  }

  async login(username: string, password: string): Promise<void> {
    this.resetSessionState();
    if (!username || !password) throw new NemligError("Nemlig username and password are required.");
    try {
      const response = await this.json(
        `${API_BASE_URL}/login`,
        {
          method: "POST",
          body: JSON.stringify({
            Username: username,
            Password: password,
            CheckForExistingProducts: false,
            DoMerge: false,
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
      if (!data.RedirectUrl && !data.MergeSuccessful) {
        throw new NemligError("Login failed: invalid credentials");
      }
      const timeslot = asString(data.TimeslotUtc);
      await this.refreshSession();
      if (timeslot) this.timeslot = timeslot;
      this.loggedIn = true;
      this.sessionGeneration += 1;
    } catch (error) {
      this.resetSessionState();
      throw error instanceof NemligError ? error : new NemligError("Login failed: session bootstrap unavailable.");
    }
  }

  async validateCredentials(username: string, password: string, signal?: AbortSignal): Promise<void> {
    if (!username || !password) throw new NemligError("Nemlig username and password are required.");
    const response = asRecord(await this.json(`${API_BASE_URL}/login`, {
      method: "POST",
      signal,
      body: JSON.stringify({
        Username: username, Password: password, CheckForExistingProducts: false,
        DoMerge: false, AppInstalled: false, SaveExistingBasket: false,
      }),
    }, "Validate login", false, false, false));
    if (!response.RedirectUrl && !response.MergeSuccessful) throw new NemligError("Login failed: invalid credentials");
    const token = asRecord(await this.json(`${API_BASE_URL}/Token`, { signal }, "Validate account", false, false, false));
    if (!asString(token.access_token)) throw new NemligError("Validate account failed: invalid response data.");
  }

  async searchProducts(query: string, limit?: number, signal?: AbortSignal): Promise<Product[]> {
    if (!query.trim()) throw new NemligError("Search query is required.");
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new NemligError("Search limit must be positive.");
    throwIfAborted(signal);
    if (!this.productTimestamp) await this.refreshSession(signal);

    const primary = this.rememberProducts(await this.searchGateway(query, limit, signal));
    if (primary.length || !this.accessToken) return primary;

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
      if (!path) continue;
      const products = this.rememberProducts(await this.productsByCategory(path, limit, 1, signal));
      if (products.length) return products;
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
    if (known && this.hydratedProductIds.has(productId)) return known;
    return this.fetchExactProduct(productId, signal);
  }

  /**
   * Resolves the exact product from the current catalogue, bypassing this
   * client's observed-product cache for final pre-mutation revalidation.
   */
  async getFreshProduct(productId: number): Promise<Product> {
    this.validateProductId(productId);
    return this.fetchExactProduct(productId);
  }

  private validateProductId(productId: number): void {
    if (!Number.isInteger(productId) || productId < 1) throw new NemligError("Product ID must be positive.");
  }

  private async fetchExactProduct(productId: number, signal?: AbortSignal): Promise<Product> {
    throwIfAborted(signal);
    if (!this.productTimestamp) await this.refreshSession(signal);
    const endpoint = `${API_BASE_URL}/${this.productTimestamp ?? DEFAULT_PRODUCT_TIMESTAMP}/${this.timeslot}/${this.deliveryZoneId}/${this.userId ?? "0"}/Products/Get`;
    let response: Record<string, unknown>;
    try {
      response = asRecord(await this.json(
        `${endpoint}?${new URLSearchParams({ id: String(productId) })}`,
        { signal },
        `Get product ${productId}`,
      ));
    } catch (error) {
      if (error instanceof NemligError && error.status === 404) {
        throw new NemligError(`Product ${productId} could not be resolved exactly.`, 404);
      }
      throw error;
    }
    const payload = asRecord(response.Product).Id === undefined ? response : asRecord(response.Product);
    const product = normalizeProducts([payload], 1)[0];
    if (!product || product.id !== productId) {
      throw new NemligError(`Product ${productId} could not be resolved exactly.`, 404);
    }
    return this.rememberProducts([product], true)[0]!;
  }

  async listFavorites(limit = 10, page = 1): Promise<Product[]> {
    this.requireLogin("view favorites");
    if (!Number.isInteger(limit) || limit < 1) throw new NemligError("Favorites limit must be positive.");
    if (!Number.isInteger(page) || page < 1) throw new NemligError("Favorites page must be positive.");
    if (limit > 1000) throw new NemligError("Favorites result limit cannot exceed 1000.");
    const offset = (page - 1) * limit;
    if (offset >= 1000) throw new NemligError("Favorites paging is limited to the first 1000 products.");
    if (!this.productTimestamp) await this.refreshSession();

    const pageUrl = new URL("/favoritter", "https://www.nemlig.com");
    pageUrl.searchParams.set("GetAsJson", "1");
    pageUrl.searchParams.set("t", this.timeslot);
    pageUrl.searchParams.set("d", "1");
    const favoritesPage = asRecord(await this.json(pageUrl.toString(), {}, "Get favorites page"));
    const groups = asRecords(favoritesPage.content)
      .filter((entry) => entry.TemplateName === "productlistshowallspot")
      .map((entry) => entry.ProductGroupId)
      .filter((id): id is string | number => typeof id === "string" || typeof id === "number");
    const products: Product[] = [];
    const seen = new Set<number | string>();
    const target = Math.min(1000, offset + limit);
    for (const group of groups) {
      let groupPage = 1;
      while (products.length < target && groupPage <= 20) {
        const pageSize = Math.min(50, target - products.length);
        const batch = await this.productsByGroup(group, pageSize, "Get favorite products", groupPage);
        for (const product of batch) {
          if (product.id === undefined || seen.has(product.id)) continue;
          seen.add(product.id); products.push(product);
        }
        if (batch.length < pageSize) break;
        groupPage += 1;
      }
      if (products.length === target) break;
    }
    // ponytail: bounded 1,000-product prefix; add upstream cursors if a real account exceeds it.
    return this.rememberProducts(products.slice(offset, target));
  }

  async listDepartments(): Promise<Department[]> {
    const page = await this.optionalJson("https://www.nemlig.com/?GetAsJson=1", "Get departments");
    return normalizeDepartments(page);
  }

  async browseDepartment(departmentId: string, limit = 20, page = 1): Promise<ProductPage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new NemligError("Department page size must be between 1 and 50.");
    if (!Number.isInteger(page) || page < 1) throw new NemligError("Department page must be positive.");
    const offset = (page - 1) * limit;
    if (offset >= 1000) throw new NemligError("Department paging is limited to the first 1000 products.");
    const department = (await this.listDepartments()).find((item) => item.id === departmentId);
    if (!department) throw new NemligError("Unknown department ID; list departments again.");
    const products = this.rememberProducts(await this.productsByCategory(department.id, limit, page));
    const seen = new Set<number>();
    const unique = products.filter((product) => {
      if (product.id === undefined) return true;
      if (seen.has(product.id)) return false;
      seen.add(product.id); return true;
    });
    return { products: unique, page, hasNext: products.length === limit && offset + products.length < 1000 };
  }

  async getCart(signal?: AbortSignal): Promise<Basket> {
    this.requireLogin("view the basket");
    throwIfAborted(signal);
    return normalizeBasket(await this.json(`${API_BASE_URL}/basket/GetBasket`, { signal }, "Get basket"));
  }

  async addToCart(productId: number, quantity = 1): Promise<Basket> {
    this.requireLogin("add items");
    if (!Number.isInteger(productId) || productId < 1) throw new NemligError("Product ID must be positive.");
    if (!Number.isInteger(quantity) || quantity < 1) throw new NemligError("Quantity must be at least 1.");
    await this.writeBasket(productId, quantity, "Add to basket");
    return this.readback("Product was added");
  }

  async removeFromCart(productId: number): Promise<Basket> {
    this.requireLogin("remove an item");
    if (!Number.isInteger(productId) || productId < 1) throw new NemligError("Product ID must be positive.");
    const matchesProduct = (item: Basket["items"][number]): boolean => String(item.id) === String(productId);
    if (!(await this.getCart()).items.some(matchesProduct)) {
      throw new NemligError(`Product ${productId} is not in the basket; nothing was removed.`);
    }
    await this.writeBasket(productId, 0, "Remove from basket");
    const basket = await this.readback("Product was removed");
    if (basket.items.some(matchesProduct)) {
      throw new NemligError(`Product ${productId} may not have been removed; stop before further mutations.`);
    }
    return basket;
  }

  async clearCart(): Promise<Basket> {
    this.requireLogin("clear the basket");
    await this.json(
      `${API_BASE_URL}/basket/ClearBasket`,
      { method: "POST" },
      "Clear basket",
      false,
    );
    return this.readback("Basket was cleared");
  }

  private async readback(action: string): Promise<Basket> {
    try {
      return await this.getCart();
    } catch {
      throw new NemligError(`${action}, but basket verification failed; stop before further mutations.`);
    }
  }

  private async writeBasket(productId: number, quantity: number, operation: string): Promise<void> {
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
    if (!this.loggedIn) throw new NemligError(`Must be logged in to ${operation}.`);
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

  private async refreshSession(signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const token = asRecord(await this.json(`${API_BASE_URL}/Token`, { signal }, "Get token", true));
    this.accessToken = asString(token.access_token);
    if (!this.accessToken) throw new NemligError("Get token failed: invalid response data.");
    const settings = asRecord(
      await this.optionalJson(`${API_BASE_URL}/v2/AppSettings/Website`, "Get app settings", false, signal),
    );
    this.productTimestamp =
      asString(settings.CombinedProductsAndSitecoreTimestamp) ?? DEFAULT_PRODUCT_TIMESTAMP;
    this.correlationId = asString(settings.SitecorePublishedStamp) ?? DEFAULT_CORRELATION_ID;
    const user = asRecord(
      await this.optionalJson(`${API_BASE_URL}/user/GetCurrentUser`, "Get current user", false, signal),
    );
    const userId = user.DebitorId ?? user.Id;
    if (typeof userId === "number" || typeof userId === "string") this.userId = String(userId);
    const delivery = asRecord(
      await this.optionalJson(`${API_BASE_URL}/Order/DeliverySpot`, "Get delivery spot", false, signal),
    );
    this.timeslot = asString(delivery.TimeslotUtc) ?? this.timeslot;
    this.timeslotId = asNumber(delivery.TimeslotId) ?? this.timeslotId;
    this.deliveryZoneId = asId(delivery.DeliveryZoneId) ?? this.deliveryZoneId;
  }

  private async searchGateway(query: string, limit: number | undefined, signal?: AbortSignal): Promise<Product[]> {
    if (!this.accessToken || !this.productTimestamp) return [];
    const params = new URLSearchParams({
      query,
      skip: "0",
      recipeCount: "0",
      timestamp: this.productTimestamp,
      timeslotUtc: this.timeslot,
      deliveryZoneId: "1",
      includeFavorites: this.userId ?? "0",
      TimeSlotId: String(this.timeslotId),
    });
    if (limit !== undefined) params.set("take", String(limit));
    const response = asRecord(
      await this.json(`${SEARCH_GATEWAY_URL}/search?${params}`, { signal }, "Search products", true, true),
    );
    const products = response.Products;
    return normalizeProducts(Array.isArray(products) ? products : asRecord(products).Products, limit);
  }

  private rememberProducts(products: Product[], hydrated = false): Product[] {
    for (const product of products) {
      if (product.id === undefined) continue;
      if (!hydrated && this.hydratedProductIds.has(product.id)) continue;
      this.knownProducts.delete(product.id);
      this.knownProducts.set(product.id, product);
      if (hydrated) this.hydratedProductIds.add(product.id);
      while (this.knownProducts.size > KNOWN_PRODUCT_LIMIT) {
        const oldest = this.knownProducts.keys().next().value as number | undefined;
        if (oldest === undefined) break;
        this.knownProducts.delete(oldest);
        this.hydratedProductIds.delete(oldest);
      }
    }
    return products;
  }

  private async productsByCategory(path: string, limit: number | undefined, page = 1, signal?: AbortSignal): Promise<Product[]> {
    const pageUrl = new URL(path, "https://www.nemlig.com");
    if (pageUrl.origin !== "https://www.nemlig.com") return [];
    pageUrl.searchParams.set("GetAsJson", "1");
    const categoryPage = asRecord(await this.optionalJson(pageUrl.toString(), "Get category", false, signal));
    const group = asRecords(categoryPage.content).find((entry) => entry.ProductGroupId)?.ProductGroupId;
    if (typeof group !== "string" && typeof group !== "number") return [];

    return this.productsByGroup(group, limit, "Get category products", page, signal);
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
    if (limit !== undefined) params.set("pagesize", String(limit));
    const response = asRecord(await this.optionalJson(`${endpoint}?${params}`, operation, false, signal));
    return normalizeProducts(response.Products, limit);
  }

  private async optionalJson(url: string, operation: string, gateway = false, signal?: AbortSignal): Promise<unknown> {
    try {
      return await this.json(url, { signal }, operation, true, gateway);
    } catch (error) {
      if (signal?.aborted) throw abortReason(signal);
      if (error instanceof NemligError && error.status === 401) throw error;
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
  ): Promise<unknown> {
    throwIfAborted(init.signal);
    for (let attempt = 0; attempt <= (retry ? NEMLIG_READ_MAX_RETRIES : 0); attempt += 1) {
      throwIfAborted(init.signal);
      const attemptSignal = AbortSignal.timeout(NEMLIG_READ_ATTEMPT_TIMEOUT_MS);
      try {
        const headers = new Headers(init.headers);
        headers.set("Accept", "application/json, text/plain, */*");
        const requestUrl = new URL(url);
        const api = requestUrl.pathname.startsWith("/webapi");
        if (api || gateway) {
          headers.set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/143 Safari/537.36");
          headers.set("Referer", "https://www.nemlig.com/");
        }
        if (gateway) {
          headers.set("Origin", "https://www.nemlig.com");
          headers.set("X-Correlation-Id", randomUUID());
        } else if (api) {
          headers.set("Content-Type", "application/json");
          headers.set("version", "11.201.0");
          headers.set("platform", "web");
          headers.set("device-size", "desktop");
        }
        if (includeSession && this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`);
        const host = requestUrl.host;
        const cookies = this.cookies.get(host);
        if (includeSession && cookies?.size) {
          headers.set("Cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
        }

        const signal = init.signal ? AbortSignal.any([init.signal, attemptSignal]) : attemptSignal;
        const response = await this.fetcher(url, {
          ...init,
          headers,
          signal,
        });
        this.captureCookies(host, response.headers);
        if (!response.ok) throw new NemligError(`${operation} failed (HTTP ${response.status}).`, response.status);
        try {
          return await response.json();
        } catch {
          if (init.signal?.aborted) throw abortReason(init.signal);
          throw new NemligError(`${operation} failed: invalid response data.`);
        }
      } catch (error) {
        if (init.signal?.aborted) throw abortReason(init.signal);
        if (error instanceof NemligError) throw error;
        if (init.signal?.aborted || attemptSignal.aborted) break;
      }
    }
    throw new NemligError(`${operation} failed: network unavailable.`);
  }

  private captureCookies(host: string, headers: Headers): void {
    const values = headers.getSetCookie();
    if (!values.length) return;
    const jar = this.cookies.get(host) ?? new Map<string, string>();
    for (const value of values) {
      const [pair] = value.split(";", 1);
      const separator = pair?.indexOf("=") ?? -1;
      if (separator > 0 && pair) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    this.cookies.set(host, jar);
  }
}

/** The minimum provider surface shared by CLI, MCP, HTTP, and proposal flows. */
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
  | "removeFromCart"
  | "clearCart"
>;
