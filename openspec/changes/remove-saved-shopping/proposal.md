## Why

The owner explicitly chose to remove all saved-shopping functionality; groceries will be supplied in each conversation. Any future integration with Nemlig's native lists is deferred.

## What Changes

- **BREAKING**: remove all eight legacy-plan and named-list MCP tools, persisted-list/snapshot models, application logic and file/HTTP adapters.
- Keep same-conversation `plan_my_shopping`, current catalogue/favourites/browsing, picker and exact basket review/apply unchanged.
- Retire internal storage routes and outbound wiring. Preserve the existing Durable Object namespace, binding, migrations and stored bytes with an inert endpoint; do not delete data or infrastructure.
- Adapt production acceptance to retained connection/catalogue/planning/basket functionality. Update feature docs, roadmap, overlapping specs and breaking version.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-mcp`: remove saved-shopping tool surface and acceptance requirements.
- `nemlig-guided-shopping`: remove persisted snapshots; retain request-scoped planning.
- `nemlig-cloudflare-hosting`: retire saved-shopping storage access without deleting existing data.
- `nemlig-tiered-access`: remove saved-shopping scope from active principal isolation contracts, preserving all active credentials/session/proposal boundaries.

## Impact

Core: mcp/plans/shopping-list modules and tests; Worker storage routes and gateway classifications; acceptance scripts/tests; docs/specs/package. No native-list integration, provider mutation, stored-record deletion, credential handling, quota change or same-run planning rewrite.

Acceptance: eight removed tools are absent and unknown calls reject; supplied-line planning retains results, budgets, automatic consent and picker behavior; no list/snapshot storage is read/written by requests; retained namespace endpoints return a fixed retired response without accessing storage; existing record bytes are not touched; retained tool inventories and all focused/full/packed/readiness checks pass.

Cost: fewer requests, code and storage operations; no new service, capacity, retry, logging or material cost increase. Existing stored records may continue incurring their existing storage cost. No storage saving is claimed until a separately authorized data cleanup. Rollback is the prior artifact with unchanged stored data.
