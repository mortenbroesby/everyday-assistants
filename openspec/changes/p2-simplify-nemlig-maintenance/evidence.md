# Implementation evidence

## Ready and baseline — 2026-09-08

- User approved starting the entire evening's refactoring plan, with module-first slices and dedicated Terra/Luna implementation after explicit planning. Ponytail mode is paused; existing safety and cost boundaries remain.
- Assigned linked worktree: `plan-next-maintenance-everyday-assistants`, branch `codex/plan-next-maintenance` (absolute machine path omitted from public evidence).
- Fetched `origin/main` and HEAD both `152e997c11e855835c502ccc4fbac30dfeddb1bd`; worktree was clean before implementation. Primary checkout and unrelated worktrees remain untouched.
- Baseline `pnpm verify` passed with uncached runtime tasks: 179 tests, lint/build/typecheck/smoke passed; coverage still had zero tasks. Test runner duration 15.408 seconds (Turbo test stage 16.433 seconds), lint 6.513 seconds and smoke stage 3.461 seconds. This is fresh regression evidence but not instrumented coverage; total pipeline wall time was not captured.
- Sibling invitation/Q&A lane was idle at inventory; notified of ownership. Authentication, principal lifecycle, tiers, baskets and provider configuration are outside current slices.
- Readiness: current schema-driven apply state ready, 0/50 tasks initially. Reviewed proposal/design/spec/tasks and root/app Ready/Done instructions. Rollback is a normal scoped revert; repository-only coverage/release parser does not need production deployment.

## Delegation and execution order

1. Luna: release parser, exclusively `release/agent.ts` and its test. Characterization then installed Commander; no package or policy changes.
2. Terra: native coverage runner/report validation, app/root scripts, Turbo outputs and CI artifact. No runtime or release-file edits.
3. Sol: read-only package capability verification and next module adoption briefs; verify Pacer cache claims rather than duplicate functionality.
4. Primary: artifact/evidence updates, review, full gates and one scoped integration at a time. HTML conversion starts only after its measured adoption gate and manifest ownership handoff.

Independent parser preparation overlaps coverage work under the user's module-first request. Integration remains serialized. New cache/scheduling/API candidates are investigation gates until specific behavior, cost and compatibility criteria are settled; they do not waive fresh revalidation or non-retry mutations.

Existing characterization anchors: `client.test.ts` covers read retry versus mutation single-attempt, caller cancellation, cached versus fresh exact lookup, bounded three-category fallback and mutation readback. `proposals.test.ts` covers exact/expiring/single-use authorization, fresh checks before the first write, replay and indeterminate non-retry. Gateway tests cover kill switch/authentication before Container access, rate/breaker denials, bounded bodies and deadlines. HTTP tests cover principal isolation and stale credential generations. Gaps targeted by this change include malformed release flags, real coverage report validation, parser-backed product text and concrete list/plan output schemas.

## First slice — coverage and Commander

- Luna replaced the release parser with installed Commander. Valid defaults/repeated flags remain; optional noRelease is absent unless explicitly requested. Parser exits/diagnostics are intercepted, and missing/empty/option-shaped Git refs fail before planning.
- Coordinator reproduced the old parser behavior directly from `152e997`: `--base --apply` incorrectly produced baseRef `--apply`, and `--main-ref --apply` incorrectly produced mainRef `--apply`. New focused release tests pass 6/6, including silence and malformed cases. Production parser +32/-12 lines; tests +39/-1.
- Terra wired existing Node/tsx coverage and a tested report validator. Root verify now uses the instrumented suite instead of running test plus coverage twice; standalone test remains available. An uncached validator runs after Turbo, and a removed-report experiment confirmed cache output restoration before successful validation.
- Initial instrumented run: 189/189 tests; 25 loaded production files (22 src, 3 release); 95.03% lines, 82.67% branches, 93.28% functions. Node reports loaded files only, NOT all repository code. Tests/generated outputs are excluded from coverage attribution.
- Native test duration 38.386 seconds (versus baseline 15.408), Turbo stage 53.817 seconds. Difference includes instrumentation, ten additional tests and concurrent laptop load; not an isolated performance benchmark.
- Ignored report `apps/nemlig-assistant/coverage/coverage.txt` is about 44 KB; CI retention seven days. No new runtime or development package. Report missing/empty/no-summary/no-source and test/generated-file contamination tests fail closed.
- Package manifest scripts are release-bearing under existing policy, so metadata advances to `2.5.1-alpha.10`; no npm publish or production deployment is performed by these repository-only tooling slices.
- Coordinator's final `pnpm verify` passed with the combined 189-test instrumented suite, lint/build/typecheck/smoke. Strict OpenSpec validation passed 14/14 and privacy checks passed. Initial integration lint/public-path findings were corrected before this pass. CI artifact publication remains pending until exact-head CI; task 1.3 stays unchecked for that final acceptance.
