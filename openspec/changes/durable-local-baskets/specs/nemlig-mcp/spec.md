## ADDED Requirements

### Requirement: Recipe-scale product discovery remains diagnosable
The MCP runtime SHALL distinguish a successful empty result, per-product detail
unavailability, and whole-search failure. For a multi-search request sequence,
it SHALL preserve successfully verified product results and report unresolved
searches truthfully without fabricating availability or creating a Local basket
from unverified products. Privacy-safe diagnostics SHALL identify the failing
stage and bounded aggregate discovery work without recording credentials,
catalogue contents, or session identifiers.

#### Scenario: Some recipe searches fail
- **WHEN** a recipe-scale request has both successful and failed catalogue searches
- **THEN** verified results remain available for explicit Local basket creation
- **AND** failed terms are reported as unresolved rather than silently omitted

#### Scenario: Whole-search failure is observed
- **WHEN** a catalogue search fails before a usable provider response
- **THEN** the result is an error distinct from a successful empty search
- **AND** diagnostics identify the failure stage without exposing secrets or product contents

## MODIFIED Requirements

### Requirement: Parallel reads share pre-authentication
The MCP runtime SHALL ensure authentication before every provider-backed task,
reuse existing sessions for read-only work, and coalesce overlapping login
attempts only within the same principal client. It SHALL bound aggregate
provider-backed discovery work for one principal according to the diagnosed
recipe-scale reliability limit, in addition to any per-search detail limit. A
read-only task SHALL retry at most once after HTTP 401; if another read already
refreshed that client's session, it SHALL reuse the refreshed session rather
than start a redundant login. These read retry rules SHALL NOT retry a basket
write.

#### Scenario: ChatGPT starts independent searches concurrently
- **WHEN** multiple read-only tools begin while a fresh login for their shared principal client is in flight
- **THEN** they await that login and continue without starting competing login sessions
- **AND** aggregate provider discovery work stays within the configured bounded limit

#### Scenario: An old read fails after another read refreshed the session
- **WHEN** a read returns HTTP 401 from an earlier session generation after another read has refreshed the same principal client
- **THEN** it retries once with the newer session without another login and returns any subsequent failure
