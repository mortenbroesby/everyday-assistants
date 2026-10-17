## Purpose

Let an authenticated shopper review and edit a temporary, private selection of Nemlig products before an explicitly authorized additive basket submission. Saved shopping lists may supply products but are not the editable destination.

## Requirements

### Requirement: Temporary basket review draft

Product selection SHALL create a principal- and conversation-bound process-local draft. Product additions, removals, replacements, quantity changes, and navigation SHALL affect only that draft and SHALL NOT create or mutate a Nemlig shopping list or the real basket. The shopper-facing UI SHALL distinguish the temporary draft from the real basket.

#### Scenario: Start and edit a draft
- **WHEN** the user chooses exact product IDs and positive quantities for visual editing
- **THEN** the system creates a temporary draft with those products
- **AND** later draft edits remain local until an explicitly authorized Submit

#### Scenario: Saved list as read-only source
- **WHEN** the user selects an exact saved Nemlig shopping-list ID
- **THEN** its current rows are copied into a new temporary draft
- **AND** draft edits, submission, or abandonment do not change or delete the source list

#### Scenario: Search only
- **WHEN** the user only searches or compares products
- **THEN** no draft, saved list, or real basket is changed

### Requirement: Exact draft identity and bounded lifetime

Draft actions SHALL use the exact active `draft_id` and `review_context_id`. Another principal or conversation SHALL NOT access or edit that draft. A draft SHALL expire after two hours or a server restart; the system SHALL NOT silently reconstruct it from a stale card or restore submission authority.

#### Scenario: Wrong or unavailable draft
- **WHEN** a caller supplies missing, stale, or foreign draft identity, or acts after expiry or restart
- **THEN** the action fails without provider mutation or selection of another draft
- **AND** the user receives an actionable explanation

#### Scenario: Correlated local action
- **WHEN** the current viewer receives the result of an authorized local edit
- **THEN** it renders that exact updated draft without a delayed passive snapshot rolling it back

### Requirement: Exact protected basket submission

Only separately authorized Submit SHALL add the exact reviewed draft quantities to the real Nemlig basket. The request SHALL carry the exact draft and review context, a unique submission identity, and the reviewed name, product IDs, and positive quantities. The server SHALL compare that payload with the active draft, record a durable no-replay fence before dispatch, send the reviewed lines in one additive provider request, and independently validate basket readback while preserving unrelated rows. Search and draft editing SHALL NOT authorize submission.

#### Scenario: Authorized unchanged draft
- **WHEN** the user clearly authorizes addition of the exact current reviewed lines
- **THEN** the service submits those lines once and reports verified additive basket readback
- **AND** no saved shopping list is created, updated, deleted, or transferred

#### Scenario: Changed or unapproved payload
- **WHEN** the supplied reviewed list differs from the current draft or authorization does not cover it
- **THEN** the service does not submit it and asks for a fresh exact review or authorization

#### Scenario: Uncertain submission
- **WHEN** dispatch or independent readback leaves the result uncertain
- **THEN** the service preserves the no-replay fence, explains the uncertainty, and directs a read-only basket inspection
- **AND** it never automatically retries the write

#### Scenario: Expired completed receipt
- **WHEN** a caller retries an old draft after its bounded completed receipt expires
- **THEN** the service rejects it without a provider write or draft reconstruction
- **AND** unresolved or uncertain operation fences remain durable until resolved

### Requirement: Optional whole-basket shopping-list save

After verified basket submission, the viewer MAY offer a separate explicit action to save the entire current Nemlig basket as a shopping list. It SHALL include existing basket rows, preserve the basket, and SHALL NOT claim a saved-list ID unless the provider establishes one. An uncertain save SHALL NOT be retried. This action is app-only and SHALL NOT be advertised as a model-facing shopping tool.

#### Scenario: Save after verified addition
- **WHEN** the user separately chooses the optional save action after verified submission
- **THEN** the whole current basket is sent for list saving without clearing the basket

#### Scenario: No verified addition
- **WHEN** the draft has not been submitted and verified
- **THEN** the optional save action is unavailable

### Requirement: Current viewer contract

The current viewer SHALL show product details, alternatives, draft actions, loading progress, and clear recoverable error states without pretending a tool response alone proves native rendering. Old resource versions SHALL remain inert rather than replaying retired actions. Compatibility with already-mounted predecessor bundles is not promised.

#### Scenario: Cached retired action
- **WHEN** a stale card sends retired `basket_id`, `delete`, or `heartbeat` input
- **THEN** the current contract rejects it without changing the draft, a saved list, or the real basket

#### Scenario: Viewer error
- **WHEN** a draft operation fails
- **THEN** the viewer retains understandable context and explains the failure without silently substituting another draft
