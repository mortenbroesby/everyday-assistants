## MODIFIED Requirements

### Requirement: Hosted expansion requires a new security design

The system SHALL NOT extend the private hosted boundary to an additional Auth0
identity or Nemlig account unless an approved design defines private identity
mapping, per-principal isolation, revocation, credential ownership, and
an explicit activation gate. It SHALL NOT extend access to arbitrary public
users, checkout, payment, ordering, or delivery-slot mutation.

#### Scenario: Another household member is requested

- **WHEN** support for another Auth0 identity or Nemlig account is requested
- **THEN** that principal remains disabled until its separate identity and
  account are configured, isolation acceptance succeeds, and the owner
  explicitly enables it under the current private-family design

#### Scenario: Public access is requested

- **WHEN** an identity is not explicitly configured in the private principal
  policy
- **THEN** the current private implementation rejects it without public signup
  or fallback to another principal's account
