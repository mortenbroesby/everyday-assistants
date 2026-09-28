## MODIFIED Requirements

### Requirement: Family-reserved tier admission

The system SHALL retain Tier 0, Tier 1 and Tier 2 as identity/reporting labels
and SHALL apply the same monthly allowance to eligible principals in every tier.
It SHALL NOT enforce principal-minute thresholds, reserve capacity for one tier,
or shed one eligible tier before another. Every tier SHALL remain subordinate to
the retained global daily, expensive-operation and emergency cost ceilings.

#### Scenario: Two tiers have equal usage

- **WHEN** eligible principals in different tiers have equal monthly usage
- **THEN** the admission decision is equal for both

#### Scenario: A principal reaches the shared allowance

- **WHEN** a principal reaches the configured monthly allowance
- **THEN** it is denied before backend wake with an explicit monthly-cost reason
  without changing another principal's independent allowance

#### Scenario: Global headroom is exhausted

- **WHEN** aggregate demand reaches a global breaker or cost ceiling
- **THEN** the global safeguard denies work without a tier exception

#### Scenario: Burst exceeds former principal-minute allowance

- **WHEN** eligible requests exceed the former principal-minute allowance while
  retained cost controls permit them
- **THEN** requests remain admitted regardless of tier or minute counts

#### Scenario: Monthly tier allowances disagree

- **WHEN** configuration supplies unequal monthly allowances for tiers
- **THEN** configuration validation fails instead of preserving ordered shedding

#### Scenario: Guest demand reaches the family reserve

- **WHEN** Tier 1 or Tier 2 demand reaches capacity formerly reserved for Tier 0
- **THEN** the same monthly and global cost allowances apply without a reserve

#### Scenario: Experimental threshold is reached first

- **WHEN** configuration supplies a lower Tier 2 monthly threshold
- **THEN** validation fails instead of shedding Tier 2 differently

#### Scenario: Trusted threshold is reached

- **WHEN** configuration supplies a different Tier 1 monthly threshold
- **THEN** validation fails instead of preserving ordered tier shedding
