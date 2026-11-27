## Context

At assistant revision 18c9ba7 on 2026-11-27, the public storefront loaded main-EJDYIR4W.js. Inspection gives the following starting inventory. Static references establish intent. HTTP observations establish only the recorded response.

| Journey | Assistant baseline | Storefront evidence | Initial decision |
|---|---|---|---|
| Search | searchgateway/api/search | productbff/api/v2/web/search/products with query, take, skip and timeslotId. One anonymous direct GET returned 401. | Evaluate first |
| Suggestions | searchgateway/api/quick for fallback categories | Same route referenced for autocomplete | Retain pending category schema comparison |
| Exact detail | context-stamped Products/Get | productbff/api/web/productDetails/{id} with optional timeslot | Evaluate for fresh lookup |
| Browse and favorites | GetAsJson pages and Products/GetByProductGroupId | productbff/api/web/page and menu references. Legacy homepage JSON returned 200. | Compare navigation, pagination and favorite semantics separately |
| Session | AntiForgery, Token, login, settings and user context | Token, AntiForgery and login remain referenced | Trace dependencies before proposing removal |
| Recipes | No equivalent established in baseline | Recipe search, details, filters and recipe-product dialog | Evaluate separately as a feature |
| Basket and shopping lists | Reads and mutation methods coexist in client.ts | Website parity unresolved | Trace callers and compare existing evidence only |

## Goals / Non-Goals

Identify which changes would improve product coverage, correctness, latency or maintenance. Scope includes authenticated read comparisons where an authorized session is available. Checkout, delivery changes, account writes, basket experiments, provider load testing and production rollout are outside this research.

## Decisions

Start with one ordinary search and one exact detail lookup for the same item. Pair old and new reads in the same session, locale and delivery slot. Record item IDs, rank, pack, price units, promotion conditions, availability and missing fields. Expand to Danish characters, ambiguous terms, no matches, discounts and pagination only as needed. Measure request counts and elapsed time separately from session bootstrap. Treat small timing samples as observations.

Trace exported client methods to their reachable CLI, MCP and hosted callers. Distinguish supported journeys from dormant methods. For each capability record the old/new contract, evidence date and class (bundle, observed request, paired response, fixture), gaps, benefit and decision. Reuse sanitized fixtures for adapter tests. A follow-up proposing a switch must identify rollback and prove the fresh exact-product check remains valid.

## Risks / Trade-offs

A different delivery slot or guest context can change assortment and prices. Mark an unmatched pair inconclusive. Missing eligibility or unit information can turn a promotion into a misleading price. Keep such fields unknown. Record only allowlisted observations. Keep private captures local, omit headers, tokens, cookies, account data and full URLs with private parameters. Stop a journey on access refusal or apparent mutation. Limit live samples and avoid persistent dual reads.

## First guest observations, November 27

A fresh Chrome guest searched for `mælk` using the site's search field and reached `/soeg`. The browser received HTTP 200 on GET requests to both the v2 product search and the quick suggestions route. The search response has top-level keys `searchResult` and `structuredData`. The assistant currently expects `Products` or `Products.Products`. A guest can exercise the normal search journey. The earlier bare-request 401 did not establish that an account is required.

The public HTML for [product 103368](https://www.nemlig.com/produkt/103368) supplied a server-rendered transfer-cache response for the detail API. The legacy detail route returned the same ID, title, brand and pack description directly. Legacy returned `Price: 12.95` and `UnitPrice: "12,95 kr./Ltr."`. The storefront detail envelope contained `product.price: 1295`, `currency: "DKK"`, and `pricePerUnit: {value: 1295, unitType: "Volume"}`; the product page displayed 12.95 kr. for one litre. A future adapter must test currency scale explicitly. This sample does not settle unit denominators for other pack sizes. The new record's availability is an object with type Available, while quantity is zero. Quantity is unsuitable as a stand-alone stock indicator. The two guest reads had no proven common delivery slot, so this is schema evidence only.

The homepage transfer cache contains a menu response with separate highlighted, categories and aboutNemlig arrays. Category entries expose title, URL and image. This establishes a candidate source for top-level navigation; stock, pagination and favorites remain open.

## Caller and evidence inventory

The checked-in `apps/nemlig-assistant/nemlig-api.openapi.json` distinguishes client-used and observed-only operations. Its maintenance procedure in the [app README](../../../apps/nemlig-assistant/README.md#reverse-engineered-nemlig-api) calls for dated first-party bundle references, anonymous browser traces and synthetic fixtures. Reuse the request and response cases in `src/client.test.ts` for the old adapter. At baseline, the inventory covers both legacy search routes and does not describe the v2 catalog routes.

| Operation | Reachable consumer and decision |
|---|---|
| Search and exact detail | CLI search and MCP product discovery use search results. Discovery and draft review hydrate individual items. Hosted HTTP and stdio share createMcpServer. Assess v2 search as an independent read adapter. Keep fresh detail on the legacy adapter until equivalent slot, identity and availability checks pass. |
| Departments, browsing and favorites | cli.ts calls listDepartments, browseDepartment and listFavorites. Legacy empty-search recovery also follows category pages and groups. Keep favorite pagination and fallback coverage separate from top-level menu replacement. |
| Session | CLI login and hosted credential validation enter different client methods. A guest browser used AntiForgery, Token and GetCurrentUser. Retain established account binding and credential validation. |
| Basket | CLI uses getCart, addToCart and addManyToCart. MCP reads the basket and reviewed direct submission calls addManyToCart only after fresh lookup. Keep existing behavior. |
| Saved lists | ProductReviewService lists saved lists, loads an exact list into a local draft, and saves a current basket as a list. Standalone create, edit, delete and add-list-to-cart client methods are separate from those review flows. Retain existing read and write routes. No provider write is needed to assess reachability. |

Direct submission compares ID, name, brand, unit and unit size across complete views. Confirmed unavailability or an exact 404 skips the item. Unknown availability, changed identity or ambiguous lookup blocks dispatch. Price-only changes are accepted by the existing review contract. Three focused synthetic direct-submit tests passed on the assistant baseline 18c9ba7. These exercise the legacy contract and do not validate a candidate adapter.

## Guest search and adjacent flows

On November 27, the server-rendered GET for `/soeg?query=mælk` contained 80 entries under `searchResult.items`. The first entry wrapped a product in a typed item. The unlikely query `zzqvnemligzz` produced an empty items array under the same envelope. The result also carries separate product and recipe totals. Decode item type before product normalization and distinguish malformed responses from valid empty results.

The guest recipes page included an allRecipes response with categories, filters and a total count. The guest favorites page included a generic page response. Neither proves ingredient substitution or personalized favorites. A direct GET to the category slug /frugt-og-groent returned 404 despite that value appearing in the menu. Following the public homepage link resolved the missing prefix: GET /kategori/frugt-og-groent succeeded. Its transfer cache contained productbff/api/v3/web/categories/products with root, categories and requestedCategory fields. Evaluate that endpoint for category product traversal; the menu supplies navigation labels and slugs.
