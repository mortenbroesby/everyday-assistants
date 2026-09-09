## MODIFIED Requirements

### Requirement: Catalogue-first candidate resolution
The system SHALL establish a fresh authenticated session before every provider-backed MCP task, even when process-local state reports a prior login, SHALL search the current general catalogue once for each grocery line during normal operation, SHALL NOT search favourites during ordinary planning, and SHALL return bounded candidates. If a catalogue read later reports expired authentication, the system SHALL use the existing bounded authentication recovery and retry the read-only plan once. In automatic mode it SHALL select a candidate only when that candidate satisfies every hard constraint and is a deterministic clear match; in manual mode it SHALL select only an exact product supplied by the client.

#### Scenario: Every provider task starts with fresh authentication
- **WHEN** a client invokes any provider-backed MCP tool while the process-local client reports either logged-in or logged-out state
- **THEN** the system loads the same configured credentials and establishes a fresh session before performing the task

#### Scenario: Approved write starts with fresh authentication
- **WHEN** a client invokes an approved basket write
- **THEN** the system establishes a fresh session before the write and does not retry an indeterminate mutation

#### Scenario: Clear automatic candidate exists
- **WHEN** one or more catalogue products satisfy a line and one candidate is a deterministic clear match
- **THEN** automatic mode selects that exact candidate without presenting a choice and performs no favourites search for that line

#### Scenario: Catalogue candidates exist
- **WHEN** one or more catalogue products match a line and satisfy its constraints
- **THEN** the result contains bounded factual candidate evidence and performs no favourites search for that line

#### Scenario: Catalogue search is empty
- **WHEN** the catalogue search succeeds but no product satisfies the line and its constraints
- **THEN** the line is unresolved as an empty result without searching favourites or issuing another speculative query

#### Scenario: Planning authentication has expired
- **WHEN** any catalogue read in a whole-list plan fails with the authenticated session's HTTP 401 response
- **THEN** the system re-establishes the session from the same configured credentials one additional time and retries the complete read-only plan once instead of converting the authentication failure into an unavailable line

#### Scenario: Catalogue discovery is unavailable
- **WHEN** a non-auth catalogue request fails or the single authenticated retry still cannot discover a line
- **THEN** the line is unresolved as discovery unavailable, distinguishable from an empty result, and the result identifies direct read-only catalogue search as the per-line recovery path without searching favourites or changing the basket

#### Scenario: Several candidates remain materially plausible
- **WHEN** no candidate is a deterministic clear match after filtering and ranking
- **THEN** the line remains unresolved, returns its bounded candidates and evidence, and requires manual choice before any addition

#### Scenario: Several candidates remain plausible
- **WHEN** several candidates remain plausible and one satisfies the deterministic clarity rule
- **THEN** automatic mode selects the clear candidate while manual mode leaves every candidate available for user choice

#### Scenario: No candidate is usable
- **WHEN** catalogue search yields no candidate satisfying the line constraints
- **THEN** the line is returned as unresolved with a concise reason and no proposal is prepared
