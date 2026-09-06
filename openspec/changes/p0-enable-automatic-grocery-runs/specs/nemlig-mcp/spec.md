## MODIFIED Requirements

### Requirement: MCP basket tools
The view tool SHALL return normalized basket data, and every model-visible add, remove, replace, or clear operation SHALL use the matching read-only prepare tool followed by its apply tool only after either explicit approval of the unchanged proposal or, for additions only, explicit same-run automatic authorization that covers the resolved lines.

#### Scenario: Prepare additions
- **WHEN** `review_items_to_add` receives between one and fifty exact positive product quantities plus its authorization scope
- **THEN** it returns an exact proposal without changing the basket

#### Scenario: Invalid add quantity
- **WHEN** `review_items_to_add` receives a quantity below one
- **THEN** it returns a validation error without calling Nemlig or creating a proposal

#### Scenario: Apply approved additions
- **WHEN** `add_approved_items` receives the still-valid proposal after exact approval or covered same-run automatic authorization
- **THEN** it applies only those unchanged lines and returns verified basket readback

#### Scenario: Prepare a replacement

- **WHEN** `review_item_swap` receives an exact current basket product ID, distinct replacement product ID, and positive final replacement quantity
- **THEN** it returns both exact lines, price and package metadata, signed basket-price difference, expected basket totals, and expiry without changing the basket

#### Scenario: Apply an approved replacement

- **WHEN** `make_approved_item_swap` receives the still-valid proposal ID after explicit approval
- **THEN** it applies only the unchanged staged replacement and returns verified basket readback or sanitized inspection guidance for a consumed partial or uncertain result

#### Scenario: Successful automatic add
- **WHEN** an unchanged addition proposal is covered by the explicit same-run automatic authorization and applied
- **THEN** the server adds only its exact sufficiently clear lines and returns verified basket readback

#### Scenario: Successful add
- **WHEN** an unchanged addition proposal is covered by exact approval or same-run automatic authorization and applied
- **THEN** the server adds only its exact lines and returns verified basket readback

#### Scenario: Successful clear
- **WHEN** an unchanged clear proposal is explicitly approved and applied
- **THEN** the server clears only that reviewed basket and returns verified empty-basket readback

#### Scenario: Direct mutation is requested
- **WHEN** a model-visible client requests an unregistered direct mutation tool
- **THEN** the server reports that the tool is unavailable and performs no mutation

### Requirement: Picker approval interaction
The picker SHALL display candidate identity, source, constraints, preferences, description and direct product image when available, price, availability, basket coverage, and quantity. It SHALL remain hidden during a fully clear automatic run, SHALL let the user choose exact products in manual or unresolved cases, and SHALL use the existing separate prepare and apply tools for one exact batch proposal.

#### Scenario: Automatic run is fully clear
- **WHEN** every line in an explicitly authorized automatic run is covered or has a deterministic clear match
- **THEN** no choice interface is shown and the unchanged additions may proceed through prepare and apply

#### Scenario: Manual choice is needed
- **WHEN** the user requests manual mode or an automatic line is unresolved
- **THEN** the picker shows bounded candidates with the available factual product evidence and updates local choice state without changing the basket

#### Scenario: User adds from a card
- **WHEN** the user chooses available candidates and positive quantities from one or more cards
- **THEN** the picker updates local review state without changing the basket or silently resolving another line

#### Scenario: User prepares a manual batch
- **WHEN** the user activates prepare with at least one selected positive remaining quantity
- **THEN** the picker calls `review_items_to_add` once and displays every exact line, price, total, and expiry without mutation

#### Scenario: User prepares the selected batch
- **WHEN** the user prepares at least one manually selected positive remaining quantity
- **THEN** the picker creates one exact additions proposal without mutation

#### Scenario: User applies the displayed manual proposal
- **WHEN** the user explicitly activates apply and the host authorizes the unchanged proposal
- **THEN** the picker calls `add_approved_items` and displays verified basket readback or a sanitized refusal

