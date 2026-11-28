# Local production dry run lacked a running container engine

- Date: 2026-11-27
- Scope: developer harness / Nemlig production readiness
- Task: https://github.com/mortenbroesby/everyday-assistants/issues/365
- Revision: 62f58d353bdcdf72b0832b18f519e4a43661541f
- Paths: docs/nemlig-production-readiness.md; apps/nemlig-assistant/package.json
- Category: environment
- Severity: medium

## Observation and evidence

The local `pnpm nemlig:production:ready` gate reached the Cloudflare production
dry run after its earlier validation/build/test/package stages. Wrangler failed
because it could not launch a usable Docker CLI/engine for the configured image.
A bounded follow-up found Docker CLI 29.7.2 installed, but `docker version`
could not connect to the configured local Colima daemon socket.

## Impact

One local readiness command failed at its final dry-run stage. No local deployment
occurred. Runtime and wasted resource usage were not measured. Independent GitHub
main CI and the protected production workflow for b039440 succeeded, including
candidate/image, edge and read-only service acceptance (45950996950). That is
separate evidence, not a claim that the failed local command passed.

## Hypothesis

The local container daemon was stopped or unavailable. The CLI's presence alone
is not a sufficient container-build capability check. Why the daemon was
unavailable is unknown; no application regression is established.

## Improvement and validation

Before repeating a local container-image readiness check, verify client and
server reachability with a bounded engine status command. Reuse equivalent CI
image evidence where appropriate. If local parity is required, start the existing
engine within the task's resource scope and rerun the failed stage; do not bypass
the Container build with a rollout-skipping flag or add another container system.

## Resolution

Local engine repair and rerun remain unperformed. Service deployment succeeded
through the existing protected workflow. No secret retrieval or provider/account
configuration change was used to work around the local failure.

### Verified follow-up

Readiness now checks the configured engine before validation and build. With the local Colima socket unreachable, the normal entry point exited 1 at this check. The focused command-order regression failed before the change and passed afterward. The engine itself remains unavailable locally; CI exercises the engine check and dry run on its own runner.
