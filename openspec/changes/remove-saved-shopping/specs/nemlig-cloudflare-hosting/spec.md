## ADDED Requirements

### Requirement: Retired shopping storage preserves existing records
The hosted service SHALL stop routing application requests to saved-shopping storage. The retained legacy storage endpoint SHALL return a fixed unavailable response without reading, creating, updating or deleting stored records. Deployment SHALL retain its existing storage namespace and migration history without a destructive namespace migration.

#### Scenario: Legacy storage endpoint is called
- **WHEN** an old client or internal caller requests a saved plan or named-list storage endpoint
- **THEN** the endpoint returns HTTP 410 without accessing storage or forwarding the request

#### Scenario: Source removal is deployed
- **WHEN** the removal artifact replaces the prior service
- **THEN** existing stored records remain unchanged and no new saved-shopping records are created
