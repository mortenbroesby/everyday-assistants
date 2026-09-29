## Purpose

Defines an MCP server that exposes the TypeScript shopper's safe non-recipe product and basket capabilities through local stdio and authenticated stateless HTTP to compatible clients.

## Requirements

### Requirement: MCP stdio server
The system SHALL expose a `nemlig-assistant` MCP server over stdio through the local `nemlig-mcp` entry point and SHALL sanitize expected and unexpected tool failures.

#### Scenario: Start MCP server
- **WHEN** a client launches `nemlig-mcp`
- **THEN** the server communicates over stdio without emitting credentials, protocol-breaking logs, or Python subprocesses

#### Scenario: Tool call fails
- **WHEN** a Nemlig request or runtime operation fails
- **THEN** the tool returns a concise sanitized MCP error without a stack trace

### Requirement: Stateless HTTP serves the modern MCP protocol

The Nemlig MCP HTTP server SHALL serve the modern `2026-07-28` protocol through the canonical endpoint. Each HTTP request MAY use a fresh MCP server instance, and continuation across requests SHALL depend only on authenticated, principal-scoped application state rather than an MCP transport session. Any accepted SDK-supported handshake SHALL preserve the same authentication, isolation, and protected-write boundaries; this requirement does not introduce an application-owned compatibility adapter.

#### Scenario: Modern client calls a tool without initialization

- **WHEN** a client explicitly using protocol revision `2026-07-28` discovers tools and invokes a read tool through the canonical HTTP endpoint
- **THEN** it receives the normal tool result without an initialize handshake or required `Mcp-Session-Id`

#### Scenario: Existing ChatGPT client initializes

- **WHEN** an authenticated compatible client uses the `2025-06-18` initialize handshake
- **THEN** the canonical endpoint accepts it through stateless legacy compatibility without creating a transport-owned provider session or bypassing authentication and principal isolation

#### Scenario: A reviewed basket change crosses HTTP requests

- **WHEN** one authenticated principal prepares a basket review in one HTTP request and applies it in a later request using a fresh MCP server instance
- **THEN** the review remains available to that principal and the existing expiry, freshness, single-use, write serialization, uncertainty, and readback checks remain enforced

#### Scenario: Requests belong to different principals

- **WHEN** a second authenticated principal presents a review created by the first principal
- **THEN** the server rejects it without provider mutation or disclosure of the first principal's application state

### Requirement: Non-recipe tool surface
The server SHALL expose independent product search, favourites, exact product details, department browsing, basket view, local product review, and protected basket review/apply tools. Local review tools and the read-only visual basket action SHALL reference the shared product viewer; search, exact details, and ordinary basket reads SHALL return data without mounting a widget. The server SHALL NOT expose unprotected direct model-visible basket mutation, recipe, checkout, order, payment, purchase, or delivery-slot tools.

#### Scenario: Enumerate base tools
- **WHEN** a client lists tools
- **THEN** the read-only discovery, exact-details, section, basket-view, and prepare/apply proposal pairs remain available

#### Scenario: Inspect prohibited tools
- **WHEN** a client enumerates all tools
- **THEN** no tool name or description offers unprotected direct basket mutation, recipe parsing, checkout, order placement, payment, purchase, or delivery-slot changes

### Requirement: Product candidates preserve provider facts
The search tools SHALL return normalized product candidates and SHALL NOT infer comparative recommendation or price-ranking labels. They MAY expose provider-supplied labels and positively established classifications such as organic status; unknown classifications SHALL remain unknown.

#### Scenario: Preserve labels without heuristic rankings
- **WHEN** a search returns available, unavailable, frozen, and organically labelled products
- **THEN** the output preserves provider labels and does not claim a product is cheapest or recommended based only on returned candidates

#### Scenario: Search has no candidates
- **WHEN** a search returns no products
- **THEN** the tool returns an empty structured list

