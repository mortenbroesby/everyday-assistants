## MODIFIED Requirements

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
