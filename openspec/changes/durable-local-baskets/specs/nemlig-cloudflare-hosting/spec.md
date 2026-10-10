## MODIFIED Requirements

### Requirement: Hosted MCP uses stateless protocol serving
The canonical hosted MCP endpoint SHALL serve the modern `2026-07-28` protocol
through one stateless handler and tool implementation. Modern discovery and tool
calls SHALL NOT require an initialize request or `Mcp-Session-Id`. Every request
SHALL retain gateway authentication, principal-policy authorization,
request-size, deadline, and manual kill-switch checks. Provider-backed requests
SHALL require independently bound current credentials before Container wake or
provider access. Validated local-only Local basket list, show, select, delete,
and heartbeat actions MAY reach the persistence boundary without Nemlig
credentials, while retaining gateway authentication, principal-policy, quotas,
deadlines, and no provider access. Local basket state SHALL be isolated by authenticated principal
and stored through a narrow authenticated Worker persistence boundary; it SHALL
not expose Durable Object access to unauthenticated callers or the Container.

#### Scenario: Modern discovery and tool call
- **WHEN** an authorized modern client sends discovery and then a supported tool
  call without initialization or a transport session identifier
- **THEN** both requests pass the retained access checks and reach the same
  hosted MCP tool implementation

#### Scenario: A later request fails access checks
- **WHEN** a later request lacks valid authentication, an enabled principal, or
  the current credentials required for provider-backed work
- **THEN** it is rejected before Container wake or provider access even if an
  earlier request from that client succeeded

#### Scenario: Container replacement preserves only Local basket state
- **WHEN** a Container replacement occurs while an unexpired Local basket exists
- **THEN** an authorized owner can recover that Local basket through the
  authenticated persistence boundary
- **AND** prior prepared provider-operation authority is not restored or retried;
  a durable non-authorizing uncertainty fence remains inspect-only

#### Scenario: Container replacement loses application state
- **WHEN** a Container replacement loses process-local application state
- **THEN** it restores only an unexpired Local basket through the authenticated
  persistence boundary and requires a fresh review for any lost proposal
- **AND** it does not infer approval or repeat an uncertain mutation
