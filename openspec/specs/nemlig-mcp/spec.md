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
Authenticated MCP tools SHALL reuse a logged-in session or load configured credentials and log in, and SHALL return a clean remediation error when a complete credential pair is unavailable.

#### Scenario: Credentials unavailable
- **WHEN** an authenticated tool is called without a current session or complete configured credentials
- **THEN** the tool instructs the user to configure credentials or run interactive login and performs no mutation

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
The server SHALL enable `pick_products` and the shared `ui://nemlig/picker.html` resource for single-query and guided-plan results by default, SHALL disable the picker tool and resource when `NEMLIG_MCP_APPS` is `0`, `false`, `no`, or `off` ignoring case and surrounding whitespace, and SHALL leave every conversational tool enabled.

#### Scenario: Picker enabled
- **WHEN** the picker setting is unset or enabled
- **THEN** clients can render single-query candidates or a guided multi-line workspace from the shared resource

#### Scenario: Picker disabled
- **WHEN** the picker setting has a recognized false value
- **THEN** the picker tool and resource are absent while guided planning and all other conversational tools remain available

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
- **WHEN** the user activates prepare with at least one selected positive remaining quantity
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

#### Scenario: Product discovery remains non-mutating

- **WHEN** any intent-directed discovery tool returns candidates or an unresolved choice without explicit proceed authorization
- **THEN** no basket proposal is applied and ambiguous candidates remain available for user choice

#### Scenario: Unclear product intent

- **WHEN** automatic planning cannot establish a deterministic clear match
- **THEN** no addition is applied for that line and its candidates remain available for manual choice

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
