## ADDED Requirements

### Requirement: Recoverable single-app OAuth connection

The private integration SHALL have a repeatable procedure for refreshing tool metadata and reconnecting the configured owner through the one existing `Nemlig Assistant` ChatGPT app. The procedure SHALL validate Auth0 discovery, dynamic client and callback compatibility, requested audience and scope, token issuance, and a fresh authenticated read-only MCP call without creating a duplicate app or exposing credentials, tokens, authorization codes, OAuth state, or private provider data.

#### Scenario: Existing app metadata is refreshed

- **WHEN** the operator refreshes the installed private app after a compatible deployment
- **THEN** ChatGPT continues to identify the same app and production MCP URL and discovers the current tool catalog without requiring another app registration

#### Scenario: Owner reconnects an expired connection

- **WHEN** ChatGPT reports that the existing OAuth connection expired and the owner completes the approved Auth0 login flow
- **THEN** the same app obtains valid owner authorization and completes a bounded read-only MCP acceptance call

#### Scenario: Reconnect does not complete

- **WHEN** the OAuth flow fails or exceeds the documented observation window
- **THEN** the operator can distinguish whether the last completed boundary was ChatGPT launch, Auth0 authorization, callback or token exchange, Worker authentication, or backend dispatch without waiting indefinitely or disclosing secret material

#### Scenario: Fresh connection acceptance runs

- **WHEN** reconnect appears successful
- **THEN** two new normal ChatGPT conversations each complete one shopping-list read and one bounded favorites read through the existing app without a basket or other external-state mutation
