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
- First slice integrated as `ecac23894889aa90bd9f5e8034625a1d89f6107b`; exact remote main verified. [Exact-head CI](https://github.com/mortenbroesby/everyday-assistants/actions/runs/34272693165) passed, completing the artifact-publication acceptance and task 1.3.

## HTML adapter — adoption in progress

- Terra demonstrated three failing actual-normalization tests before adding a parser import: quoted delimiters/entities/script content, content-only omission, and raw-input bounding. Existing 189 tests remained green in that run.
- Installed exact runtime `html-to-text@10.0.1` (MIT, Node >=20.19.0) with lifecycle scripts disabled. It has five direct dependencies. `pnpm audit --prod --json` reported zero advisories in the resulting runtime graph.
- Correction to the planning handoff: the actual 10.0.1 package contains ESM/CJS builds but no bundled TypeScript declarations. Added exact dev-only `@types/html-to-text@9.0.4` (MIT, no dependencies); compiler/runtime checks must verify the API used is compatible. No invented declaration shim.
- Pre-adapter emitted files: CLI 34,939 bytes, MCP 139,118 bytes, HTTP 157,482 bytes. Dry pack (with tooling manifest changes, before HTML dependency) reported compressed 257,936 / unpacked 938,183 bytes; package dependencies are not bundled in those totals.
- Adoption checks passed: 14 runtime package versions occupy 2,185,271 bytes in the installed dependency closure. Built CLI/MCP/HTTP each grow 1,069 bytes; dry pack is 259,760 compressed / 946,620 unpacked bytes, still eight files (dependency closure excluded). This is a correctness/maintainability trade-off, not a speed improvement.
- Corrected synthetic benchmark uses actual normalizeProducts, Node 22.23.1, 200 samples and 16,384 raw characters per field. Cold normalizer import: 184.014 ms. Per-field median/p95: plain 0.856/1.354 ms, dense markup 2.053/3.489 ms, entities 1.433/1.910 ms, malformed 0.734/1.490 ms. All 41 full-sized fields together: 52.417/79.103 ms, process peak RSS 165,953,536 bytes. These laptop stress measurements are not production latency or allocation measurements. The earlier output-length-sized product benchmark was rejected and corrected.
- Compile once, input truncation before parsing, depth 32, child count 1,000 and existing description/attribute output limits keep conversion bounded. Tests cover no warnings, no script/style text, heading case, no link destination or image text, malformed markup, Danish entities and omission. Parser conversion never fetches. Search gateway and grouped category/favourite results continue through the same normalizer; planner serialization preserves description/details and the picker still uses textContent.
- Full pnpm verify passed: 193 tests, instrumented duration 20.146 seconds; loaded-source coverage 95.05% lines / 82.77% branches / 93.47% functions. Packed smoke, strict OpenSpec 14/14, privacy and type/runtime compatibility passed. Existing client/proposal request-count, retry and fresh-validation tests remained green. README and patch metadata updated.
- Cost assessment: added bounded local parsing CPU and about 2.2 MB installed dependencies; no added provider requests, retries, storage, logging, services, concurrency or capacity. Stress inputs can consume tens of milliseconds per product; no production speed claim. No plausible material operating-cost increase is expected under existing admission/capacity limits. No production rollout performed; applicable read-only runtime acceptance remains story 10.
