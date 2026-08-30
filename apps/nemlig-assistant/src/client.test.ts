import assert from "node:assert/strict";
import test from "node:test";
import {
  matchFavorites,
  NemligClient,
  NemligError,
  SEARCH_GATEWAY_URL,
  normalizeProducts,
} from "./client.js";

interface ExpectedRequest {
  match: string;
  response: Response | (() => Response);
  inspect?: (url: string, init?: RequestInit) => void;
}

const mockFetch = (requests: ExpectedRequest[]): typeof fetch =>
  (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const expected = requests.shift();
    assert.ok(expected, `Unexpected request: ${url}`);
    assert.match(url, new RegExp(expected.match));
    expected.inspect?.(url, init);
    return typeof expected.response === "function" ? expected.response() : expected.response;
  }) as typeof fetch;

const json = (value: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json", ...init?.headers },
    ...init,
  });

const sessionRequests = (): ExpectedRequest[] => [
  { match: "/Token$", response: json({ access_token: "token-value" }) },
  {
    match: "/v2/AppSettings/Website$",
    response: json({
      CombinedProductsAndSitecoreTimestamp: "product-stamp",
      SitecorePublishedStamp: "site-stamp",
    }),
  },
  { match: "/user/GetCurrentUser$", response: json({ DebitorId: 42 }) },
  {
    match: "/Order/DeliverySpot$",
    response: json({ TimeslotUtc: "2026083115-60-240", TimeslotId: 7 }),
  },
];

test("login retains multiple cookies and reuses the session for basket access", async () => {
  const requests: ExpectedRequest[] = [
    {
      match: "/login$",
      inspect: (_url, init) =>
        assert.deepEqual(JSON.parse(String(init?.body)), {
          Username: "person@example.test",
          Password: "never-logged",
          CheckForExistingProducts: true,
          DoMerge: true,
          AppInstalled: false,
          SaveExistingBasket: false,
        }),
      response: () => {
        const headers = new Headers({ "content-type": "application/json" });
        headers.append("set-cookie", "session=abc; Path=/; Secure");
        headers.append("set-cookie", "member=def; Path=/; Secure");
        return new Response(JSON.stringify({ RedirectUrl: "/", TimeslotUtc: "login-slot" }), {
          headers,
        });
      },
    },
    ...sessionRequests(),
    {
      match: "/basket/GetBasket$",
      inspect: (_url, init) => {
        const headers = new Headers(init?.headers);
        assert.match(headers.get("cookie") ?? "", /session=abc/);
        assert.match(headers.get("cookie") ?? "", /member=def/);
        assert.equal(headers.get("authorization"), "Bearer token-value");
      },
      response: json({ Lines: [], TotalProductsPrice: 0, DeliveryPrice: 0 }),
    },
  ];
  const client = new NemligClient(mockFetch(requests), new Date("2026-08-30T08:00:00Z"));
  await client.login("person@example.test", "never-logged");
  assert.equal(client.isLoggedIn(), true);
  assert.deepEqual((await client.getCart()).items, []);
  assert.equal(requests.length, 0);
});

test("login rejects provider errors without exposing the supplied secret", async () => {
  const client = new NemligClient(
    mockFetch([{ match: "/login$", response: json({ ErrorCode: "bad", ErrorMessage: "Nope" }) }]),
  );
  await assert.rejects(client.login("person@example.test", "private-secret"), (error) => {
    assert.ok(error instanceof NemligError);
    assert.match(error.message, /Login failed: Nope/);
    assert.doesNotMatch(error.message, /private-secret/);
    return true;
  });
});

test("network reads retry, while basket mutations do not", async () => {
  let reads = 0;
  const readClient = new NemligClient(
    (async () => {
      reads += 1;
      throw new TypeError("offline");
    }) as typeof fetch,
  );
  assert.deepEqual(await readClient.searchProducts("mælk"), []);
  assert.equal(reads, 16); // four session reads, each with one initial attempt plus three retries

  const requests: ExpectedRequest[] = [
    { match: "/login$", response: json({ RedirectUrl: "/" }) },
    ...sessionRequests(),
    { match: "/basket/AddToBasket$", response: json({}, { status: 503 }) },
  ];
  const writeClient = new NemligClient(mockFetch(requests));
  await writeClient.login("person@example.test", "secret");
  await assert.rejects(writeClient.addToCart(123, 1), /HTTP 503/);
  assert.equal(requests.length, 0);
});

