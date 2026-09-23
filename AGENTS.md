# Everyday Assistants repository instructions

This repository contains independent assistants under `apps/`. Laptop-global
instructions supply generic engineering behavior; this file supplies only
repository routing, invariants, and delivery policy.

## Required gates

- Before implementation, apply the
  [Definition of Ready](.agents/instructions/definition-of-ready.md).
- Before reporting completion, apply the
  [Definition of Done](.agents/instructions/definition-of-done.md).
- Record inapplicable items; do not claim an unmet applicable item.
- The nearest `AGENTS.md` adds scope-specific requirements. Loading guidance
  never grants authority for secrets, provider changes, production actions, or
  basket mutations.

## Task routing

Load only the specialized guidance that matches the task.

| Task intent | Load |
| --- | --- |
| Explore or clarify before committing to a change | [OpenSpec explore](.agents/skills/openspec-compact/explore/SKILL.md) |
| Propose a non-trivial feature or architecture change | [OpenSpec propose](.agents/skills/openspec-compact/propose/SKILL.md) |
| Revise an existing OpenSpec plan | [OpenSpec update](.agents/skills/openspec-compact/update-change/SKILL.md) |
| Implement an approved OpenSpec change | [OpenSpec apply](.agents/skills/openspec-compact/apply-change/SKILL.md) |
| Sync or archive an implemented OpenSpec change | [OpenSpec sync](.agents/skills/openspec-compact/sync-specs/SKILL.md) or [archive](.agents/skills/openspec-compact/archive-change/SKILL.md) |
| Decide what is next or identify parked work | [Roadmap triage](.agents/skills/roadmap-triage/SKILL.md) |
| Simplify working code without behavior change | [Code simplification](.agents/skills/code-simplification-compact/SKILL.md) |
| Explicit functional refactor | [Functional refactoring](.agents/skills/functional-refactoring-compact/SKILL.md) |
| Explicit Gang of Four pattern question | [Design pattern](.agents/skills/design-pattern-compact/SKILL.md) |
| Any Nemlig app work | [Nemlig instructions](apps/nemlig-assistant/AGENTS.md) |
| Nemlig product search, review, or basket operation | [Nemlig basket](apps/nemlig-assistant/.codex/skills/nemlig-basket/SKILL.md) |
| Nemlig production, deployment, or provider work | [Nemlig production](apps/nemlig-assistant/.codex/skills/nemlig-production/SKILL.md) |

Selecting guidance never grants authority for the action it describes.

## Issue and OpenSpec ownership

The assigned GitHub issue is the canonical work/delivery contract: outcome,
scope, non-goals, acceptance, and task status. Verify it against repository
evidence; do not copy it into another plan unless a decision must persist.

OpenSpec is the canonical durable specification only for a new or materially
changed user/API/protocol/schema/safety/architecture contract. Link the issue
to that change instead of duplicating it. Task size alone does not require
OpenSpec; surface conflicts rather than choosing silently.

## Repository invariants

- Use Ponytail full mode for repository code work: understand and trace the real flow first, then prefer YAGNI, reuse, standard/native capabilities, and the smallest correct change. Never simplify away validation, security, data-loss handling, or explicit requirements.
- Ordinary repository work is authorized in the selected scope. Ask before
  destructive or hard-to-reverse actions, external user-data changes, secrets,
  provider/production mutation, material scope expansion, or material cost.
- Delegation, OpenSpec, refactoring, review, inventory, or repository work never
  authorizes a Nemlig basket mutation. Keep credentials, tokens, cookies,
  profiles, proposals, audits, and support output local and ignored.
- Assess privacy, security, retries, scaling, storage, egress, logging, and paid
  effects. Preserve quotas, circuit breakers, kill switches, bounded retries,
  and fail-closed behavior. If cost may increase, stop with the current and
  proposed model, drivers, worst credible failure, and cheaper options.

## Delivery and release

- Preserve unrelated work; commit/push scoped work, open one PR, reconcile
  current `origin/main` without overwriting concurrent work, and require
  exact-head CI and the active GitHub ruleset before merge.
- Release-bearing Nemlig work needs one reviewed note at
  `apps/nemlig-assistant/release/notes/<version>.md`. Package version policy,
  exact-SHA CI, and `nemlig-production` approval govern release/deployment;
  npm publication remains disabled.
- Remove a task worktree only when clean, inactive, and recoverable; preserve
  dirty, active, unresolved, or deliberately parked worktrees.
