## Purpose

Defines a local MCP server that exposes the TypeScript shopper's safe non-recipe product and basket capabilities to compatible clients.

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
The server SHALL expose product search, favourites, exact product details, guided planning, department browsing, basket view, and staged basket review/apply tools; and SHALL NOT expose custom UI resources, direct model-visible basket mutation, recipe, checkout, order, payment, purchase, or delivery-slot tools.

#### Scenario: Enumerate base tools
- **WHEN** a client lists tools
- **THEN** the read-only discovery, exact-details, planning, section, basket-view, and prepare/apply proposal pairs remain available

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

### Requirement: Composable catalogue and planning surface
The server SHALL expose current catalogue search, favourites, grocery sections, browsing, exact product details, basket reads, and optional request-scoped planning as independent conversational capabilities. Exact product details SHALL resolve one current product by its positive catalogue ID and SHALL remain read-only. The server SHALL not advertise a custom UI tool or resource.

#### Scenario: Ordinary planning runs
- **WHEN** a client invokes `plan_my_shopping` in automatic or manual mode
- **THEN** the client receives the complete structured result without automatically opening an interactive resource

#### Scenario: Exact product details are requested
- **WHEN** a client supplies a positive product ID returned by a current search or plan
- **THEN** the server returns bounded current product facts without reading or changing the basket

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

#### Scenario: Client consumes structured results
- **WHEN** a client reads a planning or browsing result
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

The MCP server SHALL guide clients to use `plan_my_shopping` for ordinary product planning, `find_groceries` for direct catalogue searches and per-line read-only recovery when a plan reports `discovery_unavailable`, `get_grocery_details` for one exact current product, and `show_my_favorites` for explicit favourite browsing. Before catalogue tools are called, the client SHALL translate or normalize English, mixed-language, misspelled, or over-specific wording into one short Danish catalogue phrase per line, preserving a distinctive brand with the intended Danish product category. The client SHALL carry explicit proceed intent and requested mode separately from the normalized search phrase.

#### Scenario: Ordinary product request

- **WHEN** the user asks to find one or more products without requesting a specific search source or visual choice
- **THEN** the server guidance directs the client to `plan_my_shopping` in automatic mode with one normalized Danish phrase per line and does not attach a custom UI resource

#### Scenario: Planning discovery fallback

- **WHEN** one or more plan lines report `discovery_unavailable` after bounded authentication recovery
- **THEN** the server guidance directs the client to call `find_groceries` once for each affected normalized line and continue with its structured candidates without UI or favourites fallback

#### Scenario: User says to proceed

- **WHEN** the user explicitly asks to use a recipe or conversation list and says to go ahead
- **THEN** the server guidance preserves that authorization separately from product wording and continues the sufficiently clear additions through proposal and apply without a redundant question

#### Scenario: Explicit catalog request

- **WHEN** the user explicitly asks to search the general Nemlig catalog
- **THEN** the server guidance permits `find_groceries` with the same normalized Danish catalogue-phrase rule

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

### Requirement: Conversational reviewed basket changes

The server SHALL keep catalogue results and exact product details conversational, while basket changes SHALL remain behind the existing matching staged review/apply tools and explicit approval. Review and apply responses SHALL retain structured data plus a readable text fallback; no custom UI resource is required.

#### Scenario: Exact review is submitted

- **WHEN** the user requests a basket change
- **THEN** the server returns the matching factual review without mutating the basket

#### Scenario: Exact approval is submitted

- **WHEN** the user explicitly approves an unchanged review
- **THEN** the matching apply tool performs the bounded mutation, verifies basket readback, and returns structured data plus a readable fallback

### Requirement: Complete production feature acceptance

The system SHALL provide an automated production acceptance workflow that verifies the complete advertised MCP tool and resource surface against the hosted service. The workflow SHALL cover authentication, discovery, product search, exact product details, favourites, guided planning, department browsing, basket view, and every proposal preparation path without submitting a real issue or applying a real basket mutation.

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

