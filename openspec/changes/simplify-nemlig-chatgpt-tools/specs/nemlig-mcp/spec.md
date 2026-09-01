## ADDED Requirements

### Requirement: User-oriented MCP tool catalog
The MCP server SHALL advertise one concise catalog whose tool identifiers, titles, descriptions, and input guidance use ordinary shopping language. Each description SHALL lead with the outcome and SHALL state whether invoking the tool can change the Nemlig basket, local saved state, or another external system.

#### Scenario: User inspects the tool list
- **WHEN** an MCP client displays the advertised tools
- **THEN** each tool is understandable without knowledge of MCP proposals, immutable snapshots, internal status names, UUIDs, or implementation terminology

#### Scenario: Client inspects a tool input
- **WHEN** an MCP client displays a tool's input schema
- **THEN** every non-obvious input has plain-language guidance that explains the value the client should supply without exposing credentials or weakening exact product selection

#### Scenario: Read-only action is advertised
- **WHEN** a tool only searches, plans, browses, loads, reviews, or views data
- **THEN** its description and MCP annotations consistently identify it as non-mutating for the Nemlig basket

#### Scenario: Write action is advertised
- **WHEN** a tool can change the basket, save local state, or create an external feature request
- **THEN** its description names that effect and its MCP annotations match the actual behavior

### Requirement: Plain-language basket review and action tools
The MCP server SHALL preserve separate review and approved-action tools for every basket mutation while presenting those stages in ordinary shopping language. The approved-action tools SHALL continue to accept only the opaque reference produced by the matching unchanged review and SHALL retain all existing approval, expiry, fingerprint, idempotency, and verified-readback safeguards.

#### Scenario: Basket change is reviewed
- **WHEN** a client prepares an addition, removal, replacement, or clear operation
- **THEN** the advertised tool describes reviewing the exact shopping change and makes clear that the basket is not changed

#### Scenario: Approved basket change is performed
- **WHEN** a client invokes the matching action after explicit approval of the unchanged review
- **THEN** the advertised tool describes the household outcome and the server preserves the existing safe apply and readback behavior

#### Scenario: Approval is absent
- **WHEN** the user has not explicitly approved every exact detail in the unchanged review
- **THEN** the tool catalog and server guidance do not direct the client to invoke the basket-changing action

### Requirement: Single renamed catalog
The MCP server SHALL replace the former protocol-oriented tool identifiers with the new user-oriented identifiers and SHALL NOT advertise compatibility aliases for the former identifiers. Operator documentation SHALL tell existing clients to refresh or reconnect after deployment.

#### Scenario: Client refreshes after deployment
- **WHEN** an installed or cached client reconnects to the updated MCP server
- **THEN** it receives only the new catalog and can use every previously supported feature through the renamed tools

#### Scenario: Client retains an obsolete identifier
- **WHEN** a stale client attempts to invoke a former tool identifier
- **THEN** the server performs no operation and the operator can resolve the mismatch by refreshing or reconnecting the client

#### Scenario: Catalog safety inventory runs
- **WHEN** automated tests enumerate the complete MCP surface
- **THEN** they fail if a former identifier, duplicate alias, missing friendly description, incorrect annotation, or unclassified tool is present

## MODIFIED Requirements

### Requirement: MCP basket tools
The `show_my_basket` tool SHALL return normalized basket data, and every model-visible add, remove, replace, or clear operation SHALL use the matching read-only review tool followed by its approved-action tool only after explicit approval of the unchanged review.

#### Scenario: Prepare additions
- **WHEN** `review_items_to_add` receives one or more exact positive product quantities
- **THEN** it returns an exact review without changing the basket

#### Scenario: Invalid add quantity
- **WHEN** `review_items_to_add` receives a quantity below one
- **THEN** it returns a validation error without calling Nemlig or creating a proposal

#### Scenario: Apply approved additions
- **WHEN** `add_approved_items` receives the still-valid `approved_review` reference after explicit approval
- **THEN** it applies only those unchanged lines and returns verified basket readback

#### Scenario: Prepare a replacement

- **WHEN** `review_item_swap` receives an exact current basket item, distinct replacement product, and positive final replacement quantity
- **THEN** it returns both exact lines, price and package metadata, signed basket-price difference, expected basket totals, and expiry without changing the basket

#### Scenario: Apply an approved replacement

- **WHEN** `make_approved_item_swap` receives the still-valid `approved_review` reference after explicit approval
- **THEN** it applies only the unchanged staged replacement and returns verified basket readback or sanitized inspection guidance for a consumed partial or uncertain result

#### Scenario: Successful add
- **WHEN** an unchanged addition review is explicitly approved and completed
- **THEN** the server adds only its exact lines and returns verified basket readback

#### Scenario: Successful clear
- **WHEN** an unchanged clear review is explicitly approved and completed
- **THEN** the server clears only that reviewed basket and returns verified empty-basket readback

#### Scenario: Direct mutation is requested
- **WHEN** a model-visible client requests `add_to_cart`, `remove_from_cart`, `replace_cart_line`, or `clear_cart`
- **THEN** the server reports that the tool is unavailable and performs no mutation

