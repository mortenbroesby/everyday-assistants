## Purpose

Provide a temporary In Review and Ready selection shared by conversation and
touch, with an explicit, safely approved later transfer to the Nemlig basket.

## ADDED Requirements

### Requirement: Shared private product review
The system SHALL maintain the same principal-and-conversation-bound temporary review snapshot for
voice and touch. In Review SHALL contain unresolved products; Ready SHALL
contain only locally accepted products. Local acceptance, quantity change,
replacement, removal and navigation SHALL NOT modify the Nemlig basket.

#### Scenario: Accept some products
- **WHEN** the user accepts selected exact products by voice or touch
- **THEN** those products move to Ready and unresolved products remain
  In Review, with no provider mutation

#### Scenario: Conflicting or foreign state
- **WHEN** a caller changes a stale revision or accesses another principal's draft
- **THEN** the action fails without changing state and a stale authorized caller
  can refresh the latest snapshot

#### Scenario: Draft lifetime ends
- **WHEN** the user finishes shopping, its process restarts, or bounded memory eviction removes it
- **THEN** the system reports that the temporary draft is unavailable without
  recreating it silently or changing the provider basket

### Requirement: Contextual alternatives and reversible navigation
The system SHALL show alternatives for one identified local product, reuse the
same expandable product presentation, allow keeping or replacing the product,
and allow returning to the In Review list without resolving it. Replacing or keeping an
unresolved product SHALL leave it In Review. Removing a product SHALL
remove it locally, without provider writes. Alternative results SHALL survive
temporary list navigation within the current draft when its target still exists.

#### Scenario: Cancel an alternative choice
- **WHEN** the user opens alternatives for an In Review product then cancels
- **THEN** the unchanged local product remains In Review

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
- **THEN** the system prepares exact current quantities, prices and effects for
  approval without applying them

#### Scenario: Approved submission succeeds
- **WHEN** the user approves the unchanged current submission review
- **THEN** the system applies it once, returns verified Nemlig basket readback,
  retains the local draft and marks the submission outcome truthfully

#### Scenario: Submission fails or becomes uncertain
- **WHEN** application or readback fails
- **THEN** the local draft remains intact, the outcome is explicitly uncertain or
  failed, and the system does not automatically retry the submission

### Requirement: Active conversation selection
The system SHALL retain one active temporary draft per authenticated conversation
without a fixed time expiry. New conversations SHALL NOT access another
conversation's draft. Hosted requests without conversation context SHALL fail
closed. Repeated starts SHALL preserve the active draft; explicit additions SHALL
append unresolved products without resetting resolved products. Finish shopping
SHALL discard only the local draft. Reconsidering an accepted product SHALL move
it back to In Review and invalidate pending submission approval.

#### Scenario: Continue a long shopping conversation
- **WHEN** the user returns to the active draft more than an hour after starting
- **THEN** time alone has not removed the local selection

#### Scenario: Two conversations share an account
- **WHEN** one conversation supplies the other conversation's review reference
- **THEN** the system refuses access without modifying either local selection

#### Scenario: Finish and start again
- **WHEN** the user ends a review and later begins another
- **THEN** the old reference is unavailable and the new draft starts independently

#### Scenario: A host retains a card after the draft is lost
- **WHEN** an old card sends an action after restart, eviction, or explicit end
- **THEN** the action is not replayed; a bounded read can find this conversation's current draft
- **AND** if no active draft remains, the viewer offers an explicit fresh review of the displayed exact products and quantities, with refreshed product data and no restored acceptance or submission authority
- **AND** a previously submitted or uncertain snapshot directs the user to inspect the actual basket instead of offering automatic recovery

### Requirement: Persistent local review interaction
An explicitly activated review frame SHALL remain active across confirmed
same-review edits and destination changes while it stays mounted. Initial,
remounted and retired cards SHALL remain inactive until their explicit
current-conversation activation. A foreign-review snapshot SHALL NOT activate
an inactive frame or displace a different draft already confirmed in an active
frame. Older host snapshots SHALL NOT replace a newer confirmed review revision.

#### Scenario: Local change returns a host result
- **WHEN** an activated frame accepts products, changes quantities, navigates,
  or resolves alternatives and receives a matching current snapshot
- **THEN** the same frame renders the updated destination without requiring
  `Open current selection` again

