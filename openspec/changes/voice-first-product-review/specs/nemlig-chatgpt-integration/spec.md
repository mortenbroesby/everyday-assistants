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
