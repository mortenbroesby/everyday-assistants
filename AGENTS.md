# Everyday Assistants repository instructions

This repository contains independent assistants under `apps/`.

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
- Preserve unrelated changes. Commit completed scoped work to `main`, push it,
  and verify the remote ref before handoff.
