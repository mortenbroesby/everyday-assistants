## Why

The picker now has a production-ready native TypeScript baseline, but the
repository has not demonstrated whether a functional approach would make its
data transformation and asynchronous host lifecycle easier to maintain. A small
side-by-side proof of concept can answer that with runnable code and comparable
evidence before any production rewrite.

## What Changes

- Compare two coherent candidate stacks on the same picker problem:
  - `fp-ts` for pure transformations, expected failures, and asynchronous
    composition.
  - `Remeda + Effect`, using Remeda for pure transformations and Effect for
    expected failures and resource lifecycle.
- Keep native TypeScript as the shared behavior reference, not a scored third
  candidate.
- Build both candidates behind the development-only showcase with identical
  fixtures and deterministic controls for success, delay, failure, duplicate
  activation, replacement, stale completion, disposal, and remount.
- Reuse one fake-host harness and require identical plain outputs, exact choice
  messages, at-most-one send, cleanup, and stale-result behavior.
- Benchmark raw/gzip browser output, startup and interaction timing, TypeScript
  check time, production code shape, concepts introduced, diagnostics, remaining
  manual guards, and one small equivalent change exercise.
- Record clear strengths, weaknesses, and unresolved trade-offs for each stack.
  Measurements inform the decision; they do not automatically choose a winner.
- Keep the current native production call site unchanged while the pull request
  is a draft. After human review, a separately approved final slice may select
  one candidate or retain native TypeScript and remove all experiment code.

### Goal

Give the repository owner a small, fair, runnable comparison of `fp-ts` versus
`Remeda + Effect`, covering both end-user behavior and maintainer experience.

### Non-goals

- No repository-wide functional-programming migration or generic abstraction.
- No production call-site switch, package release, deployment, provider call,
  credential use, proposal application, basket mutation, retry, reconnect,
  polling, telemetry, storage, or server orchestration.
- No comparison of Ramda, neverthrow, ts-pattern, Effect Micro, Effect 4 release
  candidates, Effect Schema, platform packages, layers, or service factories.
- No microbenchmark of five-item collection throughput; that is too small to be
  meaningful to an end user.

### Acceptance criteria

- Both candidates implement the same bounded pure transformation and host
  lifecycle behind one candidate-neutral interface.
- The same tests pass for both candidates across normal, failure, duplicate,
  replacement, disposal/remount, and stale-completion cases.
- The development showcase can select either candidate and replay the same
  synthetic states without contacting Nemlig or mutating external state.
- Comparable repeated measurements report medians, inputs, environment, and
  emitted artifacts; bundle measurements use separate candidate builds.
- The result documents concrete pros and cons, required concepts, manual guards,
  and one equivalent change exercise so the owner can compare both the code and
  the end-user behavior.
- Production remains native TypeScript and the draft is not merged until the
  owner selects a direction and rejected code is removed.

### Epic and pull-request boundary

Use the existing `codex/adopt-effect-picker-lifecycle` worktree, branch, and
draft PR #36 for the complete comparison. Checkpoint commits may separate the
shared harness, candidates, and measurements. This proof of concept has no
version or deployment decision; any production selection is a later approved
slice on the same epic branch or a replacement change if the design materially
expands.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a behavior-preserving development experiment and dependency
comparison; `.openspec.yaml` keeps `skip_specs: true`.

## Impact

- Development-only picker comparison modules, shared fake-host tests, showcase
  controls, benchmark tooling, and comparison documentation.
- Temporary exact candidate versions in the Nemlig package and lockfile. The
  production picker build and Node entry points remain unchanged.
- No new service, storage, schedule, runtime request, credential, provider,
  production, external-data, or basket effect.
