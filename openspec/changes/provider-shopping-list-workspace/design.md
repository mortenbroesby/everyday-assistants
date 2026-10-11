## Context

See `proposal.md` for the motivation. This proof release retains the existing
Durable Object Local basket as the workspace source of truth. It replaces only
the direct per-product real-basket write loop at the final submission boundary.

## Goals / Non-Goals

**Goals:**

- Build an exact temporary provider shopping list only after a Local basket is
  prepared for submission.
- Verify the temporary list before binding it to existing submission authority,
  then transfer it once through Nemlig's native list-to-basket operation.
- Keep the current durable submission fence and final real-basket readback,
  then delete the exact temporary provider list after verified success.

**Non-Goals:**

- Making the provider list the normal editing workspace or synchronizing local
  edits before preparation.
- Deleting Local basket line storage, changing reconnect behavior, or migrating
  existing Local baskets. Those belong to a separate post-smoke cutover.
- Treating provider-list cleanup failure as a failed basket addition. A
  preparation or uncertain-transfer failure can leave a temporary list; it
  must never trigger a real-basket fallback or retry.

## Decisions

### Temporary list at the submission boundary

The service creates a short assistant-named list, applies every Local basket
line that remains available after fresh preparation, and reads the list back.
Unavailable or missing products are reported and omitted before list creation.
Only exact product-ID/quantity equality can progress to proposal preparation.
This isolates unproven list semantics
from the real basket: list preparation failure leaves the Local basket intact
and sends no transfer.

The alternative—synchronizing every Local basket edit to a provider list—would
change workspace ownership, recovery, and storage contracts before the native
ChatGPT proof exists.

### One native transfer with existing fences

Prepared authority is bound to the provider list's ID and fingerprint. Apply
re-reads the list and the real basket, persists the existing attempt fence, sends
one native transfer, then verifies that baseline basket contents were retained
and exact additions arrived. A non-verifiable result retains the no-retry fence.

The alternative—direct per-product writes—has a known 30+ item failure mode and
is not used as a fallback.

### Cleanup only after verified transfer

After exact basket readback verifies the transfer, the service deletes only the
app-created list ID bound to that proposal. It records completion before cleanup,
so a failed or ambiguous delete produces a warning and cannot cause a basket
retry. Preparation failures, preflight failures, and uncertain or mismatched
transfer outcomes leave the provider list untouched. There is no cleanup retry
or durable orphan-recovery subsystem; a crash between readback and deletion can
still leave a temporary list.

## Risks / Trade-offs

- [Provider list creation succeeds but the following readback fails] -> The
  user sees preparation failure and the Local basket remains unchanged; no real
  basket mutation is sent, though an unused provider list can remain.
- [Provider transfer is accepted but final basket readback is unavailable] ->
  The existing durable fence remains and no automatic retry occurs.
- [The native transfer has unobserved behavior with pre-existing basket lines]
  -> The live smoke must inspect an exact prepared basket and readback before
  the provider-list workspace cutover is considered.
- [A prepared product becomes unavailable before transfer] -> The proof fails
  closed before transfer and requires a fresh preparation; it does not mutate
  the temporary list after authorization.

## Migration Plan

1. Merge and deploy this proof release.
2. Use a fresh ChatGPT session to prepare a real Local basket and verify the
   temporary provider list path. A real transfer requires its own exact approval.
3. If the transfer and readback prove correct, create a separate cutover change
   for durable provider-list workspace ownership and deliberate Local basket
   line-storage retirement.
