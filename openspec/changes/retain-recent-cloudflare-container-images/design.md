## Context

See `proposal.md` for motivation and `specs/nemlig-cloudflare-hosting/spec.md` for the behavioral contract.

The 2026-09-13 inventory found one Cloudflare registry repository with 54 tags and 54 distinct manifests. Counting every tagged manifest independently gives 4,987,025,186 bytes (4,756.00 MiB); counting each reachable compressed layer, config and manifest once gives approximately 429,000,784 bytes (409.13 MiB), or 0.858% of Cloudflare's documented 50 GB account limit. This is a tag-addressable registry-content estimate, not provider-reported occupied or billable storage; untagged blobs, internal metadata and garbage-collection behavior are not exposed by Wrangler.

`deployProduction` already records source, Worker versions, Container application versions, immutable image digests, transitions and acceptance in its schema-2 journal. `finalizeDeploymentRecovery` verifies exact terminal provider state and then releases the shared local/remote production lease. Workflow artifacts expire after seven days, and the temporary remote recovery ref is deleted during finalization, so neither can identify ten accepted releases indefinitely.

Cloudflare reuses unchanged image layers and warns that deleting an image can break rollback to a Worker version that references it. Worker deployment records are therefore audit evidence, while the retained images define the supported rollback window.

## Goals / Non-Goals

**Goals:**

- Reuse the accepted deployment journal and existing lease rather than infer success from tags or workflow conclusions.
- Keep exactly ten distinct accepted digests as the normal history while allowing extra safety holds.
- Produce deterministic, testable plans before introducing provider mutation.
- Bound deletion count, time, scope and retries, and stop on drift or ambiguity.

**Non-Goals:**

- Guarantee an exact Cloudflare billing/storage measurement that the provider does not expose.
- Reconstruct every historical release whose acceptance evidence has already expired.
- Add a service, database, timer or general-purpose registry garbage collector.

## Decisions

### Run after accepted deployment, not on a schedule

Insert retention into finalization after evidence persistence and before `releaseDeploymentLeases`. The existing lease then serializes deployment and cleanup across CI and local recovery without a second lock. A scheduled workflow would need to reacquire the same lease and could race with deployment while adding no value when images are created only by releases.

Cleanup has its own terminal result: `dry_run`, `cleaned`, `blocked`, `partial` or `failed`. Failure does not roll back a healthy release, alter the kill switch, or prevent eventual lease release after the result and exact provider state are recorded.

Alternative rejected: a weekly mutating workflow. Add it only if measured orphan accumulation occurs without successful deployments.

### Persist a small accepted-image ledger in Git

Create a bounded JSON ledger on a dedicated state ref such as `refs/heads/codex-state/nemlig-image-retention`, using the existing Git data API helpers and `contents: write` permission. Update by comparing the observed ref head, writing one commit, and reading it back before cleanup. The ledger contains no secrets or household data.

Each accepted entry records operation UUID, source SHA, CI/release run identity, completion time, acceptance mode, Worker and Container versions, canonical repository, immutable image digest and required acceptance checks. Entries qualify only from a validated terminal-success journal with enabled state, identical disabled/enabled image, completed required acceptance and verified current provider state. Repeated operations and image digests are deduplicated. The live document retains the minimum recent entries and active holds needed to plan cleanup; Git history provides audit history.

Alternatives rejected:

- Workflow artifacts expire after seven days.
- The temporary recovery ref is deleted on finalization.
- GitHub releases prove publication but do not currently preserve the immutable Container digest.
- Tag age, workflow success and Worker upload alone do not prove accepted production use.

### Protect references before ranking candidates

Build the protected set from the current Container assignment, active Worker deployment references, running or rolling instance state, unresolved recovery journals, explicit unexpired holds and the ten most recent distinct accepted ledger digests. Ten is a normal minimum, not a hard maximum.

Bootstrap conservatively: recent digests with complete acceptance evidence enter the ledger; older or ambiguous tags become legacy holds until classified. Failed or unaccepted builds require trustworthy creation time and a seven-day grace period. Missing dates or provenance cause retention, not deletion.

### Resolve registry content by immutable digest

Inventory every page for the exact configured repository. Resolve every tag to its manifest digest, traverse image indexes when present, and calculate:

- logical bytes across tagged manifests;
- unique compressed layer, config and manifest bytes;
- bytes reachable only from deletion candidates.

Unknown media types, pagination gaps, inconsistent aliases or foreign scope block cleanup. Docker local uncompressed sizes and Container runtime disk are not registry-storage measurements.

