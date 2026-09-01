## 1. Re-establish Current Evidence

- [x] 1.1 Verify current official Cloudflare Workers, Containers, Durable Objects,
  rate limiting, limits, regions, pricing, and budget-alert behavior; record dated
  source links and verify the normal family-use estimate against the then-current
  Workers Paid baseline.
- [x] 1.2 Inspect the Nemlig app's engines, entry points, package and Docker setup,
  process state, filesystem writes, child processes, browser dependencies, Node
  APIs, transports, persistent connections, authentication/session state, external
  calls, timeouts, and retries; verify every assessment item has file-level
  evidence.
- [x] 1.3 Classify all state as restart-discardable, restart-required, or external;
  verify pending mutations and indeterminate results retain their existing
  fail-closed behavior.
- [x] 1.4 Write `docs/cloudflare-hosting-assessment.md` comparing direct Workers,
  Workers plus Durable Objects, and one Container behind a Worker; verify it
  includes runtime compatibility, persistence, risks, expected execution model,
  recommendation, normal-cost estimate, data boundary, removal path, and manual
  steps.

## 2. Pass the Architecture and Cost Gate

- [x] 2.1 Confirm whether the existing Dockerized MCP can satisfy the contract
  behind one deterministic sleeping Container; verify a Workers-native path is
  recommended only if evidence shows it is materially simpler without a
  substantial rewrite.
- [x] 2.2 Present the assessment, exact provider resources, expected monthly cost,
  retained data, residual cost risks, and deletion procedure to the owner; record
  the resulting recommendation without creating Cloudflare resources.
- [x] 2.3 Stop before gateway or deployment implementation until the owner starts
  the implementation phase after reviewing the assessment; verify no Cloudflare
  resource, production secret, or DNS change exists from the spike.

## 3. Add the Fixed-Capacity Gateway

- [x] 3.1 Add the smallest current Cloudflare repository configuration for local
  and production environments, one fixed Container binding, and no generic
  autoscaling or infrastructure-provisioning path; verify configuration checks
  reject more than one backend instance and unsafe or missing safety values.
- [x] 3.2 Implement the Worker MCP route with the exact `MCP_ENABLED === "true"`
  check as its first meaningful branch; verify disabled requests return the
  specified 503 response without authentication backend, Durable Object,
  Container, or Nemlig calls.
- [x] 3.3 Reuse the existing single-owner Auth0 validation before usage state and
  Container access; verify unauthenticated and unauthorized requests cannot wake
  the backend.
- [x] 3.4 Add bounded request validation, operation classification, and forwarding
  to the one deterministic Container; verify unknown useful operations use the
  conservative metered class and capacity exhaustion cannot create infrastructure.

## 4. Add Usage Admission Controls

- [x] 4.1 Implement the minimal global usage state with usage-period key, normal
  and expensive counts, open flag, trip time, and enumerated reason; verify state
  updates and quota reservation are atomic before backend access.
- [x] 4.2 Add configurable daily and expensive-operation quotas with conservative
  defaults of 5,000 and 500; verify either exceeded limit opens the breaker and
  all later requests fail closed without calling the Container.
- [x] 4.3 Add safe next-period reset and authenticated manual reset behavior;
  verify reset does not bypass authentication and emits only a privacy-safe state
  event.
- [x] 4.4 Add per-owner normal and expensive rate limits with starting values of
  60 and 10 per minute; measure one complete MCP session and verify legitimate
  protocol chatter works while useful backend operations remain bounded.

## 5. Bound Runtime Work and Evidence

- [x] 5.1 Configure measured thin-gateway CPU and subrequest limits using current
  supported Cloudflare syntax; verify the limits are present in production
  configuration and the gateway performs no heavy MCP work.
- [x] 5.2 Audit and bound every Container and Nemlig request timeout and retry;
  verify there are no unbounded loops, recursive retries, scheduled keep-alives,
  regenerating queues, or retries of indeterminate basket mutations.
- [x] 5.3 Add minimal structured events for enablement rejection, authentication
  rejection, breaker trip/reset, counts, rate-limit rejection, Container
  invocation/wake, timeout, and revision; verify logs contain no secrets, tokens,
  cookies, prompts, baskets, or sensitive Nemlig data.
- [x] 5.4 Ensure non-production lacks real Nemlig mutation credentials by default;
  verify a local/development deployment cannot mutate the production basket
  without deliberate production credential configuration.

## 6. Test and Document Operations

- [x] 6.1 Add gateway tests for disabled, unauthenticated, and normal authenticated
  requests; verify disabled and unauthenticated cases never call the backend.
- [x] 6.2 Add tests for normal rate limit, daily quota, expensive-operation quota,
  open-breaker persistence, and backend non-invocation while tripped; verify each
  failure is 429 or 503 and fail closed.
- [x] 6.3 Add timeout and bounded-retry tests; verify the measured attempt count and
  elapsed bound cannot regenerate work after the request ends.
- [x] 6.4 Write `docs/cloudflare-operations.md` covering deploy, immediate disable,
  re-enable, breaker inspection/reset, usage, secret rotation, rollback, USD 10
  warning and USD 20 urgent budget alerts, and unavoidable manual steps; verify
  it does not claim an instantaneous billing hard cap.
- [x] 6.5 Run focused tests, `pnpm verify`, privacy checks, and strict OpenSpec
  validation; verify the exact commit passes without production credentials or a
  live Nemlig mutation.
- [x] 6.6 Return the recommended architecture, implemented changes, manual
  Cloudflare steps, current and residual cost risks, future Workers plus Durable
  Objects value, and first-production-deployment commands; verify no production
  deployment or DNS change has occurred without a separate explicit instruction.
- [x] 6.7 Add a narrow production acceptance test for authenticated discovery,
  exact addition preparation, approval mismatch rejection, one apply call, and
  fresh basket readback; verify it cannot select another mutation tool or persist
  the owner access token.
- [ ] 6.8 Run the safe edge probes and one separately approved production
  addition through the hosted MCP; verify the exact basket result and operational
  evidence, without automatically removing the item.
