# Nemlig Cloudflare Hosting Specification

## Purpose

Defines a private Cloudflare hosting option for the Nemlig MCP that preserves its
safety contract and fixed capacity without application-owned request quotas,
tiers or throttles, and without claiming a hard billing guarantee.

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
  not access the Container or Nemlig

#### Scenario: Emergency disable is required

- **WHEN** the operator changes the Cloudflare configuration override without
  changing application code
- **THEN** new MCP requests observe the disabled state through the documented
  emergency procedure

### Requirement: Authentication protects backend wake-up

The gateway SHALL authenticate the configured private-family Auth0 token,
authorize the subject against an encrypted owner-controlled principal policy,
and verify independent encrypted credentials before forwarding a provider-backed request, touching the MCP
Container, or contacting Nemlig. The default production policy SHALL contain
only explicitly configured family identities; the system SHALL NOT add public registration or
enable an invitee without separate owner action and isolation acceptance.

#### Scenario: Unauthenticated Internet request arrives

- **WHEN** a caller lacks valid owner authorization
- **THEN** the gateway rejects the request without reading or creating state, waking
  or calling the MCP Container, or contacting Nemlig

#### Scenario: Unknown authenticated principal arrives

- **WHEN** a valid token belongs to a subject absent from the private principal
  policy
- **THEN** the gateway returns a stable non-sensitive denial without reading
  or creating state, waking or calling the MCP Container, or contacting Nemlig

#### Scenario: Authenticated owner sends a valid request

- **WHEN** the configured explicit owner presents valid authorization and a current
  independently bound credential
- **THEN** the gateway forwards only the validated request to the fixed MCP
  Container for the owner's isolated account and state

#### Scenario: Allowed invitee sends a valid request

- **WHEN** an enabled configured family member presents valid authorization and a
  current independently bound credential
- **THEN** the gateway forwards only the validated request to the fixed MCP
  Container for that principal's isolated account and state

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

The service SHALL retain explicit enablement, bounded request deadlines, fixed
capacity and private credential configuration. Development SHALL NOT mutate the
real Nemlig basket without deliberate credentials and exact approval. Removed
rate/daily/expensive/tier configuration SHALL NOT be redeployed as current
configuration. Only the current strict family policy SHALL be supported.

#### Scenario: Non-production is configured normally

- **WHEN** a developer runs the non-production configuration
- **THEN** real Nemlig mutation credentials are absent and real mutation fails closed

#### Scenario: Required safety configuration is invalid

- **WHEN** a retained required environment binding is absent, malformed or unsafe
- **THEN** startup or deployment fails without silently weakening retained safety

### Requirement: Minimal privacy-safe observability

The service SHALL expose bounded structured enablement, request-outcome and
Container-lifecycle evidence without tiers, budgets, usage headroom or cost
denials. It SHALL NOT log secrets, credentials, tokens, cookies, prompts,
basket contents or other sensitive Nemlig data.

#### Scenario: Operator inspects cost controls

- **WHEN** the operator follows documented operational inspection
- **THEN** enablement, sanitized outcomes and backend lifecycle evidence are
  available, and documentation explicitly states there is no app-enforced cost cap

### Requirement: Reproducible and reversible operations

Cloudflare infrastructure configuration SHALL be reproducible from the
repository except unavoidable secrets, account or domain configuration, and the
emergency `MCP_ENABLED` override. Operations documentation SHALL cover deploy,
immediate disable, re-enable, sanitized request/lifecycle inspection,
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

### Requirement: Automated production releases are exact and review-gated

The repository SHALL provide one production release operation that accepts an
exact `main` commit and requires successful CI for that exact revision before any
Cloudflare mutation. It MAY start from a manual dispatch or SHALL be submitted
after successful CI for a merged pull request whose exact merge range satisfies
the package-scoped Nemlig release policy, contains the required forward version,
and contains its reviewed agent-authored note. An ineligible merge MUST stop
before production credentials or provider access. The owner's explicit approval
of the release-bearing pull request SHALL be the sole human release checkpoint;
after that pull request is merged, exact-main CI, deployment, and publication
SHALL proceed without a second approval gate.