### Delete narrowly and sequentially

Before every deletion, re-read the lease, current deployment/Container state and tag mapping. Delete only via the verified image-tag deletion operation, never `wrangler containers delete`. Stop after ten distinct candidate digests, use fixed deadlines, and do not blindly retry an uncertain result. Read back inventory and every protected reference after the batch.

The first production pass is dry-run only. Enabling deletion is a separate provider/destructive-action checkpoint based on the reviewed report. A deployment-side workflow or repository control must stop cleanup without adding another Worker environment binding, affecting normal deployment, or changing the MCP kill switch.

### Keep Worker records

Do not delete Worker versions or deployments. They provide useful audit context and incur no demonstrated storage pressure in this investigation. Documentation must say that versions outside retained image coverage are not supported rollback targets.

## Expected implementation surface

- `.github/workflows/nemlig-production.yml`: retain and publish cleanup evidence around finalization.
- `apps/nemlig-assistant/scripts/production-deploy.ts`: accepted-journal qualification and finalize-before-lease-release integration, reusing Git persistence helpers.
- `apps/nemlig-assistant/scripts/production-image-retention.ts`: inventory, pure retention planner, bounded ledger and deletion adapter.
- `apps/nemlig-assistant/package.json`: read-only inventory/dry-run command.
- Focused production deployment, workflow and retention tests.
- `docs/cloudflare-operations.md` and the Nemlig backlog: inspection, enablement, disablement and recovery procedures.

No new runtime dependency or hosted resource is expected.

## Risks / Trade-offs

- **A required image is deleted** -> derive success only from accepted journals, protect live/recovery references, revalidate before each deletion and stop on drift.
- **Ledger is missing or corrupt** -> fail closed and retain every image; rebuilding history is an explicit operator action.
- **Cleanup partially succeeds** -> record each read-back result, stop at the first ambiguity and reconcile from a fresh inventory.
- **Cleanup delays finalization** -> cap the batch at ten sequential deletions and fixed deadlines; record failure without rolling back the accepted release.
- **Ten releases are insufficient for a rare rollback** -> support explicit bounded holds and document the actual image-backed horizon.
- **Estimated bytes differ from Cloudflare storage** -> label the calculation clearly and prefer provider-reported aggregate usage if Cloudflare exposes it later.
- **Permission is broader than necessary** -> verify the installed Wrangler/API permission before implementation; do not broaden credentials automatically.

## Migration Plan

1. Implement inventory, ledger validation and the pure planner with provider mutation disabled.
2. Bootstrap recent accepted releases and classify unknown historical tags as held.
3. Run an accepted production deployment in dry-run mode; save and review the exact protected/candidate plan and byte estimates.
4. Re-run the same inventory to prove stable classification and verify all protected manifests remain resolvable.
5. Obtain the separate owner checkpoint for Cloudflare image deletion and any proven permission adjustment.
6. Enable at most ten sequential deletions during a later accepted deployment, then verify registry inventory, current Worker/Container image, health and cleanup evidence.
7. Continue automatic post-deploy convergence. Add a scheduled reconcile only if evidence shows orphan accumulation between deployments.

Rollback of the cleanup feature disables future deletion. Deleted images are not reconstructed automatically; production recovery uses only a retained verified image/version pair through the normal approved release procedure.

## Unknown Register

| Unknown | Consequence | Investigation | Owner / decision |
| --- | --- | --- | --- |
| Exact deletion unit and alias behavior in installed Wrangler | One tag deletion could affect aliases or shared manifests | Prove with disposable/non-production tags or authoritative API behavior before enabling deletion | Implementation owner; block destructive rollout until resolved |
| Complete active-reference enumeration supported by Cloudflare | A hidden reference could be missed | Compare deployment, version, Container application and instance APIs against current provider docs and live dry-run | Implementation owner |
| Minimum registry delete permission | Existing token may be excessive or insufficient | Capture the exact API permission used by the installed command without exposing credentials | Operator approves only if permission changes |
| Provider aggregate occupied-byte metric and garbage-collection delay | Estimate may not match reclaimed capacity | Prefer a newly exposed provider metric; otherwise retain the manifest estimate label | No scope change; report limitation |
| Historical accepted images lacking durable journals | Unsafe bootstrap could misclassify old tags | Hold ambiguous images, correlate only current evidence, and let later accepted releases age them out | Operator may release a named legacy hold after review |
| GitHub rules for the dedicated state ref | Ledger update could fail at finalization | Test read/write/read-back without touching `main` and preserve fail-closed cleanup behavior | Implementation owner |
