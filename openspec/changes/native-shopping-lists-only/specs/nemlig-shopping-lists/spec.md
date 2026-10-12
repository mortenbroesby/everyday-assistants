## Purpose

Use the connected Nemlig account's native shopping lists as the only saved
product selections, with explicit selection, verified editing and clear recovery.

## ADDED Requirements

### Requirement: Explicit save separates drafts from shopping lists
Ideation SHALL create only a temporary conversation draft. Accepting, editing or
viewing its products SHALL NOT automatically create or populate a native list.
Save as shopping list SHALL explicitly save the current displayed draft product
rows and exact quantities, including To decide rows but excluding separate
alternative candidates. Non-product ideas SHALL be resolved before saving rather
than silently omitted. Saving SHALL NOT authorize an actual-basket transfer.
Only exact verified readback SHALL promote the view to a native shopping list.

#### Scenario: Ideate and abandon
- **WHEN** a user ideates or edits products but does not save before the temporary
  draft is lost or expires through inactivity
- **THEN** those unsaved products are unavailable and no native list was created

#### Scenario: Save and reopen
- **WHEN** the user saves an exact draft and readback confirms completion
- **THEN** one native list becomes selectable from Shopping lists after restart
  and opens in the same product UI previously used for the draft

#### Scenario: Save repeats or becomes uncertain
- **WHEN** Save is clicked twice or provider creation/population has an ambiguous result
- **THEN** the live draft serializes the save, records the returned native ID when
  available, reports incomplete/uncertain saving truthfully and never automatically
  creates a second list or replays uncertain writes

#### Scenario: Inactivity during saving
- **WHEN** an authorized bounded Save is in flight
- **THEN** the draft remains available until that attempt settles and no delayed
  Save or expiry event can retarget another draft or delete a native list

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

### Requirement: Saved-list edits are staged until explicit Update
Additions, removals, quantity changes, accept/replacement and alternative choices
for a saved list SHALL change only a bounded transient edit buffer. They SHALL
NOT write to Nemlig until the user explicitly chooses **Update shopping list**.
Update SHALL bind the original account and native list ID, compare the provider
fingerprint with the displayed baseline, apply the exact staged result and report
success only after authoritative readback. The actual basket SHALL remain
unchanged. Dirty, saving, partial, uncertain or conflicted edits SHALL block
basket review and submission. Every edit SHALL invalidate prior approval.

#### Scenario: Edit without Update
- **WHEN** the user changes a saved-list row or selects a replacement but does
  not choose Update shopping list
- **THEN** the edit remains transient, no provider list mutation is sent, and
  basket review is unavailable until the pending edit is persisted

#### Scenario: Update succeeds
- **WHEN** the user explicitly updates an unchanged exact native list
- **THEN** the server validates account, list ID and baseline, applies the staged
  contents once, verifies readback, clears the dirty state and enables a fresh
  basket review

#### Scenario: Nemlig changed before Update
- **WHEN** provider contents differ from the displayed baseline
- **THEN** the server sends no edit, loads current provider contents, preserves
  the pending user changes, displays both for review and requires a later
  explicit Update against the refreshed baseline

#### Scenario: Update partially succeeds or becomes uncertain
- **WHEN** a provider write or readback is interrupted after explicit Update
- **THEN** a narrow operation journal binds the exact account/list, prior
  fingerprint, intended change and progress; current Nemlig contents are
  reconciled before resuming, and no write is blindly replayed

#### Scenario: Stale card or foreign account
- **WHEN** a card targets an old list or the connected account changes
- **THEN** no provider edit is sent, pending intent remains bound to its original
  target, and the action is never redirected to another list
