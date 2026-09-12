# Picker Functional Comparison

This proof of concept compares two ways to implement the same picker display
transformation and host-message lifecycle:

- **fp-ts:** `ReadonlyArray`, `Option`, `Either`, and `TaskEither` from one
  functional-programming package.
- **Remeda + Effect:** Remeda for plain data transformations and Effect for
  typed failures and scoped lifecycle cleanup.

Native TypeScript remains the production implementation and shared reference.
This experiment does not select or ship either candidate.

## Correctness gate

Both candidates consume the same plain `PickerPayload`, return the same plain
display model, and run against one candidate-neutral fake host. Each passes all
eight shared cases:

1. display-model derivation;
2. successful delivery;
3. expected host failure;
4. duplicate selection suppression;
5. replacement selection;
6. stale completion suppression;
7. disposal; and
8. remount after disposal.

Correctness is a pass/fail gate. The comparison intentionally has no aggregate
score that could hide a behavioral failure.

## Reproduce the measurements

From the repository root, after a frozen install:

```sh
pnpm --filter nemlig-assistant compare:picker
```

The command runs 25 lifecycle repetitions, three isolated Vite builds, and five
candidate-specific TypeScript checks per candidate. It writes ignored raw data
to `apps/nemlig-assistant/.comparison/results.json`.

The following measurements were recorded on 2026-09-12 using macOS x64, Node
22.23.1, TypeScript 5.9.3, and the repository's pinned pnpm 9.15.9. Timings are
local diagnostics, not claims about every machine or production throughput.

| Evidence | fp-ts 2.16.11 | Remeda 2.48.0 + Effect 3.22.2 |
| --- | ---: | ---: |
| Shared behavior cases | 8 / 8 | 8 / 8 |
| Isolated browser bundle, raw | 123,264 B | 302,872 B |
| Isolated browser bundle, gzip | 28,914 B | 73,878 B |
| Vite build median, 3 runs | 3,600.58 ms | 4,168.09 ms |
| Candidate TypeScript check median, 5 runs | 4,182.08 ms | 3,202.70 ms |
| Local lifecycle scenario median, 25 runs | 0.0097 ms | 0.1100 ms |
| Candidate implementation lines | 84 | 81 |
| Direct packages | 1 | 2 |

Bundle measurements use the same minified ES target and candidate-isolated
entry shape. They are deliberately separate from the production picker bundle.
The scenario timing is too small and synthetic to represent user-perceived
latency; it is retained only as a reproducible local runtime diagnostic.

## What the code revealed

### fp-ts

Pros:

- One dependency supplies the immutable transformations and typed async error
  flow, giving the candidate a consistent vocabulary.
- It produces the smaller isolated browser bundle in this comparison.
- `TaskEither` makes the expected host failure explicit without a runtime
  framework.

Cons:

- Resource disposal remains an explicit application concern; the candidate
  must maintain `active`, `pending`, and `generation` delivery guards itself.
- The API distinguishes ordinary mapping from indexed mapping. The shared test
  caught an initial use of `ReadonlyArray.map` where `mapWithIndex` was needed,
  demonstrating a real review/learning hazard.
- Its higher-kinded functional vocabulary is less familiar than ordinary
  TypeScript and can make small transformations harder to scan.

### Remeda + Effect

Pros:

- Remeda keeps display-model transformations close to ordinary TypeScript and
  returns plain data without Effect types leaking into the UI contract.
- Effect provides an explicit `Scope` and finalizer for lifecycle cleanup plus
  typed expected failures.
- It produced the faster candidate-specific TypeScript-check median here.

Cons:

- It needs two packages and produces the larger isolated browser bundle in this
  comparison.
- Reviewers must understand both Remeda pipelines and Effect's runtime,
  scope, exit, and error concepts.
- Scope cancellation cannot retract an already delivered host message. The
  implementation still needs the same `active`, `pending`, and `generation`
  guards, so Effect does not eliminate the key host-boundary state.

## Selection guidance

Choose **fp-ts** if one coherent functional vocabulary and lower browser cost
matter more than built-in resource scopes. Choose **Remeda + Effect** if plain
data transformations and explicit lifecycle ownership justify the extra
runtime and conceptual surface.

For this narrow picker boundary, neither candidate removes the manual delivery
guards that enforce observable correctness. Code readability and the expected
future complexity of resource ownership should therefore drive the owner's
choice more than the synthetic timing result. Until that choice is made,
production should remain on native TypeScript and this PR should remain a draft.
