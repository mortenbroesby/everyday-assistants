## ADDED Requirements

### Requirement: Ready contents synchronize to an assistant-owned provider list

For a provider-authenticated workspace, the assistant SHALL make the provider shopping list the durable source of Ready contents. A Ready edit SHALL be acknowledged only after serialized provider-list write and matching readback. Browser snapshots and local presentation caches SHALL NOT be a second durable source of contents.

#### Scenario: Quantity change is synchronized

- **WHEN** a user changes the quantity of a Ready product
- **THEN** the assistant serializes the provider-list update, confirms exact list readback, and leaves the real basket unchanged

### Requirement: Closing preserves untransferred work without reusing authority

Closing or remounting a workspace SHALL retain its app-owned provider list. Explicit abandonment SHALL delete only that list and invalidate submission authority. A legacy local workspace SHALL NOT be silently uploaded or retain prepared authority during conversion.

#### Scenario: Card closes before submission

- **WHEN** the user closes an active synchronized workspace before submission
- **THEN** reopening reads its provider-list contents with no real-basket mutation and no restored prepared authority
