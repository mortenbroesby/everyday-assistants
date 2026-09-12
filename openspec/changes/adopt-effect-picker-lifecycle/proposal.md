## Why

The React picker establishes a small native MCP Apps host lifecycle that can serve as a real baseline for the requested long-term functional-programming adoption. This change tests stable Effect 3 at that exact boundary and adopts it only if scoped resource management and typed failures justify the added browser bytes and code.

## What Changes

- Characterize the completed native React/SDK connection, result subscription, message send, failure, replacement, and cleanup behavior.
- Implement the smallest equivalent stable Effect 3 adapter in isolation and run the same lifecycle harness against both versions.
- Adopt Effect as the single production lifecycle owner only when the comparison demonstrates clearer resource cleanup or error coordination within an acceptable measured artifact delta; otherwise retain the native adapter and record the rejection evidence.
- Preserve all React rendering, payload, exact choice-message, packaging, CSP, feature-gate, conversational fallback, proposal, approval, and basket-safety contracts.
- Update the dependency landscape with the measured adopt/reject decision.

### Goal

Make an evidence-backed decision on one meaningful production use of Effect without widening the change beyond the picker host lifecycle.

### Non-goals

- No rendering, payload, resource-build, packaging, CSP, or picker-feature redesign.
- No server orchestration, authentication, provider retry, proposal preparation/application, basket tool, Effect Schema, layer hierarchy, service factory, Effect 4 release candidate, polling, reconnect, telemetry, storage, or provider change.
- No agent-artifact routing implementation in this pull request.

### Acceptance criteria

- The same fake-host lifecycle tests pass against native and Effect adapters, including connection/result timing, send failure, duplicate activation, result replacement, unmount, remount, and stale completion.
- The Effect candidate has one lifecycle owner, sends the existing conversational message at most once per activation, and adds no retry, reconnect, polling, proposal application, or basket mutation.
- Raw/gzip artifact and coordination-code comparisons are recorded before the production call site changes.
- Effect is adopted only with demonstrated maintenance value and acceptable supported-host size; rejection is a valid completed outcome when the native adapter remains simpler.

### Epic and pull-request boundary

The draft branch is `codex/adopt-effect-picker-lifecycle`, stacked on React draft branch `codex/adopt-react-effect`. Planning and isolated comparison may proceed concurrently, but React merges first. Before Effect integration, rebase or retarget the draft to the merged React revision on `origin/main` and make a separate release decision.

### Follow-up

After React and Effect are merged or Effect is explicitly rejected, create the separately scoped agent-artifact routing pull request recorded by the React proposal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This change is a behavior-preserving implementation refactor; the React change owns the observable lifecycle requirements, and this change declares `skip_specs: true`.

## Impact

- Potentially affects only the React picker host adapter, its lifecycle harness, the Nemlig manifest/lockfile, and `docs/dependency-landscape.md` during implementation.
- Adds stable Effect 3 as a build input only if the evidence gate passes; no new runtime service or Node-server import is introduced.
- Adds possible browser bytes and parse work but no recurring service, storage, polling, retry amplification, provider request, operator cost, or basket mutation.
- Effect-only rollback restores the native React adapter; `NEMLIG_MCP_APPS` remains the emergency picker kill switch.
