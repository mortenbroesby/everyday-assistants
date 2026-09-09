## MODIFIED Requirements

### Requirement: MCP authentication behavior
Every provider-backed MCP tool SHALL load configured credentials and establish a fresh Nemlig session before performing its task, regardless of process-local login state, and SHALL return a clean remediation error when a complete credential pair is unavailable. Read-only tools MAY re-authenticate and retry once after a later HTTP 401. Basket writes SHALL NOT retry an indeterminate mutation.

#### Scenario: Fresh authentication before a provider task
- **WHEN** any provider-backed MCP tool is called while process-local state reports an existing login
- **THEN** the tool establishes a fresh Nemlig session before reading or writing provider data

#### Scenario: Credentials unavailable
- **WHEN** a provider-backed MCP tool is called without a complete configured credential pair
- **THEN** the tool instructs the user to configure credentials or run interactive login and performs no provider task or mutation

#### Scenario: Read expires after pre-authentication
- **WHEN** a read-only provider task returns HTTP 401 after fresh authentication
- **THEN** the tool re-authenticates once and retries the complete read-only task once

#### Scenario: Write result is indeterminate
- **WHEN** an approved basket write fails after fresh authentication
- **THEN** the tool does not retry the mutation

### Requirement: Optional interactive picker
The server SHALL keep `plan_my_shopping` conversational without a UI resource association, SHALL enable the explicit `choose_products_visually` tool and shared `ui://nemlig/picker.html` resource by default, SHALL disable that picker tool and resource when `NEMLIG_MCP_APPS` is `0`, `false`, `no`, or `off` ignoring case and surrounding whitespace, and SHALL leave every conversational tool enabled.

#### Scenario: Ordinary planning runs
- **WHEN** a client invokes `plan_my_shopping` in automatic or manual mode
- **THEN** the client receives the complete structured result without automatically opening an interactive resource

#### Scenario: Picker enabled
- **WHEN** the picker setting is unset or enabled and the client calls `choose_products_visually`
- **THEN** the client can render the returned single-query candidates from the shared resource

#### Scenario: Picker disabled
- **WHEN** the picker setting has a recognized false value
- **THEN** the picker tool and resource are absent while guided planning and all other conversational tools remain available

### Requirement: Picker approval interaction
The picker SHALL display usable candidate identity, title, concise factual description when available, direct product image when available, package, price, and availability. It SHALL render selection and preparation controls only when at least one real candidate can be selected, and SHALL use the existing separate prepare and apply tools for an exact proposal.

#### Scenario: Automatic run is fully clear
- **WHEN** every line in an automatic run is covered or has a deterministic clear match
- **THEN** no choice interface is shown and the unchanged additions remain available to the conversational prepare and apply flow

#### Scenario: Explicit visual choice has candidates
- **WHEN** the user explicitly requests visual choice and the catalogue returns usable candidates
- **THEN** the picker shows bounded candidate cards with factual product evidence and an obvious exact selection action without changing the basket

#### Scenario: Manual choice is needed
- **WHEN** the user explicitly requests visual manual choice and usable candidates exist
- **THEN** the picker shows those candidates and updates only local choice state without changing the basket

#### Scenario: Explicit visual choice is empty
- **WHEN** the direct catalogue search succeeds with no usable candidate
- **THEN** the picker explains that no matching product was found and renders no quantity, selection, or basket-preparation control

#### Scenario: Discovery fails
- **WHEN** an explicit visual-choice request cannot complete catalogue discovery
- **THEN** the client receives a concise failure result and no interactive choice or basket-preparation control is offered

#### Scenario: User adds from a card
- **WHEN** the user chooses an available candidate and a positive quantity
- **THEN** the picker updates local review state without changing the basket or silently selecting another product

#### Scenario: User prepares a manual batch
- **WHEN** the user activates prepare with an available selected product and positive quantity
- **THEN** the picker calls `review_items_to_add` once and displays the exact line, price, total, and expiry without mutation

#### Scenario: User prepares the selected batch
- **WHEN** the user activates prepare with at least one selected positive quantity
- **THEN** the picker creates one exact additions proposal without mutation

#### Scenario: User applies the displayed manual proposal
- **WHEN** the user explicitly activates apply and the host authorizes the unchanged proposal
- **THEN** the picker calls `add_approved_items` and displays verified basket readback or a sanitized refusal

#### Scenario: User applies the displayed proposal
- **WHEN** the displayed proposal has exact approval and the host authorizes the write tool
- **THEN** the picker calls `add_approved_items` and displays verified basket readback or a sanitized refusal

#### Scenario: Client cannot render MCP Apps
- **WHEN** a client does not support the interactive resource
- **THEN** the same product discovery and manual selection behavior remains available conversationally

### Requirement: Intent-directed product discovery

The MCP server SHALL guide clients to use `plan_my_shopping` for ordinary product planning and automatic or manual grocery runs without UI, SHALL use `find_groceries` for direct catalogue searches and as the per-line read-only recovery when a plan reports `discovery_unavailable`, SHALL use `choose_products_visually` only for an explicit visual-choice request, and SHALL reserve `show_my_favorites` for explicit favourite browsing. Before either catalogue tool is called, the client SHALL translate or normalize English, mixed-language, misspelled, or over-specific wording into one short Danish catalogue phrase per line, preserving a distinctive brand with the intended Danish product category. The client SHALL carry explicit proceed intent and requested mode separately from the normalized search phrase.

#### Scenario: Ordinary product request

- **WHEN** the user asks to find one or more products without requesting a specific search source or visual choice
- **THEN** the server guidance directs the client to `plan_my_shopping` in automatic mode with one normalized Danish phrase per line and does not attach a picker

#### Scenario: Planning discovery fallback

- **WHEN** one or more plan lines report `discovery_unavailable` after bounded authentication recovery
- **THEN** the server guidance directs the client to call `find_groceries` once for each affected normalized line and continue with its structured candidates without UI or favourites fallback

#### Scenario: User says to proceed

- **WHEN** the user explicitly asks to use a recipe or conversation list and says to go ahead
- **THEN** the server guidance preserves that authorization separately from product wording and continues the sufficiently clear additions through proposal and apply without a redundant question

#### Scenario: Explicit catalog request

- **WHEN** the user explicitly asks to search the general Nemlig catalog
- **THEN** the server guidance permits `find_groceries` with the same normalized Danish catalogue-phrase rule

#### Scenario: Explicit visual-choice request

- **WHEN** the user explicitly asks to choose products visually
- **THEN** the server guidance permits `choose_products_visually` and no picker is attached to ordinary planning or fallback searches

#### Scenario: Explicit favorites request

- **WHEN** the user explicitly asks to list or search saved favorites
- **THEN** the server guidance directs the client to `show_my_favorites` and no catalogue fallback occurs

#### Scenario: Product discovery remains non-mutating

- **WHEN** any intent-directed discovery tool returns candidates or an unresolved choice without explicit proceed authorization
- **THEN** no basket proposal is applied and ambiguous candidates remain available for manual choice

#### Scenario: Unclear product intent

- **WHEN** automatic planning cannot establish a deterministic clear match
- **THEN** no addition is applied for that line and its candidates remain available for conversational or explicitly requested visual choice
