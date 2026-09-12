## Context

See `proposal.md` for motivation. Merged PR #34 provides a native TypeScript
production picker, a development-only showcase, a self-contained Vite build,
and host lifecycle tests. This change compares two functional designs without
replacing that production path.

The real problem has two distinct parts:

1. Derive a plain display model from a validated proposal with safe images,
   available alternatives, rejected ingredients, and stable choice identities.
2. Coordinate one host message through pending, success, failure, replacement,
   stale completion, and disposal states without retry or duplicate delivery.

`fp-ts` can represent both parts with its own data types and `TaskEither`.
`Remeda + Effect` deliberately splits responsibilities: Remeda owns plain-data
pipelines; Effect owns typed failures, execution, and resource cleanup. Native
TypeScript defines the expected observable result for both.

## Goals / Non-Goals

**Goals:**

- Make both candidate implementations small enough to review side by side.
- Use identical inputs, outputs, fake host, timing controls, and assertions.
- Show end-user-visible state sequences in the existing local showcase.
- Measure each candidate in isolation and record reproducible evidence.

**Non-Goals:**

- No production architecture decision, generic FP layer, SDK wrapper, schema
  replacement, runtime service graph, or synthetic throughput contest.
- No change to tool registration, picker resource, CSP, messages, provider
  access, proposal application, basket mutation, release, or deployment.

## Decisions

### 1. Compare two stacks, not individual package features

| Stack | Pure data | Async and cleanup | Question |
| --- | --- | --- | --- |
| `fp-ts` | `ReadonlyArray`, `Option`, `Either`, `pipe` | `TaskEither` plus explicit session invalidation and cleanup | Is one traditional FP vocabulary clearer across the whole boundary? |
| `Remeda + Effect` | TypeScript-first collection pipelines over plain data | Effect typed failures, scopes/finalizers, and explicit delivery guards | Is specialization clearer despite using two packages? |

Ramda is not a candidate; the TypeScript-first package is Remeda. Native
TypeScript remains the reference and fallback. No other library enters the
comparison unless a missing competency is demonstrated first.

### 2. Use one candidate-neutral contract

Add a development-only comparison folder with plain public types:

- `derive(payload)` returns a serializable display model.
- `runScenario(scenario, host)` returns a Promise of an ordered state/event
  trace and guarantees disposal before resolving.
- Scenarios describe host delay, resolve/reject, replacement, duplicate click,
  disposal, and remount timing without exposing a library type.

Candidate modules may use their natural internal APIs but must return the same
plain values. They must not import React, the production picker entry, server
code, or basket operations. Shared fixtures and assertions own expected output;
candidate code cannot define its own success criteria.

### 3. Preserve manual delivery guards where the host cannot cancel delivery

Neither stack may claim to cancel a message already delivered to the MCP host.
Both keep an explicit pending guard and generation/active invalidation for stale
Promise completion. Effect interruption or a `TaskEither` resource bracket may
clean up local work, but it cannot weaken at-most-one-send or stale-result
checks. Automatic retry, reconnect, and polling are prohibited.

### 4. Extend the showcase without changing the production resource

Add a development-only comparison panel to `showcase.html` with:

- a stack selector;
- deterministic scenario controls;
- the derived display model;
- ordered user-visible states and event trace;
- elapsed local orchestration time clearly labeled as diagnostic, not network
  performance.

The production `picker.html` build continues to import only native production
modules. The existing artifact guard must prove that comparison labels and
candidate packages do not enter the shipped resource.

### 5. Build and measure candidates separately

A small comparison Vite config aliases one candidate at a time into the same
browser entry and writes ignored artifacts outside `dist/`. A benchmark script
runs the same commands and records:

- minified raw and gzip candidate bundle bytes;
- median TypeScript check time over five warm runs using candidate-specific
  configs and the same compiler version;
- candidate production lines and direct imported package count;
- required concepts, explicit state guards, and diagnostic quality;
- identical scenario pass/fail results.

The script emits machine-readable JSON to an ignored directory. The checked-in
comparison document records the environment, commands, medians, pros, cons, and
interpretation. Browser interaction timings are supporting diagnostics only;
host/network latency is excluded and collection throughput is not scored.

### 6. Treat correctness as a gate and comprehension as evidence

Both stacks must pass exact output, exact message, at-most-one-send, failure,
replacement, disposal/remount, and stale-completion assertions. A candidate that
fails is ineligible regardless of size or speed.

For eligible candidates, compare:

- whether expected failures and cleanup ownership are visible at the call site;
- how many library concepts a maintainer must learn;
- how many manual delivery guards remain;
- how localized an equivalent change is;
- compiler diagnostic clarity;
- bundle and type-check cost.

There is no aggregate numeric winner because arbitrary weights would disguise
the owner's priorities. The result presents evidence and explicit trade-offs for
human selection.

### 7. Keep dependencies temporary and production-neutral

Use exact stable versions verified from the registry at implementation time.
Add them as development dependencies because only experimental/showcase builds
consume them. Node entry points and production `picker.html` must not contain
candidate imports. Before any later merge, either remove all comparison code and
dependencies or retain only the explicitly selected production model under a
separately reviewed release decision.

## Risks / Trade-offs

- [The two-package stack is penalized automatically] -> report package count but
  decide on total clarity and cost, not dependency count alone.
- [The lifecycle inherently favors Effect] -> require the same manual host-
  delivery guards and score only cleanup/error composition it actually removes.
- [The showcase bundle hides candidate cost] -> build each candidate separately
  for measurements; never compare the combined showcase artifact.
- [Benchmark noise creates a false winner] -> use repeated warm medians, record
  environment, and treat small differences as ties.
- [Experiment code leaks into production] -> retain the existing production
  artifact guard and add explicit forbidden-marker/import assertions.
- [The draft becomes permanent dual architecture] -> keep it draft and require
  an explicit selection/removal slice before merge.

## Migration Plan

1. Reconcile PR #36 with the merged UI baseline and add shared failing
   characterization tests for the comparison contract.
2. Implement the `fp-ts` and `Remeda + Effect` candidates against the same tests.
3. Add the development showcase controls and candidate-isolated builds.
4. Run repeated measurements and record the side-by-side code, behavior, costs,
   strengths, and weaknesses.
5. Push the draft proof of concept for owner review. Do not switch production,
   version, merge, release, deploy, or archive the change.

Rollback is deletion of development-only comparison files and dependencies; the
native production picker is unchanged throughout.
