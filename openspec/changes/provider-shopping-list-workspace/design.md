# Design: provider shopping-list workspace

## Ownership model

The provider owns product contents. The assistant owns only:

- opaque local `basketId` / workspace identity;
- authenticated owner and explicit conversation selection mapping;
- provider `shoppingListId` that was created by the assistant for that workspace;
- revision/fingerprint of the last verified provider-list contents;
- lifecycle: active, transfer-dispatched/uncertain, submitted, or cleanup-pending;
- a submission fence sufficient to make duplicate transfer impossible after a timeout or restart.

Provider list IDs are never accepted from widget/browser input. The service only acts on an ID already bound to the same authenticated owner. Browser product presentation remains disposable cache. It is not a second durable source of contents.

## Edit lifecycle

1. Create a workspace with exact products.
2. Create an assistant-owned provider list with a bounded generated name that respects the provider's documented 30-character limit.
3. Synchronize list contents serially. Provider list updates are mutations and use no automatic retry.
4. Re-read the list. Only a matching readback advances the workspace revision and renders the Ready state.
5. Quantity, replacement, addition, removal, and clear repeat the same serialized write/readback pattern. The real basket is untouched.
6. Closing a card leaves the provider list available. Explicit abandon removes only the assistant-owned list and invalidates any prepared authority. Existing local-only baskets are not silently uploaded; they must be explicitly converted on a fresh user action.

The provider's quantity/removal semantics are an integration boundary. The adapter uses the observed official endpoint contract and sanitised fixture evidence. If readback differs from requested exact contents, the edit fails visibly and the assistant does not compensate by guessing, parallelizing, or issuing real-basket writes.

## Submission lifecycle

1. Read the provider list and the real basket. Freshly validate every list product needed for the exact review.
2. Store a proposal bound to: owner, conversation/workspace, list ID, list fingerprint, product facts, expiration, and real-basket fingerprint.
3. Immediately before transfer, re-read both provider list and real basket. Any mismatch invalidates the proposal before a real-basket mutation.
4. Persist the dispatch fence before sending `addShoppingListToBasket(ListId, ConfirmMissingProducts:false)`.
5. Send exactly one transfer. No per-line fallback is allowed.
6. Read the real basket and require every approved added quantity plus preservation of every unrelated baseline line. If this cannot be established, retain the fence and report uncertainty. Never automatically retry.
7. After verified success, mark completion and delete the app-owned source list. If that delete fails, keep `cleanup-pending`; report the basket success truthfully and never repeat the transfer.

The owner has approved an exact initial submit authorization to span verified internal steps. It does not extend to a changed list, changed products, a missing-product confirmation, a different principal/conversation, or any uncertain transfer.

## Migration and removal

Existing Durable Object local-basket records may contain product lines. This is an owner-approved clean cutover: they are not silently uploaded, converted, or reopened by the new provider-backed route. New records use a separate versioned metadata key, so old storage readers and alarms cannot interpret metadata as a legacy `productIds` record. Old prepared authority is invalid. New provider-backed workspaces never write `line:<basketId>:<productId>` records. Do not delete the Durable Object: it remains the trusted owner-selection and fence boundary.

The versioned metadata record binds the provider account identity observed at creation and carries `active`, `editing`, `transfer_attempted`, `verified`, `cleanup_pending`, or `closed` state. It retains transfer/cleanup fences outside ordinary expiry or capacity eviction. A reconnect with a different provider account cannot reuse a prior mapping. There is deliberately no automatic reconciliation or retry of an uncertain transfer: the smaller safe recovery is explicit manual inspection.

## Failure boundaries

| Boundary | Required behavior |
| --- | --- |
| List create/update response malformed, timed out, or unreadable | Do not retry automatically; expose the observed failure and do not acknowledge local state as synchronized. |
| Provider list changed outside the assistant | Invalidate prepared authority; show current readback rather than replacing it. |
| Transfer response/readback uncertain | Keep durable fence; no transfer retry or direct per-product fallback. |
| Transfer verified but list delete fails | Mark cleanup pending; do not report submission failure or resend transfer. |
| Credential-free request | Reject before list reads or writes. |
| Wrong owner/conversation/card | Reject before provider operation. |

## Verification strategy

Use client fixtures for endpoint shapes and empty 2xx writes; service tests for exact list synchronization, ownership, stale authority, one-transfer 38+ lists, and uncertainty; route tests for credential gating; and existing viewer smoke fixtures for truthful UI states. Live provider tests remain separately owner-authorized and never clear/remove the real basket.
