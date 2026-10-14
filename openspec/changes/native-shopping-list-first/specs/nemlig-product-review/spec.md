## ADDED Requirements

### Requirement: Native shopping list from first selection
The system SHALL create a native Nemlig shopping list from exact selected products and quantities when the user requests a shopping selection for visual editing. A default name SHALL be supplied when no name is provided. Confirmed contents SHALL be owned by Nemlig, not a temporary process-local draft. Explicit additions, quantity changes, removals, and replacements SHALL persist to that exact list without a separate Save or Update step. These operations SHALL NOT modify the actual Nemlig basket.

#### Scenario: Select products for a new list
- **WHEN** the user chooses exact products and quantities without an existing selected list
- **THEN** the system creates and populates one native list and returns its stable provider ID and confirmed contents
- **AND** it reports incomplete or uncertain creation honestly without automatically creating another list

#### Scenario: Persist an edit
- **WHEN** a user changes quantity, replaces, removes, or adds a product in the selected list
- **THEN** the system checks account, exact list, and current contents before persisting the intended change and verifying the result
- **AND** it serializes writes within the active editing context and reports concurrent changes, partial results, and uncertain writes without silently discarding or replaying them

#### Scenario: Recover creation without duplicating the list
- **WHEN** a caller repeats the original selected items and name with the same `creation_id`
- **THEN** the account-scoped operation record returns or reconciles the existing outcome without another creation or blind replay of uncertain writes
- **AND** a different intent with that ID is rejected, while a deliberately new identical list requires a new ID

#### Scenario: Process lifetime ends
- **WHEN** the process restarts or temporary editor state expires
- **THEN** the native list remains discoverable and can be reopened by its exact ID with fresh provider contents

#### Scenario: Continue with a partially populated list
- **WHEN** only some selected products were confirmed and the user chooses to use those confirmed products
- **THEN** the system reads the exact list again, permits continued editing of its current contents, and does not retry the missing additions
- **AND** an automatic refresh alone does not silently erase the incomplete-creation warning

### Requirement: Native-list alternatives and reversible navigation
The system SHALL show alternatives for one identified product in the selected native list. Searching, viewing product details, and cancelling alternatives SHALL be read-only. Choosing an alternative SHALL persist that exact replacement while preserving quantity. Removing a product SHALL remove it only from the selected shopping list, never from the actual Nemlig basket.

#### Scenario: Cancel an alternative choice
- **WHEN** the user searches alternatives then returns without selecting one
- **THEN** the native list contents and quantities remain unchanged

#### Scenario: Choose an alternative
- **WHEN** the user selects a returned replacement for a product
- **THEN** the selected native list reflects that replacement at the prior quantity and retains unrelated products

### Requirement: Explicit protected native-list submission
The system SHALL add only the explicitly approved current native-list products and quantities to the actual Nemlig basket. List creation or editing SHALL NOT authorize basket submission. Editing SHALL invalidate pending approval. Existing principal, source-content, single-use, durable no-replay, mutation-lock and additive readback safeguards SHALL remain effective. Unrelated actual basket lines SHALL remain unchanged.

#### Scenario: List is ready for basket review
- **WHEN** the user requests submission of a confirmed native list
- **THEN** the system presents current products, quantities, estimated prices and effects for approval without applying them

#### Scenario: Approved submission succeeds
- **WHEN** the user approves the unchanged reviewed list
- **THEN** the system transfers it once and verifies additive basket readback
- **AND** existing exact-source cleanup safeguards govern deletion of the transferred source list

#### Scenario: Submission fails or becomes uncertain
- **WHEN** transfer or readback fails
- **THEN** the outcome remains explicitly failed or uncertain, with recoverable feedback and no automatic retry

### Requirement: Explicit native-list selection and recovery
A conversation SHALL target the selected native shopping list by provider ID under the authenticated account. Missing conversation metadata SHALL NOT cause selection of another conversation's list. Explicit provider-ID selection SHALL reestablish transient editing context after restart. Names SHALL NOT substitute for identity. Reopening SHALL never recreate a missing list automatically.

#### Scenario: Continue after restart
- **WHEN** the card or conversation reopens an exact native list after editor state is lost
- **THEN** it reads that list from the connected account and establishes a fresh editing context

#### Scenario: No target is known
- **WHEN** a user requests an existing list without a known target
- **THEN** the system offers native list discovery without guessing an unrelated list or creating one

