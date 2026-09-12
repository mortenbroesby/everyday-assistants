# Everyday Assistants agent router

This repository contains independent assistants under `apps/`. Start here for
every repository task, then load only the guidance that applies to the current
scope and intent.

## Required workflow

1. Before implementation, apply
   [Definition of Ready](.agents/instructions/definition-of-ready.md).
2. For all repository work, apply
   [Repository workflow](.agents/instructions/repository-workflow.md).
3. Read [the agent artifact manifest](.agents/manifest.json), select every route
   whose `intent` matches the task, and load its listed artifacts.
4. When working below a directory with a more-specific `AGENTS.md`, load it as
   an additional contract. More-specific instructions add requirements; they do
   not remove root requirements.
5. Before reporting completion, apply
   [Definition of Done](.agents/instructions/definition-of-done.md).

These are repository requirements, not optional checklists. Record why any
criterion is inapplicable; if a criterion is unmet, keep the task active or
report the evidenced blocker instead of calling it done.

The manifest is a discovery index, not an instruction or an authorization
mechanism. Markdown instruction and skill files remain authoritative. If no
specialized route matches, use the required workflow and the nearest scoped
instructions; do not load every skill by default.

## Universal boundaries

- A user-selected repository task authorizes ordinary, non-destructive work in
  that scope. Ask when an action is destructive or hard to reverse, changes
  external user data, handles secrets, incurs material cost, mutates a provider
  or production system, materially expands scope, or requires an unresolved
  choice that changes the intended outcome.
- Delegation never transfers or broadens approval. The coordinating agent owns
  all human checkpoints.
- Never treat repository work, a refactor, review, inventory, recommendation,
  or OpenSpec change as approval to mutate a Nemlig basket.
- An OpenSpec proposal never authorizes implementation, provider changes, or a
  Nemlig mutation. Preserve the lifecycle boundary of the selected OpenSpec
  skill.
- Keep credentials, tokens, cookies, profiles, proposals, audits, and other
  local-only artifacts local and ignored.
- Preserve privacy, security, mutation controls, quotas, circuit breakers, kill
  switches, bounded retries, fail-closed behavior, and cost controls unless an
  approved design replaces them with equivalent safeguards.
- Before Nemlig work, also read
  [`apps/nemlig-assistant/AGENTS.md`](apps/nemlig-assistant/AGENTS.md) and select
  the matching manifest route for repository, production, or basket work.
