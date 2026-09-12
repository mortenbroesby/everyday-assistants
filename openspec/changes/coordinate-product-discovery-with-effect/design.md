## Context

See `proposal.md` for motivation and the delta specification for observable
behavior. Whole-list planning currently validates input, starts basket loading,
and resolves lines through a custom three-worker promise pool. A line performs
either general catalogue search or an exact product lookup. Non-authentication
failures become per-line unavailable results; HTTP 401 escapes so the existing
runtime can authenticate and retry the complete plan once.

The pool bounds throughput but has no shared lifetime. A fatal failure rejects
the parent promise while sibling workers continue, so an authentication retry
can overlap abandoned reads. The client transport already creates per-attempt
timeouts and accepts a signal internally, but the public read methods and MCP
planning boundary do not propagate caller cancellation. Identical reads are
also repeated for duplicate grocery lines. Ranking, calculation, proposals,
fresh revalidation, and mutation safety are already separate concerns and must
stay unchanged.

## Goals / Non-Goals

**Goals:**

- Isolate one Effect-based read coordinator behind the existing
  `Promise<ShoppingPlan>` application boundary.
- Make basket acquisition and bounded line discovery share a structured
  lifetime, with error identity preserved across interruption and auth retry.
- Measure lifecycle behavior separately from request-local read coalescing and
  use that evidence to select one production coordinator.
- Keep Effect confined to the read-lifecycle boundary without changing native
  ranking, planning, proposal, or mutation logic.

**Non-Goals:**

- Reworking product ranking, provider fallback search, authentication policy,
  proposal semantics, or write behavior.
- Establishing a repository-wide Effect architecture, service graph, tagged
  error taxonomy, cross-request cache, or new production timeout policy.
- Treating Effect as the source of parallelism; both comparison paths use the
  same concurrency of three.

## Decisions

### Put Effect around orchestration, not domain logic

Add one coordinator responsible for basket acquisition, keyed provider reads,
bounded concurrency, interruption, and ordered collection. It calls existing
plain functions for validation, candidate filtering/ranking, and final plan
calculation, and exposes a plain promise to the current MCP/runtime boundary.

This tests Effect where its structured-concurrency model has a concrete job and
keeps the experiment reversible. Rewriting schemas or pure transformations as
Effects was rejected because it would increase diff size without testing the
identified failure mode. Replacing the entire client was rejected for the same
reason.

### Adopt Effect at the measured coordinator boundary

Extract the current behavior behind the same narrow coordinator contract and
compare it with the Effect implementation. The measured lifecycle cases select
Effect for production whole-list planning: fatal failures stop queued reads and
the coordinator does not return until interrupted reads settle. The native
implementation remains benchmark-local historical evidence, not a shipped
fallback or runtime toggle.

A feature flag or production environment toggle was rejected because it adds
operational surface and preserves an unsafe path. Replacing Effect with
`p-limit` or `p-map` was rejected because limiting mapper concurrency does not
join already-started promises after cancellation; that would restore bespoke
cancellation and settlement coordination.

### Use one abortable scope for basket and catalogue work

Pass an optional caller signal from the MCP handler through the planning
boundary and the minimum public read methods used here. Adapt each provider
promise into an interruptible Effect, combine caller cancellation with a local,
injectable evaluation deadline, and run keyed reads with concurrency three.
Authentication failure, basket failure, caller cancellation, or deadline
expiry interrupts the scope. The adapter must wait for all child finalizers
and must not resolve interruption until the underlying abort-aware reads settle,
so the existing complete-plan authentication retry cannot overlap work from the
prior attempt.

Ordinary non-auth catalogue failures remain values local to their grocery line;
they do not interrupt siblings. The implementation must preserve HTTP 401 and
cancellation identity through optional/fallback client reads rather than
letting broad catches convert them to empty results.

Keeping the current promise pool and adding a shared `AbortController` was the
strongest alternative. It is included in the comparison discussion because it
may remain simpler if Effect does not materially improve testability or
maintenance. Unbounded `Promise.all` was rejected because it violates current
provider throttling.

### Coalesce only provider retrievals within one invocation

Build a request-local map keyed by retrieval kind and normalized input:

- general search: the schema-validated, trimmed query plus result limit;
- exact selection: selected product ID.

