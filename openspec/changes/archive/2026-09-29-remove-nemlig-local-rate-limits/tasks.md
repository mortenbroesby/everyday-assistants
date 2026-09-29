## 1. Remove application request throttles

These checked tasks record the first request's evidence, not completion of the
subsequent family-only/no-compatibility refinement in section 3.

- [x] 1.1 Add and run focused failing burst/configuration regressions identifying the former global, principal and credential rate gates.
- [x] 1.2 Delete MCP minute admission/configuration/policy fields and obsolete denials; verify burst tests and unchanged atomic daily/monthly cost accounting.
- [x] 1.3 Delete credential minute validation storage/configuration/outcome; verify credential/CSRF/isolation tests and no rate helper remains in the runtime.

## 2. Integrate and deliver the reviewable change

- [x] 2.1 Reconcile deployment configuration/checks, affected durable specs/instructions/docs and a major package release note; verify strict specs, version and release-note gates.
- [x] 2.2 Run a representative mocked HTTP end-to-end burst, app build/typecheck/tests and final repository verification; review the diff for unintended safety removals or secrets.
- [x] 2.3 Commit/push one scoped branch, verify the remote SHA, and report unperformed private configuration/production/native acceptance. PR publication and exact-head CI status are external delivery evidence tracked on #151 and the linked PR; this checkbox does not assert CI success, merge or deployment.

Evidence: the burst regression initially failed with `principal_rate_limit`;
portal/configuration and deployment regressions also failed before removal.
The replay regression initially admitted the first consumed token after 65
submissions; it now rejects that replay. Focused HTTP/gateway/policy/portal checks
and 104 mocked deployment tests pass. The initial repository verification passed
494 tests (94.93% line coverage), lint, build, typecheck and five smoke cases;
committed-head verification on `147b7e1b6241a0840578edf18092cdeb820eb6c0`
passed the full gate again (494 tests, 94.87% loaded-source line coverage). The documentation-only
handoff commit is reverified before push; its exact head and CI status are
recorded in the PR, not inferred from this checklist.

## 3. Family-only refinement without backward compatibility

- [x] 3.1 Add focused failing regressions for no operation limits/counters, no tier/expensive fields and rejection of old policy schemas.
- [x] 3.2 Delete all operation caps/counters, tiers, per-person budgets/forecast/telemetry and usage/reset endpoints; verify obsolete stored usage is never read or written.
- [x] 3.3 Replace legacy policy versions with one current encrypted-credential family contract; verify exact owner authorization, unknown/disabled denial, credential/session/conversation isolation and no inline-password fallback.
- [x] 3.4 Remove obsolete deployment bindings, fixtures and current documentation/specification claims; verify mocked deployment/configuration gates and no operational tier/expensive/legacy-policy branches remain.
- [x] 3.5 Run focused regression/mock HTTP tests, strict/privacy/version/release-note gates and final `pnpm verify`; update the same PR with exact SHA/CI and unperformed release transitions. No merge/deploy/provider mutation.

Refinement evidence (2026-09-28): source commit
`3f05df8f52c2f962bfeeff8043ff81092330f228`, based on current main
`cc2ffdcbf0f32ca793a0c87bcf5f2caddbaec1c8`, passed committed-head
`pnpm verify` before push: lint, build, typecheck, 486 tests with no failures,
94.51% loaded-source line coverage and five smoke cases. Strict specs passed
26/26; privacy, major-version/release-note checks and packed-package smoke
passed. Regressions cover 6,001 admissions without obsolete usage-state reads
or writes, and a loopback MCP burst with 501 reads plus 30 rejected unapproved
mutations (zero mocked provider writes). Owner controls, delayed credential
commit and profile/review continuity regressions pass. All providers are mocked.
Final documentation-head revalidation, remote ref and exact-head CI are recorded
on #151 and PR #152; this checklist does not assert CI, merge or release success.

No viewer/browser-native acceptance is needed for this non-UI policy change,
and no native/production behavior is claimed. The local Cloudflare dry run
bundled the Worker but could not build the image because Docker/Colima is not
running. This is not application or production failure evidence. CI's Linux
Container dry run remains the independent packaging gate. Private rate-binding
removal and strict principal-policy transition remain unperformed release
blockers; neither is authorized by this PR.
