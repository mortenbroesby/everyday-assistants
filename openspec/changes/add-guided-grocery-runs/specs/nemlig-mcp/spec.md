## ADDED Requirements

### Requirement: Guided shopping MCP tools
The server SHALL expose read-only `plan_shopping_list`, `list_departments`, `browse_department`, and `load_shopping_plan` tools plus a local-state `save_shopping_plan` tool, with schemas and annotations matching their actual behavior.

#### Scenario: Plan a whole list
- **WHEN** a client calls `plan_shopping_list` with valid structured grocery lines
- **THEN** it returns the guided plan, candidates, basket gaps, and selected estimate without preparing or applying a basket mutation

#### Scenario: Browse through MCP
- **WHEN** a client lists departments or browses a returned department identifier
- **THEN** it receives normalized paginated candidates through read-only tools

#### Scenario: Save and load through MCP
- **WHEN** a client explicitly saves a valid plan and later loads its returned ID
- **THEN** save is advertised as a non-destructive local state change and load is advertised as read-only, with neither tool changing Nemlig state

### Requirement: Planning candidate metadata
The planning and browsing tools SHALL return source, normalized dietary and discount flags, item price, unit price, constraint outcomes, deterministic preference tags, current basket quantity, remaining quantity when selected, and resolution state.

#### Scenario: Client cannot render MCP Apps
- **WHEN** a client does not support the interactive resource
- **THEN** the conversational tool result contains every field required to review candidates, select exact product IDs, and prepare the existing addition proposal separately

#### Scenario: Candidate is ambiguous
- **WHEN** a line has several usable candidates and no selected product ID
- **THEN** the result marks the line unresolved and does not present any candidate as approved

## MODIFIED Requirements

### Requirement: Non-recipe tool surface
The server SHALL expose product search, favorites, guided planning, department browsing, plan snapshot, basket view, feature-request, and proposal-based basket tools; SHALL conditionally expose the picker; and SHALL NOT expose direct model-visible basket mutation, recipe, checkout, order, payment, purchase, or delivery-slot tools.

#### Scenario: Enumerate base tools
- **WHEN** a client lists tools with MCP Apps disabled
- **THEN** the read-only discovery and planning tools, local snapshot tools, basket view, feature request, and prepare/apply proposal pairs remain available

#### Scenario: Inspect prohibited tools
- **WHEN** a client enumerates all tools
- **THEN** no tool name or description offers direct basket mutation, recipe parsing, checkout, order placement, payment, purchase, or delivery-slot changes

### Requirement: MCP basket tools
The view tool SHALL return normalized basket data, and every model-visible add, remove, or clear operation SHALL use the matching read-only prepare tool followed by its apply tool only after explicit approval of the unchanged proposal.

#### Scenario: Prepare additions
- **WHEN** `prepare_cart_additions` receives one or more exact positive product quantities
- **THEN** it returns an exact review without changing the basket

#### Scenario: Invalid add quantity
- **WHEN** `prepare_cart_additions` receives a quantity below one
- **THEN** it returns a validation error without calling Nemlig or creating a proposal

#### Scenario: Apply approved additions
- **WHEN** `apply_cart_additions` receives the still-valid proposal ID after explicit approval
- **THEN** it applies only those unchanged lines and returns verified basket readback

#### Scenario: Successful add
- **WHEN** an unchanged addition proposal is explicitly approved and applied
- **THEN** the server adds only its exact lines and returns verified basket readback

#### Scenario: Successful clear
- **WHEN** an unchanged clear proposal is explicitly approved and applied
- **THEN** the server clears only that reviewed basket and returns verified empty-basket readback

#### Scenario: Direct mutation is requested
- **WHEN** a model-visible client requests `add_to_cart`, `remove_from_cart`, or `clear_cart`
- **THEN** the server reports that the tool is unavailable and performs no mutation

### Requirement: Optional interactive picker
The server SHALL enable `pick_products` and the shared `ui://nemlig/picker.html` resource for single-query and guided-plan results by default, SHALL disable the picker tool and resource when `NEMLIG_MCP_APPS` is `0`, `false`, `no`, or `off` ignoring case and surrounding whitespace, and SHALL leave every conversational tool enabled.

#### Scenario: Picker enabled
- **WHEN** the picker setting is unset or enabled
- **THEN** clients can render single-query candidates or a guided multi-line workspace from the shared resource

#### Scenario: Picker disabled
- **WHEN** the picker setting has a recognized false value
- **THEN** the picker tool and resource are absent while guided planning and all other conversational tools remain available

### Requirement: Picker approval interaction
The picker SHALL display candidate identity, source, constraints, preferences, price, availability, basket coverage, and quantity; SHALL let the user choose exact products for several lines; and SHALL use the existing separate prepare and apply tools for one exact batch review.

#### Scenario: User adds from a card
- **WHEN** the user chooses available candidates and positive quantities from one or more cards in the guided workspace
- **THEN** the picker updates the local review state without changing the basket or silently resolving another line

#### Scenario: User prepares the selected batch
- **WHEN** the user activates prepare with at least one selected positive remaining quantity
- **THEN** the picker calls `prepare_cart_additions` once and displays every exact line, price, total, and expiry without mutation

#### Scenario: User applies the displayed proposal
- **WHEN** the user explicitly activates apply and the host authorizes the unchanged proposal
- **THEN** the picker calls `apply_cart_additions` and displays verified basket readback or a sanitized refusal

#### Scenario: Client cannot render MCP Apps
- **WHEN** a client does not support the interactive resource
- **THEN** the same planning, selection, prepare, approval, and apply sequence remains available conversationally
