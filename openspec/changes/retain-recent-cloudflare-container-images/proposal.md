## Why

Nemlig production has accumulated 54 tagged Container images because every release uploads a disabled candidate before enabling the same image. Shared layers keep the current tag-addressable footprint near 409 MiB, but no lifecycle rule prevents indefinite growth toward Cloudflare's documented 50 GB account limit.

This change makes image retention part of the existing serialized release path while preserving a useful rollback window and refusing cleanup whenever image ownership or recovery state is uncertain.

## Goal

After each accepted production deployment, automatically retain the current image and nine previous distinct accepted release images, protect every additional image required by active deployment or recovery state, and delete only verified unprotected Nemlig production images.

## Non-goals

- Delete or compact Worker versions, deployments, Durable Object data, secrets, or another registry repository.
- Add a scheduled Worker, database, queue, external registry, or second deployment lock.
- Change Nemlig request behavior, authentication, capacity, quotas, logging sampling, or basket safeguards.
- Promise rollback to releases outside the retained image set.

## Acceptance criteria

- A durable, bounded ledger identifies accepted release images after workflow artifacts and temporary deployment leases expire.
- A pure retention planner always protects the current image, nine prior distinct accepted images, active references, unresolved recovery images, and explicit temporary holds.
- Cleanup runs after acceptance and evidence persistence but before releasing the existing production lease.
- Incomplete inventory, unknown provenance, provider drift, lease loss, ambiguous deletion, or failed readback stops cleanup without rolling back or disabling a healthy accepted deployment.
- The first production use is a read-only report. Enabling deletion requires a separately reviewed provider/destructive-action checkpoint and a fresh report.
- Cleanup remains bounded to the exact Nemlig production image repository, ten deletions per run, sequential deletion, fixed deadlines, and post-action readback.
- Worker deployment history remains intact and operating documentation states the supported image-backed rollback horizon.

## What Changes

- Persist a public-safe accepted-image ledger using the repository's existing Git data persistence pattern.
- Add a read-only registry inventory and retention-plan command with logical and deduplicated compressed-byte estimates.
- Integrate bounded cleanup into successful deployment finalization under the existing production lease.
- Roll out automatic cleanup in dry-run mode before separately enabling destructive deletion.
- Document retention, failure handling, inspection, disablement, partial-result reconciliation, and rollback limits.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-cloudflare-hosting`: Add automatic bounded Container image retention to accepted, serialized production releases.

## Epic boundary

Branch `codex/plan-cloudflare-image-retention` and its pull request contain this OpenSpec plan only. Implementation should use one follow-up epic branch and pull request, one package-version decision, and at most one production rollout. Planning and dry-run implementation do not authorize image deletion.

## Impact

The later implementation is expected to touch the production deployment/finalization script, its workflow and focused tests, one small image-retention module, package commands, Cloudflare operations documentation, backlog state, and this OpenSpec change. It should reuse existing GitHub permissions and the current Cloudflare deployment identity unless a minimum delete permission is proven missing; any permission broadening remains an operator checkpoint.
