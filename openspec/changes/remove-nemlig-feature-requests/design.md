## Context

See proposal.md. One unused feature connects CLI/MCP to a GitHub subprocess; hosted wiring forwards its token and installs gh. The existing runtime has no other GitHub issue consumer.

## Goals / Non-Goals

Remove the full vertical feature slice. Keep repository release/deployment gh usage, grocery behavior, existing issues and provider-held secrets unchanged.

## Decisions

Delete instead of disable or deprecate: the owner explicitly requested removal without a replacement. Remove the MCP callback parameter and update positional callers together. Keep tests for absence and rejected legacy calls; delete implementation-only feature tests. Preserve historical archive evidence; reconcile overlapping active spec wording so future sync cannot resurrect the feature.

Remove gh only from the runtime image; retain CA certificates. Remove GH_TOKEN from runtime types and forwarding without reading or deleting stored secrets. This reduces runtime surface and adds no service/cost.

## Risks / Trade-offs

Cached clients may invoke the retired name: reject normally, refresh the existing app after an authorized rollout. Positional callback removal can shift principal context: compiler/interface/HTTP isolation tests cover callers. Shared main may advance: fetch and integrate without overwriting other work.

## Migration Plan

No data migration or compatibility shim. Version as a breaking API removal under existing release policy. Verify and integrate source, then use the approved fail-closed deployment flow only with current provider authority. If unavailable, report deployment pending and leave that task unchecked. Roll back with a scoped revert; no GitHub issues are altered.
