## 1. Establish the refactor baseline

- [x] 1.1 Refresh `origin/main`, verify the cleanup worktree ancestry/status, and record the exact base SHA plus production/test line counts in the change evidence.
- [x] 1.2 Install workspace dependencies with the frozen lockfile and verify the install completes without changing tracked manifests or the lockfile.
- [x] 1.3 Run `pnpm verify` and `pnpm nemlig:production:ready`; record any pre-existing failure before editing and proceed only with a reproducible baseline.
- [x] 1.4 Record the non-negotiable behavior, safety, privacy, and cost invariants from `design.md`, and verify the planned slices introduce no dependency, service, storage, concurrency, retry, logging, or provider-request increase.

## 2. Remove proven leaf-level complexity

- [x] 2.1 Verify repository-wide references and delete the unused `MAX_RESOLVED_LIST_LINES`; run the shopping-list-model tests and typecheck.
- [x] 2.2 Verify `ownerScopeFor` is only a redundant internal alias, replace its callers with `principalScopeFor`, and run shopping-list and principal-scope tests.
- [x] 2.3 Verify and remove unused `NemligClient` bookkeeping, normalize repeated product-description work once, and run the complete client test suite while asserting provider request counts remain unchanged.
- [x] 2.4 Infer duplicated private candidate types from their existing Zod schemas and merge duplicate same-module imports; run interface tests, typecheck, lint, and `git diff --check`.
- [x] 2.5 Add focused TSDoc for the cached-versus-fresh client lookup contract and any touched non-obvious boundary; verify generated declarations/build output and omit comments that only restate types.
- [x] 2.6 Record the slice's production-line delta and skipped abstractions, run `pnpm verify`, then commit, push, and verify the exact remote ref before starting the next slice.

## 3. Simplify shopping-plan resolution

- [x] 3.1 Add or identify characterization tests for plan-line ordering, duplicate basket-line aggregation, summaries, ambiguity, transport failures, and provider request counts; run them green before production edits.
- [x] 3.2 Replace the per-plan-line basket scan with one local quantity index while preserving exact output and request behavior; run the focused planner and proposal suites.
- [x] 3.3 Add targeted TSDoc to `eligibleCandidates` and `resolveShoppingPlan`, and simplify dense expressions only where the resulting production code is clearly smaller or easier to verify.
- [x] 3.4 Record CPU/request and production-line deltas, run `pnpm verify`, then commit, push, and verify the exact remote ref.

## 4. Consolidate MCP failure handling when justified

- [x] 4.1 Characterize the exact MCP tool catalog, annotations, input/output schemas, friendly text, structured payloads, and sanitized failure envelopes; run interface and smoke tests green before production edits.
- [x] 4.2 Measure repeated handler error code and either consolidate identical behavior into the smallest private same-module operation or record why the slice is skipped; keep every tool registration explicit and add no registry or compatibility alias.
- [x] 4.3 Make the picker HTML private if package/export analysis proves it is not a supported contract, adjust tests to exercise it through its runtime boundary, and run interface plus packed-package smoke tests.
- [x] 4.4 Add targeted TSDoc to `createMcpServer` and the request-context boundary, then verify exact catalog and failure behavior remain unchanged.
- [x] 4.5 Record the production-line delta and skipped abstractions, run `pnpm verify` and package smoke, then commit, push, and verify the exact remote ref.

## 5. Simplify proposal state transitions

- [x] 5.1 Add or identify characterization coverage for exact audit ordering and every prepared, invalid, applying, completed, expired, replayed, and indeterminate transition; run the complete proposal suite green before production edits.
- [x] 5.2 Verify repeated invalidation-and-audit paths have identical semantics, then consolidate them into the smallest private operation without changing messages, persistence timing, ordering, or mutation retry behavior.
- [x] 5.3 Add targeted TSDoc for automatic authorization consumption, connection binding, expiry, fresh product revalidation, basket fingerprinting, single use, final readback, and indeterminate no-retry behavior.
- [x] 5.4 Run proposal, MCP, interface, and acceptance tests; verify provider revalidation and mutation remain sequential and no live basket action was performed.
- [x] 5.5 Record the production-line delta and skipped abstractions, run `pnpm verify` and `pnpm nemlig:production:ready`, then commit, push, and verify the exact remote ref.

## 6. Simplify Cloudflare admission when justified

- [ ] 6.1 Characterize authentication/admission ordering, Container-wake prevention, exact tier decisions, reason/status mappings, quotas, rate limits, circuit breaker, hard ceilings, kill switch, and `outboundByHost` registration before production edits.
- [ ] 6.2 Measure repeated admission conversions and unused parameters, then either delete/consolidate only exact duplicates or record why the slice is skipped; preserve fail-closed behavior and all cost controls.
- [ ] 6.3 Add targeted TSDoc to `admitUsage`, `admitUsageAtomically`, and `handleGatewayRequest` where it explains the admission contract rather than syntax.
- [ ] 6.4 Run usage, gateway, configuration, observability, HTTP, and acceptance tests plus the credential-free Wrangler dry run; verify no Cloudflare or provider mutation occurred.
- [ ] 6.5 Record the production-line delta and skipped abstractions, run `pnpm verify` and `pnpm nemlig:production:ready`, then commit, push, and verify the exact remote ref.

## 7. Complete repository hygiene and final proof

- [ ] 7.1 Re-audit production sources for dead declarations, redundant aliases, duplicate imports/types, unnecessary dependencies, and high-value missing TSDoc; verify every retained candidate has a recorded reason.
- [ ] 7.2 Verify each fully checked open OpenSpec change is represented in main specs, then sync/archive only those with no pending rollout or acceptance task; leave incomplete changes untouched.
- [ ] 7.3 Run strict validation for `p2-maintain-nemlig-assistant` and every affected OpenSpec change, plus privacy checks, packed-package smoke, and the credential-free Cloudflare dry run.
- [ ] 7.4 Run `pnpm verify` and `pnpm nemlig:production:ready` at the final rebased head, commit and push remaining planning/evidence updates, and verify exact-head CI.
- [ ] 7.5 Report net production/test lines, dependency count, runtime/request impact, commits and SHAs, intentionally skipped abstractions, remaining doubts, and Astrograph usage; verify no deployment, provider mutation, basket mutation, or credential access occurred.
