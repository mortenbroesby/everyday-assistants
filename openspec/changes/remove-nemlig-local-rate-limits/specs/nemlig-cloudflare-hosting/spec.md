## REMOVED Requirements

### Requirement: Per-owner rate limiting

**Reason**: Private family use does not require app-local request throttles.
**Migration**: Remove obsolete rate configuration before separately authorized
release. Do not retain an infinite-value gate or compatibility adapter.

### Requirement: Application-activity circuit breaker

**Reason**: The owner removes all app-local operation ceilings, not only minute rates.
**Migration**: Delete daily/class counters and usage/reset interfaces. Preserve
old stored records without reading or converting them; no live cleanup is authorized.

## ADDED Requirements

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

## MODIFIED Requirements

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