### Requirement: MCP authentication behavior
Every provider-backed MCP tool SHALL use an authenticated client for the current caller. Hosted client contexts SHALL remain isolated by authorized principal, policy revision, and credential generation. Provider tools SHALL reuse an authenticated session in the current authorized client context and SHALL load configured credentials and log in only when authentication is required or an operation establishes that the session is expired. Missing credentials when authentication is required SHALL produce a clean remediation error without a provider task or mutation. Read-only tools MAY retry their complete task once after HTTP 401, sharing in-flight reauthentication or reusing a session already refreshed by another read. Basket writes SHALL NOT retry an indeterminate mutation.

#### Scenario: Read reuses an authenticated session
- **WHEN** a read-only provider tool is called with an existing session in its current authorized client context
- **THEN** it uses that session without loading credentials or starting another login

#### Scenario: Protected write reuses a valid session
- **WHEN** an approved addition is applied with a valid session in the current authorized client context
- **THEN** it does not issue another login before the provider write and still enforces exact approval, fresh basket/product validation, single-use authorization, and verified readback

#### Scenario: Cold protected write authenticates first
- **WHEN** an approved basket apply or local-review submission tool is called without an authenticated session
- **THEN** it authenticates before performing the provider write and still requires unchanged exact approval, applicable fresh product and basket checks, single-use authorization, and verified readback

#### Scenario: Authentication context changes
- **WHEN** a hosted request belongs to another principal or changes policy revision or credential generation
- **THEN** it cannot reuse the previous context's credentials, provider session, or private review state

#### Scenario: Credentials unavailable
- **WHEN** a provider-backed MCP tool requires login or reauthentication but has no complete configured credential pair
- **THEN** the tool instructs the user to configure credentials or run interactive login and performs no provider task or mutation

#### Scenario: Read session expires
- **WHEN** a read-only provider task returns HTTP 401
- **THEN** it refreshes or reuses the already refreshed session and retries the complete read-only task at most once; a second failure is returned without further authentication or task retries

#### Scenario: Write result is indeterminate
- **WHEN** an approved basket write fails after fresh authentication
- **THEN** the tool does not retry the mutation

### Requirement: Add-only MCP basket tools
The view tool SHALL return normalized basket data. Every model-visible provider-basket mutation SHALL be an additive operation using the matching read-only prepare tool followed by its protected apply tool only after explicit approval of the unchanged exact proposal. Additions MAY alternatively use the prepared local-review submission path with the same exact approval and server-side safety checks. Local product acceptance SHALL NOT constitute approval to write to Nemlig. The assistant SHALL expose no operation that lowers a line quantity, removes a line, replaces a line, or clears the provider basket.

#### Scenario: Prepare additions
- **WHEN** `review_items_to_add` receives exact positive product quantities plus its explicit exact-review authorization
- **THEN** it returns an exact proposal describing the requested quantity as an addition and showing the expected final basket without changing it

#### Scenario: Product already exists
- **WHEN** `review_items_to_add` receives a product with an existing positive basket quantity
- **THEN** the proposal displays the existing quantity and resulting quantity after adding the requested delta

#### Scenario: Invalid add quantity
- **WHEN** `review_items_to_add` receives a quantity below one
- **THEN** it returns a validation error without calling Nemlig or creating a proposal

#### Scenario: Apply approved additions
- **WHEN** `add_approved_items` receives the still-valid proposal after exact approval
- **THEN** it adds only those unchanged positive deltas, preserves existing and unrelated quantities, and returns verified basket readback

#### Scenario: Successful add
- **WHEN** an unchanged addition proposal is covered by exact approval and applied
- **THEN** the server adds only its exact lines and returns verified basket readback

#### Scenario: Destructive operation is requested
- **WHEN** a model-visible client requests a removed provider-basket remove, replace, or clear tool
- **THEN** the server reports that the tool is unavailable and performs no provider mutation

### Requirement: Composable catalogue and product viewer surface
The server SHALL expose current catalogue search, favourites, grocery sections, browsing, exact product details, and basket reads as independent conversational capabilities. Exact product details SHALL resolve one current product by its positive catalogue ID and SHALL remain read-only. Product search SHALL hydrate returned candidates through the existing exact-product loader and use the same supported public product projection as exact lookup. The server SHALL register one current shared product viewer resource for local review and visual basket results and SHALL preserve complete structured and text fallbacks.

