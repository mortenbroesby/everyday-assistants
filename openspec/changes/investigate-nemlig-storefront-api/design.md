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

## Paired guest catalog observations, November 27

The normal guest browser supplied a nonempty timeslotId to v2 search. The assistant's guest bootstrap returned 200 for Token, Website settings and GetCurrentUser, then 404 for DeliverySpot; legacy search still succeeded with its fallback context. An empty timeslotId gave v2 search a 400 validation error. A public GetBasket read provided a coherent DeliveryTimeSlot.Id, TimeslotUtc and DeliveryZoneId. Supplying that tuple to legacy search and its ID to v2 gave 200 on both. No delivery slot was selected or changed. Each comparison used the same guest delivery context; signed-in personalization remains unmeasured.

| Paired read | Observed result | Consequence |
|---|---|---|
| Search mælk, first five | Four shared IDs, all four prices equal after currency conversion. Legacy first was Delemælk, v2 first was Minimælk. | Migration changes which candidate a short review sees. Evaluate selection quality separately from schema parity. |
| Search kaffe, first 15 requested | Legacy returned 15 products. V2 returned 14 product-bearing entries after filtering. Two IDs overlapped. | Ordering and recall differ materially even under the same slot. Do not carry over a first-result preference. |
| V2 pagination for mælk | Skip 5, take 5 yielded four product-bearing entries with no ID from the first five. The website bundle uses skip 0 and increases take in multiples of 80. | Treat response positions and normalized product counts separately. An underfilled product page alone is insufficient evidence of end-of-results. |
| Exact detail for 103368 | Same title and 1 l pack across search, matching pack on both detail routes. Both indicated availability. Price 12.95 DKK versus 1295 minor units; per-litre value also matched. | Identity, base price and known-positive availability can be mapped on this sample. |
| Coffee promotion for 5062680 | Same 200 g pack. Legacy base price 79.95 and unit price 399.75 DKK/kg; v2 detail 7995 and 39975 with type Weight. Legacy campaign has MinQuantity 2 and TotalPrice 149. V2 search campaignLines displayed two for 149; the sampled line had no campaignType, and the detail campaignLabel supplied no period value. | Preserve the regular single-unit price. An absent original price does not establish absence of a multibuy offer. Keep conditions as display text unless a structured contract is verified. |

For the observed cold guest legacy search, four bootstrap requests preceded the search. The comparison used one extra guest basket read to obtain actual context. The new search and detail each succeeded in one catalog call once context was available. A switch does not yet justify assuming lower total request volume. An implementation decision needs a design for session-bound context reuse, expiry and fresh availability.

## Migration decision and authenticated reads

The owner selected migration to the storefront catalog routes as protection against possible legacy deprecation. Deprecation timing is unknown. Stage search and exact detail separately from category browsing and favorites so each adapter can be reverted independently. Compare reads offline after collecting bounded samples. Avoid routine production dual reads. Recipes remain a separate feature decision.

A fresh client signed in with basket merging disabled. A positive current-user identity confirmed account context. The client bootstrap had no usable slot. A read of the existing basket supplied the delivery tuple. With identical context, authenticated legacy and v2 milk search each returned five products with four overlapping IDs. V2 search and exact detail both returned 200, and the detail ID matched the selected result. No account identifiers, personalized product selections, or basket contents are retained here. Sign-in was the sole POST.

## Recipe and discovery evidence

The public recipe index supplies category trees and paginated recipe cards. The selected roast recipe exposed ingredients, instructions, serving limits, and product previews. A guest GET of recipeProductDialog for two and four servings returned four included ingredient rows and two self-supplied rows in both cases. Each included row had a suggested product and pack count, with zero to four alternatives in this sample. The returned serving count changed while the suggested pack counts stayed at one. An eventual recipe-to-draft feature can preserve pantry choices and display alternatives. Ingredient measures and purchasable packs must remain separate. Defer the feature pending explicit product scope.

The existing quick suggestion route returned three named category URLs and three string suggestions for mælk. V3 category browsing exposes category hierarchy and requestedCategory.items plus totalCount. Preserve quick suggestions; evaluate v3 against the CLI's existing department IDs. Personalized favorite membership requires separate authenticated evidence.

## Exact-detail migration verification

The authenticated client issued two independent GET requests to web/productDetails/{id}, both with the current basket slot and both HTTP 200. The second call used getFreshProduct after ordinary hydration. Identity, single-unit price, pack, brand, description, declaration, attributes and image were present for the sample milk. The gateway request uses the bearer session without forwarding website cookies. An exact HTTP 404 still means missing product. Other errors and ID mismatches remain ambiguous.

