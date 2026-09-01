## Purpose

Defines private, owner-bound named shopping lists that a household can maintain and reuse without automatically changing a Nemlig basket or running background work.

## ADDED Requirements

### Requirement: Bounded named-list collection
The system SHALL let the authenticated owner keep up to twenty-five active or archived shopping lists, each with a unique opaque identifier, a non-empty human-readable name, a reusable or occasion type, timestamps, and at most fifty ordered lines. The system SHALL reject duplicate active names using Danish locale-aware case folding and SHALL reject requests beyond either bound before changing stored state.

#### Scenario: Owner creates several lists
- **WHEN** the owner creates `Weekly essentials` as reusable and `Birthday party` as occasion lists
- **THEN** both lists are stored independently and can be found by their names without exposing their identifiers in ordinary conversation

#### Scenario: Collection bound is reached
- **WHEN** the owner already has twenty-five active or archived lists and requests another
- **THEN** the system returns a concise limit error and changes no list or basket state

### Requirement: Household list lines
Each list line SHALL contain a stable line identifier, ordinary grocery name, positive default quantity, optional short household note, optional product constraints and preferences, and an optional preferred Nemlig product identifier. The system SHALL preserve the ordinary grocery name when a preferred product is unavailable so the line can be resolved again rather than silently dropped.

#### Scenario: Save an always-have product
- **WHEN** the owner adds `Wasa Crisp'n Wheat` with quantity four, a safe-food note, and a preferred current product
- **THEN** the list retains both the human grocery intent and the preferred product for future resolution without changing the basket

#### Scenario: Preferred product becomes unavailable
- **WHEN** the preferred product no longer appears as an eligible current candidate
- **THEN** the line remains unresolved under its ordinary grocery name and the system asks for product choice rather than substituting silently

### Requirement: Reversible list lifecycle
The owner SHALL be able to create, enumerate, open, rename, replace the ordered lines of, duplicate, archive, and restore a list. Each state-changing request SHALL validate the expected current revision and SHALL fail on a stale revision instead of overwriting a newer change.

#### Scenario: Edit a current list
- **WHEN** the owner submits valid changed lines against the current list revision
- **THEN** the system stores one new revision and returns a human-readable summary without contacting Nemlig or changing the basket

#### Scenario: Competing edit is stale
- **WHEN** an edit names an older revision than the stored list
- **THEN** the system rejects it with current-state guidance and preserves the newer list unchanged

#### Scenario: Archive and restore
- **WHEN** the owner archives an occasion list and later restores it under an available name
- **THEN** it disappears from the default active listing and then returns with its lines and history intact

### Requirement: Explicit reusable-list refresh
Opening list metadata SHALL require no Nemlig call. On a separate explicit resolve request, the system SHALL resolve no more than twenty selected list lines at once using current favorites-first product matching, price, availability, and basket coverage, and SHALL leave both the stored list and basket unchanged.

#### Scenario: Reuse weekly essentials
- **WHEN** the owner explicitly resolves selected lines from `Weekly essentials`
- **THEN** the system returns current candidates and remaining basket quantities for those lines without starting a schedule or saving refreshed product data automatically

#### Scenario: Large list is resolved in bounded selections
- **WHEN** a list contains more than twenty lines
- **THEN** the owner can resolve a selected subset of at most twenty lines per request while the complete stored list remains available

### Requirement: Lists never authorize basket mutation
A stored list, list revision, preferred product, resolved candidate, or reusable designation SHALL NOT constitute approval to change a basket. Preparing selected list items SHALL use the existing exact additions review, and applying it SHALL still require explicit approval of the unchanged review and fresh basket verification.

#### Scenario: Owner says to use a recurring list
- **WHEN** the owner opens or resolves a reusable list without explicitly approving an exact prepared basket change
- **THEN** no basket apply tool is invoked

#### Scenario: Approved list selection is applied
- **WHEN** selected current products from a list are prepared, the unchanged review is explicitly approved, and the apply succeeds
- **THEN** only those reviewed quantities are added and the system returns verified basket readback without modifying the stored list

### Requirement: Owner isolation and private storage
List operations SHALL require the authenticated configured owner, SHALL bind stored records to a non-model-visible owner scope, and SHALL keep names, notes, product preferences, identifiers, and revisions out of public responses, logs, and other owners' access. Authentication failure SHALL occur before list storage or the Container is used where the gateway can avoid it.

#### Scenario: Wrong owner requests a list
- **WHEN** an authenticated subject other than the configured owner requests any list operation
- **THEN** the gateway rejects the request before useful backend work and reveals no list existence or metadata

### Requirement: No automatic recurrence or infrastructure growth
Reusable lists SHALL run only when explicitly invoked and SHALL create no cron job, queue, alarm, scheduled basket action, additional Container, autoscaling path, or new paid storage service. List and item bounds SHALL be enforced independently of delayed billing data.

#### Scenario: Reusable list is idle
- **WHEN** no owner request opens, resolves, or edits a reusable list
- **THEN** the system performs no background list work and incurs no list-driven Container wake

