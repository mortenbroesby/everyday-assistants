## ADDED Requirements

### Requirement: Individual recipe discovery

For ordinary recipe and meal-prep requests, the integration SHALL search for each needed ingredient separately with a short Danish term and SHALL allow ChatGPT to refine empty or unsuitable results through additional bounded search calls. It SHALL NOT require `plan_my_shopping` before individual discovery and SHALL NOT inspect the current basket to determine the proposed shop.

#### Scenario: A long search phrase is unsuitable

- **WHEN** an ingredient can be expressed by a shorter one- or two-word Danish catalogue term
- **THEN** ChatGPT searches with the shorter term and may refine it until useful current options are found or the ingredient is reported unresolved

#### Scenario: Current basket contains related products

- **WHEN** ChatGPT creates a recipe proposal
- **THEN** discovery neither reads nor subtracts current basket contents and proposes the products requested in the current conversation

### Requirement: Complete proposed-basket review

Before requesting approval to add products, the integration SHALL present the complete proposed basket with one recommended choice per ingredient, requested package quantity, match confidence, product evidence, alternatives, and stated pantry assumptions. It SHALL present actionable decisions in groups of at most five.

#### Scenario: Proposal has fewer than twenty products

- **WHEN** the proposal contains fewer than twenty products
- **THEN** ChatGPT may present visual review for the whole proposal in consecutive groups of no more than five decisions

#### Scenario: Proposal has twenty or more products

- **WHEN** the proposal contains at least twenty products
- **THEN** confident recommendations remain compact and uncertain decisions are presented in groups of no more than five

#### Scenario: User settles the alternatives

- **WHEN** the user finishes choosing among presented alternatives
- **THEN** ChatGPT shows the complete updated proposed basket before requesting exact basket-addition approval
