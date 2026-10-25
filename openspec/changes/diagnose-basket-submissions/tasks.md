## 1. Failure evidence and recovery

- [x] 1.1 Preserve safe client error facts and nonempty validation-array presence; regression-first client tests cover dispatch/readback faults, overlap and no mutation retries.
- [x] 1.2 Persist diagnostic facts and dispatched items without weakening fences; actual storage and callback/MCP tests preserve metadata after reconstruction and stale writes.
- [x] 1.3 Expose exact owner/account-bound read-only inspection and viewer recovery prompt; tests compare baseline/requested/expected/current without attributing an uncertain write.

## 2. Integration and handoff

- [x] 2.1 Verify built iframe recovery message, no replay, lint, typecheck and focused dependent tests; local artifact smoke and runtime checks pass.
- [x] 2.2 Update failure compendium, README and operations guidance; validate OpenSpec and review final diff for private data.
- [x] 2.3 Record original provider cause as unknown and production/native acceptance as separate pending work in the compendium and issue #357.

Delivery state (normal commit/push, exact-head CI, review and separately authorized deployment/native acceptance) is tracked in issue #357 and PR #350; completed code tasks do not imply release or live acceptance.
