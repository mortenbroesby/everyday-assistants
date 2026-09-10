## Why

Nemlig production releases currently depend on a careful sequence of manual
commands, making it easy to rebuild twice, overlap another deployment, or lose
track of the last verified state after interruption. A repository-owned command
can make the proven disabled-first procedure repeatable without adding a hosted
secret or paid service. The remaining manual dispatch step is easy to forget
after a reviewed Worker change has already passed CI.

## What Changes

- Add one explicitly invoked production deployment command that accepts an exact
  40-character commit from `main` and refuses to proceed unless local HEAD,
  refreshed remote `main`, and successful exact-head CI all match.
- Serialize deployments across local worktrees, record the starting Cloudflare
  version, and re-check remote deployment state before each mutation.
- Build and upload the Container once with `MCP_ENABLED=false`, verify both routes
  reject and the fixed Container is inactive, then enable the same revision while
  reusing that image.
- Run the existing bounded edge and authenticated read-only acceptance checks;
  never prepare or apply a proposal, mutate Nemlig data, or persist credentials.
- Emit one redacted summary containing commits, version IDs, timings, completed
  checks, last verified state, and rollback outcome.
- Keep production activation explicit. A manual dispatch or the
  `deploy:nemlig-production` label on the merged pull request may start the
  workflow; the protected environment remains the final approval.
- Require pull requests and green CI for `main`, so the deployed revision always
  comes from the reviewed merge path.
- Non-goals: scheduled or unlabeled deployment, a second environment or
  Container, new infrastructure, and any
  basket, favorite, or saved-list mutation.
- Acceptance: tests prove mismatched revisions, non-green CI, concurrent runs,
  failed disabled checks, changed Cloudflare state, missing owner authentication,
  and interrupted enablement all stop with a truthful fail-closed result; a
  controlled command test proves one image is reused through the successful path.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-cloudflare-hosting`: Require a repository-owned, serialized,
  disabled-first production release operation with exact revision and CI gates,
  single-build image reuse, bounded acceptance, and recoverable redacted evidence.

## Impact

- Affected areas: Nemlig production scripts and tests, package commands,
  Cloudflare operations documentation, and backlog status.
- External systems: GitHub pull-request labels, rulesets and CI checks, plus the
  existing Cloudflare Worker/Container deployment APIs after label or manual
  approval.
- Cost: no new dependency, workflow, service, secret, storage, scheduled run, or
  service or secret. Each merged `main` CI run adds one short label-check job;
  each approved release adds only the provider calls already used by the
  manual procedure: one image build/upload, one enabled Worker upload without a
  Container rollout, two disabled route probes, existing bounded acceptance
  probes, and small deployment/status reads. The one `lite` Container ceiling,
  sleep behavior, quotas, circuit breaker, timeouts, and kill switch remain
  unchanged.
