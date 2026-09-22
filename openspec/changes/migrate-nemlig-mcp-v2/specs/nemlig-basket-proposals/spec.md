## MODIFIED Requirements

### Requirement: Short-lived connection-bound proposals

The system SHALL generate cryptographically random opaque proposal IDs, store proposals only for a short configurable lifetime, and bind each proposal to its authenticated local principal, operation, and current basket fingerprint. An authenticated principal SHALL be able to continue a proposal across separate stateless HTTP requests; a transport server instance or client-supplied session identifier SHALL NOT define proposal ownership.

#### Scenario: Same principal presents a proposal in another HTTP request

- **WHEN** the authenticated principal that prepared a proposal presents it in a later HTTP request handled by a fresh MCP server instance
- **THEN** the server can locate the proposal and SHALL still enforce its operation, expiry, authorization, and current basket fingerprint before application

#### Scenario: Another connection presents a proposal

- **WHEN** a connection authenticated as a principal other than the one that prepared a proposal attempts to apply it
- **THEN** the server rejects the request and performs no mutation

#### Scenario: Proposal expires

- **WHEN** application begins after proposal expiry
- **THEN** the server treats the proposal as expired and requires a new proposal

#### Scenario: Process-local proposal state is lost

- **WHEN** a restart or replacement removes an uncompleted process-local proposal
- **THEN** the server fails closed, requires a fresh review, and does not infer approval or repeat an uncertain mutation
