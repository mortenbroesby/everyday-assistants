## Why

Repository guidance should help an agent reach the smallest relevant contract
without loading a second metadata system. The current root guidance is useful
but names transient model personas and leaves some task-specific skills hard to
discover; the first implementation made routing explicit at the cost of a large
manifest and validator that did not prove better task outcomes.

## What Changes

- Replace named model personas with durable, capability-based coordination
  guidance. Model and runtime selection remains a user or machine concern.
- Put a compact task-to-guidance table directly in root `AGENTS.md` and rely on
  nearest-scope `AGENTS.md` files plus on-demand skills.
- Keep the roadmap-triage skill, corrected Nemlig routing, and repaired
  documentation link because each addresses a demonstrated navigation gap.
- Record a small routing evaluation that compares baseline, rejected, and
  revised designs and defines outcome metrics for future real tasks.
- Remove the JSON manifest, its validator and tests, the extracted mandatory
  workflow file, and the maintenance skill created only for that machinery.
- Preserve all readiness, completion, safety, cost, worktree, integration,
  release, and mutation boundaries.
- Non-goals: an agent framework, committed model selection, automatic skill
  invocation, provider changes, deployment, or a permanent CI gate for prose.
- Acceptance: representative tasks have an explicit shortest route, no named
  model is required, the always-loaded root remains concise, broken routes are
  checked directly, and existing repository verification passes.

## Capabilities

### New Capabilities

- `agent-workflow`: Route repository tasks through concise, scoped,
  model-neutral instructions and evaluate whether the routing reduces context
  without losing required guidance.

### Modified Capabilities

None.

## Impact

- Agent guidance: root and Nemlig-scoped `AGENTS.md`, the app-local skill index,
  and one repository-local roadmap-triage skill.
- Evidence: a documentation-only routing evaluation with representative tasks
  and future whole-task measures.
- Removed machinery: `.agents/manifest.json`, its checker and tests, the
  extracted workflow instruction, and its maintenance skill.
- Delivery: one existing worktree, branch, and pull request. This repository-
  only change does not change a package version and does not deploy.
- Cost and safety: no dependency, service, schedule, credential, external-data,
  provider, or production change.
