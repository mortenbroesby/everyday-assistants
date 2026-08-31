## ADDED Requirements

### Requirement: Authenticated Streamable HTTP MCP server

The system SHALL expose the existing safe Nemlig MCP capability over one HTTPS
Streamable HTTP endpoint for hosted use, SHALL authenticate every MCP request,
and SHALL preserve the local stdio server.

#### Scenario: Authorized hosted client initializes

- **WHEN** the configured owner connects to the hosted endpoint with a valid
  authorization
- **THEN** the server completes MCP initialization and exposes the compatible
  tools, resources, schemas, annotations, and server instructions

#### Scenario: Hosted request is unauthenticated or unauthorized

- **WHEN** a request lacks valid authorization or resolves to an unapproved owner
- **THEN** the server rejects it before tool dispatch or any Nemlig request

### Requirement: Transport-compatible tool contracts

The hosted and stdio transports SHALL expose equivalent model-visible tool names,
input schemas, output schemas, annotations, structured results, and safety
behavior, except for transport-specific authentication and health metadata.

#### Scenario: Tool surfaces are compared

- **WHEN** automated contract tests enumerate the stdio and hosted servers from
  the same revision and configuration
- **THEN** their safe Nemlig tool and resource contracts match without adding a
  direct mutation, recipe, checkout, payment, order, or delivery-slot capability

#### Scenario: Hosted tool fails

- **WHEN** authorization, credentials, Nemlig, persistence, or runtime execution
  fails during a hosted tool call
- **THEN** the tool returns concise sanitized MCP remediation without a secret,
  stack trace, raw response, or automatic mutation retry
