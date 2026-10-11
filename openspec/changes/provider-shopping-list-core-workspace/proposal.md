## Why

The proof release uses a Nemlig shopping list only at final submission while a
Durable Object still owns the Local basket's products and quantities. That
leaves two business-state systems and preserves the former per-product basket
write implementation. A provider shopping list is the smaller, native
workspace for a family's accepted products and already has a one-step,
additive transfer into the real basket.

## What Changes

- Make one app-owned Nemlig shopping list the authoritative product and
  quantity workspace for an active Local basket.
- **BREAKING:** retire Durable Object persistence of Local-basket line content
  and its callback capability. Existing local baskets are unavailable after
  cutover; they are not silently migrated or submitted.
- Keep transient, owner/conversation-scoped presentation and submission-fence
  state server-side; provider-list content remains the only business source of
  truth.
- Synchronize an accepted Local-basket mutation to its provider list and
  acknowledge it only after exact list readback.
- Submit an exact, freshly verified provider list through one native
  list-to-basket transfer. Remove the direct per-product real-basket addition
  loop and its fallback.
- Preserve add-only real-basket semantics, exact authorization, fresh product
  validation, owner/conversation isolation, one-attempt fencing, and final
  additive basket readback.

## Capabilities

### New Capabilities

- `nemlig-provider-list-workspace`: owner- and conversation-bound provider
  shopping-list workspace lifecycle and verified local editing.

### Modified Capabilities

- `nemlig-product-review`: changes Local-basket state ownership and recovery
  behaviour.
- `nemlig-basket-proposals`: changes exact addition application from
  per-product writes to a provider-list transfer only.
- `nemlig-mcp`: changes Local-basket tool semantics and removes Durable Object
  line-content authority.
- `nemlig-cloudflare-hosting`: removes the Local-basket Durable Object binding
  and callback route from the hosted configuration.

## Impact

- `apps/nemlig-assistant/src/client.ts`, product-review service, proposal
  service, MCP routing, worker bindings, Wrangler configuration, and focused
  fixtures/tests.
- The hosted provider-list API is the only new external dependency. No new
  package, persistence service, direct basket endpoint, checkout, or provider
  retry is introduced.
- Delivery is one coherent branch and pull request. It requires a controlled
  live provider-list workspace and exact transfer acceptance before Local-basket
  Durable Object code is deleted from production.
