## Context

See proposal.md. Current `ProductReviewService` has a temporary draft path, native-list creation/population with durable operation recovery, native staged edits with conflict/readback checks, and protected list-to-basket transfer. The viewer trusts initial host tool output, while unsaved state cannot be reloaded from Nemlig. Existing source specs have drifted from shipped single-list UI; this change updates the affected contracts, not unrelated historical plans.

## Goals / Non-Goals

Use the existing native-list service as the only user-facing editing model. Temporary intent and recovery records remain implementation details needed for uncertain writes. Do not introduce browser-owned product authority, a second database, new dependencies, or a replacement provider client. Do not change actual-basket safeguards or deploy/test against real groceries in this implementation task.

## Decisions

- Create at selected-product start, reusing creation/population recovery. Supply a timestamp-based default name when absent. Search/picker/remount do not create. Reject or recover uncertain creation instead of blindly creating again. A provider list ID is the stable identity; a name is only presentation.
- Require a caller-generated `creation_id` UUID for each intentional new selection. Reuse it only to inspect/recover that operation; a deliberate later identical list gets a new ID. Do not derive identity from item contents, transient conversation ownership, or a presumed stable MCP request ID. Reuse the existing account-scoped operation journal, checking original intent and name; an uncertain repeat must not issue another create or blindly resume writes. Local operation without a durable journal cannot promise restart idempotence.
- A fresh creation ID is a new intent, not a retry key. After restart the journal cannot discover unrelated unknown creations from a different ID; callers must not manufacture a fresh ID to retry ambiguity. Do not add another owner registry merely to guess whether a new request was intentional.
- Persist explicit edits through existing native read/compare/write/readback and recovery machinery. Delete the public draft/manual Save/Update path. Preserve partial/uncertain operation state; recovery may require an explicit refresh/reconcile action and must not become another everyday Save stage.
- Refresh the exact provider ID on card mount and explicit reopening, rebuilding transient editing context after restart. Keep stale controls disabled until refreshed. Do not automatically replay mutations or redirect a missing list to another one.
- Preserve visible rows on transport failures, explain whether an action is confirmed or uncertain in a modal, and offer a safe exact-list read. Latest confirmed state wins over delayed host snapshots.
- Keep pending quantity serialization, account ownership checks, concurrent-change detection, and existing protected Submit intact. Serialization is per editing context, not an account-wide list lock: separate cards or direct Nemlig edits can still race. Provider-side concurrent edits remain non-atomic; do not claim otherwise.

## Risks / Trade-offs

- More provider requests and network-dependent editing: reuse bounded update paths and quantity coalescing; show honest progress/error feedback. No background polling or automatic write retries.
- Lists may remain after abandoned sessions: acceptable trade-off for durable data. No automatic cleanup/deletion scheduler.
- Interrupted creation may leave a partially populated native list: retain recovery evidence and expose confirmed contents; do not claim the whole selection saved.
- Host-cached old code/schema: reject retired draft inputs and explain reopening; no compatibility engine or silent data migration.
- Cached invocation data is stale even with native storage: remount freshness check is required, not optional cosmetic work.

## Migration Plan

Ship one reviewed PR after focused service/MCP and browser regressions, updated Storybook fixtures, and exact-head CI. Rollback is a code rollback; it does not delete native lists created during the new flow. Existing native lists stay usable. Existing process-local drafts are not converted automatically. Production deployment and a real native-write smoke remain separately authorized delivery steps.
