# Everyday Assistants repository instructions

This repository contains independent assistants under `apps/`. The portable
harness lives in this repository; a fresh checkout must not require laptop-global
instructions or chat memory. Read
[operating guidance](.agents/instructions/operating.md)
for repository work and [harness recovery](docs/agent-harness-recovery.md) when
setting up or recovering a machine. Host instructions still apply; local
overrides should contain only machine-specific details.

## Required gates

- Before implementation, apply the
  [Definition of Ready](.agents/instructions/definition-of-ready.md).
- Before reporting completion, apply the
  [Definition of Done](.agents/instructions/definition-of-done.md).
- Record inapplicable items; do not claim an unmet applicable item.
- The nearest `AGENTS.md` adds scope-specific requirements. Loading guidance
  never grants authority for secrets, provider changes, production actions, or
  basket mutations.
- Format changed executable files with `pnpm exec prettier --write <paths>`.
  Prettier uses semicolons, double quotes, two spaces, trailing commas, and an
  80-column target. Every `if` and `else` body must use braces. Local checks are
  scoped; the Definition of Done assigns comprehensive validation to CI.
- For work spanning turns or agents, carry forward the accepted outcome, current
  hypothesis and evidence, completed work, next unresolved question, and owner;
  revisit the hypothesis after two uninformative attempts.
- Before delegating or restarting work, state the outcome, scope/exclusions,
  expected evidence, and integration owner; confirm no active owner already has
  the same scope.

## Friction feedback

Capture meaningful observed developer friction as it occurs using
[the friction ledger](.friction/README.md). Review relevant unresolved records
when starting a related task; preserve failed/interrupted/read-only observations
in the handoff when a write is unavailable or unauthorized. Do not invent records
or treat observations as new requirements.

## Task routing

Load only the specialized guidance that matches the task.

