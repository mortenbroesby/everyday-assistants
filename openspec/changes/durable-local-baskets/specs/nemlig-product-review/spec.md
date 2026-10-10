## MODIFIED Requirements

### Requirement: Shared private product review
The system SHALL maintain the same principal-bound Local basket snapshot for
voice and touch, independent of ChatGPT conversation identity while it is
unexpired. A Local basket is one complete set of intended submission products;
it SHALL NOT expose a To decide/Ready split, local accept/revisit controls, or
partial-checkout selection. Local alternatives, quantity changes, replacement,
removal, navigation, Local basket selection, and deletion SHALL NOT modify the
Nemlig basket.

#### Scenario: Edit a complete Local basket
- **WHEN** the owner changes an exact product, quantity, or alternative in a
  Local basket
- **THEN** the current Local basket changes without a provider mutation
- **AND** every remaining line is still intended for its eventual complete
  submission

#### Scenario: Accept some products
- **WHEN** a legacy client requests local acceptance of selected products
- **THEN** the system does not create a second local selection state; the
  complete Local basket remains unchanged until an explicit supported edit

#### Scenario: Sequential or foreign action
- **WHEN** a supported card acts on its identified current Local basket, or a
  different owner attempts to access that Local basket
- **THEN** the supported action updates the current Local basket without a
  user-visible revision identifier, while the foreign action fails without
  changing state
- **AND** a delayed action that crossed an asynchronous provider read commits
  only against its internal expected revision, otherwise it refreshes or fails
  safely

#### Scenario: Local basket lifetime ends
- **WHEN** the user deletes a Local basket or its activity-based one-day lifetime expires
- **THEN** the system reports that the Local basket is unavailable without
  recreating it silently or changing the provider basket

#### Scenario: Draft lifetime ends
- **WHEN** the user finishes shopping, deletes the Local basket, or its
  activity-based one-day lifetime expires
- **THEN** the system reports that the Local basket is unavailable without
  recreating it silently or changing the provider basket

### Requirement: Explicit protected submission
The system SHALL submit the complete Local basket only through an exact provider
review and subsequent explicit approval. It SHALL NOT offer a partial submission
or a discard-at-checkout path. Editing the Local basket SHALL invalidate its
pending submission. All existing freshness, single-use, principal, mutation-lock
and readback safeguards SHALL remain effective. Unrelated real basket lines
SHALL remain unchanged. Verified successful readback SHALL close and delete the
entire Local basket.

Before provider execution, the system SHALL durably record a non-authorizing
submission-attempt fence. It SHALL NOT persist a prepared payload, approval,
or reusable submission authority. A fence surviving a restart SHALL block
preparation and submission, direct the owner to inspect the Nemlig basket, and
never retry an addition automatically.

#### Scenario: Local selection is complete
- **WHEN** the user requests submission of the complete Local basket
- **THEN** the system prepares exact current quantities, prices and effects for
  approval without applying them

#### Scenario: Approved submission succeeds
- **WHEN** the user approves the unchanged current submission review
- **THEN** the system applies it once, returns verified Nemlig basket readback,
  and deletes the Local basket

#### Scenario: Submission fails or becomes uncertain
- **WHEN** application or readback fails, or a process is replaced after the
  submission-attempt fence is recorded
- **THEN** the Local basket remains intact behind that fence, the outcome is
  explicitly uncertain or failed, and the system does not automatically retry
  the submission

### Requirement: Active conversation selection
The system SHALL let an authenticated owner select one unexpired Local basket as
the current basket in each supported conversation when the host provides a
stable conversation identifier. A conversation SHALL NOT gain access to another
owner’s Local baskets. A chat lacking a stable identifier SHALL show the basket
picker rather than guess a remembered selection. Repeated explicit opens SHALL
preserve the selected basket. Finish shopping SHALL delete only the selected
Local basket.

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
- **THEN** both observe the latest state and conflicting delayed actions refresh
  or fail safely without changing the real Nemlig basket

#### Scenario: Different owners use Local baskets
- **WHEN** one principal supplies another principal's Local basket reference
- **THEN** the system refuses access without modifying either Local basket

#### Scenario: Finish and start again
- **WHEN** the user deletes a Local basket and later begins another
- **THEN** the old reference is unavailable and the new Local basket starts
  independently

#### Scenario: A host retains a card after the Local basket is unavailable
- **WHEN** an old card sends an action after explicit deletion, expiry, or LRU eviction
- **THEN** the action is not replayed and the viewer shows the neutral
  select-or-create Local basket landing state
- **AND** it restores no submission authority or product lines automatically

#### Scenario: A host retains a card after the Draft list is lost
- **WHEN** a supported card sends an action after its Local basket expires, is
  deleted, or is evicted
- **THEN** the action is not replayed and the neutral select-or-create Local
  basket landing state is shown

### Requirement: Distinct Local basket and Nemlig basket names
The temporary principal-bound workspace SHALL be called a Local basket in
shopper-facing UI, tool guidance, and errors. The actual provider state SHALL
be called the Nemlig basket. “Review” SHALL describe exact confirmation of the
complete Local basket, not another stored basket. Internal IDs and tool names
MAY retain existing protocol values.

#### Scenario: User inspects local choices
- **WHEN** the user opens or edits temporary choices
- **THEN** the viewer and agent call them a Local basket without implying a
  Nemlig basket change

#### Scenario: User inspects provider state
- **WHEN** the user asks what is already in Nemlig or a write outcome is uncertain
- **THEN** the agent reads the Nemlig basket and does not describe the Local basket as provider truth
