## ADDED Requirements

### Requirement: Complete compact proposed-basket picker
The `review_proposed_basket` tool SHALL expose every resolved proposed product in one read-only picker result, SHALL keep a compact selected-product summary visible for every item, and SHALL distinguish favourite-derived selections from other catalogue selections. Each row SHALL begin with review disabled; enabling review SHALL expose supplied alternatives and a bounded catalogue-search request. The picker SHALL keep choices local until one final conversational review handoff and SHALL add no automatic provider search, basket read, or basket mutation.

#### Scenario: Every selected product is visible
- **WHEN** `review_proposed_basket` resolves one or more proposed products
- **THEN** the picker renders one compact always-visible selected-product summary with an unchecked review checkbox for every resolved item regardless of favourite provenance or confidence

#### Scenario: Compact summary remains useful
- **WHEN** the picker renders a selected-product summary
- **THEN** it visibly retains the ingredient, requested quantity, product name, image fallback, package, price, favourite provenance, and integer confidence without enabling review or requiring expansion

#### Scenario: Rich evidence is available
- **WHEN** review is enabled for a product that supplies description, declaration, item details, or alternatives
- **THEN** the picker exposes only populated sections through accessible controls while leaving the compact summary visible

#### Scenario: Non-favourite alternatives are supplied
- **WHEN** a non-favourite selected product has relevant usable alternatives supplied from its bounded discovery result
- **THEN** the picker presents those alternatives in order and a deliberate choice updates only the local selected-product state

#### Scenario: No alternative is available
- **WHEN** a proposed item has no relevant usable alternative
- **THEN** the picker presents the selected item without an empty alternatives control or fabricated candidate and offers bounded catalogue search only when review is enabled

#### Scenario: Choice remains read-only
- **WHEN** the user chooses an alternative or retains the assistant selection
- **THEN** the picker neither prepares nor applies a basket proposal and performs no basket or favourites mutation

#### Scenario: Unchecked selection is retained
- **WHEN** the user leaves an item's review checkbox unchecked
- **THEN** the final review handoff retains the assistant-selected product for that item

#### Scenario: Catalogue search is deliberate
- **WHEN** the user enables review, enters a valid bounded search term, and activates catalogue search
- **THEN** the picker sends one ingredient-scoped host message, disables duplicate submission while pending, performs no direct provider call, and does not retry automatically

#### Scenario: Final review is consolidated
- **WHEN** the user activates final review
- **THEN** the picker sends one bounded host message containing every ingredient, chosen product ID, and quantity and requests the existing exact proposal workflow

#### Scenario: Host message fails
- **WHEN** a catalogue-search or final-review host message fails or a stale completion arrives
- **THEN** the picker ignores stale completion, restores a recoverable control state, and never sends a duplicate automatically
