## Context

See [proposal.md](proposal.md) for motivation. This draft is stacked on `adopt-react-picker`, which owns observable picker behavior and supplies the chosen UI, native functional baseline, host lifecycle, and fake-host tests. This change has `skip_specs: true` and must not weaken that contract.

The picker has two relevant jobs: transform validated proposal data into a view model, then own one MCP Apps `App` through result registration, connection, deliberate message send, replacement, and disposal. The pure job is currently small; the lifecycle still requires explicit stale-state protection because cancelling a local computation cannot retract a delivered host message or necessarily cancel an SDK Promise.

Registry versions checked on 2026-09-12 were Effect 3.22.2, fp-ts 2.16.11, Remeda 2.48.0, neverthrow 8.2.0, and ts-pattern 5.9.0. Effect 4 remained an RC. Version recency is maintenance evidence, not proof of fit.

## Goals / Non-Goals

**Goals:**

- Compare functional approaches on both the real pure core and asynchronous boundary.
- Prefer one coherent long-term model over overlapping utilities.
- Preserve plain data at the UI boundary and one lifecycle owner.

**Non-Goals:**

- No generic FP platform, repository-wide conversion, layer graph, service interface, factory, schema replacement, server migration, or second host owner.
- No behavioral, rendering, payload, packaging, CSP, message, retry, proposal, or basket change.

## Decisions

### 1. Compare candidates by role, not as false whole-stack substitutes

Use one representative validated proposal to derive rejected items, safe images, proposed products, and available alternatives; use one fake-host lifecycle for callback-before-connect, send success/failure, duplicate activation, result replacement, disposal, remount, and stale completion.

| Candidate | Pure transformations | Async/resource boundary | Decision |
| --- | --- | --- | --- |
| Native TypeScript | Readonly inputs, arrays, `Map`, discriminated unions, exhaustive `never` | Promises, explicit cleanup and stale guards | Required baseline and fallback. |
| fp-ts | `Option`, `Either`, `ReadonlyArray`, composition | `TaskEither`/`ReaderTaskEither` and `bracket`; host cancellation and stale delivery still explicit | Give an equivalent candidate, but do not prefer it for new long-term adoption because its project identifies Effect as successor. |
| Effect pure modules | `Array`, `Option`, `Either`, `Match` without running an Effect program | None until runtime APIs are used | Compare separately from the runtime. |
| Effect runtime | Can connect deterministic and effectful composition | Typed failures, scopes, finalizers, interruption | Preferred integrated ecosystem candidate, subject to measured proof. |
| Remeda | Pragmatic typed collection pipelines | No resource lifecycle | Strongest lightweight pure-core challenger. |
| neverthrow | Focused `Result` composition | `ResultAsync`, but cleanup/cancellation remain external | Evaluate only if expected failures are the demonstrated problem. |
| ts-pattern | Exhaustive structured matching | No resource lifecycle | Evaluate only if actual branching beats a native discriminated-union switch. |

Effect Micro is comparison research only: current Effect v3 documentation marks it experimental. Do not install or select it under the stable-dependency constraint. Do not add another candidate unless new primary evidence exposes a capability gap in this table.

Sources: [fp-ts project direction](https://github.com/gcanti/fp-ts), [fp-ts TaskEither bracket](https://gcanti.github.io/fp-ts/modules/TaskEither.ts.html), [Effect scopes](https://effect.website/docs/v3/resource-management/scope), [Effect Micro status](https://effect.website/docs/v3/micro/new-users), [Remeda](https://github.com/remeda/remeda), [neverthrow](https://github.com/supermacro/neverthrow), and [ts-pattern](https://github.com/gvergnaud/ts-pattern).

### 2. Native code is the required shipping baseline

Do not compare candidates against the old minified document. Identify the exact verified UI commit and run all candidates against the same plain inputs, outputs, SDK cohort, TypeScript configuration, bundler settings, and tests. Candidate packages remain temporary until the decision.

The pure comparison may use each library's natural API, but it must not manufacture complexity or widen into safety-sensitive proposal/application code. The async comparison must preserve the same explicit message-delivery and stale-result semantics.

### 3. Adoption measures maintainability, not only line count

Select a dependency only when behavior and safety remain green; it demonstrates a concrete improvement in composition, expected-error handling, resource ownership, or change comprehension; measured browser output and type-check cost stay within the project's recorded budgets; and one coherent model remains.

Record concepts a maintainer must learn, inference/diagnostic quality, migration direction, remaining manual guards, and production code changed. Fewer lines help but cannot overrule clearer contracts or long-term consistency. If separate narrow packages would overlap, prefer the single candidate covering the demonstrated needs or native TypeScript.

### 4. Stable Effect 3 is the leading integrated candidate, not a foregone conclusion

If Effect wins, use the exact tested stable 3.x release and only the pure modules/runtime APIs demonstrated by the comparison. One scope may own construction, callback registration, connection, deliberate sends, failure mapping, and finalization. No `@effect/platform`, Effect Schema, layer/service hierarchy, retry schedule, polling fiber, or reconnect loop.

If Remeda or neverthrow wins a narrow need while native lifecycle code remains clearer, adopt only that narrow library. If no dependency materially improves the cases, retain native TypeScript and record the rejection. Never keep multiple candidates for speculative future use.

### 5. Preserve SDK, package, and safety boundaries

React or Preact consumes plain state/callbacks and does not create a second `App`. Pending state blocks duplicate sends; failure permits only a later deliberate retry. Interruption or disposal closes/invalidates local work but never claims to retract a delivered message.

The selected dependency is browser-only and bundled into the self-contained picker. Node entry points do not import it. No CSP, resource, tool, authorization, provider, or deployment permission changes. The dependency landscape records version, measured artifact/type-check delta, APIs used, and decision.

## Risks / Trade-offs

- [The lifecycle biases the result toward Effect] -> Score the pure core independently and give fp-ts an equivalent lifecycle candidate.
- [Narrow libraries are rejected for not being runtimes] -> Evaluate Remeda, neverthrow, and ts-pattern only against their documented roles.
- [Several attractive candidates survive] -> Keep one coherent model or native TypeScript; delete every rejected package and spike.
- [Type complexity shifts cost to builds/reviewers] -> Record diagnostics, type-check time, required concepts, and comprehension feedback.
- [Cancellation is mistaken for delivery rollback] -> Preserve explicit pending and stale-generation guards where the SDK cannot cancel.
- [The stacked branch drifts] -> Merge UI first, then rebase onto its exact integrated `origin/main` revision.

## Migration Plan

1. Identify the verified UI baseline and record native pure-core, lifecycle, bundle, and type-check evidence.
2. Implement bounded equivalent candidates without changing the production call site.
3. Apply the role-specific and integrated decision matrix; record one selection and delete all rejected code/dependencies.
4. Switch only the selected pure/lifecycle call sites, then run focused, package, privacy, and repository checks.
5. Rebase or retarget after UI merges, make a separate release/version decision, and integrate through the protected ruleset.
6. Roll back the dependency to native TypeScript; use `NEMLIG_MCP_APPS` only as emergency UI fallback. No data migration is required.
