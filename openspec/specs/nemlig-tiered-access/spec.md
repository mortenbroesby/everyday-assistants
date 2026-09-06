# Nemlig Tiered Access Specification

## Purpose

Defines private multi-principal access that reserves capacity for the family,
sheds less-protected tiers predictably, and isolates every Nemlig account and
piece of user state without increasing the global cost ceiling.

## Requirements

### Requirement: Private fail-closed principal policy

The system SHALL authorize only enabled principals in an owner-controlled
encrypted policy, SHALL assign each to exactly Tier 0, Tier 1, or Tier 2, and
SHALL reject an unknown, duplicate, malformed, disabled, or incompletely
configured principal before usage-state access, Container wake, or Nemlig
access. The policy SHALL be changeable without a code build and SHALL contain no
committed identity or credential value.

#### Scenario: Unknown principal authenticates

- **WHEN** a valid token belongs to a subject absent from the private policy
- **THEN** the request receives a stable non-sensitive denial before Durable
  Object dispatch, Container wake, or Nemlig access

#### Scenario: Invitees are not configured

- **WHEN** production contains only the existing Tier 0 owner entry
- **THEN** current owner behavior remains available and every other principal
  fails closed

#### Scenario: Policy is invalid

- **WHEN** the private policy is absent, malformed, ambiguous, or assigns a
  principal without a complete separate Nemlig account configuration
- **THEN** startup or request validation fails closed without using another
  principal's configuration

### Requirement: Family-reserved tier admission

The system SHALL retain Tier 0, Tier 1, and Tier 2 as identity and reporting labels but SHALL apply the same configured monthly, daily, and short-window admission allowances to all three tiers. It SHALL NOT reserve capacity for one tier or shed one otherwise eligible tier before another. Every tier SHALL remain subordinate to the unchanged global cost and safety ceilings.

#### Scenario: Two tiers have equal usage

- **WHEN** otherwise eligible principals in different tiers have the same current and forecast usage
- **THEN** the admission decision is the same for both principals

#### Scenario: A principal reaches the shared allowance

- **WHEN** a principal in any tier reaches the configured shared admission threshold
- **THEN** that principal is denied before Container wake without changing another principal’s independent allowance

#### Scenario: Global headroom is exhausted

- **WHEN** aggregate demand from any combination of tiers reaches a global breaker, quota, or cost ceiling
- **THEN** the global safeguard denies further work without a tier bypass or reserved-capacity exception

#### Scenario: Guest demand reaches the family reserve

- **WHEN** Tier 1 or Tier 2 demand reaches capacity that was formerly reserved for Tier 0
- **THEN** admission uses the same per-principal and global allowances for every tier without retaining a Tier 0 reserve

#### Scenario: Experimental threshold is reached first

- **WHEN** a legacy configuration supplies a lower Tier 2 threshold than the shared allowance
- **THEN** configuration validation fails rather than shedding Tier 2 under a different threshold

#### Scenario: Trusted threshold is reached

- **WHEN** a legacy configuration supplies a different Tier 1 threshold from Tier 0 or Tier 2
- **THEN** configuration validation fails rather than preserving ordered tier shedding

### Requirement: Deterministic bounded usage forecast

The system SHALL atomically count admitted useful operations by principal and
tier for the current UTC minute, day, and month. It SHALL calculate a
conservative month-end forecast from usage to date using a documented,
deterministic, upward-rounded formula and SHALL compare both current usage and
the forecast with configured shedding thresholds.

#### Scenario: Month-end forecast crosses a threshold

- **WHEN** current usage is below a tier threshold but the conservative forecast
  equals or exceeds it
- **THEN** that tier is shed according to tier order before Container wake

#### Scenario: UTC accounting period changes

- **WHEN** the minute, day, or month changes
- **THEN** only the corresponding counters reset and the new period's first
  concurrent admission is counted exactly once

#### Scenario: Concurrent requests contend

- **WHEN** multiple principals request the final available allocation
- **THEN** admission is serialized atomically and no limit or Tier 0 reserve is
  overspent

### Requirement: Per-principal isolation

The system SHALL bind each admitted request and MCP session to one authenticated
principal and SHALL use only that principal's Nemlig credentials, upstream
session, basket, favourites, proposals, approvals, shopping plans, and named
lists. A principal identifier SHALL be opaque outside the encrypted policy and
SHALL NOT be accepted from an untrusted request field.

#### Scenario: Principal opens an MCP session

- **WHEN** an enabled principal initializes an MCP session
- **THEN** the session, client, proposal service, and storage scope are created
  for that authenticated principal only

#### Scenario: Session is reused by another principal

- **WHEN** a different authenticated principal presents an existing MCP session
  identifier or proposal reference
- **THEN** the request is denied without revealing whether the referenced state
  exists and without any Nemlig mutation

#### Scenario: Principal configuration is unavailable

- **WHEN** an admitted identity has no usable independent Nemlig credentials or
  its own session cannot be established
- **THEN** the operation fails without falling back to family or another
  principal's credentials, session, basket, favourites, proposals, or lists

### Requirement: Global safeguards override all tiers

Tier admission SHALL remain subordinate to the global kill switch, one-Container
maximum, authentication, global daily and expensive-operation breaker, CPU and
subrequest limits, deadlines, and bounded retry rules. Tier configuration SHALL
NOT increase any global limit or provision capacity.

#### Scenario: Global breaker or kill switch is active

- **WHEN** any tier sends a request while the global breaker is open or the kill
  switch is disabled
- **THEN** the global rejection wins and no tier reserve bypasses it

#### Scenario: Tier totals are misconfigured

- **WHEN** tier allocations or thresholds exceed the existing global ceilings,
  overlap the Tier 0 reserve, or violate tier order
- **THEN** configuration validation fails closed before production work is
  admitted

### Requirement: Private aggregate evidence

The system SHALL expose owner-only aggregate admitted and rejected counts plus
remaining headroom by tier and reason. Logs and responses SHALL use bounded tier
labels and stable reason codes and SHALL NOT include identity values, credentials,
tokens, prompts, shopping data, per-principal cardinality, or another tier's
private usage.

#### Scenario: Principal is shed

- **WHEN** a tier policy denies an authenticated request
- **THEN** the caller receives a stable explanation that capacity is temporarily
  limited without learning household usage, spending, identities, or limits

#### Scenario: Owner inspects tier state

- **WHEN** the authorized Tier 0 owner requests usage evidence
- **THEN** the response reports bounded aggregate tier counts and remaining
  headroom without returning identity or shopping data

### Requirement: Invitee activation requires isolated acceptance

No Tier 1 or Tier 2 principal SHALL be enabled in production until the owner has
configured that principal's separate authenticated identity and Nemlig account
and an acceptance check has proved isolation, denial-before-wake, tier ordering,
and unchanged global capacity without basket mutation.

#### Scenario: New invitee is prepared

- **WHEN** the owner adds a disabled invitee entry
- **THEN** the invitee remains unable to use the service until the separate
  isolation acceptance succeeds and the owner explicitly enables the entry

#### Scenario: Acceptance cannot prove isolation

- **WHEN** identity, account, session, proposal, or stored-list isolation is
  missing or uncertain
- **THEN** the invitee remains disabled and production retains its prior
  principal policy
