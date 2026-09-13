## ADDED Requirements

### Requirement: Complete compact proposed-basket picker
The `review_proposed_basket` tool SHALL expose every resolved proposed product in one read-only picker result, SHALL keep a compact selected-product summary visible for every item, and SHALL distinguish favourite-derived selections from other catalogue selections. It SHALL expose the supplied integer match confidence and useful supplied alternatives without adding an automatic provider search, basket read, or basket mutation.

#### Scenario: Every selected product is visible
- **WHEN** `review_proposed_basket` resolves one or more proposed products
- **THEN** the picker renders one compact always-visible selected-product summary for every resolved item regardless of favourite provenance or confidence

#### Scenario: Compact summary remains useful
- **WHEN** the picker renders a selected-product summary
- **THEN** it visibly retains the ingredient, requested quantity, product name, image fallback, package, price, favourite provenance, and integer confidence without requiring expansion

#### Scenario: Rich evidence is available
- **WHEN** a product supplies description, declaration, item details, or alternatives
- **THEN** the picker exposes only the populated sections through accessible disclosure controls while leaving the compact summary visible

#### Scenario: Non-favourite alternatives are supplied
- **WHEN** a non-favourite selected product has relevant usable alternatives supplied from its bounded discovery result
- **THEN** the picker presents those alternatives in order and a deliberate choice sends the existing conversational choice message once

#### Scenario: No alternative is available
- **WHEN** a proposed item has no relevant usable alternative
- **THEN** the picker presents the selected item without an empty disclosure control or fabricated candidate

#### Scenario: Choice remains read-only
- **WHEN** the user chooses an alternative in the picker
- **THEN** the picker neither prepares nor applies a basket proposal and performs no basket or favourites mutation
