## Purpose

Defines a local MCP server and optional picker that expose the TypeScript shopper's safe non-recipe product and basket capabilities to compatible clients.

## Requirements

### Requirement: MCP stdio server
The system SHALL expose a `nemlig-assistant` MCP server over stdio through the local `nemlig-mcp` entry point and SHALL sanitize expected and unexpected tool failures.

#### Scenario: Start MCP server
- **WHEN** a client launches `nemlig-mcp`
- **THEN** the server communicates over stdio without emitting credentials, protocol-breaking logs, or Python subprocesses

#### Scenario: Tool call fails
- **WHEN** a Nemlig request or runtime operation fails
- **THEN** the tool returns a concise sanitized MCP error without a stack trace

### Requirement: Non-recipe tool surface
The server SHALL expose product search, favorites, guided planning, department browsing, plan snapshot, basket view, feature-request, and proposal-based basket tools; SHALL conditionally expose the picker; and SHALL NOT expose direct model-visible basket mutation, recipe, checkout, order, payment, purchase, or delivery-slot tools.

#### Scenario: Enumerate base tools
- **WHEN** a client lists tools with picker support disabled
- **THEN** the read-only discovery and planning tools, local snapshot tools, basket view, feature request, and prepare/apply proposal pairs remain available

#### Scenario: Inspect prohibited tools
- **WHEN** a client enumerates all tools
- **THEN** no tool name or description offers direct basket mutation, recipe parsing, checkout, order placement, payment, purchase, or delivery-slot changes

### Requirement: Ranked product candidates
The search tools SHALL return normalized product candidates, tag the lowest-priced available candidate as `cheapest`, tag the first available non-frozen name match as `recommended`, and tag every organic candidate as `organic`.

#### Scenario: Rank mixed candidates
- **WHEN** a search returns available, unavailable, frozen, and organic products
- **THEN** ranking applies all tags deterministically while never marking an unavailable product as cheapest or recommended

#### Scenario: Search has no candidates
- **WHEN** a search returns no products
- **THEN** the tool returns an empty structured list

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

### Requirement: Factual replacement savings

The replacement preparation tool SHALL report the exact current line total, proposed replacement line total, expected product total, and signed price difference using current normalized basket and product data. It SHALL describe a positive difference as potential savings only for the reviewed quantities and SHALL expose package, item-price, and unit-price metadata needed for the user to judge comparability.

#### Scenario: Replacement costs less

- **WHEN** the proposed replacement line total is lower than the current basket line total
- **THEN** the review reports the exact positive potential savings and does not claim product equivalence or apply the replacement

#### Scenario: Replacement costs the same or more

- **WHEN** the proposed replacement line total is equal to or greater than the current line total
- **THEN** the review reports the signed price difference without labeling it as savings or suppressing the candidate

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

### Requirement: Read-only MCP favorites search
The `list_favorites` tool SHALL accept optional non-empty search text, SHALL return only matching authenticated favorites as normalized ranked candidates up to the requested positive limit, and SHALL remain read-only and non-destructive.

#### Scenario: Conversational favorite search
- **WHEN** a client calls `list_favorites` with the query `banan`
- **THEN** the tool returns matching favorites with their identifying metadata and deterministic candidate tags for review

#### Scenario: Several candidates remain plausible
- **WHEN** several favorites match the query
- **THEN** the tool returns the candidates for user choice and does not automatically invoke a basket preparation or application tool

#### Scenario: Search text is absent
- **WHEN** a client calls `list_favorites` without a query
- **THEN** the tool preserves the existing limited favorites listing response

#### Scenario: Search returns no favorite
- **WHEN** no favorite matches the supplied query
- **THEN** the tool returns an empty structured candidate list without calling general Nemlig search or mutating favorites or the basket

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

### Requirement: One-flow grocery-run result
The MCP surface SHALL support one user-visible flow for up to fifty grocery lines that plans current products, prepares and applies sufficiently clear authorized additions, verifies basket readback, and returns exact coverage counts without exposing a direct unvalidated mutation tool.

#### Scenario: Authorized automatic run completes
- **WHEN** the client supplies valid lines, automatic mode, and explicit same-run proceed authorization
- **THEN** the tool sequence completes sufficiently clear additions and returns verified basket data plus covered, selected, added, unresolved, and failed counts

