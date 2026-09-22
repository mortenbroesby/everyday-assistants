## REMOVED Requirements

### Requirement: MCP sessions recover after a Container replacement

**Reason**: The selected MCP v2 HTTP serving path does not require protocol sessions, so recovery by rejecting a lost session and initializing another one no longer describes the hosted contract.

**Migration**: Use the canonical stateless MCP endpoint with the same supported tools. Preserve authenticated application context and basket-review controls independently of the request-scoped server instance.

## ADDED Requirements

### Requirement: Hosted MCP uses stateless protocol serving

The canonical hosted MCP endpoint SHALL serve the modern `2026-07-28` protocol through one stateless handler and tool implementation. Protocol continuation SHALL NOT require `Mcp-Session-Id`. Every request SHALL continue through the existing gateway authentication, principal policy, bounded admission, request-size, method/tool, quota, and kill-switch checks before backend or provider access. Supporting other protocol revisions is outside this change.

#### Scenario: Modern discovery and tool call

- **WHEN** a modern client sends a supported discovery request and then calls a tool without an initialize request or transport session identifier
- **THEN** both requests pass the existing access checks and reach the same hosted MCP tool implementation

#### Scenario: A later request fails access checks

- **WHEN** a later request has a missing or invalid credential, exceeds admission limits, or names a disallowed operation
- **THEN** it is rejected before Container wake or provider access even if an earlier request from that client succeeded
