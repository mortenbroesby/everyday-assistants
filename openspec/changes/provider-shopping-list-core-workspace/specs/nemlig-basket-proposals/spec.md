## ADDED Requirements

### Requirement: Provider-list-only application
The protected Local basket application path SHALL use a verified Nemlig
shopping list and one native list-to-basket transfer. It SHALL NOT call the
individual product basket endpoint, including as a compatibility fallback.

#### Scenario: Hosted Local basket preparation
- **WHEN** the hosted Local basket prepares an exact addition
- **THEN** it creates or verifies the provider list before issuing a submission
  and reports failure without a real-basket mutation if the list capability is
  unavailable

#### Scenario: Hosted Local basket application
- **WHEN** an authorized prepared Local basket is applied
- **THEN** it sends one native list transfer and verifies the additive basket
  readback without sending individual product basket mutations