#### Scenario: Old draft notification follows explicit activation
- **WHEN** an inactive historical card for A explicitly fetches current draft B
  and then receives an unsolicited A snapshot
- **THEN** B remains the active visible selection; A cannot fold the frame or
  restore its old product controls

#### Scenario: Confirm exact submission in the viewer
- **WHEN** the user explicitly confirms the current prepared lines, quantities,
  prices and effect in the review UI
- **THEN** the existing protected submit operation applies that exact unchanged
  review once and reports verified or uncertain outcome without automatic retry
- **AND** cancellation or merely opening the prepared review performs no write

### Requirement: In Review and Ready refinement
The review contract SHALL represent In Review as unresolved and Ready as exact
accepted products. It SHALL use `ready` without a `basket` alias or
representation selector. Alternatives SHALL only open for In Review products. Choosing
an alternative SHALL leave the replacement In Review. Ready SHALL remain
independently submittable while other products remain In Review.

#### Scenario: Select and accept in one action
- **WHEN** the user checks one or more In Review rows and chooses Add to Ready
- **THEN** one revision-checked local update accepts exactly those products,
  stays in In Review and makes no provider mutation
- **AND** selecting rows or opening product/factual disclosures alone makes no
  tool or provider call

#### Scenario: Reconsider a Ready product
- **WHEN** a Ready product is moved back to In Review
- **THEN** it can be offered alternatives there; no direct alternative action
  is offered in Ready
- **AND** choosing a replacement does not implicitly accept it

#### Scenario: Remove all Ready products
- **WHEN** the user confirms removal of all Ready products
- **THEN** one local action removes those exact products from the selection,
  retains any In Review products, and leaves the actual Nemlig basket unchanged

#### Scenario: Empty and completed workspace
- **WHEN** the local selection has no products or its draft is ended
- **THEN** the viewer shows conversational starting actions without empty
  In Review and Ready navigation
- **AND** a verified provider submission shows a distinct success state while
  an uncertain submission never offers an automatic retry

#### Scenario: Obsolete review action
- **WHEN** an already-cached older card sends `basket` navigation
- **THEN** the new contract rejects the action without changing the review or
  the real Nemlig basket

### Requirement: Complete and refinable contextual alternatives
For an In Review product, an alternatives search without a user-requested
count SHALL expose every distinct candidate returned by the provider response
that is not already in the local selection. It SHALL preserve provider order,
identify unavailable or incomplete product facts, and SHALL NOT silently cap
the result at a small application default. The review SHALL retain the exact
target while offering a further search when returned candidates are empty or
irrelevant. A refinement SHALL replace the current candidate set; only a
candidate in that current authoritative set can be chosen. The review SHALL
NOT claim that one provider response exhausts the catalogue.

#### Scenario: More than ten alternatives are returned
- **WHEN** an uncapped search returns more than ten distinct candidates
- **THEN** every eligible returned candidate is available in provider order,
  and a candidate with unavailable details is identified rather than silently omitted

#### Scenario: No relevant new alternative appears
- **WHEN** a search returns no new candidates or the user rejects those shown
- **THEN** the target remains In Review and the user can search again with a
  different phrase or return without changing the selection or real basket

#### Scenario: A search replaces earlier alternatives
- **WHEN** a further search replaces the alternatives for the same target
- **THEN** a candidate shown only by the earlier search cannot be selected
  until it appears in the current authoritative alternatives context

#### Scenario: A returned alternative is chosen
- **WHEN** the user chooses an available current candidate
- **THEN** it replaces the exact target at its existing quantity, remains In
  Review, and requires separate local acceptance before it enters Ready

### Requirement: Shopping workspace language
The viewer SHALL identify the temporary workspace as **Your Nemlig selection**,
label unresolved products **To decide** and accepted products **Ready**, and
offer **Open current selection** for explicit activation. It SHALL identify the
real Nemlig basket separately so a local edit is not mistaken for a provider
mutation. These labels SHALL NOT change review state values or approval rules.

#### Scenario: User returns to an inactive historical card
- **WHEN** the card needs explicit activation before showing current products
- **THEN** its action says Open current selection and the resulting workspace
  shows To decide and Ready for the two local product states

#### Scenario: User sees the real basket
- **WHEN** the actual provider basket is displayed or changed through its
  protected tools
- **THEN** the interface calls it the Nemlig basket, distinct from the
  temporary selection and its Ready products
