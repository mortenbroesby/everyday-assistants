## 1. Contract and provider adapter

- [ ] 1.1 Add typed provider shopping-list read/create/update/delete/transfer operations with no mutation retries and empty-2xx support.
- [ ] 1.2 Add sanitized client fixtures that characterize list readback and quantity semantics; reject incomplete/mismatched data rather than compensating.
- [ ] 1.3 Define list fingerprints and exact transfer verification while retaining add-only real-basket checks.

## 2. Deferred workspace cutover

- [ ] 2.1 Follow-up: replace durable line-content persistence only after the real-host proof release passes.
- [ ] 2.2 Follow-up: synchronize Ready changes to the provider list serially and require verified readback before acknowledgement.
- [ ] 2.3 Follow-up: cut over with separate versioned metadata and delete legacy local-basket storage.

## 3. Submission and recovery

- [ ] 3.1 Replace per-product `addToCart` review submission with one list transfer bound to exact list and real-basket baselines.
- [ ] 3.2 Retain no-retry uncertain-transfer behavior; distinguish verified success, cleanup pending, and failure.
- [ ] 3.3 Delete the app-owned list only after verified transfer; preserve an untransferred list after card close.

## 4. Surface and documentation

- [ ] 4.1 Update the current MCP/viewer/text submission path for provider-list preparation while retaining local-basket editing.
- [ ] 4.2 Update smoke/runbook wording; record the local-basket retirement as a post-proof follow-up.

## 5. Verification and review

- [ ] 5.1 Add focused unit/integration tests including a 38+ item one-transfer case, stale/fence paths, cross-owner rejection, cleanup-pending, and credential-free rejection.
- [ ] 5.2 Run formatting, targeted app checks, OpenSpec validation, and repository verification; record exact results in the PR.
- [ ] 5.3 Request Astra design review of the implemented diff before draft-PR handoff; resolve only demonstrated issues.
