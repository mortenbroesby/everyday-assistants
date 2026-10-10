## MODIFIED Requirements

### Requirement: Direct normal ChatGPT use
The system SHALL support independent product search, actual Nemlig basket
inspection, selectable temporary Local basket choices, and explicitly
authorized Ready submission in normal ChatGPT conversations without requiring
Codex, a saved planner, or a picker. Local basket results MAY render through
one shared product viewer, with complete conversational structured and text
fallbacks.

#### Scenario: User searches for products
- **WHEN** the private app is available and the user asks for products
- **THEN** ChatGPT receives richly detailed products in provider order and may
  summarize them without mounting a viewer, then explicitly create or add them
  to a selected Local basket

#### Scenario: Products arrive while a Local basket is selected
- **WHEN** a grocery request produces products and the chat has a selected Local basket
- **THEN** the assistant proposes appending to that Local basket and offers to
  create a new one
- **AND** it waits for the user's explicit choice before changing either Local basket

#### Scenario: Viewer is unavailable
- **WHEN** the client cannot render the optional shared viewer
- **THEN** ChatGPT continues with the same structured and readable product data
  without requiring UI

#### Scenario: User authorizes an exact addition
- **WHEN** the user clearly requests the unchanged Ready items or explicitly approves the exact prepared effect
- **THEN** ChatGPT can invoke protected Local basket submission and receive verified Nemlig basket readback

### Requirement: ChatGPT uses the Draft list and Nemlig basket distinctly
The integration SHALL route product discovery to `find_groceries`, current
provider-basket inspection to `show_my_basket`, and temporary choices to Local
basket tools. It SHALL let the owner list and select an active Local basket
from any supported chat while it remains unexpired. It SHALL NOT claim that
image URLs or a successful tool response prove a card rendered. If the host
does not render the Local basket viewer, it SHALL present complete text results.
It SHALL NOT direct users to retired tool IDs.

#### Scenario: User asks to continue shopping
- **WHEN** one or more unexpired Local baskets exist
- **THEN** the assistant lists enough identifying information to select one and
  opens the selected Local basket without starting another or reading the
  Nemlig basket as a substitute

#### Scenario: User asks to continue deciding
- **WHEN** a Local basket already exists
- **THEN** the assistant uses the existing Local basket interaction to recover
  the selected basket without starting another or reading the Nemlig basket as
  a substitute

#### Scenario: User asks to see the actual basket visually
- **WHEN** the user asks for cards or images of products already in the Nemlig basket
- **THEN** the assistant reads `show_my_basket`, presents the actual lines and totals, and honestly states if the host did not render cards
