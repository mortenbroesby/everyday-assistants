## Why

Nemlig search currently returns shallow catalogue rows while exact lookup, basket review, and the old planner each carry overlapping product representations. That makes ordinary search less useful and keeps a planner/picker workflow larger than the retained product and approved-basket capabilities require. Issue #93 is the opportunity to make product facts authoritative once, present them consistently, and keep basket writes behind the existing exact review/apply boundary.

## What Changes

- Enrich every caller/provider-selected search result by default with the same supported product facts as exact lookup, with explicit per-result partial or unavailable outcomes; do not add an application result-count ceiling.
- Reuse one ordered, cancellable, cache-aware product retrieval path for search and exact lookup; do not add a mandatory follow-up tool call or shallow/full mode flag.
- Remove planner-only orchestration, planner-issued automatic authority, and picker-specific workflow state while retaining direct product reads, basket reads, exact review, and approved additions.
- Add one small shared product presentation resource for product-bearing results; keep it display-only, headless-compatible, accessible, and free of browser-side provider calls or write controls.
- Preserve principal-scoped proposal lifetime, exact review/apply binding, freshness checks, replay rules, indeterminate-write handling, and basket readback.
- Update the Nemlig product/search contract, focused synthetic tests, package/resource checks, README, and OpenSpec artifacts together.

## Capabilities

### New Capabilities

- `nemlig-product-search-viewer`: Rich product search results and one shared display-only product presentation across search, exact lookup, basket, review, and approved-result contexts.

### Modified Capabilities

<!-- The existing MCP capability is covered by the new capability delta while the #72 transport migration is integrated separately. -->

## Impact

The implementation is one epic on branch `codex/issue-93-rich-search-viewer` with one pull request and one integration boundary. Independent work begins in `apps/nemlig-assistant/src/product-discovery.ts`, `plans.ts`, `plan-calculation.ts`, `product-presentation.ts`, and focused tests. MCP registration, HTTP/gateway/Worker adapters, package/lock files, and transport OpenSpec contracts remain coordinated with the active “Resolve issue #72” task until its tested v2 integration point is available. No provider, credential, basket, production, or deployment mutation is part of the repository implementation.
