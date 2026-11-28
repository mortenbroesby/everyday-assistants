import { NemligClient, type ShoppingClient } from "./client.js";

const milk = {
  id: "910001",
  title: "Laktosefri letmælk",
  price: 1200,
  currency: "DKK",
  description: "1 liter",
  brandName: "Journey",
  certificates: [{ text: "Laktosefri" }],
  pricePerUnit: { value: 1200, unitType: "Volume" },
  availability: { type: "Available" },
  tracking: { item_category: "Mejeri", item_category2: "Mælk" },
};

// Supply wire responses at the fetch boundary so the normal catalogue client
// constructs requests, loads its slot, parses minor units and hydrates details.
const catalogueFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if ((init?.method ?? "GET") !== "GET") {
    throw new Error("Synthetic catalogue only supports reads");
  }
  switch (url.origin + url.pathname) {
    case "https://www.nemlig.com/webapi/Token":
      return Response.json({ access_token: "fixture-token" });
    case "https://www.nemlig.com/webapi/basket/GetBasket":
      return Response.json({ DeliveryTimeSlot: { Id: 7 } });
    case "https://webapi.prod.knl.nemlig.it/productbff/api/v2/web/search/products": {
      const matches = /laktosefri|mælk|milk/i.test(
        url.searchParams.get("query") ?? "",
      );
      return Response.json({
        searchResult: {
          items: matches ? [{ type: "product", product: milk }] : [],
        },
      });
    }
    case "https://webapi.prod.knl.nemlig.it/searchgateway/api/quick":
      return Response.json({ Categories: [] });
    case "https://webapi.prod.knl.nemlig.it/productbff/api/web/productDetails/910001":
      return Response.json({ product: milk });
    default:
      return new Response(null, { status: 404 });
  }
};

export function createJourneyShopper(): {
  client: ShoppingClient & { providerIdentity(): string };
} {
  const catalogue = new NemligClient(catalogueFetch);
  return {
    client: {
      providerIdentity: () => "synthetic-shopper",
      isLoggedIn: () => true,
      login: async () => {
        throw new Error("Synthetic shopper has no provider account");
      },
      searchProducts: catalogue.searchProducts.bind(catalogue),
      getProduct: catalogue.getProduct.bind(catalogue),
      getFreshProduct: catalogue.getFreshProduct.bind(catalogue),
      listFavorites: async () => [],
      listDepartments: async () => [{ id: "/mejeri", name: "Mejeri" }],
      browseDepartment: async () => ({
        products: [await catalogue.getProduct(Number(milk.id))],
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