#### Scenario: Automatic run has unclear lines
- **WHEN** some lines resolve clearly and others remain unresolved
- **THEN** the clear authorized additions may complete while unresolved lines remain unchanged and are returned for optional manual follow-up
### Requirement: Complete production feature acceptance

The system SHALL provide an automated production acceptance workflow that verifies the complete advertised MCP tool and resource surface against the hosted service. The workflow SHALL cover authentication, discovery, product search, favorites, guided planning, department browsing, plan snapshot save/load when supported in production, basket view, feature-request contract without submitting a real issue, picker metadata, and every proposal preparation path.

#### Scenario: Read-only production acceptance runs

- **WHEN** the operator runs the default production acceptance command with valid owner authentication
- **THEN** every advertised read-only feature and every proposal preparation path is exercised or explicitly reported as intentionally unavailable, no external mutation is applied, and failures identify the missing feature without disclosing secrets

#### Scenario: Advertised surface drifts

- **WHEN** production lists a tool or resource that the acceptance inventory does not classify, or an expected supported feature disappears
- **THEN** acceptance fails rather than silently skipping the drift

### Requirement: Safe production mutation acceptance

Production acceptance SHALL make basket mutations opt-in and SHALL require the operator's explicit approval of exact test products and expected changes before applying them. A mutation test SHALL use only proposal prepare/apply tools, read back the basket after each apply, attempt to restore the exact original basket through separately approved proposal operations, and stop with recovery evidence after any indeterminate result or mismatch.

#### Scenario: Mutation approval is absent

- **WHEN** production acceptance runs without the explicit mutation flag and exact approved test input
- **THEN** it performs no basket mutation and still completes the read-only feature checks

#### Scenario: Approved reversible basket test succeeds

- **WHEN** the operator explicitly supplies and approves an exact reversible add/remove or replacement test
- **THEN** acceptance applies only the approved proposal, verifies the resulting basket, restores the original basket through approved proposal operations, and verifies the final basket fingerprint

#### Scenario: Mutation result is uncertain

- **WHEN** an apply times out, returns an indeterminate result, or produces a basket mismatch
- **THEN** acceptance does not retry the apply, reports the last verified basket and recovery instructions, and exits unsuccessfully

### Requirement: Production-only deployment inventory

The MCP package SHALL retain local CLI and stdio MCP interfaces for development and direct local use, while repository-level ChatGPT deployment commands and documentation SHALL identify only the hosted Cloudflare/Auth0 production path.

#### Scenario: Repository interfaces are enumerated

- **WHEN** package scripts, app documentation, skills, and operating instructions are inspected
- **THEN** local CLI and stdio commands remain available, production Cloudflare operations remain documented, and no Secure MCP Tunnel executable or setup guide remains

### Requirement: Human-friendly basket tool presentation

Basket preparation and application tools SHALL provide concise human-facing
shopping text while retaining the exact machine-readable proposal and readback
data required for safe protocol operation. Ordinary text SHALL omit opaque
proposal IDs, product IDs, expiry timestamps, internal state names, protocol
terminology, and redundant price calculations unless a detail is needed to
disambiguate a product, explain a material comparison, diagnose a failure, or
answer an explicit request.

#### Scenario: Prepare a basket change

- **WHEN** an add, remove, replace, or clear preparation succeeds
- **THEN** the ordinary presentation names the affected products, quantities, useful package distinctions, prices, and expected basket effect in concise shopping language while the structured result retains every exact field required for unchanged approval and apply

#### Scenario: Apply an approved basket change

- **WHEN** an unchanged approved proposal is applied and verified by fresh basket readback
- **THEN** the ordinary presentation confirms the resulting shopping outcome without exposing protocol identifiers or internal proposal state, and the structured result retains the verified basket data

#### Scenario: Technical detail is necessary

- **WHEN** products are ambiguous, a replacement comparison is material, a safe apply fails, or the user explicitly asks for technical detail
- **THEN** the presentation includes only the additional package, price, identifier, timing, or diagnostic detail needed for the user to understand or resolve that case
