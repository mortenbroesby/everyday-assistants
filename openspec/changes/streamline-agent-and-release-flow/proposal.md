## Why

Recent Nemlig work repeatedly used full local verification and production CI as
the debugging loop, which made small fixes slow and expensive. The repository
also requires a deployment label even though it already knows which pull
requests contain versioned Nemlig runtime changes.

## What Changes

- Make the main Codex thread the Sol coordinator and record a short,
  failure-driven verification loop: bootstrap a worktree once, run the narrow
  reproducer while iterating, perform a reality check after repeated failures,
  and run the full gate once for the final candidate.
- Treat one coherent epic outcome as the normal delivery unit: one dedicated
  branch, one pull request, one version decision, and at most one production
  deployment. An epic may contain multiple OpenSpec changes when they serve the
  same outcome and can be reviewed, verified, and released together. Keep small
  pull requests for urgent or independently risky changes, not every checkpoint.
- For long-running tasks, maintain one quiet thread heartbeat that notifies the
  user only when a concrete decision or approval is blocking progress, and stop
  it when the task finishes.
- Keep the existing full pre-push verification and add the existing Nemlig
  version-policy check against the branch merge-base, so release mistakes fail
  locally before remote CI.
- Preserve the active GitHub ruleset that requires pull requests and exact-head
  `verify` CI for `main`; repository instructions must not permit direct pushes.
- After successful push CI on a merged pull request, automatically submit a
  protected production release only when the existing package-scoped version
  policy classifies the merge as Nemlig release-bearing. Remove the deployment
  label as a trigger.
- Keep manual dispatch, the `nemlig-production` environment approval, exact-SHA
  checks, bounded execution, durable recovery, and all existing safety and cost
  limits.
- Enable GitHub's merged-branch deletion and remove a clean local worktree after
  its pull request is integrated and its commits remain recoverable. Never
  remove active, dirty, unresolved, or deliberately parked worktrees.
- Non-goals: npm publication, deployments for documentation/spec/agent/workflow
  changes or other assistants, automatic retries, removing production approval,
  changing Cloudflare capacity, or changing Nemlig product behavior.
- Acceptance: repository guidance maps each epic to one branch and pull request,
  permits related OpenSpec changes within that boundary, and retains exceptional
  small pull requests. Tests prove a versioned Nemlig runtime merge submits the
  exact merge SHA for protected release, ineligible merges skip before
  credentials or provider access, direct-main instructions are absent, and
  focused/full gates follow the documented one-pass workflow. GitHub reports
  merged-branch deletion enabled, completed local worktrees are removed only
  after clean and recoverable-state checks, and a waiting task emits one
  actionable notification rather than repeated status noise.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-cloudflare-hosting`: Replace label-selected deployment with automatic
  protected release selection for merged, CI-green, version-policy-eligible
  Nemlig changes.

## Impact

- Repository guidance: `AGENTS.md`, Definition of Ready, and Definition of Done.
- OpenSpec guidance: `openspec/config.yaml`.
- Local gate: `.husky/pre-push`, reusing the existing version-check command.
- Delivery: `.github/workflows/nemlig-production.yml`, its focused contract
  tests, Cloudflare operations documentation, and the existing hosting spec.
- GitHub: no new ruleset is needed; the active `main` pull-request and `verify`
  rules remain authoritative.
- Cost: every green `main` CI run performs one bounded eligibility check. Only
  eligible Nemlig runtime merges submit the existing protected release; there
  are no schedules, retries, extra builds, services, storage systems, or
  Containers.
