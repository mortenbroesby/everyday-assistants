## 1. Baseline and mismatch (#97)

- [x] 1.1 Record current main SHA, workflow trigger/topology, current environment protections, package gates, and every manual or skip/supersession path.
- [x] 1.2 Add a focused regression for the live credential-key-version binding and unknown undeclared variable; improve bounded failure categories without logging values.
- [x] 1.3 Validate key-version format and include it in the canonical effective-config digest and deployed variables.
- [ ] 1.4 Replace undeclared dashboard plain variables from the complete reviewed config, preserve encrypted secrets, and prove the stale unused minimal-auth flag disappears.

## 2. Automatic exact-main delivery (#98)

- [x] 2.1 Characterize workflow_run and workflow_dispatch eligibility, exact SHA revalidation, concurrent/pending runs, PR credential boundary, cancellation, and finalization.
- [x] 2.2 Make the smallest safe workflow change so every eligible current-main merge automatically reaches deploy and required read-only acceptance through the native queue; no custom queue-overflow catch-up, routine dispatch, or manual finalization.
- [x] 2.3 Prove production credentials are available only to protected trusted deploy jobs and stale/superseded/concurrent candidates cannot mutate production.
- [x] 2.4 Record fixed stage-specific acceptance failure categories without raw command output, credentials, or response data; prove cleanup and recovery remain gated.

## 3. Image inventory and dry-run (#99)

- [x] 3.1 Establish authoritative repository/tag/digest/order/age/reference/deletion semantics for Wrangler 4.127.1; revalidate PR #48 evidence and document fields the provider does not supply.
- [x] 3.2 Implement complete exact-repository inventory with pagination/alias checks and deterministic failure on incomplete or unknown responses.
- [x] 3.3 Add accepted-image order ledger and pure planner: retain ten distinct accepted digests by default; preserve active/recovery/uncertain and untracked images unless exact accepted-release order is proven.
- [x] 3.4 Test malformed, duplicate, stale, missing, reordered and uncertain ledger/inventory states; prove stable read-only reports and exact reason categories.

## 4. Accepted-release cleanup (#100)

- [x] 4.1 Implement exact-repository sequential deletion without a count-based run cap; revalidate ownership/references/tag mapping before each delete and read back afterward.
- [x] 4.2 Ensure cleanup runs only after exact successful acceptance and durable evidence; uncertain outcomes stop without retry, rollback, kill-switch change, or basket/provider mutation.
- [ ] 4.3 After the unresolved production journal is safely reconciled, verify a live post-acceptance cleanup reaches the ten-image target or reports protected/uncertain holds. No production deletion has been run by this branch.

## 5. Recovery, docs and delivery (#101)

- [x] 5.1 Model runner-loss boundaries before mutation, during deployment, after mutation before readback, after readback before cleanup, and during cleanup; remove only state proven redundant.
- [x] 5.2 Add/adjust failure-injection and workflow-contract tests; keep service acceptance aligned with modern stateless MCP; document exact deploy, acceptance, retention, uncertainty and explicit resume behavior.
- [x] 5.3 Reconcile backlog and OpenSpec, choose one package version/release note near merge, and run focused checks then one uncached final pnpm verify plus package/provider readiness gates.
- [ ] 5.4 Commit and push the single epic branch, open one PR, wait for exact-head CI, merge through GitHub rules, and verify integrated main CI and exact production read-only acceptance/retention evidence.
