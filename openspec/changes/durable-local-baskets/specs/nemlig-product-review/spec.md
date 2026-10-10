## MODIFIED Requirements

### Requirement: Shared private product review
The system SHALL maintain the same principal-bound Local basket snapshot for
voice and touch, independent of ChatGPT conversation identity while it is
unexpired. To decide SHALL contain unresolved products; Ready SHALL contain only
locally accepted products. Local acceptance, quantity change, replacement,
removal, navigation, Local basket selection, and deletion SHALL NOT modify the
Nemlig basket.

#### Scenario: Accept some products
- **WHEN** the user accepts selected exact products by voice or touch
- **THEN** those products move to Ready and unresolved products remain
  To decide, with no provider mutation

#### Scenario: Conflicting or foreign state
- **WHEN** a caller changes a stale revision or accesses another principal's Local basket
- **THEN** the action fails without changing state and an authorized caller can
  refresh the latest snapshot for its selected Local basket

#### Scenario: Sequential or foreign action
- **WHEN** a supported card acts on its identified current Local basket, or a
  different owner attempts to access that Local basket
- **THEN** the supported action updates the current Local basket without a card
  or revision identifier, while the foreign action fails without changing state
- **AND** a concurrent action is rejected while that Local basket is busy

#### Scenario: Local basket lifetime ends
- **WHEN** the user deletes a Local basket or its hard one-day lifetime expires
- **THEN** the system reports that the Local basket is unavailable without
  recreating it silently or changing the provider basket

#### Scenario: Draft lifetime ends
- **WHEN** the user finishes shopping, deletes the Local basket, or its hard
  one-day lifetime expires
- **THEN** the system reports that the Local basket is unavailable without
  recreating it silently or changing the provider basket

### Requirement: Active conversation selection
The system SHALL let an authenticated owner select one unexpired Local basket as
the current basket in each supported conversation when the host provides a
stable conversation identifier. A conversation SHALL NOT gain access to another
owner’s Local baskets. A chat lacking a stable identifier SHALL show the basket
picker rather than guess a remembered selection. Repeated explicit opens SHALL
preserve the selected basket; explicit additions SHALL append unresolved
products without resetting resolved products. Finish shopping SHALL delete only
the selected Local basket. Reconsidering an accepted product SHALL move it back
to To decide and invalidate pending submission approval.

#### Scenario: Continue in another chat
- **WHEN** the owner selects an existing unexpired Local basket from another chat
- **THEN** that chat opens the same Local basket without recreating products or
  reading the Nemlig basket as a substitute

#### Scenario: Continue a long shopping conversation
- **WHEN** the user returns to a selected Local basket less than one day after
  its last intentional interaction
- **THEN** time alone has not removed the local selection

#### Scenario: Two conversations share an account
- **WHEN** the same owner selects a Local basket in two supported conversations
- **THEN** both observe the latest revision and conflicting local edits are
  rejected or refreshed without changing the real Nemlig basket

#### Scenario: Different owners use Local baskets
- **WHEN** one principal supplies another principal's Local basket reference
- **THEN** the system refuses access without modifying either Local basket

#### Scenario: Finish and start again
- **WHEN** the user deletes a Local basket and later begins another
- **THEN** the old reference is unavailable and the new Local basket starts
  independently

#### Scenario: A host retains a card after the Local basket is unavailable
- **WHEN** an old card sends an action after explicit deletion or expiry
- **THEN** the action is not replayed and the viewer offers an explicit new or
  selected Local basket path with no restored acceptance or submission authority
- **AND** a previously submitted or uncertain snapshot directs the user to
  inspect the actual basket instead of offering automatic recovery

#### Scenario: A host retains a card after the draft is lost
- **WHEN** an old card sends an action after a Local basket is deleted or expires
- **THEN** the action is not replayed; a bounded read can list the owner's
  remaining unexpired Local baskets
- **AND** if no Local basket remains, the viewer offers an explicit fresh review
  of displayed exact products and quantities with refreshed product data and no
  restored acceptance or submission authority
- **AND** a previously submitted or uncertain snapshot directs the user to
  inspect the actual basket instead of offering automatic recovery

#### Scenario: A host retains a card after the Draft list is lost
- **WHEN** a supported card sends an action after its Local basket expires, is
  deleted, or is evicted
- **THEN** the action is not replayed and the neutral select-or-create Local
  basket landing state is shown
- **AND** a newly created Local basket requires an explicit start with refreshed
  exact products and quantities, without restored acceptance or submission authority
- **AND** a previously submitted or uncertain state directs the user to inspect
  the actual basket instead of offering automatic recovery

### Requirement: Distinct Draft list and Nemlig basket names
The temporary principal-bound workspace SHALL be called a Local basket in
shopper-facing UI, tool guidance, and errors. Its unresolved state SHALL be
called To decide and its accepted state Ready. The actual provider state SHALL
be called the Nemlig basket. “Review” SHALL describe the decision or exact
confirmation action, not another stored basket. Internal IDs, states, and tool
names MAY retain their existing protocol values.

#### Scenario: User inspects local choices
- **WHEN** the user opens or edits temporary choices
- **THEN** the viewer and agent call them a Local basket and distinguish To
  decide from Ready without implying a Nemlig basket change

#### Scenario: User inspects provider state
- **WHEN** the user asks what is already in Nemlig or a write outcome is uncertain
- **THEN** the agent reads the Nemlig basket and does not describe the Local basket as provider truth
