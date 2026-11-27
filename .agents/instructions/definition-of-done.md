# Definition of Done

Apply this gate before reporting repository work complete. A task is done only
when every applicable criterion below is satisfied with current evidence.

- **Implementation complete:** Acceptance, intended failure behavior, safety
  boundaries, and state readback are verified where applicable.
- **Quality:** Run the fast lint-only `pnpm verify` for executable/configuration
  changes and focused tests for changed behavior and relevant callers. Use
  existing tests and tooling; select by actual dependencies/contracts, not only
  matching filenames. CI owns the full build, type checks, tests, formatting,
  and smoke checks. Do not duplicate those suites locally by default; run a
  broader local check only to investigate a failure or answer a concrete risk.
  Documentation-only changes need only relevant file checks. Inspect the final
  diff for secrets, accidental edits, and unjustified complexity.
- **Evidence:** Before a completion claim, identify the check that supports that
  claim and inspect its complete result. Record command, working directory,
  revision/relevant working-tree state, and result. Reuse completed evidence
  while its inputs are unchanged; rerun after relevant edits or for a concrete
  unresolved concern. A yielded or timed-out check is running or unknown:
  resume/inspect its process before retrying. Report pending CI and untested
  behavior explicitly; lint does not prove behavior, and local checks do not
  prove deployment. For consequential changes with uncertain consumers or
  invariants, use the conditional [independent challenge review](../skills/verification-before-completion/SKILL.md#independent-challenge-review).
- **Documentation:** Update affected instructions, docs, backlog, and OpenSpec
  artifacts; do not leave planning or task state misleading.
- **Implementation handoff:** Commit and push the scoped change, report the
  branch/PR, checks, and remaining uncertainty. A verified PR is implementation
  complete; merge, exact-main CI, release, and deployment are not implied.
- **Delivery (only when explicitly in scope):** Reconcile current `origin/main`
  without overwriting concurrent work and verify exact-head CI/ruleset. Hosted
  changes require approved fail-closed deployment and health/read-only evidence.
  Keep production, provider, secret, and external-user-data gates.
- **Learning:** Review meaningful friction already observed and link its record
  or sanitized handoff using [the ledger](../../.friction/README.md). No empty
  record or assertion of friction absence is required; do not expand a read-only
  task into repository writes.
- **Coordination/cleanup:** Notify affected sibling work before integration or
  production mutation. Leave unrelated changes untouched; remove a worktree
  only when clean, inactive, and recoverable.

If an applicable implementation check cannot be completed, keep the task active
or report the evidenced blocker. If explicitly scoped delivery cannot be
completed, report delivery as pending; do not describe it as delivered.
