## MODIFIED Requirements

### Requirement: Non-recipe tool surface
The server SHALL expose product search, favorites, guided planning, department browsing, named-list lifecycle, legacy plan loading, basket view, feature-request, and proposal-based basket tools; SHALL conditionally expose the picker; and SHALL NOT expose direct model-visible basket mutation, recipe, checkout, order, payment, purchase, delivery-slot, scheduled-list, or automatic-recurrence tools.

#### Scenario: Enumerate base tools
- **WHEN** a client lists tools with picker support disabled
- **THEN** read-only discovery and planning, bounded named-list management, legacy plan loading, basket view, feature request, and prepare/apply review pairs remain available

#### Scenario: Inspect prohibited tools
- **WHEN** a client enumerates all tools
- **THEN** no tool name or description offers direct basket mutation, recipe parsing, checkout, order placement, payment, purchase, delivery-slot changes, scheduled basket work, or automatic recurring execution

### Requirement: Optional interactive picker
The server SHALL enable the visual product chooser and shared `ui://nemlig/picker.html` resource for single-query and guided-plan results by default, SHALL disable the picker tool and resource when `NEMLIG_MCP_APPS` is `0`, `false`, `no`, or `off` ignoring case and surrounding whitespace, and SHALL leave every conversational tool enabled.

#### Scenario: Picker enabled
- **WHEN** the picker setting is unset or enabled
- **THEN** clients can render bounded current product cards or a guided multi-line workspace from the shared resource

#### Scenario: Picker disabled
- **WHEN** the picker setting has a recognized false value
- **THEN** the picker tool and resource are absent while guided planning, named lists, and all other conversational tools remain available

### Requirement: Guided shopping MCP tools
The server SHALL expose read-only whole-list planning, department browsing, current named-list opening and resolution, and legacy snapshot loading; SHALL expose accurately annotated non-destructive tools for creating, renaming, editing, duplicating, archiving, restoring, and migrating named lists; and SHALL preserve existing review/apply tools as the only basket-write path.

#### Scenario: Plan a whole list
- **WHEN** a client submits valid structured grocery lines or selected lines from a named list
- **THEN** it receives candidates, basket gaps, and selected estimates without preparing or applying a basket mutation

#### Scenario: Browse through MCP
- **WHEN** a client lists departments or browses a returned department identifier
- **THEN** it receives normalized paginated candidates through read-only tools without changing list or basket state

#### Scenario: Manage named lists through MCP
- **WHEN** the owner explicitly creates or changes named-list state with a current revision
- **THEN** the tool metadata and result accurately describe a private non-basket state change and return ordinary list names rather than requiring UUIDs in conversation

#### Scenario: Load legacy snapshot through MCP
- **WHEN** a client loads a valid existing saved-plan reference
- **THEN** it can resolve or explicitly migrate the snapshot without altering the snapshot or basket

#### Scenario: Save and load through MCP
- **WHEN** a client explicitly saves reusable state and later opens it by list name
- **THEN** save is advertised as a non-destructive private list-state change and open is advertised as read-only, with neither tool changing Nemlig state

### Requirement: Intent-directed product discovery
The MCP server SHALL guide clients to use Nemlig tools first for current Nemlig prices, availability, favorites, product choice, shopping-list resolution, and find-or-add intent; SHALL reserve direct general-catalog search for explicit catalog requests; and SHALL describe public web search as unsuitable evidence for current Nemlig catalogue state. Recipe research and general food information SHALL remain outside this Nemlig-first current-data rule.

#### Scenario: Current Nemlig product question
- **WHEN** the user asks for a current Nemlig price, availability, favorite, or suitable product without naming another source
- **THEN** server guidance directs the client to current Nemlig discovery or favorites-first planning rather than treating public web results as current Nemlig evidence

#### Scenario: Ordinary product request
- **WHEN** the user ordinarily asks to find or add one or more products without requesting a specific search source
- **THEN** server guidance directs the client to favorites-first planning, with catalog fallback only when no eligible favorite exists

#### Scenario: Explicit catalog request
- **WHEN** the user explicitly asks to search the general Nemlig catalog
- **THEN** server guidance permits current Nemlig catalog search without first requiring a favorite match

#### Scenario: Explicit favorites request
- **WHEN** the user explicitly asks to list or search saved Nemlig favorites
- **THEN** server guidance directs the client to favorites and no catalog fallback occurs

#### Scenario: General food research
- **WHEN** the user asks for a recipe, cooking technique, or other information that does not claim current Nemlig catalogue state
- **THEN** the Nemlig metadata does not claim exclusive routing or prohibit an appropriate non-Nemlig source

#### Scenario: Product discovery remains non-mutating
- **WHEN** any intent-directed discovery tool returns candidates or an unresolved choice
- **THEN** no basket review is prepared or applied and ambiguous candidates remain available for user choice

### Requirement: Complete production feature acceptance
The system SHALL provide an automated production acceptance workflow that verifies the complete advertised MCP tool and resource surface against the hosted service. The workflow SHALL cover authentication, discovery, Nemlig-first metadata, product search, favorites, guided planning, department browsing, named-list lifecycle and owner isolation, legacy snapshot compatibility, basket view, feature-request contract without submitting a real issue, picker image metadata and fallback behavior, and every proposal preparation path.

#### Scenario: Read-only production acceptance runs
- **WHEN** the operator runs the default production acceptance command with valid owner authentication
- **THEN** every advertised read-only feature, reversible test list lifecycle, and proposal preparation path is exercised or explicitly reported as intentionally unavailable; test lists are archived or restored to the original list state; and no external basket mutation is applied

#### Scenario: Advertised surface drifts
- **WHEN** production lists a tool or resource that the acceptance inventory does not classify, an expected supported feature disappears, or list and image metadata disagree with the deployed contract
- **THEN** acceptance fails rather than silently skipping the drift

## ADDED Requirements

### Requirement: Visual product identity
The picker SHALL display a bounded current product image when an allowlisted Nemlig image URL is available and SHALL display name, package size, brand, price, availability, and useful labels alongside it. Images SHALL load lazily and directly from explicitly allowed image origins without proxying bytes through the Worker, and missing or failed images SHALL leave a readable, selectable text card.

#### Scenario: Product has an allowed image
- **WHEN** a returned candidate includes an HTTPS image URL on an explicitly allowed Nemlig image origin
- **THEN** the picker renders a size-bounded lazy image with accessible product text and makes no Worker image-proxy request

#### Scenario: Product image is absent or blocked
- **WHEN** a candidate has no image, uses a non-HTTPS or unapproved origin, or the image request fails
- **THEN** the picker shows its complete text identity and selection controls without a broken-image artifact

#### Scenario: Client cannot render MCP Apps
- **WHEN** the client does not support the picker resource
- **THEN** conversational results still contain the image URL and complete product identity required for the host to present or describe the choice safely
