# Dependency Landscape

This document tracks dependencies that may materially improve the repository.
An adoption rating records intent, not approval to install: each dependency
still needs a small, evidence-backed use case and the normal verification gate.

| Dependency | Purpose | Adoption | Current status | Adoption gate |
| --- | --- | --- | --- | --- |
| React / React DOM 19.2.3 | Declarative Nemlig visual rendering | Adopted for product viewer | Build-only; hashed JS/CSS are loaded by the small packaged MCP shell from fixed-origin static assets | Keep browser dependencies out of the Node runtime; preserve behavior coverage in the stable-shell synthetic host smoke |
| MCP ext-apps 2.0.3 | MCP Apps iframe protocol lifecycle and React host/result hooks | Adopted for product viewer | `useApp` owns host connection, result/cancel callbacks, tool actions, and SDK auto-resize; no extra resize observer | Preserve explicit activation and fail-closed behavior across reconnect, stale, foreign, and malformed host results |
| Emotion 11.14 | Co-located typed React component styles for the picker | Adopted for product viewer | Viewer-local buttons, product presentation, factual disclosures and navigation use Emotion; no Apps SDK visual component kit or Tailwind is installed | Preserve host theme variables, semantic native controls, no user-supplied CSS values and the current CSP/network boundary |
| Vite 7.3.6 / React plugin 5.2.0 | Build React viewer bundle | Adopted for browser resource | Vite emits its build manifest; packaging verifies the one JS/CSS pair, adds content hashes and SRI, and writes under `dist/ui-static/ui/nemlig` | Reuse Vite's manifest and existing Zod/Node primitives; keep the stable shell and never hot-swap active cards |
| tsdown 0.22.14 | Compile the Node CLI, MCP, and HTTP entry points | Retained for Node builds | Browser CSS/IIFE work was removed from tsdown | Reassess only when one supported tool can replace both pipelines without custom assembly |
| Native TypeScript | Readonly data transformations, discriminated unions, explicit Promise/resource handling | Baseline | Already used; no new dependency | Remains the fallback unless a candidate demonstrates a measured maintenance improvement |
| [Effect](https://effect.website/) | Structured lifetime for basket-aware batch product discovery | Adopted at one server boundary | Stable 3.22.2 coordinates the basket read and at most three catalogue reads; plain TypeScript remains the default elsewhere | Keep it scoped to planning reads and retain only while fatal queue-stop, cancellation, and quiescence remain simpler than a native replacement; it is not part of the picker |
| [neverthrow](https://github.com/supermacro/neverthrow) | Focused Result and ResultAsync expected-error composition | Conditional | Not installed | Consider only when typed expected failures are the demonstrated need and cleanup remains clear |
| [ts-pattern](https://github.com/gvergnaud/ts-pattern) | Exhaustive structured pattern matching | Conditional | Not installed | Consider only when real branching is clearer than a native discriminated-union switch and type-check cost is acceptable |
| Effect Micro | Smaller Effect-style runtime | Deferred | Current v3 documentation marks it experimental; not installed | Reconsider only after stable support and a measured need; do not adopt in the current comparison |

## Nemlig UI evidence

- All browser packages are MIT-licensed and exactly pinned. They remain development dependencies; the packed Node runtime does not install them.
- Resource `ui://nemlig/shell.html` serves the stable React loader. Previous `draft-list.html` and product-viewer URIs, including the unversioned URI and v1-v16, are retained only as inert documents.
- The browser smoke drives the built asset through a synthetic MCP Apps host and fake product data. It checks activation, local review actions, alternatives, quantity flush, exact prepare/confirm/submit boundaries, uncertainty, remount, foreign snapshots, and stale recovery without provider writes.
- The package build includes the shell, manifest, and content-addressed assets beside the Node MCP server. The MCP server returns the shell; the existing Worker serves only those generated static assets without entering MCP. The existing deploy path validates and retains exactly one shell-era predecessor generation, and edge acceptance checks the public candidate assets.
- Paired benchmark evidence is from the successful [PR #193 benchmark run](https://github.com/mortenbroesby/everyday-assistants/actions/runs/37578315194), checked out at PR head `4fee6125e33e49603d76a04777481f6133e022c1`. It compared the pinned v7 HTML fixture from `6b42384028eb5dc9f0addb0b97acadcab1509404` with the built React v8 artifact.

| Measure | v7 | React v8 |
| --- | ---: | ---: |
| First contentful paint, median / p95 | 64 / 72 ms | 216 / 220 ms |
| First product DOM insertion, median / p95 | 36 / 43.6 ms | 171 / 180.7 ms |
| DOMContentLoaded, median / p95 | 47.7 / 61.5 ms | 148.4 / 154.7 ms |
| Resource artifact, raw / gzip | 41,966 / 11,150 B | 580,184 / 149,030 B |

The run used Google Chrome 155, five fresh browser contexts per renderer,
375×812 CSS pixels at DPR 2, and the same synthetic same-origin parent/iframe
host and child-frame timing path for both renderers. First product is measured
at DOM insertion, not paint. This is local synthetic evidence; it does not
establish native ChatGPT, mobile-network, or hosted acceptance. Task 9.5 remains
unchecked pending a separately approved release and native-host verification.

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
