## Purpose

Defines a local MCP server and optional picker that expose the TypeScript shopper's safe non-recipe product and basket capabilities to compatible clients.

## ADDED Requirements

### Requirement: MCP stdio server
The system SHALL expose a `nemlig-shopper` MCP server over stdio through the local `nemlig-mcp` entry point and SHALL sanitize expected and unexpected tool failures.

#### Scenario: Start MCP server
- **WHEN** a client launches `nemlig-mcp`
- **THEN** the server communicates over stdio without emitting credentials, protocol-breaking logs, or Python subprocesses

#### Scenario: Tool call fails
- **WHEN** a Nemlig request or runtime operation fails
- **THEN** the tool returns a concise sanitized MCP error without a stack trace

### Requirement: Non-recipe tool surface
The server SHALL expose `search_products`, `add_to_cart`, `view_cart`, and `clear_cart`, conditionally expose `pick_products`, and SHALL NOT expose recipe, checkout, order, payment, or purchase tools.

#### Scenario: Enumerate base tools
- **WHEN** a client lists tools with picker support disabled
- **THEN** exactly the four non-recipe base shopping tools are available

#### Scenario: Inspect prohibited tools
- **WHEN** a client enumerates all tools
- **THEN** no tool name or description offers recipe parsing or order placement

### Requirement: Ranked product candidates
The search tools SHALL return normalized product candidates, tag the lowest-priced available candidate as `cheapest`, tag the first available non-frozen name match as `recommended`, and tag every organic candidate as `organic`.

#### Scenario: Rank mixed candidates
- **WHEN** a search returns available, unavailable, frozen, and organic products
- **THEN** ranking applies all tags deterministically while never marking an unavailable product as cheapest or recommended

#### Scenario: Search has no candidates
- **WHEN** a search returns no products
- **THEN** the tool returns an empty structured list

### Requirement: MCP authentication behavior
Authenticated MCP tools SHALL reuse a logged-in session or load configured credentials and log in, and SHALL return a clean remediation error when a complete credential pair is unavailable.

#### Scenario: Credentials unavailable
- **WHEN** an authenticated tool is called without a current session or complete configured credentials
- **THEN** the tool instructs the user to configure credentials or run interactive login and performs no mutation

### Requirement: MCP basket tools
The add tool SHALL reject quantities below one, add only the approved product and quantity, and return the post-mutation basket; the view tool SHALL return normalized basket data; the clear tool SHALL clear only after exact approval and return the post-mutation basket.

#### Scenario: Invalid add quantity
- **WHEN** `add_to_cart` receives a quantity below one
- **THEN** it returns a validation error without calling Nemlig

#### Scenario: Successful add
- **WHEN** `add_to_cart` receives an approved product ID and positive quantity
- **THEN** it adds that line and returns the resulting normalized basket for verification

#### Scenario: Successful clear
- **WHEN** `clear_cart` is invoked after explicit approval
- **THEN** it clears the basket and returns the resulting normalized empty basket

### Requirement: Optional interactive picker
The server SHALL enable `pick_products` and the `ui://nemlig/picker.html` resource by default, SHALL disable both when `NEMLIG_MCP_APPS` is `0`, `false`, `no`, or `off` ignoring case and surrounding whitespace, and SHALL leave the conversational tools enabled.

#### Scenario: Picker enabled
- **WHEN** the picker setting is unset or enabled
- **THEN** clients receive the picker tool, its interactive HTML resource, and the same structured candidates as `search_products`

#### Scenario: Picker disabled
- **WHEN** the picker setting has a recognized false value
- **THEN** the picker tool and resource are absent while all four base tools remain

### Requirement: Picker approval interaction
The picker SHALL display each candidate's name, identifying metadata, price, availability, and ranking tags, and an enabled add control SHALL constitute explicit approval to add exactly one displayed product.

#### Scenario: User adds from a card
- **WHEN** the user activates an available product card's add control
- **THEN** the picker calls `add_to_cart` with that displayed product ID and quantity one and reports success or failure on the card

#### Scenario: Client cannot render MCP Apps
- **WHEN** a client does not support the interactive resource
- **THEN** `pick_products` still returns the same structured candidate list for conversational review