The storefront bundle explicitly classifies SoldOut and Discontinued as unavailable. Synthetic fixtures verified these states, Available with quantity zero, and an unknown future state. No live out-of-stock claim is based on those fixtures. Unit-price fixtures preserve 7995 as 79.95 DKK per pack and 39975 as 399.75 DKK/kg even with a separate multibuy campaign. The client, normalization and review suites exercise exact lookup, cache bypass, cancellation, unknown availability and pre-dispatch validation. Reverting the detail migration commit restores the legacy exact route independently of v2 search.

## Authenticated favorites comparison

In the same authenticated session, a read of the storefront page for /favoritter returned product-list sections. All cards checked carried isFavorite=true. Comparing unique product IDs against the legacy client's complete list found 109 IDs only in the legacy result and 36 only in the storefront page. Only one of five IDs overlapped at each of the first two matching page positions. Counts are aggregate; account records and individual IDs are omitted.

Decision: retain the current favorites client pending verification of the section-level navigation links under /favoritter. Directly flattening the page would change membership as well as ordering. Neither result independently proves the user's complete set of favorites.

## Department migration and favorites decision

On the same laptop, the legacy listDepartments returned zero entries and the storefront menu returned 21. The CLI keeps department IDs in the existing /slug form. It validates the ID against the current menu before sending categoryPath to the v3 route. For a page size of five the first two produce windows yielded five and four products with zero shared IDs. The second window contained an ad. The provider's requestedCategory.totalCount was five and four for those windows despite additional pages. Requesting one extra position detects continuation without an additional call. A full page of ads can still point to a later page.

A cold category browse uses the existing bounded session bootstrap and one request each for menu and category. Warm browsing revalidates the menu and requests one category window. No dual reads run in production. Revert the department migration commit to restore the old adapter and ID handling.

All 109 legacy-only favorite products were explicitly marked Favorite=true by the provider. The one section navigation link supplied a product list of 44 cards and a text section. Section links provide no proof of a complete replacement inventory. Keep the authenticated legacy favorites path. Revisit when the storefront supplies verifiable complete membership and repeatable pagination. This is a verified deferral under task 5.4.

## Disposition and acceptance

| Journey | Decision | Evidence and operational effect |
|---|---|---|
| Product search | Adopt v2 | Same-slot guest and account reads, price fixtures, client tests and MCP acceptance. Ranking changes are expected. Roll back the search adapter commit to restore legacy ranking. |
| Exact detail | Adopt storefront detail | Ordinary and fresh authenticated reads, exact-ID checks, sold-out and unknown-state fixtures. One read per uncached detail or mandatory refresh. Revert the exact-detail commit independently. |
| Delivery context | Adopt the basket's slot | The basket read replaces the DeliverySpot read in session bootstrap, preserving the number of startup requests. A missing ID fails before catalog dispatch. Restore the old bootstrap only together with compatible legacy routes. |
| Department discovery and browsing | Adopt menu and v3 categories | Guest CLI returned 21 departments. Mixed rows and lookahead are covered by paging tests and live reads. One extra row is requested per window. Revert the department commit to restore legacy behavior. |
| Suggestions and empty-search recovery | Retain quick suggestions and bounded fallback | Both websites reference quick. The category-name/URL response remains compatible. Legacy page/group reads still serve fallback and favorites. |
| Favorites | Retain legacy inventory | An authenticated full-set comparison and provider flags disproved equivalence for the flattened page. Reassess only with evidence of a complete replacement. |
| Recipes | Defer new feature | Guest ingredient mapping, suggested packs and pantry alternatives worked. Adding a recipe journey requires its own product decision. |
| Account, basket and saved lists | Retain existing operations | Current site still calls legacy session and basket routes. No equivalent replacements were established for protected flows. This change introduces no provider mutation. |
| Checkout, payments, orders and delivery changes | Out of scope | The assistant has no supported migration journey for these operations. |

A guest browser's actual network responses included successful GETs for v2 product search, web/productDetails/{productId} and v3 category products. Initial document transfer caches independently contained menu, page and exact-detail payloads. A client-side detail read can occur while opening a product card without an immediate document URL change.

Final read acceptance used the real branch CLI for departments and two category pages, then the hosted HTTP handler bound to loopback for find_groceries. With locally simulated caller admission and a live signed-in provider client, one v2 search and two fresh HTTP detail responses yielded two complete views. A dispatch guard permitted only GET after the no-merge login. This exercises the hosted code path; production deployment, production OAuth and a real basket addition were outside acceptance. No price or cost improvement is claimed from these samples. The branch has no persistent dual-read path, new paid service, storage or background polling.
