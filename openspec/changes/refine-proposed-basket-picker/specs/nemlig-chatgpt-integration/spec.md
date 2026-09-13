## MODIFIED Requirements

### Requirement: Complete proposed-basket review
Before requesting approval to add products, the integration SHALL present every resolved proposed product in one complete compact visual basket review with requested package quantity, match confidence, favourite provenance, product evidence, useful available alternatives, and stated pantry assumptions. Every selected product SHALL remain visible with an unchecked `Review this item` checkbox. Unchecked items SHALL retain the assistant selection; checked items SHALL expose supplied alternatives and an ingredient-scoped catalogue-search request. The integration SHALL retain a complete conversational fallback when the client cannot render MCP Apps.

#### Scenario: Proposal contains favourite and non-favourite products
- **WHEN** a proposed basket contains resolved products from favourites and general catalogue discovery
- **THEN** every resolved selected product appears once in the compact review, begins unchecked, and each favourite-derived selection is visibly identified

#### Scenario: Proposal has fewer than twenty products
- **WHEN** the proposal contains fewer than twenty resolved products
- **THEN** the picker presents every selected product in one complete compact review rather than splitting or omitting confident decisions

#### Scenario: Proposal has twenty or more products
- **WHEN** the proposal contains at least twenty resolved products within the fifty-item bound
- **THEN** the picker keeps every selected product visible as a compact row while review controls remain collapsed until the corresponding item is checked

#### Scenario: Non-favourite product has useful alternatives
- **WHEN** a selected product is not from favourites and discovery produced other relevant usable candidates
- **THEN** checking that item exposes those alternatives for local deliberate choice without changing the basket

#### Scenario: Non-favourite product has no useful alternative
- **WHEN** a selected product is not from favourites and discovery produced no other relevant usable candidate
- **THEN** the selected product remains visible with its confidence and a catalogue-search option when checked, without an invented candidate

#### Scenario: User inspects product evidence
- **WHEN** a checked selected product or alternative has description, declaration, or item details
- **THEN** the user can reveal each populated evidence category without hiding the compact selected-product summary

#### Scenario: User settles an alternative
- **WHEN** the user deliberately chooses a displayed alternative for a checked item
- **THEN** the integration records that choice locally and updates no basket or proposal state

#### Scenario: User settles the alternatives
- **WHEN** the user finishes reviewing checked items and activates final review
- **THEN** the integration sends every retained and changed selection once and ChatGPT creates and shows the complete exact proposal before requesting basket-addition approval

#### Scenario: Picker is unavailable
- **WHEN** the client cannot render the proposed-basket picker
- **THEN** the integration presents the same complete proposed products, favourite provenance, confidence, useful alternatives, and pantry assumptions conversationally and accepts equivalent choices in conversation

#### Scenario: User requests a catalogue search
- **WHEN** the user checks an item, enters a bounded search term, and deliberately requests catalogue search
- **THEN** the integration sends one ingredient-scoped conversational search request, performs no browser-side provider or basket call, and does not retry automatically
