## Purpose

Define how maintainers decide whether a changed Nemlig provider route can support an existing assistant journey.

## ADDED Requirements

### Requirement: Evidence for provider compatibility decisions
The assessment SHALL classify each scoped journey as adopt, retain, defer or out of scope and record the source, date, context, rationale and remaining uncertainty.

#### Scenario: A route appears in a storefront bundle
- **WHEN** only static evidence identifies a replacement route
- **THEN** the record identifies it as a candidate and leaves response compatibility unverified

#### Scenario: A catalog route is recommended for adoption
- **WHEN** a replacement is proposed for an existing product journey
- **THEN** paired observations in equivalent delivery context and fixture checks demonstrate the required identity, quantity, availability and price semantics or document approved differences

### Requirement: Bounded read-only investigation
Researchers SHALL retain only sanitized evidence and preserve provider authentication and mutation boundaries.

#### Scenario: Verification requires an external write or unavailable account access
- **WHEN** available read evidence cannot resolve compatibility
- **THEN** the decision identifies the missing evidence and leaves that behavior unverified

### Requirement: Migration of storefront catalog reads
The provider adapter SHALL use verified storefront routes for migrated catalog operations and preserve the assistant's existing identity, pricing, availability, cancellation and review contracts.

#### Scenario: Search or detail depends on a delivery slot
- **WHEN** the provider requires a slot and initial session context lacks one
- **THEN** the adapter resolves account-appropriate context through bounded reads or reports that the lookup cannot be completed

#### Scenario: An exact detail response is ambiguous
- **WHEN** product identity or required availability cannot be verified before submission
- **THEN** the review flow prevents dispatch for the ambiguous submission
