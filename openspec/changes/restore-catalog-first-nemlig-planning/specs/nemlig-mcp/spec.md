## MODIFIED Requirements

### Requirement: Intent-directed product discovery

The MCP server SHALL guide clients to use `plan_shopping_list` for ordinary requests to find or add products, SHALL make ordinary planning use current general-catalogue candidates, and SHALL reserve `list_favorites` for explicit favourite browsing or favourite-based selection. Discovery and planning SHALL remain separate from basket preparation and application.

#### Scenario: Ordinary product request

- **WHEN** the user ordinarily asks to find or add one or more products without requesting a specific search source
- **THEN** the server guidance directs the client to catalogue-backed `plan_shopping_list`, which returns bounded current candidates without fetching or preferring favourites

#### Scenario: Explicit catalog request

- **WHEN** the user explicitly asks to search the general Nemlig catalog
- **THEN** the server guidance permits `search_products` directly

#### Scenario: Explicit favorites request

- **WHEN** the user explicitly asks to list, search, or select from saved favorites
- **THEN** the server guidance directs the client to `list_favorites` and no catalogue substitution occurs without another user choice

#### Scenario: Product discovery remains non-mutating

- **WHEN** any intent-directed discovery tool returns candidates or an unresolved choice
- **THEN** no basket proposal is prepared or applied and ambiguous candidates remain available for user choice
