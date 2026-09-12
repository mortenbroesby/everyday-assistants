## ADDED Requirements

### Requirement: ChatGPT can identify the deployed release

The hosted MCP server SHALL include its exact package version and release
codename in initialization instructions available to the model, while retaining
the application title `Nemlig Assistant` and the semantic version in standard
server metadata. This identity SHALL add no tool, network request, stored state,
or access to deployment administration.

#### Scenario: User asks which release is running

- **WHEN** ChatGPT initializes against a deployed Nemlig Assistant version and the user asks which version or codename is running
- **THEN** the model-visible initialization data provides the exact deployed version and codename as one release identity without a tool call

#### Scenario: Existing client inspects server metadata

- **WHEN** an MCP client reads the server name, title, version, icons, tools, and resources
- **THEN** the server retains its existing name, `Nemlig Assistant` title, semantic version, icon, tool inventory, and resource inventory while adding the release identity only to its instructions