### Requirement: Quantity-aware and preference-aware planning contract
The guided planning tool SHALL accept an optional requested amount and supported unit, optional preferred brands, and an optional per-line explicit-choice signal. Its structured result SHALL expose each candidate's relevance, parsed package amount when available, required package count, covered amount, excess amount, preferred-brand match, and the deterministic reason for automatic selection or unresolved choice.

#### Scenario: Client supplies conversational preference
- **WHEN** ChatGPT has an explicit user preference such as Heinz tomato ketchup in conversation or memory
- **THEN** it can pass that brand on the applicable grocery line without creating or updating assistant-side preference storage

#### Scenario: Client supplies a requested amount
- **WHEN** the user asks for 1 kg and the catalogue contains relevant 500 g and 800 g packages
- **THEN** the tool returns both with their required package counts, total covered mass, and excess mass so the client can explain the trade-off

#### Scenario: Meaningful choice is requested
- **WHEN** the client marks a line as requiring explicit choice and no preferred brand produces one clear result
- **THEN** the result remains unresolved with a bounded set of usable candidates and no custom UI resource is attached

#### Scenario: Legacy package-count line
- **WHEN** a client supplies only the existing positive quantity
- **THEN** the tool preserves package-count planning behavior and remains backward compatible

### Requirement: No custom presentation resource
The server SHALL not serve a custom picker HTML resource or register a visual product-choice tool. Product image URLs included in model-visible catalogue data SHALL be retained only for the observed HTTPS Nemlig origins; hostile, non-HTTPS, and unrelated origins SHALL be omitted while text details remain available.

#### Scenario: Resource inventory is inspected
- **WHEN** a client requests the MCP resource inventory
- **THEN** no Nemlig Assistant custom resource is advertised, and clients can continue with the conversational tools

### Requirement: Parallel reads share pre-authentication

The MCP runtime SHALL authenticate before every provider-backed task and SHALL coalesce overlapping login attempts for the same principal client. It SHALL preserve the existing single retry after an HTTP 401.

#### Scenario: ChatGPT starts independent searches concurrently

- **WHEN** multiple read-only tools begin while a fresh login for their shared principal client is in flight
- **THEN** they await that login and continue without starting competing login sessions

### Requirement: Read-only proposed-basket tool

The MCP server SHALL provide a read-only proposed-basket tool that accepts no more than five actionable entries per invocation. It SHALL validate match confidence, product identifiers, quantities, and alternative identifiers, then return current image, description, package size, price, unit price, confidence, and favourite evidence for display. It SHALL NOT read or mutate the basket.

#### Scenario: Valid proposal group

- **WHEN** ChatGPT supplies up to five valid proposed entries
- **THEN** the server resolves current product metadata and returns a displayable proposed-basket group without basket access

#### Scenario: Invalid proposal group

- **WHEN** confidence is outside 0 to 100, quantity is invalid, a product identifier cannot be resolved, or more than five actionable entries are supplied
- **THEN** the server rejects the proposal without displaying misleading choices

### Requirement: Stateless alternative selection

The proposed-basket view SHALL return an alternative selection to the conversation and SHALL NOT call `review_items_to_add`, `add_approved_items`, or store proposal state.

#### Scenario: User selects an alternative

- **WHEN** the user chooses another product in the view
- **THEN** the view sends the requested ingredient and chosen product identifier back to ChatGPT for a revised proposal

### Requirement: Representative recipe-scale smoke verification

The repository SHALL provide a deterministic, credentials-free smoke scenario covering individual discovery, short-query refinement, an uncertain favourite, an unrelated result, package quantity, grouped proposal review, pantry assumptions, exact addition review, authorization rejection on drift, application, and verified readback without contacting Nemlig.

#### Scenario: Representative flow succeeds

- **WHEN** the smoke runs against its deterministic catalogue, favourites, and basket fixture
- **THEN** suitable products are proposed, uncertain choices are grouped, the exact approved additions apply once, and final readback confirms the result

#### Scenario: Authorization differs from settled additions

- **WHEN** a proposal contains a product or quantity outside the settled reviewed set
- **THEN** verification fails before simulated mutation succeeds

#### Scenario: Simulated write fails

- **WHEN** the simulated basket write fails
- **THEN** the smoke confirms no automatic write retry occurs
