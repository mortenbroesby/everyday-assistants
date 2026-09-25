## MODIFIED Requirements

### Requirement: Shared product viewer and exact basket review
The integration SHALL use one shared product presentation for conversational and
touch review. Local Basket is a shortlist of resolved products, not the actual
Nemlig basket. Both input modes SHALL address exact products in the same temporary
draft and support acceptance, changes, removal, quantities and safe navigation.
Actual submission SHALL use the existing exact proposal/apply safety engine only
after explicit approval of an unchanged submission review.

#### Scenario: Product review is operated by voice
- **WHEN** the user accepts some products, changes another, or requests remaining
  unresolved items conversationally
- **THEN** the resulting snapshot matches the equivalent touch operations

#### Scenario: User approves the exact basket review
- **WHEN** the user requests submission and approves the exact current review
- **THEN** the integration performs fresh validation, single-use application and
  verified basket readback without clearing unrelated Nemlig basket lines

#### Scenario: Viewer is unavailable
- **WHEN** the client cannot render or operate the resource
- **THEN** the same snapshot, product facts, explicit submission review and local
  operations remain available through structured tools and conversation

#### Scenario: Complete product result is shown
- **WHEN** a search or exact lookup contains resolved products
- **THEN** every product appears once with its supported exact facts and context;
  local draft controls never apply provider mutations or imply approval

### Requirement: Direct normal ChatGPT use

The system SHALL support independent product search, exact product lookup,
basket inspection, exact basket review, and explicitly approved apply in normal
ChatGPT conversations without requiring Codex, a saved planner, or a picker.
Selected local review results render through one shared product viewer, with
complete conversational structured/text fallbacks.

#### Scenario: User searches for products

- **WHEN** the private app is available and the user asks for products
- **THEN** ChatGPT receives richly detailed products in provider order and may
  summarize them without mounting a viewer, then open one local review for selected products

#### Scenario: Viewer is unavailable

- **WHEN** the client cannot render the optional shared viewer
- **THEN** ChatGPT continues with the same structured and readable product data
  without requiring UI

#### Scenario: User approves an exact addition

- **WHEN** the user explicitly approves an unchanged exact review
- **THEN** ChatGPT can invoke the protected apply tool and receive verified
  basket readback


### Requirement: Human-friendly shopping conversation

The direct ChatGPT integration SHALL describe products, basket changes, and
verified results like a household shopping assistant rather than a transaction
log. It SHALL distinguish local review changes from Nemlig changes and SHALL require explicit
approval of the exact unchanged proposal before applying a basket change.

#### Scenario: ChatGPT reviews a prepared change

- **WHEN** ChatGPT receives a valid basket proposal without exact approval
- **THEN** it presents a clean summary of what would change and asks one simple
  approval question without showing opaque protocol fields by default

#### Scenario: User requests product comparison

- **WHEN** the user asks to see or compare products
- **THEN** ChatGPT presents current names, brands, package sizes, prices,
  descriptions, supported facts, and safe images when available without
  changing the basket

#### Scenario: ChatGPT confirms a verified result

- **WHEN** explicitly approved basket additions succeed and fresh readback
  matches
- **THEN** ChatGPT confirms the resulting shopping outcome without narrating
  proposal lifecycle or protocol mechanics

#### Scenario: Host initializes or fails
- **WHEN** the host supports the standard MCP Apps bridge
- **THEN** the viewer initializes before receiving results, renders explicit tool
  errors or cancellation, and offers a conversational fallback after loading times out
