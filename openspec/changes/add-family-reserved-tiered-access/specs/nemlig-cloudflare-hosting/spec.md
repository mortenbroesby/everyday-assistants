## MODIFIED Requirements

### Requirement: Authentication protects backend wake-up

The gateway SHALL authenticate the configured private-family Auth0 token,
authorize the subject against an encrypted owner-controlled principal policy,
and apply tier admission before forwarding a useful request, touching the MCP
Container, or contacting Nemlig. The default production policy SHALL contain
only the existing Tier 0 owner; the system SHALL NOT add public registration or
enable an invitee without separate owner action and isolation acceptance.

#### Scenario: Unauthenticated Internet request arrives

- **WHEN** a caller lacks valid authorization
- **THEN** the gateway rejects the request without reading usage state, waking
  or calling the MCP Container, or contacting Nemlig

#### Scenario: Unknown authenticated principal arrives

- **WHEN** a valid token belongs to a subject absent from the private principal
  policy
- **THEN** the gateway returns a stable non-sensitive denial without reading
  usage state, waking or calling the MCP Container, or contacting Nemlig

#### Scenario: Authenticated owner sends a valid request

- **WHEN** the configured Tier 0 owner presents valid authorization and the
  global and tier usage controls permit the request
- **THEN** the gateway forwards only the validated request to the fixed MCP
  Container for the owner's isolated account and state

#### Scenario: Allowed invitee sends a valid request

- **WHEN** an enabled configured principal presents valid authorization and the
  global and tier usage controls permit the request
- **THEN** the gateway forwards only the validated request to the fixed MCP
  Container for that principal's isolated account and state
