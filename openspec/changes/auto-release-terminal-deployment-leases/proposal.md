## Why

The production workflow already queues trusted, green `main` commits, but a
queued candidate currently ends when an earlier interrupted deployment retains
the shared lease. Recent recovery showed that a terminal release can be proven
safe yet still require a manual reconciliation dispatch before the queue moves.

## What Changes

- Let a queued trusted candidate inspect and reconcile a predecessor's lease
  only when the existing durable evidence and exact Cloudflare readback prove a
  terminal state with no pending mutation.
- Release a terminal predecessor lease automatically and continue the queued
  candidate through a fresh exact-SHA preflight and lease acquisition.
- Retain the lease for unknown mutations, missing evidence, competing ownership,
  drift, cancellation, or a pending acceptance check; those cases do not retry
  a rollout or automatically roll back.
- Make equivalent accepted terminal states use the same identity-based
  finalization predicate rather than transient Container instance observations.
- Document that Cloudflare event subscriptions and Container hooks are not an
  acceptance callback for this GitHub/Wrangler release path; keep bounded
  readback and functional acceptance.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-production-delivery`: queued trusted releases safely reconcile
  verifiable terminal predecessor ownership and continue without a manual
  recovery dispatch, while uncertain state remains fail-closed.

## Impact

- `.github/workflows/nemlig-production.yml`
- `apps/nemlig-assistant/scripts/production-deploy.ts` and focused tests
- production delivery OpenSpec and Cloudflare operations documentation

The work remains one branch and one reviewable pull request. It adds no
Cloudflare callback Worker, Queue, cron process, provider mutation, or basket
operation.
