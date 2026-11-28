## Purpose

Exercise an authenticated shopper against a synthetic catalogue across local, CI and private hosted environments.

## ADDED Requirements

### Requirement: Repeatable isolated shopping journey
The system SHALL exercise authenticated discovery, fixture search, temporary draft creation, viewer retrieval, quantity edit and reopen through the ordinary MCP endpoint.

#### Scenario: Reopening the synthetic draft
- **WHEN** the verified test shopper changes the quantity and reopens the same draft during its lifetime
- **THEN** the returned quantity matches the edit and the catalogue and state belong to the isolated environment.

#### Scenario: Private hosted acceptance
- **WHEN** an invited test shopper signs into the staging connector with development Auth0
- **THEN** the connector can display the staging viewer using staging assets, independently of production credentials and data.

### Requirement: Request timing evidence
The synthetic runner SHALL report bounded request outcomes and timings without including tokens, user input, draft handles or response bodies.

#### Scenario: First request and immediate repeat
- **WHEN** two equivalent authenticated requests complete
- **THEN** the report includes observed container state, authentication, readiness, response timing and validated protocol outcome for each sample.
