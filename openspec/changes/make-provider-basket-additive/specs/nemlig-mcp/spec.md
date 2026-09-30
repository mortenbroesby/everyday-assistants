## MODIFIED Requirements

### Requirement: MCP authentication behavior
Every provider-backed MCP tool SHALL use an authenticated client for the current caller. Hosted client contexts SHALL remain isolated by authorized principal, policy revision, and credential generation. Provider tools SHALL reuse an authenticated session in the current authorized client context and SHALL load configured credentials and log in only when authentication is required or an operation establishes that the session is expired. Before a same-origin state-changing API request, the client SHALL obtain Nemlig's anti-forgery cookies when absent and send the corresponding `X-XSRF-TOKEN` header and same-origin `Origin`. An unauthenticated login request SHALL NOT carry a previous authenticated session cookie. Missing credentials when authentication is required SHALL produce a clean remediation error without a provider task or mutation. Read-only tools MAY retry their complete task once after HTTP 401, sharing in-flight reauthentication or reusing a session already refreshed by another read. Basket writes SHALL NOT retry an indeterminate mutation.

#### Scenario: Read reuses an authenticated session
- **WHEN** a provider-backed tool is called with an existing session in its current authorized client context
- **THEN** it uses that session without loading credentials or starting another login

#### Scenario: Protected write reuses a valid session
- **WHEN** an approved addition is applied with a valid session in the current authorized client context
- **THEN** it does not issue another login before the provider write and still enforces exact approval, fresh basket/product validation, single-use authorization, and verified readback

#### Scenario: Cold protected write authenticates first
- **WHEN** an approved basket apply or local-review submission tool is called without an authenticated session in its current authorized context
- **THEN** it authenticates before performing the task and still requires unchanged exact approval, applicable fresh product and basket checks, single-use authorization, and verified readback

#### Scenario: Same-origin API mutation uses anti-forgery state
- **WHEN** a client sends a login or other state-changing request to Nemlig's same-origin API
- **THEN** it obtains the provider's XSRF-prefixed anti-forgery cookies when absent, sends the matching `X-XSRF-TOKEN` and `Origin` headers, and does not include an old authenticated session cookie on login

#### Scenario: Authentication is required
- **WHEN** a provider-backed task has no authenticated session or an operation establishes that the session is expired
- **THEN** it loads configured credentials and authenticates before any provider write

#### Scenario: Authentication context changes
- **WHEN** a hosted request belongs to another principal or changes policy revision or credential generation
- **THEN** it cannot reuse the previous context's credentials, provider session, or private review state

#### Scenario: Credentials unavailable
- **WHEN** a provider-backed tool requires login or reauthentication but has no complete configured credential pair
- **THEN** the tool instructs the user to configure credentials or run interactive login and performs no provider task or mutation

#### Scenario: Read session expires
- **WHEN** a read-only provider task returns HTTP 401
- **THEN** it refreshes or reuses the already refreshed session and retries the complete read-only task at most once; a second failure is returned without further authentication or task retries

#### Scenario: Write result is indeterminate
- **WHEN** an approved basket write fails after authentication
- **THEN** the tool does not retry the mutation

## REMOVED Requirements

### Requirement: MCP basket tools
**Reason**: The prior MCP basket contract allowed approved removal, replacement, and clearing operations that violate the family's add-only policy.
**Migration**: Use Nemlig.com directly to remove, replace, or clear products. Use only the additive protected tools in the replacement requirement below.

## ADDED Requirements

### Requirement: Add-only MCP basket tools
The view tool SHALL return normalized basket data. Every model-visible provider-basket mutation SHALL be an additive operation using the matching read-only prepare tool followed by its protected apply tool only after explicit approval of the unchanged exact proposal. Additions MAY alternatively use the prepared local-review submission path with the same exact approval and server-side safety checks. Local product acceptance SHALL NOT constitute approval to write to Nemlig. The assistant SHALL expose no operation that lowers a line quantity, removes a line, replaces a line, or clears the provider basket.

#### Scenario: Prepare additions
- **WHEN** `review_items_to_add` receives exact positive product quantities plus its explicit exact-review authorization
- **THEN** it returns an exact proposal describing those quantities as additions and showing the expected final basket without changing the basket

#### Scenario: Invalid add quantity
- **WHEN** `review_items_to_add` receives a quantity below one
- **THEN** it returns a validation error without calling Nemlig or creating a proposal

#### Scenario: Apply approved additions
- **WHEN** `add_approved_items` receives the still-valid proposal after exact approval
- **THEN** it adds only the reviewed positive deltas, preserves existing and unrelated quantities, and returns verified basket readback

#### Scenario: Successful addition
- **WHEN** an unchanged addition proposal is covered by exact approval and applied
- **THEN** the server adds only its exact positive deltas and returns verified basket readback

#### Scenario: Destructive basket operation is requested
- **WHEN** a model-visible client requests a removed provider-basket remove, replace, or clear tool
- **THEN** the MCP server reports that the tool is unavailable and performs no provider mutation

#### Scenario: Basket is non-empty during local review submission
- **WHEN** a prepared local-review submission is approved while other local products remain in review
- **THEN** only the exact approved positive additions are applied; no existing provider-basket line is decreased or removed