#### Scenario: Exact product details are requested
- **WHEN** a client supplies a positive product ID returned by a current search
- **THEN** the server returns current product facts without reading or changing the basket

#### Scenario: Rich product search is requested
- **WHEN** a client supplies a search phrase and an optional provider-selected result count
- **THEN** the server returns unique detailed products in provider order, labels unavailable or invalid rows explicitly, and performs no second lookup when the viewer expands a successful result

### Requirement: Read-only MCP favorites search
The `show_my_favorites` tool SHALL accept optional non-empty search text, SHALL return only matching authenticated favorites as normalized ranked candidates up to the requested positive limit when supplied, and SHALL remain read-only and non-destructive.

#### Scenario: Conversational favorite search
- **WHEN** a client calls `show_my_favorites` with the query `banan`
- **THEN** the tool returns matching favorites with their identifying metadata and deterministic candidate tags for review

#### Scenario: Several candidates remain plausible
- **WHEN** several favorites match the query
- **THEN** the tool returns the candidates for user choice and does not automatically invoke a basket preparation or application tool

#### Scenario: Search text is absent
- **WHEN** a client calls `show_my_favorites` without a query
- **THEN** the tool returns the authenticated favorites listing without imposing an application result limit when none is requested

#### Scenario: Search returns no favorite
- **WHEN** no favorite matches the supplied query
- **THEN** the tool returns an empty structured candidate list without calling general Nemlig search or mutating favorites or the basket

### Requirement: Independent product discovery

The MCP server SHALL guide clients to use `find_groceries` for search, `get_grocery_details` for one exact current product, and `show_my_favorites` for explicit favourite browsing. Search and exact lookup SHALL be independent operations: neither creates a plan, selection store, proposal, or saved journey. Clients MAY normalize a user phrase into a concise Danish catalogue term while preserving distinctive brands and product categories.

#### Scenario: Product request
- **WHEN** the user asks to find products
- **THEN** the client invokes direct search and presents the returned detailed products without creating shopping state or opening a widget

#### Scenario: Explicit exact lookup
- **WHEN** the user supplies a positive product ID returned by a current search
- **THEN** the server returns the same supported detailed product facts without reading or changing the basket

#### Scenario: Product discovery remains non-mutating
- **WHEN** a discovery tool returns products or unavailable/invalid outcomes
- **THEN** no basket proposal is created or applied and product choice remains in the conversation

### Requirement: Conversational reviewed basket changes

The server SHALL keep catalogue results and exact product details independent from basket operations, while basket changes SHALL remain behind the existing matching staged review/apply tools or prepared local-review submission for additions and explicit approval. Review and apply responses SHALL retain structured data plus a readable text fallback. Plain product and actual-basket payloads SHALL remain read-only. An explicitly activated local review SHALL attach the shared viewer resource; its controls SHALL use server-owned, principal- and conversation-bound review state and invoke protected submission only after explicit confirmation of the exact unchanged prepared effects. The viewer SHALL NOT invoke Nemlig directly or treat local acceptance as provider-write approval.

#### Scenario: Exact review is submitted

- **WHEN** the user requests a basket change
- **THEN** the server returns the matching factual review without mutating the basket

#### Scenario: Exact approval is submitted

- **WHEN** the user explicitly approves an unchanged review
- **THEN** the matching apply tool performs the bounded mutation, verifies basket readback, and returns structured data plus a readable fallback

### Requirement: Complete production feature acceptance

The system SHALL provide an automated production acceptance workflow that verifies the complete advertised MCP tool and resource surface against the hosted service. The workflow SHALL cover authentication, discovery, rich product search, exact product details, favourites, department browsing, basket view, the shared viewer resource when advertised, and every proposal preparation path without applying a real basket mutation.

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

