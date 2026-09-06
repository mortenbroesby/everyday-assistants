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

### MCP failure handling

- Doubts resolved before production edit: the interface and smoke suites characterized the explicit tool/resource catalog, annotations, schemas, friendly and structured responses, picker boundary, and existing sanitized `NemligError` behavior. A new failing-first test proved generic provider error details must remain hidden.
- Changes: route identical tool-handler error boundaries through one private same-module `runMcpOperation`; keep every registration explicit; make the test-only picker HTML constant private and inspect it through the registered MCP resource; document request identity and server construction contracts.
- Verification: interface and smoke tests passed `28/28`; typecheck, lint, packed-package smoke, `git diff --check`, and the full `pnpm verify` gate passed with 178 tests. An independent read-only review found every operation label, synchronous/rejected failure boundary, registration, provider-call order, and mutation behavior preserved.
- Delta: production `+58/-94` (net `-36`); tests `+50/-29` (net `+21`); total net `-15` lines. Dependencies, network calls, retries, storage, concurrency, and external cost are unchanged.
- Skipped: no tool registry, compatibility export, new response type, dependency, or cross-module abstraction was added.
- External state: no provider, basket, credential, Cloudflare, or deployment action occurred.

### Proposal state transitions

- Doubts resolved before production edit: a new characterization test pinned provider sequencing and the exact `created → applying → completed → replayed`, `created → expired`, `created → invalidated`, and `created → applying → indeterminate` audit streams without identifiers or product data.
- Changes: consolidate five identical state-and-audit invalidations into one private method while retaining each exact caller-owned error message; document the same-run authorization and apply safety contracts.
- Verification: proposal characterization passed `16/16`; proposal, MCP interface, and production-acceptance tests passed `56/56`; typecheck, lint, `git diff --check`, full `pnpm verify` with 179 tests, and `pnpm nemlig:production:ready` passed.
- Delta: production `+20/-10` (net `+10`) and tests `+62/-0`. The retained documentation makes the security-critical sequencing, binding, single-use, fresh-revalidation, final-readback, and no-retry contracts explicit.
- Requests/cost: product revalidation and mutation remain sequential; calls, retries, storage, concurrency, and external cost are unchanged.
- Skipped: no transition table, state-machine class, response abstraction, persistence change, or retry mechanism was introduced.
- External state: no provider, basket, credential, Cloudflare, or deployment action occurred.

### Cloudflare admission

- Doubts resolved before production edit: existing focused coverage pins the kill switch before configuration/authentication, authentication and principal resolution before admission/Container wake, operation classification, tier/status mappings, quota and breaker behavior, timeouts, sanitized events, aggregate redaction, and post-class `outboundByHost` registration.
- Changes: remove the unused private `deny` timestamp argument and document the credential-header, gateway-stage, operation-classification, fail-closed forwarding, aggregate-usage, and atomic-admission contracts.
- Verification: focused Cloudflare configuration, gateway, usage, observability, HTTP, and acceptance tests passed `45/45`; typecheck, lint, `git diff --check`, full `pnpm verify` with 179 tests, packed-package smoke, privacy checks, strict OpenSpec validation, and the credential-free Wrangler production dry run passed.
- Delta: production `+14/-5` (net `+9`); tests unchanged. Dependencies, quotas, rates, breakers, limits, retries, storage, concurrency, Container capacity, provider calls, and external cost are unchanged.
- Skipped: the similar admin usage/reset blocks retain distinct method and dependency behavior; a parameterized control-flow helper was not smaller or easier to verify, so no abstraction was added.
- External state: Wrangler built locally with `--dry-run` and exited without deployment; no Cloudflare, provider, basket, or credential mutation occurred.
