# Dependency Landscape

This document tracks dependencies that may materially improve the repository.
An adoption rating records intent, not approval to install: each dependency
still needs a small, evidence-backed use case and the normal verification gate.

| Dependency | Purpose | Adoption | Current status | Adoption gate |
| --- | --- | --- | --- | --- |
| React / React DOM 19.2.3 | Declarative Nemlig visual rendering | Adopted for product viewer | Build-only; `dist/picker.html` is the packaged and registered v8 MCP resource | Keep browser dependencies out of the Node runtime; preserve behavior coverage in the built-artifact synthetic host smoke |
| MCP ext-apps 2.0.3 | MCP Apps iframe protocol lifecycle and React host/result hooks | Adopted for product viewer | `useApp` owns host connection, result/cancel callbacks, tool actions, and SDK auto-resize; no extra resize observer | Preserve explicit activation and fail-closed behavior across reconnect, stale, foreign, and malformed host results |
| `@openai/apps-sdk-ui` 0.2.2 / Tailwind 4.1.18 | ChatGPT controls, status badges, empty state, and host design tokens | Adopted for product viewer | Build-only; viewer uses `Button`, `Badge`, and `EmptyMessage`; styling is bundled into the single HTML resource | Keep host theme variables with system fallbacks and keep the current CSP/network boundary |
| Vite 7.3.6 / React plugin 5.2.0 / single-file plugin 2.3.3 | Build React viewer as self-contained HTML | Adopted for browser resource | Vite emits `dist/picker.html` after tsdown cleans/builds Node artifacts; package smoke reads this same asset | No external executable/styles/chunks; version the MCP resource URI when behavior or code changes |
| tsdown 0.22.14 | Compile the Node CLI, MCP, and HTTP entry points | Retained for Node builds | Browser CSS/IIFE work was removed from tsdown | Reassess only when one supported tool can replace both pipelines without custom assembly |
| Native TypeScript | Readonly data transformations, discriminated unions, explicit Promise/resource handling | Baseline | Already used; no new dependency | Remains the fallback unless a candidate demonstrates a measured maintenance improvement |
| [Effect](https://effect.website/) | Structured lifetime for basket-aware batch product discovery | Adopted at one server boundary | Stable 3.22.2 coordinates the basket read and at most three catalogue reads; plain TypeScript remains the default elsewhere | Keep it scoped to planning reads and retain only while fatal queue-stop, cancellation, and quiescence remain simpler than a native replacement; it is not part of the picker |
| [neverthrow](https://github.com/supermacro/neverthrow) | Focused Result and ResultAsync expected-error composition | Conditional | Not installed | Consider only when typed expected failures are the demonstrated need and cleanup remains clear |
| [ts-pattern](https://github.com/gvergnaud/ts-pattern) | Exhaustive structured pattern matching | Conditional | Not installed | Consider only when real branching is clearer than a native discriminated-union switch and type-check cost is acceptable |
| Effect Micro | Smaller Effect-style runtime | Deferred | Current v3 documentation marks it experimental; not installed | Reconsider only after stable support and a measured need; do not adopt in the current comparison |

## Nemlig UI evidence

- All browser packages are MIT-licensed and exactly pinned. They remain development dependencies; the packed Node runtime does not install them.
- Resource `ui://nemlig/product-viewer-v8.html` serves the self-contained React viewer. The previous v7 URI remains in the retired-resource inventory.
- The browser smoke drives the built asset through a synthetic MCP Apps host and fake product data. It checks activation, local review actions, alternatives, quantity flush, exact prepare/confirm/submit boundaries, uncertainty, remount, foreign snapshots, and stale recovery without provider writes.
- The package build includes the single HTML asset beside the Node MCP server. The MCP server reads the built file rather than assembling or rewriting browser output.
- Current raw/gzip size and timing should be refreshed from the latest benchmark run; older candidate artifact numbers and maintained-host acceptance describe earlier code and are historical only.

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
