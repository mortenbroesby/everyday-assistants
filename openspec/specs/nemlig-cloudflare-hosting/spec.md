# Nemlig Cloudflare Hosting Specification

## Purpose

Defines a private Cloudflare hosting option for the Nemlig MCP that preserves its
safety contract and deliberately becomes unavailable before usage or cost can
grow without a strict bound.

## Requirements

### Requirement: Assessment precedes migration

The system SHALL have a repository-backed architecture assessment before any
Cloudflare application migration begins. The assessment SHALL identify the
current runtime and Node.js requirements; long-running process state; local
filesystem persistence; child processes; browser automation; unsupported Node.js
APIs; WebSockets or SSE; persistent TCP connections; in-memory authentication or
session state; restart-surviving state; and the comparative suitability of
Workers, Workers plus Durable Objects, and Containers.

#### Scenario: Migration path is selected

- **WHEN** the Cloudflare spike is started
- **THEN** `docs/cloudflare-hosting-assessment.md` records evidence, risks, state
  requirements, expected execution behavior, and a recommendation before code or
  deployment configuration is changed

#### Scenario: Workers-native migration requires substantial change

- **WHEN** the assessment finds that direct Workers deployment would require a
  substantial rewrite while the existing Dockerized MCP can meet this contract
  behind one Container
- **THEN** the Container path is selected rather than rewriting solely to avoid
  Containers

### Requirement: Backend capacity is fixed

The Cloudflare deployment SHALL address at most one deterministic production MCP
Container, SHALL NOT implement horizontal autoscaling or arbitrary dynamic
Container creation, and SHALL permit the Container to sleep while idle.

#### Scenario: Demand exceeds one Container

- **WHEN** authenticated demand exceeds the capacity of the single Container
- **THEN** requests degrade or fail without provisioning another Container or
  other infrastructure

#### Scenario: Service is idle

- **WHEN** no permitted MCP request requires the backend
- **THEN** the deployment permits the Container to remain asleep and performs no
  keep-awake work solely for availability

### Requirement: Earliest manual kill switch

Every MCP request SHALL check the non-secret `MCP_ENABLED` configuration before
meaningful-cost authentication, avoidable Durable Object access, Container
access, Nemlig access, or another expensive downstream operation.

#### Scenario: MCP is disabled

- **WHEN** `MCP_ENABLED` is not exactly `true`
- **THEN** the gateway returns HTTP 503 with `MCP temporarily disabled` and does
  not access the circuit breaker, Container, or Nemlig

#### Scenario: Emergency disable is required

- **WHEN** the operator changes the Cloudflare configuration override without
  changing application code
- **THEN** new MCP requests observe the disabled state through the documented
  emergency procedure

### Requirement: Authentication protects backend wake-up

The gateway SHALL authenticate and authorize the configured private-family owner
before forwarding a useful request, touching the MCP Container, or contacting
Nemlig. It SHALL preserve the existing owner authentication model where
practical and SHALL NOT add public registration or a general multi-user platform.

#### Scenario: Unauthenticated Internet request arrives

- **WHEN** a caller lacks valid owner authorization
- **THEN** the gateway rejects the request without waking or calling the MCP
  Container and without contacting Nemlig

#### Scenario: Authenticated owner sends a valid request

- **WHEN** the configured owner presents valid authorization and all usage
  controls permit the request
- **THEN** the gateway forwards only the validated request to the fixed MCP
  Container

### Requirement: Application-activity circuit breaker

The gateway SHALL maintain a global daily operation count, daily expensive-
operation count, breaker state, trip time, and trip reason from actual
application activity rather than delayed billing data. Limits SHALL be
configurable, with conservative initial targets of 5,000 total operations and
500 expensive operations per usage period.

#### Scenario: Daily operation quota is exceeded

- **WHEN** an accepted operation would exceed `MCP_DAILY_LIMIT`
- **THEN** the breaker opens, records the trip, rejects subsequent operations
  with HTTP 429 or 503, and does not wake or call the Container

#### Scenario: Daily expensive-operation quota is exceeded

- **WHEN** an accepted expensive operation would exceed
  `MCP_EXPENSIVE_DAILY_LIMIT`
- **THEN** the breaker opens, records the trip, rejects subsequent operations,
  and does not wake or call the Container

#### Scenario: Breaker has already tripped

- **WHEN** another operation arrives while the breaker is open
- **THEN** the gateway fails closed without accessing the Container or Nemlig

#### Scenario: Breaker reset is due

- **WHEN** a new usage period begins or the authenticated operator uses the
  documented manual reset procedure
- **THEN** the breaker resets safely with an auditable non-secret state change

### Requirement: Per-owner rate limiting

The gateway SHALL enforce configurable per-authenticated-owner limits for normal
and expensive operations before Container access. Initial targets SHALL be 60
normal operations per minute and 10 expensive operations per minute, adjusted
only when measured MCP protocol chatter requires it and with the adjustment
documented.

#### Scenario: Normal request rate is exceeded

