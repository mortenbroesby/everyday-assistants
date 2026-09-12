## MODIFIED Requirements

### Requirement: Catalogue-first candidate resolution
The system SHALL establish a fresh authenticated session before every provider-backed MCP task, even when process-local state reports a prior login, SHALL search the current general catalogue once for each distinct request-local retrieval key during normal operation, SHALL NOT share retrievals across requests or authenticated principals, SHALL NOT search favourites during ordinary planning, SHALL exclude products whose normalized category, subcategory, name, or description clearly contradicts the requested grocery category, and SHALL return bounded candidates in the same order as the submitted grocery lines. Lines with the same validated, trimmed catalogue phrase and result limit, or the same selected product ID, SHALL share only their provider retrieval; the system SHALL evaluate each line's constraints, preferences, quantities, and evidence independently. If a catalogue read later reports expired authentication, the system SHALL stop the active planning attempt, wait until its underlying reads have settled, use the existing bounded authentication recovery, and retry the complete read-only plan once. In automatic mode it SHALL select a candidate only when that candidate satisfies every hard constraint, is relevant to the requested grocery, covers the requested amount when one exists, and is a deterministic clear match; in manual mode it SHALL select only an exact product supplied by the client.

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

#### Scenario: Duplicate catalogue retrievals in one plan
- **WHEN** several grocery lines in one planning request use the same validated, trimmed catalogue phrase and result limit or the same selected product ID
- **THEN** the system performs one provider retrieval for that key and independently evaluates and returns each line in its original position

#### Scenario: Retrievals are isolated between plans and principals
- **WHEN** identical retrieval keys occur in separate planning requests or authenticated principals
- **THEN** each request and principal performs its own provider retrieval without reusing another request's result

#### Scenario: Planning authentication has expired
- **WHEN** any catalogue read in a whole-list plan fails with the authenticated session's HTTP 401 response
- **THEN** the system stops active and queued reads, waits for the underlying reads to settle, re-establishes the session from the same configured credentials one additional time, and retries the complete read-only plan once instead of converting the authentication failure into an unavailable line

#### Scenario: Fatal planning failure stops sibling reads
- **WHEN** basket acquisition fails, the caller cancels, or the planning deadline expires while catalogue discovery is active
- **THEN** the system stops active and queued reads before returning the failure and starts no fallback or retry after cancellation

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

#### Scenario: Approved product is freshly revalidated
- **WHEN** a separately approved basket proposal revalidates a selected product before mutation
- **THEN** the system performs a new authoritative product read that is not reused from planning or another line