#### Scenario: User applies the displayed proposal
- **WHEN** the displayed proposal has exact approval or valid same-run automatic authorization and the host authorizes the write tool
- **THEN** the picker calls `add_approved_items` and displays verified basket readback or a sanitized refusal

#### Scenario: Client cannot render MCP Apps
- **WHEN** a client does not support the interactive resource
- **THEN** the same automatic and manual behavior remains available conversationally

### Requirement: Planning candidate metadata
The planning and browsing tools SHALL return source, normalized dietary and discount flags, item price, unit price, package size, brand, description and approved direct HTTPS image URL when available, constraint outcomes, deterministic preference and clarity tags, current basket quantity, remaining quantity when selected, resolution state, and automatic coverage fields.

#### Scenario: Client cannot render MCP Apps
- **WHEN** a client does not support the interactive resource
- **THEN** the conversational tool result contains every factual field required to select a clear candidate automatically or present an unresolved choice

#### Scenario: Candidate is a clear automatic match
- **WHEN** one eligible candidate satisfies the deterministic clarity rule in automatic mode
- **THEN** the result marks that exact candidate selected without describing the clarity grade as a probability

#### Scenario: Candidate is ambiguous
- **WHEN** no eligible candidate satisfies the deterministic clarity rule
- **THEN** the result marks the line unresolved and returns bounded evidence for optional user choice without treating any candidate as authorized

### Requirement: Intent-directed product discovery

The MCP server SHALL guide clients to use `plan_my_shopping` for ordinary product planning and automatic or manual grocery runs, SHALL use `find_groceries` for direct catalogue searches, and SHALL reserve `show_my_favorites` for explicit favourite browsing. Before either catalogue tool is called, the client SHALL translate or normalize English, mixed-language, misspelled, or over-specific wording into one short Danish catalogue phrase per line, preserving a distinctive brand with the intended Danish product category. The client SHALL carry explicit proceed intent and requested mode separately from the normalized search phrase.

#### Scenario: Ordinary product request

- **WHEN** the user asks to find one or more products without requesting a specific search source or manual choice
- **THEN** the server guidance directs the client to `plan_my_shopping` in automatic mode with one normalized Danish phrase per line and one catalogue search per line without searching favourites

#### Scenario: User says to proceed

- **WHEN** the user explicitly asks to use a recipe, conversation list, or named list and says to go ahead
- **THEN** the server guidance preserves that authorization separately from product wording and continues the sufficiently clear additions through proposal and apply without a redundant question

#### Scenario: Explicit catalog request

- **WHEN** the user explicitly asks to search the general Nemlig catalog
- **THEN** the server guidance permits `find_groceries` with the same normalized Danish catalogue-phrase rule

#### Scenario: Explicit favorites request

- **WHEN** the user explicitly asks to list or search saved favorites
- **THEN** the server guidance directs the client to `show_my_favorites` and no catalogue fallback occurs

#### Scenario: Unclear product intent

- **WHEN** automatic planning cannot establish a deterministic clear match
- **THEN** no addition is applied for that line and its candidates remain available for manual choice

#### Scenario: Product discovery remains non-mutating

- **WHEN** any intent-directed discovery tool returns candidates or an unresolved choice without explicit proceed authorization
- **THEN** no basket proposal is applied and ambiguous candidates remain available for user choice

## ADDED Requirements

### Requirement: One-flow grocery-run result
The MCP surface SHALL support one user-visible flow for up to fifty grocery lines that plans current products, prepares and applies sufficiently clear authorized additions, verifies basket readback, and returns exact coverage counts without exposing a direct unvalidated mutation tool.

#### Scenario: Authorized automatic run completes
- **WHEN** the client supplies valid lines, automatic mode, and explicit same-run proceed authorization
- **THEN** the tool sequence completes sufficiently clear additions and returns verified basket data plus covered, selected, added, unresolved, and failed counts

#### Scenario: Automatic run has unclear lines
- **WHEN** some lines resolve clearly and others remain unresolved
- **THEN** the clear authorized additions may complete while unresolved lines remain unchanged and are returned for optional manual follow-up
