## MODIFIED Requirements

### Requirement: Structured whole-list planning
The system SHALL accept between one and fifty grocery lines, each containing one short non-empty Danish catalogue phrase, a positive quantity, optional product constraints and preferences, an optional selected product ID, and an automatic or manual mode that defaults to automatic, and SHALL reject an invalid request before reading or changing external state. Clients SHALL translate or normalize English, mixed-language, misspelled, or over-specific requests before submitting a line, preserving a distinctive brand with the intended Danish product category.

#### Scenario: Valid grocery list
- **WHEN** a client submits several valid grocery lines without specifying a mode
- **THEN** the system resolves them in automatic mode and returns one ordered planning result per input line without changing favorites or the basket

#### Scenario: Manual grocery list
- **WHEN** a client submits valid grocery lines in manual mode
- **THEN** the system returns candidates for user choice and does not automatically select or apply a product

#### Scenario: Invalid grocery line
- **WHEN** any line has blank search text, a non-positive quantity, an unsupported preference, or more than fifty total lines are supplied
- **THEN** the complete request fails before any product, basket, proposal, or local plan operation

### Requirement: Catalogue-first candidate resolution
The system SHALL search the current general catalogue exactly once for each grocery line, SHALL NOT search favourites during ordinary planning, and SHALL return bounded candidates. In automatic mode it SHALL select a candidate only when that candidate satisfies every hard constraint and is a deterministic clear match; in manual mode it SHALL select only an exact product supplied by the client.

#### Scenario: Clear automatic candidate exists
- **WHEN** one or more catalogue products satisfy a line and one candidate is a deterministic clear match
- **THEN** automatic mode selects that exact candidate without presenting a choice and performs no favourites search for that line

#### Scenario: Catalogue candidates exist
- **WHEN** one or more catalogue products match a line and satisfy its constraints
- **THEN** the result contains bounded factual candidate evidence and performs no favourites search for that line

#### Scenario: Catalogue search is empty
- **WHEN** the catalogue search succeeds but no product satisfies the line and its constraints
- **THEN** the line is unresolved as an empty result without searching favourites or issuing another speculative query

#### Scenario: Catalogue discovery is unavailable
- **WHEN** the catalogue request fails
- **THEN** the line is unresolved as discovery unavailable, distinguishable from an empty result, without searching favourites or changing the basket

#### Scenario: Several candidates remain materially plausible
- **WHEN** no candidate is a deterministic clear match after filtering and ranking
- **THEN** the line remains unresolved, returns its bounded candidates and evidence, and requires manual choice before any addition

#### Scenario: Several candidates remain plausible
- **WHEN** several candidates remain plausible and one satisfies the deterministic clarity rule
- **THEN** automatic mode selects the clear candidate while manual mode leaves every candidate available for user choice

#### Scenario: No candidate is usable
- **WHEN** catalogue search yields no candidate satisfying the line constraints
- **THEN** the line is returned as unresolved with a concise reason and no proposal is prepared

### Requirement: Planning never authorizes mutation
The system SHALL keep planning, browsing, candidate selection, gap analysis, snapshot save/load, picker interaction, and proposal preparation distinct from approval to apply a basket change. An authenticated user’s explicit instruction to proceed with an automatic grocery run MAY authorize only the sufficiently clear additions resolved from the supplied lines, quantities, constraints, and preferences; merely requesting or viewing a plan SHALL NOT authorize mutation.

#### Scenario: Automatic run was explicitly authorized
- **WHEN** the user explicitly instructs the assistant to proceed, automatic mode resolves one or more sufficiently clear additions, and the exact proposal remains valid
- **THEN** the authorized additions may be applied without another approval question while unresolved lines remain unchanged

#### Scenario: Plan is fully selected
- **WHEN** every line has an exact available selection and positive remaining quantity
- **THEN** the system may prepare the exact additions proposal and may apply it only when covered by exact approval or the same run's explicit automatic authorization

#### Scenario: Plan was requested without authorization to proceed
- **WHEN** the user asks to plan, compare, show choices, or use manual mode without explicitly instructing the assistant to add the result
- **THEN** the system does not apply a basket mutation

#### Scenario: Plan is saved or resumed
- **WHEN** a snapshot is created or loaded without a new explicit instruction to proceed
- **THEN** no basket preparation, application, removal, clearing, checkout, order, payment, or delivery-slot mutation occurs automatically

## ADDED Requirements

### Requirement: Rich bounded candidate evidence
The system SHALL return the current normalized product name, brand, package size, item price, unit price, availability, relevant labels, description when separately available, and approved direct HTTPS image URL when available for every bounded candidate. It SHALL NOT treat package-size text as a product description, proxy or persist image bytes, or expose provider secrets.

#### Scenario: Rich catalogue data is available
- **WHEN** a candidate includes description and image metadata from the current catalogue
- **THEN** the structured result makes that evidence available to ChatGPT and a compatible picker for intent comparison

#### Scenario: Description or image is unavailable
- **WHEN** the provider does not return a separate description or approved image URL
- **THEN** selection uses the remaining factual evidence and does not invent missing content

### Requirement: Honest automatic coverage summary
The system SHALL report total requested lines and counts for covered, automatically selected, added, unresolved, and failed lines, plus automatic coverage calculated from lines covered or selected without manual choice divided by total requested lines. It SHALL distinguish that deterministic coverage from probabilistic confidence.

#### Scenario: Partially automatic run completes
- **WHEN** an automatic run covers or selects some lines and leaves others unresolved
- **THEN** the result reports the exact counts and coverage percentage and identifies only the unresolved lines for optional manual choice

#### Scenario: All lines are clear
- **WHEN** every requested line is already covered or has a sufficiently clear available selection
- **THEN** the result reports complete automatic coverage without displaying a choice interface
