## Why

The current Nemlig runtime has a small amount of proven dead code and three duplicated implementation paths whose safety-sensitive behavior is already characterized. Consolidating only those paths will reduce maintenance burden without changing user-visible behavior, broadening authorization, or introducing another dependency or framework.

## What Changes

- Delete the unreferenced `principal-scope.ts` module after re-verifying that it has no callers or build entrypoint.
- Consolidate the two production-acceptance total-deadline closures while preserving their distinct error context and one shared bounded deadline.
- Consolidate the duplicated Cloudflare admin-control execution path while leaving route selection, method checks, dependency checks, Tier-0 authorization, deadlines, and response mapping in their current order.
- Consolidate the exact non-retrying `AddToBasket` write primitive shared by add and exact-line removal while retaining validation, pre-read, post-read verification, and clear-basket behavior at their existing boundaries.
- Add or retain focused characterization coverage for each refactored path, then run the repository verification gate.
- Explicitly skip a generic MCP tool registry, a readability-only product-normalization extraction, GoF pattern adoption, and new functional-programming dependencies because the audit found no demonstrated benefit.

### Goal

Make the smallest evidence-backed reduction in duplicated Nemlig runtime code while preserving all observable behavior and every existing security, authorization, quota, retry, deadline, and mutation invariant.

### Non-goals

- Changing APIs, protocol schemas, product normalization, user-visible behavior, or production configuration.
- Changing retry policy, timeout values, authentication ordering, mutation authority, quotas, circuit breakers, kill switches, or provider request frequency.
- Refactoring MCP registrations, onboarding, HTTP identity, policy loading, picker UI/comparison code, planning code, dependency manifests, lockfiles, release workflows, or other files owned by active sibling work.
- Introducing a functional-programming library, general-purpose abstraction, registry, framework, or GoF pattern.
- Deploying or mutating Nemlig basket, account, proposal, or other external state.

### Acceptance criteria

- The dead module has no references or build-entry role immediately before deletion.
- Existing behavior-focused tests remain green, with focused cases covering both production-acceptance operations, both admin-control operations, and add/remove basket semantics.
- Provider writes remain single-attempt; removing an absent product performs no write; successful mutations still read back; exact-line removal still fails if that product remains.
- Admin controls retain Tier-0 authorization and method/dependency checks before bounded backend work, with unchanged 502/504 and terminal-event behavior.
- Production acceptance retains one total deadline and the current operation-specific error messages.
- No runtime or development dependency is added, and the resulting production code is smaller overall.
- `pnpm verify`, strict OpenSpec validation, branch push, protected squash merge, and exact-main CI succeed before completion is claimed.

## Capabilities

### New Capabilities

None. This is a behavior-preserving refactor.

### Modified Capabilities

None. Existing requirements and externally observable behavior remain unchanged, so this change opts out of delta specs.

## Impact

- Primary implementation scope: `apps/nemlig-assistant/src/principal-scope.ts`, `production-acceptance.ts`, `cloudflare-gateway.ts`, and `client.ts`, plus their focused tests only when characterization needs strengthening.
- No API, schema, dependency, storage, provider, production, cost-model, or deployment change is intended.
- Delivery boundary: branch `codex/heavy-refactor`, one pull request, and this single OpenSpec change. Active sibling Effect work retains exclusive ownership of planning, picker comparison, dependency manifest, lockfile, and dependency-landscape paths until it is settled.
