## Purpose

Provide a temporary Draft list shared by conversation and touch, with To decide
and Ready states and an explicitly authorized later addition to the Nemlig basket.

## Requirements

### Requirement: Shared private product review
The system SHALL maintain the same principal-and-conversation-bound temporary review snapshot for
voice and touch. To decide SHALL contain unresolved products; Ready SHALL
contain only locally accepted products. Local acceptance, quantity change,
replacement, removal and navigation SHALL NOT modify the Nemlig basket.

#### Scenario: Accept some products
- **WHEN** the user accepts selected exact products by voice or touch
- **THEN** those products move to Ready and unresolved products remain
  To decide, with no provider mutation

#### Scenario: Sequential or foreign action
- **WHEN** a supported card acts on the conversation's current Draft list, or a
  different owner attempts to access it
- **THEN** the supported action updates the current list without a card or
  revision identifier, while the foreign action fails without changing state
- **AND** a concurrent action is rejected while the owner list is busy

#### Scenario: Draft lifetime ends
- **WHEN** the user finishes shopping, its process restarts, or bounded memory eviction removes it
- **THEN** the system reports that the Draft list is unavailable without
  recreating it silently or changing the provider basket

### Requirement: Contextual alternatives and reversible navigation
The system SHALL show alternatives for one identified local product, reuse the
same expandable product presentation, allow keeping or replacing the product,
and allow returning to the To decide list without resolving it. Replacing or keeping an
unresolved product SHALL leave it To decide. Removing a product SHALL
remove it locally, without provider writes. Alternative results SHALL survive
temporary list navigation within the current Draft list when its target still exists.

#### Scenario: Cancel an alternative choice
- **WHEN** the user opens alternatives for a To decide product then cancels
- **THEN** the unchanged local product remains To decide

#### Scenario: Inspect alternatives and return
- **WHEN** the user temporarily navigates to Ready while considering alternatives and returns
- **THEN** the same target and returned alternatives remain available

### Requirement: Explicit protected submission
The system SHALL submit only the local resolved lines through an exact provider
review and subsequent explicit approval. Editing the draft SHALL invalidate its
pending submission. Unresolved lines SHALL never be submitted implicitly. All
existing freshness, single-use, principal, mutation-lock and readback safeguards
SHALL remain effective. Unrelated real basket lines SHALL remain unchanged.

#### Scenario: Local selection is complete
- **WHEN** the user requests submission of Ready products
- **THEN** the system prepares exact current quantities, estimated prices and effects for
  approval without applying them

#### Scenario: Approved submission succeeds
- **WHEN** the user approves the unchanged current submission review
- **THEN** the system applies it once, returns verified Nemlig basket readback,
  retains the Draft list and marks the submission outcome truthfully

#### Scenario: Submission fails or becomes uncertain
- **WHEN** application or readback fails
- **THEN** the Draft list remains intact, the outcome is explicitly uncertain or
  failed, and the system does not automatically retry the submission

### Requirement: Active conversation selection
The system SHALL retain one active Draft list per authenticated conversation
without a fixed time expiry. New conversations SHALL NOT access another
conversation's draft. Hosted requests without conversation context SHALL fail
closed. Repeated starts SHALL preserve the active draft; explicit additions SHALL
append unresolved products without resetting resolved products. Finish shopping
SHALL discard only the Draft list. Reconsidering an accepted product SHALL move
it back to To decide and invalidate pending submission approval.

#### Scenario: Continue a long shopping conversation
- **WHEN** the user returns to the active draft more than an hour after starting
- **THEN** time alone has not removed the local selection

#### Scenario: Two conversations share an account
- **WHEN** one authenticated conversation attempts to access another
  conversation's Draft list
- **THEN** the system refuses access without modifying either local selection

#### Scenario: Finish and start again
- **WHEN** the user ends a Draft list and later begins another
- **THEN** the old list is unavailable and the new owner list starts without
  restoring acceptance or submission approval

#### Scenario: A host retains a card after the Draft list is lost
- **WHEN** a supported card sends an action after restart, eviction, or explicit
  end
