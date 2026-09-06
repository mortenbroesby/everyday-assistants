## Why

Nemlig Assistant already has the runtime safety, private hosted architecture, acceptance probes, release policy, and operator runbooks needed for a single-household production alpha, but proving that state still requires a maintainer to discover and run several separate checks. Production readiness should be one repeatable, repository-owned gate that both humans and coding agents can follow without inventing infrastructure or weakening the existing safety and cost boundaries.

## What Changes

- Add one deterministic production-readiness command that composes the existing repository verification, package-tarball smoke test, and Cloudflare production dry run.
- Run the same gate in CI so production artifacts cannot drift from the tested source and specifications.
- Add one reusable Nemlig production-readiness skill that routes agents through preflight, local evidence, optional live acceptance, and handoff while preserving explicit approval for provider changes and basket mutations.
- Add a concise evidence checklist that links to the existing deployment, rollback, secret rotation, breaker, and live acceptance procedures instead of duplicating them.
- Record production-readiness evidence in a stable, human-readable form suitable for the tracking GitHub issue.
- Keep the private single-owner alpha, fixed one-Container limit, quotas, circuit breaker, kill switch, bounded retries, Auth0 owner restriction, and prepare/approve/apply basket contract unchanged.

### Goals and acceptance criteria

- One documented command fails when root verification, package installation smoke, Cloudflare production validation, or strict OpenSpec validation fails.
- CI runs that command on pull requests and `main` without credentials or live Nemlig access.
- The checked-in skill distinguishes repository checks from owner-approved production actions and never treats a passing check as deployment or basket authorization.
- The evidence checklist identifies which checks are automated, which live checks require owner configuration, and which external actions remain intentionally manual.
- Existing production and cost safeguards remain covered by runnable checks; no new paid service, autoscaling path, queue, database, or observability vendor is introduced.

### Non-goals

- Public npm publication, public ChatGPT distribution, multi-user or multi-account support, checkout, payment, ordering, or delivery-slot mutation.
- Creating or changing Cloudflare, Auth0, DNS, GitHub, npm, or Nemlig state as part of repository verification.
- Replacing the existing Cloudflare operations runbook, production acceptance implementation, release policy, or basket skill.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-package-distribution`: Require one CI-enforced production-readiness gate to validate the repository, private packed package, strict specifications, and production Cloudflare artifact without credentials or live provider mutation.

## Impact

The change is limited to repository scripts/package commands, CI, the Nemlig app's checked-in agent skills, concise operations documentation, and tests for the gate. It reuses installed tools and existing acceptance code; it adds no runtime dependency, hosted resource, external data mutation, or plausible material operating-cost increase.
