## MODIFIED Requirements

### Requirement: Hosted owner and credential boundary

The production integration SHALL accept only an enabled subject in the
owner-controlled private principal policy, SHALL obtain that principal's Nemlig
credentials only from the principal's authenticated hosted credential record,
and SHALL keep credentials, cookies, access tokens, authorization headers,
internal session identifiers, encrypted credential envelopes, and provider
secret values out of tool results, logs, fixtures, committed files, URLs, and
model-visible content. Production SHALL contain only the existing owner by
default, and SHALL NOT use another principal's credential when the caller's
record is missing, invalid, disabled, or revoked.

#### Scenario: Unauthenticated or unknown-principal request

- **WHEN** a request has no valid token or belongs to a subject absent from the
  enabled private principal policy
- **THEN** the gateway rejects it before reading a credential record, using
  another principal's state, waking the fixed backend, or contacting Nemlig

#### Scenario: Production login is required

- **WHEN** the hosted Nemlig client needs to establish or refresh a principal's
  session
- **THEN** it uses only that principal's current authenticated hosted credential
  record without requesting a password through ChatGPT or falling back to
  another principal's credentials

#### Scenario: Credential is missing or revoked

- **WHEN** an enabled principal has no current credential record
- **THEN** useful Nemlig work fails closed with sanitized connection guidance
  and does not fall back to the owner, a legacy secret, or another principal

## ADDED Requirements

### Requirement: Out-of-band self-service Nemlig connection

An explicitly invited principal SHALL be able to add, rotate, inspect the
presence of, and revoke only their own Nemlig credential through an HTTPS
browser flow authenticated by the same authoritative Auth0 subject used for the
MCP connection. The system MUST NOT collect a Nemlig password through a ChatGPT
message, MCP tool argument, MCP form elicitation, URL parameter, or client-
visible result.

#### Scenario: Client supports URL-mode elicitation

- **WHEN** an invited authenticated user requests Nemlig connection and the MCP
  client advertises URL-mode elicitation
- **THEN** the integration asks the client to open the fixed trusted connection
  page without embedding a credential, identity, bearer token, or preauthenticated
  capability in the URL

#### Scenario: Client lacks URL-mode elicitation

- **WHEN** the MCP client does not advertise URL-mode elicitation
- **THEN** the integration returns concise instructions to open the same fixed
  HTTPS connection page manually and never degrades to in-band password entry

#### Scenario: Browser identity differs or is not invited

- **WHEN** the browser session is unauthenticated, resolves to another subject,
  or resolves to a subject absent from the private principal policy
- **THEN** the connection page requires authoritative authentication or denies
  the operation without reading, revealing, replacing, or deleting a credential
  record

#### Scenario: Valid credential is submitted

- **WHEN** an invited principal submits a syntactically valid credential pair
  and the bounded read-only Nemlig authentication check succeeds
- **THEN** the new credential atomically becomes that principal's current record
  and the response reveals only success and non-secret status

#### Scenario: Rotation validation fails

- **WHEN** a submitted replacement is invalid, Nemlig rejects it, or validation
  does not complete within its bound
- **THEN** the system preserves the previous working record, returns a sanitized
  retryable failure, and performs no basket or account-data mutation

#### Scenario: User inspects or revokes their connection

- **WHEN** an authenticated invited principal requests status or revocation
- **THEN** the system reports only presence and non-secret generation timing or
  deletes the active record, invalidates its use, and never returns the username,
  password, or encrypted envelope

### Requirement: Invite and activation remain owner controlled

Self-service credential entry SHALL NOT create an invitation, choose or change a
tier, enable a principal, grant public access, or activate useful MCP access.
Identity allowlisting, tier assignment, isolation acceptance, and activation
SHALL remain separate explicit owner actions.

#### Scenario: Unlisted user visits the connection page

- **WHEN** an Auth0 user who is not present in the private principal policy
  authenticates successfully
- **THEN** the service denies enrollment without creating a principal, storing a
  credential, waking the Container, or contacting Nemlig

#### Scenario: Disabled invitee stores a valid credential

- **WHEN** an invited but disabled principal completes credential validation
- **THEN** the credential may be held for owner review but useful MCP operations
  remain denied until isolation acceptance succeeds and the owner explicitly
  enables that principal
