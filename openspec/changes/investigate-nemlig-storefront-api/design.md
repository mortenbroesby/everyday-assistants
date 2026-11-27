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
