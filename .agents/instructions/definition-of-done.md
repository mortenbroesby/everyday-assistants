# Definition of Done

Apply this gate before reporting repository work complete. A task is done only
when every applicable criterion below is satisfied with current evidence.

- **Outcome and acceptance:** The requested outcome and all acceptance criteria
  are met. Intended failure behavior, safety boundaries, and state readback are
  verified where applicable.
- **Quality:** Relevant focused checks pass. Run `pnpm verify` after non-trivial
  changes, and resolve failures caused by the work. Review the final diff for
  accidental edits, sensitive data, and unjustified complexity.
- **Documentation:** Update affected instructions, documentation, backlog, and
  OpenSpec artifacts. Complete and archive an implemented OpenSpec change when
  its workflow requires it; do not leave planning or task state misleading.
- **Integration:** Commit the complete scoped change, reconcile the latest
  `origin/main` without overwriting concurrent work, integrate it into remote
  `main`, and verify the remote ref contains the exact intended commit. A
  feature branch alone is not done.
- **CI:** Verify required CI for the exact integrated `main` revision succeeds.
  Do not infer success from an older run or only from local checks.
- **Production:** When the task changes hosted behavior or configuration, deploy
  the exact verified `main` revision through the repository's approved,
  fail-closed procedure, then run proportionate health and read-only acceptance
  checks. Record the deployed revision and resulting state. Repository-only work
  does not require a production deployment.
- **Coordination:** Notify affected sibling work before integration or production
  mutation, and leave unrelated worktrees and user changes untouched.
- **Handoff:** Report the outcome, relevant tests, `main` commit, CI evidence,
  production evidence or why production was inapplicable, and any remaining
  risks or follow-up work.

If integration, CI, or an applicable production deployment cannot be completed,
the task is not done. Keep it active or report the evidenced blocker. An explicit
user decision may narrow the requested outcome or defer deployment, but Codex
must record that exception and must not describe the deferred scope as delivered.
