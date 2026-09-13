## Why

The proposal picker already carries every selected product plus favourite and confidence metadata, but the integration treats the picker as optional for ordinary planning and renders selected products as large cards. Users can therefore receive model-selected products without a compact visual overview or an obvious opportunity to inspect alternatives.

## What Changes

- Present every resolved proposed product in one read-only proposed-basket picker before approval, including favourite matches and confident recommendations.
- Render each selected product as a compact, always-visible row with image, name, package, price, quantity, favourite provenance, and confidence.
- Keep richer evidence and alternatives progressively disclosed; for non-favourite selections, include useful catalogue alternatives when available so the user can choose interactively.
- Reuse the current `review_proposed_basket` payload, React picker, host message, validation, and three-read coordinator instead of adding an endpoint, cache, state store, or dependency.
- Preserve a conversational fallback when MCP Apps cannot render and preserve every proposal, approval, fresh-validation, cancellation, and no-retry safeguard.

### Goal

Give the user a complete, compact visual review of the proposed basket and a practical choice for non-favourite selections without changing the basket.

### Non-goals

- No direct basket mutation, approval inside the picker, checkout, payment, ordering, favourites mutation, or provider deployment during implementation.
- No automatic extra provider search by the picker, editable quantities, new ranking policy, persistent UI state, new dependency, or separate picker resource.
- No requirement to invent an alternative when catalogue discovery produced no relevant usable option.

### Acceptance criteria

- Every resolved proposed item appears once in the picker, including favourite and high-confidence items.
- The compact row keeps product identity, image fallback, package, price, requested quantity, favourite provenance, and integer confidence visible without expansion.
- Description, declaration, item details, and alternatives remain available through accessible disclosure controls only when populated.
- A deliberate alternative choice sends the existing conversational choice message once and performs no basket mutation.
- Non-favourite decisions include useful discovered alternatives when available; missing alternatives remain an honest no-choice state.
- Narrow and wide synthetic showcases remain readable without horizontal overflow, and the conversational fallback retains the complete proposal when UI is unavailable.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-chatgpt-integration`: ordinary proposed-basket review becomes a complete compact visual overview rather than showing visual choices only on request or uncertainty.
- `nemlig-mcp`: the existing picker renders compact selected rows and guides clients to supply useful alternatives for non-favourite selections without changing its read-only authority.

## Impact

- Primary paths: `apps/nemlig-assistant/src/mcp.ts`, `src/picker/PickerView.tsx`, picker styles/showcase, and focused MCP/picker contract tests.
- Public MCP names, resource URI, schemas, product endpoints, dependencies, hosting, and basket proposal/apply interfaces remain unchanged.
- Provider-read cost does not increase inside the picker. Existing discovery results may carry more alternatives, still bounded to nine per item and three concurrent exact-detail reads.
- Epic boundary: branch `codex/compact-proposed-basket-picker`, this OpenSpec change, one pull request, one version decision near merge, and at most one production deployment.
