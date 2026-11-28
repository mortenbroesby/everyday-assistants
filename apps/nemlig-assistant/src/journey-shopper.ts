import type { Product, ShoppingClient } from "./client.js";

const milk = {
  id: 910001,
  name: "Laktosefri letmælk",
  price: 12,
  unit: "kr/l",
  unitPrice: 12,
  unitSize: "1 liter",
  brand: "Journey",
  category: "Mejeri",
  subcategory: "Mælk",
  imageUrl: "",
  available: true,
  labels: [],
  isOrganic: false,
  isFrozen: false,
  isRefrigerated: true,
  isDairy: true,
  isLactoseFree: true,
  isGlutenFree: true,
  isVegan: false,
  isOnDiscount: false,
} satisfies Product;
const getProduct = async (id: number) => {
  if (id !== milk.id) {
    throw new Error("Unknown synthetic product");
  }
  return structuredClone(milk);
};
export function createJourneyShopper(): {
  client: ShoppingClient & { providerIdentity(): string };
} {
  return {
    client: {
      providerIdentity: () => "synthetic-shopper",
      isLoggedIn: () => true,
      login: async () => {
        throw new Error("Synthetic shopper has no provider account");
      },
      searchProducts: async (query) =>
        /laktosefri|mælk|milk/i.test(query) ? [await getProduct(milk.id)] : [],
      getProduct,
      getFreshProduct: getProduct,
      listFavorites: async () => [],
      listDepartments: async () => [{ id: "/mejeri", name: "Mejeri" }],
      browseDepartment: async () => ({
        products: [await getProduct(milk.id)],
        page: 1,
        hasNext: false,
      }),
      getCart: async () => ({
        items: [],
        productsPrice: 0,
        deliveryPrice: 0,
        numberOfProducts: 0,
        deliveryTime: undefined,
      }),
      addToCart: async () => {
        throw new Error("Synthetic shopper does not submit baskets");
      },
    },
  };
}
