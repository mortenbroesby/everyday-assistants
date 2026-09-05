## Context

See [proposal.md](proposal.md). The current operator deploys from one MacBook
with Keychain-backed `gh` and Wrangler sessions. Wrangler already exposes JSON
for deployments, versions, Container applications, and instances; the existing
acceptance script already owns the bounded enabled probes. The repository config
keeps production disabled by default and fixes capacity at one `lite` Container.

## Goals / Non-Goals

**Goals:**

- Turn the documented release sequence into one resumable, fail-closed command.
- Prevent two invocations from reaching Cloudflare at the same time, including
  invocations from separate worktrees or machines using the same repository.
- Reuse the existing image for enablement and reuse existing acceptance code.
- Keep all evidence local and redacted except for an ephemeral GitHub lock ref.

**Non-Goals:**

- A push-triggered deployment, GitHub Actions deployment job, dashboard rewrite,
  new provider, new credential, or general infrastructure framework.
- Automatic recovery from a stale lease without operator reconciliation.
- Any Nemlig write-path acceptance.

## Decisions

### Use one TypeScript command and existing executables

Add one package script backed by a small TypeScript orchestrator. It uses Node
filesystem/process primitives plus the installed `git`, `gh`, Wrangler, and the
existing production acceptance script. A command runner seam is sufficient for
deterministic tests; no orchestration dependency or shell framework is added.

Alternative: a manually dispatched GitHub workflow. Rejected because it needs a
new hosted Cloudflare credential and consumes extra hosted CI minutes even though
the current operator environment already has the required authenticated tools.

### Acquire local and remote leases before provider reads

Create an exclusive local file beneath `git rev-parse --git-common-dir`, then
atomically create a fixed GitHub branch ref such as
`refs/heads/codex-lock/nemlig-production`. Existence means another operation owns
the lease. Delete only a ref created by this invocation and only after final state
evidence is written. An interrupted stale ref is never stolen automatically; the
operator reconciles Cloudflare state before removing it.

Alternative: only a filesystem lock. Rejected because linked worktrees share the
Git directory but another machine would not. A provider-side lease would add
runtime state and complexity to the production Worker.

### Journal state before and after every external transition

Write a redacted JSON journal below the common Git directory with the requested
commit, starting version, candidate versions, timestamps, completed checks, and
last verified state. Write via a temporary file and atomic rename. Store no token,
header, response body beyond the fixed disabled string, private data, or raw
provider error. The final summary is the journal's safe projection.

### Use the proven two-version, one-image sequence

Deploy the exact commit with the repository's default `MCP_ENABLED=false`, exact
revision variable, and a descriptive message. Wait within a fixed deadline until
both routes return the fixed 503 response and the sole Container instance is
inactive. Re-read Cloudflare deployment state, then deploy the identical source
with `MCP_ENABLED=true` and `--containers-rollout none`. Confirm the enabled
version exposes the exact revision and unchanged safety bindings.

Alternative: edit the dashboard variable. Rejected because it is less scriptable
and makes exact command/state evidence harder to reproduce. Building twice is
also rejected because the second Worker version can reuse the first image.

### Preflight all authentication and roll back to the recorded start

Before the first mutation, verify GitHub and Wrangler access and require a
non-empty owner access token only by presence. After enablement, run the existing
edge probe with the expected revision and the existing read-only feature test.
If enabled acceptance fails, invoke Wrangler rollback to the recorded starting
version, then read back deployment and health. A failed rollback yields an
explicit unknown or last-verified state; it is never reported as restored.

## Risks / Trade-offs

- [An interrupted process leaves the remote lease] → Keep it as a deliberate
  safety stop and document reconciliation plus exact-ref removal.
- [Cloudflare output changes] → Parse documented JSON output and version IDs,
  reject missing or unknown fields, and pin the tested Wrangler version.
- [Provider state changes between checks] → Check immediately before and after
  each mutation and stop on drift; the remote lease prevents cooperating command
  invocations from racing.
- [Rollback returns an older enabled application revision] → Record the exact
  starting version first and verify the resulting revision and health.
- [The command makes two Worker uploads] → The second uses no Container rollout;
  this is the minimum required to change the versioned kill switch while reusing
  the image.

## Migration Plan

1. Add and test the command in dry-run/fake-runner mode; update package scripts,
   backlog, and operations documentation.
2. Run repository and production-readiness gates without provider mutation.
3. Commit, integrate to `main`, and require exact-head CI.
4. With an owner token available and explicit production approval, invoke the
   command once for that exact `main` commit and retain its redacted summary.
5. If the command cannot finish, reconcile the reported version and lease using
   the existing manual runbook; keep the service disabled or restore the recorded
   starting version before removing a stale lock.
