## Why

The repository intends to use functional programming for long-term maintainability, but the earlier draft examined only Effect at one lifecycle boundary. That risks selecting a library because the comparison was shaped around its strongest feature rather than the picker's actual pure-data and asynchronous needs.

Current research favors stable Effect 3 as the leading integrated ecosystem, keeps native TypeScript as the shipping baseline, and treats Remeda as the strongest lightweight transformation challenger. This change performs one fair comparison before choosing a production dependency.

## What Changes

- Compare native TypeScript, fp-ts, stable Effect 3, Remeda, neverthrow, and ts-pattern on the roles they actually solve: one picker view-model transformation and one MCP Apps connection/result/send/dispose lifecycle.
- Compare Effect's pure modules separately from its runtime. Record Effect Micro as experimental research only; do not adopt it under the stable-dependency policy.
- Preserve a functional core with thin effectful boundaries regardless of which dependency, if any, wins.
- Select one coherent dependency model using behavior parity, composition, expected-error contracts, resource ownership, reviewer comprehension, learning/migration cost, type-check cost, and measured raw/gzip output. Fewer lines are supporting evidence, not the sole gate.
- Remove all rejected candidate code and dependencies before switching the production call site.
- Preserve every UI, payload, exact choice-message, packaging, CSP, gate, fallback, proposal, approval, and basket-safety contract owned by the stacked UI draft.

### Goal

Make an evidence-backed functional-TypeScript foundation decision without confusing a focused utility with a whole-runtime replacement or preselecting Effect by the shape of the experiment.

### Non-goals

- No repository-wide FP migration or dependency mandate.
- No server orchestration, authentication, provider retry, proposal preparation/application, basket tool, Effect Schema, layer hierarchy, service factory, Effect 4 release candidate, polling, reconnect, telemetry, storage, or provider change.
- No agent-artifact routing implementation in this pull request.

### Acceptance criteria

- Native TypeScript, fp-ts, and Effect receive equivalent pure-core and lifecycle cases; Remeda, neverthrow, and ts-pattern are evaluated only for the narrower roles they claim to solve.
- Identical behavior and fake-host lifecycle tests pass for every retained candidate, including connection/result timing, send failure, duplicate activation, replacement, unmount/remount, and stale completion.
- The decision records composition and error/resource clarity, required concepts, reviewer comprehension, type-check diagnostics/time, migration risk, and raw/gzip artifact output.
- The final picker contains one dependency model and one lifecycle owner, with no rejected candidate code, automatic retry/reconnect/polling, proposal application, or basket mutation.
- Stable Effect 3 remains the preferred integrated candidate, but native TypeScript or a narrower library wins if the equivalent implementation provides the better measured maintenance trade-off.

### Epic and pull-request boundary

The draft branch is `codex/adopt-effect-picker-lifecycle`, stacked on UI draft branch `codex/adopt-react-effect`. Research and isolated comparison may proceed concurrently, but the UI draft merges first. Before integration, rebase or retarget this draft to the merged UI revision on `origin/main` and make a separate release decision.

### Follow-up

After both drafts are merged or this comparison selects no FP dependency, create the separately scoped agent-artifact routing pull request recorded by the UI proposal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a behavior-preserving implementation and dependency decision; the UI change owns observable requirements, and this change declares `skip_specs: true`.

## Impact

- Potentially affects only the selected picker pure-core helpers and host adapter, their shared harness, the Nemlig manifest/lockfile, and `docs/dependency-landscape.md` during implementation.
- Candidate packages are temporary comparison inputs. Only the selected stable dependency, if any, remains in the browser build; Node entry points do not import it.
- Adds possible build/type-check time, browser bytes, and parse work but no service, storage, polling, retry amplification, provider request, operator cost, or basket mutation.
- Dependency-only rollback restores native TypeScript; `NEMLIG_MCP_APPS` remains the emergency picker kill switch.
