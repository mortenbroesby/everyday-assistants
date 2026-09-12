# Dependency Landscape

This document tracks dependencies that may materially improve the repository.
An adoption rating records intent, not approval to install: each dependency
still needs a small, evidence-backed use case and the normal verification gate.

| Dependency | Purpose | Adoption | Current status | Adoption gate |
| --- | --- | --- | --- | --- |
| React / React DOM 19.2.3 | Declarative Nemlig visual rendering | Adopted for the Nemlig UI foundation | Build-time only; bundled into the self-contained MCP Apps resource | Keep one root per resource; add routing or state libraries only for a measured need |
| OpenAI Apps SDK UI 0.2.2 | OpenAI-aligned controls, tokens, and stylesheet | Adopted for the Nemlig UI foundation | Build-time only; `Button` and `Badge` are bundled | Reuse the shared foundation and local design showcase before adding another visual interaction |
| Tailwind CSS / Vite plugin 4.1.18 | Compile Apps SDK UI and the small shared stylesheet | Adopted for browser builds | Build-time only; replaces the separate Tailwind CLI stage | Keep authored CSS limited to shared layout and proven presentation needs |
| MCP ext-apps 1.7.5 | MCP Apps host handshake, messages, styling, fonts, safe areas, and resize lifecycle | Adopted for the Nemlig UI foundation | Build-time only; official React hooks are bundled into the picker | Retain one host owner and executable cleanup/remount coverage until a compatible protocol upgrade is separately proven |
| Vite 7.3.6 / React plugin 5.2.0 / single-file plugin 2.3.3 | Supported browser HTML, React, and self-contained resource build | Adopted for browser builds | Build-time only; tsdown remains the Node bundler | Keep one real HTML entry and no post-build asset mutation; upgrade the pinned cohort together |
| tsdown 0.22.14 | Compile the Node CLI, MCP, and HTTP entry points | Retained for Node builds | Browser CSS/IIFE work was removed from tsdown | Reassess only when one supported tool can replace both pipelines without custom assembly |
| Native TypeScript | Readonly data transformations, discriminated unions, explicit Promise/resource handling | Baseline | Already used; no new dependency | Remains the fallback unless a candidate demonstrates a measured maintenance improvement |
| [Effect](https://effect.website/) | Typed failures and scoped resource lifecycles | Proof-of-concept candidate | Stable 3.22.2 is pinned as a development-only comparison dependency; not used in production | Select with Remeda only if explicit lifecycle ownership justifies the larger measured browser/runtime and conceptual surface |
| [fp-ts](https://github.com/gcanti/fp-ts) | Immutable transformations and `TaskEither` lifecycle flow | Proof-of-concept candidate | Stable 2.16.11 is pinned as a development-only comparison dependency; passes the shared picker contract | Select only if its coherent vocabulary and smaller measured browser bundle outweigh manual cleanup and reviewer learning cost |
| [Remeda](https://github.com/remeda/remeda) | TypeScript-first collection and object pipelines | Proof-of-concept candidate | Stable 2.48.0 is paired with Effect in development only; returns the shared plain display model | Select with Effect only if the plain transformation style is clearer enough to justify a second package |
| [neverthrow](https://github.com/supermacro/neverthrow) | Focused Result and ResultAsync expected-error composition | Conditional | Not installed | Consider only when typed expected failures are the demonstrated need and cleanup remains clear |
| [ts-pattern](https://github.com/gvergnaud/ts-pattern) | Exhaustive structured pattern matching | Conditional | Not installed | Consider only when real branching is clearer than a native discriminated-union switch and type-check cost is acceptable |
| Effect Micro | Smaller Effect-style runtime | Deferred | Current v3 documentation marks it experimental; not installed | Reconsider only after stable support and a measured need; do not adopt in the current comparison |

## Production Nemlig UI evidence

- All browser packages are MIT-licensed and exactly pinned. They remain development dependencies; the packed Node runtime does not install them.
- The production self-contained artifact is 754,910 bytes raw and 186,920 bytes gzip. Two consecutive locked builds produced SHA-256 `383b925c337bfea15933d476c7de55167f0b052d9028e75e67ab4291c5287761`.
- Executable code and application styling are embedded. There is no external application script, stylesheet, dynamic JavaScript chunk, or API fetch. CSP permits only the two approved Nemlig image origins and the exact optional `https://cdn.openai.com` font origin.
- The local synthetic showcase reuses the production view for reviewed, sending, selected, loading, empty, and connection-error states. Browser inspection verified light/dark operation, 44 px actions, and a 320 px stage whose scroll width remains 320 px.
- The 1,500,000-byte raw and 350,000-byte gzip limits are project budgets. No authoritative OpenAI host-size ceiling was found, so built-artifact and maintained-host acceptance remain the compatibility proof.

## Comparison notes

- As checked on 2026-09-12, npm labels Effect 3.22.2 as `latest` and 4.0.0-rc.115 as `rc`; the upstream Effect agent skill targets `effect@rc`. That instruction alone is not a reason to adopt a prerelease.
- Any selected package belongs to `apps/nemlig-assistant`; classify it according to the verified artifact path. Browser-only code may be a build dependency when the packed runtime consumes only the emitted HTML, but it must never remain an unresolved browser import.
- Compare one real pure-data case and one real async/resource boundary. Keep existing safety checks, quotas, kill switches, and effectful boundaries intact.
- Prefer one coherent dependency model. Candidate spikes are temporary; remove every rejected package and implementation.
- Fewer production lines are useful evidence, but composition, explicit error/resource contracts, reviewer comprehension, migration cost, type-check cost, and emitted browser bytes decide adoption together.
- The reproducible picker comparison and measured tradeoffs are recorded in
  [`picker-functional-comparison.md`](./picker-functional-comparison.md). Both
  candidates pass the same eight behavior gates; neither has been selected for
  production.
