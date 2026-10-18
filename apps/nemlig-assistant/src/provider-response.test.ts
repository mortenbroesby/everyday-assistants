import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeBasket,
  normalizeDepartments,
  normalizeProducts,
  normalizeShoppingList,
  normalizeShoppingListOverviewPage,
} from "./provider-response.js";

test("pure product parsing preserves provider unknowns and bounded safe text", () => {
  const [unknown, unavailable, available] = normalizeProducts([
    {
      Id: 1,
      Name: "Unknown",
      Text: '<script>hidden</script><a href="https://example.com">Shown</a>',
      Labels: ["Økologisk", 42],
      Attributes: [
        { Key: "Visible", Value: "Yes" },
        { Key: "Hidden", Value: "No", IsVisible: false },
      ],
    },
    {
      Id: 2,
      Availability: { IsDeliveryAvailable: false, IsAvailableInStock: true },
    },
    {
      Id: 3,
      Availability: { IsDeliveryAvailable: true, IsAvailableInStock: true },
    },
  ]);
  assert.equal(unknown.available, undefined);
  assert.equal(unknown.description, "Shown");
  assert.deepEqual(unknown.labels, ["Økologisk"]);
  assert.deepEqual(unknown.details, [{ key: "Visible", value: "Yes" }]);
  assert.equal(unavailable.available, false);
  assert.equal(available.available, true);
  assert.deepEqual(
    normalizeProducts([{ Id: 1 }, { Id: 2 }], 1).map((p) => p.id),
    [1],
  );
});

test("search products retain the provider's unit-price label when full unit text is absent", () => {
  const [search, exact] = normalizeProducts([
    { Id: 1, UnitPriceLabel: "kr/l", UnitPriceCalc: 19.95 },
    {
      Id: 2,
      UnitPrice: "19,95 kr./Ltr.",
      UnitPriceLabel: "kr./Ltr.",
      UnitPriceCalc: 19.95,
    },
  ]);
  assert.equal(search.unit, "kr/l");
  assert.equal(search.unitPrice, 19.95);
  assert.equal(exact.unit, "19,95 kr./Ltr.");
});

test("pure list parsing rejects wrong identity, malformed rows and duplicate IDs", () => {
  const list = {
    Id: 7,
    Name: "Groceries",
    Lines: [{ ProductId: 5, Quantity: 2 }],
  };
  assert.deepEqual(normalizeShoppingList(list, 7), {
    id: 7,
    name: "Groceries",
    items: [{ productId: 5, quantity: 2 }],
  });
  assert.throws(() => normalizeShoppingList(list, 8), /incomplete/u);
  assert.throws(
    () => normalizeShoppingList({ ...list, Lines: undefined }, 7),
    /incomplete/u,
  );
  assert.throws(
    () =>
      normalizeShoppingList(
        { ...list, Lines: [{ ProductId: 5, Quantity: 0 }] },
        7,
      ),
    /incomplete/u,
  );
  assert.throws(
    () =>
      normalizeShoppingList(
        { ...list, Lines: [list.Lines[0], list.Lines[0]] },
        7,
      ),
    /incomplete/u,
  );
});

test("pure inventory parsing distinguishes empty from incomplete pages", () => {
  assert.deepEqual(
    normalizeShoppingListOverviewPage({
      ShoppingListOverViewViewModels: [],
      NumberOfPages: 0,
    }),
    { lists: [], numberOfPages: 0 },
  );
  assert.throws(
    () =>
      normalizeShoppingListOverviewPage({ ShoppingListOverViewViewModels: [] }),
    /incomplete/u,
  );
  assert.throws(
    () =>
      normalizeShoppingListOverviewPage({
        ShoppingListOverViewViewModels: [
          { Id: 7, Name: "One" },
          { Id: 7, Name: "Two" },
        ],
        NumberOfPages: 1,
      }),
    /incomplete/u,
  );
});

test("pure basket parsing retains unknown fields for protected write validation", () => {
  assert.deepEqual(
    normalizeBasket({
      Lines: [
        { ProductName: "Unknown", Quantity: null },
        { Id: 7, Quantity: 2, Price: 10 },
      ],
    }),
    {
      items: [
        {
          id: undefined,
          name: "Unknown",
          quantity: undefined,
          total: undefined,
        },
        { id: 7, name: undefined, quantity: 2, total: 10 },
      ],
      productsPrice: undefined,
      deliveryPrice: undefined,
      numberOfProducts: undefined,
      deliveryTime: undefined,
    },
  );
});

test("pure department parsing keeps only unique relative provider paths", () => {
  assert.deepEqual(
    normalizeDepartments({
      content: [
        { Url: "/mejeri", Name: "Mejeri" },
        { Url: "/mejeri", Name: "Duplicate" },
        { Url: "//unsafe.example", Name: "Unsafe" },
        { Url: "https://unsafe.example", Name: "External" },
      ],
    }),
    [{ id: "/mejeri", name: "Mejeri" }],
  );
});