test("product normalization covers upstream fields and classifications", () => {
  const [product] = normalizeProducts(
    [
      {
        Id: 100,
        Name: "Økologisk mælk",
        Price: 14.95,
        UnitPrice: "14,95 kr/l",
        UnitPriceCalc: 14.95,
        Description: "1 liter",
        Brand: "Test",
        Category: "Køl",
        SubCategory: "Mejeri mælk",
        PrimaryImage: "https://images.test/milk.jpg",
        Availability: { IsDeliveryAvailable: true, IsAvailableInStock: false },
        Labels: ["Økologisk", "Laktosefri", "Glutenfri", "Vegan"],
        DiscountItem: true,
      },
    ],
    1,
  );
  assert.deepEqual(product, {
    id: 100,
    name: "Økologisk mælk",
    price: 14.95,
    unit: "14,95 kr/l",
    unitPrice: 14.95,
    unitSize: "1 liter",
    brand: "Test",
    category: "Køl",
    subcategory: "Mejeri mælk",
    imageUrl: "https://images.test/milk.jpg",
    available: false,
    labels: ["Økologisk", "Laktosefri", "Glutenfri", "Vegan"],
    isOrganic: true,
    isFrozen: false,
    isRefrigerated: true,
    isDairy: true,
    isLactoseFree: true,
    isGlutenFree: true,
    isVegan: true,
    isOnDiscount: true,
  });
});

test("search accepts nested products and sends the current session values", async () => {
  const requests: ExpectedRequest[] = [
    ...sessionRequests(),
    {
      match: `${SEARCH_GATEWAY_URL}/search`,
      inspect: (url, init) => {
        const parsed = new URL(url);
        assert.equal(parsed.searchParams.get("take"), "2");
        assert.equal(parsed.searchParams.get("timestamp"), "product-stamp");
        assert.equal(parsed.searchParams.get("TimeSlotId"), "7");
        assert.equal(new Headers(init?.headers).has("content-type"), false);
      },
      response: json({ Products: { Products: [{ Id: 1, Name: "Mælk", Price: 10 }] } }),
    },
  ];
  const products = await new NemligClient(mockFetch(requests)).searchProducts("mælk", 2);
  assert.equal(products[0]?.name, "Mælk");
  assert.equal(requests.length, 0);
});

test("search accepts the upstream flat product response", async () => {
  const requests: ExpectedRequest[] = [
    ...sessionRequests(),
    {
      match: `${SEARCH_GATEWAY_URL}/search`,
      response: json({ Products: [{ Id: "2", Name: "Flat milk", Price: 11 }] }),
    },
  ];
  const products = await new NemligClient(mockFetch(requests)).searchProducts("mælk", 1);
  assert.equal(products[0]?.name, "Flat milk");
  assert.equal(products[0]?.id, 2);
});

test("exact product lookup returns only the matching numeric ID", async () => {
  const requests: ExpectedRequest[] = [
    ...sessionRequests(),
    {
      match: `${SEARCH_GATEWAY_URL}/search`,
      inspect: (url) => assert.equal(new URL(url).searchParams.get("query"), "424242"),
      response: json({
        Products: [
          { Id: 1, Name: "Wrong" },
          { Id: 424242, Name: "Test Product", Price: 12.34 },
        ],
      }),
    },
  ];
  assert.equal((await new NemligClient(mockFetch(requests)).getProduct(424242)).name, "Test Product");
  assert.equal(requests.length, 0);
});

