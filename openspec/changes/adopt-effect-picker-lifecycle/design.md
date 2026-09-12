## Context

See [proposal.md](proposal.md) for motivation. This draft is stacked on `adopt-react-picker`, which owns every observable picker requirement and supplies a native React/MCP Apps lifecycle plus fake-host tests. This change is therefore a pure implementation comparison with `skip_specs: true`; it must not make React depend on Effect or weaken the React contract.

The current SDK line constructs one `App`, registers `ontoolresult` before `connect()`, and sends the exact conversational choice message. Effect interruption cannot undo a message already delivered through the host or necessarily cancel an underlying SDK Promise, so explicit stale-state protection remains required where the SDK provides no cancellation guarantee.

## Goals / Non-Goals

**Goals:**

- Compare stable Effect 3 with the completed native lifecycle using the same production boundary and tests.
- Use Effect only when scoped finalization or typed failure handling removes real manual coordination.
- Keep one lifecycle owner and a small plain React-facing adapter.

**Non-Goals:**

- No generic Effect platform, layer graph, service interface, factory, schema replacement, server conversion, or second host owner.
- No behavioral, rendering, payload, packaging, CSP, message, retry, proposal, or basket change.

## Decisions

### 1. React's native adapter is the required baseline

Do not implement Effect against the old inline DOM picker. Identify the exact React prerequisite commit and run the same fake-host lifecycle harness against its native adapter first. The React adapter remains a complete rollback and must satisfy all observable behavior without Effect.

Alternative: add Effect while React is still being built. Rejected because there would be no stable native comparison and the two drafts could accidentally share ownership.

### 2. One small Effect scope owns the existing SDK App

Use stable Effect 3 only around construction, callback registration, connection, explicit sends, failure mapping, and finalization of the one MCP Apps `App`. Register cleanup as soon as the `App` exists and before awaiting connection so failed or interrupted acquisition cannot leak it. React consumes plain state/callbacks and does not also call `useApp` or create another `App`.

No `@effect/platform`, Effect Schema, service/layer hierarchy, retry schedule, polling fiber, reconnect loop, or repository-wide wrapper is allowed. Pin the exact tested stable Effect 3 version only after the evidence gate passes.

Alternative: convert server wrappers or proposal operations. Rejected because current wrappers are small and proposal/application code has a safety-sensitive blast radius unrelated to this experiment.

### 3. Cancellation never stands in for delivery semantics

One deliberate activation starts at most one `sendMessage`. Pending state blocks duplication. Failure becomes plain React state and permits only a later deliberate retry. Unmount or result replacement interrupts local work, closes or invalidates the old session, and ignores stale completion. It never claims to retract an already delivered message.

Verify the pinned SDK's close and pending-Promise behavior. Keep the smallest generation guard needed where SDK cancellation is absent; do not hide it behind another abstraction.

### 4. Adoption requires comparative evidence

Run identical connection timing, result replacement, failure, repeated activation, unmount, remount, and stale-completion cases against native and Effect adapters. Record raw/gzip artifact bytes and the lifecycle coordination each implementation requires.

Adopt Effect only if all behavior remains green, the built resource stays within React's verified host ceiling, there is still one lifecycle owner, and Effect removes at least one real manual acquisition/finalization or expected-failure coordination path without adding a parallel service hierarchy. Otherwise retain native code, record the rejection, remove the candidate dependency, and close the implementation without switching production.

### 5. Preserve package and safety boundaries

The Effect adapter remains browser-only and bundled into the existing self-contained picker. Node entry points do not import it. No CSP, resource, tool, authorization, retry, provider, or deployment permission changes. The dependency landscape records version, artifact delta, APIs used, and adopt/reject reasoning.

## Risks / Trade-offs

- [Effect adds bytes without reducing lifecycle complexity] → Compare against native and reject when the evidence gate fails.
- [Effect and React both own the SDK session] → Keep one adapter call site and prohibit simultaneous `useApp` or direct `App` construction.
- [Interrupted Promises update stale state or delivered messages are misreported] → Verify SDK semantics and retain a minimal generation guard.
- [The stacked branch drifts after React merges] → React merges first; then rebase Effect onto its exact merged `origin/main` revision before final verification.
- [Dependency work conflicts with another release] → Serialize manifest/lockfile edits and recompute the package version from the final base.

## Migration Plan

1. Wait for the React adapter and lifecycle harness, then identify its exact commit and artifact baseline.
2. Implement the isolated Effect candidate without changing the production call site.
3. Run the comparative evidence gate and record the decision.
4. If adopted, switch the single adapter call site, bundle Effect, and run focused, package, privacy, and full repository checks. If rejected, delete the candidate and retain the native adapter.
5. Rebase or retarget the draft after React merges, make a separate release/version decision, and integrate through the protected ruleset.
6. Roll back Effect alone to the native adapter; use `NEMLIG_MCP_APPS` only as the emergency picker fallback. No data migration is required.

## Open Questions

- The pinned MCP Apps SDK's close and pending-operation guarantees are verified in the first comparison slice; the result selects the minimum explicit stale-state guard but does not change scope.
