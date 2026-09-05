## MODIFIED Requirements

### Requirement: Hosted owner and credential boundary

The production integration SHALL accept only an enabled subject in the
owner-controlled private principal policy, SHALL obtain that principal's Nemlig
credentials only from hosted secrets, and SHALL keep credentials, cookies,
access tokens, authorization headers, internal session identifiers, and
provider secret values out of tool results, logs, fixtures, committed files,
and model-visible content. Production SHALL contain only the existing owner by
default.

#### Scenario: Unauthenticated or unknown-principal request

- **WHEN** a request has no valid token or belongs to a subject absent from the
  enabled private principal policy
- **THEN** the gateway rejects it before the fixed backend performs a Nemlig
  operation

#### Scenario: Production login is required

- **WHEN** the hosted Nemlig client needs to establish or refresh a principal's
  session
- **THEN** it uses only that principal's configured hosted credential pair
  without requesting a password through ChatGPT or falling back to another
  principal's credentials

### Requirement: Private hosted distribution

The supported integration SHALL remain private and owner-controlled and SHALL
NOT require public directory submission, public review credentials, public
registration, or unrestricted account mapping.

#### Scenario: Hosted alpha is accepted

- **WHEN** the production acceptance suite passes and the owner keeps the app
  private
- **THEN** the hosted app remains the supported distribution without a tunnel
  registration or public listing

### Requirement: Hosted expansion requires a new security design

The system SHALL NOT extend the private hosted boundary to an additional Auth0
identity or Nemlig account unless an approved design defines private identity
mapping, per-principal isolation, revocation, quotas, credential ownership, and
an explicit activation gate. It SHALL NOT extend access to arbitrary public
users, checkout, payment, ordering, or delivery-slot mutation.

#### Scenario: Another household member is requested

- **WHEN** support for another Auth0 identity or Nemlig account is requested
- **THEN** that principal remains disabled until its separate identity and
  account are configured, isolation acceptance succeeds, and the owner
  explicitly enables it under the approved tiered-access design

#### Scenario: Public access is requested

- **WHEN** an identity is not explicitly configured in the private principal
  policy
- **THEN** the current private implementation rejects it without public signup
  or fallback to another principal's account
