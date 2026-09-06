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
