# Nemlig Guided Shopping Specification

## Purpose

Defines a read-only guided grocery run that resolves a structured household shopping list favorites-first, preserves user choice, accounts for the current basket, and supports private local plan snapshots.

## Requirements

### Requirement: Structured whole-list planning
The system SHALL accept between one and twenty grocery lines, each containing a non-empty Danish search phrase, a positive quantity, optional product constraints and preferences, and an optional selected product ID, and SHALL reject an invalid request before reading or changing external state.

#### Scenario: Valid grocery list
- **WHEN** a client submits several valid grocery lines
- **THEN** the system returns one ordered planning result per input line without changing favorites or the basket

#### Scenario: Invalid grocery line
- **WHEN** any line has blank search text, a non-positive quantity, an unsupported preference, or more than twenty total lines are supplied
- **THEN** the complete request fails before any product, basket, proposal, or local plan operation

### Requirement: Favorites-first candidate resolution
The system SHALL search one authenticated favorites pool for each grocery line before general catalog search, SHALL use catalog fallback only for lines with no matching favorite that satisfies their constraints, and SHALL return bounded candidates without selecting a product automatically.

#### Scenario: Matching favorite exists
- **WHEN** one or more favorites match a line and satisfy its constraints
- **THEN** the result contains those favorite candidates and performs no catalog fallback for that line

#### Scenario: No matching favorite exists
- **WHEN** no favorite matches a line after its constraints are applied
- **THEN** the system searches the general catalog and labels the returned candidates as catalog results

#### Scenario: Several candidates remain plausible
- **WHEN** more than one candidate remains after filtering and ranking
- **THEN** the line remains unresolved until a client supplies an exact selected product ID

#### Scenario: No candidate is usable
- **WHEN** neither favorites nor catalog search yields a candidate satisfying the line constraints
- **THEN** the line is returned as unresolved with a concise reason and no proposal is prepared

### Requirement: Constraints and deterministic preferences
The system SHALL support availability, organic, vegan, gluten-free, lactose-free, maximum item price, and maximum unit-price constraints and SHALL support discount, organic, lowest-unit-price, and non-frozen preferences using only normalized product data.

#### Scenario: Hard constraint excludes a candidate
- **WHEN** a candidate does not satisfy a requested constraint
- **THEN** the candidate is excluded rather than merely ranked lower

#### Scenario: Preferences rank several candidates
- **WHEN** several candidates satisfy all constraints
- **THEN** the system orders and tags them deterministically by requested preferences, then unit price, item price, and source order without treating the first result as approval

#### Scenario: Required normalized data is absent
- **WHEN** a candidate lacks data required to prove a hard constraint
- **THEN** the system excludes it and reports the unmet constraint rather than assuming compliance

### Requirement: Current-basket gap analysis
The system SHALL compare exact candidate product IDs and requested quantities with the authenticated current basket and SHALL report current quantity, remaining quantity, and selected-line estimate without removing or replacing any basket line.

#### Scenario: Basket partly covers a selected line
- **WHEN** the basket already contains fewer units of the selected product than requested
- **THEN** the plan reports only the positive remaining quantity as eligible for a later addition proposal

#### Scenario: Basket fully covers a selected line
- **WHEN** the basket contains at least the requested quantity of the selected product
- **THEN** the line is marked covered and is omitted from any later addition proposal

#### Scenario: Candidate has not been selected
- **WHEN** a line has candidates but no selected product ID
- **THEN** the system reports the candidates without estimating or proposing an addition for that line

### Requirement: Read-only department discovery and pagination
The system SHALL list current top-level Nemlig departments and SHALL browse a selected department or authenticated favorites with a positive page and bounded page size, returning normalized candidates and an explicit next-page indicator without mutation.

#### Scenario: List departments
- **WHEN** a client requests top-level departments
- **THEN** the system returns stable department identifiers and names without reading or changing the basket

#### Scenario: Browse a department page
- **WHEN** a client supplies a returned department identifier, positive page, and valid page size
- **THEN** the system returns that page of normalized products plus whether another page is available

#### Scenario: Browse a favorites page
- **WHEN** an authenticated client requests a page of favorites
- **THEN** the system returns the requested page across the favorites groups without duplicates or basket mutation

#### Scenario: Unknown department
- **WHEN** a client supplies an identifier not present in current department discovery
- **THEN** the request fails safely without fetching an arbitrary external URL

### Requirement: Immutable local plan snapshots
The system SHALL save a valid guided plan only on explicit request as a new immutable snapshot with an opaque ID in owner-only local ignored storage and SHALL load a snapshot by ID without contacting Nemlig or changing external state.

#### Scenario: Save a plan
- **WHEN** a client explicitly saves a valid plan
- **THEN** the system creates a new snapshot with owner-only permissions and returns its ID without overwriting another snapshot

#### Scenario: Resume a plan
- **WHEN** a client loads a known snapshot ID
- **THEN** the system returns the stored structured lines, preferences, and selections for fresh read-only resolution

#### Scenario: Snapshot is missing or malformed
- **WHEN** a requested snapshot is absent, outside the plan directory, or fails schema validation
- **THEN** the system returns a sanitized error without exposing local paths or partial content

### Requirement: Planning never authorizes mutation
The system SHALL keep planning, browsing, candidate selection, gap analysis, snapshot save/load, picker interaction, and proposal preparation distinct from approval to apply a basket change.

#### Scenario: Plan is fully selected
- **WHEN** every line has an exact available selection and positive remaining quantity
- **THEN** the system may prepare the existing exact additions proposal but SHALL NOT apply it without explicit approval of the unchanged review

#### Scenario: Plan is saved or resumed
- **WHEN** a snapshot is created or loaded
- **THEN** no basket preparation, application, removal, clearing, checkout, order, payment, or delivery-slot mutation occurs automatically
