## MODIFIED Requirements

### Requirement: Per-principal isolation

The system SHALL bind each admitted request and MCP session to one authenticated
principal and SHALL use only that principal's Nemlig credentials, upstream
session, basket, favourites, proposals and approvals. A principal identifier
SHALL be opaque outside the encrypted policy and
SHALL NOT be accepted from an untrusted request field.

#### Scenario: Principal opens an MCP session

- **WHEN** an enabled principal initializes an MCP session
- **THEN** the session, client and proposal service are created
  for that authenticated principal only

#### Scenario: Session is reused by another principal

- **WHEN** a different authenticated principal presents an existing MCP session
  identifier or proposal reference
- **THEN** the request is denied without revealing whether the referenced state
  exists and without any Nemlig mutation

#### Scenario: Principal configuration is unavailable

- **WHEN** an admitted identity has no usable independent Nemlig credentials or
  its own session cannot be established
- **THEN** the operation fails without falling back to family or another
  principal's credentials, session, basket, favourites or proposals
