# Dependency Landscape

This document tracks dependencies that may materially improve the repository.
An adoption rating records intent, not approval to install: each dependency
still needs a small, evidence-backed use case and the normal verification gate.

| Dependency | Purpose | Adoption | Current status | Adoption gate |
| --- | --- | --- | --- | --- |
| React / React DOM 19.2.3 | Declarative Nemlig visual rendering | Candidate evaluation | Build-only; a separate read-only artifact in `.candidate-dist/`, not served to users or packed | Keep the current production viewer until review-action parity, host acceptance, and measured comparison are complete |
| MCP ext-apps 2.0.3 | MCP Apps iframe protocol lifecycle and React host/result hooks | Candidate evaluation | Build-only; `useApp` owns candidate initialization and tool-result subscription; current production viewer retains its existing bridge | Use SDK lifecycle and tool APIs in the candidate; prove host compatibility before any resource migration |
| Vite 7.3.6 / React plugin 5.2.0 / single-file plugin 2.3.3 | Build the isolated React candidate as self-contained HTML | Candidate evaluation | Build-only; separate from tsdown's Node artifacts and ignored by the package | Keep one candidate entry and no external chunks/assets; promote only through a separately reviewed resource version |
| tsdown 0.22.14 | Compile the Node CLI, MCP, and HTTP entry points | Retained for Node builds | Browser CSS/IIFE work was removed from tsdown | Reassess only when one supported tool can replace both pipelines without custom assembly |
| Native TypeScript | Readonly data transformations, discriminated unions, explicit Promise/resource handling | Baseline | Already used; no new dependency | Remains the fallback unless a candidate demonstrates a measured maintenance improvement |
| [Effect](https://effect.website/) | Structured lifetime for basket-aware batch product discovery | Adopted at one server boundary | Stable 3.22.2 coordinates the basket read and at most three catalogue reads; plain TypeScript remains the default elsewhere | Keep it scoped to planning reads and retain only while fatal queue-stop, cancellation, and quiescence remain simpler than a native replacement; it is not part of the picker |
| [neverthrow](https://github.com/supermacro/neverthrow) | Focused Result and ResultAsync expected-error composition | Conditional | Not installed | Consider only when typed expected failures are the demonstrated need and cleanup remains clear |
| [ts-pattern](https://github.com/gvergnaud/ts-pattern) | Exhaustive structured pattern matching | Conditional | Not installed | Consider only when real branching is clearer than a native discriminated-union switch and type-check cost is acceptable |
| Effect Micro | Smaller Effect-style runtime | Deferred | Current v3 documentation marks it experimental; not installed | Reconsider only after stable support and a measured need; do not adopt in the current comparison |

## Nemlig UI evidence

- All browser packages are MIT-licensed and exactly pinned. They remain development dependencies; the packed Node runtime does not install them.
- The current production resource is the versioned, self-contained imperative viewer in `src/product-viewer.ts`; it retains local review actions and the MCP host bridge.
- The React candidate restores the removed Vite/single-file approach and responsive product-card foundation, but currently supports product-list and read-only basket rendering only. It has no provider calls, tool actions, or resource registration.
- The `benchmark:ui` label workflow builds and browser-smokes the candidate, then compares the candidate and current renderer against the same synthetic products. It blocks external requests and reports timing as advisory evidence, not a promotion gate.
- The former React artifact measurements and maintained-host acceptance describe the pre-reset implementation. They are historical evidence, not measurements of this candidate or the current production viewer.

## Comparison notes

- As checked on 2026-09-12, npm labels Effect 3.22.2 as `latest` and 4.0.0-rc.115 as `rc`; the upstream Effect agent skill targets `effect@rc`. That instruction alone is not a reason to adopt a prerelease.
- `p-limit` and `p-map` were rejected for this coordinator: limiting mapper concurrency does not by itself compose cancellation, stop queued work on every fatal sibling failure, or join interrupted reads before return.
- Any selected package belongs to `apps/nemlig-assistant`; classify it according to the verified artifact path. Browser-only code may be a build dependency when the packed runtime consumes only the emitted HTML, but it must never remain an unresolved browser import.
- Compare one real pure-data case and one real async/resource boundary. Keep existing safety checks, quotas, kill switches, and effectful boundaries intact.
- Prefer one coherent dependency model. Candidate spikes are temporary; remove every rejected package and implementation.
- Fewer production lines are useful evidence, but composition, explicit error/resource contracts, reviewer comprehension, migration cost, type-check cost, and emitted browser bytes decide adoption together.
- The retired picker comparison is preserved as a concise
  [decision record](./picker-functional-comparison.md) pointing to closed PR
  #36. The active evaluation is the server-side product-discovery coordinator.
