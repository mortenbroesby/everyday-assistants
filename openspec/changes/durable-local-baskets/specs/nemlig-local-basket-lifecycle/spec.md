## Purpose

Define the owner-visible lifecycle of temporary Local baskets independently of
ChatGPT transcript and MCP-container lifetime, while retaining strict real-basket safety.

## ADDED Requirements

### Requirement: Durable owner Local basket inventory
The system SHALL maintain Local baskets for one authenticated owner independently
of ChatGPT conversation identity. Each Local basket SHALL have an opaque stable
identifier, creation time, last-activity time, expiry time, current product
snapshot, and current local selection state. An owner SHALL be able to create a
Local basket, list its unexpired Local baskets, select one as current, and
explicitly delete one. One Local basket SHALL contain no more than 500 product
lines. The owner SHALL retain no more than 50 Local baskets; creating another
SHALL silently evict the least-recently-used basket.

The inventory SHALL display a short non-secret prefix of the stable identifier,
last-active date, and unique-product count. It SHALL NOT require a user-editable
or generated human-readable basket name.

#### Scenario: Owner resumes from another chat
- **WHEN** the owner selects an unexpired Local basket from a supported new or old chat
- **THEN** the same current products, quantities, and local selection state are available
- **AND** no Nemlig basket operation occurs

#### Scenario: Owner deletes a Local basket
- **WHEN** the owner explicitly deletes one Local basket
- **THEN** that Local basket is unavailable to subsequent reads or edits
- **AND** other Local baskets and the real Nemlig basket remain unchanged

#### Scenario: Line limit is exceeded
- **WHEN** a create or update would make a Local basket contain more than 500 product lines
- **THEN** the operation fails without partially persisting the attempted change

#### Scenario: Inventory reaches its capacity
- **WHEN** an owner creates a fifty-first Local basket
- **THEN** the Local basket with the oldest last-activity time is removed before
  the new Local basket is retained
- **AND** an old card for the removed basket offers the same select-or-create
  landing state as an expired or manually deleted basket

### Requirement: Activity-based one-day retention
Every Local basket SHALL expire 24 hours after its most recent intentional
basket interaction. Explicit basket open, selection, and local edits SHALL
refresh that lifetime; passive ChatGPT conversation opening or restored card
rendering SHALL NOT. Reads, edits, selection, and recovery SHALL enforce expiry;
expired records SHALL be removed from active inventory and eventually deleted
from durable storage.

#### Scenario: Expiry is reached
- **WHEN** the owner opens or edits a Local basket at or after its expiry time
- **THEN** the system reports that it expired and offers an explicit new Local basket path
- **AND** it does not silently recreate prior products or alter the Nemlig basket

### Requirement: Restored Local baskets carry no write authority
A restored Local basket SHALL preserve only local shopping state. Any prior
prepared, submitted, failed, or uncertain provider operation SHALL remain
separate from restored state. A real Nemlig addition SHALL require fresh
validation, a newly prepared exact effect, explicit authorization, and existing
verified readback safeguards.

#### Scenario: Basket is resumed after a process restart
- **WHEN** an owner resumes a Local basket after a container restart
- **THEN** they can inspect and edit local products
- **AND** any real-basket submission must be freshly prepared before it can be authorized or applied
