## MODIFIED Requirements

### Requirement: Authentication protects backend wake-up

The gateway SHALL authenticate the configured private-family Auth0 token,
authorize the subject against an encrypted owner-controlled principal policy,
confirm that principal has a current credential generation through the existing
atomic admission boundary, and apply tier admission before forwarding a useful
request, touching the MCP Container, or contacting Nemlig. The default
production policy SHALL contain only the existing Tier 0 owner; the system SHALL
NOT add public registration or enable an invitee without separate owner action
and isolation acceptance.

#### Scenario: Unauthenticated Internet request arrives

- **WHEN** a caller lacks valid owner authorization
- **THEN** the gateway rejects the request without reading credential or usage
  state, waking or calling the MCP Container, or contacting Nemlig

#### Scenario: Unknown authenticated principal arrives

- **WHEN** a valid token belongs to a subject absent from the private principal
  policy
- **THEN** the gateway returns a stable non-sensitive denial without reading
  credential or usage state, waking or calling the MCP Container, or contacting
  Nemlig

#### Scenario: Authenticated owner sends a valid request

- **WHEN** the configured Tier 0 owner presents valid authorization, has a
  current credential generation, and the global and tier usage controls permit
  the request
- **THEN** the gateway forwards only the validated request and that owner's
  current sealed credential generation to the fixed MCP Container for the
  owner's isolated account and state

#### Scenario: Allowed invitee sends a valid request

- **WHEN** an enabled configured principal presents valid authorization, has a
  current credential generation, and the global and tier usage controls permit
  the request
- **THEN** the gateway forwards only the validated request and that principal's
  current sealed credential generation to the fixed MCP Container for that
  principal's isolated account and state

#### Scenario: Credential is absent or revoked

- **WHEN** an authenticated configured principal has no current credential
  generation
- **THEN** admission fails closed before Container wake or Nemlig access and
  returns only sanitized connection-required guidance

## ADDED Requirements

### Requirement: Encrypted principal credential records

The hosted service SHALL store each Nemlig credential pair as a bounded,
versioned, authenticated-encryption envelope scoped to one opaque principal key.
The encryption key SHALL be a separately managed hosted secret. Plaintext
credentials and encryption keys MUST NOT be persisted in Durable Object storage,
principal policy, logs, metrics, traces, responses, URLs, source control, or
deployment artifacts.

#### Scenario: Credential is stored

- **WHEN** bounded validation succeeds for an invited principal
- **THEN** storage contains only a schema version, credential generation,
  authenticated ciphertext, nonce, and non-secret timestamps bound to that
  principal's opaque key

#### Scenario: Stored record is copied to another principal

- **WHEN** a credential envelope is read or presented under a different
  principal key, schema, or generation than its authenticated binding
- **THEN** decryption fails closed and no Nemlig request is made

#### Scenario: Principal credential changes during an MCP session

- **WHEN** the current credential generation is rotated or revoked
- **THEN** subsequent requests cannot continue using a session bound to the old
  generation and must establish a new valid principal session or reconnect

### Requirement: Secure credential-management web boundary

The credential-management surface SHALL use a separate disabled-by-default
configuration switch, authoritative Auth0 browser authentication, server-side
session protection, CSRF defense, restrictive security headers, HTTPS, bounded
request bodies, and no third-party scripts. It SHALL reject client-supplied
internal credential headers and SHALL NOT rely on an identity or secret carried
in a connection URL.

#### Scenario: Credential onboarding is disabled

- **WHEN** the onboarding switch is not exactly enabled
- **THEN** connection, validation, rotation, and revocation requests fail closed
  before credential storage, Container wake, or Nemlig access while the ordinary
  MCP kill-switch behavior remains unchanged

#### Scenario: Cross-site or oversized submission arrives

- **WHEN** a credential request lacks valid browser-session and CSRF binding,
  violates the allowed origin, or exceeds the bounded input size
- **THEN** it is rejected before credential parsing, storage, Container wake, or
  Nemlig access

#### Scenario: Connection page is rendered

- **WHEN** an invited principal opens the authenticated connection page
- **THEN** it renders password-manager-compatible username and password fields,
  does not preload stored values, and uses no cacheable or third-party content

### Requirement: Bounded credential validation and cost

Credential validation SHALL perform at most one bounded Nemlig authentication
attempt and one bounded authenticated read, SHALL perform no basket, favorite,
profile, address, order, delivery-slot, or payment mutation, and SHALL be rate
limited per principal and globally before Container access. Credential lookup for
ordinary MCP traffic SHALL reuse the existing controller admission operation and
SHALL NOT add polling, a recurring job, another Container, another Durable Object
namespace, or another per-request storage round trip.

#### Scenario: Repeated invalid submissions occur

- **WHEN** a principal or the deployment exceeds the configured credential-
  validation rate
- **THEN** further attempts are rejected without waking the Container or
  contacting Nemlig and without affecting the previous credential record

#### Scenario: Maximum ordinary MCP workload occurs

- **WHEN** ordinary authenticated traffic reaches the existing hard operation
  ceilings
- **THEN** credential generation checks remain part of the existing bounded
  admission path and do not create request amplification, autoscaling, or
  unbounded storage growth

### Requirement: Credential migration is reversible

Production migration SHALL begin disabled, preserve a recorded pre-migration
rollback target, support the legacy owner credential only during the bounded
migration window, and remove credentials from the principal policy only after
the owner record passes read-only acceptance. No invitee SHALL be enabled until
their own record and isolation acceptance pass.

#### Scenario: Owner migration fails

- **WHEN** the owner cannot authenticate through the migrated credential record
  or any privacy, isolation, cost, or rollback check fails
- **THEN** the service remains disabled or returns to the recorded safe version
  without enabling an invitee or deleting the last known-good owner path

#### Scenario: Migration acceptance succeeds

- **WHEN** the owner record, one invitee record, generation invalidation,
  revocation, read-only ChatGPT access, logs, and cost controls all pass
- **THEN** the operator may remove legacy credentials from the principal policy
  and enable the invitee only through a separate explicit owner action
