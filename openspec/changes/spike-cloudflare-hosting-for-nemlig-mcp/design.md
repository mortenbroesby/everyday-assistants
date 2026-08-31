## Context

See `proposal.md` for motivation and
`specs/nemlig-cloudflare-hosting/spec.md` for the behavior contract. The current
single-household hosting change is proving an Auth0-protected HTTP MCP boundary
through the existing tunnel before selecting a permanent host. This separate
Cloudflare change is intentionally deferred and must begin with fresh repository
and official-platform evidence.

The present planning record describes the MCP as a Node 22 process with
process-local sessions, proposals, completed-result state, and mutation locking,
plus owner-only file snapshots. Those statements are inputs to verify, not a
substitute for the required assessment. Cloudflare product capabilities,
configuration syntax, regional availability, and pricing are also time-sensitive
and must be checked when work starts.

## Goals / Non-Goals

**Goals:**

- Preserve the existing MCP contracts and safety behavior with the fewest
  application changes.
- Put every low-cost rejection before the fixed backend Container whenever the
  request ordering permits it.
- Make one sleeping Container, not platform elasticity, the maximum backend
  footprint.
- Make disablement, automatic trip behavior, inspection, and recovery simple
  enough for a family operator.

**Non-Goals:**

- Selecting Cloudflare now, creating resources, or replacing the active Auth0
  tunnel milestone.
- Designing for public scale or high availability.
- Externalizing all process state merely to make a Workers-native rewrite
  possible.

## Decisions

### Gate implementation on a written runtime assessment

The first deliverable is `docs/cloudflare-hosting-assessment.md`. Inspect actual
entry points, package engines, Docker configuration, filesystem writes, session
and proposal lifecycles, mutexes, network transports, Node APIs, child processes,
browser dependencies, and retry paths. Record what must survive a restart and
what may safely fail closed.

Compare three paths against that evidence:

1. Direct Workers runtime.
2. Workers plus Durable Objects with application state moved out of process.
3. A thin Worker in front of one Cloudflare Container running the existing MCP.

Choose option 3 unless another option is demonstrably smaller and preserves the
contract. The architecture note is a review gate: application and deployment
implementation starts only after the recommendation, then-current price, and
manual Cloudflare resources are presented to the owner.

### Use a thin gateway and one deterministic Container by default

The default request path is:

```text
ChatGPT/client
  -> Worker: MCP_ENABLED check
  -> cheap request validation
  -> existing owner authentication
  -> per-owner rate control and global breaker
  -> one deterministic Container instance
  -> existing Nemlig MCP
```

The gateway performs no heavy MCP processing. It has no generic scale-out code,
no arbitrary instance identifier derived from user input, and no infrastructure
creation permission. A single fixed instance mapping is repository configuration
and must be asserted by tests or deployment validation. Capacity exhaustion is
an availability failure.

Alternative considered: an always-on general container host. It is simpler in
some respects, but does not satisfy this spike's explicit idle sleep and
Cloudflare cost-control investigation. The existing Render comparison remains
separate evidence rather than an implementation dependency.

### Reject work in cost order

`MCP_ENABLED` is the first branch in the MCP route and compares the string value
exactly with `true`. It returns the specified 503 response without avoidable
stateful or downstream work. After cheap structural validation, authorization is
validated locally where the existing Auth0 token design permits it; invalid
Internet traffic never reaches the Container or usage state.

Only an authorized, structurally valid request reaches the rate and quota
control. Valid MCP messages other than `tools/call` are protocol traffic so
client discovery and future protocol extensions do not consume useful-operation
quota. Known read and prepare tools are normal; apply tools and unknown tool
calls fail into the conservative expensive class.

### Keep the breaker and exact per-owner counters in the smallest native state

Prefer one Durable Object for the global daily breaker because it naturally
serializes counters and trip state. Use Cloudflare's current native rate-limit
primitive instead only if it can enforce the required authenticated-owner key,
separate normal/expensive classes, predictable failure behavior, and local test
coverage with less machinery. Otherwise the same Durable Object may hold bounded
per-owner windows for this one-owner service.

