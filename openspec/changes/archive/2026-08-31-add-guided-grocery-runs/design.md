## Context

See `proposal.md` for motivation. The current client already normalizes rich product metadata, searches products, lists a bounded favorites prefix, and reads the basket. The MCP layer already ranks candidates and exposes a shared picker resource. The proposal service already prepares and applies connection-bound additions containing up to twenty exact lines, so the guided workflow must terminate at that boundary rather than add another mutation API.

The implementation remains local Node.js 22/TypeScript, uses synthetic upstream fixtures, keeps credentials and plan files outside Git, and adds no dependency. The main `nemlig-mcp` spec still described retired direct mutation tools; this change updates that contract to the already-enforced proposal surface while adding the planner.

## Goals / Non-Goals

**Goals:**

- Make one structured ChatGPT call resolve a complete grocery list with bounded work and deterministic output.
- Share one plan model between conversational results, snapshot persistence, and the MCP Apps workspace.
- Reuse current product normalization, authentication, ranking data, and proposal safety checks.
- Keep every new discovery and planning operation independently testable without live credentials.

**Non-Goals:**

- Interpret free-form language locally; the MCP client supplies structured lines.
- Persist mutable server sessions, candidate caches, approvals, or basket snapshots.
- Guarantee atomic replacement across remove and add operations.
- Generalize the planner for assistants other than Nemlig before another app needs it.

## Decisions

1. **Use one structured planning tool as the primary entry point.** `plan_shopping_list` accepts 1-20 lines with search text, quantity, optional constraints/preferences, and optional selected product ID. ChatGPT performs natural-language interpretation before the tool call. Alternatives were a local Danish parser, which duplicates the model and creates brittle language rules, and client-side orchestration of many existing calls, which cannot return one consistent plan or share the picker state.

2. **Add one focused planning module, not a service hierarchy.** A new `src/plans.ts` owns plan schemas, pure filtering/ranking, resolution orchestration, gap calculation, and snapshot validation. `NemligClient` retains only upstream department/favorites pagination methods; MCP registration and annotations remain in `mcp.ts`. If the expanded embedded picker becomes unwieldy, its exported HTML constant moves once to `src/picker.ts`; no UI framework or build step is added.

3. **Fetch favorites once, then fall back per unresolved line.** One authenticated favorites scan feeds locale-aware matching for every input line. Lines with usable favorites never call catalog search. Remaining lines use the existing search method with at most five candidates and a dependency-free worker pool capped at three concurrent searches, preventing a twenty-line request from bursting the upstream gateway.

4. **Treat constraints as proof obligations and preferences as ordering only.** Availability, dietary flags, and price ceilings exclude candidates; missing data cannot satisfy a constraint. Preferences add deterministic tags and order by requested matches, unit price, item price, then source order. No score is called confidence, and no result becomes selected unless its exact ID is supplied by the client or chosen in the picker.

5. **Calculate gaps only from exact product IDs.** For a selected candidate, requested quantity minus current basket quantity yields a non-negative remaining quantity. Name similarity never marks a line covered. Covered and unresolved lines are excluded before calling the existing `prepare_cart_additions`; the proposal service still resolves products, fingerprints the basket, revalidates prices, serializes mutation, and reads back afterward.

6. **Expose additive, bounded pagination.** Department discovery returns current Nemlig paths as opaque department IDs. Browse accepts an ID only after matching it against fresh discovery, preventing arbitrary URL fetches. Department and favorites pages use positive one-based pages, a maximum page size of 50, deduplication by product ID, and a bounded prefix scan of at most 1,000 products. `ponytail:` comments will name cursor-based pagination as the upgrade path if real usage reaches that ceiling.

7. **Save immutable request snapshots, then resolve fresh.** `save_shopping_plan` writes only structured input lines, preferences, selections, schema version, opaque UUID, and timestamp to a new owner-only JSON file under the existing local Nemlig configuration area. Exclusive create prevents overwrite; `load_shopping_plan` validates the ID, path, permissions, and schema and returns input for fresh planning. Snapshots contain no credentials, prompts, proposal IDs, prices, or basket contents. Listing, editing, deletion, synchronization, and retention policy are deferred until alpha use demonstrates a need.

8. **Reuse one accessible resource for single and multi-line results.** `ui://nemlig/picker.html` renders either existing single-query candidates or a guided plan based on structured content. The guided view uses native controls for candidate selection and quantity, keeps unresolved lines visible, computes the review locally, calls `prepare_cart_additions` once, and replaces editable controls with the exact server review before offering apply. It never calls direct mutation tools.

9. **Keep compatibility additive.** Existing search, favorites, cart, feature-request, CLI mutation, and proposal interfaces retain their current defaults. New CLI commands cover only department discovery/browsing and favorites pagination; whole-list planning remains ChatGPT-first rather than adding a second structured-input syntax to the CLI.

## Risks / Trade-offs

- [Nemlig department markup or product-group paging differs from fixtures] → Isolate parsing behind client methods, reject unknown shapes cleanly, and let the owner exercise the read-only alpha path before any basket test.
- [Twenty fallback searches are slow] → Reuse one favorites fetch, cap candidates, limit concurrency to three, and return per-line sanitized failures without mutating state.
- [A missing dietary flag excludes a valid product] → Fail closed for hard constraints and let the user remove the constraint; never infer dietary safety.
- [Prices or availability change after planning] → Treat estimates as informational and rely on the existing locked proposal revalidation immediately before mutation.
- [Saved plan files accumulate] → Use immutable small snapshots now; add listing, retention, or deletion only after measured alpha use.
- [The picker host handles approval differently] → Keep the conversational workflow complete and use the existing MCP Apps approval lifecycle rather than hidden arguments.

## Migration Plan

1. Deliver P0 behind additive tools: plan model, favorites-first resolution, constraints/preferences, conversational result, multi-line picker state, and existing batch prepare/apply integration.
2. Add P1 department discovery/browse, price/deal metadata, and exact basket-gap analysis.
3. Add P2 bounded full favorites pagination and immutable snapshot save/load.
4. Update CLI help, MCP metadata, README, package smoke coverage, and synthetic interface tests throughout each phase.
5. Run strict OpenSpec validation and `pnpm verify`, then deliver for the owner's live alpha exercise. No automated test contacts Nemlig or mutates a real basket.

Rollback removes the additive tools, commands, plan module, and guided UI branch. The existing single-query search, picker, proposal protocol, and CLI remain independently usable throughout.
