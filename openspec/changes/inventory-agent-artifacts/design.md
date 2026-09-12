## Context

See `proposal.md` for motivation. The durable guidance boundary is plain
Markdown: the root file is always loaded, a nearer `AGENTS.md` adds local
constraints, and task-specific skills are loaded only when their description
matches the request. The repository already has readiness and completion gates,
so routing should expose those contracts rather than create another registry.

Recent scheduled AI briefs supplied by the repository owner emphasized runtime-
enforced permissions, native worktrees, lazy tool discovery, model-neutral
instructions, and whole-task evaluation. Current primary guidance supports the
same direction:

- [AGENTS.md](https://agents.md/) describes a schema-free Markdown convention,
  nested scope, and closest-file precedence.
- [GitHub guidance for effective repository instructions](https://docs.github.com/en/copilot/tutorials/optimize-ai-usage)
  recommends short, specific, repository-grounded instructions and deterministic
  tools for behavior that can be checked mechanically.

## Goals / Non-Goals

**Goals:**

- Minimize always-loaded guidance while preserving repository invariants.
- Make common task routes directly readable without a parser or generated index.
- Keep model, vendor, and laptop orchestration preferences outside the repo.
- Measure static routing improvement honestly and define how real-task value
  will be assessed over time.

**Non-Goals:**

- Enforcing natural-language routing in CI, selecting a model, building an
  orchestration framework, or duplicating every skill description at root.

## Decisions

### Use a Markdown routing table, not a manifest

Root `AGENTS.md` will map recurring intents to the exact instruction or skill to
load. Plain links are inspectable by humans and agents, require no schema, and
can be checked with a small one-off link audit. A JSON manifest was rejected
because it added 357 lines plus 423 lines of validator code and tests while
proving only catalog consistency.

### Keep durable policy at root and specialized procedure on demand

The root keeps the readiness/completion gates, worktree and epic boundaries,
authority and cost safeguards, final verification, integration, and release
rules. It points to the nearest app instructions and to task-specific skills.
No mandatory intermediate workflow file is introduced. This avoids both an
oversized root and a multi-hop entry path.

### Describe work by responsibility, not model or persona

The repository may say that a coordinating agent owns integration and human
checkpoints, and that bounded independent work may be delegated when supported.
It will not name a model, vendor, or preferred persona. Those choices change
faster than repository contracts and belong in user or machine configuration.

### Evaluate navigation without pretending prose is executable behavior

`docs/agent-routing-evaluation.md` will test representative task-to-file routes
and compare always-loaded size across the baseline, rejected manifest design,
and revised design. It will state that route coverage and context size are
static evidence, not proof of task success. Future real work should track task
success, human interventions, avoidable tool retries, elapsed time, and total
cost before adding more guidance.

### Keep only the demonstrated new skill

`roadmap-triage` remains because repository planning repeatedly requires
reconciling specs, branches, worktrees, pull requests, and delivery evidence.
The artifact-maintenance skill is removed because its purpose disappears with
the manifest. Existing OpenSpec and refactoring skills remain routed on demand.

## Risks / Trade-offs

- [A route becomes stale] -> keep direct relative links and run a focused link
  audit when guidance changes; do not add a permanent framework pre-emptively.
- [Shortening loses a safety rule] -> compare root and scoped guidance against
  the pre-change root and retain every authority, cost, release, and mutation
  boundary.
- [The routing table grows into another catalog] -> list only recurring intents;
  use skill frontmatter as the detailed discovery contract.
- [Static evaluation is mistaken for outcome proof] -> label its limits and use
  real-task outcome metrics before future expansion.

## Migration Plan

1. Rewrite the existing OpenSpec artifacts around the simpler design.
2. Consolidate durable policy and direct routes in root `AGENTS.md`; keep scoped
   Nemlig guidance and the useful roadmap-triage skill.
3. Remove the manifest-specific files and package scripts, then record measured
   before/after routing evidence.
4. Run direct link and model-name checks, strict OpenSpec validation, privacy
   validation, and the final repository gate.
5. Push the revised PR and wait for exact-head CI and explicit merge approval.

Rollback is the normal Git revert of this repository-only commit. No provider or
production rollback applies.
