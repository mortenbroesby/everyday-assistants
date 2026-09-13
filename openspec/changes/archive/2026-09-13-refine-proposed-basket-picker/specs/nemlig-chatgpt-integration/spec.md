## MODIFIED Requirements

### Requirement: Complete proposed-basket review
Before requesting approval to add products, the integration SHALL present every resolved proposed product in one compact visual proposal with requested package quantity, confidence, favourite provenance, exact product information, product evidence, useful bounded alternatives, and stated pantry assumptions. The integration SHALL accept conversational correction of named ingredients while retaining every unchallenged selection, SHALL use a focused picker for exact replacement choices, and SHALL present a complete final recap before an explicit `Add to Nemlig basket` handoff. The handoff SHALL use the existing exact review and protected apply workflow. The integration SHALL retain a complete conversational fallback when MCP Apps cannot render.

#### Scenario: Complete proposal is shown
- **WHEN** a proposal contains resolved favourite and catalogue products
- **THEN** every resolved selection appears once with exact product identity, package count, price, provenance, and confidence, without a status column, review checkbox, or search input

#### Scenario: Proposal has fewer than twenty products
- **WHEN** the proposal contains fewer than twenty resolved products
- **THEN** the integration presents every selection in one complete compact proposal

#### Scenario: Proposal has twenty or more products
- **WHEN** the proposal contains at least twenty resolved products within the fifty-item bound
- **THEN** the integration keeps every selection visible as a compact row using the host page's normal scrolling

#### Scenario: User corrects named ingredients
- **WHEN** the user says that one or more named ingredients are wrong and asks to keep everything else
- **THEN** the integration retains all unchallenged selections and searches only the challenged ingredients through the existing bounded read path

#### Scenario: Focused alternatives are available
- **WHEN** challenged ingredients have relevant usable candidates
- **THEN** the integration presents only those ingredients in a focused picker with one radio choice per ingredient and no browser-side provider access

#### Scenario: No useful alternative is available
- **WHEN** a challenged ingredient has no relevant usable candidate
- **THEN** the integration explains the limitation conversationally and suggests useful query wording instead of fabricating a choice or showing an inert retry button

#### Scenario: User settles replacements
- **WHEN** the user submits focused radio choices
- **THEN** the integration combines those choices with every retained selection and presents one complete final recap

#### Scenario: User settles the alternatives
- **WHEN** the user finishes the focused alternative choices
- **THEN** the integration sends the deliberate replacement selection once and requests the complete final recap without changing the basket

#### Scenario: Final recap contains changes
- **WHEN** one or more products were replaced
- **THEN** the recap keeps every product visible and marks only replaced lines with a subtle changed label

#### Scenario: User approves the final basket
- **WHEN** the user activates `Add to Nemlig basket`
- **THEN** the integration treats that action as explicit approval of the exact recap and still uses `review_items_to_add` followed by `add_approved_items`, fresh validation, single use, cancellation, readback, and no automatic retry

#### Scenario: Picker is unavailable
- **WHEN** the client cannot render MCP Apps
- **THEN** the integration presents the same complete proposal, correction guidance, exact alternatives, final recap, and approval boundary conversationally
