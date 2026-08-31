## Why

The assistant already has a favorites-first planner, but ordinary requests to find or add one item can still be routed to catalog-first `search_products`. Aligning tool guidance with the existing planner makes the user's saved favorites the reliable first choice without adding another search path.

## What Changes

- Route ordinary find-or-add product intent through `plan_shopping_list`, which already searches favorites first and falls back to the catalog only when no eligible favorite exists.
- Reserve `search_products` for explicit general-catalog searches and `list_favorites` for explicit favorite browsing.
- Preserve candidate review when several matches remain and preserve the existing prepare, explicit approval, apply, and readback boundary for every basket change.
- Add focused contract coverage for the routing guidance and reconcile the completed backlog entry.
- Do not add a new tool, automatic basket selection, a price-scoring model, recipe handling, or any basket mutation.

## Goal

Make normal single-item discovery and add requests reliably favorites-first by reusing the existing guided-shopping behavior.

## Non-goals

- Defining "substantial" price differences or comparing incompatible units.
- Automatically choosing among meaningfully different candidates.
- Changing product ranking, proposal validation, or basket mutation behavior.
- Changing the hosted-service, publication, checkout, payment, order, or delivery boundaries.

## Acceptance Criteria

- Server guidance directs ordinary find-or-add intent to `plan_shopping_list`.
- Explicit catalog and favorites browsing remain available through their current tools.
- Ambiguous results remain unresolved for user choice.
- No discovery or planning request prepares or applies a basket mutation.
- A focused automated check fails if the favorites-first routing guidance regresses.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-mcp`: Clarify tool-routing requirements so ordinary product intent uses the existing favorites-first planner while explicit catalog and favorites requests retain their dedicated tools.

## Impact

- MCP server instructions and tool descriptions in `apps/nemlig-assistant/src/mcp.ts`.
- Existing MCP contract tests and Nemlig Assistant backlog documentation.
- No dependency, storage, credential, network, or mutation-contract changes.
