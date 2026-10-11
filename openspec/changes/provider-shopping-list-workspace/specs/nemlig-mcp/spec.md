## ADDED Requirements

### Requirement: Provider-backed workspaces require provider authentication

Routes that read or synchronize provider-backed workspace contents SHALL require an authenticated provider connection before contacting the provider. Credential-free MCP routes SHALL not expose provider list contents or mutate a list.

#### Scenario: Credential-free request targets a workspace

- **WHEN** a credential-free request attempts to show or update a provider-backed workspace
- **THEN** it is rejected before any provider shopping-list request
