## MODIFIED Requirements

### Requirement: Shared product viewer resource
The server SHALL register one reusable product viewer resource for product-bearing
tools and temporary product review snapshots. The viewer SHALL render returned
data with complete structured/text fallback, safe observed HTTPS Nemlig images,
and accessible compact expandable rows. Draft controls SHALL use the same
principal-bound draft operations as conversation. The viewer SHALL NOT fetch
Nemlig directly, bypass protected submission, or treat local acceptance as approval.

#### Scenario: Resource inventory is inspected
- **WHEN** a client lists resources or calls a product-bearing tool
- **THEN** one shared MCP Apps resource remains available with headless fallbacks

#### Scenario: Viewer expands a search result
- **WHEN** a user expands a product or its factual detail accordions
- **THEN** the viewer displays returned facts without further provider reads

#### Scenario: Local product review is displayed
- **WHEN** the client receives a draft snapshot
- **THEN** it presents In Review, Ready, and one contextual alternatives
  drill-in with safe exits, explicit removal, batch acceptance and submission intent

#### Scenario: Plain product or actual-basket payload is rendered
- **WHEN** the viewer receives product facts or an actual-basket result without an activated local review
- **THEN** it renders read-only rows without local edit or submission controls and makes no automatic provider fetch

#### Scenario: Local review controls are explicitly activated
- **WHEN** a user edits an activated local review or confirms its prepared submission
- **THEN** the viewer invokes the existing review tool with current review reference, revision, and required exact action inputs, or the protected submit tool with review reference, current revision, and unchanged prepared submission reference after exact approval; the server remains authoritative and no write is retried automatically

#### Scenario: Viewer receives partial or unavailable data
- **WHEN** a product field, image or interactive host bridge is unavailable
- **THEN** the viewer labels missing facts honestly and supplies the equivalent
  conversational action without fabricating an action result

### Requirement: Non-recipe tool surface
The server SHALL expose independent product search, favourites, exact product details, department browsing, basket view, and staged basket review/apply tools. Local review tools and the explicit read-only actual-basket visual action SHALL reference the shared viewer; ordinary discovery and provider reads SHALL return data without mounting widgets. The server SHALL NOT expose direct model-visible basket mutation, recipe, checkout, order, payment, purchase, or delivery-slot tools.

#### Scenario: Enumerate base tools
- **WHEN** a client lists tools
- **THEN** the read-only discovery, exact-details, section, basket-view, and prepare/apply proposal pairs remain available

#### Scenario: Inspect prohibited tools
- **WHEN** a client enumerates all tools
- **THEN** no tool name or description offers direct basket mutation, recipe parsing, checkout, order placement, payment, purchase, or delivery-slot changes


### Requirement: Composable catalogue and product viewer surface
The server SHALL expose current catalogue search, favourites, grocery sections, browsing, exact product details, and basket reads as independent conversational capabilities. Exact product details SHALL resolve one current product by its positive catalogue ID and SHALL remain read-only. Product search SHALL hydrate returned candidates through the existing exact-product loader and use the same supported public product projection as exact lookup. The server SHALL register one product viewer resource for product-bearing results and SHALL preserve complete structured and text fallbacks.

#### Scenario: Exact product details are requested
- **WHEN** a client supplies a positive product ID returned by current discovery
- **THEN** the server returns current product facts without reading or changing the basket

#### Scenario: Rich product search is requested
- **WHEN** a client supplies a search phrase and an optional provider-selected result count
- **THEN** the server returns unique detailed products in provider order, labels unavailable or invalid rows explicitly, and performs no second lookup when the viewer expands a successful result

#### Scenario: Open-ended discovery is independent of a local product
- **WHEN** the user asks for matching products such as “salmiak” while a local selection or a product's alternatives is open
- **THEN** direct catalogue search uses the phrase as a standalone query, does not require or mutate a target product, and leaves local product membership and alternatives context unchanged

#### Scenario: Search failure differs from no matches
- **WHEN** catalogue search succeeds with no candidates
- **THEN** the tool returns a successful empty result, distinct from a failed search
- **WHEN** the provider search returns HTTP 500
- **THEN** the MCP call is an error that preserves the safe upstream operation/status message, not a successful empty result or a fabricated “no matches” response


### Requirement: Conversational reviewed basket changes

