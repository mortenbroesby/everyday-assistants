## Context

See proposal.md and NEM-CHATGPT-003/004 in the failure compendium. Gateway HTTP 200 and absent Auth0 events do not establish the provider outcome. The original provider error is unavailable.

## Goals / Non-Goals

Carry safe diagnostic facts through client, existing durable receipt, MCP and viewer; expose operation-bound read-only recovery. Do not alter the additive provider body, retry policy, consent boundary or no-replay fence.

## Decisions

- Add a typed error with a closed diagnostic object rather than preserving raw causes. MCP emits a fixed scalar-only stderr event and a bounded text suffix. The existing receipt stores the same object best-effort after its durable claim.
- Record actual dispatched lines separately from reviewed intent so unavailable skipped products do not inflate expected deltas. Preserve both through stale journal writes.
- Reuse show_my_basket with optional draft_id instead of adding another tool. The callback capability selects the owner namespace; account checks bracket the provider read.
- Compare quantities without attribution. A matching basket could have been produced by another writer. A completed receipt and current basket comparison are separate facts.
- Existing receipts lack diagnostics/dispatchedItems; fall back explicitly to reviewed intent. No data rewrite or expiry change.

## Risks / Trade-offs

- Crash/cancellation/storage failure can prevent diagnostic annotation; the prior claim still fences replay. The stderr event is an independent best-effort path, not guaranteed retained telemetry.
- Body-level validation details are undocumented; retain only known nonempty-array presence, never guessed codes or provider messages.
- The historical failure may remain unknowable. Fixes improve future evidence and recovery, not proof of live provider reliability.

## Migration Plan

Additive optional schema fields are compatible with existing receipts. Merge/deployment and a bounded native acceptance run remain separate from this implementation. An older version may omit new metadata; rollback must preserve existing fences. Do not retry the historical uncertain operation during acceptance.
