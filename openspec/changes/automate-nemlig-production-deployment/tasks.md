## 1. Exact source and exclusive lease

- [ ] 1.1 Implement full-SHA, local HEAD, refreshed remote `main`, and exact-head
  successful-CI preflight checks; verify focused tests reject every mismatch
  before a Cloudflare command is called.
- [ ] 1.2 Add exclusive shared-Git-directory and atomic remote-ref leases with
  owner-safe cleanup; verify concurrent and stale-lock tests never steal or
  overwrite a lease.
- [ ] 1.3 Add an atomic redacted deployment journal under the common Git directory;
  verify its schema excludes tokens, headers, shopping data, and raw provider
  errors while retaining every state transition.

## 2. Disabled-first single-build release

- [ ] 2.1 Read the starting Cloudflare deployment, version, application, and
  instance state from Wrangler JSON; verify missing, ambiguous, or changed state
  fails closed.
- [ ] 2.2 Deploy the exact revision with `MCP_ENABLED=false`, then bound and verify
  both fixed 503 responses plus one inactive Container before enablement; verify
  timeout and unexpected-response tests leave the candidate disabled.
- [ ] 2.3 Re-check the disabled version and enable the same source with
  `--containers-rollout none`; verify the controlled command trace contains one
  Container build/upload and preserves all configured safety bindings.
- [ ] 2.4 Reuse the existing edge and authenticated read-only acceptance commands,
  restoring and verifying the recorded starting version on enabled failure;
  verify tests never invoke proposal, basket, favorite, or saved-list writes.

## 3. Operator contract and cost evidence

- [ ] 3.1 Expose one explicit package command with bounded deadlines and useful
  fail-closed output; verify help and argument tests require exactly one full
  commit and no credential value.
- [ ] 3.2 Document normal invocation, stale-lease recovery, redacted evidence,
  rollback, and the unchanged cost model; update the backlog stories and package
  version and verify public-tree privacy checks pass.

## 4. Verification and delivery

- [ ] 4.1 Run focused command tests, formatting/diff checks, strict OpenSpec
  validation, privacy checks, `pnpm verify`, package smoke, and the credential-free
  production-readiness gate; record every passing command.
- [ ] 4.2 Reconcile current `origin/main`, coordinate with active sibling work,
  commit and integrate the scoped implementation into remote `main`, and verify
  exact-head CI succeeds.
- [ ] 4.3 With a current owner token and explicit production approval, invoke the
  command for the exact CI-green `main` commit; verify its disabled, inactive,
  enabled, authenticated read-only, rollback, and redacted-summary evidence
  without any Nemlig mutation.
- [ ] 4.4 Sync the delta specification into the main spec, archive the completed
  change, integrate the archival commit into remote `main`, and verify exact-head
  CI plus the recorded production state before final handoff.