Do not add case, accent, or internal-whitespace folding unless provider and
ranking behavior first proves it equivalent. Each unique key creates one shared
read inside the coordinator scope. Results fan out to original line indexes,
after which existing constraint, preference,
amount, and evidence logic runs independently per line. Do not store the map on
the client or module and do not include fresh product revalidation in it.

Coalescing across requests was rejected because authentication principal,
freshness, privacy, and invalidation would turn this MVP into a cache design.
Coalescing completed line outcomes was rejected because lines sharing a search
can have different constraints and quantities.

### Benchmark observable work and prove real local HTTP lifecycle

Use deterministic fake reads and fixed latency schedules for matched native and
Effect cases. Cover 1, 5, 24, and 50 unique lines; a 24-line/12-key duplicate
case; out-of-order completion; ordinary failure; 401; basket failure; deadline;
caller cancellation; and concurrent principals. Record median and p95 elapsed
time, logical provider reads, maximum active reads, reads started or completed
after fatal failure, cancellation-to-quiescence latency, server bundle/import
cost, type-check time, and implementation size.

Run a native implementation with and without the same coalescing rule where
needed to distinguish deduplication savings from lifecycle semantics. Fake
timing results are regression evidence, not a provider-performance forecast.
Live provider benchmarks were rejected because they add credentials, cost,
rate-limit variability, and external-state risk without improving the decision.
A credential-free loopback server additionally exercises real Node fetch,
socket closure, cancellation, and the production-selected planning path from a
terminal command outside ChatGPT.

### Remove the picker experiment as superseded evidence

Delete the picker comparison modules, showcase controls, comparison-specific
configs/scripts/tests, and the `fp-ts` and Remeda dependencies. Retain the
native picker and reduce the historical comparison documentation to a concise
decision record pointing to closed PR #36. Keep the already pinned Effect
version as the single runtime dependency for this server-side coordinator.

Keeping both experiments was rejected because the branch would contain two
unrelated evaluation seams and obscure the adoption decision.

## Risks / Trade-offs

- [Cancellation stops waiting but an SDK call may ignore its signal] → Verify
  the installed HTTP path with focused tests; report transport cancellation as
  unproven unless an aborted fake and the actual adapter both settle correctly.
- [A broad optional-read catch hides cancellation or 401] → Add characterization
  tests before changing the catch boundary and rethrow fatal identities.
- [Concurrent cold-session initialization is not single-flight] → Characterize
  it, keep this MVP request-scoped, and defer global authentication coordination.
- [A deadline changes production behavior] → Keep it caller-supplied and
  bounded; do not introduce a new hosted global deadline.
- [Shared promise failure is observed by several lines] → Classify an ordinary
  provider failure independently for each dependent line while retaining one
  underlying request.
- [Effect bundle and cognitive cost exceed the safety gain] → Publish measured
  artifact/type-check/LOC costs and make removal an accepted outcome.
- [Picker cleanup obscures comparison history] → Preserve PR #36 and a short
  repository decision note rather than retaining dead executable code.

## Migration Plan

1. Characterize native ordered results, error mapping, concurrency, and auth
   retry behavior at the planning boundary.
2. Remove the superseded picker comparison and its unused dependencies while
   retaining the native picker and pinned Effect dependency.
3. Add signal propagation through the minimum read-only client interface and
   prove fatal identities survive fallback/optional reads.
4. Add the request-local coordinator contract, native reference path, Effect
   path, and deterministic comparison harness with native still selected.
5. Run focused and repository gates, publish measurements, and record an
   adopt/reject recommendation in the same draft pull request.
6. After explicit owner selection, switch production composition to Effect,
   remove dual-runtime injection and native fallback machinery, add a terminal
   plan command, and prove the selected path with credential-free loopback HTTP.
7. Prepare one release-bearing epic candidate and reviewed release note. Merge
   and deployment remain the existing later owner checkpoints. Rollback is a
   scoped revert of selection, CLI, and dependency changes while retaining the
   independently useful signal propagation and request-local coalescing.

## Open Questions

- Whether the external provider closes its own socket after cancellation
  remains outside local acceptance. The loopback harness proves the installed
  Node transport and coordinator boundary without credentials or provider data.
- Whether concurrent first-use authentication needs a broader single-flight
  mechanism. This is intentionally characterized but not solved in this MVP.
