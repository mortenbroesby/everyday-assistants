## Context

See `proposal.md` for motivation. The app already implements the production runtime and safety design: a private Auth0-owner boundary, one fixed Cloudflare Container, quotas, rate limits, a circuit breaker, a kill switch, bounded retries, approval-bound basket writes, production acceptance code, package smoke tests, release policy, and an operations runbook. The missing layer is a single repository-owned path that assembles evidence and tells maintainers and agents where repository authority ends.

The current working tree also contains unrelated OpenSpec archive changes. Implementation must preserve them and commit only this change's scoped files.

## Goals / Non-Goals

**Goals:**

- Make the existing production evidence runnable through one command locally and in CI.
- Keep the operational workflow discoverable to coding agents through one checked-in skill.
- Make automated, live read-only, live write, and provider-administration evidence visibly distinct.
- Add no runtime dependency or hosted component.

**Non-Goals:**

- Refactor working runtime modules into new interfaces, factories, or service layers.
- Automate provider setup, secret entry, deployment, or production basket acceptance.
- Redefine "production ready" as public, multi-user, generally available, or npm-published.

## Decisions

### Compose existing commands in package scripts

Add one root production-readiness script that sequentially invokes strict OpenSpec validation, the public-tree privacy check, root verification, the Nemlig packed-package smoke test, and the Cloudflare production dry run. CI calls that same script.

This keeps the command as the source of truth while every constituent check remains independently runnable and debuggable. A custom TypeScript orchestrator, JSON manifest, task framework, and duplicated test suite are rejected because they add code without adding validation.

### Keep live acceptance outside the credential-free gate

The automatic gate stops at the Cloudflare dry run. The existing edge and feature acceptance commands remain separate because they require a configured production endpoint, owner authentication, and potentially explicit approval for an exact reversible basket mutation.

The production-readiness evidence document labels these as owner-run checks and links to `docs/cloudflare-operations.md`. A green CI check is therefore useful evidence, never deployment or mutation authority.

### Add one production skill, not a skill hierarchy

Add `apps/nemlig-assistant/.codex/skills/nemlig-production/SKILL.md`. It performs preflight, invokes the single repository gate, reads the existing operations guide, and routes optional live checks through explicit owner authority. It refers basket work to the existing `nemlig-basket` skill instead of duplicating approval rules.

Separate deploy, release, incident, and acceptance skills are rejected until their workflows materially diverge. The single skill's ceiling is reached if multiple operators or environments need different authority boundaries.

### Maintain one concise evidence checklist

Add `docs/nemlig-production-readiness.md` as a short index of automated evidence, owner-run live evidence, and intentionally manual external actions. It links to the existing detailed runbook and acceptance commands rather than copying procedures. Its checklist can be pasted into or linked from the tracking GitHub issue.

## Risks / Trade-offs

- [The aggregate gate increases CI duration] → It adds only existing local dry-run and package checks, no hosted workload; keep commands sequential and measure before introducing caching or parallel orchestration.
- [A single command can hide which check failed] → Preserve native command output and fail immediately at the constituent command.
- [The checklist can become stale] → Test or lint command names where practical and require the production skill and README to link to the same checklist.
- [Agents may treat "production ready" as deployment approval] → State the repository/provider/basket authority boundaries in the skill, checklist, spec, and gate output.

## Migration Plan

1. Add the aggregate script, checked-in skill, and concise evidence checklist.
2. Run the aggregate gate locally and fix only production-readiness regressions it exposes.
3. Update CI to call the aggregate gate and validate the OpenSpec change strictly.
4. Commit and push the scoped change, verify the remote ref, and record automated evidence in the tracking issue.
5. Leave live production acceptance and any provider changes pending until the owner explicitly requests them.

Rollback is a normal revert of the package-script, CI, skill, and checklist commit. Runtime behavior and production state are unchanged.
