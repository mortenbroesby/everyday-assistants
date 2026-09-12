## Why

The repository has root and app instructions, lifecycle gates, and eleven
task-specific skills, but no authoritative inventory explains which guidance an
agent should load. Discovery currently depends on knowing paths in advance, and
the app-local skill index has already drifted from the files it is meant to
describe.

## What Changes

- Add one machine-readable repository manifest that inventories maintained
  agent instructions, skills, and the supporting workflow surfaces they use.
- Route common task intents from the root instructions to the smallest relevant
  set of scoped instructions and skills, without copying their contracts into
  the manifest.
- Keep universal authority, safety, readiness, and completion boundaries at the
  root; move detailed delivery mechanics into one mandatory repository workflow
  instruction.
- Add a dependency-free validator that rejects malformed, unsafe, broken, or
  incomplete manifest entries and run it through the existing verification
  gate.
- Add two focused skills for recurring gaps exposed by the inventory: evidence-
  based roadmap triage and safe maintenance of the artifact catalog itself.
- Correct stale routing and release-approval prose while preserving every
  Nemlig mutation, credential, cost, and production safeguard.
- Non-goals: an executable agent framework, automatic skill invocation, a
  broad epic-delivery skill that duplicates mandatory workflow, a hosted
  registry, provider configuration, production deployment, or an agent review
  CI job.
- Acceptance: a new agent can start at root `AGENTS.md`, select the relevant
  guidance from the manifest, and reach every maintained instruction and skill;
  focused tests prove invalid references and inventory drift fail closed; and
  the repository's existing checks pass.

## Capabilities

### New Capabilities

- `agent-workflow`: Discover and validate repository-owned agent guidance and
  route tasks to the relevant scoped instructions and skills.

### Modified Capabilities

None.

## Impact

- Agent guidance: root and Nemlig-scoped `AGENTS.md`, app-local skill index, one
  extracted repository workflow instruction, and two repository-local skills.
- Agent metadata: `.agents/manifest.json`.
- Validation: a Node standard-library checker and focused tests, wired into the
  existing root verification command.
- Delivery: one worktree, branch, and pull request. This repository-only change
  does not change a package version and does not deploy.
- Cost and safety: no dependency, service, schedule, retry, storage, capacity,
  credential, external-data, or provider change.
