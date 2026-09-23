## Why

Issue #96 has an automatic main-to-production workflow, but a real green main merge stopped before mutation because live Worker configuration and the validator disagree. Container image tags are accumulating without a proven accepted-release retention policy. Routine reviewed merges should be the release decision, with verified runtime and conservative recovery before any cleanup.

## What Changes

- Diagnose and correct the exact production configuration mismatch without weakening safety validation.
- Make eligible exact-main merges deploy serially and automatically while keeping PR jobs credential-free. Use the native Actions queue without custom queue-overflow reconciliation.
- Verify the deployed SHA, health, OAuth boundary, anonymous rejection, and bounded authenticated read-only functionality.
- Add a durable accepted-image ledger and deterministic retention plan; after each accepted release, prune the exact production repository to the latest ten distinct accepted digests plus every active, recovery, or uncertain hold.
- After successful acceptance, delete only oldest proven-surplus images, sequentially, with per-action revalidation and bounded readback.
- Simplify recovery only where native GitHub/Cloudflare evidence provides the same failure protection; document the final runbook.

## Goal, Non-goals, and Acceptance

**Goal:** an eligible approved green PR follows merge → exact-SHA deploy → read-only acceptance → safe image retention without routine manual dispatch/finalization.

**Non-goals:** basket, order, payment, or delivery mutation; deleting Worker history, secrets, Durable Objects, Container applications, or foreign repositories; new hosted services, external schedules, or Containers; custom queue-overflow recovery; preserving obsolete clients or unused runtime flags. The approved one-time image reset intentionally removes rollback images for pre-reset Worker versions after a fresh accepted release.

**Acceptance:** all child issues #97–#101 are resolved; eligible green main merges use the native serialized deployment path; failed/uncertain deployments cannot trigger cleanup; no PR job gets production credentials; exact candidate revision and safety boundaries pass; images outside the exact owned repository and active/recovery/uncertain references are never deleted; the one-time legacy image reset is explicit; each accepted release retains the latest ten distinct images; recovery remains safe under runner loss and provider drift; final exact-main CI and production read-only checks pass.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- nemlig-production-delivery: exact-main merge-triggered delivery, serialized routine execution, bounded runtime acceptance, and simpler evidence-based recovery.
- nemlig-cloudflare-hosting: explicit runtime configuration ownership and accepted-release Container image retention.

## Impact

One epic branch and PR: codex/issue-96-deployment-retention. Expected areas are the production workflow, deployment and acceptance scripts/tests, Wrangler configuration, a focused image-retention/ledger module, OpenSpec, and Cloudflare operations/release documentation. Reuse existing GitHub state/ref and Wrangler dependencies; no new hosted service or runtime dependency.

No image is deleted until the candidate has deployed and passed acceptance and every deletion candidate is revalidated against current production and recovery state.
