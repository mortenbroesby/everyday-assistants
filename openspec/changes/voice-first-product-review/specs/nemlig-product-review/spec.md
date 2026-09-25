## Purpose

Provide a temporary product review and local basket shared by conversation and
touch, with an explicit, safely approved later transfer to the Nemlig basket.

## ADDED Requirements

### Requirement: Shared private product review
The system SHALL maintain the same principal-and-conversation-bound temporary review snapshot for
voice and touch. Needs review SHALL contain unresolved products; Basket SHALL
contain only locally accepted products. Local acceptance, quantity change,
replacement, removal and navigation SHALL NOT modify the Nemlig basket.

#### Scenario: Accept some products
- **WHEN** the user accepts selected exact products by voice or touch
- **THEN** those products move to the local Basket and unresolved products remain
  in Needs review, with no provider mutation

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
and allow returning to either list without resolving it. Replacing or keeping an
unresolved product SHALL move it to the local Basket. Removing a product SHALL
remove it locally, without provider writes. Alternative results SHALL survive
temporary list navigation within the current draft when its target still exists.

#### Scenario: Cancel a basket change
- **WHEN** the user opens alternatives for a local Basket product then cancels
- **THEN** the unchanged local product remains in Basket

#### Scenario: Inspect alternatives and return
- **WHEN** the user inspects Basket while considering alternatives and returns
- **THEN** the same target and returned alternatives remain available

### Requirement: Explicit protected submission
The system SHALL submit only the local resolved lines through an exact provider
review and subsequent explicit approval. Editing the draft SHALL invalidate its
pending submission. Unresolved lines SHALL never be submitted implicitly. All
existing freshness, single-use, principal, mutation-lock and readback safeguards
SHALL remain effective. Unrelated real basket lines SHALL remain unchanged.

#### Scenario: Local selection is complete
- **WHEN** the user requests submission of the local Basket
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

### Requirement: Active conversation basket
The system SHALL retain one active temporary draft per authenticated conversation
without a fixed time expiry. New conversations SHALL NOT access another
conversation's draft. Hosted requests without conversation context SHALL fail
closed. Repeated starts SHALL preserve the active draft; explicit additions SHALL
append unresolved products without resetting resolved products. Finish shopping
SHALL discard only the local draft. Reconsidering an accepted product SHALL move
it back to Needs review and invalidate pending submission approval.

#### Scenario: Continue a long shopping conversation
- **WHEN** the user returns to the active draft more than an hour after starting
- **THEN** time alone has not removed the basket

#### Scenario: Two conversations share an account
- **WHEN** one conversation supplies the other conversation's review reference
- **THEN** the system refuses access without modifying either basket

#### Scenario: Finish and start again
- **WHEN** the user ends a review and later begins another
- **THEN** the old reference is unavailable and the new draft starts independently

#### Scenario: A host retains a card after the draft is lost
- **WHEN** an old card sends an action after restart, eviction, or explicit end
- **THEN** the action is not replayed; a bounded read can find this conversation's current draft
- **AND** if no active draft remains, the viewer offers an explicit fresh review of the displayed exact products and quantities, with refreshed product data and no restored acceptance or submission authority
- **AND** a previously submitted or uncertain snapshot directs the user to inspect the actual basket instead of offering automatic recovery
