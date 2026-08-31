## MODIFIED Requirements

### Requirement: Immutable local plan snapshots

The system SHALL save a valid guided plan only on explicit request as a new
immutable opaque-ID snapshot, using owner-only ignored storage for local execution
or durable owner-bound storage for hosted execution, and SHALL load a snapshot by
ID without changing Nemlig state.

#### Scenario: Save a plan

- **WHEN** a local client explicitly saves a valid plan
- **THEN** the system creates a new owner-only local snapshot and returns its ID
  without overwriting another snapshot

#### Scenario: Save a plan through hosting

- **WHEN** the authenticated hosted owner explicitly saves a valid plan
- **THEN** the system creates a durable snapshot bound to that owner and returns
  its opaque ID without exposing storage location or overwriting another snapshot

#### Scenario: Resume a plan

- **WHEN** the matching local client or authenticated hosted owner loads a known
  snapshot ID
- **THEN** the system returns the stored structured lines, preferences, and
  selections for fresh read-only resolution

#### Scenario: Snapshot is missing or malformed

- **WHEN** a requested snapshot belongs to another identity, is absent, is
  outside allowed storage, or fails schema validation
- **THEN** the system returns the same sanitized not-found response without
  exposing identity, storage paths, existence, or partial content
