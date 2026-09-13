## MODIFIED Requirements

### Requirement: Complete proposed-basket review
Before requesting approval to add products, the integration SHALL present every resolved proposed product in one complete compact visual basket review with requested package quantity, match confidence, favourite provenance, product evidence, useful available alternatives, and stated pantry assumptions. Every selected product SHALL remain visible without expanding a disclosure control. Rich evidence and alternatives MAY remain folded until requested. The integration SHALL retain a complete conversational fallback when the client cannot render MCP Apps.

#### Scenario: Proposal contains favourite and non-favourite products
- **WHEN** a proposed basket contains resolved products from favourites and general catalogue discovery
- **THEN** every resolved selected product appears once in the compact review and each favourite-derived selection is visibly identified

#### Scenario: Proposal has fewer than twenty products
- **WHEN** the proposal contains fewer than twenty resolved products
- **THEN** the picker presents every selected product in one complete compact review rather than splitting or omitting confident decisions

#### Scenario: Proposal has twenty or more products
- **WHEN** the proposal contains at least twenty resolved products within the fifty-item bound
- **THEN** the picker keeps every selected product visible as a compact row while rich evidence and alternatives remain progressively disclosed

#### Scenario: Non-favourite product has useful alternatives
- **WHEN** a selected product is not from favourites and discovery produced other relevant usable candidates
- **THEN** the review retains those alternatives for deliberate interactive choice without changing the basket

#### Scenario: Non-favourite product has no useful alternative
- **WHEN** a selected product is not from favourites and discovery produced no other relevant usable candidate
- **THEN** the selected product remains visible with its confidence and without an invented or irrelevant choice

#### Scenario: User inspects product evidence
- **WHEN** a selected product or alternative has description, declaration, or item details
- **THEN** the user can reveal each populated evidence category without hiding the compact selected-product summary

#### Scenario: User settles an alternative
- **WHEN** the user deliberately chooses a displayed alternative
- **THEN** the integration sends one conversational product-choice message, updates no basket state, and presents the resulting complete proposal again before requesting exact basket-addition approval

#### Scenario: User settles the alternatives
- **WHEN** the user finishes choosing among all presented alternatives
- **THEN** ChatGPT shows the complete updated proposed basket before requesting exact basket-addition approval

#### Scenario: Picker is unavailable
- **WHEN** the client cannot render the proposed-basket picker
- **THEN** the integration presents the same complete proposed products, favourite provenance, confidence, useful alternatives, and pantry assumptions conversationally
