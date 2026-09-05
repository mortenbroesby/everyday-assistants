## 1. Authoritative product lookup

- [x] 1.1 Add an explicit exact-product client operation that bypasses retained product observations while preserving existing read timeouts and retry bounds; verify a focused client test starts a second upstream request after the product map is populated.
- [x] 1.2 Preserve the existing reusable lookup for discovery and preparation; verify its focused regression test still performs no additional request for an already observed product.

## 2. Fail-closed proposal application

- [x] 2.1 Wire additions and replacement application to the authoritative product operation inside the mutation lock; verify focused proposal tests observe authoritative rather than reusable lookup calls.
- [x] 2.2 Cover changed details, unavailable exact lookup, and multi-line additions; verify each case attempts no basket mutation before every fresh product check succeeds.
- [x] 2.3 Confirm mutation sequencing, no-retry handling, and final basket readback remain unchanged by running the complete proposal test suite.

## 3. Contract and repository verification

- [ ] 3.1 Update implementation-facing documentation only where needed to distinguish discovery reuse from fresh apply-time revalidation; verify the feature inventory and safety claims remain accurate.
- [ ] 3.2 Run formatting/diff checks, focused tests, strict OpenSpec validation, privacy checks, and `pnpm verify`; record every passing command without exposing credentials or private shopping data.
- [ ] 3.3 Reconcile current `origin/main`, coordinate with active sibling work, commit and integrate the scoped change into remote `main`, and verify exact-head CI succeeds.

## 4. Production delivery

- [ ] 4.1 After an explicit coordination checkpoint, deploy the exact CI-green `main` revision through the fail-closed disabled-first procedure without rebuilding or increasing capacity; record version and revision evidence.
- [ ] 4.2 Verify disabled rejection before backend wake, restore the intended state for the same revision, and run revision, health, OAuth metadata, cheap rejection, and authorized read-only acceptance checks without preparing, applying, or mutating a basket.
- [ ] 4.3 Sync the delta specification into the main spec, archive the completed OpenSpec change, integrate the archival commit into remote `main`, and verify its exact-head CI and production applicability before final handoff.
