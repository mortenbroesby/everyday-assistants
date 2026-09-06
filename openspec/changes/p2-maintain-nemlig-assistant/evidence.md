# Refactor evidence

## Baseline

- Base: `origin/main` at `3136ac1e527e70da92e5739f4faea70cc05137f6`; it is an ancestor of the cleanup branch.
- Planning head: `0eb84c650c66a66bde7a0ca9eb421b768311c31e`; worktree clean before apply.
- Size: 6,963 production TypeScript lines and 5,147 test TypeScript lines under `src`, `scripts`, and `release`.
- Dependencies: `pnpm install --frozen-lockfile` completed without tracked manifest or lockfile changes.
- Baseline gates: `pnpm verify` passed with 174 tests; `pnpm nemlig:production:ready` passed strict OpenSpec validation, privacy checks, verification, packed-package smoke, and the credential-free Wrangler production dry run.
- External state: no deployment, Cloudflare/provider mutation, basket mutation, or credential access occurred.

## Fixed invariants

- Preserve every CLI, MCP, package, authentication, tier, proposal, basket, storage, and Cloudflare contract.
- Preserve prepare/review/apply, connection binding, expiry, fresh product revalidation, basket fingerprinting, sequential provider operations, no mutation retry, and final readback.
- Preserve authentication before Container wake, unknown-principal fail-closed behavior, one Container, quotas, rate limits, circuit breaker, hard ceilings, bounded retries/timeouts, kill switch, and post-class `outboundByHost` registration.
- Add no dependency, service, storage, concurrency, retry, logging volume, provider request, or production capacity.

## Slice results

Each slice records its doubts, characterization evidence, production/test line delta, request/cost effect, and deliberately skipped abstractions here before integration.

### Leaf deletion and type deduplication

- Doubts resolved: repository-wide reference and package-export searches proved `MAX_RESOLVED_LIST_LINES` and `ownerScopeFor` unused outside internal/test callers; all duplicate same-source imports were enumerated; existing client tests characterize cached/fresh lookup and provider request counts.
- Changes: removed the dead constant, redundant scope alias, discarded network-failure bookkeeping, repeated description bounding, and duplicate candidate shape; merged duplicate imports; documented cached versus fresh product lookup.
- Verification: 61 focused tests, complete 174-test package suite, typecheck, lint, build, and `git diff --check` passed. Package exports do not expose the removed names; the build emits JavaScript/source maps rather than declarations.
- Delta: production `+34/-42` (net `-8`); tests `+6/-10` (net `-4`); total net `-12` lines. Dependencies and provider request counts unchanged.
- Skipped: no utility, type factory, registry, dependency, file split, or blanket documentation was added.
- External state: no provider, basket, credential, Cloudflare, or deployment action occurred.

### Shopping-plan resolution

- Doubts resolved before production edit: 14 planner characterization tests proved full preference/ID ordering, input-line order, duplicate basket aggregation, mixed summary counters, exact provider call envelope, and one-read propagation of basket transport failure.
- Changes: aggregate basket quantities once in a local `Map` and reuse them for every selected line; document the hard-constraint ordering and read-only resolution contracts.
- Verification: characterization suite passed before production edits; afterwards planner/proposal tests passed `29/29`, planner tests passed `14/14`, and typecheck, lint, and `git diff --check` passed.
- Delta: production `+16/-1` (net `+15`) and tests `+64/-0`. The non-negative slice is justified by explicit safety characterization, contract TSDoc, and CPU reduction from `O(plan lines × basket lines)` to `O(plan lines + basket lines)`.
- Requests/cost: one basket read, bounded catalogue concurrency, request ordering/count, retries, storage, and external cost are unchanged.
- Skipped: no helper abstraction or unrelated dense-expression rewrite was added because neither produced a smaller, clearer safe change.
- External state: no provider, basket, credential, Cloudflare, or deployment action occurred.
