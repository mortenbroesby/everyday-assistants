## MODIFIED Requirements

### Requirement: Shared private product review
Conversation and touch SHALL share temporary candidate review state scoped to
the principal and conversation. Accepted products SHALL be stored in the selected
native shopping list. Accepting, changing quantity, replacing or removing saved
items SHALL update that list with verified readback, never the actual basket.

#### Scenario: Accept some products
- **WHEN** exact candidate products are accepted
- **THEN** they are saved to the selected shopping list and unresolved suggestions
  remain temporary, without changing the Nemlig basket

#### Scenario: Sequential or foreign action
- **WHEN** a card changes its named list or a foreign principal attempts access
- **THEN** authorized actions are serialized for that account/list and foreign
  actions fail without mutation

#### Scenario: Draft lifetime ends
- **WHEN** temporary suggestions are lost after finish, restart or memory eviction
- **THEN** saved shopping-list contents remain on Nemlig; no list is recreated

### Requirement: Contextual alternatives and reversible navigation
The system SHALL offer alternatives for an identified candidate or saved item,
preserve product details and cancellation, and allow returning without changes.
Only explicit acceptance/replacement SHALL write a native list. Temporary
alternative results SHALL remain available during navigation while their target
and observed list state are still current.

#### Scenario: Cancel an alternative choice
- **WHEN** the user opens alternatives and cancels
- **THEN** the original candidate or saved item remains unchanged

#### Scenario: Inspect alternatives and return
- **WHEN** the user navigates away and returns in the same active review
- **THEN** the target and results remain available unless changed provider state
  requires refreshing them

### Requirement: Explicit protected submission
Only exact accepted products SHALL be submitted through the protected review,
authorization, single-use native transfer and additive basket-readback flow.
Any changed list contents SHALL invalidate prepared approval. Unresolved
suggestions SHALL never be implicitly submitted. Successful submission SHALL
consume the eligible corresponding list subject to safe cleanup; cleanup
uncertainty SHALL not invalidate verified basket success.

#### Scenario: Local selection is complete
- **WHEN** submission is requested
- **THEN** exact current lines, quantities, estimated prices and the intended
  source-list deletion are reviewed before authorization

#### Scenario: Approved submission succeeds
- **WHEN** the unchanged approved payload is transferred and verified
- **THEN** a distinct success state reports the basket outcome and whether the
  corresponding list was deleted or retained

#### Scenario: Submission fails or becomes uncertain
- **WHEN** transfer or readback becomes uncertain
- **THEN** the list and durable attempt fence remain; no retry or silent cleanup occurs

### Requirement: Active conversation selection
Each conversation SHALL have an optional native shopping-list reference. Multiple
conversations for the same connected account SHALL be allowed to explicitly choose
the same list, while suggestions and approval authority remain conversation-bound.
Saved lists SHALL have no assistant TTL. Closing or finishing the review SHALL
clear transient state without deleting a list; explicit list deletion is separate.

#### Scenario: Continue a long shopping conversation
- **WHEN** the user returns after an hour or an app restart
- **THEN** a still-existing native list can be selected and read without local TTL expiry

#### Scenario: Two conversations share an account
- **WHEN** two chats select the same list
- **THEN** they see the same saved contents after refresh but cannot reuse each
  other's approval or bypass the shared submission fence

#### Scenario: Finish and start again
- **WHEN** the user closes the review and later opens Shopping lists
- **THEN** native lists remain available and no prior submission approval is restored

#### Scenario: A host retains a card after the Draft list is lost
- **WHEN** an old card targets a deleted native list or retired local ID
- **THEN** it performs no mutation and shows selection recovery; an uncertain
  prior submission directs the user to inspect the actual basket

### Requirement: Persistent local review interaction
Current supported cards SHALL target explicit native shopping-list IDs for saved
mutations and SHALL render correlated current results. Delayed passive snapshots
SHALL NOT overwrite a confirmed newer result. Remount SHALL read current provider
state and SHALL NOT grant authority from cached snapshots. Retired bundles and
local-ID actions SHALL fail closed without reinterpreting their target.

#### Scenario: Local change returns a correlated result
- **WHEN** a supported action returns a verified list snapshot
- **THEN** the mounted card renders it without an unnecessary second write or read

#### Scenario: Delayed passive snapshot follows a local action
- **WHEN** an older passive result follows a confirmed action
- **THEN** it cannot roll the displayed list back to the older state

#### Scenario: A supported card is remounted
- **WHEN** a current card remounts
- **THEN** it resolves its native list and reads current contents without creating a list

#### Scenario: Confirm exact submission in the viewer
- **WHEN** the user confirms an unchanged exact review
- **THEN** the protected operation applies it at most once; cancellation or
  merely opening the review makes no basket write

### Requirement: To decide and Ready refinement
To decide SHALL contain temporary suggestions. Ready SHALL mean accepted products
in the one selected native shopping list, not another saved list. Explicitly
reconsidering a saved item SHALL remove it from that list with readback and place
it in temporary suggestions. Saved products SHALL remain independently submittable.

#### Scenario: Select and accept in one action
- **WHEN** the user accepts selected candidates
- **THEN** exactly those products are saved and verified in the selected list;
  merely selecting rows or opening details does not mutate provider state

#### Scenario: Reconsider a Ready product
- **WHEN** the user explicitly reconsiders a saved item
- **THEN** its verified removal invalidates submission approval and it becomes
  temporary; alternatives are also available directly for saved items

#### Scenario: Remove all Ready products
- **WHEN** the user confirms clearing the selected shopping list
- **THEN** its exact targeted contents are removed and read back, temporary
  suggestions remain, and the actual Nemlig basket is unchanged

#### Scenario: Empty and completed workspace
- **WHEN** the native list is empty or submission completes
- **THEN** the UI shows appropriate starting or success actions; uncertainty
  never offers automatic submission retry

#### Scenario: Obsolete review action
- **WHEN** an old card sends retired local-basket navigation or identity
- **THEN** validation rejects the action without provider mutation

### Requirement: Distinct Draft list and Nemlig basket names
Shopper-facing UI, guidance and errors SHALL call native saved selections
Shopping lists or Shopping list, using their actual list names where useful.
Nemlig basket SHALL refer only to the actual basket. Review and To decide SHALL
refer to temporary decisions, not another durable product store.

#### Scenario: User inspects local choices
- **WHEN** the user opens saved choices
- **THEN** the UI and agent describe the selected Shopping list and disclose
  that its edits are saved to Nemlig

#### Scenario: User inspects provider state
- **WHEN** the user asks about the actual basket or a transfer is uncertain
- **THEN** the agent reads the Nemlig basket and distinguishes it from shopping lists
