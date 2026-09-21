# Definition of Done

Apply this gate before reporting repository work complete. A task is done only
when every applicable criterion below is satisfied with current evidence.

- **Implementation complete:** Acceptance, intended failure behavior, safety
  boundaries, and state readback are verified where applicable.
- **Quality:** Focused checks, one representative end-to-end smoke test for
  behavior changes, and one final `pnpm verify` pass on the final diff are
  green. Review the diff for secrets, accidental edits, and unjustified
  complexity.
- **Documentation:** Update affected instructions, docs, backlog, and OpenSpec
  artifacts; do not leave planning or task state misleading.
- **Implementation handoff:** Commit and push the scoped change, report the
  branch/PR, checks, and remaining uncertainty. A verified PR is implementation
  complete; merge, exact-main CI, release, and deployment are not implied.
- **Delivery (only when explicitly in scope):** Reconcile current `origin/main`
  without overwriting concurrent work and verify exact-head CI/ruleset. Hosted
  changes require approved fail-closed deployment and health/read-only evidence.
  Keep production, provider, secret, and external-user-data gates.
- **Coordination/cleanup:** Notify affected sibling work before integration or
  production mutation. Leave unrelated changes untouched; remove a worktree
  only when clean, inactive, and recoverable.

If an applicable implementation check cannot be completed, keep the task active
or report the evidenced blocker. If explicitly scoped delivery cannot be
completed, report delivery as pending; do not describe it as delivered.
