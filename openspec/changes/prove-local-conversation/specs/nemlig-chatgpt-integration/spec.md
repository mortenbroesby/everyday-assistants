## ADDED Requirements

### Requirement: Local conversation acceptance
The development harness SHALL support a native model conversation with a synthetic provider, a real MCP review result, and an interactive built widget.

#### Scenario: Reopen and edit the same draft
- **WHEN** the model handles a Danish oat drink draft request followed by a request to show the list
- **THEN** acceptance requires the original draft and review context, visible oat drink, persisted widget quantity edit and zero forbidden provider operations

#### Scenario: Operator checks the provider locally
- **WHEN** an operator explicitly runs the read-only live profile with a connected local principal
- **THEN** the profile checks a product search and authenticated basket read through local MCP and reports stage outcomes without retaining account contents
