## ADDED Requirements

### Requirement: Authenticated Streamable HTTP MCP server

The system SHALL expose the existing safe Nemlig MCP capability over one
Streamable HTTP endpoint that binds to loopback for Secure MCP Tunnel use and to
approved HTTPS ingress for later hosting, SHALL authenticate every HTTP MCP
request, and SHALL preserve the local stdio server.

#### Scenario: Authorized HTTP client initializes

- **WHEN** the configured owner connects through the tunnel or later hosted
  endpoint with a valid authorization
- **THEN** the server completes MCP initialization and exposes the compatible
  tools, resources, schemas, annotations, and server instructions

#### Scenario: HTTP request is unauthenticated or unauthorized

- **WHEN** a request lacks valid authorization or resolves to an unapproved owner
- **THEN** the server rejects it before tool dispatch or any Nemlig request

### Requirement: Transport-compatible tool contracts

The HTTP and stdio transports SHALL expose equivalent model-visible tool names,
input schemas, output schemas, annotations, structured results, and safety
behavior, except for transport-specific authentication and health metadata.

#### Scenario: Tool surfaces are compared

- **WHEN** automated contract tests enumerate the stdio and hosted servers from
  the same revision and configuration
- **THEN** their safe Nemlig tool and resource contracts match without adding a
  direct mutation, recipe, checkout, payment, order, or delivery-slot capability

#### Scenario: HTTP tool fails

- **WHEN** authorization, credentials, Nemlig, persistence, or runtime execution
  fails during a hosted tool call
- **THEN** the tool returns concise sanitized MCP remediation without a secret,
  stack trace, raw response, or automatic mutation retry
