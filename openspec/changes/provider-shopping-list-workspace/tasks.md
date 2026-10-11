## 1. Contract and provider adapter

- [ ] 1.1 Add typed provider shopping-list read/create/update/delete/transfer operations with no mutation retries and empty-2xx support.
- [ ] 1.2 Add sanitized client fixtures that characterize list readback and quantity semantics; reject incomplete/mismatched data rather than compensating.
- [ ] 1.3 Define list fingerprints and exact transfer verification while retaining add-only real-basket checks.

## 2. Workspace cutover

- [ ] 2.1 Replace durable line-content persistence for new workspaces with owner/list mapping, revision/fingerprint, selection, and submission-fence metadata.
- [ ] 2.2 Synchronize Ready changes to the provider list serially and require verified readback before acknowledgement.
- [ ] 2.3 Cut over cleanly with a separate versioned metadata key: legacy local records are not silently uploaded, converted, reopened, or given prepared authority.

## 3. Submission and recovery

- [ ] 3.1 Replace per-product `addToCart` review submission with one list transfer bound to exact list and real-basket baselines.
- [ ] 3.2 Retain no-retry uncertain-transfer behavior; distinguish verified success, cleanup pending, and failure.
- [ ] 3.3 Delete the app-owned list only after verified transfer; preserve an untransferred list after card close.

## 4. Surface and documentation

- [ ] 4.1 Update MCP/authentication boundaries, viewer/text states, and fixtures for provider-backed Ready contents.
- [ ] 4.2 Update README, skills, smoke/runbook wording, and relevant durable specifications; mark the direct-write continuation proposal superseded.

## 5. Verification and review

- [ ] 5.1 Add focused unit/integration tests including a 38+ item one-transfer case, stale/fence paths, cross-owner rejection, cleanup-pending, and credential-free rejection.
- [ ] 5.2 Run formatting, targeted app checks, OpenSpec validation, and repository verification; record exact results in the PR.
- [ ] 5.3 Request Astra design review of the implemented diff before draft-PR handoff; resolve only demonstrated issues.
