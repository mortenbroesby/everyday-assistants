## Context

See `proposal.md` and the delta in `specs/nemlig-production-delivery/spec.md`. The current workflow and deployment command both implement a durable Git-ref lease/journal protocol; release acceptance artifacts feed automatic image and Worker-version retention. The production workflow already serializes routine runs with GitHub concurrency.

## Goals / Non-Goals

**Goals**

- Make the protected routine path build, perform current provider access/preflight checks, deploy the exact green `main` candidate, and run bounded read-only acceptance.
- Remove durable release ownership, journaling, recovery/finalization dispatches, automatic failback, release artifacts, and automated image/Worker-version cleanup.
- Keep exact-source provenance, protected credentials, serialized runs, one-Container configuration, current-provider safety checks, and honest failure results.

**Non-Goals**

- Add a replacement queue, journal, recovery workflow, rollback mechanism, or new retention service.
- Change application APIs, authentication, basket behavior, provider configuration, secrets, or UI acceptance requirements.
- Delete old Git refs or provider images/Worker versions as part of this code change.

## Decisions

1. **Use GitHub's existing deployment concurrency queue as the only release serialization.** Remove the second cross-worktree Git lease and predecessor reconciliation. Keep exact candidate and protected-environment checks. This avoids durable stale-lock blockage while retaining one active workflow deployment.

2. **Treat post-deploy checks as the result of the attempt, not a recovery protocol.** Keep edge and authenticated read-only acceptance. A failed or cancelled operation fails the workflow and does not automatically roll back; later work starts from live provider readback and stops if current configuration or an active rollout is unsupported.

3. **Defer automatic retention instead of replacing its journal input.** Remove image and Worker-version retention jobs and their lease/report consumers. Do not delete existing images, Worker versions, or retention Git refs. A future manual cleanup path needs a separate scope and evidence contract.

4. **Remove durable release artifacts.** Stream bounded, sanitized command outcomes to the Actions log/step summary. There is no cross-run artifact gate because no cross-run recovery or automated retention consumes it.

## Risks / Trade-offs

- [A runner can stop after a provider mutation and leave a partial or uncertain rollout] → Keep GitHub run serialization, bounded commands, current-provider/configuration preflight, active-rollout refusal, exact deployed-SHA readback, and fail the attempt on uncertainty. Operators inspect live state before corrective action; no code will infer successful recovery.
- [Failed releases are not automatically restored] → This is an explicit owner trade-off. The workflow reports failure and the exact last completed acceptance boundary; it does not claim service recovery.
- [Image and Worker-version histories grow without automatic pruning] → Leave production artifacts untouched. Any cleanup is a later manual, separately reviewed operation.

## Migration Plan

Merge the workflow and command changes through the normal protected PR path. Routine delivery then uses the merged trusted `main` candidate through GitHub's serialized queue. The previously present `codex-lock/nemlig-production` ref was explicitly removed before implementation; other historical refs remain inert. Do not trigger production from this feature branch. After merge, observe exact-main CI and the automatically queued production run; report server acceptance separately from native ChatGPT UI acceptance.
