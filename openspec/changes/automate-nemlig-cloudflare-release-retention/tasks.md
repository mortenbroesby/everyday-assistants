## 1. Baseline and mismatch (#97)

- [x] 1.1 Record current main SHA, workflow trigger/topology, current environment protections, package gates, and every manual or skip/supersession path.
- [x] 1.2 Add a focused regression for the live credential-key-version binding and unknown undeclared variable; improve bounded failure categories without logging values.
- [x] 1.3 Validate key-version format and include it in the canonical effective-config digest and deployed variables.
- [ ] 1.4 Replace undeclared dashboard plain variables from the complete reviewed config, preserve encrypted secrets, and prove the stale unused minimal-auth flag disappears.

## 2. Automatic exact-main delivery (#98)

- [x] 2.1 Characterize workflow_run and workflow_dispatch eligibility, exact SHA revalidation, concurrent/pending runs, PR credential boundary, cancellation, and finalization.
- [x] 2.2 Make the smallest safe workflow change so every eligible trusted main-CI candidate that remains in main history automatically reaches deploy and required read-only acceptance through the native queue; preserve exact candidate checkout and deployed-descendant protection, with no custom queue-overflow catch-up, routine dispatch, or manual finalization.
- [x] 2.3 Prove production credentials are available only to protected trusted deploy jobs and stale/superseded/concurrent candidates cannot mutate production.
- [x] 2.4 Record fixed stage-specific acceptance failure categories without raw command output, credentials, or response data; prove cleanup and recovery remain gated.

## 3. Image inventory and dry-run (#99)

- [x] 3.1 Establish authoritative repository/tag/digest/order/age/reference/deletion semantics for Wrangler 4.127.1; revalidate PR #48 evidence and document fields the provider does not supply.
- [x] 3.2 Implement complete exact-repository inventory with pagination/alias checks and deterministic failure on incomplete or unknown responses.
- [x] 3.3 Add accepted-image order ledger and pure planner: retain ten distinct accepted digests by default; preserve active/recovery/uncertain and untracked images unless exact accepted-release order is proven.
- [x] 3.4 Test malformed, duplicate, stale, missing, reordered and uncertain ledger/inventory states; prove stable read-only reports and exact reason categories.
- [x] 3.5 Implement the separate Worker-version policy with complete paginated inventory and cardinality validation, fixed UTC 48-hour cutoff, journal-derived active/recovery protection, fresh revalidation, delete readback, shared lease fencing, bounded durable evidence, explicit reviewed resume, and timeout tests; no live deletion is claimed.
- [ ] 3.6 Run the protected Worker-version policy against the live production inventory and verify the remaining history without deleting a required recovery reference.
- [x] 3.7 Correct audit findings in Worker retention, release summarization, failed-deploy evidence handling, workflow tests, and operations/spec documentation; no provider mutation is claimed.
- [x] 3.8 Accept a distinct exact recovery journal event when a previously accepted source commit has a new image digest; preserve the old event and prove same-event replay/conflicting evidence remain safe. Verified against the saved 27 September recovery journal and ledger without provider mutation; live retention reconciliation remains in 4.3.

## 4. Accepted-release cleanup (#100)

- [x] 4.1 Implement exact-repository sequential deletion without a count-based run cap; revalidate ownership/references/tag mapping before each delete and read back afterward.
- [x] 4.2 Ensure cleanup runs only after exact successful acceptance and durable evidence; uncertain outcomes stop without retry, rollback, kill-switch change, or basket/provider mutation.
- [ ] 4.3 After the unresolved production journal is safely reconciled, verify a live post-acceptance cleanup reaches the ten-image target or reports protected/uncertain holds. No production deletion has been run by this branch.

## 5. Recovery, docs and delivery (#101)

- [x] 5.1 Model runner-loss boundaries before mutation, during deployment, after mutation before readback, after readback before cleanup, and during cleanup; remove only state proven redundant.
- [x] 5.2 Add/adjust failure-injection and workflow-contract tests; keep service acceptance aligned with modern stateless MCP; document exact deploy, acceptance, retention, uncertainty and explicit resume behavior.
- [x] 5.3 Reconcile backlog and OpenSpec, choose one package version/release note near merge, and run focused checks then one uncached final pnpm verify plus package/provider readiness gates.
- [ ] 5.4 Commit and push the single epic branch, open one PR, wait for exact-head CI, merge through GitHub rules, and verify integrated main CI and exact production read-only acceptance/retention evidence.
- [x] 5.5 For failed run 36323808770, authoritative Container info showed the candidate image despite a stale list response; exact disabled-state reconciliation and lease finalization succeeded. A 39-character recovery input was rejected before mutation; the corrected full SHA restored previously accepted 94a9a3c, with a separate retention resume clearing the lease. Diagnostic run 36325577541 then proved a service tool-inventory mismatch without proving its precise missing/extra entries.
- [x] 5.6 Protected run 36327638193 recorded `service_tool_inventory_read_m40_x0`: only expected tool position 6 was absent. The exact failed image digest `497f01f4…` was pulled and its production bundle registered all seven service tools with package 4.17.2. This rules out a stale image build but does not retroactively identify the serving instance. The run rolled back disabled; protected recovery run 36328103517 restored accepted source `94a9a3c6…`, live edge readback passed, and retention resume 36328422303 cleared the lease.
- [ ] 5.7 Require provider-free MCP server-release and running-instance version convergence before the full service fixture, with bounded failure and no forced restart; test old, cold, current, timeout and unsafe-inventory branches. Emit one bounded sanitized diagnostic at the final running-instance gate with first/last observed state and version-category counts; diagnostic output must not affect acceptance, and no extra provider reads or retries are allowed. Verify the resulting exact-main production release and leave native ChatGPT acceptance separate. The prior exact-main attempt (run 37082177579) failed at this gate; its last-sample-only diagnostic did not distinguish startup/placement from instance-association reporting.
- [x] 5.8 Fix the reproduced success-only finalization condition after a verified failed rollback; bind the saved journal to the current candidate/run/attempt and preserve cancellation and uncertainty holds. Focused workflow/deployment regressions pass, including executable journal-binding checks; exact-head CI and deployment remain separate delivery evidence.
- [x] 5.9 Reconcile a stopped runner's lone `enable_deploy` intent only when the exact journaled Worker candidate is enabled and the Container still exactly matches its recorded starting state; otherwise retain the lease without mutation. For a proven partial enable, roll back to the recorded starting Worker, verify disabled routes and unchanged Container state, append the rollback result, and test drift/runner/ownership failures. Focused deployment/workflow tests pass 122/122, including exact-state rollback, drift refusal, and no retry after an uncertain rollback.
- [x] 5.10 Retry both disabled public-route checks as one bounded pair so transient propagation failures do not immediately strand the production lease; preserve fixed error categories and fail closed after the bounded window. Regression proves a transient fetch failure retries and completes without bypassing either route check.
- [x] 5.11 Reconcile a stopped runner's lone failed `disabled_deploy` intent only after exact readback of the candidate Worker SHA/disabled flag/config, version-tagged registry digest, same Container identity/image/version, inactive instance, and both disabled public routes; append the missing result and release only after proof. Drift tests retain the lease and perform no deployment/rollback. Focused recovery regressions pass.
