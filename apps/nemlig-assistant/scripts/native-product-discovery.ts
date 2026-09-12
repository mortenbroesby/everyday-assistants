import type { Product } from "../src/client.js";
import {
  isAuthenticationFailure,
  readCatalogue,
  type CatalogueRetrieval,
  type ProductDiscoveryClient,
  type ProductDiscoveryResult,
  uniqueCatalogueRetrievals,
} from "../src/product-discovery.js";

type Discovery = { readonly products: Product[]; readonly unavailable: boolean };
const unavailable: Discovery = { products: [], unavailable: true };

const mapLimit = async <T, R>(values: readonly T[], limit: number, work: (value: T) => Promise<R>): Promise<R[]> => {
  const result = new Array<R>(values.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) { const index = next++; result[index] = await work(values[index]!); }
  }));
  return result;
};

/** Historical benchmark baseline retained outside the shipped runtime. */
export async function resolveNativeProductDiscovery(
  client: ProductDiscoveryClient,
  retrievals: readonly CatalogueRetrieval[],
  signal?: AbortSignal,
): Promise<ProductDiscoveryResult> {
  const { unique, positions } = uniqueCatalogueRetrievals(retrievals);
  const basketPromise = client.getCart(signal);
  const uniqueDiscoveries = await mapLimit(unique, 3, async (retrieval): Promise<Discovery> => {
    try {
      return { products: await readCatalogue(client, retrieval, signal), unavailable: false };
    } catch (error) {
      if (isAuthenticationFailure(error)) throw error;
      return unavailable;
    }
  });
  return { basket: await basketPromise, discoveries: positions.map((position) => uniqueDiscoveries[position]!) };
}
