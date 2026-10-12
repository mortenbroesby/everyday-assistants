## ADDED Requirements

### Requirement: Native source submission and cleanup
Save as shopping list SHALL NOT grant basket authority. Unsaved drafts SHALL
require explicit saving before submission preparation. Submission SHALL bind
the connected account, source list ID, exact approved
contents, current basket baseline and conversation authority. It SHALL perform
at most one native transfer, with no per-product fallback. It SHALL reject changed
source content before dispatch. After verified additions and a durable receipt,
automatic cleanup SHALL recheck the connected account, source identity, name,
and exact rows before deleting the corresponding source. If a changed source is
observed, it SHALL be retained with a warning. The provider has no conditional
delete, so an edit can race the final check; the owner accepts this residual
data-loss risk. A transfer snapshot SHALL be used only with demonstrated
isolation if provider concurrency semantics cannot otherwise protect the
approved payload. Merely copying contents into another mutable list SHALL NOT
count as isolation.
Dirty, saving, partial, uncertain or conflicted saved-list edits SHALL block
proposal creation and transfer until Update shopping list has exact verified
readback. Preparation SHALL never implicitly save edits or create a second
shopping list to stage a transfer.

#### Scenario: Source list changes or disappears before transfer
- **WHEN** preparation no longer matches the current source
- **THEN** authorization is invalidated before dispatch and the current state or
  missing-list picker is returned

#### Scenario: Submission is requested with pending edits
- **WHEN** the selected list has unpersisted or uncertain edits
- **THEN** no transfer proposal is created and no basket transfer is dispatched

#### Scenario: Cleanup cannot be confirmed
- **WHEN** transfer is verified but source cleanup fails, source content changed,
  or cleanup readback is uncertain
- **THEN** the result remains successful with a retained-list warning and a
  durable no-replay record; no transfer retry follows

### Requirement: Submission attempts survive process loss
A durable attempt record SHALL be atomically persisted before basket dispatch
and consulted across conversations and process restarts. It SHALL NOT serve as
shopping-list inventory or content storage. Unknown, attempted and uncertain
outcomes SHALL prevent a new automatic transfer for the same source list.
Missing or unavailable safety storage SHALL fail closed before dispatch.

#### Scenario: Transfer response is lost and app restarts
- **WHEN** a transfer may have succeeded before process loss
- **THEN** selecting or re-preparing that native list cannot bypass the retained
  attempt record and no second transfer is issued

#### Scenario: Two conversations submit the same list
- **WHEN** concurrent approved requests target one account/list
- **THEN** only one obtains dispatch authority and the other observes the fence

#### Scenario: Verified outcome precedes cleanup
- **WHEN** basket readback verifies success
- **THEN** the verified receipt is persisted before deletion, and retries return
  the recorded outcome or require inspection without repeating the transfer
