## 1. Establish the baseline

- [x] 1.1 Pin the assistant revision and storefront asset and record the initial route comparison in design.md.
- [x] 1.2 Trace client methods to active tools, CLI commands and hosted consumers. Locate prior capture procedures and reusable fixtures.
- [ ] 1.3 Record ordinary browser request methods, sanitized route templates and outcomes for search, detail and category browsing. Distinguish server-rendered data from browser requests.

## 2. Compare catalog behavior

- [x] 2.1 Pair search and detail reads under identical delivery context. Compare identity, ranking, quantity, unit price, discounts and availability.
- [x] 2.2 Check Danish queries, pagination, empty results and unavailable products. Compare request counts and bootstrap dependencies.
- [x] 2.3 Trace fresh-product validation into review and pre-add callers. Identify fields whose absence must fail closed and test candidate mappings against sanitized fixtures.

## 3. Assess adjacent journeys

- [x] 3.1 Compare page and menu navigation, product groups, favorites and suggestions for coverage and personalization.
- [x] 3.2 Inventory recipe discovery and ingredient-to-product mapping. Document user value and gaps before proposing new functionality.
- [x] 3.3 Classify session, basket and list dependencies from source and existing evidence. Record verification limits for sensitive flows.

## 4. Decide and hand off

- [ ] 4.1 Publish a disposition for every journey with evidence quality, benefit, compatibility risks and unresolved questions.
- [ ] 4.2 For each adoption candidate, identify affected callers, contract tests, rollout and rollback, request volume and cost implications.
- [ ] 4.3 Link implementation follow-ups only for accepted changes and close the epic after reviewing coverage and outstanding deferrals.

## 5. Migrate approved catalog reads

- [x] 5.1 Resolve delivery context for guest and authenticated search. Use scoped, bounded reads and test missing context and cancellation.
- [x] 5.2a Switch product search to v2. Verify guest and authenticated delivery context, result envelopes, typed listings and minor-unit prices.
- [x] 5.2b Switch exact lookup to the storefront detail endpoint with fixture-backed mappings for price, pack, availability, promotions, unknown fields and exact identity.
- [x] 5.3 Switch department listing and browsing to menu and v3 categories after verifying category ID compatibility and pagination. Preserve existing quick suggestions.
- [x] 5.4 Verify favorite membership and pagination under the authorized account, then migrate if the replacement preserves them.
- [ ] 5.5 Update the provider manifest, run CLI and hosted read acceptance, and document rollback per changed adapter. Obtain explicit approval before any live basket or other external data change.
