## MODIFIED Requirements

### Requirement: Private Secure MCP Tunnel deployment

The system SHALL retain the local stdio MCP server and private Secure MCP Tunnel
as the supported fallback during hosted validation, SHALL permit the accepted
single-household hosted MCP endpoint as its successor, and SHALL NOT expose an
unauthenticated internet endpoint.

#### Scenario: ChatGPT connects through the tunnel

- **WHEN** the local server and tunnel client are running and the private app
  invokes a tool through the tunnel
- **THEN** ChatGPT can discover and invoke the safe tool surface while the Nemlig
  password remains outside ChatGPT

#### Scenario: ChatGPT connects through the hosted service

- **WHEN** the hosted release is healthy and the configured owner completes its
  OAuth/OIDC flow
- **THEN** ChatGPT can invoke the compatible safe tool surface without depending
  on the local machine or receiving Nemlig credentials

#### Scenario: Local tunnel is unavailable

- **WHEN** the local tunnel is unavailable or the selected hosted endpoint is
  unavailable
- **THEN** the app fails clearly without falling back to an unauthenticated or
  unapproved endpoint

### Requirement: Single-account access boundary

The service SHALL use either the private tunnel association or an approved
OAuth/OIDC owner identity as its access boundary, SHALL bind either path to the
same one configured household account, and SHALL NOT accept identity, credential,
or account selection through model-visible tool input.

#### Scenario: Private app is configured

- **WHEN** the owner uses the existing tunnel path during validation or fallback
- **THEN** the app remains limited to the current private account context without
  requesting a separate OAuth sign-in

#### Scenario: Hosted app is configured

- **WHEN** the owner connects the hosted endpoint
- **THEN** the app requires the configured OAuth/OIDC identity and maps it only to
  the one server-configured Nemlig account

#### Scenario: Tool input supplies identity or account data

- **WHEN** a caller supplies an actor, subject, credential, or account selector as
  a tool argument
- **THEN** the server rejects or ignores it and uses only the authenticated access
  boundary and server-side account configuration

### Requirement: Local credential boundary

The system SHALL load Nemlig credentials only from the owner-only local mechanism
for local execution or approved managed secret storage for hosted execution and
SHALL keep credentials, session state, runtime keys, cookies, and tokens out of
Git and model-visible content.

#### Scenario: Nemlig authentication is needed

- **WHEN** the local client must sign in or refresh its session
- **THEN** it obtains credentials locally without requesting them through ChatGPT
  tool arguments or conversation

#### Scenario: Nemlig authentication is needed in hosting

- **WHEN** the hosted client must sign in or refresh its session
- **THEN** it obtains the one configured credential from managed secret storage
  without exposing it to ChatGPT, deployment configuration, or logs

#### Scenario: Authentication or upstream failure occurs

- **WHEN** login, session refresh, access control, or a Nemlig request fails
- **THEN** the user receives concise sanitized remediation without a credential,
  token, cookie, header, local path, stack trace, or raw upstream payload

### Requirement: Local session and mutation serialization

The system SHALL operate one Nemlig session for the one configured household
account in each selected runtime and SHALL serialize every basket mutation with
a runtime-local mutex while the hosted deployment remains single-instance.

#### Scenario: Concurrent writes arrive

- **WHEN** two apply calls target the shared basket concurrently
- **THEN** they execute one at a time and each revalidates current state inside
  the mutation lock

#### Scenario: Local process restarts

- **WHEN** in-memory session or proposal state is lost in either runtime
- **THEN** the server reauthenticates through its configured credential boundary,
  rejects missing pending proposals, and never automatically retries an uncertain
  mutation

### Requirement: Expansion requires a new security design

The system SHALL limit this hosted expansion to one approved owner, one household
account, and one service instance and SHALL require a separately approved design
before adding another identity, household, tenant, region, or concurrent instance.

#### Scenario: Broader access is requested

- **WHEN** another account, public registration, tenant administration, horizontal
  scaling, or distributed proposal execution is requested
- **THEN** implementation stops until a new design covers account binding, state
  isolation, distributed serialization, credentials, operations, and revocation
