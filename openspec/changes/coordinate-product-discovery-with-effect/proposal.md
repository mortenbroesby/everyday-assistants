## Why

Whole-list planning already searches up to three catalogue lines in parallel,
but its custom worker pool cannot stop sibling reads when authentication,
basket acquisition, or caller cancellation ends the operation. The subsequent
authenticated retry can therefore overlap abandoned reads, while duplicate
queries consume avoidable provider calls. This is the right server-side seam to
test whether Effect materially improves coordination rather than merely
rewriting the picker in a different vocabulary.

## What Changes

- Add a bounded Effect implementation of whole-list read coordination behind
  the existing plain `Promise<ShoppingPlan>` contract.
- Preserve catalogue concurrency at three while making active and queued reads
  stop together on authentication failure, basket failure, caller cancellation,
  or the operation deadline.
- Thread optional cancellation signals through only the Nemlig read methods
  required by whole-list planning; keep transport retry policy unchanged and
  never add mutation retries.
- Coalesce identical catalogue searches or selected-product lookups within one
  planning invocation, then apply each line's constraints and preferences
  independently in original order.
- Compare the existing native coordinator with Effect using deterministic fake
  network cases, request counts, abandoned work, cancellation latency, code
  shape, type-check cost, and server artifact cost.
- Remove the superseded picker comparison, `fp-ts`, and Remeda from this branch.
  Preserve PR #36 and its final commit as the historical research record.
- Select the measured Effect coordinator for whole-list production planning,
  retain plain TypeScript for ranking, calculation, proposals, and mutations,
  and remove the native worker pool from the shipped runtime.
- Add a local terminal planning surface and a credential-free loopback HTTP
  acceptance harness so the selected path can be exercised outside ChatGPT.

### Goal

Determine whether Effect makes the real whole-list product-discovery boundary
safer and easier to maintain while reducing duplicate reads, without changing
shopping results or mutation authority.

### Non-goals

- No claim that Effect introduces parallel search; the native implementation
  already has bounded parallelism.
- No basket mutation, automatic proposal application, provider-backed test,
  deployment/CI refactor, repository-wide Effect migration, new public tool,
  production environment toggle, cross-request cache, or fresh-revalidation
  cache.
- No new retry loop. Existing read retry and complete-plan authentication retry
  remain the maximum; uncertain writes remain single-attempt.
- No change to ranking, constraints, quantities, relevance, images, plan
  calculation, proposal authorization, or the native picker.

### Acceptance criteria

- Native and Effect coordinators return identical plain ordered plans for 1, 5,
  24, and 50-line fixtures and never exceed three active catalogue reads.
- A 24-line fixture with 12 identical retrieval keys performs exactly 12
  logical reads in the Effect MVP while retaining independent line outcomes.
- Authentication failure, basket failure, caller cancellation, and deadline
  expiry interrupt active work, leave no queued or dangling fake reads, and
  preserve the error identity required by authenticated retry.
- The first authenticated attempt is quiescent before a second attempt starts;
  ordinary per-line discovery failures remain distinct from empty results.
- Coalescing is request-local and principal-local. `getFreshProduct` still makes
  an authoritative new read before any separately approved mutation.
- Measurements separate the benefit of duplicate coalescing from Effect's
  lifecycle/cancellation contribution and may conclude that native TypeScript
  remains preferable.
- Strict OpenSpec validation, focused tests, production picker/package checks,
  privacy validation, root verification, a real loopback HTTP acceptance, and
  exact-head CI pass on the final draft PR. The release-bearing candidate has a
  valid version and reviewed release note, while merge and deployment remain
  separate owner checkpoints.

### Epic and pull-request boundary

Deliver the complete implementation on `codex/effect-product-fetch-mvp`, created from the
closed PR #36 head and rebased onto current `origin/main`. Use one replacement
draft pull request for planning, implementation, measurements, adoption, local
acceptance, and release metadata. The owner approved taking the measured MVP to
full implementation on this PR; merging and deployment still require their
existing checkpoints.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-guided-shopping`: Whole-list discovery gains request-local retrieval
  coalescing and coordinated cancellation while preserving ordered results,
  concurrency, authentication recovery, and the non-mutating contract.

## Impact

- Primary scope: `apps/nemlig-assistant/src/plans.ts`, its focused tests, and the
  minimum signal-aware Nemlig client read path required by the coordinator.
- One pinned Effect coordinator in the server runtime plus reproducible
  comparison and real-loopback acceptance tooling.
- Removal of the picker-only comparison modules, benchmark configs, showcase
  controls, `fp-ts`, and Remeda from the replacement branch.
- No external service, credential, stored data, provider configuration, public
  API, basket state, merge, publication, or deployment change during branch
  implementation.