After routine deployment succeeds, a separate job SHALL publish the reviewed
note as a GitHub prerelease only when the schema-2 deployment journal identifies
the exact candidate and producing run, records success with the enabled state
and completion time, includes edge and service-fixture acceptance, and excludes
pending live acceptance. The journal commit, not the historical cutover
`acceptedRevision`, is the deployed revision.

#### Scenario: Exact release is authorized and ready

- **WHEN** the operator explicitly invokes the release operation with a full
  commit that equals local HEAD and refreshed remote `main` and exact-head CI is
  successful
- **THEN** the operation may proceed to its serialized Cloudflare preflight

#### Scenario: Labeled merge is ready

- **WHEN** the owner explicitly approves a pull request with a
  version-policy-eligible Nemlig change and its reviewed note, that pull request
  is merged to `main`, and CI succeeds for the exact merge commit
- **THEN** the routine release proceeds automatically for that exact commit
  without another human approval

#### Scenario: Merge is not labeled

- **WHEN** CI succeeds for a merge containing only documentation,
  specifications, agent instructions, workflow changes, another assistant, or
  other paths excluded by the package-scoped release policy
- **THEN** no production job receives credentials and Cloudflare is unchanged

#### Scenario: Source or CI does not match

- **WHEN** the supplied commit, checked-out HEAD, remote `main`, successful CI
  result, merge base, package version, or release note does not identify one
  coherent release
- **THEN** the operation fails before changing Cloudflare

#### Scenario: Exact routine deployment is published

- **WHEN** the automatic routine release succeeds for the exact candidate and
  its deployment journal contains every required terminal acceptance check
- **THEN** the downstream job publishes or confirms an idempotent prerelease
  whose tag resolves to that candidate and whose body matches its committed note

#### Scenario: Deployment evidence is not publishable

- **WHEN** the journal is failed, rolled back, incomplete, live-acceptance
  pending, for another commit or run, or missing a routine acceptance check
- **THEN** publication fails before creating or changing a tag or release

#### Scenario: Publication is retried

- **WHEN** deployment succeeded but GitHub publication was interrupted
- **THEN** the publication job reconciles retained exact-run evidence and
  matching remote state without redeploying, retargeting, or overwriting a
  conflict

#### Scenario: Manual finalize or supervised cutover runs

- **WHEN** the workflow only finalizes recovery or records pending supervised
  live acceptance
- **THEN** it does not publish a fresh application release

### Requirement: Automated releases are serialized and build once

The release operation SHALL hold one exclusive repository-wide production lease,
record and re-check the current Cloudflare deployment before each mutation, and
build and upload the candidate Container image once. Routine releases SHALL keep
`MCP_ENABLED=true` while Cloudflare rolls the candidate Container. The initial
supervised cutover and explicit local owner mode SHALL retain the disabled-first
verification path and enable the same revision without another Container build
or rollout. Every mode SHALL retain the existing Worker, one `lite` Container
maximum, bindings, routes, timeouts, manual kill switches, and secrets.

#### Scenario: Another release holds the lease

- **WHEN** another local or remote invocation already holds the production lease
- **THEN** the new invocation fails before changing Cloudflare and reports the
  existing lease without replacing it

#### Scenario: Routine candidate rolls out

- **WHEN** an accepted service cutover already exists and an exact descendant is
  released routinely
- **THEN** the operation deploys the candidate with `MCP_ENABLED=true` in one
  Cloudflare rollout and never deliberately returns the disabled response during
  a successful release

#### Scenario: Supervised disabled candidate is safe

