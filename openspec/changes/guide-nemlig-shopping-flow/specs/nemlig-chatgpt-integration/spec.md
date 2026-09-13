## MODIFIED Requirements

### Requirement: Complete proposed-basket review

The integration SHALL implement the approved mobile visual design as a four-stage List → Proposal → Choices → Approve journey. Every independently rendered stage SHALL use the same progress indicator, rounded flow container, card hierarchy, restrained green styling, readable imagery, and bottom navigation pattern; SHALL distinguish completed, current, optional, and upcoming stages; and SHALL remain understandable without an earlier iframe remaining mounted. Before requesting approval to add products, the integration SHALL present every resolved proposed product in one compact visual proposal with requested package quantity, confidence, favourite provenance, exact product information, product evidence, useful bounded alternatives, and stated pantry assumptions. Every stage after List SHALL provide a functional Back control to the preceding visited stage, and every non-final stage SHALL provide a functional primary control that advances safely. The integration SHALL accept conversational correction of named ingredients while retaining every unchallenged selection, SHALL use a focused picker for exact replacement choices, and SHALL present a complete final recap before an explicit `Add to Nemlig basket` handoff. The handoff SHALL use the existing exact review and protected apply workflow. The integration SHALL retain a complete conversational fallback when MCP Apps cannot render.

#### Scenario: Shopping list is ready for Nemlig

- **WHEN** ChatGPT and the user settle a bounded shopping list
- **THEN** the integration can render List as the current stage with checked requested lines, unchecked already-have lines, their requested amounts, and a primary `Search selected items with Nemlig` control

#### Scenario: User changes list selection

- **WHEN** the user checks or unchecks shopping-list lines and activates the primary List action
- **THEN** only checked lines are sent once through the host conversation for read-only Nemlig discovery, without changing the basket

#### Scenario: Shopping list was settled conversationally

- **WHEN** ChatGPT and the user advance from the settled List into product discovery
- **THEN** the proposal identifies List as completed, Proposal as current, Choices as optional, and Approve as upcoming

#### Scenario: Complete proposal is shown

- **WHEN** a proposal contains resolved favourite and catalogue products
- **THEN** every resolved selection appears once with exact product identity, package count, price, provenance, and confidence, without a status column, review checkbox, or search input, and the view tells the user to name challenged products conversationally or use the primary Continue control when satisfied

#### Scenario: User returns from Proposal

- **WHEN** the user activates Back on Proposal
- **THEN** the integration restores the preceding List view with its checked and unchecked state without reading or changing the basket

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
- **THEN** the integration presents only those ingredients in a focused picker with one radio choice per ingredient, identifies Choices as current, and provides Back to Proposal plus `Use these choices` without browser-side provider access

#### Scenario: User accepts the initial proposal

- **WHEN** the user is satisfied without challenging any proposed product
- **THEN** the primary Proposal action skips Choices and advances directly to the complete Approve recap

#### Scenario: No useful alternative is available

- **WHEN** a challenged ingredient has no relevant usable candidate
- **THEN** the integration explains the limitation conversationally and suggests useful query wording instead of fabricating a choice or showing an inert retry button

#### Scenario: User settles replacements

- **WHEN** the user submits focused radio choices
- **THEN** the integration combines those choices with every retained selection and presents one complete final recap

#### Scenario: User returns from Choices

- **WHEN** the user activates Back on Choices
- **THEN** the integration restores the complete preceding Proposal without changing product selections or the basket

#### Scenario: User settles the alternatives

- **WHEN** the user finishes the focused alternative choices
- **THEN** the integration sends the deliberate replacement selection once and requests the complete final recap without changing the basket

#### Scenario: Final recap contains changes

- **WHEN** one or more products were replaced
- **THEN** the recap keeps every product visible and marks only replaced lines with a subtle changed label

#### Scenario: Final recap is ready for approval

- **WHEN** the complete final recap renders
- **THEN** it identifies Approve as current, states that nothing has been added yet, and presents a secondary Back control plus `Add to Nemlig basket` as the primary and only mutation action

#### Scenario: User returns from Approve

- **WHEN** the user activates Back on Approve
- **THEN** the integration restores Choices when replacements were visited and otherwise restores Proposal, without changing the basket

#### Scenario: User approves the final basket

- **WHEN** the user activates `Add to Nemlig basket`
- **THEN** the integration treats that action as explicit approval of the exact recap and still uses `review_items_to_add` followed by `add_approved_items`, fresh validation, single use, cancellation, readback, and no automatic retry

#### Scenario: An independent view is opened

- **WHEN** Proposal, Choices, or Approve is rendered without an earlier view remaining visible
- **THEN** the view still communicates the shared journey, its current stage, and functional Back or Next controls as applicable without requiring the user to reconstruct prior UI state

#### Scenario: Picker is unavailable

- **WHEN** the client cannot render MCP Apps
- **THEN** the integration presents the same complete proposal, journey stage, next-action guidance, exact alternatives, final recap, and approval boundary conversationally
