## Purpose

Give an agent deterministic manual checks for the provider, MCP and rendered viewer boundaries of the shopping assistant.

## ADDED Requirements

### Requirement: Independently runnable segments
The harness SHALL support individual provider, MCP and browser checks and a single manual command to run them in sequence.

#### Scenario: Provider and MCP checks
- **WHEN** an agent exercises these profiles
- **THEN** real adapter code consumes synthetic upstream responses, and a generic MCP client can discover tools and read back the exact edited draft.

#### Scenario: Rendered edit
- **WHEN** an agent opens a tool result in the built widget and changes one unit to two
- **THEN** the server reports two on the original draft and the fixture reports zero forbidden provider operations.

### Requirement: Deeper local profiles
The harness SHALL support optional model-selected tools, signed local infrastructure checks and an operator-initiated read-only provider check.

#### Scenario: Native model routing
- **WHEN** a signed-in agent uses the Danish two-turn scenario
- **THEN** success requires the expected exact-draft tool result and browser edit readback.

#### Scenario: Cold and warm infrastructure
- **WHEN** the agent runs the local Wrangler and Docker profile
- **THEN** two equivalent authenticated discoveries report the observed container state, authentication, readiness, response timing and protocol outcome before exercising the shopping journey.

#### Scenario: Operator live read
- **WHEN** an operator supplies a development user token for the connected loopback service
- **THEN** the profile checks catalogue and basket reads and returns sanitized stage outcomes.
