## ADDED Requirements

### Requirement: Storefront favorites membership

Favorites listing and text search SHALL use the signed-in storefront favorites page for the current delivery slot. Results SHALL follow first appearance in storefront order, deduplicate by product ID and apply caller pagination after deduplication. Provider failures SHALL surface to callers.

#### Scenario: The inventories differ

- **WHEN** an authenticated user lists favorites and the legacy and storefront sets differ
- **THEN** the assistant returns the storefront set without consulting the legacy inventory

#### Scenario: A storefront product appears in multiple lists

- **WHEN** multiple sections include the same favorite
- **THEN** its first appearance determines its position in the deduplicated results
