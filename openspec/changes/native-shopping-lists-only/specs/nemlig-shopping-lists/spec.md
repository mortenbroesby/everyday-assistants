## Purpose

Use the connected Nemlig account's native shopping lists as the only saved
product selections, with explicit selection, verified editing and clear recovery.

## ADDED Requirements

### Requirement: Native shopping-list identity and discovery
The system SHALL identify a saved selection by its connected account and native
shopping-list ID, without a local basket ID or content registry. It SHALL expose
all lists accessible to that account, including lists created outside the app,
and SHALL distinguish valid empty inventory from incomplete or failed reads.

#### Scenario: Fresh conversation discovers existing lists
- **WHEN** an authenticated user opens Shopping lists without a selection
- **THEN** the complete inventory is available, using pagination when necessary,
  and no list is created or selected implicitly

#### Scenario: Foreign or ambiguous identity
- **WHEN** a request supplies a foreign ID, switches connected accounts or matches
  multiple lists by name
- **THEN** the system requires an accessible exact ID before acting and never
  treats a name or a client-supplied ID as authorization

### Requirement: Disposable conversation selection
A conversation SHALL use at most one selected shopping-list reference as a hint.
Selection SHALL be revalidated against the current connected account. The system
SHALL NOT require durable local selection storage or restore submission authority
from conversation text, host state or a list ID.

#### Scenario: Selected list was deleted
- **WHEN** the provider confirms that the selected list no longer exists
- **THEN** the hint is cleared and the current picker is shown without recreating
  the list or replaying the attempted action against another list

#### Scenario: Selection is absent after restart
- **WHEN** the app restarts or the host provides no stable conversation context
- **THEN** the user can select from native lists again without any saved content loss

#### Scenario: Provider cannot be reached
- **WHEN** authentication, transport or response validation fails
- **THEN** the selection is retained as an unverified hint and an error is shown,
  without claiming the list was deleted or inventory is empty

### Requirement: Native edits are verified and bounded
Saved additions, removals, quantity changes, replacements and explicit list
deletion SHALL use the native shopping-list API and SHALL NOT modify the actual
Nemlig basket. Every mutation SHALL name its original exact list, validate account
access and freshness, and report success only after authoritative readback.
Uncertain writes SHALL NOT be automatically replayed or compensated.

#### Scenario: Edit succeeds and process restarts
- **WHEN** an accepted item quantity is changed and verified, then the app restarts
- **THEN** reopening the same native list reads that quantity from Nemlig

#### Scenario: Replacement partially succeeds
- **WHEN** one native update succeeds and another fails or times out
- **THEN** the actual list is read and presented as partial or uncertain without
  claiming atomic replacement or automatically repeating either write

#### Scenario: Stale card or external edit
- **WHEN** a card targets an old list or its observed contents no longer match
- **THEN** the edit is rejected and current state is shown; the action is never
  redirected to another selected list
