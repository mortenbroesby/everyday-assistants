## Why

The current picker can show proposed products and alternatives, but it asks the user to manage the review as a form. The approved shopping flow instead alternates conversation and UI: conversation handles broad corrections, while a focused picker handles exact product choices.

## What Changes

- Show the complete proposed basket as compact product rows with image, exact product identity, brand, package, package count, price, favourite provenance, and confidence.
- Ask for corrections conversationally. A user can keep the rest of the proposal unchanged while naming only the products that need another attempt.
- Reuse the existing picker for only the challenged products, using one radio choice per ingredient and the existing bounded alternatives.
- Show a complete final recap after replacements, marking changed lines subtly and keeping every product visible.
- Label the final action `Add to Nemlig basket`; it hands the exact recap into the existing review and approval path and never bypasses `review_items_to_add`, fresh validation, `add_approved_items`, readback, cancellation, or no-retry safeguards.
- Preserve the complete conversational fallback when MCP Apps cannot render.

### Goal

Let a shopper understand, correct, and explicitly approve the assistant's complete proposed basket without turning the conversation into a large form.

### Non-goals

- No direct browser-side provider or basket calls, checkout, payment, ordering, favourites mutation, editable quantities, new ranking policy, endpoint, cache, state store, dependency, or resource URI.
- No per-product search input, review checkbox, status column, hidden product rows, or persistent client-side workflow state.
- No invented alternative when bounded discovery found no relevant candidate.

### Acceptance criteria

- Every resolved proposed item appears once in a compact overview, including favourite and high-confidence selections.
- Product image, name, brand, package, package count, price, favourite provenance, and integer confidence remain readable without opening details.
- The overview tells the user to describe only incorrect items in chat and keeps all unchallenged items unchanged.
- A correction produces a focused picker containing only challenged ingredients; each ingredient offers one radio selection from supplied candidates and no search field.
- The final recap contains every retained or changed selection and labels changed lines without an ambiguous status column.
- `Add to Nemlig basket` remains an explicit conversational approval handoff to the existing protected write flow; the picker itself performs no mutation and never retries automatically.
- Narrow and wide layouts remain readable without horizontal or nested scrolling; unavailable UI retains the complete conversational proposal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-chatgpt-integration`: the shopping flow becomes complete visual proposal, conversational correction, focused replacement choice, final recap, and explicit protected apply.
- `nemlig-mcp`: the existing picker supports compact overview, focused choice, and recap presentations without changing its read-only authority.

## Impact

- Primary paths: `apps/nemlig-assistant/src/mcp.ts`, `src/picker/PickerView.tsx`, `src/picker/contract.ts`, picker styles/showcase, README, and focused MCP/picker tests.
- Public MCP names, resource URI, provider-read coordination, dependencies, hosting, and basket proposal/apply interfaces remain unchanged.
- No new provider read or operator cost is introduced by the UI. Discovery remains bounded to existing limits and concurrency.
- Epic boundary: branch `codex/compact-proposed-basket-picker`, this OpenSpec change, one pull request, one version decision near merge, and at most one protected production deployment.