test("exact product lookup retries with a previously observed product name", async () => {
  const product = { Id: 424242, Name: "Test Product", Price: 12.34 };
  const requests: ExpectedRequest[] = [
    ...sessionRequests(),
    { match: "/search\\?", response: json({ Products: [product] }) },
    { match: "/search\\?", response: json({ Products: [] }) },
    { match: "/quick\\?", response: json({ Categories: [] }) },
    { match: "/search\\?", response: json({ Products: [product] }) },
  ];
  const client = new NemligClient(mockFetch(requests));
  await client.searchProducts("Test Product", 1);
  assert.equal((await client.getProduct(424242)).name, "Test Product");
  assert.equal(requests.length, 0);
});

test("authenticated exact product lookup falls back to current favorites", async () => {
  const requests: ExpectedRequest[] = [
    { match: "/login$", response: json({ MergeSuccessful: true }) },
    ...sessionRequests(),
    { match: "/search\\?", response: json({ Products: [] }) },
    { match: "/quick\\?", response: json({ Categories: [] }) },
    {
      match: "https://www.nemlig.com/favoritter\\?",
      response: json({ content: [{ TemplateName: "productlistshowallspot", ProductGroupId: "favorites" }] }),
    },
    {
      match: "/Products/GetByProductGroupId\\?",
      response: json({ Products: [{ Id: 424242, Name: "Test Product", Price: 12.34 }] }),
    },
  ];
  const client = new NemligClient(mockFetch(requests));
  await client.login("person@example.test", "secret");
  assert.equal((await client.getProduct(424242)).name, "Test Product");
  assert.equal(requests.length, 0);
});

test("exact product lookup rejects invalid and unresolved IDs", async () => {
  const client = new NemligClient(
    mockFetch([
      ...sessionRequests(),
      { match: "/search\\?", response: json({ Products: [] }) },
      { match: "/quick\\?", response: json({ Categories: [] }) },
    ]),
  );
  await assert.rejects(client.getProduct(0), /Product ID must be positive/);
  await assert.rejects(client.getProduct(7), /could not be resolved exactly/);
});

test("empty gateway search tries no more than three safe fallback categories", async () => {
  const requests: ExpectedRequest[] = [
    ...sessionRequests(),
    { match: "/search\\?", response: json({ Products: [] }) },
    {
      match: "/quick\\?",
      response: json({
        Categories: [
          { Url: "/one" },
          { Url: "https://evil.example.test/nope" },
          { Url: "/three" },
          { Url: "/four" },
        ],
      }),
    },
    { match: "https://www.nemlig.com/one\\?GetAsJson=1", response: json({ content: [] }) },
    { match: "https://www.nemlig.com/three\\?GetAsJson=1", response: json({ content: [] }) },
  ];
  assert.deepEqual(await new NemligClient(mockFetch(requests)).searchProducts("ost", 5), []);
  assert.equal(requests.length, 0);
});

test("category fallback returns the first non-empty product group", async () => {
  const requests: ExpectedRequest[] = [
    ...sessionRequests(),
    { match: "/search\\?", response: json({ Products: { Products: [] } }) },
    { match: "/quick\\?", response: json({ Categories: [{ Url: "/milk" }] }) },
    {
      match: "https://www.nemlig.com/milk\\?GetAsJson=1",
      response: json({ content: [{ ProductGroupId: "group-1" }] }),
    },
    {
      match: "/Products/GetByProductGroupId\\?",
      response: json({ Products: [{ Id: 9, Name: "Fallback milk", Category: "Køl" }] }),
    },
  ];
  const products = await new NemligClient(mockFetch(requests)).searchProducts("milk", 3);
  assert.equal(products[0]?.id, 9);
});

