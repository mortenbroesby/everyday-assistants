## ADDED Requirements

### Requirement: Live authenticated release profile

The normal authenticated user MCP catalogue SHALL expose a read-only
`get_profile` tool with an empty input schema. It SHALL return the stable
authenticated profile key and the version/codename derived from the running
package identity. It SHALL perform no provider login, provider read, basket
read, review access, or provider mutation. The machine-service fixture
catalogue SHALL remain limited to its existing provider-fixture tools.

#### Scenario: ChatGPT checks the currently serving release

- **WHEN** an authenticated user invokes `get_profile`
- **THEN** the response identifies the authenticated profile and the
  version/codename of the server that handled that request without accessing
  Nemlig provider state

#### Scenario: A machine-service fixture lists tools

- **WHEN** the machine-service principal enumerates the MCP catalogue
- **THEN** `get_profile` is not included and its existing fixed read-only
  fixture inventory remains unchanged

### Requirement: Cached instructions are not release evidence

MCP instructions SHALL NOT embed a package version, release codename, or other
claim that they identify the currently serving deployment. Live release
identity SHALL be available through the authenticated profile result instead.

#### Scenario: A host retains earlier instructions

- **WHEN** a host displays previously discovered MCP instructions after a new
  release is deployed
- **THEN** those instructions do not present an earlier version/codename as the
  current release, and a new `get_profile` call can identify the server that
  handled it
