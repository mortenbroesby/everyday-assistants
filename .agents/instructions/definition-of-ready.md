# Definition of Ready

Apply this gate before implementing a repository task. A task is ready when all
applicable criteria below are satisfied and evidenced from the request,
repository, or current external state.

- **Outcome:** State the concrete user or operator outcome and how it will be
  observed. Separate implementation ideas from the required result.
- **Scope:** Identify the affected assistant, files or systems, and important
  non-goals. Confirm that the work does not overlap an active worktree or
  sibling task; coordinate ownership when it might.
- **Epic boundary:** Use one worktree, branch, pull request, version decision,
  and deployment boundary for one coherent outcome. Name any related OpenSpec
  changes included in that epic. Use a smaller separate pull request only when
  urgency or independently reviewed risk warrants it.
- **Acceptance:** Write testable acceptance criteria, including expected failure
  behavior and readback where the task changes state.
- **Authority:** Confirm the request authorizes the intended repository work.
  Obtain separate approval for destructive actions, external user-data changes,
  secrets, material cost, production mutation, or scope expansion when required
  by `AGENTS.md` or the affected app instructions.
- **Dependencies:** Resolve required decisions, access, credentials, upstream
  availability, and prerequisite changes. Never expose credentials while
  checking readiness.
- **Bootstrap:** In the assigned worktree, pin Node 22.23.1 and pnpm 9.15.9,
  then perform one `pnpm install --frozen-lockfile`. Stop and report the
  missing prerequisite if that bootstrap cannot complete; do not repeat it for
  every iteration.
- **Reproducer:** Identify the smallest failing check that demonstrates the
  requested behavior and use it as the iteration gate. Stop and reassess the
  hypothesis after two failed iterations that produce no new evidence.
- **Safety and cost:** Identify plausible privacy, security, mutation, retry,
  scaling, storage, logging, egress, and provider-cost effects. Preserve existing
  safeguards, or obtain approval for a documented replacement.
- **Delivery:** Decide the proportionate verification, integration, deployment,
  rollback, and post-deployment evidence needed to meet the repository
  Definition of Done.
- **Plan:** For non-trivial feature or architecture work, prepare and review the
  required OpenSpec change before implementation. For smaller work, keep a
  concise executable plan.

If a criterion cannot be satisfied without a material user choice, the task is
not ready: report the specific decision needed. The user may explicitly waive or
change a readiness criterion, but Codex must record that decision and retain all
other repository safety boundaries.