test("favorites follows authenticated show-all groups, deduplicates, and never mutates", async () => {
  const requests: ExpectedRequest[] = [
    { match: "/login$", response: json({ MergeSuccessful: true }) },
    ...sessionRequests(),
    {
      match: "https://www.nemlig.com/favoritter\\?",
      inspect: (url, init) => {
        const parsed = new URL(url);
        assert.equal(parsed.searchParams.get("GetAsJson"), "1");
        assert.equal(parsed.searchParams.get("t"), "2026083115-60-240");
        assert.equal(init?.method, undefined);
        assert.equal(new Headers(init?.headers).has("content-type"), false);
      },
      response: json({
        content: [
          { TemplateName: "productlistonerowspot", ProductGroupId: "recommendations" },
          { TemplateName: "productlistshowallspot", ProductGroupId: "sale" },
          { TemplateName: "productlistshowallspot", ProductGroupId: "produce" },
        ],
      }),
    },
    {
      match: "/Products/GetByProductGroupId\\?",
      inspect: (url, init) => {
        const parsed = new URL(url);
        assert.equal(parsed.searchParams.get("productGroupId"), "sale");
        assert.equal(parsed.searchParams.get("pagesize"), "3");
        assert.equal(init?.method, undefined);
      },
      response: json({ Products: [{ Id: 7, Name: "Favorite milk", Price: 12.5 }] }),
    },
    {
      match: "/Products/GetByProductGroupId\\?",
      inspect: (url) => {
        const parsed = new URL(url);
        assert.equal(parsed.searchParams.get("productGroupId"), "produce");
        assert.equal(parsed.searchParams.get("pagesize"), "2");
      },
      response: json({
        Products: [
          { Id: 7, Name: "Favorite milk", Price: 12.5 },
          { Id: 8, Name: "Favorite banana", Price: 2.5 },
        ],
      }),
    },
  ];
  const client = new NemligClient(mockFetch(requests));
  await client.login("person@example.test", "secret");
  assert.deepEqual(
    (await client.listFavorites(3)).map(({ id, name }) => ({ id, name })),
    [
      { id: 7, name: "Favorite milk" },
      { id: 8, name: "Favorite banana" },
    ],
  );
  assert.equal(requests.length, 0);
});

test("favorites matching is Danish-aware, ordered, limited, and empty when unmatched", () => {
  const favorites = normalizeProducts(
    [
      { Id: 1, Name: "Økologiske bananer" },
      { Id: 2, Name: "Bananer i klase" },
      { Id: 3, Name: "Banan smoothie" },
      { Id: 4, Name: "Danske pærer" },
    ],
    4,
  );
  assert.deepEqual(
    matchFavorites(favorites, " BANAN ", 2).map((favorite) => favorite.id),
    [1, 2],
  );
  assert.deepEqual(matchFavorites(favorites, "mælk", 2), []);
  assert.throws(() => matchFavorites(favorites, " ", 2), /Favorites query is required/);
  assert.throws(() => matchFavorites(favorites, "banan", 0), /Favorites limit must be positive/);
});

test("basket add sends the exact payload and returns normalized readback", async () => {
  const requests: ExpectedRequest[] = [
    { match: "/login$", response: json({ RedirectUrl: "/" }) },
    ...sessionRequests(),
    {
      match: "/basket/AddToBasket$",
      inspect: (_url, init) =>
        assert.deepEqual(JSON.parse(String(init?.body)), {
          ProductId: 701015,
          quantity: 2,
          AffectPartialQuantity: false,
          disableQuantityValidation: false,
        }),
      response: json({}),
    },
    {
      match: "/basket/GetBasket$",
      response: json({
        Lines: [{ Id: 701015, Name: "Milk", Quantity: 2, Total: 25.9 }],
        TotalProductsPrice: 25.9,
        DeliveryPrice: 5,
        NumberOfProducts: 2,
        FormattedDeliveryTime: "Tomorrow",
      }),
    },
  ];
  const client = new NemligClient(mockFetch(requests));
  await client.login("person@example.test", "secret");
  const basket = await client.addToCart(701015, 2);
  assert.deepEqual(basket.items, [{ id: 701015, name: "Milk", quantity: 2, total: 25.9 }]);
  assert.equal(basket.productsPrice, 25.9);
});

