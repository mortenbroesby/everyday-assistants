## MODIFIED Requirements

### Requirement: Seven model-visible shopping tools and owner-scoped viewer actions
The model-visible user tool set SHALL retain `check_nemlig_connection`, `find_groceries`, `get_profile`, `show_my_basket`, `start_product_review`, `update_product_review_conversation`, and `submit_product_review_conversation`. Start with exact selected items SHALL create a native shopping list immediately; an explicit provider ID SHALL open that list; no items or target SHALL discover lists without creating one. Update SHALL target an exact native list and persist intentional edits immediately. Provider list mutations SHALL be truthfully described and annotated. Unsaved-draft identifiers and manual Save/Update actions SHALL no longer be supported. Actual-basket mutations SHALL remain exclusive to protected explicit Submit. The app-only actions SHALL share these semantics without rendering another card.

#### Scenario: Model-visible tools are listed
- **WHEN** a compatible client lists tools
- **THEN** the seven tools expose schemas, descriptions and annotations consistent with native list creation/editing and separate basket submission

#### Scenario: Multiple supported cards use the current Draft list
- **WHEN** a supported client supplies a native list ID to show/select after process-local context expires
- **THEN** the server verifies it against the connected account and returns fresh contents and editing context without creating or writing a list

#### Scenario: A widget includes a retired identifier
- **WHEN** a client sends an obsolete draft identifier or manual save action
- **THEN** strict validation rejects it before provider mutation

#### Scenario: Search and basket are inspected
- **WHEN** a client searches products, reads the basket, or opens list discovery without selected products
- **THEN** no shopping list is created or changed and no basket write occurs

#### Scenario: An uncertain list write
- **WHEN** creation or editing lacks a confirmed outcome
- **THEN** the result identifies recovery of the existing operation/list and never instructs automatic replay or a replacement create

#### Scenario: New list creation identity
- **WHEN** start is called with selected items
- **THEN** it requires a caller-generated `creation_id` UUID, unique to the intentional new list and reusable only with the same original intent for recovery
- **AND** tool guidance forbids generating a fresh ID automatically after an ambiguous result

#### Scenario: Retired tool is called
- **WHEN** a client calls a retired tool name
- **THEN** the server returns the standard unknown-tool error without provider mutation
