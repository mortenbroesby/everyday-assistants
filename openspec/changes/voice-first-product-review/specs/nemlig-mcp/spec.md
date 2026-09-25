## MODIFIED Requirements

### Requirement: Shared product viewer resource
The server SHALL register one reusable product viewer resource for product-bearing
tools and temporary product review snapshots. The viewer SHALL render returned
data with complete structured/text fallback, safe observed HTTPS Nemlig images,
and accessible compact expandable rows. Draft controls SHALL use the same
principal-bound draft operations as conversation. The viewer SHALL NOT fetch
Nemlig directly, apply provider writes, or treat local acceptance as submission.

#### Scenario: Resource inventory is inspected
- **WHEN** a client lists resources or calls a product-bearing tool
- **THEN** one shared MCP Apps resource remains available with headless fallbacks

#### Scenario: Viewer expands a search result
- **WHEN** a user expands a product or its factual detail accordions
- **THEN** the viewer displays returned facts without further provider reads

#### Scenario: Local product review is displayed
- **WHEN** the client receives a draft snapshot
- **THEN** it presents Needs review, local Basket, and one contextual alternatives
  view with safe exits, explicit removal, bulk acceptance and submission intent

#### Scenario: Viewer receives partial or unavailable data
- **WHEN** a product field, image or interactive host bridge is unavailable
- **THEN** the viewer labels missing facts honestly and supplies the equivalent
  conversational action without fabricating an action result

### Requirement: Non-recipe tool surface
The server SHALL expose independent product search, favourites, exact product details, department browsing, basket view, and staged basket review/apply tools. Only local review tools SHALL reference the shared viewer; discovery and legacy provider tools SHALL return data without mounting widgets. The server SHALL NOT expose direct model-visible basket mutation, recipe, checkout, order, payment, purchase, or delivery-slot tools.

#### Scenario: Enumerate base tools
- **WHEN** a client lists tools
- **THEN** the read-only discovery, exact-details, section, basket-view, and prepare/apply proposal pairs remain available

#### Scenario: Inspect prohibited tools
- **WHEN** a client enumerates all tools
- **THEN** no tool name or description offers direct basket mutation, recipe parsing, checkout, order placement, payment, purchase, or delivery-slot changes


### Requirement: Composable catalogue and product viewer surface
The server SHALL expose current catalogue search, favourites, grocery sections, browsing, exact product details, and basket reads as independent conversational capabilities. Exact product details SHALL resolve one current product by its positive catalogue ID and SHALL remain read-only. Product search SHALL hydrate returned candidates through the existing exact-product loader and use the same supported public product projection as exact lookup. The server SHALL register one product viewer resource for product-bearing results and SHALL preserve complete structured and text fallbacks.

#### Scenario: Exact product details are requested
- **WHEN** a client supplies a positive product ID returned by a current search or plan
- **THEN** the server returns current product facts without reading or changing the basket

#### Scenario: Rich product search is requested
- **WHEN** a client supplies a search phrase and an optional provider-selected result count
- **THEN** the server returns unique detailed products in provider order, labels unavailable or invalid rows explicitly, and performs no second lookup when the viewer expands a successful result


### Requirement: Conversational reviewed basket changes

The server SHALL keep catalogue results and exact product details independent from basket operations, while basket changes SHALL remain behind the existing matching staged review/apply tools and explicit approval. Review and apply responses SHALL retain structured data plus a readable text fallback. Local review results SHALL attach the shared viewer resource; the viewer renders server-owned temporary review state and invokes only local-draft tools. Actual provider changes require a separate unchanged exact submission review and explicit approval.

#### Scenario: Exact review is submitted

- **WHEN** the user requests a basket change
- **THEN** the server returns the matching factual review without mutating the basket

#### Scenario: Exact approval is submitted

- **WHEN** the user explicitly approves an unchanged review
- **THEN** the matching apply tool performs the bounded mutation, verifies basket readback, and returns structured data plus a readable fallback

#### Scenario: Host initializes or fails
- **WHEN** the host supports the standard MCP Apps bridge
- **THEN** the viewer initializes before receiving results, renders explicit tool
  errors or cancellation, and offers a conversational fallback after loading times out