### Requirement: Shared product viewer resource
The server SHALL register one reusable current product viewer resource for local product review and the read-only visual basket action. The viewer SHALL render already-returned structured data, SHALL perform no render-triggered tool/provider-API read or direct provider-API fetch, and SHALL retain a complete structured/text fallback when a host cannot render the resource. Plain product and actual-basket payloads SHALL expose no local review edits or submission confirmation. Only an explicitly activated server-owned local review SHALL enable review controls through the same principal- and conversation-bound tools as conversation. Edits SHALL supply the current review reference and revision plus exact product references and quantities where the action requires them; submission SHALL supply the unchanged prepared submission reference and current review revision after explicit exact approval, with freshness, single-use, uncertainty, and readback safeguards enforced by the server. Rendering or local acceptance SHALL NOT authorize a provider write. Permitted product images MAY load; their URLs SHALL be retained only for observed HTTPS Nemlig origins. Hostile, non-HTTPS, and unrelated origins SHALL be omitted while text details remain available.

#### Scenario: Resource inventory is inspected
- **WHEN** a client requests the MCP resource inventory
- **THEN** the current shared viewer resource is advertised once with its supported MCP Apps MIME type and clients can continue with structured/text tools

#### Scenario: Viewer expands a search result
- **WHEN** a host expands a successfully hydrated product in a local review or visual basket result
- **THEN** the viewer displays the returned detailed fields without another provider/tool call

#### Scenario: Plain product or actual-basket payload is rendered
- **WHEN** the viewer receives product facts or an actual-basket result without an activated local review
- **THEN** it renders read-only rows without local edit or submission controls and makes no automatic provider fetch

#### Scenario: Local review controls are explicitly activated
- **WHEN** a user edits an activated local review or confirms its prepared submission
- **THEN** the viewer invokes the existing review tool with current review reference, revision, and required exact action inputs, or the protected submit tool with review reference, current revision, and unchanged prepared submission reference after exact approval; the server remains authoritative and no write is retried automatically

#### Scenario: Viewer receives partial or unavailable data
- **WHEN** a result is unavailable, invalid, or missing an image or optional field
- **THEN** the viewer remains accessible, labels the state honestly, and does not invent data

### Requirement: Read-only visual view of the actual Nemlig basket
The server SHALL expose a distinct, read-only visual basket action that reads the current provider basket and presents every basket line with its current quantity and line total. It SHALL advertise the existing shared product viewer and retain a complete structured and text fallback. It SHALL only use exact product references from the current basket for image/detail lookup, bound additional provider reads, and never prepare or apply a basket mutation. Ordinary basket inspection SHALL not incur these extra detail reads.

#### Scenario: Basket has products with images
- **WHEN** the user requests a visual view of an actual Nemlig basket containing products with safe images
- **THEN** the action returns all basket lines, a bounded number of exact product details and safe image URLs, and viewer metadata for rendering without changing the basket

#### Scenario: Detail or image unavailable
- **WHEN** an exact detail lookup fails, has a mismatched ID, or has no supported HTTPS Nemlig image
- **THEN** the basket line remains visible with its known quantity and total, and the missing detail or image is labelled without substituting an unrelated product

#### Scenario: Large or empty basket
- **WHEN** the basket exceeds the detail-read bound or contains no products
- **THEN** all current lines remain available, the visual result identifies any lines not enriched, and no unbounded detail calls occur

#### Scenario: Normal basket read
- **WHEN** the user requests ordinary basket inspection
- **THEN** the server reads the basket without exact-product hydration or a viewer opening

### Requirement: Parallel reads share pre-authentication

The MCP runtime SHALL ensure authentication before every provider-backed task, reuse existing sessions for read-only work, and coalesce overlapping login attempts only within the same principal client. A read-only task SHALL retry at most once after HTTP 401; if another read already refreshed that client's session, it SHALL reuse the refreshed session rather than start a redundant login. These read retry rules SHALL NOT retry a basket write.

#### Scenario: ChatGPT starts independent searches concurrently

- **WHEN** multiple read-only tools begin while a fresh login for their shared principal client is in flight
- **THEN** they await that login and continue without starting competing login sessions

#### Scenario: An old read fails after another read refreshed the session

- **WHEN** a read returns HTTP 401 from an earlier session generation after another read has refreshed the same principal client
- **THEN** it retries once with the newer session without another login and returns any subsequent failure

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
