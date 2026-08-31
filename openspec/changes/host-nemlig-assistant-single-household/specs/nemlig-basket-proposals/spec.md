## MODIFIED Requirements

### Requirement: Short-lived connection-bound proposals

The system SHALL generate cryptographically random opaque proposal IDs, store
proposals only for a short configurable lifetime, and bind each proposal to its
operation, current basket fingerprint, selected runtime, authenticated owner when
hosted, and originating MCP session or local connection.

#### Scenario: Another connection presents a proposal

- **WHEN** a caller other than the authenticated owner and originating hosted
  session or local connection attempts to apply a proposal
- **THEN** the server rejects the request and performs no mutation

#### Scenario: Proposal expires

- **WHEN** application begins after proposal expiry
- **THEN** the server treats the proposal as expired and requires a new proposal

#### Scenario: Runtime loses pending proposal state

- **WHEN** a deployment or process restart removes an uncompleted in-memory
  proposal
- **THEN** application fails closed, requires fresh preparation and review, and
  never reconstructs or retries the missing mutation automatically