#### Scenario: List is deleted or inaccessible
- **WHEN** the exact list is confirmed missing or its read fails
- **THEN** the system explains the condition and offers recovery without silently redirecting edits or replaying a previous write

### Requirement: Fresh native contents on card remount
A supported card SHALL refresh its exact native list on remount before enabling edits or submission. Cached tool output SHALL be treated as a display snapshot, never current provider truth. A failed refresh SHALL preserve visible context, show recoverable feedback, and block stale edits. Delayed passive snapshots SHALL NOT roll back confirmed actions. Retired resources SHALL remain inert; old transient drafts SHALL NOT be silently migrated.

#### Scenario: Local change returns a correlated result
- **WHEN** an explicit edit completes with confirmed native contents
- **THEN** the same card renders those contents and no additional Save or Update is needed

#### Scenario: Delayed passive snapshot follows an action
- **WHEN** stale host output arrives after a confirmed edit
- **THEN** it cannot overwrite the latest contents or redirect the selected list

#### Scenario: Reload original tool output
- **WHEN** ChatGPT remounts a card with its original invocation snapshot after quantity, removal, and replacement edits
- **THEN** the card fetches current contents by the original native list ID before enabling controls and shows the persisted edits

#### Scenario: Remount read fails
- **WHEN** current contents cannot be read
- **THEN** a recoverable modal explains the failure, the card does not disappear, and stale products cannot be edited or submitted until refreshed

### Requirement: Single automatically saved shopping-list view
The review SHALL display one native shopping-list product collection without separate To decide, Ready, unsaved draft, or manual Save/Update stages. Search and product disclosures SHALL not change selection. Only intentional editing actions SHALL persist changes; explicit Submit remains distinct.

#### Scenario: Empty list
- **WHEN** all products have been removed from the selected shopping list
- **THEN** the UI displays an empty native list and offers a path to add products without claiming a basket mutation or silently recreating the list

#### Scenario: Obsolete draft action
- **WHEN** an obsolete card requests a retired draft or staged-save action
- **THEN** validation rejects it without creating a list or changing shopping data

### Requirement: Distinct shopping-list and basket names
The provider-backed editing workspace SHALL be called a Shopping list in UI, tool guidance and errors. The actual checkout basket SHALL be called the Nemlig basket. Copy SHALL state that product edits are saved to the shopping list and that basket submission is separate.

#### Scenario: User edits products
- **WHEN** the user selects or edits products
- **THEN** the interface describes the native shopping list and never claims the changes are local or unsaved after confirmed persistence

#### Scenario: User inspects provider basket
- **WHEN** the user asks for basket contents or transfer readback
- **THEN** the system reads the actual basket rather than presenting shopping-list contents as basket truth

## REMOVED Requirements

### Requirement: Shared private product review
**Reason**: The user-approved native-first model replaces the temporary draft and manual persistence contract.
**Migration**: Follow "Native shopping list from first selection"; reopen an existing native list by its exact ID. Do not migrate old drafts automatically.

### Requirement: Contextual alternatives and reversible navigation
**Reason**: The user-approved native-first model replaces the temporary draft and manual persistence contract.
**Migration**: Follow "Native-list alternatives and reversible navigation"; reopen an existing native list by its exact ID. Do not migrate old drafts automatically.

### Requirement: Explicit protected submission
**Reason**: The user-approved native-first model replaces the temporary draft and manual persistence contract.
**Migration**: Follow "Explicit protected native-list submission"; reopen an existing native list by its exact ID. Do not migrate old drafts automatically.

### Requirement: Active conversation selection
**Reason**: The user-approved native-first model replaces the temporary draft and manual persistence contract.
**Migration**: Follow "Explicit native-list selection and recovery"; reopen an existing native list by its exact ID. Do not migrate old drafts automatically.

### Requirement: Persistent local review interaction
**Reason**: The user-approved native-first model replaces the temporary draft and manual persistence contract.
**Migration**: Follow "Fresh native contents on card remount"; reopen an existing native list by its exact ID. Do not migrate old drafts automatically.

### Requirement: To decide and Ready refinement
**Reason**: The user-approved native-first model replaces the temporary draft and manual persistence contract.
**Migration**: Follow "Single automatically saved shopping-list view"; reopen an existing native list by its exact ID. Do not migrate old drafts automatically.

### Requirement: Distinct Draft list and Nemlig basket names
**Reason**: The user-approved native-first model replaces the temporary draft and manual persistence contract.
**Migration**: Follow "Distinct shopping-list and basket names"; reopen an existing native list by its exact ID. Do not migrate old drafts automatically.
