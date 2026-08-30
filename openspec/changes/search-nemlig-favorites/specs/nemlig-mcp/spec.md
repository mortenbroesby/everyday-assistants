## ADDED Requirements

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
