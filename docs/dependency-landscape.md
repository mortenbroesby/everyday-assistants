# Dependency Landscape

This document tracks dependencies that may materially improve the repository.
An adoption rating records intent, not approval to install: each dependency
still needs a small, evidence-backed use case and the normal verification gate.

| Dependency | Purpose | Adoption | Current status | Adoption gate |
| --- | --- | --- | --- | --- |
| [Effect](https://effect.website/) | Typed errors, effect composition, resource lifecycles, concurrency, retries, and dependency management for TypeScript | High chance of adoption | Candidate reviewed; local value not yet demonstrated; not installed | Prove value on one real effectful boundary, choose a production-ready version deliberately, and confirm that the runtime and maintenance cost are justified |

## Effect notes

- As checked on 2026-09-12, npm labels Effect 3.22.2 as `latest` and 4.0.0-rc.115 as `rc`; the upstream Effect agent skill targets `effect@rc`. That instruction alone is not a reason to adopt a prerelease.
- If adopted by `apps/nemlig-assistant`, Effect belongs in that app's runtime dependencies, not as a root-only development dependency.
- Start with one bounded spike. Keep existing safety checks, quotas, kill switches, and effectful boundaries intact.
- Prefer native TypeScript for ordinary mapping, filtering, validation, and small result types; Effect should earn its place on lifecycle, concurrency, retry, or typed-error complexity.
