## Purpose

Makes Nemlig-owned shopping lists the durable source for an assistant shopping
workspace's product membership and quantities rather than duplicating them in
the assistant's Durable Object storage.

## ADDED Requirements

### Requirement: Provider lists own workspace product content

The system SHALL persist each active shopping workspace's product membership
and quantities in app-owned Nemlig shopping lists. Server-side workspace state
SHALL contain only opaque selection, ownership, and submission-fence metadata;
it SHALL NOT duplicate provider-list lines or quantities.

#### Scenario: Workspace item changes
- **WHEN** a user adds, removes, replaces, or changes the quantity of an item
- **THEN** the system changes the corresponding provider list and acknowledges
  the action only after an exact provider-list readback

#### Scenario: Prior Local basket is requested after cutover
- **WHEN** a pre-cutover Local basket identifier is presented
- **THEN** the system reports that the workspace is unavailable and does not
  recreate, migrate, or submit it implicitly

### Requirement: Ready submission is provider-list-only

The system SHALL prepare and submit Ready products through a verified Nemlig
shopping list and exactly one native list-to-basket transfer. It SHALL NOT use
individual product basket writes as a fallback for this flow.

#### Scenario: List support is unavailable
- **WHEN** the shopping-list provider capability is unavailable during
  preparation
- **THEN** preparation fails before any real-basket write and clearly reports
  that no basket write was sent

#### Scenario: Approved Ready submission
- **WHEN** an unchanged exact submission receives authorization
- **THEN** the system revalidates the provider list, performs one native
  list-to-basket transfer, and verifies the additive real-basket result