test("exact basket-line removal sends zero quantity and verifies the product ID is absent", async () => {
  const requests: ExpectedRequest[] = [
    { match: "/login$", response: json({ RedirectUrl: "/" }) },
    ...sessionRequests(),
    {
      match: "/basket/GetBasket$",
      response: json({ Lines: [{ Id: 7, Name: "Banana", Quantity: 1, Total: 2.5 }] }),
    },
    {
      match: "/basket/AddToBasket$",
      inspect: (_url, init) =>
        assert.deepEqual(JSON.parse(String(init?.body)), {
          ProductId: 7,
          quantity: 0,
          AffectPartialQuantity: false,
          disableQuantityValidation: false,
        }),
      response: json({}),
    },
    {
      match: "/basket/GetBasket$",
      response: json({ Lines: [{ Id: 8, Name: "Milk", Quantity: 1, Total: 12.5 }] }),
    },
  ];
  const client = new NemligClient(mockFetch(requests));
  await client.login("person@example.test", "secret");
  assert.deepEqual((await client.removeFromCart(7)).items.map((item) => item.id), [8]);
  assert.equal(requests.length, 0);
});

test("exact basket-line removal refuses absent lines and reports failed ID verification", async () => {
  const requests: ExpectedRequest[] = [
    { match: "/login$", response: json({ RedirectUrl: "/" }) },
    ...sessionRequests(),
    { match: "/basket/GetBasket$", response: json({ Lines: [] }) },
    { match: "/basket/GetBasket$", response: json({ Lines: [{ ProductId: "7" }] }) },
    { match: "/basket/AddToBasket$", response: json({}) },
    { match: "/basket/GetBasket$", response: json({ Lines: [{ Id: 7 }] }) },
  ];
  const client = new NemligClient(mockFetch(requests));
  await client.login("person@example.test", "secret");
  await assert.rejects(client.removeFromCart(7), /not in the basket; nothing was removed/);
  await assert.rejects(client.removeFromCart(7), /may not have been removed/);
  assert.equal(requests.length, 0);
});

test("basket validation blocks bad inputs before calls and reports partial readback failure", async () => {
  const requests: ExpectedRequest[] = [
    { match: "/login$", response: json({ RedirectUrl: "/" }) },
    ...sessionRequests(),
    { match: "/basket/ClearBasket$", response: json({}) },
    { match: "/basket/GetBasket$", response: json({}, { status: 500 }) },
  ];
  const client = new NemligClient(mockFetch(requests));
  await client.login("person@example.test", "secret");
  await assert.rejects(client.addToCart(1, 0), /Quantity must be at least 1/);
  await assert.rejects(client.removeFromCart(0), /Product ID must be positive/);
  await assert.rejects(client.clearCart(), /Basket was cleared, but basket verification failed/);
  assert.equal(requests.length, 0);
});

test("clear basket returns the verified normalized empty basket", async () => {
  const requests: ExpectedRequest[] = [
    { match: "/login$", response: json({ RedirectUrl: "/" }) },
    ...sessionRequests(),
    {
      match: "/basket/ClearBasket$",
      inspect: (_url, init) => assert.equal(init?.method, "POST"),
      response: json({}),
    },
    {
      match: "/basket/GetBasket$",
      response: json({ Lines: [], TotalProductsPrice: 0, DeliveryPrice: 0, NumberOfProducts: 0 }),
    },
  ];
  const client = new NemligClient(mockFetch(requests));
  await client.login("person@example.test", "secret");
  assert.deepEqual(await client.clearCart(), {
    items: [],
    productsPrice: 0,
    deliveryPrice: 0,
    numberOfProducts: 0,
    deliveryTime: undefined,
  });
});

test("unauthenticated basket operations fail before network access", async () => {
  const client = new NemligClient(mockFetch([]));
  await assert.rejects(client.listFavorites(), /Must be logged in/);
  await assert.rejects(client.getCart(), /Must be logged in/);
  await assert.rejects(client.addToCart(1), /Must be logged in/);
  await assert.rejects(client.removeFromCart(1), /Must be logged in/);
  await assert.rejects(client.clearCart(), /Must be logged in/);
});

test("search validates its boundary", async () => {
  const client = new NemligClient(mockFetch([]));
  await assert.rejects(client.searchProducts(""), /Search query is required/);
  await assert.rejects(client.searchProducts("milk", 0), /Search limit must be positive/);
});

test("favorites validates its boundary before network access", async () => {
  const client = new NemligClient(mockFetch([]));
  Object.assign(client, { loggedIn: true });
  await assert.rejects(client.listFavorites(0), /Favorites limit must be positive/);
});
