## 1. Contract and provider adapter

- [x] 1.1 Add typed provider shopping-list read/create/update/delete/transfer operations with no mutation retries and empty-2xx support.
- [ ] 1.2 Add sanitized HTTP client fixtures that characterize list response parsing, request payloads, and empty-2xx writes.
- [x] 1.3 Define list fingerprints and exact transfer verification while retaining add-only real-basket checks.

## 2. Deferred workspace cutover

- [ ] 2.1 Follow-up: replace durable line-content persistence only after the real-host proof release passes.
- [ ] 2.2 Follow-up: synchronize Ready changes to the provider list serially and require verified readback before acknowledgement.
- [ ] 2.3 Follow-up: cut over with separate versioned metadata and delete legacy local-basket storage.

## 3. Submission and recovery

- [x] 3.1 Replace per-product `addToCart` review submission with one list transfer bound to exact list and real-basket baselines.
- [x] 3.2 Retain no-retry uncertain-transfer behavior; distinguish verified success and failure.
- [ ] 3.3 Follow-up: add durable provider-list lifecycle and cleanup only after native smoke evidence.

## 4. Surface and documentation

- [x] 4.1 Update the current MCP/viewer/text submission path for provider-list preparation while retaining local-basket editing.
- [ ] 4.2 Run the new-session native ChatGPT smoke and record the post-proof local-basket retirement follow-up.

## 5. Verification and review

- [x] 5.1 Add focused unit/integration tests including a 38+ item one-transfer case, stale/fence paths, and credential-free rejection.
- [ ] 5.2 Run exact-head CI and repository verification; record exact results in the PR.
- [ ] 5.3 Request Astra design review of the implemented diff before merge; resolve only demonstrated issues.
