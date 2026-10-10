## Why

Local baskets currently live only in MCP-container memory and are keyed to a
ChatGPT conversation. A container replacement, a new chat, or a long-running
conversation can therefore make useful product choices unavailable even though
no real Nemlig basket operation occurred. Separately, an observed recipe-scale
attempt reported 32 internal search failures out of 37; persistence must not
mask or misdiagnose that discovery failure.

## What Changes

- **BREAKING**: replace the single conversation-bound Draft list contract with
  owner-bound, selectable **Local baskets** that are available from supported
  chats for 24 hours after their last intentional interaction.
- Persist successful local-basket edits through a narrow authenticated
  Worker/Durable Object boundary so container restart does not discard them.
- Let a user list active Local baskets, select one as the current basket, and
  explicitly delete one. Keep at most 500 product lines in each basket and 50
  baskets per owner; silently evict the least-recently-used basket at capacity.
  Inventory displays a short non-secret UUID prefix rather than an editable name.
- Keep local basket editing, alternatives, and selection separate from the
  real Nemlig basket. Restore no prepared submission authority after a restart;
  a restored basket must be freshly prepared and explicitly authorized before
  any provider write.
- Diagnose recipe-scale discovery failures with privacy-safe, bounded evidence,
  then implement only the demonstrated reliability fix. Preserve verified
  partial results when a subset of discovery work fails.
- Publish this planning-only PR stacked on open PR #274. Start implementation
  only after #274 has merged; build the implementation branch on the resulting
  `main` SHA.

## Capabilities

### New Capabilities

- `nemlig-local-basket-lifecycle`: owner-bound Local basket inventory,
  per-chat selection, activity-based expiry, bounded LRU eviction, and durable
  recovery.

### Modified Capabilities

- `nemlig-product-review`: replace conversation-bound temporary Draft-list
  lifetime with selectable Local baskets while preserving local-only edits and
  protected submission semantics.
- `nemlig-chatgpt-integration`: let supported old and new chats list, select,
  and resume an active Local basket with clear expiry and recovery messaging.
- `nemlig-mcp`: make recipe-scale discovery failures observable and truthful,
  preserve verified partial results, and bound aggregate discovery work based
  on the diagnosed failure mode.
- `nemlig-cloudflare-hosting`: provide authenticated Durable Object persistence
  without weakening pre-wake authentication, fixed-container, or privacy
  boundaries.

## Impact

The implementation will affect the product-review service and MCP tools,
viewer intents and recovery UI, Cloudflare Worker bindings and authenticated
container-to-Worker calls, tests/smokes, README/tool guidance, and production
acceptance. It does not add saved-shopping history, cross-owner sharing,
checkout/payment/delivery behavior, provider basket mutation outside the
existing exact prepare/approve/apply/readback path, or a second persistence
framework.
