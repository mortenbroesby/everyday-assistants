## Why

The proposal picker already carries every selected product plus favourite and confidence metadata, but the integration treats the picker as optional for ordinary planning and renders selected products as large cards. Users can therefore receive model-selected products without a compact visual overview or an obvious opportunity to inspect alternatives.

## What Changes

- Present every resolved proposed product in one read-only proposed-basket picker before approval, including favourite matches and confident recommendations.
- Render each assistant selection as a compact, always-visible row with image, name, package, price, quantity, favourite provenance, and confidence.
- Add one unchecked-by-default `Review this item` checkbox per row. Unchecked rows retain the assistant selection; checked rows expose existing alternatives, local product selection, and an explicit bounded catalogue-search request.
- Add one final review action that sends the complete retained and changed selections back to ChatGPT, which continues through the existing exact proposal, approval, fresh-validation, apply, and readback flow.
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
- Every row begins unchecked; an unchecked row keeps the assistant selection, while checking it reveals populated evidence, alternatives, and catalogue-search controls without hiding the row.
- Alternative selection stays local until final review. Catalogue search and final review each send at most one deliberate conversational message, never call a basket tool, and never retry automatically.
- The final message contains every retained or changed product selection and instructs ChatGPT to use the existing safe proposal workflow; missing alternatives remain an honest no-choice state.
- Narrow and wide synthetic showcases remain readable without horizontal overflow, and the conversational fallback retains the complete proposal when UI is unavailable.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-chatgpt-integration`: ordinary proposed-basket review becomes one complete compact, opt-in per-line review before the existing approval flow.
- `nemlig-mcp`: the existing picker gains local review state plus conversational catalogue-search and final-review messages without changing its read-only authority.

## Impact

- Primary paths: `apps/nemlig-assistant/src/mcp.ts`, `src/picker/PickerView.tsx`, `src/picker/main.tsx`, `src/picker/session.ts`, picker styles/showcase, and focused MCP/picker lifecycle tests.
- Public MCP names, resource URI, schemas, product endpoints, dependencies, hosting, and basket proposal/apply interfaces remain unchanged.
- Provider-read cost does not increase inside the picker. Existing discovery results may carry more alternatives, still bounded to nine per item and three concurrent exact-detail reads.
- Epic boundary: branch `codex/compact-proposed-basket-picker`, this OpenSpec change, one pull request, one version decision near merge, and at most one production deployment.
