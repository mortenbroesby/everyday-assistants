## ADDED Requirements

### Requirement: Conversational proposed-basket picker
The `review_proposed_basket` tool SHALL reuse one read-only Apps resource to render complete proposal, focused replacement choice, and final recap presentations. It SHALL keep product summaries visible, distinguish favourite-derived selections, keep choices local until one deliberate host message, and perform no automatic provider search, basket read, or basket mutation.

#### Scenario: Complete proposal is visible
- **WHEN** the tool receives a proposal presentation
- **THEN** it renders every resolved item as a compact responsive row with ingredient, requested quantity, image fallback, exact product name, brand, package, package count, price, favourite provenance, and integer confidence

#### Scenario: Rich evidence is available
- **WHEN** a product supplies description, declaration, or item details
- **THEN** the row exposes only populated evidence sections through accessible controls without hiding the product summary

#### Scenario: Focused choices are rendered
- **WHEN** the tool receives a choices presentation for challenged ingredients
- **THEN** it renders one native radio group per ingredient from the selected product and supplied alternatives, with no search input or direct provider call

#### Scenario: Choice is submitted
- **WHEN** the user deliberately submits focused replacements
- **THEN** the picker sends one bounded host message containing each challenged ingredient, chosen product ID, and requested quantity, and neither prepares nor applies a basket proposal

#### Scenario: Final recap is rendered
- **WHEN** the tool receives a recap presentation
- **THEN** it renders every retained and replaced item, marks only supplied changed lines, and labels the single final action `Add to Nemlig basket`

#### Scenario: Final approval is submitted
- **WHEN** the user activates `Add to Nemlig basket`
- **THEN** the picker sends one exact conversational approval handoff, disables duplicate submission while pending, performs no direct basket call, and never retries automatically

#### Scenario: Host message fails
- **WHEN** a replacement or approval host message fails or a stale completion arrives
- **THEN** the picker ignores stale completion, restores a recoverable control state, and never sends a duplicate automatically
