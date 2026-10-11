## ADDED Requirements

### Requirement: Provider-list preparation requires provider authentication

Routes that prepare a Local basket through a provider shopping list SHALL
require an authenticated provider connection before contacting the provider.
Credential-free MCP routes SHALL not create, read, or mutate a list.

#### Scenario: Credential-free request prepares a Local basket

- **WHEN** a credential-free request attempts to prepare a Local basket
- **THEN** it is rejected before any provider shopping-list request