The server SHALL keep catalogue results and exact product details independent from basket operations. The only provider-basket mutation the assistant exposes SHALL be a positive, authorization-bound addition. A clear conversational instruction to add the current Ready selection authorizes only its unchanged exact prepared payload; Ready status alone does not. The assistant SHALL expose no provider-basket clear, line removal, swap, replacement, or quantity decrease operation, regardless of approval. Review and apply responses SHALL retain structured data plus a readable text fallback. Local review results SHALL attach the shared viewer resource; the viewer renders server-owned temporary review state and invokes the protected submit tool only after its explicit prepared-review confirmation. Actual additions require fresh validation, single-use authority and verified readback.

#### Scenario: Exact review is submitted

- **WHEN** the user requests a basket change
- **THEN** the server returns the matching factual review without mutating the basket

#### Scenario: Exact approval is submitted

- **WHEN** the user explicitly approves an unchanged review
- **THEN** the matching apply tool performs the bounded mutation, verifies basket readback, and returns structured data plus a readable fallback

#### Scenario: User asks to remove, swap, replace or clear actual basket items
- **WHEN** the user asks Nemlig Assistant to remove, swap, replace or clear
  products in the actual Nemlig basket
- **THEN** the assistant explains that actual-basket destructive operations are
  unavailable and leaves the basket unchanged; the user can manage it directly
  on Nemlig.com

#### Scenario: User adds to an existing provider line
- **WHEN** the Nemlig basket already contains two units and the user authorizes
  adding two more of the same product
- **THEN** the protected addition sets and verifies four units, never two or
  fewer, while preserving the existing line

#### Scenario: Host initializes or fails
- **WHEN** the host supports the standard MCP Apps bridge
- **THEN** the viewer initializes before receiving results, renders explicit tool
  errors or cancellation, and offers a conversational fallback after loading times out

### Requirement: Clear independent shopping tools
The MCP surface SHALL describe direct catalogue search, exact details, local
review editing, visual actual-basket inspection, and protected actual-basket
changes as distinct user jobs. Tool names, titles, descriptions and annotations
SHALL distinguish reads from local edits and real-basket writes. Discovery
SHALL remain available without creating a review or mounting its viewer. A
tool-surface change SHALL preserve the staged exact-approval and readback
boundary and the machine-readable feature inventory.

#### Scenario: User only wants matching products
- **WHEN** the user asks for all products matching an open phrase such as salmiak or butter
- **THEN** direct read-only search returns the unique detailed products from
  the provider response without an application result cap when count is omitted,
  and it creates no local review or basket change

#### Scenario: Search another way after alternatives are insufficient
- **WHEN** alternatives for one product are empty or irrelevant and the user asks
  to look up a broader or otherwise different phrase
- **THEN** direct catalogue search is available independently of that alternatives
  target; it does not silently replace the target or force candidates into it

#### Scenario: Search succeeds empty or fails
- **WHEN** search returns no candidates successfully or the provider returns an
  error such as HTTP 500
- **THEN** the assistant distinguishes “no matches returned” from “search failed,”
  does not claim catalogue absence after an empty response, and does not invent
  candidates or treat an error as an empty result

#### Scenario: User edits by conversation
- **WHEN** the user asks to add, change quantity, revisit, replace or remove an
  exact product in the active local selection without using the viewer
- **THEN** the same revision-checked review operations and current snapshot are
  available through conversation, with no real-basket write

#### Scenario: User requests a real-basket change
- **WHEN** the user asks to alter the actual Nemlig basket
- **THEN** the assistant can choose the matching factual prepare operation and
  protected apply operation; a clear conversational add instruction authorizes
  only the unchanged exact Ready payload it names, while other actual-basket
  changes require their exact explicit approval

#### Scenario: Tool jobs match conversational and viewer workflows
- **WHEN** the user operates any product lookup, local selection, alternative,
  preparation, or protected write through either the viewer or conversation
- **THEN** MCP titles/descriptions expose distinct understandable jobs and both
  routes preserve the same state and safety boundaries without a redundant
  parallel tool/workflow

#### Scenario: Viewer is not displayed
- **WHEN** a read-only search or basket result is consumed without a widget
- **THEN** structured results and readable text remain usable, and image URLs
  alone do not count as rendered product cards