- **WHEN** the owner exceeds `MCP_RATE_LIMIT` for the configured interval
- **THEN** the gateway rejects excess normal operations without calling the
  Container

#### Scenario: Expensive request rate is exceeded

- **WHEN** the owner exceeds `MCP_EXPENSIVE_RATE_LIMIT` for the configured
  interval
- **THEN** the gateway rejects excess expensive operations without calling the
  Container

#### Scenario: Required MCP protocol chatter occurs

- **WHEN** initialization, discovery, or other legitimate protocol traffic is
  measured during compatibility testing
- **THEN** rate classification preserves client compatibility without exempting
  useful backend operations from bounded usage controls

### Requirement: Execution and retry work is bounded

The Worker SHALL have explicit thin-gateway CPU and subrequest limits supported
by the current Cloudflare platform. Every external request SHALL have an explicit
timeout and bounded retry count, with no unbounded loop, recursive retry, or
queue or process that can indefinitely regenerate work.

#### Scenario: Nemlig or backend call times out

- **WHEN** a downstream operation exceeds its configured timeout
- **THEN** the request fails with sanitized error information after bounded work
  and is not retried indefinitely

#### Scenario: Retriable downstream failure persists

- **WHEN** every permitted retry fails
- **THEN** the gateway returns failure after the configured maximum attempt count
  and creates no replacement job or recursive request

### Requirement: Configuration and environments fail safe

Operational thresholds SHALL be configurable through at least `MCP_ENABLED`,
`MCP_DAILY_LIMIT`, `MCP_EXPENSIVE_DAILY_LIMIT`, `MCP_RATE_LIMIT`, and
`MCP_EXPENSIVE_RATE_LIMIT`; only credentials SHALL use secret storage. The
deployment SHALL provide local/development and production environments, and a
non-production environment SHALL NOT access or mutate the real Nemlig basket
unless deliberately configured with production credentials.

#### Scenario: Non-production is configured normally

- **WHEN** a developer runs or deploys the non-production configuration
- **THEN** real Nemlig mutation credentials are absent and real basket mutation
  fails closed

#### Scenario: Required safety configuration is invalid

- **WHEN** a threshold or environment binding is absent, malformed, or unsafe
- **THEN** deployment validation or service startup fails rather than silently
  selecting an unbounded default

### Requirement: Minimal privacy-safe observability

The service SHALL expose enough bounded, structured operational evidence to
determine whether the MCP is enabled, whether the breaker is open, current daily
normal and expensive counts, limit trips, rate-limit events, and unexpected
Container wakes. It SHALL NOT log authentication secrets, Nemlig credentials,
tokens, cookies, prompts, basket contents, or other sensitive Nemlig data.

#### Scenario: Operator inspects cost controls

- **WHEN** the operator follows the documented inspection procedure
- **THEN** current enablement, breaker state, counts, trip reason and time, rate
  limiting, and backend wake evidence are available without sensitive data

### Requirement: Reproducible and reversible operations

Cloudflare infrastructure configuration SHALL be reproducible from the
repository except unavoidable secrets, account or domain configuration, and the
emergency `MCP_ENABLED` override. Operations documentation SHALL cover deploy,
immediate disable, re-enable, breaker inspection and reset, usage inspection,
secret rotation, rollback, advisory USD 10 and USD 20 budget alerts, and the
absence of an instantaneous Cloudflare billing hard cap.

#### Scenario: Operator must stop usage immediately

- **WHEN** abnormal activity or cost risk is detected
- **THEN** the operator can disable new MCP work without a code change and verify
  that the backend is no longer called

#### Scenario: Candidate release is unsafe

- **WHEN** deployment verification fails or the new release regresses safeguards
- **THEN** the operator can roll back to a recorded safe release or keep the MCP
  disabled

### Requirement: Production activation remains explicit

Planning, assessment, implementation, and test work SHALL NOT by themselves
authorize a production Cloudflare deployment, DNS change, production credential
provisioning, or Nemlig basket mutation.

#### Scenario: Implementation is complete but production is not approved

- **WHEN** all repository deliverables and local tests pass without a separate
  production instruction
- **THEN** no production resource or DNS record is created or changed

### Requirement: Production acceptance verifies an approved basket write

The production deployment SHALL have a repeatable acceptance check that proves
an authenticated owner can prepare one exact basket addition, apply only that
unchanged proposal after explicit approval, and observe the resulting basket
readback. The check SHALL NOT expose a generic mutation interface, persist an
access token, or remove the test item without a separate exact approval.

#### Scenario: Exact addition is approved

- **WHEN** the owner has reviewed and explicitly approved the proposal's exact
  product name and ID, package or size, quantity, price, and line total
- **THEN** the acceptance check applies that proposal once and verifies both the
  apply response and a fresh basket readback contain the approved quantity

#### Scenario: Approval or proposal details do not match

- **WHEN** the approval is absent or any product, quantity, name, or proposal
  detail differs from the reviewed addition
- **THEN** the acceptance check fails before `apply_cart_additions` and leaves
  the basket unchanged
