# Everyday Assistants repository instructions

This repository contains independent assistants under `apps/`.

- A user-selected repository task is standing authority for ordinary,
  non-destructive work in that scope: inspect, plan, update OpenSpec, edit, run
  checks, commit, push, and verify without asking for repeated approval.
- Ask only when an action is destructive or hard to reverse, changes external
  user data, incurs cost, handles secrets, materially expands scope, or depends
  on a missing choice that cannot be resolved safely from repository context.
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
