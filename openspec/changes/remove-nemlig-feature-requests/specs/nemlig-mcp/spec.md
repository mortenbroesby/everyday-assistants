## MODIFIED Requirements

### Requirement: Non-recipe tool surface
The server SHALL expose product search, favorites, guided planning, department browsing, plan snapshot, basket view, and proposal-based basket tools; SHALL conditionally expose the picker; and SHALL NOT expose direct model-visible basket mutation, recipe, checkout, order, payment, purchase, or delivery-slot tools.

#### Scenario: Enumerate base tools
- **WHEN** a client lists tools with picker support disabled
- **THEN** the read-only discovery and planning tools, local snapshot tools, basket view, and prepare/apply proposal pairs remain available

#### Scenario: Inspect prohibited tools
- **WHEN** a client enumerates all tools
- **THEN** no tool name or description offers direct basket mutation, recipe parsing, checkout, order placement, payment, purchase, or delivery-slot changes

#### Scenario: Retired feedback tool
- **WHEN** a client enumerates tools or invokes `suggest_an_improvement`
- **THEN** the retired tool is not advertised and invocation is rejected without submitting an issue

### Requirement: Complete production feature acceptance

The system SHALL provide an automated production acceptance workflow that verifies the complete advertised MCP tool and resource surface against the hosted service. The workflow SHALL cover authentication, discovery, product search, favorites, guided planning, department browsing, plan snapshot save/load when supported in production, basket view, picker metadata, and every proposal preparation path.

#### Scenario: Read-only production acceptance runs

- **WHEN** the operator runs the default production acceptance command with valid owner authentication
- **THEN** every advertised read-only feature and every proposal preparation path is exercised or explicitly reported as intentionally unavailable, no external mutation is applied, and failures identify the missing feature without disclosing secrets

#### Scenario: Advertised surface drifts

- **WHEN** production lists a tool or resource that the acceptance inventory does not classify, or an expected supported feature disappears
- **THEN** acceptance fails rather than silently skipping the drift
