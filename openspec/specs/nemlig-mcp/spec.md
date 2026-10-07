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

#### Scenario: Same-origin API mutation uses anti-forgery state
- **WHEN** a client sends a login or other state-changing request to Nemlig's same-origin API
- **THEN** it obtains the provider's XSRF-prefixed anti-forgery cookies when absent, sends the matching `X-XSRF-TOKEN` and `Origin` headers, and does not include an old authenticated session cookie on login

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

### Requirement: Complete production feature acceptance
The system SHALL provide an automated, read-only production acceptance workflow that verifies the exact advertised seven-tool user catalog and shared resource inventory against the hosted service. It SHALL exercise live authenticated profile identity, product search, and actual Nemlig basket inspection, and SHALL fail on inventory drift without starting a Draft list or applying a real basket mutation.

#### Scenario: Read-only production acceptance runs
- **WHEN** the operator runs production acceptance with valid owner authentication
- **THEN** the advertised read-only features and viewer resource are checked, no local or provider mutation is applied, and failures identify the missing feature without disclosing secrets

#### Scenario: Advertised surface drifts
- **WHEN** production lists a tool or resource that the acceptance inventory does not classify, or an expected supported feature disappears
- **THEN** acceptance fails rather than silently skipping the drift



### Requirement: Production-only deployment inventory

The MCP package SHALL retain local CLI and stdio MCP interfaces for development and direct local use, while repository-level ChatGPT deployment commands and documentation SHALL identify only the hosted Cloudflare/Auth0 production path.

#### Scenario: Repository interfaces are enumerated

- **WHEN** package scripts, app documentation, skills, and operating instructions are inspected
- **THEN** local CLI and stdio commands remain available, production Cloudflare operations remain documented, and no Secure MCP Tunnel executable or setup guide remains

### Requirement: Parallel reads share pre-authentication

The MCP runtime SHALL ensure authentication before every provider-backed task, reuse existing sessions for read-only work, and coalesce overlapping login attempts only within the same principal client. A read-only task SHALL retry at most once after HTTP 401; if another read already refreshed that client's session, it SHALL reuse the refreshed session rather than start a redundant login. These read retry rules SHALL NOT retry a basket write.

#### Scenario: ChatGPT starts independent searches concurrently

- **WHEN** multiple read-only tools begin while a fresh login for their shared principal client is in flight
- **THEN** they await that login and continue without starting competing login sessions

#### Scenario: An old read fails after another read refreshed the session

- **WHEN** a read returns HTTP 401 from an earlier session generation after another read has refreshed the same principal client
- **THEN** it retries once with the newer session without another login and returns any subsequent failure

### Requirement: Representative recipe-scale smoke verification
The repository SHALL provide a deterministic, credentials-free smoke scenario covering product discovery, exact Draft list choices, Ready preparation, explicit authorization, a single protected addition, verified Nemlig basket readback, and an uncertain-write path without contacting Nemlig.

#### Scenario: Representative flow succeeds
- **WHEN** the smoke runs against its deterministic catalogue and basket fixture
- **THEN** the exact authorized Ready additions apply once and final readback confirms the result

#### Scenario: Authorization differs from settled additions
- **WHEN** a prepared submission contains a product or quantity outside the settled Ready set
- **THEN** verification fails before simulated mutation succeeds

#### Scenario: Simulated write is uncertain
- **WHEN** the simulated write or readback becomes indeterminate
- **THEN** the submission is not retried and the user is directed to inspect the actual Nemlig basket

### Requirement: Seven model-visible shopping tools and isolated viewer actions
The model-visible user tool set SHALL contain exactly `check_nemlig_connection`, `find_groceries`, `get_profile`, `show_my_basket`, `start_product_review`, `update_product_review_conversation`, and `submit_product_review_conversation`. The app-only `update_product_review` and `submit_product_review` widget actions SHALL require the current conversation-bound view token and SHALL NOT render another card. `get_profile`, search, and actual-basket reads SHALL remain read-only. The start/update tools SHALL change only the temporary Draft list; only the protected submit paths MAY add to the actual Nemlig basket. Retired tool names SHALL return the standard unknown-tool response without provider mutation.

#### Scenario: Model-visible tools are listed
- **WHEN** a compatible client lists tools and honors app visibility metadata
- **THEN** the model-visible set contains exactly the seven named tools with complete schemas and behavior-matched annotations

#### Scenario: An outdated widget calls a familiar action without its view token
- **WHEN** a cached older card calls `update_product_review` or `submit_product_review` without a `view_id`
- **THEN** input validation rejects the call before its handler and neither the Draft list nor Nemlig basket changes

#### Scenario: A widget presents an obsolete view token
- **WHEN** a card calls `update_product_review` or `submit_product_review` with a token superseded by a newer rendered card
- **THEN** the server rejects the call before changing the Draft list or Nemlig basket

#### Scenario: Retired tool is called
- **WHEN** a client calls `show_my_basket_visually`, `review_items_to_add`, `add_approved_items`, or another retired tool name
- **THEN** the server reports an unknown tool and performs no provider operation

#### Scenario: Search and basket are inspected
- **WHEN** a client searches or reads the actual Nemlig basket
- **THEN** it receives complete structured and text data without opening a Draft list or modifying the basket

### Requirement: Service fixture matches the retained reads
The machine-authenticated service acceptance surface SHALL expose only `find_groceries` and `show_my_basket`. It SHALL reject Draft list start, update, and submit before provider work.

#### Scenario: Service attempts a Draft list action
- **WHEN** the service principal calls a Draft list tool
- **THEN** the call is denied with HTTP 403 and no provider mutation
