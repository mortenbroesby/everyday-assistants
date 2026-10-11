## MODIFIED Requirements

### Requirement: Seven model-visible shopping tools and owner-scoped viewer actions
The model-visible set SHALL remain `check_nemlig_connection`, `find_groceries`,
`get_profile`, `show_my_basket`, `start_product_review`,
`update_product_review_conversation`, and `submit_product_review_conversation`.
Existing review tool names SHALL support native shopping-list semantics without
adding a parallel local-basket tool family. Start SHALL create an unsaved draft;
update actions SHALL expose explicit Save as shopping list and distinguish
process-local draft targets from native targets. Stale draft references SHALL
never resolve to another draft or an automatically created list. Widget saved-list actions SHALL require
`shopping_list_id`; submission SHALL additionally require the exact
`submission_id`. Native-list conversation actions SHALL use an explicit list ID or a revalidated
selection hint, never a guessed name. Draft actions SHALL resolve their exact
live conversation-bound draft reference. List reads SHALL be read-only; create/edit/
delete annotations and guidance SHALL truthfully declare provider mutations.
Only protected submission SHALL add to the actual basket. Native list operations
including Save SHALL require the connected account; editing an existing transient
draft SHALL NOT require native-list storage. Multi-action tool annotations SHALL
reflect their provider-writing actions even though unsaved draft edits are local. Retired local IDs SHALL be rejected.

#### Scenario: Model-visible tools are listed
- **WHEN** a client lists tools
- **THEN** the seven existing names expose complete updated schemas and
  behavior-matched annotations distinguishing unsaved edits from provider writes

#### Scenario: A widget includes a retired identifier
- **WHEN** a widget supplies an old local basket ID or obsolete authority fields
- **THEN** validation rejects it without translating it into another native list

#### Scenario: Multiple supported cards use the current Draft list
- **WHEN** multiple cards act on an account list
- **THEN** each saved mutation targets its explicit original shopping-list ID
  and fresh state; changing the chat selection cannot retarget a card

#### Scenario: Save is distinct from submission
- **WHEN** a conversation or widget requests Save as shopping list
- **THEN** only the explicitly targeted current draft is saved and verified;
  no basket transfer or approval is created

#### Scenario: Retired tool is called
- **WHEN** a retired tool name is invoked
- **THEN** the server returns the standard unknown-tool result without mutation

#### Scenario: Search and basket are inspected
- **WHEN** the user searches or reads the actual basket
- **THEN** complete structured and text results are returned without creating a
  shopping list or changing provider content
