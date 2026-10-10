## ADDED Requirements

### Requirement: Recipe-scale product discovery remains diagnosable
The MCP runtime SHALL distinguish a successful empty result, per-product detail
unavailability, and whole-search failure. For a multi-search request sequence,
it SHALL preserve successfully verified product results and report unresolved
searches truthfully without fabricating availability or creating a Local basket
from unverified products. Privacy-safe diagnostics SHALL identify only the
failing stage, normalized error class, and process-wide active-read count,
without recording
credentials, catalogue contents, or session identifiers.

#### Scenario: Some recipe searches fail
- **WHEN** a recipe-scale request has both successful and failed catalogue searches
- **THEN** verified results remain available for explicit Local basket creation
- **AND** failed terms are reported as unresolved rather than silently omitted

#### Scenario: Whole-search failure is observed
- **WHEN** a catalogue search fails before a usable provider response
- **THEN** the result is an error distinct from a successful empty search
- **AND** diagnostics identify the failure stage without exposing secrets or product contents

#### Scenario: Retryable search failures exceed the session threshold
- **WHEN** diagnosis warrants the bounded queue and more than ten retryable product-search failures occur in a rolling 60-second window for one stable ChatGPT session
- **THEN** the runtime stops further product-search work for that session and reports temporary provider unavailability
- **AND** existing Local baskets remain available without provider access
- **AND** new searches are allowed again when the rolling count falls to ten or fewer; stopped or canceled requests are not automatically replayed

## MODIFIED Requirements

### Requirement: Parallel reads share pre-authentication
The MCP runtime SHALL ensure authentication before every provider-backed task,
reuse existing sessions for read-only work, and coalesce overlapping login
attempts only within the same principal client. If diagnosis demonstrates that
aggregate discovery fan-out is the failure mode, it SHALL bound provider-backed
discovery through a queue scoped to a stable host chat identifier, in addition
to any per-search detail limit. Retryable searches SHALL use exponential backoff
and at most three total attempts. It SHALL NOT retry invalid input,
cancellation, lost authorization, or a basket write. Without a stable host chat
identifier it SHALL retain request-local limits rather than guessing a queue
identity. A read-only task SHALL retry at most once
after HTTP 401; if another read already refreshed that client's session, it
SHALL reuse the refreshed session rather than start a redundant login.

#### Scenario: ChatGPT starts independent searches concurrently
- **WHEN** multiple read-only tools begin while a fresh login for their shared principal client is in flight
- **THEN** they await that login and continue without starting competing login sessions
- **AND** aggregate provider discovery work stays within the configured bounded
  limit when the diagnosed failure mode requires that queue

#### Scenario: An old read fails after another read refreshed the session
- **WHEN** a read returns HTTP 401 from an earlier session generation after another read has refreshed the same principal client
- **THEN** it retries once with the newer session without another login and returns any subsequent failure
