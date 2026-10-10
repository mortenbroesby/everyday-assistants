## MODIFIED Requirements

### Requirement: Shared private product review
The system SHALL maintain the same principal-and-conversation-bound temporary review snapshot for conversation and touch. Every product in the local basket SHALL be a Ready submission candidate; new products and replacements SHALL enter or remain Ready. Local quantity change, replacement, removal and navigation SHALL NOT modify the Nemlig basket.

#### Scenario: Add products to the local basket
- **WHEN** exact products are added to the active review
- **THEN** every returned local row is Ready and eligible for the later exact submission review, with no provider mutation

#### Scenario: Accept some products
- **WHEN** an older card sends an acceptance action
- **THEN** the server does not create a hidden subset; every current local row remains a submission candidate or the stale action fails without changing the review

#### Scenario: Sequential or foreign action
- **WHEN** one supported card updates the conversation's current Local basket, a concurrent action arrives, or another principal attempts access
- **THEN** the supported action uses the owner list without a card or revision identifier, while concurrent or foreign actions fail without changing it

#### Scenario: Draft lifetime ends
- **WHEN** the user finishes shopping, its process restarts, or bounded memory eviction removes it
- **THEN** the system reports that the Local basket is unavailable without recreating it silently or changing the provider basket

### Requirement: Contextual alternatives and reversible navigation
The system SHALL show alternatives for one identified local product in a dedicated full-page view with Back, the current product, search, selectable options, and an explicit Use selected alternative action. Searching, navigating back, or cancelling SHALL leave the local row unchanged. Replacing a product SHALL preserve its quantity and Ready status, update only the local row, and invalidate any prepared submission. Alternative results SHALL remain tied to their exact target in the owner list.

#### Scenario: Cancel an alternative choice
- **WHEN** the user opens alternatives for a local basket product then goes back
- **THEN** the unchanged local product remains Ready and no provider mutation occurs

#### Scenario: Replace a local basket product
- **WHEN** the user explicitly uses an available exact alternative for a product
- **THEN** the replacement takes that row's quantity, remains Ready, and invalidates a prepared submission without changing the Nemlig basket

#### Scenario: Inspect alternatives and return
- **WHEN** the user opens alternatives for a local basket product and returns
- **THEN** the same target and returned alternatives remain available, and the local row is unchanged

### Requirement: Explicit protected submission
The system SHALL review every current local basket item, regardless of any legacy stored review state. It MAY explicitly exclude a product confirmed unavailable or missing while preparing the remaining available products, and SHALL report each exclusion rather than silently omit a row. Missing or changed prices SHALL NOT block submission. Unresolved identity, quantity, or availability SHALL fail closed. Editing the draft SHALL invalidate its pending submission. Applying still requires explicit confirmation of the unchanged exact review, and all existing freshness, single-use, principal, mutation-lock, uncertain-write, and readback safeguards SHALL remain effective. Unrelated real basket lines SHALL remain unchanged.

#### Scenario: Submit the entire local basket
- **WHEN** the user requests submission and every current local item is available
- **THEN** the system prepares exact current quantities and effects for every item, with prices where available, without applying them

#### Scenario: Local selection is complete
- **WHEN** the user submits the current Local basket
- **THEN** the system reviews every exact current item, reports confirmed unavailable items as excluded, and prepares the remaining available items without applying them

#### Scenario: A local basket item is unavailable or incomplete
- **WHEN** a current local item is confirmed unavailable or missing
- **THEN** preparation identifies it as excluded and prepares the remaining available items; an unresolved identity, quantity, or availability still stops preparation

#### Scenario: Approved submission succeeds
- **WHEN** the user approves the unchanged current submission review
- **THEN** the system applies it once, returns verified Nemlig basket readback, retains the local basket, and marks the submission outcome truthfully

#### Scenario: Submission fails or becomes uncertain
- **WHEN** application or readback fails
- **THEN** the local basket remains intact, the outcome is explicitly uncertain or failed, and the system does not automatically retry the submission

