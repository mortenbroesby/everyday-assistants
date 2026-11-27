## ADDED Requirements

### Requirement: Confirm deletion of reviewed basket contents

The assistant SHALL permit removing one entire product line or clearing the basket only after presenting the affected products and quantities and receiving separate explicit confirmation of the exact reviewed action.

#### Scenario: Confirm whole-line removal
- **WHEN** the user confirms removing a selected line from a matching fresh basket
- **THEN** the assistant dispatches one storefront write and verifies the absence of that line and the quantities of all surviving lines

#### Scenario: Confirm clearing the basket
- **WHEN** the user confirms clearing the exact reviewed basket
- **THEN** the assistant sends one clear request and independently verifies that the basket is empty

#### Scenario: Stale or incomplete review
- **WHEN** the action, account, basket identity or contents cannot be verified, or the review is expired or consumed
- **THEN** the assistant declines to send a write

#### Scenario: Uncertain outcome
- **WHEN** dispatch or readback has an uncertain result
- **THEN** the assistant reports uncertainty and does not replay the request

### Requirement: Model-visible shopping tools and owner-scoped viewer actions
The model-visible user tool set SHALL contain exactly `check_nemlig_connection`, `find_groceries`, `get_profile`, `show_my_basket`, `start_product_review`, `update_product_review_conversation`, `submit_product_review_conversation`, `show_product_review`, `review_basket_deletion`, and `confirm_basket_deletion`. The app-only `update_product_review` and `submit_product_review` actions SHALL target the exact active `draft_id` and `review_context_id`; submission SHALL also include a unique `submission_id` and the exact `reviewed_list`. The app-only `save_basket_as_shopping_list` action SHALL be available only after at least one verified addition. `get_profile`, search, and actual-basket reads SHALL remain read-only. Start/update SHALL change only the temporary draft; only protected submit paths MAY add to the actual basket. Retired tool names SHALL return the standard unknown-tool response without provider mutation.

#### Scenario: Model-visible tools are listed
- **WHEN** a compatible client lists tools and honors app visibility metadata
- **THEN** the model-visible set contains exactly the named tools with complete schemas and behavior-matched annotations

#### Scenario: A widget includes a retired identifier
- **WHEN** a widget calls `update_product_review` or `submit_product_review`
  with an obsolete card, review, revision, or `basket_id` field
- **THEN** strict input validation rejects the call before its handler and
  neither the Draft list nor Nemlig basket changes

#### Scenario: Multiple supported cards use the current Draft list
- **WHEN** a supported widget submits an action with the exact active draft
  and review-context IDs
- **THEN** the server applies it to that authenticated owner's draft without
  selecting another list or superseding the current card

#### Scenario: Retired tool is called
- **WHEN** a client calls `show_my_basket_visually`, `review_items_to_add`, `add_approved_items`, or another retired tool name
- **THEN** the server reports an unknown tool and performs no provider operation

#### Scenario: Search and basket are inspected
- **WHEN** a client searches or reads the actual Nemlig basket
- **THEN** it receives complete structured and text data without opening a Draft list or modifying the basket

## REMOVED Requirements

### Requirement: Seven model-visible shopping tools and owner-scoped viewer actions
**Reason**: The catalog now includes draft display and the two basket deletion tools.
**Migration**: Discover the current tool set with tools/list.
