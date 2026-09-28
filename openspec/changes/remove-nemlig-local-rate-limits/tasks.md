## 1. Remove application request throttles

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

No viewer/browser-native acceptance is needed for this non-UI policy change,
and no native/production behavior is claimed. The local Cloudflare dry run
bundled the Worker but could not build the image because Docker/Colima is not
running. This is not application or production failure evidence. CI's Linux
Container dry run remains the independent packaging gate. Private rate-binding
removal and strict principal-policy transition remain unperformed release
blockers; neither is authorized by this PR.
