# Everyday Assistants repository instructions

This repository contains independent assistants under `apps/`.

- Before starting a task, apply
  [`.agents/instructions/definition-of-ready.md`](.agents/instructions/definition-of-ready.md).
  Before reporting a task complete, apply
  [`.agents/instructions/definition-of-done.md`](.agents/instructions/definition-of-done.md).
  These are repository requirements, not optional checklists. If a criterion is
  inapplicable, record why; if it is unmet, keep the task active or report it as
  blocked rather than calling it done.

## Sol, Terra, and Luna workflow

- The main thread is Sol: it owns planning, OpenSpec decisions, task
  decomposition, integration, and final verification.
- Delegate substantial, well-bounded implementation work to Terra. Delegate
  small mechanical edits, inventories, and focused verification to Luna.
- Give each sub-agent an exclusive file or task scope that can proceed
  independently. Do not let agents edit the same files concurrently.
- Keep simple changes with the coordinator when delegation would add more work
  than it saves. Do not create speculative sub-agents merely to use every slot.
- The coordinator reviews every returned diff, resolves integration issues,
  runs the repository gates, commits, pushes, and verifies the remote result.
- Delegation never transfers or broadens approval. The coordinator retains all
  human checkpoints for secrets, provider changes, costs, destructive actions,
  external user data, and Nemlig basket mutations.
- For a long-running task, keep one quiet decision-input heartbeat. Notify only
  when a named decision, approval, credential action, or other concrete user
  input blocks progress; do not repeat an unchanged request. Disable it when
  the task completes.

- Perform repository changes in a dedicated non-primary Git worktree and branch
  by default. Before editing, inspect the primary checkout and existing
  worktrees, create the dedicated worktree from the latest `origin/main`, and
  leave every other checkout and worktree untouched. Work directly in the
  primary checkout only when the user explicitly instructs you to do so.
- Treat one coherent epic outcome as the normal delivery unit: one worktree and
  branch, one pull request, one version decision near merge, and at most one
  production deployment. The epic may contain multiple related OpenSpec changes
  and checkpoint commits. Use a smaller separate pull request when urgency or
  independently reviewed risk makes it the clearer boundary.
- A user-selected repository task is standing authority for ordinary,
  non-destructive work in that scope: inspect, plan, update OpenSpec, edit, run
  checks, commit, push, and verify without asking for repeated approval.
- Ask only when an action is destructive or hard to reverse, changes external
  user data, incurs cost, handles secrets, materially expands scope, or depends
  on a missing choice that cannot be resolved safely from repository context.
- For every refactor, addition, deletion, dependency, configuration change, or
  infrastructure change, assess whether it could materially increase costs for
  the operator or users, including through autoscaling, request amplification,
  retries, storage, egress, logging, or a new paid service. Preserve existing
  quotas, circuit breakers, kill switches, bounded retries, and fail-closed
  behavior unless an approved design replaces them with equivalent safeguards.
- If a change could significantly raise per-user or total operating cost, or
  that risk cannot be ruled out from available evidence, pause before
  implementation or provider mutation. Present the current and proposed cost
  model, main cost drivers, worst credible failure mode, and lower-cost options,
  then obtain human direction. Changes with no plausible material cost increase
  may proceed under the standing repository authority.
- Before Nemlig work, read `apps/nemlig-assistant/AGENTS.md` and the matching
  skill under `apps/nemlig-assistant/.codex/skills/`.
- Never treat repository work, a refactor, review, inventory, recommendation,
  or OpenSpec change as approval to mutate a Nemlig basket.
- Keep credentials, tokens, cookies, profiles, proposals, and audits local and
  ignored.
- Run `pnpm verify` after non-trivial repository changes.
- Use OpenSpec for non-trivial feature and architecture changes: propose, review,
  apply, then archive. Trivial fixes and documentation edits do not need a spec.
- An OpenSpec proposal never authorizes a Nemlig mutation.
- Preserve unrelated changes. Commit and push completed scoped work on a feature
  branch, open a pull request, wait for required CI, and merge through the
  active GitHub pull-request ruleset; `main` accepts integration through that
  protected path only. The package-scoped version policy selects
  release-bearing Nemlig merges. The
  `nemlig-production` environment remains the final deployment approval.
- After integration and required evidence, remove a completed local worktree
  only when it is clean, inactive, and its commits remain recoverable. Preserve
  dirty, unresolved, active, and deliberately parked worktrees.