### Requirement: To decide and Ready refinement
The touch review SHALL show one Local basket list without visible To decide or Ready tabs, row-selection checkboxes, or an acceptance step. Every product SHALL be a Ready submission candidate. A right-to-left swipe on a row SHALL replace that row with inline controls containing accessible trash and Find alternatives icon controls on the left and minus/quantity/plus controls on the right, all on one line without activating an action. The inline controls SHALL open only on release. Close or Escape SHALL restore the product row; the surrounding basket SHALL remain visible. Left-to-right swipes, vertical scrolling, short drags, and canceled gestures SHALL NOT open actions or mutate the basket. Tapping a row SHALL open near-full-screen details that can be dismissed and show the same delete, Find alternatives, and quantity controls below the product facts for access without swiping. Keyboard users SHALL be able to open the inline controls with Shift+F10 and details with Enter or Space. Legacy stored state SHALL NOT exclude an item from whole-basket submission.

The viewer SHALL bound its height and use one scroll region for long content. Larger Local baskets MAY virtualize offscreen rows, provided scrolling, keyboard access, modal details, and whole-basket submission remain available.

#### Scenario: Review a long Local basket
- **WHEN** the Local basket contains more products than fit in the viewer
- **THEN** the user can scroll through every product to Submit and Clear without a second nested scroll region; opening details or removing a row does not lose the remaining products or keyboard focus

#### Scenario: Submission is not locally ready
- **WHEN** the Local basket is empty or has no potentially addable products
- **THEN** the viewer does not offer an enabled Submit action, and it explains what must be resolved without sending a preparation or provider-write request

#### Scenario: Reveal local row actions
- **WHEN** the user swipes a row from right to left and releases, or presses Shift+F10 while its summary is focused
- **THEN** the replacement row offers a trash control, minus/quantity/plus controls, and Find alternatives without changing the Local or Nemlig basket until an action is explicitly activated

#### Scenario: Inspect product details
- **WHEN** the user taps a row
- **THEN** the product facts open in a near-full-screen modal with the same delete, Find alternatives, and quantity controls below the product facts; the modal can be closed with ×, Escape, or outside activation without changing either basket

#### Scenario: Resolve alternatives for a Ready row
- **WHEN** the user searches alternatives from a Ready row and chooses a replacement
- **THEN** the replacement remains Ready with the original quantity and the unchanged remainder of the list remains eligible for submission

#### Scenario: Select and accept in one action
- **WHEN** an older card sends a selection or acceptance action
- **THEN** it cannot create a hidden To decide subset or exclude a product from whole-basket submission

#### Scenario: Reconsider a Ready product
- **WHEN** an older card asks to move a product back to To decide
- **THEN** no such subset transition occurs; the product remains a Ready submission candidate

#### Scenario: Remove all Ready products
- **WHEN** the user explicitly removes selected local rows
- **THEN** only those rows are removed locally and the Nemlig basket remains unchanged

#### Scenario: Empty and completed workspace
- **WHEN** the Local basket is empty or a submission completes
- **THEN** the viewer shows its appropriate empty or truthful terminal state without To decide/Ready navigation or automatic retry

#### Scenario: Obsolete review action
- **WHEN** an older cached card sends obsolete basket navigation
- **THEN** the server rejects the action without changing the review or the Nemlig basket

#### Scenario: Prepare a legacy mixed-state review
- **WHEN** an active review created by an older version contains both Ready and needs-review rows
- **THEN** submission preparation includes every row or fails closed; no row is silently excluded based on its legacy state

### Requirement: Distinct Draft list and Nemlig basket names
The temporary conversation-scoped workspace shown in the viewer and called out in tool guidance SHALL be named Local basket. The provider state SHALL be named Nemlig basket. The interface and assistant guidance SHALL make clear that local removal and replacement affect only Local basket items and never remove or replace provider items. Internal IDs and tool names MAY retain their existing protocol values.

#### Scenario: User inspects local choices
- **WHEN** the user opens or edits temporary shopping choices
- **THEN** the viewer and agent call the workspace Local basket and describe all rows as local submission candidates

#### Scenario: User inspects provider state
- **WHEN** the user asks what is already in Nemlig or a write outcome is uncertain
- **THEN** the assistant reads the Nemlig basket and does not describe Local basket rows as provider contents
