## ADDED Requirements

### Requirement: Evidence-based product proposals

For each requested ingredient, ChatGPT SHALL propose one current product with package quantity, an integer match-confidence judgment from 0 to 100, and supporting product evidence. Match confidence SHALL be presented as a judgment, not a statistical probability. Catalogue results MAY contain unrelated products, but the proposed choice SHALL satisfy the available ingredient, brand, dietary, package, and product-purpose evidence.

#### Scenario: Search includes an unrelated product

- **WHEN** a search result contains an available product that does not fit the requested ingredient or purpose
- **THEN** it may remain among raw results but is not presented as the proposed choice

#### Scenario: Several suitable products differ meaningfully

- **WHEN** price, brand, quality, size, or purpose creates a meaningful choice
- **THEN** ChatGPT recommends one product and includes the useful alternatives with the evidence needed for an informed choice

### Requirement: Confidence-aware alternatives

Alternatives SHALL remain collapsed for recommendations at or above 80% match confidence and SHALL expand automatically below 80%.

#### Scenario: Recommendation is uncertain

- **WHEN** match confidence is below 80%
- **THEN** the proposed-basket view exposes the alternatives without requiring an extra action

#### Scenario: Recommendation is confident

- **WHEN** match confidence is at least 80%
- **THEN** one recommendation is shown and its alternatives remain available in a collapsed control

### Requirement: Favourites guide uncertain matches

When match confidence is below 80%, ChatGPT SHALL consult the user's existing Nemlig favourites and MAY prefer a favourite that satisfies the requested evidence. A favourite SHALL NOT override an incompatible product type or explicit requirement. The assistant SHALL NOT copy or persist favourite data as a preference profile.

#### Scenario: A suitable favourite exists

- **WHEN** an uncertain ingredient has a matching favourite
- **THEN** ChatGPT uses that favourite as supporting ranking evidence and identifies it in the proposal

#### Scenario: Favourite is unsuitable

- **WHEN** a favourite conflicts with the requested ingredient, brand, dietary constraint, package requirement, or product purpose
- **THEN** ChatGPT does not recommend it merely because it is a favourite

### Requirement: Explicit pantry assumptions

When common staples are omitted from a recipe proposal, ChatGPT SHALL list the assumptions, such as flour, salt, or pepper already being available.

#### Scenario: Recipe includes assumed staples

- **WHEN** ChatGPT omits a common household staple from discovery
- **THEN** the proposed basket states that the staple was assumed to be available
