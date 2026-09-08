## MODIFIED Requirements

### Requirement: Non-recipe tool surface
The server SHALL expose product search, favorites, guided planning, department browsing, basket view, and proposal-based basket tools; SHALL conditionally expose the picker; and SHALL NOT expose direct model-visible basket mutation, recipe, checkout, order, payment, purchase, or delivery-slot tools.

#### Scenario: Enumerate base tools
- **WHEN** a client lists tools with picker support disabled
- **THEN** the read-only discovery and planning tools, basket view, and prepare/apply proposal pairs remain available

#### Scenario: Inspect prohibited tools
- **WHEN** a client enumerates all tools
- **THEN** no tool name or description offers direct basket mutation, recipe parsing, checkout, order placement, payment, purchase, or delivery-slot changes

#### Scenario: Saved shopping tools are retired
- **WHEN** a client enumerates or invokes save_my_shopping_plan, continue_my_shopping_plan, show_my_shopping_lists, save_my_shopping_list, copy_my_shopping_list, set_my_shopping_list_status, shop_from_my_list or migrate_my_saved_plan
- **THEN** those tools are absent and calls reject without accessing saved records


### Requirement: Guided shopping MCP tools
The server SHALL expose read-only `plan_my_shopping`, `show_grocery_sections` and `browse_grocery_section` tools, with schemas and annotations matching their actual behavior.

#### Scenario: Plan a whole list
- **WHEN** a client calls `plan_my_shopping` with valid structured grocery lines
- **THEN** it returns the guided plan, candidates, basket gaps, and selected estimate without preparing or applying a basket mutation

#### Scenario: Browse through MCP
- **WHEN** a client lists departments or browses a returned department identifier
- **THEN** it receives normalized paginated candidates through read-only tools


#### Scenario: Save and load through MCP
- **WHEN** a client attempts to invoke a retired save or load tool
- **THEN** the call is rejected without reading or writing saved records or changing the basket

### Requirement: Complete production feature acceptance

The system SHALL provide an automated production acceptance workflow that verifies the complete advertised MCP tool and resource surface against the hosted service. The workflow SHALL cover authentication, discovery, product search, favorites, guided planning, department browsing, basket view, picker metadata, and every proposal preparation path.

#### Scenario: Read-only production acceptance runs

- **WHEN** the operator runs the default production acceptance command with valid owner authentication
- **THEN** every advertised read-only feature and every proposal preparation path is exercised or explicitly reported as intentionally unavailable, no external mutation is applied, and failures identify the missing feature without disclosing secrets

#### Scenario: Advertised surface drifts

- **WHEN** production lists a tool or resource that the acceptance inventory does not classify, or an expected supported feature disappears
- **THEN** acceptance fails rather than silently skipping the drift