### Requirement: Optional interactive picker
The server SHALL enable `choose_products_visually` and the shared `ui://nemlig/picker.html` resource for single-query and guided-plan results by default, SHALL disable the picker tool and resource when `NEMLIG_MCP_APPS` is `0`, `false`, `no`, or `off` ignoring case and surrounding whitespace, and SHALL leave every conversational tool enabled.

#### Scenario: Picker enabled
- **WHEN** the picker setting is unset or enabled
- **THEN** clients can render single-query candidates or a guided multi-line workspace from the shared resource

#### Scenario: Picker disabled
- **WHEN** the picker setting has a recognized false value
- **THEN** the picker tool and resource are absent while guided planning and all other conversational tools remain available

### Requirement: Picker approval interaction
The picker SHALL display candidate identity, source, constraints, preferences, price, availability, basket coverage, and quantity; SHALL let the user choose exact products for several lines; and SHALL use `review_items_to_add` followed by `add_approved_items` for one exact batch review.

#### Scenario: User adds from a card
- **WHEN** the user chooses available candidates and positive quantities from one or more cards in the guided workspace
- **THEN** the picker updates the local review state without changing the basket or silently resolving another line

#### Scenario: User prepares the selected batch
- **WHEN** the user activates review with at least one selected positive remaining quantity
- **THEN** the picker calls `review_items_to_add` once and displays every exact line, price, total, and expiry without mutation

#### Scenario: User applies the displayed proposal
- **WHEN** the user explicitly activates the approved action and the host authorizes the unchanged review
- **THEN** the picker calls `add_approved_items` and displays verified basket readback or a sanitized refusal

#### Scenario: Client cannot render MCP Apps
- **WHEN** a client does not support the interactive resource
- **THEN** the same planning, selection, review, approval, and approved-action sequence remains available conversationally

### Requirement: Guided shopping MCP tools
The server SHALL expose read-only `plan_my_shopping`, `show_grocery_sections`, `browse_grocery_section`, and `continue_my_shopping_plan` tools plus a local-state `save_my_shopping_plan` tool, with schemas and annotations matching their actual behavior.

#### Scenario: Plan a whole list
- **WHEN** a client calls `plan_my_shopping` with valid structured grocery lines
- **THEN** it returns the guided plan, candidates, basket gaps, and selected estimate without reviewing or completing a basket mutation

#### Scenario: Browse through MCP
- **WHEN** a client shows grocery sections or browses a returned section reference
- **THEN** it receives normalized paginated candidates through read-only tools

#### Scenario: Save and load through MCP
- **WHEN** a client explicitly saves a valid plan and later continues it using the returned reference
- **THEN** save is advertised as a non-destructive local state change and continue is advertised as read-only, with neither tool changing Nemlig state

### Requirement: Read-only MCP favorites search
The `show_my_favorites` tool SHALL accept optional non-empty `search_term` text, SHALL return only matching authenticated favourites as normalized ranked candidates up to `result_count`, and SHALL remain read-only and non-destructive.

#### Scenario: Conversational favorite search
- **WHEN** a client calls `show_my_favorites` with the search term `banan`
- **THEN** the tool returns matching favourites with their identifying metadata and deterministic candidate tags for review

#### Scenario: Several candidates remain plausible
- **WHEN** several favourites match the search term
- **THEN** the tool returns the candidates for user choice and does not automatically invoke a basket review or approved-action tool

#### Scenario: Search text is absent
- **WHEN** a client calls `show_my_favorites` without a search term
- **THEN** the tool preserves the existing limited favourites listing response

#### Scenario: Search returns no favorite
- **WHEN** no favourite matches the supplied search term
- **THEN** the tool returns an empty structured candidate list without calling general Nemlig search or mutating favourites or the basket

### Requirement: Intent-directed product discovery

The MCP server SHALL guide clients to use `plan_my_shopping` for ordinary requests to find or add products, SHALL reserve `find_groceries` for explicit full-catalog searches, and SHALL reserve `show_my_favorites` for explicit favourite browsing. Discovery and planning SHALL remain separate from basket review and approved actions.

#### Scenario: Ordinary product request

- **WHEN** the user ordinarily asks to find or add one or more products without requesting a specific search source
- **THEN** the server guidance directs the client to `plan_my_shopping`, which returns favourites-first candidates and uses catalog fallback only when no eligible favourite exists

#### Scenario: Explicit catalog request

- **WHEN** the user explicitly asks to search the general Nemlig catalog
- **THEN** the server guidance permits `find_groceries` without first requiring a favourite match

#### Scenario: Explicit favorites request

- **WHEN** the user explicitly asks to list or search saved favourites
- **THEN** the server guidance directs the client to `show_my_favorites` and no catalog fallback occurs

#### Scenario: Product discovery remains non-mutating

- **WHEN** any intent-directed discovery tool returns candidates or an unresolved choice
- **THEN** no basket review is created or completed and ambiguous candidates remain available for user choice
