## ADDED Requirements

### Requirement: Intent-directed product discovery

The MCP server SHALL guide clients to use `plan_shopping_list` for ordinary requests to find or add products, SHALL reserve `search_products` for explicit general-catalog searches, and SHALL reserve `list_favorites` for explicit favorite browsing. Discovery and planning SHALL remain separate from basket preparation and application.

#### Scenario: Ordinary product request

- **WHEN** the user ordinarily asks to find or add one or more products without requesting a specific search source
- **THEN** the server guidance directs the client to `plan_shopping_list`, which returns favorites-first candidates and uses catalog fallback only when no eligible favorite exists

#### Scenario: Explicit catalog request

- **WHEN** the user explicitly asks to search the general Nemlig catalog
- **THEN** the server guidance permits `search_products` without first requiring a favorite match

#### Scenario: Explicit favorites request

- **WHEN** the user explicitly asks to list or search saved favorites
- **THEN** the server guidance directs the client to `list_favorites` and no catalog fallback occurs

#### Scenario: Product discovery remains non-mutating

- **WHEN** any intent-directed discovery tool returns candidates or an unresolved choice
- **THEN** no basket proposal is prepared or applied and ambiguous candidates remain available for user choice
