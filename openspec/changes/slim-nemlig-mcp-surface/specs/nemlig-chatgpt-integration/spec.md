## ADDED Requirements

### Requirement: ChatGPT uses the Draft list and Nemlig basket distinctly
The integration SHALL route product discovery to `find_groceries`, current provider-basket inspection to `show_my_basket`, and temporary choices to the Draft list tools. It SHALL NOT claim that image URLs or a successful tool response prove a card rendered. If the host does not render the Draft list viewer, it SHALL present complete text results. It SHALL NOT direct users to retired tool IDs.

#### Scenario: User asks to see the actual basket visually
- **WHEN** the user asks for cards or images of products already in the Nemlig basket
- **THEN** the assistant reads `show_my_basket`, presents the actual lines and totals, and honestly states if the host did not render cards

#### Scenario: User asks to continue deciding
- **WHEN** a Draft list already exists
- **THEN** the assistant uses `update_product_review` show to recover it without starting another list or reading the Nemlig basket as a substitute

## MODIFIED Requirements

### Requirement: Direct normal ChatGPT use
The system SHALL support independent product search, actual Nemlig basket inspection, temporary Draft list choices, and explicitly authorized Ready submission in normal ChatGPT conversations without requiring Codex, a saved planner, or a picker. Draft list results MAY render through one shared product viewer, with complete conversational structured and text fallbacks.

#### Scenario: User searches for products
- **WHEN** the private app is available and the user asks for products
- **THEN** ChatGPT receives richly detailed products in provider order and may summarize them without mounting a viewer, then explicitly open one Draft list for selected products

#### Scenario: Viewer is unavailable
- **WHEN** the client cannot render the optional shared viewer
- **THEN** ChatGPT continues with the same structured and readable product data without requiring UI

#### Scenario: User authorizes an exact addition
- **WHEN** the user clearly requests the unchanged Ready items or explicitly approves the exact prepared effect
- **THEN** ChatGPT can invoke protected Draft list submission and receive verified Nemlig basket readback

### Requirement: Human-friendly shopping conversation
The direct ChatGPT integration SHALL describe products, Draft list decisions, Nemlig basket changes, and verified results like a household shopping assistant rather than a transaction log. It SHALL distinguish local choices from provider state and require a clear user instruction for the exact unchanged Ready addition before a basket write.

#### Scenario: ChatGPT reviews a prepared change
- **WHEN** a Draft list submission is prepared without a clear instruction to add the unchanged Ready items
- **THEN** ChatGPT presents the exact effect in plain language and asks for approval without showing opaque protocol fields by default

#### Scenario: User requests product comparison
- **WHEN** the user asks to see or compare products
- **THEN** ChatGPT presents current names, brands, package sizes, prices, descriptions, supported facts, and safe images when available without changing the basket

#### Scenario: ChatGPT confirms a verified result
- **WHEN** explicitly authorized basket additions succeed and fresh readback matches
- **THEN** ChatGPT confirms the resulting shopping outcome without narrating proposal lifecycle or protocol mechanics

### Requirement: Shared product viewer and exact basket review
The integration SHALL use one shared product presentation for conversational and touch decisions in the temporary Draft list. Ready SHALL be a local selection of accepted products, not the actual Nemlig basket. Both input modes SHALL address exact products in the same Draft list and support acceptance, changes, removal, quantities, and safe navigation. Business state SHALL remain server-authoritative. Actual submission SHALL use the existing exact proposal safety engine only after a clear instruction to add the unchanged Ready items or explicit approval of the exact prepared effect.

#### Scenario: Product review is operated by voice
- **WHEN** the user accepts some products, changes another, or requests remaining To decide items conversationally
- **THEN** the resulting Draft list snapshot matches the equivalent touch operations

#### Scenario: Complete product result is shown
- **WHEN** a search contains resolved products
- **THEN** every product appears once with its supported exact facts and context, without an automatic provider call or implied approval; Draft list controls make no provider mutation

#### Scenario: User authorizes the exact basket addition
- **WHEN** the user clearly requests addition of the unchanged Ready items or explicitly approves the exact prepared effect
- **THEN** protected submission performs fresh validation, single-use application, and verified basket readback without clearing unrelated Nemlig lines or retrying an uncertain write

#### Scenario: Viewer is unavailable
- **WHEN** the client cannot render MCP Apps
- **THEN** the same Draft list snapshot, product facts, explicit submission effect, and local operations remain available through structured tools and conversation

## REMOVED Requirements

### Requirement: Honest visual basket requests in ChatGPT
**Reason**: It requires the retired `show_my_basket_visually` action.
**Migration**: Use the retained plain basket read and state rendering limits honestly.

### Requirement: Authenticated favorites lookup
**Reason**: The model-visible favorites action is retired; the lower-level client can remain for local CLI use.
**Migration**: Search current products with `find_groceries`.
