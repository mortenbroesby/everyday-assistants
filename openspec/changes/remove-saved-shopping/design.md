## Context

See proposal.md. Eight public tools depend on snapshot and named-list code. Request-scoped planning shares plans.ts with persistence. The hosted storage Durable Object is separate from credential/admission state; deleting the namespace would remove real data and is outside this request.

## Goals / Non-Goals

Remove the vertical saved-shopping product, not merely hide tools. Preserve input validation, pure planning, same-run consent, proposal locks/replay checks, credentials and quotas. No native Nemlig list integration or record cleanup.

## Decisions

- Delete list models/application/adapters and snapshot file/HTTP functions after caller inspection; retain current planning calculations and request bounds. No facade or new persistence abstraction.
- Remove eight MCP registrations and storage-specific projection logic; legacy invocations fail through normal unknown-tool behavior.
- Retain a minimal exported PlanStorage Durable Object and its original binding/migration declarations, returning 410 without storage access. Remove application forwarding/env/handlers. This preserves old bytes and artifact rollback, unlike a deleted_classes migration. Later explicitly approved record/namespace cleanup is a separate task.
- Coordinate removal-only acceptance changes from the active CI lane before full verification; keep its broader CI hardening separate. Its synthetic identity must not depend on saved lists.
- Mark the old named-list proposal superseded; preserve its historical evidence without replaying its delta. Feature-request retirement remains in effect.

## Risks / Trade-offs

Cached clients may call removed tools; they receive errors and should refresh the existing app after rollout. Old records remain stored and may retain their prior storage cost. Retained storage namespace/class is intentional compatibility residue, not a working storage product. Deployment remains separately authorized. Package API removal advances major version to 4.0.0-alpha.16.

## Migration Plan

Ship source with negative surface/storage tests and unchanged positive planning/basket tests. Integrate removal and acceptance compatibility together after full gates; verify exact main CI. Existing provider-held records stay untouched. On authorized rollout use disabled-first same-artifact procedure, health/read-only inventory proof and refresh the existing app; rollback uses the old artifact without data migration. Sync and archive only the accepted removal deltas, avoiding superseded named-list requirements.
