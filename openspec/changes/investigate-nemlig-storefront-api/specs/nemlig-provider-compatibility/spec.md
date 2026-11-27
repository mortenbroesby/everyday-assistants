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
