## Purpose

The former guided-shopping planner and selection journey are retired. Product
discovery, exact lookup, basket inspection, and explicitly approved basket
changes remain independent conversational operations.

## Requirements

### Requirement: No planner orchestration

The system SHALL NOT expose or require a whole-list planner, saved shopping
journey, selection store, automatic basket authority, or picker workflow.

#### Scenario: Products are requested

- **WHEN** a user asks for one or more products
- **THEN** the client performs direct search operations and keeps product choice
  in the conversation without creating planner state

#### Scenario: Search is repeated

- **WHEN** a user refines or repeats a product search
- **THEN** the system performs another independent search without advancing or
  mutating a saved journey

### Requirement: Rich independent product discovery

The system SHALL return successfully hydrated product details in provider order
for each selected search result, using the same normalized projection as exact
lookup. Duplicate IDs SHALL be hydrated once, partial detail failures SHALL be
explicit, and invalid rows SHALL not be represented as false products.

#### Scenario: Search returns products

- **WHEN** catalogue search returns unique addressable IDs
- **THEN** the system resolves their exact details and returns them in the
  original provider order

#### Scenario: A detail read fails

- **WHEN** one selected detail read fails without being an authentication
  failure
- **THEN** that row is marked unavailable while other resolved rows remain
  usable; authentication failures remain visible to the caller

### Requirement: Display-only product presentation

The system SHALL provide one reusable product presentation for search, exact
details, basket, review, and result contexts. Presentation SHALL be pure and
display-only: it SHALL not fetch, select, approve, mutate, or persist shopping
state. A host viewer SHALL expand already-returned details without another
provider call and SHALL have a complete structured/text fallback.

#### Scenario: Viewer renders a product

- **WHEN** a product-bearing result is rendered
- **THEN** the viewer displays supported facts, safe images, and relevant
  context without network access or write controls

#### Scenario: Viewer receives partial data

- **WHEN** a product is unavailable or an optional field/image is absent
- **THEN** the viewer labels the state honestly and remains accessible without
  inventing a value

### Requirement: Explicit basket authority

Basket inspection SHALL use authoritative basket data independently of product
discovery. Additions SHALL require an exact read-only review followed by
explicit approval of the unchanged review; applying a search result or viewing
the viewer SHALL never authorize a write.

#### Scenario: Basket is inspected

- **WHEN** a user asks to see the basket
- **THEN** the system returns current quantities and totals without planner or
  proposal creation

#### Scenario: A reviewed addition is approved

- **WHEN** the user explicitly approves the unchanged exact review
- **THEN** the existing protected apply boundary revalidates, mutates once, and
  verifies the basket readback

#### Scenario: Intent changes

- **WHEN** the user changes a product or quantity after review
- **THEN** the old review is not applicable and no write occurs without a new
  matching review and approval
