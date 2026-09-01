## MODIFIED Requirements

### Requirement: Single hosted production deployment
The system SHALL expose one supported private ChatGPT integration named exactly `Nemlig Assistant` through the production Cloudflare endpoint, SHALL authenticate the configured owner with Auth0 before forwarding useful MCP requests, and SHALL update ordinary releases by refreshing that existing app in place. The repository and operator workflow SHALL NOT create or retain `Nemlig Assistant (new)`, bracketed, numbered, version-suffixed, or parallel Nemlig apps and SHALL NOT expose a supported Secure MCP Tunnel command, setup path, or fallback deployment.

#### Scenario: Owner uses Nemlig Assistant
- **WHEN** the configured owner invokes a tool through the installed production app
- **THEN** the request is authenticated at the hosted gateway and can reach the fixed backend without the owner's Mac or a tunnel client running

#### Scenario: Ordinary hosted release
- **WHEN** a new compatible MCP revision is deployed at the stable production endpoint
- **THEN** the operator Refreshes the existing exact `Nemlig Assistant` app to rediscover metadata and tools without creating another app or requiring a new canonical name

#### Scenario: App-level property cannot be edited
- **WHEN** a future required app-level property becomes incorrect and cannot be corrected through the available app settings or Refresh
- **THEN** replacement is treated as an exceptional owner-confirmed cleanup workflow that ends with one verified app named exactly `Nemlig Assistant` and no superseded copy

#### Scenario: Current canonical app remains valid
- **WHEN** the current `Nemlig Assistant` name, icon, endpoint, and connection are correct
- **THEN** the operator keeps and Refreshes that app and performs no replacement workflow

#### Scenario: Retired tunnel path is requested
- **WHEN** an operator searches supported commands, instructions, and deployment documentation for a tunnel setup or fallback
- **THEN** no runnable tunnel entry point or supported tunnel deployment procedure is present
