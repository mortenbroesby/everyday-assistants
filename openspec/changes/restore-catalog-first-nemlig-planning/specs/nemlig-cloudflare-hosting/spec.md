## MODIFIED Requirements

### Requirement: Execution and retry work is bounded

The Worker SHALL enforce one generous caller-visible total deadline for every hosted MCP request. Downstream work that cannot reliably inherit cancellation SHALL retain a timeout long enough for normal catalogue operations while remaining inside that outer ceiling. Every retry count SHALL remain finite, and mutation attempts SHALL NOT be retried automatically.

#### Scenario: Normal catalogue work is slow

- **WHEN** a catalogue read is slower than the normal case but remains within the generous hosted deadline
- **THEN** the request is allowed to complete rather than being converted into a missing-product result by an aggressive nested deadline

#### Scenario: Hosted request reaches the outer ceiling

- **WHEN** any request remains stalled until the configured total deadline
- **THEN** the gateway returns a sanitized bounded failure and does not leave the caller waiting for several minutes

#### Scenario: Nemlig or backend call times out

- **WHEN** downstream work remains stalled until its generous configured bound
- **THEN** the request fails with sanitized error information inside the hosted outer ceiling and is not retried indefinitely

#### Scenario: Retriable downstream failure persists

- **WHEN** every permitted read attempt fails
- **THEN** the operation reports discovery as unavailable without another attempt, replacement job, recursive request, or false no-candidate result

#### Scenario: Mutation result is slow or uncertain

- **WHEN** a basket mutation times out, is cancelled, or has an indeterminate result
- **THEN** the operation is not retried and returns inspection guidance consistent with the existing proposal and readback safety contract
