# Provider shopping-list workspace

## Why

The current Local basket stores every accepted product line, quantity and presentation snapshot in the assistant's Durable Object, then submits each line directly to the real Nemlig basket. A normal family shop of 30 or more products therefore creates a long chain of real-basket writes inside one gateway request. A verified prefix can succeed before a later request fails, leaving an intentionally non-retryable partial result. This is safe but needlessly fragile when Nemlig already provides a first-class shopping-list workflow and a native list-to-basket transfer.

The owner-approved direction is to make an assistant-owned Nemlig shopping list the durable source of the workspace's Ready contents. The assistant keeps only minimum Durable Object metadata needed to bind that list to the authenticated owner/conversation and to fence an uncertain real-basket transfer. The real basket remains add-only and is only mutated by the single native transfer after exact preparation and authorization.

## Scope

- Create and synchronize a provider shopping list for an active Local basket's Ready contents.
- Submit one verified provider-list transfer, rather than issuing one real-basket request per product.
- Preserve exact review/authorization, principal and conversation binding, stale-state rejection, serialization, add-only basket behavior, readback, and no automatic retry after uncertainty.
- Replace durable storage of local basket line contents with minimal metadata and a terminal submission fence.
- Retain an untransferred provider list when the user leaves the workspace; remove only an assistant-owned list after a verified transfer or explicit abandonment.
- Update tool/documentation contracts that currently state local edits never write to Nemlig.

## Non-goals

- Changing Nemlig login flags, clearing/replacing/removing/decreasing the real basket, checkout, payment, or delivery.
- Migrating old local basket contents automatically on reopen.
- Introducing another persistence service, parallel list update queue, provider retries, or a new browser business-state model.
- Solving unrelated search, stale-ChatGPT-card, UI redesign, or deployment work.

## Evidence and decision record

- A controlled owner-authorized provider probe created an assistant-named shopping list, added one product, transferred it with `POST /webapi/basket/addShoppingListToBasket`, verified the resulting real-basket line, and removed the temporary list. The successful probe demonstrates the native transfer path; it does **not** prove unrelated pre-existing basket-line preservation because the baseline had zero lines.
- Current Nemlig web client endpoints identify list create/read/update/delete and `addShoppingListToBasket`. `UpdateProductInShoppingList` quantity and list-transfer behavior beyond the controlled one-product case must be characterized through sanitized fixtures before live rollout.
- The prior unfinished `resumable-local-basket-submission` proposal is superseded: it proposed continuation of the direct per-product basket-write path rather than eliminating that path.

## Acceptance

1. Ready contents are durably represented by an authenticated, assistant-owned provider list; a restart does not require persisted duplicate product-line snapshots.
2. A mutation acknowledges Ready state only after provider-list readback matches the requested exact items and quantities.
3. Preparing binds the owner, originating conversation/workspace, provider-list ID, verified list fingerprint, reviewed facts, and pre-transfer real-basket baseline.
4. Submission performs at most one list-to-basket transfer for an authorization. It verifies additive quantities and preservation of existing real-basket lines. It never clears, removes, decreases, replaces, or retries the real basket.
5. A failed or uncertain transfer remains fenced and cannot be replayed automatically. A post-transfer list-cleanup failure does not turn a verified basket addition into a retryable failure.
6. A 38+ item fixture reaches exactly one transfer request, not 38 real-basket requests.
7. Credential-free routes cannot read, mutate, or expose provider-backed workspace contents.
