## MODIFIED Requirements

### Requirement: Seven model-visible shopping tools and owner-scoped viewer actions
The model-visible set SHALL remain `check_nemlig_connection`, `find_groceries`,
`get_profile`, `show_my_basket`, `start_product_review`,
`update_product_review_conversation`, and `submit_product_review_conversation`.
Existing review tool names SHALL support native shopping-list semantics without
adding a parallel local-basket tool family. Widget saved-list actions SHALL require
`shopping_list_id`; submission SHALL additionally require the exact
`submission_id`. Conversation tools SHALL use an explicit list ID or a revalidated
selection hint, never a guessed name. List reads SHALL be read-only; create/edit/
delete annotations and guidance SHALL truthfully declare provider mutations.
Only protected submission SHALL add to the actual basket. All list operations
SHALL require the connected account. Retired local IDs SHALL be rejected.

#### Scenario: Model-visible tools are listed
- **WHEN** a client lists tools
- **THEN** the seven existing names expose complete updated schemas and
  behavior-matched annotations without promising credential-free local edits

#### Scenario: A widget includes a retired identifier
- **WHEN** a widget supplies an old local basket ID or obsolete authority fields
- **THEN** validation rejects it without translating it into another native list

#### Scenario: Multiple supported cards use the current Draft list
- **WHEN** multiple cards act on an account list
- **THEN** each saved mutation targets its explicit original shopping-list ID
  and fresh state; changing the chat selection cannot retarget a card

#### Scenario: Retired tool is called
- **WHEN** a retired tool name is invoked
- **THEN** the server returns the standard unknown-tool result without mutation

#### Scenario: Search and basket are inspected
- **WHEN** the user searches or reads the actual basket
- **THEN** complete structured and text results are returned without creating a
  shopping list or changing provider content
