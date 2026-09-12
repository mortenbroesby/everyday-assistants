# Dependency Landscape

This document tracks dependencies that may materially improve the repository.
An adoption rating records intent, not approval to install: each dependency
still needs a small, evidence-backed use case and the normal verification gate.

| Dependency | Purpose | Adoption | Current status | Adoption gate |
| --- | --- | --- | --- | --- |
| React / React DOM 19.2.3 | Declarative picker rendering and lifecycle | Adopted for picker MVP | Build-time only; bundled into the self-contained MCP Apps resource | Keep the picker to one root and shared card; add routing or state libraries only for a measured need |
| OpenAI Apps SDK UI 0.2.2 | OpenAI-aligned controls and tokens | Adopted for picker MVP | Build-time only; `Button` and `Badge` are bundled | Reassess when the SDK publishes a compatible upgrade or the picker needs another proven control |
| Tailwind CSS / CLI 4.1.18 | Compile Apps SDK UI and minimal picker layout CSS | Adopted for picker MVP | Build-time only; no runtime CDN or stylesheet request | Keep authored CSS picker-specific; do not grow a local design system |
| MCP ext-apps 1.7.5 | MCP Apps host handshake, messages, theme, and resize lifecycle | Adopted for picker MVP | Build-time only; bundled into the picker | Keep one direct `App` owner until a framework helper demonstrably reduces lifecycle code |
| tsdown CSS 0.22.14 | Emit CSS imported by the browser bundle | Adopted for picker build | Build-time only; version matches existing tsdown | Remove if tsdown later emits the required CSS without the plugin |
| [Effect](https://effect.website/) | Typed errors, effect composition, resource lifecycles, concurrency, retries, and dependency management for TypeScript | High chance of adoption | Candidate reviewed; local value not yet demonstrated; not installed | Prove value on one real effectful boundary, choose a production-ready version deliberately, and confirm that the runtime and maintenance cost are justified |

## Picker MVP evidence

- All new packages are MIT-licensed and pinned. Browser inputs remain development dependencies; the packed Node runtime does not install them.
- The self-contained artifact is 751,268 bytes raw and 181,996 bytes gzip. Before inlining and unused font removal, JavaScript contributes 635,208 bytes and emitted CSS contributes 119,117 bytes.
- Two clean builds produced SHA-256 `5d77b50bf9e0da3eae6467d760ad8d2da9f1a62fd0e8078dc1ff79b1db25804f`.
- The artifact contains no remote executable, stylesheet, or font reference. Its CSP retains only the two approved Nemlig image origins.
- Twenty local result-to-render observations in the Codex Chromium host at 320 px measured 18.8 ms p95 and 36.4 ms maximum. A separate dark-theme check at 200% text size had no horizontal overflow (309 px content in a 320 px viewport).
- The 1.5 MiB raw and 350 KiB gzip limits are project budgets. No authoritative OpenAI host-size ceiling was found, so the measured browser smoke test remains the compatibility proof.

## Effect notes

- As checked on 2026-09-12, npm labels Effect 3.22.2 as `latest` and 4.0.0-rc.115 as `rc`; the upstream Effect agent skill targets `effect@rc`. That instruction alone is not a reason to adopt a prerelease.
- If adopted by `apps/nemlig-assistant`, Effect belongs in that app's runtime dependencies, not as a root-only development dependency.
- Start with one bounded spike. Keep existing safety checks, quotas, kill switches, and effectful boundaries intact.
- Prefer native TypeScript for ordinary mapping, filtering, validation, and small result types; Effect should earn its place on lifecycle, concurrency, retry, or typed-error complexity.