| Task intent | Load |
| --- | --- |
| Browser automation, native app rendering, or sign-in diagnosis | [Browser recovery](.agents/instructions/browser-recovery.md) |
| Cleanup/refactoring, non-obvious complexity rationale, or an explicit read-only deletion audit | [Code Simplifier](.agents/skills/code-simplifier/SKILL.md) |
| Set up or upgrade Fallow, hooks, MCP, or CI gates | [Fallow Setup](.agents/skills/fallow-setup/SKILL.md); preserve [repository integration](docs/fallow.md) adaptations |
| Targeted evidence on unused code, dependencies, duplication, complexity, or PR changed-code risk | [Fallow](.agents/skills/fallow/SKILL.md); verify findings against actual consumers and contracts |
| Observed React component API, composition, or state-ownership problem | [Composition Patterns](.agents/skills/vercel-composition-patterns/SKILL.md); add Code Simplifier only when cleanup is also requested |
| Concrete React rendering, data-flow, or performance concern | [React Best Practices](.agents/skills/vercel-react-best-practices/SKILL.md); do not invoke for routine React edits or speculative optimization |
| Consequential changes with uncertain consumers or invariants | [Independent challenge review](.agents/skills/verification-before-completion/SKILL.md#independent-challenge-review); routine verification uses Definition of Done |
| Explore or clarify before committing to a change | [OpenSpec explore](.agents/skills/openspec-explore/SKILL.md) |
| Propose a non-trivial feature or architecture change | [OpenSpec propose](.agents/skills/openspec-propose/SKILL.md) |
| Revise an existing OpenSpec plan | [OpenSpec update](.agents/skills/openspec-update-change/SKILL.md) |
| Implement an approved OpenSpec change | [OpenSpec apply](.agents/skills/openspec-apply-change/SKILL.md) |
| Sync or archive an implemented OpenSpec change | [OpenSpec sync](.agents/skills/openspec-sync-specs/SKILL.md) or [archive](.agents/skills/openspec-archive-change/SKILL.md) |
| Decide what is next or identify parked work | [Roadmap triage](.agents/skills/roadmap-triage/SKILL.md) |
| Local context and targeted search leave repository context uncertain or cross-cutting | [JCodeMunch routing](.agents/skills/jcodemunch-routing/SKILL.md) |
| Explicit functional refactor | [Functional refactoring](.agents/skills/functional-refactoring/SKILL.md) |
| Explicit Gang of Four pattern question | [Design pattern](.agents/skills/design-pattern/SKILL.md) |
| Any Nemlig app work | [Nemlig instructions](apps/nemlig-assistant/AGENTS.md) |
| Nemlig product search, review, or basket operation | [Nemlig basket](apps/nemlig-assistant/.codex/skills/nemlig-basket/SKILL.md) |
| Nemlig production, deployment, or provider work | [Nemlig production](apps/nemlig-assistant/.codex/skills/nemlig-production/SKILL.md) |

Explicit task requirements and applicable repository instructions take
precedence over generic skill recommendations. A skill provides expertise; it
does not expand task scope or authorize unrelated changes.

## Code cleanup

Continuously reduce accidental complexity while preserving intentional
behavior; do not optimize line or file counts. For requested cleanup, follow
Code Simplifier's repository-specific guidance and introduce abstractions only
for demonstrated problems. A split must demonstrably remove an import
dependency, isolate a side effect, enable meaningful testing, or reduce another
concrete complexity; otherwise leave code together. A deletion audit reports
findings only; it does not authorize edits or deletion.

## Issue and OpenSpec ownership

The assigned GitHub issue is the canonical work/delivery contract: outcome,
scope, non-goals, acceptance, and task status. Verify it against repository
evidence; do not copy it into another plan unless a decision must persist.

OpenSpec is the canonical durable specification only for a new or materially
changed user/API/protocol/schema/safety/architecture contract. Link the issue
to that change instead of duplicating it. Task size alone does not require
OpenSpec; surface conflicts rather than choosing silently.

## Repository invariants

- Never simplify away validation, security, data-loss handling, or explicit requirements.
- Ordinary repository work is authorized in the selected scope. Ask before
  destructive or hard-to-reverse actions, external user-data changes, secrets,
  provider/production mutation, material scope expansion, or material cost.
- Delegation, OpenSpec, refactoring, review, inventory, or repository work never
  authorizes a Nemlig basket mutation. Keep credentials, tokens, cookies,
  profiles, proposals, audits, and support output local and ignored.
- Assess privacy, security, retries, scaling, storage, egress, logging, and paid
  effects. Preserve applicable quotas, circuit breakers, kill switches, bounded
  retries, and fail-closed behavior; do not recreate controls an owning app has
  explicitly removed. If cost may increase, stop with the current and proposed
  model, drivers, worst credible failure, and cheaper options.

## Delivery and release

- Preserve unrelated work; commit/push scoped work, open one PR, reconcile
  current `origin/main` without overwriting concurrent work, and require
  exact-head CI and the active GitHub ruleset before merge.
- The automatic Nemlig production workflow deploys a verified `main` SHA without
  a semantic-version bump, codename, or release-note file. A separately scoped
  package-identity release still needs one reviewed note at
  `apps/nemlig-assistant/release/notes/<version>.md`. Exact-SHA CI and
  `nemlig-production` approval govern deployment; npm publication remains
  disabled.
- Remove a task worktree only when clean, inactive, and recoverable; preserve
  dirty, active, unresolved, or deliberately parked worktrees.

---

<!-- fallow:setup-hooks:start -->
## Fallow checks

Use fallow for code-quality, cleanup, and setup tasks in this repository. Fallow checks the changed code before each `git commit` and `git push`. In Claude Code and Codex, a PreToolUse hook from `fallow agent install` runs this check and blocks the command when the verdict is `fail`. Other agents run the check themselves: `fallow audit --format json --quiet --explain --gate-marker agent`. If the verdict is `fail`, fix the reported findings before you try again. A JSON runtime error such as `{ "error": true, ... }` does not block.

Audit defaults to `gate=new-only`: only findings introduced by the current changeset affect the verdict. Inherited findings on touched files are reported under `attribution` and annotated with `introduced: false`, but do not block the commit. Set `[audit] gate = "all"` in `fallow.toml` to gate every finding in changed files.

For non-skill agents, treat the task map below as the local onboarding source: run the listed fallow command before destructive edits, before commits, and before pull request handoff.

## Fallow task map

| When the agent is about to... | Run |
|---|---|
| delete an "unused" export or file | `fallow dead-code --trace <file>:<export>` |
| prove a TypeScript symbol's exact consumers before refactoring | `fallow dead-code --type-aware --symbol-impact <file>:<export-or-class.method>` |
| find how one module reaches another | `fallow trace --path <from> <to>` (Reports `reachable: false` instead of failing when no import path exists; type-only hops are reported, not skipped.) |
| delete an "unused" dependency | `fallow dead-code --trace-dependency <name>` |
| migrate a dependency | `fallow trace --dependency <name> --sites` (Counts each imported name, follows one hop through project wrappers, and counts each use that it cannot resolve.) |
| commit or open a PR | `fallow audit --base <ref>` |
| read a diff before approving it | `fallow review --base <ref> --brief` (orientation, never gates: deterministic and always exit 0, unlike the audit row) |
| prioritize refactoring | `fallow health --hotspots --targets` |
| ask who owns code | `fallow health --ownership` |
| check untested-but-reachable code | `fallow health --coverage-gaps` |
| improve or check the tests of a change | `fallow mutation --plan --base <ref>` (The plan runs no code. Without `--plan`, the command runs the project tests against each mutant, so ask the user first.) |
| consolidate duplication | `fallow dupes --trace dup:<fingerprint>` |
| find feature flags | `fallow flags` |
| check which architecture rules apply to a file before changing it | `fallow guard <files>` |
| check import cycles, boundaries and policy rules after changing code | `fallow architecture` |
| surface security candidates | `fallow security` |
| understand a finding | `fallow explain <issue-type>` |
| scope a monorepo | `--workspace <glob> / --changed-workspaces <ref>` (global flags, prefix any command) |
<!-- fallow:setup-hooks:end -->
