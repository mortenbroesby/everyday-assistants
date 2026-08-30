## ADDED Requirements

### Requirement: Authenticated favorites text search
The system SHALL let an authenticated user optionally supply a non-empty text query to the favorites command, SHALL compare the trimmed query with favorite product names using Danish locale-aware case folding, SHALL return only matching favorites up to the requested positive result limit, and SHALL preserve unfiltered favorites listing when no query is supplied.

#### Scenario: Danish favorite matches
- **WHEN** the user's favorites contain `Økologiske bananer` and the user searches favorites for `BANAN`
- **THEN** the matching favorite is returned with its existing product details and unrelated favorites are omitted

#### Scenario: Multiple favorites match
- **WHEN** more than one favorite name contains the normalized query
- **THEN** the system returns the matching favorites in their existing order up to the requested limit without selecting or adding one

#### Scenario: No favorite matches
- **WHEN** no favorite name contains the normalized query
- **THEN** the system returns an empty favorites result and performs no general catalog search or basket mutation

#### Scenario: Favorites are listed without a query
- **WHEN** the user requests favorites without supplying search text
- **THEN** the system preserves the existing limited favorites listing behavior
