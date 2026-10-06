# Definition of Ready

Apply this gate before implementing a repository task. A task is ready when all
applicable criteria below are satisfied and evidenced from the request,
repository, or current external state.

- **Outcome/scope:** State the observable outcome, affected assistant/files,
  non-goals, and sibling-worktree conflicts.
- **Acceptance:** Define testable success and failure behavior, including
  readback for state changes. Treat the GitHub issue as the task contract.
- **Authority/dependencies:** Confirm access and prerequisites without exposing
  credentials. For required tools, runtimes, services, or remote access, do a
  minimal task-specific capability check early and identify a safe fallback if
  unavailable. Do not bootstrap unrelated services or seek unrelated access.
  Ask separately before destructive actions, external user data, secrets,
  material cost, production/provider mutation, or scope expansion.
- **Bootstrap:** For code/build tasks, use Node 24.13.0 and pnpm 9.15.9 in the
  assigned worktree and run one `pnpm install --frozen-lockfile`. For
  documentation- or instruction-only tasks, install dependencies only when a
  selected check requires them.
- **Reproducer/plan:** Identify the smallest failing check; reassess after two
  uninformative failures. Use OpenSpec only when a durable contract changes;
  otherwise keep the plan concise.
- **Safety/delivery:** Preserve privacy, mutation, retry, scaling, storage,
  logging, egress, and cost safeguards. Decide proportionate verification,
  rollback, integration, and production evidence.

If a criterion cannot be satisfied without a material user choice, the task is
not ready: report the specific decision needed. The user may explicitly waive or
change a readiness criterion, but Codex must record that decision and retain all
other repository safety boundaries.
