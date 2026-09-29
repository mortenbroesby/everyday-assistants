## ADDED Requirements

### Requirement: Stateless HTTP serves the modern MCP protocol only

The Nemlig MCP HTTP server SHALL serve the `2026-07-28` protocol through the canonical endpoint. Each HTTP request MAY use a fresh MCP server instance, and continuation across requests SHALL depend only on authenticated, principal-scoped application state rather than an MCP transport session. Supporting other protocol revisions is outside this change.

#### Scenario: Modern client calls a tool without initialization

- **WHEN** a client explicitly using protocol revision `2026-07-28` discovers tools and invokes a read tool through the canonical HTTP endpoint
- **THEN** it receives the normal tool result without an initialize handshake or required `Mcp-Session-Id`

#### Scenario: A reviewed basket change crosses HTTP requests

- **WHEN** one authenticated principal prepares a basket review in one HTTP request and applies it in a later request using a fresh MCP server instance
- **THEN** the review remains available to that principal and the existing expiry, freshness, single-use, write serialization, uncertainty, and readback checks remain enforced

#### Scenario: Requests belong to different principals

- **WHEN** a second authenticated principal presents a review created by the first principal
- **THEN** the server rejects it without provider mutation or disclosure of the first principal's application state
