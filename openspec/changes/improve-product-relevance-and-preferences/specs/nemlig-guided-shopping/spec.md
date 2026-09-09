## MODIFIED Requirements

### Requirement: Structured whole-list planning
The system SHALL accept between one and fifty grocery lines, each containing one short non-empty Danish catalogue phrase, a positive package quantity or a positive requested amount with a supported unit, optional product constraints and preferences, optional preferred brands, an optional request for explicit choice, an optional selected product ID, and an automatic or manual mode that defaults to automatic, and SHALL reject an invalid request before reading or changing external state. Clients SHALL translate or normalize English, mixed-language, misspelled, or over-specific requests before submitting a line, preserving a distinctive brand with the intended Danish product category and preserving an amount the user expressed.

#### Scenario: Valid grocery list
- **WHEN** a client submits several valid grocery lines without specifying a mode
- **THEN** the system resolves them in automatic mode and returns one ordered planning result per input line without changing favorites or the basket

#### Scenario: Requested amount
- **WHEN** a client submits a valid requested amount and supported mass, volume, or count unit
- **THEN** the system preserves that amount separately from package quantity and evaluates candidate package combinations against it

#### Scenario: Manual grocery list
- **WHEN** a client submits valid grocery lines in manual mode
- **THEN** the system returns candidates for user choice and does not automatically select or apply a product

#### Scenario: Invalid grocery line
- **WHEN** any line has blank search text, no positive package quantity or requested amount, an unsupported amount unit or preference, or more than fifty total lines are supplied
- **THEN** the complete request fails before any product, basket, proposal, or local plan operation

### Requirement: Catalogue-first candidate resolution
The system SHALL establish a fresh authenticated session before every provider-backed MCP task, even when process-local state reports a prior login, SHALL search the current general catalogue once for each grocery line during normal operation, SHALL NOT search favourites during ordinary planning, SHALL exclude products whose normalized category, subcategory, name, or description clearly contradicts the requested grocery category, and SHALL return bounded candidates. If a catalogue read later reports expired authentication, the system SHALL use the existing bounded authentication recovery and retry the read-only plan once. In automatic mode it SHALL select a candidate only when that candidate satisfies every hard constraint, is relevant to the requested grocery, covers the requested amount when one exists, and is a deterministic clear match; in manual mode it SHALL select only an exact product supplied by the client.

#### Scenario: Every provider task starts with fresh authentication
- **WHEN** a client invokes any provider-backed MCP tool while the process-local client reports either logged-in or logged-out state
- **THEN** the system loads the same configured credentials and establishes a fresh session before performing the task

#### Scenario: Approved write starts with fresh authentication
- **WHEN** a client invokes an approved basket write
- **THEN** the system establishes a fresh session before the write and does not retry an indeterminate mutation

#### Scenario: Product category contradicts the request
- **WHEN** a minced-meat search returns a product identified as cat food, dog food, or another clearly incompatible category
- **THEN** the incompatible product is excluded from eligible candidates and cannot be tagged, selected, or proposed

#### Scenario: Clear automatic candidate exists
- **WHEN** one or more relevant catalogue products satisfy a line and one candidate is a deterministic clear match
- **THEN** automatic mode selects that exact candidate without presenting a choice and performs no favourites search for that line

#### Scenario: Catalogue candidates exist
- **WHEN** one or more relevant catalogue products match a line and satisfy its constraints
- **THEN** the result contains bounded factual candidate evidence and performs no favourites search for that line

#### Scenario: Catalogue search is empty
- **WHEN** the catalogue search succeeds but no relevant product satisfies the line and its constraints
- **THEN** the line is unresolved as an empty result without searching favourites or issuing another speculative query

#### Scenario: Planning authentication has expired
- **WHEN** any catalogue read in a whole-list plan fails with the authenticated session's HTTP 401 response
- **THEN** the system re-establishes the session from the same configured credentials one additional time and retries the complete read-only plan once instead of converting the authentication failure into an unavailable line

#### Scenario: Catalogue discovery is unavailable
- **WHEN** a non-auth catalogue request fails or the single authenticated retry still cannot discover a line
- **THEN** the line is unresolved as discovery unavailable, distinguishable from an empty result, and the result identifies direct read-only catalogue search as the per-line recovery path without searching favourites or changing the basket

#### Scenario: Several candidates remain materially plausible
- **WHEN** no candidate is a deterministic clear match after relevance filtering, amount evaluation, and preference ranking
- **THEN** the line remains unresolved, returns its bounded candidates and evidence, and requires manual choice before any addition

#### Scenario: Several candidates remain plausible
- **WHEN** several candidates remain plausible and one satisfies the deterministic clarity rule
- **THEN** automatic mode selects the clear candidate while manual mode leaves every candidate available for user choice

#### Scenario: No candidate is usable
- **WHEN** catalogue search yields no relevant candidate satisfying the line constraints
- **THEN** the line is returned as unresolved with a concise reason and no proposal is prepared

### Requirement: Constraints and deterministic preferences
The system SHALL support availability, organic, vegan, gluten-free, lactose-free, maximum item price, and maximum unit-price constraints and SHALL support explicit preferred brands plus discount, organic, lowest-unit-price, and non-frozen preferences using only normalized product data. It SHALL rank an exact preferred-brand match first, then sufficient package combinations by least excess, then the requested deterministic preferences and price. A higher price alone SHALL NOT be treated as evidence of higher quality.

#### Scenario: Hard constraint excludes a candidate
- **WHEN** a candidate does not satisfy a requested constraint
- **THEN** the candidate is excluded rather than merely ranked lower

#### Scenario: Explicit preferred brand is available
- **WHEN** a user preference identifies Heinz and relevant Heinz tomato ketchup is available
- **THEN** matching Heinz candidates rank ahead of non-matching brands before price is compared

#### Scenario: Requested amount has several package combinations
- **WHEN** relevant candidates can cover the requested amount with different package sizes or package counts
- **THEN** the system reports the required package count, covered amount, and excess amount and ranks sufficient combinations by least excess before requested price preferences

#### Scenario: Brand-sensitive choice remains
- **WHEN** the line requests explicit choice and several relevant brands remain without an explicit preferred-brand match
- **THEN** the system leaves the line unresolved with a bounded brand choice instead of selecting the cheapest candidate

#### Scenario: Preferences rank several candidates
- **WHEN** several candidates satisfy all constraints and no earlier preferred-brand or amount distinction decides the order
- **THEN** the system orders and tags them deterministically by requested preferences, then unit price and item price without treating the first result as approval

#### Scenario: Required normalized data is absent
- **WHEN** a candidate lacks data required to prove a hard constraint or requested-amount coverage
- **THEN** the system excludes it from automatic selection and reports the missing evidence rather than assuming compliance

### Requirement: Current-basket gap analysis
The system SHALL compare exact candidate product IDs and required package counts with the authenticated current basket and SHALL report current package quantity, remaining package quantity, requested amount, covered amount, and selected-line estimate without removing or replacing any basket line.

#### Scenario: Basket partly covers a selected line
- **WHEN** the basket already contains fewer packages of the selected product than the package combination required for the requested quantity or amount
- **THEN** the plan reports only the positive remaining package quantity as eligible for a later addition proposal

#### Scenario: Basket fully covers a selected line
- **WHEN** the basket contains at least the required package quantity of the selected product
- **THEN** the line is marked covered and is omitted from any later addition proposal

#### Scenario: Candidate has not been selected
- **WHEN** a line has candidates but no selected product ID
- **THEN** the system reports the candidates and their amount evidence without estimating or proposing an addition for that line