- **THEN** the action is not replayed and the owner list remains unavailable
- **AND** a new Draft list requires an explicit start with refreshed exact
  products and quantities, without restoring acceptance or submission authority
- **AND** a previously submitted or uncertain state directs the user to inspect
  the actual basket instead of offering automatic recovery

### Requirement: Persistent local review interaction
Supported current-bundle cards SHALL be interchangeable clients of the
authenticated conversation's one temporary Draft list. Normal actions SHALL
use `{action}` without card, review, or revision identifiers. A correlated
local action result SHALL update its mounted card; delayed passive snapshots
SHALL NOT roll back a successfully correlated local action. A remount SHALL
require the current supported viewer bundle and its current invocation
snapshot; compatibility with already-mounted predecessor bundles is not
promised. Retired resource versions SHALL be inert.

#### Scenario: Local change returns a correlated result
- **WHEN** a supported frame accepts products, changes quantities, navigates,
  or resolves alternatives and receives its correlated current snapshot
- **THEN** the same frame renders the updated destination without requiring
  another server call

#### Scenario: Delayed passive snapshot follows a local action
- **WHEN** a passive host snapshot arrives after a local action has been
  successfully correlated
- **THEN** it cannot replace the confirmed local state in that mounted card

#### Scenario: A supported card is remounted
- **WHEN** the current supported bundle mounts with a current invocation
  snapshot
- **THEN** it displays the current conversation list without creating another
  list or promising predecessor-bundle compatibility

#### Scenario: Confirm exact submission in the viewer
- **WHEN** the user explicitly confirms the current prepared lines, quantities,
  prices and effect in the review UI
- **THEN** the existing protected submit operation applies that exact unchanged
  review once and reports verified or uncertain outcome without automatic retry
- **AND** cancellation or merely opening the prepared review performs no write

### Requirement: To decide and Ready refinement
The review SHALL expose To decide as unresolved and Ready as exact accepted
products. The review contract SHALL use `ready` without a `basket` alias or
representation selector. Alternatives SHALL only open for To decide products. Choosing
an alternative SHALL leave the replacement To decide. Ready SHALL remain
independently submittable while other products remain To decide.

#### Scenario: Select and accept in one action
- **WHEN** the user checks one or more To decide rows and chooses Add to Ready
- **THEN** one owner-scoped local update accepts exactly those products,
  stays in To decide and makes no provider mutation
- **AND** selecting rows or opening product/factual disclosures alone makes no
  tool or provider call

#### Scenario: Reconsider a Ready product
- **WHEN** a Ready product is moved back to To decide
- **THEN** it can be offered alternatives there; no direct alternative action
  is offered in Ready
- **AND** choosing a replacement does not implicitly accept it

#### Scenario: Remove all Ready products
- **WHEN** the user confirms removal of all Ready products
- **THEN** one local action removes those exact products from the selection,
  retains any To decide products, and leaves the actual Nemlig basket unchanged

#### Scenario: Empty and completed workspace
- **WHEN** the local selection has no products or its draft is ended
- **THEN** the viewer shows conversational starting actions without empty
  To decide and Ready navigation
- **AND** a verified provider submission shows a distinct success state while
  an uncertain submission never offers an automatic retry

#### Scenario: Obsolete review action
- **WHEN** an already-cached older card sends `basket` navigation
- **THEN** the new contract rejects the action without changing the review or
  the real Nemlig basket

### Requirement: Distinct Draft list and Nemlig basket names
The temporary principal-and-conversation-bound workspace SHALL be called the Draft list in shopper-facing UI, tool guidance, and errors. Its unresolved state SHALL be called To decide and its accepted state Ready. The actual provider state SHALL be called the Nemlig basket. “Review” SHALL describe the decision or exact confirmation action, not another stored list. Internal IDs, states, and tool names MAY retain their existing protocol values.

#### Scenario: User inspects local choices
- **WHEN** the user opens or edits temporary choices
- **THEN** the viewer and agent call them the Draft list and distinguish To decide from Ready without implying a Nemlig basket change

#### Scenario: User inspects provider state
- **WHEN** the user asks what is already in Nemlig or a write outcome is uncertain
- **THEN** the agent reads the Nemlig basket and does not describe the Draft list as provider truth