Store only the current usage-period key, normal and expensive counts, open flag,
trip timestamp, and enumerated reason. Check open state and atomically reserve an
operation before Container access. Crossing a quota opens the breaker in the same
transaction. The next usage period lazily initializes a fresh closed record;
manual reset is an authenticated operator action documented in the runbook.

No billing API participates in request admission. Budget alerts are secondary,
delayed notifications only.

### Make all work finite

Set the lowest current Worker CPU and subrequest limits that support token
validation, state admission, and proxying with measured headroom. Use explicit
abort timeouts for Container and Nemlig calls. Preserve a retry only where the
existing operation is demonstrably safe and idempotent; cap attempts in one
place. Never retry a basket mutation with an indeterminate result.

Do not add queues, scheduled keep-alives, recursive fetches, or retry workers.
One request owns a finite amount of work and eventually returns failure.

### Reuse private owner authentication

Keep the Auth0 single-owner issuer, audience, scope, and immutable subject model
being established by the active tunnel change unless the assessment finds a
Cloudflare compatibility blocker. Validate authorization before state admission
or Container access. Do not add Cloudflare Access or another identity provider
merely because it is available.

### Keep configuration small and fail closed

Use repository configuration for bindings, fixed instance identity, resource
limits, routes, and local/production environments. Keep the five requested
controls configurable and validate numeric values as positive bounded integers.
Credentials and signing material remain secrets; `MCP_ENABLED` and thresholds do
not.

Development has no production Nemlig credentials by default. Do not add staging
unless the existing workflow makes an isolated preview effectively free and it
cannot reach the real basket.

### Use platform evidence and small structured logs

Emit bounded events for gateway rejection class, breaker trip/reset, rate-limit
rejection, Container invocation/wake, timeout, and deployment revision. Include
counts and enumerated reasons, not request bodies or identity and Nemlig data.
Use Cloudflare's native logs and metrics; add no external observability service.

### Keep production a separate owner action

Repository work ends with locally verified configuration and exact deployment
instructions. `docs/cloudflare-operations.md` distinguishes repository setup,
Cloudflare account and secret steps, emergency override, first production deploy,
and DNS. Production commands are returned for review but not executed without a
new explicit instruction.

## Risks / Trade-offs

- **Cloudflare Containers or fixed-instance behavior differs from this brief** →
  verify current official behavior first and stop for a revised recommendation
  rather than emulating the assumption with dynamic infrastructure.
- **A sleeping Container loses volatile state** → classify state in the
  assessment; retain fail-closed proposal loss and persist only state the current
  safety contract genuinely requires.
- **MCP protocol chatter consumes quotas** → measure a complete client session,
  classify transport chatter narrowly, and document any threshold adjustment.
- **A Durable Object becomes a single point of failure** → accept unavailability;
  never bypass it when state is unavailable.
- **Cloudflare billing can exceed an alert before notification** → rely on fixed
  backend capacity and application activity controls, not a claimed hard cap.
- **Gateway or logs expose household data** → proxy only required fields and use
  enumerated, body-free structured events.
- **One Container is unavailable** → keep the existing authenticated tunnel as a
  fallback until a separately approved cutover; do not scale out automatically.

## Migration Plan

1. Re-verify Cloudflare pricing, limits, regions, Container lifecycle, fixed
   instance semantics, supported configuration, and budget-alert behavior.
2. Inspect the repository and write the assessment and recommendation without
   changing the application.
3. Present architecture, normal-cost estimate, data boundary, removal path, and
   unavoidable manual steps before Cloudflare resource creation.
4. After a separate apply instruction, implement the gateway, state controls,
   fixed Container configuration, finite downstream work, tests, and runbook.
5. Verify locally and with non-production credentials that cannot mutate the real
   basket.
6. Return first-deploy commands and residual cost risks. Stop before production
   deployment and DNS until explicitly instructed.

Rollback keeps `MCP_ENABLED` false or restores the last verified configuration
and image. If breaker or backend state is uncertain, leave the service disabled
and retain the Auth0-secured tunnel path.

## Open Questions

- Which current Cloudflare region and Container plan meet the required data and
  approximate monthly-cost boundary when implementation begins?
- Does the then-current Cloudflare rate-limit primitive provide exact enough
  per-authenticated-owner behavior to replace rate windows in the breaker Durable
  Object?
