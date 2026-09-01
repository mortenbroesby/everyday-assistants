## MODIFIED Requirements

### Requirement: Immutable local plan snapshots
The system SHALL preserve loading existing valid immutable plan snapshots by opaque ID and SHALL let the owner explicitly migrate a loaded snapshot into a newly named shopping list without changing the original snapshot. New reusable state SHALL use named shopping lists rather than creating another opaque snapshot, and an invalid or missing legacy snapshot SHALL continue to fail with a sanitized error.

#### Scenario: Save a plan
- **WHEN** the owner explicitly saves new reusable shopping state after this change
- **THEN** the system creates or updates a named shopping list under the named-list contract and does not create another opaque immutable snapshot

#### Scenario: Resume a plan
- **WHEN** the owner loads a known pre-change snapshot ID
- **THEN** the system returns its stored structured lines, preferences, and selections for fresh read-only resolution without changing the snapshot, a named list, or the basket

#### Scenario: Migrate a snapshot
- **WHEN** the owner loads a valid snapshot and explicitly supplies an available list name and type
- **THEN** the system creates one named list containing the migrated lines while retaining the immutable snapshot for rollback compatibility

#### Scenario: Snapshot is missing or malformed
- **WHEN** a requested snapshot is absent, outside the legacy plan namespace, or fails schema validation
- **THEN** the system returns a sanitized error without exposing storage paths, owner scope, or partial content

### Requirement: Planning never authorizes mutation
The system SHALL keep planning, browsing, candidate selection, gap analysis, named-list lifecycle, legacy snapshot load or migration, picker interaction, and proposal preparation distinct from approval to apply a basket change.

#### Scenario: Plan is fully selected
- **WHEN** every selected line has an exact available product and positive remaining quantity
- **THEN** the system may prepare the existing exact additions review but SHALL NOT apply it without explicit approval of the unchanged review

#### Scenario: List or snapshot state changes
- **WHEN** a named list is created, edited, duplicated, archived, restored, resolved, or migrated from a snapshot
- **THEN** no basket preparation, application, removal, clearing, checkout, order, payment, or delivery-slot mutation occurs automatically

#### Scenario: Plan is saved or resumed
- **WHEN** reusable state is saved as a named list or an existing named list or legacy snapshot is opened
- **THEN** no basket review or apply action occurs automatically and stored state remains separate from basket approval
