# Provider shopping-list transfer proof

## Why

The current Local basket stores every accepted product line, quantity and presentation snapshot in the assistant's Durable Object, then submits each line directly to the real Nemlig basket. A normal family shop of 30 or more products therefore creates a long chain of real-basket writes inside one gateway request. A verified prefix can succeed before a later request fails, leaving an intentionally non-retryable partial result. This is safe but needlessly fragile when Nemlig already provides a first-class shopping-list workflow and a native list-to-basket transfer.

This is deliberately a proof release: it creates an assistant-owned provider list from an existing Local basket only when submission is prepared, then submits it through one native transfer. The current durable Local basket remains in place for the proof. A successful real ChatGPT smoke test is the gate for the subsequent clean cutover that makes provider lists durable workspaces and deletes local line persistence.

## Scope

- Create a provider shopping list from an active Local basket only during submission preparation and verify its exact contents.
- Submit one verified provider-list transfer, rather than issuing one real-basket request per product.
- Preserve exact review/authorization, principal and conversation binding, stale-state rejection, serialization, add-only basket behavior, readback, and no automatic retry after uncertainty.
- Retain the current Durable Object Local basket and its existing fence during this proof.

## Non-goals

- Changing Nemlig login flags, clearing/replacing/removing/decreasing the real basket, checkout, payment, or delivery.
- Migrating old local basket contents automatically on reopen, synchronizing ordinary Ready edits, or deleting Durable Object storage. Those are the follow-up after live proof.
- Introducing another persistence service, parallel list update queue, provider retries, or a new browser business-state model.
- Solving unrelated search, stale-ChatGPT-card, UI redesign, or deployment work.

## Evidence and decision record

- A controlled owner-authorized provider probe created an assistant-named shopping list, added one product, transferred it with `POST /webapi/basket/addShoppingListToBasket`, verified the resulting real-basket line, and removed the temporary list. The successful probe demonstrates the native transfer path; it does **not** prove unrelated pre-existing basket-line preservation because the baseline had zero lines.
- Current Nemlig web client endpoints identify list create/read/update/delete and `addShoppingListToBasket`. `UpdateProductInShoppingList` quantity and list-transfer behavior beyond the controlled one-product case must be characterized through sanitized fixtures before live rollout.
- The prior unfinished `resumable-local-basket-submission` proposal is superseded: it proposed continuation of the direct per-product basket-write path rather than eliminating that path.

## Acceptance

1. Preparing an existing Local basket creates a provider list with its exact lines and rejects a malformed or mismatched readback before any real-basket request.
2. Submission performs at most one list-to-basket transfer for an authorization. It verifies additive quantities and preservation of existing real-basket lines. It never clears, removes, decreases, replaces, or retries the real basket.
3. A failed or uncertain transfer remains fenced by the existing Local basket mechanism and cannot be replayed automatically.
4. A 38+ item fixture reaches exactly one transfer request, not 38 real-basket requests.
5. After merge/deployment, a new real ChatGPT session proves preparation; a real transfer requires a separate exact approval.
