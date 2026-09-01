## REMOVED Requirements

### Requirement: Private Secure MCP Tunnel deployment

**Reason**: The Cloudflare/Auth0 service has passed the production cutover and is now the single supported ChatGPT deployment.

**Migration**: Use the installed `Nemlig Assistant` ChatGPT app backed by the production Cloudflare endpoint. Local CLI and stdio MCP remain development interfaces, not ChatGPT deployment paths.

### Requirement: Single-account access boundary

**Reason**: Tunnel association is no longer the access boundary; Auth0 owner validation is enforced before the hosted backend receives useful requests.

**Migration**: Use the configured Auth0 owner identity and the fixed production service.

### Requirement: Local credential boundary

**Reason**: The production service loads Nemlig credentials from Cloudflare secrets rather than the retired Mac-local tunnel process.

**Migration**: Store the production Nemlig credential pair only as approved Cloudflare secrets; keep local development credentials local and ignored.

### Requirement: Local session and mutation serialization

**Reason**: Production sessions and mutation serialization now run inside the fixed hosted instance rather than the retired local tunnel process.

**Migration**: Use the hosted owner/session context and the existing proposal mutation lock; local CLI and stdio behavior remain covered by their own capabilities.

### Requirement: Private developer-mode distribution

**Reason**: Acceptance is now based on the installed private hosted app rather than a tunnel-connected developer app.

**Migration**: Retain private single-household distribution through the production app without public directory submission.

### Requirement: Expansion requires a new security design

**Reason**: The former requirement prohibited the hosted design that is now implemented, so its boundary is obsolete.

**Migration**: Apply the new hosted single-household expansion boundary below.

## ADDED Requirements

### Requirement: Single hosted production deployment

The system SHALL expose one supported private ChatGPT integration named `Nemlig Assistant` through the production Cloudflare endpoint and SHALL authenticate the configured owner with Auth0 before forwarding useful MCP requests. The repository SHALL NOT expose a supported Secure MCP Tunnel command, setup path, or fallback deployment.

#### Scenario: Owner uses Nemlig Assistant

- **WHEN** the configured owner invokes a tool through the installed production app
- **THEN** the request is authenticated at the hosted gateway and can reach the fixed backend without the owner's Mac or a tunnel client running

#### Scenario: Retired tunnel path is requested

- **WHEN** an operator searches supported commands, instructions, and deployment documentation for a tunnel setup or fallback
- **THEN** no runnable tunnel entry point or supported tunnel deployment procedure is present

### Requirement: Hosted owner and credential boundary

The production integration SHALL accept only the configured Auth0 owner, SHALL obtain Nemlig credentials only from hosted secrets, and SHALL keep credentials, cookies, access tokens, authorization headers, internal session identifiers, and provider secret values out of tool results, logs, fixtures, committed files, and model-visible content.

#### Scenario: Unauthenticated or wrong-owner request

- **WHEN** a request has no valid token or belongs to another Auth0 subject
- **THEN** the gateway rejects it before the fixed backend performs a Nemlig operation

#### Scenario: Production login is required

- **WHEN** the hosted Nemlig client needs to establish or refresh its session
- **THEN** it uses the configured hosted credential pair without requesting a password through ChatGPT

### Requirement: Private hosted distribution

The supported integration SHALL remain private and single-household and SHALL NOT require public directory submission, public review credentials, or public multi-user account mapping.

#### Scenario: Hosted alpha is accepted

- **WHEN** the production acceptance suite passes and the owner keeps the app private
- **THEN** the hosted app remains the supported distribution without a tunnel registration or public listing

### Requirement: Hosted expansion requires a new security design

The system SHALL NOT extend the configured-owner hosted boundary to arbitrary family members, public users, multiple Nemlig accounts, checkout, payment, ordering, or delivery-slot mutation without a separate approved specification and identity-to-account design.

#### Scenario: Another household member is requested

- **WHEN** support for another Auth0 identity or Nemlig account is requested
- **THEN** the current single-owner implementation remains unchanged until a separate approved design defines identity mapping, isolation, revocation, quotas, and credential ownership
