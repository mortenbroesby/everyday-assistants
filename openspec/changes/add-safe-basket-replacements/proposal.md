## Why

The assistant can add or remove reviewed basket lines, but replacing one product currently requires two separately approved operations with no shared review of the final basket or price difference. A single exact replacement proposal makes this common workflow understandable and safer without inventing automatic product-equivalence or savings heuristics.

## What Changes

- Add a read-only replacement proposal that binds one current basket line to one exact available replacement product and final replacement quantity.
- Show both exact products, package and price metadata, the current and expected basket totals, and the signed price difference; describe a positive difference as potential savings, not proof that products are equivalent.
- Add one explicitly approved replacement apply operation that revalidates the unchanged basket and product inside the existing mutation lock, adds and verifies the replacement first, then removes and verifies the old line.
- Consume the proposal and stop if either upstream mutation or readback is uncertain; never retry or continue automatically after partial success.
- Expose matching `prepare_cart_replacement` and `apply_cart_replacement` MCP tools with accurate read-only and destructive annotations.
- Keep product discovery, candidate selection, proposal preparation, and application separate. No replacement is selected or applied automatically.

### Non-goals

- Automatic whole-basket optimization, product-equivalence claims, or a configurable scoring model.
- Automatic substitutions, recurring rules, checkout, payment, ordering, or delivery-slot changes.
- New hosted infrastructure, dependencies, or direct replacement commands in the local CLI.

### Acceptance criteria

- A client can prepare an exact replacement review without changing the basket.
- Application requires explicit approval of the unchanged, unexpired proposal and returns verified basket readback.
- Price, availability, identity, quantity, basket, expiry, or connection changes invalidate the proposal before mutation.
- A failed or uncertain first or second mutation stops the sequence, consumes the proposal, reports sanitized partial-state guidance, and is never retried automatically.
- Existing addition, removal, clear, planning, picker, and safety behavior remains compatible.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-basket-proposals`: Add exact two-line replacement preparation, staged application, revalidation, partial-state handling, and audit behavior.
- `nemlig-mcp`: Add the replacement prepare/apply tool pair and its structured review and result contracts.

## Impact

- Affected code: `apps/nemlig-assistant/src/proposals.ts`, `apps/nemlig-assistant/src/mcp.ts`, and their existing tests.
- Affected interfaces: two additive MCP tools and the proposal operation/result schemas.
- Dependencies and systems: no new dependency or service; uses the existing Nemlig product, basket, add, and remove calls.
- Safety: preparation remains read-only; application remains connection-bound, short-lived, single-use, explicitly approved, locked, revalidated, and verified by basket readback.
