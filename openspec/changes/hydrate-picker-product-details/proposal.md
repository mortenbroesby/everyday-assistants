## Why

The product-review picker renders expandable description, declaration, and
item-detail sections, but exact review currently reuses shallow search-card
records that contain none of those fields. Users therefore see empty controls
precisely when they need evidence to compare a recommendation with alternatives.

## What Changes

- Hydrate every reviewed proposed product and alternative through Nemlig's
  read-only exact-product endpoint before building the picker payload.
- Model and present Nemlig's `Text`, `DeclarationLabel`, and `Attributes` as
  distinct bounded description, declaration, and product-detail evidence.
- Normalize the exact-product attribute values that Nemlig returns as arrays,
  while retaining safe plain-text conversion and payload bounds.
- Accept and display up to nine alternatives per ingredient: one ordinary
  ten-result catalogue page including the selected item, rather than the
  current four-alternative schema ceiling or a demo-specific two-item choice.
- Keep alternatives and every per-product evidence section folded by default;
  omit an evidence section when Nemlig supplies no content instead of showing
  a misleading empty panel.

### Goal

Make the optional review picker a trustworthy product-comparison surface whose
folded sections contain current Nemlig product-view evidence and whose normal
catalogue alternatives are not truncated to two.

### Non-goals

- No basket read or mutation, favourites access, checkout, payment, ordering,
  delivery selection, credentials change, provider deployment, or production
  acceptance in the implementation phase.
- No scraping of rendered HTML in production, browser dependency, new package,
  ranking change, automatic alternative selection, or unbounded provider
  concurrency.
- No guarantee that every product has every evidence field; absent upstream
  content remains explicitly absent.

### Acceptance criteria

- A live-shaped exact-product fixture maps `Text` to description,
  `DeclarationLabel` to declaration, and array-valued `Attributes` to details.
- Review performs one coalesced exact detail read for each unique proposed or
  alternative product under the existing concurrency-three read pool.
- The picker preserves and renders the three evidence categories independently,
  folded by default, without an empty accordion when a category is absent.
- One review item accepts nine unique alternatives, retains their order, and
  renders all nine inside the folded ingredient island.
- Authentication, cancellation, 404 localization, payload sanitization,
  proposal authority, and every basket safety boundary remain unchanged.
- Focused client, review, MCP-contract, and picker tests pass, followed by
  strict OpenSpec validation and `pnpm verify` on the final implementation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-chatgpt-integration`: visual manual comparison exposes current,
  categorized product-view evidence and a full normal search page of choices.
- `nemlig-mcp`: exact picker review hydrates bounded product detail and accepts
  up to nine alternatives per ingredient without changing basket authority.

## Impact

- Primary code: `apps/nemlig-assistant/src/client.ts`, product presentation,
  picker review/contract/view, MCP schemas and server guidance, plus focused
  fixtures and checks.
- External read path: Nemlig's existing exact-product Web API endpoint using
  the already established authenticated session, product timestamp, delivery
  context, and user identifier.
- No new dependency or persisted data. Additional read traffic is bounded by
  selected review references, coalesced by ID, and concurrency-limited to three.
- Epic boundary: branch `codex/fetch-product-details`, one OpenSpec change and
  one release-bearing pull request. Version, release note, merge, deployment,
  and live ChatGPT acceptance remain later existing checkpoints.
