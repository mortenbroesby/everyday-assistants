import { randomUUID } from "node:crypto";
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
}

export interface Product {
  id: number | undefined;
  name: string | undefined;
  price: number | undefined;
  unit: string;
  unitPrice: number | undefined;
  unitSize: string;
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

export function normalizeProducts(value: unknown, limit: number): Product[] {
  return asRecords(value)
    .slice(0, limit)
    .map((item) => {
      const availability = asRecord(item.Availability);
      const labels = Array.isArray(item.Labels)
        ? item.Labels.filter((label): label is string => typeof label === "string")
        : [];
      const labelsLower = labels.map((label) => label.toLocaleLowerCase("da-DK"));
      const category = asString(item.Category) ?? "";
      const subcategory = asString(item.SubCategory) ?? "";
      const categoryLower = category.toLocaleLowerCase("da-DK");
      const subcategoryLower = subcategory.toLocaleLowerCase("da-DK");
      return {
        id: asId(item.Id),
        name: asString(item.Name),
        price: asNumber(item.Price),
        unit: asString(item.UnitPrice) ?? "",
        unitPrice: asNumber(item.UnitPriceCalc),
        unitSize: asString(item.Description) ?? "",
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

export class NemligClient {
  private readonly cookies = new Map<string, Map<string, string>>();
  private loggedIn = false;
  private accessToken?: string;
  private userId?: string;
  private productTimestamp?: string;
  private correlationId?: string;
  private readonly knownProducts = new Map<number, Product>();
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
    this.timeslot = `${date}15-60-240`;
  }

  isLoggedIn(): boolean {
    return this.loggedIn;
  }

  async login(username: string, password: string): Promise<void> {
    if (!username || !password) throw new NemligError("Nemlig username and password are required.");
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
    );
    const data = asRecord(response);
    if (data.RedirectUrl || data.MergeSuccessful) {
      this.loggedIn = true;
      this.timeslot = asString(data.TimeslotUtc) ?? this.timeslot;
      await this.refreshSession();
      return;
    }
    const message = asString(data.ErrorMessage) ?? "Invalid credentials";
    throw new NemligError(`Login failed: ${message}`);
  }

  async searchProducts(query: string, limit = 10): Promise<Product[]> {
    if (!query.trim()) throw new NemligError("Search query is required.");
    if (!Number.isInteger(limit) || limit < 1) throw new NemligError("Search limit must be positive.");
    if (!this.productTimestamp) await this.refreshSession();

    const primary = this.rememberProducts(await this.searchGateway(query, limit));
    if (primary.length || !this.accessToken) return primary;

    const quick = await this.optionalJson(
      `${SEARCH_GATEWAY_URL}/quick?${new URLSearchParams({
        query,
        correlationId: this.correlationId ?? "",
      })}`,
      "Quick search",
      true,
    );
    for (const category of asRecords(asRecord(quick).Categories).slice(0, 3)) {
      const path = asString(category.Url);
      if (!path) continue;
      const products = this.rememberProducts(await this.productsByCategory(path, limit));
      if (products.length) return products;
    }
    return [];
  }

  async getProduct(productId: number): Promise<Product> {
    if (!Number.isInteger(productId) || productId < 1) throw new NemligError("Product ID must be positive.");
    const known = this.knownProducts.get(productId);
    if (known) return known;
    const product = (await this.searchProducts(String(productId), 10)).find(
      (candidate) => String(candidate.id) === String(productId),
    );
    if (!product) throw new NemligError(`Product ${productId} could not be resolved exactly.`);
    return product;
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

  async getCart(): Promise<Basket> {
    this.requireLogin("view the basket");
    return normalizeBasket(await this.json(`${API_BASE_URL}/basket/GetBasket`, {}, "Get basket"));
  }

  async addToCart(productId: number, quantity = 1): Promise<Basket> {
    this.requireLogin("add items");
    if (!Number.isInteger(productId) || productId < 1) throw new NemligError("Product ID must be positive.");
    if (!Number.isInteger(quantity) || quantity < 1) throw new NemligError("Quantity must be at least 1.");
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
      "Add to basket",
      false,
    );
    return this.readback("Product was added");
  }

  async removeFromCart(productId: number): Promise<Basket> {
    this.requireLogin("remove an item");
    if (!Number.isInteger(productId) || productId < 1) throw new NemligError("Product ID must be positive.");
    const matchesProduct = (item: Basket["items"][number]): boolean => String(item.id) === String(productId);
    if (!(await this.getCart()).items.some(matchesProduct)) {
      throw new NemligError(`Product ${productId} is not in the basket; nothing was removed.`);
    }
    await this.json(
      `${API_BASE_URL}/basket/AddToBasket`,
      {
        method: "POST",
        body: JSON.stringify({
          ProductId: productId,
          quantity: 0,
          AffectPartialQuantity: false,
          disableQuantityValidation: false,
        }),
      },
      "Remove from basket",
      false,
    );
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

  private requireLogin(operation: string): void {
    if (!this.loggedIn) throw new NemligError(`Must be logged in to ${operation}.`);
  }

  private async refreshSession(): Promise<void> {
    const token = asRecord(await this.json(`${API_BASE_URL}/Token`, {}, "Get token", true));
    this.accessToken = asString(token.access_token);
    if (!this.accessToken) throw new NemligError("Get token failed: invalid response data.");
    const settings = asRecord(
      await this.optionalJson(`${API_BASE_URL}/v2/AppSettings/Website`, "Get app settings"),
    );
    this.productTimestamp =
      asString(settings.CombinedProductsAndSitecoreTimestamp) ?? DEFAULT_PRODUCT_TIMESTAMP;
    this.correlationId = asString(settings.SitecorePublishedStamp) ?? DEFAULT_CORRELATION_ID;
    const user = asRecord(
      await this.optionalJson(`${API_BASE_URL}/user/GetCurrentUser`, "Get current user"),
    );
    const userId = user.DebitorId ?? user.Id;
    if (typeof userId === "number" || typeof userId === "string") this.userId = String(userId);
    const delivery = asRecord(
      await this.optionalJson(`${API_BASE_URL}/Order/DeliverySpot`, "Get delivery spot"),
    );
    this.timeslot = asString(delivery.TimeslotUtc) ?? this.timeslot;
    this.timeslotId = asNumber(delivery.TimeslotId) ?? this.timeslotId;
  }

  private async searchGateway(query: string, limit: number): Promise<Product[]> {
    if (!this.accessToken || !this.productTimestamp) return [];
    const params = new URLSearchParams({
      query,
      take: String(limit),
      skip: "0",
      recipeCount: "0",
      timestamp: this.productTimestamp,
      timeslotUtc: this.timeslot,
      deliveryZoneId: "1",
      includeFavorites: this.userId ?? "0",
      TimeSlotId: String(this.timeslotId),
    });
    const response = asRecord(
      await this.json(`${SEARCH_GATEWAY_URL}/search?${params}`, {}, "Search products", true, true),
    );
    const products = response.Products;
    return normalizeProducts(Array.isArray(products) ? products : asRecord(products).Products, limit);
  }

  private rememberProducts(products: Product[]): Product[] {
    for (const product of products) {
      if (product.id === undefined) continue;
      this.knownProducts.delete(product.id);
      this.knownProducts.set(product.id, product);
      while (this.knownProducts.size > KNOWN_PRODUCT_LIMIT) {
        const oldest = this.knownProducts.keys().next().value as number | undefined;
        if (oldest === undefined) break;
        this.knownProducts.delete(oldest);
      }
    }
    return products;
  }

  private async productsByCategory(path: string, limit: number, page = 1): Promise<Product[]> {
    const pageUrl = new URL(path, "https://www.nemlig.com");
    if (pageUrl.origin !== "https://www.nemlig.com") return [];
    pageUrl.searchParams.set("GetAsJson", "1");
    const categoryPage = asRecord(await this.optionalJson(pageUrl.toString(), "Get category"));
    const group = asRecords(categoryPage.content).find((entry) => entry.ProductGroupId)?.ProductGroupId;
    if (typeof group !== "string" && typeof group !== "number") return [];

    return this.productsByGroup(group, limit, "Get category products", page);
  }

  private async productsByGroup(
    group: string | number,
    limit: number,
    operation: string,
    page = 1,
  ): Promise<Product[]> {
    const endpoint = `${API_BASE_URL}/${this.productTimestamp ?? DEFAULT_PRODUCT_TIMESTAMP}/${this.timeslot}/1/${this.userId ?? "0"}/Products/GetByProductGroupId`;
    const params = new URLSearchParams({
      productGroupId: String(group),
      pageIndex: String(page - 1),
      pagesize: String(limit),
      sortorder: "default",
    });
    const response = asRecord(await this.optionalJson(`${endpoint}?${params}`, operation));
    return normalizeProducts(response.Products, limit);
  }

  private async optionalJson(url: string, operation: string, gateway = false): Promise<unknown> {
    try {
      return await this.json(url, {}, operation, true, gateway);
    } catch {
      return {};
    }
  }

  private async json(
    url: string,
    init: RequestInit,
    operation: string,
    retry = true,
    gateway = false,
  ): Promise<unknown> {
    let lastFailure: unknown;
    for (let attempt = 0; attempt <= (retry ? NEMLIG_READ_MAX_RETRIES : 0); attempt += 1) {
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
        if (this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`);
        const host = requestUrl.host;
        const cookies = this.cookies.get(host);
        if (cookies?.size) {
          headers.set("Cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
        }

        const signal = init.signal ? AbortSignal.any([init.signal, attemptSignal]) : attemptSignal;
        const response = await this.fetcher(url, {
          ...init,
          headers,
          signal,
        });
        this.captureCookies(host, response.headers);
        if (!response.ok) throw new NemligError(`${operation} failed (HTTP ${response.status}).`);
        try {
          return await response.json();
        } catch {
          throw new NemligError(`${operation} failed: invalid response data.`);
        }
      } catch (error) {
        if (error instanceof NemligError) throw error;
        lastFailure = error;
        if (init.signal?.aborted || attemptSignal.aborted) break;
      }
    }
    void lastFailure;
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
