## Context

See `proposal.md` for motivation. The Nemlig Assistant currently has 6,963 production TypeScript lines and 5,147 test lines. Its largest modules combine public MCP or CLI contracts with safety-sensitive orchestration. The initial audit found 239 exported declarations, no TSDoc blocks, a proven unused constant, a redundant scope alias, duplicated type declarations, repeated state/error transitions, and one avoidable planner scan. All runtime dependencies have direct uses, so dependency removal is not presently justified.

The worktree starts at the current `origin/main`, but it does not yet have installed dependencies. Existing open changes also contain unfinished rollout or acceptance work. Cleanup must therefore begin by proving the local baseline and must avoid claiming unfinished feature work as cleanup.

## Goals / Non-Goals

**Goals:**

- Reduce production code and accidental API surface without changing observable behavior.
- Make safety-critical boundaries easier to understand through focused tests and high-value TSDoc.
- Reduce repeated state transitions and error-envelope code only after their exact outputs and ordering are characterized.
- Reduce local CPU work where the same result can be computed once without changing provider traffic.
- Deliver small commits that can be reviewed, reverted, and verified independently.

**Non-Goals:**

- No MCP, CLI, package, storage, authentication, tier, or basket contract changes.
- No live basket/provider mutation, deployment, credential access, or Cloudflare configuration mutation.
- No new dependency, generic framework, tool registry, compatibility alias, service, or storage layer.
- No arbitrary file splitting, test-fixture consolidation, or blanket TSDoc coverage.
- No archival of OpenSpec changes that still have unchecked rollout or acceptance tasks.

## Decisions

### 1. Doubts are resolved before each slice

Each slice begins with a short evidence record: the suspected complexity, the references and runtime path checked, the behavior that must remain invariant, and the focused command that proves it. Safety-sensitive refactors require characterization tests before production edits. A newly discovered behavior defect is separated from cleanup and starts with a failing test.

This is preferred over a broad mechanical rewrite because apparently redundant code may encode package compatibility, audit ordering, or failure semantics.

### 2. Work proceeds from leaves toward orchestration boundaries

The implementation order is:

1. prove the clean baseline;
2. remove proven leaf-level dead code, redundant aliases/imports, and duplicated type declarations;
3. replace the per-plan-line basket scan with one local index;
4. consolidate repeated MCP failure handling while registrations remain explicit;
5. consolidate proposal invalidation transitions;
6. simplify Cloudflare admission code only where characterization proves exact equivalence;
7. verify and archive only already-complete OpenSpec changes whose deltas are represented in main specs.

Later slices depend on the evidence from earlier ones, but not on speculative shared abstractions.

### 3. Preserve contracts by characterization, not snapshots of everything

Focused tests cover ordering, request counts, structured payloads, audit events, state transitions, replay and expiry, indeterminate results, and admission reason/status mappings. Existing broad suites remain intact. New tests are limited to gaps needed to prove the touched invariant.

This is preferred over whole-file snapshots, which would make harmless formatting changes expensive and hide meaningful contract assertions.

### 4. Consolidation stays private and local

Repeated logic may become a private same-module operation only when it removes more code than it adds and all callers share identical semantics. MCP tool registration remains explicit; proposal and gateway operations remain sequential. No single-implementation interface, factory, registry, or cross-module utility is introduced.

### 5. Documentation targets contracts and invariants

TSDoc is added to exported or non-obvious boundaries such as cached-versus-fresh product lookup, shopping-plan resolution, MCP request context, proposal authorization/revalidation, and Cloudflare admission. Comments that restate types or syntax are omitted.

### 6. Cost and safety are fixed invariants

The refactor must not add provider requests, retries, logging volume, storage, concurrency, Container capacity, services, or dependencies. It preserves authentication before Container wake, unknown-principal fail-closed behavior, one Container, quotas, rate limits, circuit breaker, hard ceilings, bounded timeouts/retries, kill switch, post-class `outboundByHost` registration, prepare/review/apply, connection binding, expiry, fresh product revalidation, basket fingerprinting, no mutation retry, and final readback.

## Risks / Trade-offs

- [A clean-looking deletion removes an external contract] → Check package entry points, exports, generated output, tests, and repository-wide references before deletion; retain anything not proven private.
- [Refactoring changes error text, ordering, or audit state] → Add focused characterization first and keep orchestration sequential.
- [Test cleanup only moves duplication] → Measure net lines and skip consolidation that does not reduce code or improve a concrete invariant.
- [The local baseline is already red] → Install with the frozen lockfile and run the required gates before editing; record unrelated failures rather than absorbing them silently.
- [Concurrent work advances `origin/main`] → Refresh ancestry before each slice and rebase safely in the isolated worktree, then rerun affected gates.
- [TSDoc becomes noise] → Document only contracts, safety reasoning, and non-obvious constraints; report intentionally undocumented obvious exports.

## Migration Plan

There is no data or production migration. Each slice is committed and pushed independently from the cleanup worktree after its focused gates and required repository gate pass. A slice can be reverted by reverting its commit. No deployment is part of this change.

At final integration, run strict OpenSpec validation, repository verification, production-readiness checks, privacy checks, packed-package smoke, and the credential-free Cloudflare dry run. Verify the exact remote head and CI before declaring the program complete.

## Open Questions

- Whether the repeated MCP failure envelope yields a meaningful net deletion will be decided after exact catalog and failure characterization; otherwise that slice is skipped.
- Whether Cloudflare admission contains enough proven duplication to justify editing will be decided after focused characterization; otherwise only TSDoc is added where valuable.
