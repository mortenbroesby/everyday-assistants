# Everyday Assistants repository instructions

This repository contains independent assistants under `apps/`. Keep this file
focused on durable repository rules; model, vendor, and machine-level
orchestration preferences do not belong here.

## Start and finish

- Before implementation, apply the
  [Definition of Ready](.agents/instructions/definition-of-ready.md).
- Before reporting completion, apply the
  [Definition of Done](.agents/instructions/definition-of-done.md).
- These are required gates. Record why an item is inapplicable; if an applicable
  item is unmet, keep the task active or report the evidenced blocker.
- A nearer `AGENTS.md` adds requirements for its directory. Explicit user and
  platform instructions remain higher priority.

## Task routing

Load only the specialized guidance that matches the task. If no row matches,
use this file, the lifecycle gates, and the nearest scoped `AGENTS.md`.

| Task intent | Load |
| --- | --- |
| Explore or clarify before committing to a change | [OpenSpec explore](.agents/skills/openspec-explore/SKILL.md) |
| Propose a non-trivial feature or architecture change | [OpenSpec propose](.agents/skills/openspec-propose/SKILL.md) |
| Revise an existing OpenSpec plan | [OpenSpec update](.agents/skills/openspec-update-change/SKILL.md) |
| Implement an approved OpenSpec change | [OpenSpec apply](.agents/skills/openspec-apply-change/SKILL.md) |
| Sync or archive an implemented OpenSpec change | [OpenSpec sync](.agents/skills/openspec-sync-specs/SKILL.md) or [archive](.agents/skills/openspec-archive-change/SKILL.md) |
| Decide what is next or identify parked work | [Roadmap triage](.agents/skills/roadmap-triage/SKILL.md) |
| Simplify working code without behavior change | [Code simplification](.agents/skills/code-simplification/SKILL.md) |
| Explicit functional refactor | [Functional refactoring](.agents/skills/functional-refactoring/SKILL.md) |
| Explicit Gang of Four pattern question | [Design pattern](.agents/skills/design-pattern/SKILL.md) |
| Any Nemlig app work | [Nemlig instructions](apps/nemlig-assistant/AGENTS.md) |
| Nemlig product search, review, or basket operation | [Nemlig basket](apps/nemlig-assistant/.codex/skills/nemlig-basket/SKILL.md) |
| Nemlig production, deployment, or provider work | [Nemlig production](apps/nemlig-assistant/.codex/skills/nemlig-production/SKILL.md) |

Selecting guidance never grants authority for the action it describes.

## Working method

- State one concrete outcome and definition of done. Resolve the highest-risk
  unknowns first and revise the plan when evidence disproves an assumption.
- The coordinating agent owns planning, integration, final verification, and
  every human checkpoint. Delegate only bounded independent work when the
  runtime supports it, use exclusive scopes, and review all returned changes.
- For a long-running task, keep one quiet decision-input heartbeat. Notify only
  when concrete user input blocks progress, do not repeat an unchanged request,
  and disable the heartbeat when the task completes.
- Use an isolated non-primary Git worktree and branch for repository changes.
  Confirm root, branch, base commit, and status before editing; leave other
  worktrees and unrelated changes untouched.
- Treat one coherent epic as the normal unit: one branch and pull request, one
  version decision near merge, and at most one deployment. Use checkpoint
  commits; use a smaller PR only for urgency or independently reviewed risk.
- For non-trivial behavior changes, write the smallest failing test first. For
  behavior-preserving refactors, establish focused characterization coverage.
- Prefer deletion, standard capabilities, and existing dependencies over new
  abstractions. Trace callers before removing shared code.
- Run focused checks while iterating and one final `pnpm verify` after the final
  relevant diff. Do not repeat the full gate without a relevant change or a
  diagnosed failure.

## Authority, safety, and cost

- A user-selected repository task authorizes ordinary, non-destructive work in
  that scope: inspect, plan, edit, test, commit, push, and verify.
- Ask before destructive or hard-to-reverse actions, external user-data changes,
  secret handling, material provider or production mutation, meaningful scope
  expansion, or a choice that materially changes the intended outcome.
- Delegation, an OpenSpec plan, repository work, a refactor, review, inventory,
  or recommendation never broadens approval or authorizes a Nemlig mutation.
- Keep credentials, tokens, cookies, profiles, proposals, audits, and other
  local-only artifacts local and ignored.
- Assess privacy, security, retries, scaling, storage, egress, logging, and paid-
  service effects before implementation. Preserve quotas, circuit breakers,
  kill switches, bounded retries, fail-closed behavior, and equivalent controls.
- If material cost could increase or cannot be ruled out, pause with the current
  and proposed cost model, drivers, worst credible failure, and cheaper options.

## Delivery and release

- Preserve unrelated work. Commit and push completed scoped work, open one PR,
  wait for required exact-head CI, and merge only through the active GitHub
  ruleset. Reconcile current `origin/main` without overwriting concurrent work.
- For a release-bearing Nemlig epic, decide the version near merge and add one
  concise reviewed note at `apps/nemlig-assistant/release/notes/<version>.md`.
  Describe the epic outcome and impact; do not substitute a commit list or
  generate release prose during deployment CI.
- The package-scoped version policy determines release-bearing Nemlig merges and
  validates their note. The `nemlig-production` environment remains the final
  deployment approval. Only an exact-SHA successful routine deployment may
  publish the matching GitHub prerelease; npm publication remains disabled.
- After integration and evidence, remove a task worktree only when it is clean,
  inactive, and recoverable. Preserve dirty, active, unresolved, or deliberately
  parked worktrees.
