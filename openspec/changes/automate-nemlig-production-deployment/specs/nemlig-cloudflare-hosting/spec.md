## ADDED Requirements

### Requirement: Automated production releases are exact and explicit

The repository SHALL provide one explicitly invoked production release operation
that accepts an exact commit, requires that commit to equal local HEAD and current
remote `main`, and requires successful CI for that exact revision before any
Cloudflare mutation. Repository state, green CI, and planning or test execution
MUST NOT invoke or authorize the operation automatically.

#### Scenario: Exact release is authorized and ready

- **WHEN** the operator explicitly invokes the release operation with a full
  commit that equals local HEAD and refreshed remote `main` and exact-head CI is
  successful
- **THEN** the operation may proceed to its serialized Cloudflare preflight

#### Scenario: Source or CI does not match

- **WHEN** the supplied commit, local HEAD, remote `main`, or successful CI result
  does not identify the same exact revision
- **THEN** the operation fails before changing Cloudflare

### Requirement: Automated releases are serialized and build once

The release operation SHALL hold one exclusive repository-wide production lease,
record and re-check the current Cloudflare deployment before each mutation, build
and upload the candidate Container image once, deploy it with `MCP_ENABLED=false`,
and enable the same revision without another Container build or rollout. It SHALL
retain the existing Worker, one `lite` Container maximum, bindings, routes,
timeouts, quotas, circuit breaker, and secrets.

#### Scenario: Another release holds the lease

- **WHEN** another local or remote invocation already holds the production lease
- **THEN** the new invocation fails before changing Cloudflare and reports the
  existing lease without replacing it

#### Scenario: Disabled candidate is safe

- **WHEN** the candidate has been uploaded and deployed disabled
- **THEN** both production routes return HTTP 503 with `MCP temporarily disabled`
  and the fixed Container is inactive before enablement begins

#### Scenario: Candidate is enabled

- **WHEN** the disabled checks pass and Cloudflare still identifies the expected
  disabled candidate as current
- **THEN** the operation enables the same commit and Container image without
  rebuilding or increasing capacity

#### Scenario: Cloudflare state changes unexpectedly

- **WHEN** the current deployment differs from the operation's last recorded
  version before a mutation
- **THEN** the operation stops without overwriting the unexpected deployment and
  reports the last state it verified

### Requirement: Automated releases are bounded and recoverable

Before mutation, the operation SHALL require every credential needed for its
read-only acceptance path without printing or persisting credential values. After
enablement it SHALL run bounded revision, health, OAuth metadata, cheap rejection,
and authenticated read-only acceptance checks that do not prepare or apply a
proposal or mutate a basket, favorite, or saved list. Every exit SHALL emit a
redacted summary of the commit, version IDs, timings, completed checks, rollback
attempt, and last verified production state.

#### Scenario: Required authentication is unavailable

- **WHEN** GitHub, Cloudflare, or owner read-only authentication is unavailable at
  preflight
- **THEN** the operation fails before changing Cloudflare and does not disclose or
  persist a credential

#### Scenario: Verification fails before enablement

- **WHEN** upload or disabled-state verification fails
- **THEN** the operation does not enable the candidate, releases no lease until it
  records whether production is disabled, and reports the exact last verified
  state

#### Scenario: Acceptance fails after enablement

- **WHEN** an enabled candidate fails any bounded acceptance check
- **THEN** the operation attempts to restore the recorded starting deployment,
  verifies the resulting state, and reports failure even if restoration succeeds

#### Scenario: Release succeeds

- **WHEN** the exact candidate passes every disabled and enabled acceptance check
- **THEN** the operation reports the deployed commit and enabled version, releases
  its production lease, and records that rollback was unnecessary