- **WHEN** the candidate has been uploaded and deployed disabled
- **THEN** both production routes return HTTP 503 with `MCP temporarily disabled`
  and the fixed Container is inactive before enablement begins

#### Scenario: Supervised candidate is enabled

- **WHEN** the disabled checks pass and Cloudflare still identifies the expected
  disabled candidate as current
- **THEN** the operation enables the same commit and Container image without
  rebuilding or increasing capacity

#### Scenario: Cloudflare state changes unexpectedly

- **WHEN** the current deployment differs from the operation's last recorded
  version before a mutation
- **THEN** the operation stops without overwriting the unexpected deployment and
  reports the last state it verified

### Requirement: Automated releases are bounded and recoverable

Before mutation, the operation SHALL require every credential needed for its
read-only acceptance path without printing or persisting credential values. After
enablement it SHALL run bounded revision, health, OAuth metadata, cheap rejection,
and authenticated read-only acceptance checks that do not prepare or apply a
proposal or mutate a basket, favorite, or saved list. Every exit SHALL emit a
redacted summary of the commit, version IDs, timings, completed checks, rollback
attempt, and last verified production state.

#### Scenario: Required authentication is unavailable

- **WHEN** GitHub, Cloudflare, or owner read-only authentication is unavailable at
  preflight
- **THEN** the operation fails before changing Cloudflare and does not disclose or
  persist a credential

#### Scenario: Verification fails before enablement

- **WHEN** upload or disabled-state verification fails
- **THEN** the operation does not enable the candidate, releases no lease until it
  records whether production is disabled, and reports the exact last verified
  state

#### Scenario: Acceptance fails after enablement

- **WHEN** an enabled candidate fails any bounded acceptance check
- **THEN** the operation fails closed without rebuilding the image, verifies the
  resulting disabled or unknown state, and reports failure even if recovery
  succeeds

#### Scenario: Release succeeds

- **WHEN** the exact candidate passes every acceptance check required by its
  routine or supervised deployment mode
- **THEN** the operation reports the deployed commit and enabled version, releases
  its production lease, and records that rollback was unnecessary

### Requirement: MCP sessions recover after a Container replacement

The hosted MCP SHALL return HTTP 404 for a request that presents an unknown
`Mcp-Session-Id`, while retaining HTTP 400 for a non-initialize request that omits
the required session ID, so a conforming Streamable HTTP client can initialize a
fresh session after a Container replacement.

#### Scenario: Deployment replaces an in-memory session

- **WHEN** a client sends a previously valid session ID after the Container has
  been replaced
- **THEN** the MCP returns HTTP 404 without accessing Nemlig or changing basket,
  favourite, saved-list, account, or order state

### Requirement: Private requests have no application rate throttle

The service SHALL NOT reject eligible requests or authenticated credential
validations because of minute/day/month operation counts. It SHALL NOT retain
normal/expensive classes, tiers, budgets, reserves, forecasts or usage counters.
External limits SHALL remain external and SHALL NOT be bypassed. Authentication,
CSRF, credential validation, isolation, fixed capacity, deadlines, bounded work,
manual kill switches and exact protected writes SHALL remain enforced.

#### Scenario: Eligible burst exceeds former MCP thresholds

- **WHEN** authenticated eligible operations exceed former rate or daily thresholds
- **THEN** the app continues without an application count-based denial or counter write

#### Scenario: Valid credential submissions exceed former thresholds

- **WHEN** authenticated CSRF-protected credential validations exceed former thresholds
- **THEN** no rate gate blocks them; invalid credentials cannot replace verified ones

#### Scenario: Credential burst does not forget consumed authorization

- **WHEN** more than 32 actions occur while an earlier consumed signed token is valid
- **THEN** replay is rejected before provider work; hashes remain until expiry and
  storage failure does not permit the action

#### Scenario: Obsolete usage storage is present

- **WHEN** old usage/breaker records exist
- **THEN** current requests neither read, convert, reset nor enforce them
