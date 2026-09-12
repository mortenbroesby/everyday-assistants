## 1. Establish the Native Baseline

- [x] 1.1 Add focused characterization tests for ordered plans, per-line ordinary failures, basket failure, HTTP 401 propagation, and the three-read concurrency ceiling; verify the focused planning/runtime tests pass before production code changes.
- [x] 1.2 Add abort-aware fake catalogue and basket readers that record starts, completions, interruptions, active count, and quiescence; verify their own tests produce deterministic event traces.
- [x] 1.3 Capture the native coordinator baseline for 1, 5, 24, and 50 unique-line fixtures plus out-of-order completion; verify results and maximum concurrency are stable across repeated local runs.
- [x] 1.4 Include the baseline tests and harness in the first implementation checkpoint; verify the pushed branch contains commit `e4fca2b` and the remote branch SHA matches local after the completed epic slices are integrated.

## 2. Retire the Superseded Picker Experiment

- [x] 2.1 Remove picker comparison modules, tests, benchmark/build configs, showcase controls, and comparison-only scripts while retaining the native picker; verify picker tests and the production picker build pass.
- [x] 2.2 Remove `fp-ts` and Remeda from package and lock files, retain the pinned Effect dependency for the server MVP, and verify install/type-check resolution contains no runtime picker import of any comparison library.
- [x] 2.3 Replace the executable picker comparison documentation with a concise decision record linking closed PR #36 and explaining the server-side continuation; verify repository links and OpenSpec references resolve.
- [x] 2.4 Include the superseded-experiment cleanup in implementation checkpoint `e4fca2b`; verify the pushed remote contains that checkpoint without retaining executable comparison code.

## 3. Make Read Cancellation Explicit

- [x] 3.1 Thread an optional caller signal from the MCP planning handler through the planning boundary and only the catalogue search, exact product, and basket read ports; verify focused tests observe the same signal at the fake transport.
- [x] 3.2 Compose caller cancellation with existing per-attempt timeout behavior without adding retries or changing mutation methods; verify transport tests preserve one read retry, no write retry, HTTP 401 identity, and caller-cancellation identity.
- [x] 3.3 Correct optional/fallback read catches so they do not convert cancellation or authentication failure into empty data; verify ordinary missing optional data still follows current fallback behavior.
- [x] 3.4 Record signal propagation in checkpoint `a01a502`; verify the pushed remote contains that commit and the integrated remote branch SHA matches local.

## 4. Implement and Compare the Coordinators

- [x] 4.1 Extract the current native orchestration behind a narrow plain-promise coordinator contract without changing production selection; verify all characterization tests remain green.
- [x] 4.2 Add request-local retrieval-key construction and coalescing for schema-validated trimmed search-plus-limit and selected-product-ID reads without unproven case/accent folding, then evaluate each dependent line independently; verify the 24-line/12-key fixture performs exactly 12 reads and preserves line-specific outcomes and order.
- [x] 4.3 Implement the isolated Effect coordinator with basket and keyed catalogue reads in one interruptible scope at concurrency three; verify ordinary failures remain per-line while HTTP 401, basket failure, caller cancellation, and deadline stop active and queued fake reads.
- [x] 4.4 Make the Effect promise adapter await underlying abort-aware read settlement before rejection and preserve fatal error identity; verify a complete-plan authentication retry begins only after the first attempt has no unsettled reads and performs at most one retry.
- [x] 4.5 Verify concurrent principals and separate requests never share retrievals and fresh product revalidation always performs a new authoritative read before any separately approved mutation.
- [x] 4.6 Complete the non-default Effect MVP across implementation checkpoint `e4fca2b` and quiescence checkpoint `50517aa`; verify both are present on the pushed remote branch.

## 5. Measure and Decide

- [x] 5.1 Run matched native and Effect cases for unique, duplicate, delayed, failed, 401, basket-failed, deadline, and caller-cancelled workloads; publish reproducible median/p95 latency, logical reads, maximum concurrency, post-failure work, and cancellation-to-quiescence results.
- [x] 5.2 Measure server artifact/import cost, type-check time, implementation size, and test complexity, and separate request-coalescing gains from structured-lifecycle gains; verify the report includes commands, environment, repetitions, and raw machine-readable output.
- [x] 5.3 Verify whether the installed transport actually aborts in-flight I/O and characterize concurrent first-use authentication; record either evidence or an explicit limitation without expanding this MVP into transport replacement or global auth single-flight.
- [x] 5.4 Write an opinionated adopt-or-remove recommendation with decision criteria and rollback steps; verify it addresses correctness, maintenance, performance, dependency cost, and the native `AbortController` alternative.
- [x] 5.5 Record the reproducible benchmark and recommendation in checkpoints `541d0aa` and `50517aa`; verify both are present on the pushed remote branch.

## 6. Integration and Owner Checkpoint

- [x] 6.1 Run strict OpenSpec validation, 118 focused Nemlig tests, production picker/package checks, privacy validation, and the repository's required full verification gate against implementation head `f5b5e79`; verify local and remote both resolve to `f5b5e79b753b5f243fc751f71f7906b250ec1537` before this task-record-only checkpoint.
- [x] 6.2 Update the replacement draft PR with scope, closed-PR provenance, measurements, limitations, and the adopt-or-remove recommendation; verify exact-head CI passes and no provider, basket, release, version, or deployment mutation occurred.
- [x] 6.3 Present the measured adopt-or-remove recommendation as the owner checkpoint while leaving the Effect path non-default and PR #40 unmerged; verify the MVP can be reviewed without a production switch, specification archive, version, release, or deployment.

The completed MVP supplied the owner decision evidence. The owner then approved
adoption and a full implementation on the same pull request. Merge-to-main and
deployment promotion remain separate checkpoints after the branch is complete.

## 7. Adopt and Prove the Selected Coordinator

- [x] 7.1 Change the default whole-list planning path to the Effect coordinator, add zero-work pre-abort and default-path retry-quiescence tests first, and remove the native worker pool from shipped runtime code; verify ranking, calculation, fresh revalidation, and every mutation boundary remain plain TypeScript and behaviorally unchanged.
- [x] 7.2 Simplify the coordinator boundary and naming, move Effect into production dependencies, and retain the native implementation only as benchmark-local historical evidence; verify the packed production CLI, MCP, and HTTP entries resolve with production dependencies alone.
- [x] 7.3 Add a read-only `nemlig plan <input-file>` terminal command using the same strict schema and production resolver, with readable/JSON output, bounded timeout, SIGINT cancellation, and zero proposal or mutation authority; verify malformed input performs no authentication or provider work.
- [x] 7.4 Add and run a credential-free local loopback HTTP acceptance outside ChatGPT that exercises real fetch cancellation for 24 lines/12 keys, basket failure, and caller cancellation; verify concurrency never exceeds three, queued reads do not start after fatal failure, active requests settle before return, and all sockets and timers close.
- [x] 7.5 Correct the benchmark and evaluation text for the adopted artifact and matched cancellation semantics, record the current dependency alternatives, and document the login merge caveat without reading saved credentials or claiming authenticated provider acceptance.
- [x] 7.6 Reconcile current `origin/main`, collapse the draft's superseded experiment history into one reviewable epic candidate without the obsolete `Nemlig-Release: none` override, compute the required version and release note from the exact candidate, and verify the immutable version/release gates.
- [x] 7.7 Run focused tests, the loopback acceptance, strict OpenSpec, privacy/package checks, and the full repository verification gate; commit and push the exact candidate, update PR #40, and verify exact-head CI while leaving merge, publication, and deployment unperformed.
