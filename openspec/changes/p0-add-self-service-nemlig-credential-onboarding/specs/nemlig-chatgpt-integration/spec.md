## MODIFIED Requirements

### Requirement: Hosted owner and credential boundary

The production integration SHALL accept only the static Tier 0 owner or an
enabled subject in the invitation-gated private principal registry, SHALL obtain
that principal's Nemlig credentials only from the principal's authenticated
hosted credential record,
and SHALL keep credentials, cookies, access tokens, authorization headers,
internal session identifiers, encrypted credential envelopes, and provider
secret values out of tool results, logs, fixtures, committed files, URLs, and
model-visible content. Production SHALL contain only the existing owner by
default, and SHALL NOT use another principal's credential when the caller's
record is missing, invalid, disabled, or revoked.

#### Scenario: Unauthenticated or unknown-principal request

- **WHEN** a request has no valid token or belongs to a subject absent from the
  static owner or enabled invitation-gated principal registry
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
  or resolves to neither the static owner nor an accepted invited principal
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

### Requirement: Invite-gated self-enrollment and conditional activation

Only an unexpired native Auth0 Organization invitation issued by the owner to an
exact email address SHALL permit a new principal to enroll. Issuing the
invitation SHALL be the owner's explicit conditional grant of the default Tier 1
role. Successful invitation redemption SHALL bind the verified Auth0 subject to
one opaque principal record; successful credential validation and required
isolation gates SHALL activate that record without manual subject copying or a
second owner enable action. The invited user MUST NOT issue invitations, choose
or change a tier, grant public access, or select another principal. The owner
SHALL retain disable and access-revocation control.

#### Scenario: Unlisted user visits the connection page

- **WHEN** an Auth0 user without a valid exact-email Organization invitation
  authenticates successfully
- **THEN** the service denies enrollment without creating a principal, storing a
  credential, waking the Container, or contacting Nemlig

#### Scenario: Invitee completes conditional activation

- **WHEN** an exact-email invitee redeems the invitation, validates their own
  credential, and the required isolation prerequisites succeed
- **THEN** the system activates that principal at Tier 1 without a manual subject
  copy or second owner enable step

#### Scenario: Owner disables or revokes an invitee

- **WHEN** the owner disables or revokes an accepted principal
- **THEN** subsequent MCP admission fails closed and cannot use that principal's
  credential or session until the owner issues a new valid grant

#### Scenario: ChatGPT authenticates without organization context

- **WHEN** an accepted principal later connects through the existing dynamically
  registered third-party ChatGPT OAuth client with the same authoritative subject
- **THEN** the gateway resolves the accepted principal without requiring an
  organization claim or organization-enabling the ChatGPT client
