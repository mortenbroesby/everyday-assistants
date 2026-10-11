## MODIFIED Requirements

### Requirement: Shared private product review
Conversation and touch SHALL share an unsaved draft scoped to the principal and
conversation. Accepting or editing draft items SHALL remain temporary until
explicit Save as shopping list. After saving, the same UI SHALL read/edit native
list contents with verified readback, without a durable editable local mirror.
Neither draft edits, saving nor saved-list edits SHALL change the actual basket.

#### Scenario: Accept some products
- **WHEN** exact candidate products are accepted in an unsaved draft
- **THEN** they remain in the unsaved draft until explicit Save; accepting alone
  creates no native list and changes no Nemlig basket

#### Scenario: Sequential or foreign action
- **WHEN** a card targets its exact live draft/native list or a foreign principal attempts access
- **THEN** authorized actions are serialized for their target and foreign or stale
  actions fail without mutation or retargeting

#### Scenario: Draft lifetime ends
- **WHEN** an unsaved draft is lost after inactivity, finish, restart or memory eviction
- **THEN** unsaved products disappear, saved shopping-list contents remain on
  Nemlig, and neither a draft nor a list is silently recreated

### Requirement: Contextual alternatives and reversible navigation
The system SHALL offer alternatives for an identified candidate or saved item,
preserve product details and cancellation, and allow returning without changes.
Before Save, acceptance/replacement SHALL edit only the draft. After Save,
explicit accepted edits SHALL write the selected native list. Temporary
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
Only exact explicitly approved saved-list products SHALL be submitted through the protected review,
authorization, single-use native transfer and additive basket-readback flow.
Any changed list contents SHALL invalidate prepared approval. Saving draft ideas
SHALL NOT imply submission approval; temporary candidates SHALL never be implicitly
submitted. An unsaved draft SHALL offer explicit Save before preparing submission. Successful submission SHALL
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
the same list, while unsaved drafts, alternative candidates and approval authority remain conversation-bound.
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
- **WHEN** an old card targets an expired unsaved draft, deleted native list or retired local ID
- **THEN** it performs no mutation and shows selection recovery; an uncertain
  prior submission directs the user to inspect the actual basket

### Requirement: Persistent local review interaction
Current supported cards SHALL distinguish an exact process-local draft target
from a native shopping-list ID. They SHALL reuse the existing draft product UI
for both states and SHALL render correlated current results. Delayed passive snapshots
SHALL NOT overwrite a confirmed newer result. Remount SHALL resolve current transient state for a draft or read current
provider state for a saved list; it SHALL NOT grant authority from cached snapshots. Retired bundles and
local-ID actions SHALL fail closed without reinterpreting their target.

#### Scenario: Local change returns a correlated result
- **WHEN** a supported action returns its current draft or verified native-list snapshot
- **THEN** the mounted card renders it without an unnecessary second write or read

#### Scenario: Delayed passive snapshot follows a local action
- **WHEN** an older passive result follows a confirmed action
- **THEN** it cannot roll the displayed list back to the older state

#### Scenario: A supported card is remounted
- **WHEN** a current card remounts
- **THEN** it resolves the correct draft/native target and shows current contents or
  expiry without implicitly creating, saving or restoring a list

#### Scenario: Confirm exact submission in the viewer
- **WHEN** the user confirms an unchanged exact review
- **THEN** the protected operation applies it at most once; cancellation or
  merely opening the review makes no basket write

### Requirement: To decide and Ready refinement
To decide and Ready SHALL be temporary draft review hints, not persistence
boundaries or native lists. Save SHALL persist the displayed draft product rows
and quantities without persisting these flags or granting basket authority.
Reopened native lists SHALL show their actual products in the reused draft UI.
Merely reconsidering or opening alternatives for a saved item SHALL NOT remove it;
only an explicit edit SHALL change saved contents. Submission SHALL review and
authorize exact saved products independently of former draft review hints.

#### Scenario: Select and accept in one action
- **WHEN** the user accepts selected candidates in an unsaved draft
- **THEN** their temporary draft review state changes; accepting, selecting rows or
  opening details alone does not save the draft or mutate provider state

#### Scenario: Reconsider a Ready product
- **WHEN** the user explicitly reconsiders a saved item
- **THEN** the existing item remains saved while alternatives are inspected; an
  explicit replacement/removal invalidates approval and requires native readback

#### Scenario: Remove all Ready products
- **WHEN** the user confirms clearing draft Ready items or the selected shopping list
- **THEN** the action changes only its target: draft state locally, or native contents
  with readback; unrelated suggestions and the actual basket remain unchanged

#### Scenario: Empty and completed workspace
- **WHEN** the draft/native list is empty or submission completes
- **THEN** the UI shows appropriate starting or success actions; uncertainty
  never offers automatic submission retry

#### Scenario: Obsolete review action
- **WHEN** an old card sends retired local-basket navigation or identity
- **THEN** validation rejects the action without provider mutation

### Requirement: Distinct Draft list and Nemlig basket names
Shopper-facing UI, guidance and errors SHALL call native saved selections
Shopping lists or Shopping list, using their actual list names where useful.
Before saving, the UI SHALL say Unsaved draft and offer Save as shopping list.
After saving, it SHALL use the native list name and distinguish Saved to Nemlig
from adding to the Nemlig basket. Nemlig basket SHALL refer only to the actual
basket. Draft, Review and To decide SHALL NOT promise durable storage.

#### Scenario: User inspects local choices
- **WHEN** the user opens a draft or saved choices
- **THEN** the UI and agent distinguish an Unsaved draft that can disappear from a
  native Shopping list whose edits are saved to Nemlig

#### Scenario: User inspects provider state
- **WHEN** the user asks about the actual basket or a transfer is uncertain
- **THEN** the agent reads the Nemlig basket and distinguishes it from shopping lists
