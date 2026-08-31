## Why

The existing Nemlig MCP needs a deferred, evidence-based Cloudflare hosting path
that preserves its behavior while bounding cost more strongly than availability.
This spike records the assessment and implementation gates now so Cloudflare can
be evaluated later without committing to a rewrite, production deployment, DNS
change, or billable resource.

### Goal

Prepare the private, family-only Nemlig MCP for pragmatic Cloudflare hosting with
the smallest safe migration, one backend Container at most, authentication before
backend access, and fail-closed controls that keep normal usage near the
then-current Workers Paid baseline (currently assumed to be approximately USD 5
per month and subject to verification before implementation).

### Non-goals

- Public scale, multi-household support, horizontal autoscaling, or arbitrary
  infrastructure provisioning.
- A Workers-native rewrite solely to avoid Cloudflare Containers.
- A large observability platform, a new complex identity platform, or a large
  staging estate.
- Production deployment, DNS changes, Cloudflare resource creation, secret
  provisioning, or Nemlig basket mutation as part of this proposal.

### Acceptance criteria

- Repository assessment records the runtime, Node.js requirements, incompatible
  APIs, process and transport assumptions, state that must survive restarts, and
  the relative fit of Workers, Workers plus Durable Objects, and Containers.
- The recommended architecture is recorded before implementation; absent strong
  contrary evidence, it is an authenticated Worker gateway in front of one
  deterministic, idle-sleeping Nemlig MCP Container.
- The design prevents generic autoscaling and fails closed before backend access
  when disabled, unauthenticated, rate-limited, over quota, or circuit-broken.
- The implementation, if separately authorized later, includes configurable
  kill-switch, quota, rate, resource, timeout, retry, logging, deployment, and
  operations controls with the requested failure-path tests.
- Production deployment and DNS remain separately and explicitly authorized.

## What Changes

- Add an assessment-first Cloudflare deployment spike for the existing Nemlig
  MCP, including `docs/cloudflare-hosting-assessment.md` before application work.
- Prefer the existing Dockerized MCP behind a thin Cloudflare Worker gateway and
  exactly one fixed Container unless inspection demonstrates a materially simpler
  Workers-native design without a substantial rewrite.
- Add an earliest-possible `MCP_ENABLED` kill switch, owner authentication,
  request validation, conservative per-owner rate limits, daily quotas, and a
  fail-closed global circuit breaker that does not depend on billing data.
- Bound Worker CPU/subrequests and all downstream timeouts and retries; prohibit
  unbounded, recursive, or work-regenerating retry behavior.
- Keep configuration reproducible, environments minimal, credentials secret,
  non-production isolated from the real basket by default, and observability
  limited to privacy-safe operational signals.
- Add Cloudflare deployment configuration, gateway tests, and
  `docs/cloudflare-operations.md` covering deployment, disable/enable, breaker
  inspection/reset, usage, secret rotation, rollback, and cost alerts.
- Treat USD 10 and USD 20 budget notifications as advisory only; the one-Container
  design and application controls remain the primary cost boundary.

## Capabilities

### New Capabilities

- `nemlig-cloudflare-hosting`: Cloudflare assessment, fixed-capacity gateway and
  Container deployment, fail-closed cost controls, and private operations.

### Modified Capabilities

None. The broader `nemlig-hosted-service` capability remains owned by the active
single-household hosting change; this deferred provider spike does not alter it.

## Impact

- Future work may affect `apps/nemlig-assistant/`, Cloudflare configuration,
  deployment and test scripts, and two operator documents under `docs/`.
- The current Auth0-secured tunnel work and existing local CLI and stdio MCP
  remain unchanged while this proposal is deferred.
- Cloudflare pricing, limits, product availability, regions, and configuration
  syntax must be verified against current official documentation when the spike
  is started; this proposal records targets rather than purchasing authority.
