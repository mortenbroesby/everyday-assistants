## MODIFIED Requirements

### Requirement: Revalidation inside the mutation lock

The system SHALL obtain the process-local mutation lock and revalidate
connection binding, proposal state, expiry, current basket fingerprint, exact
product identity, availability, quantity, unit price, line total, and expected
totals before mutation. Product identity, availability, package, and price data
used for this final comparison SHALL come from a bounded authoritative upstream
read started during application and SHALL NOT be satisfied by product data
retained from discovery or proposal preparation.

#### Scenario: Reviewed details remain unchanged

- **WHEN** every proposal invariant still matches inside the mutation lock using fresh authoritative product data
- **THEN** the server may perform exactly the proposed operation once

#### Scenario: Reviewed details changed

- **WHEN** fresh price, availability, product, quantity, total, or basket state differs
- **THEN** the server invalidates the proposal, reports the changed fields, performs no mutation, and requires a new proposal

#### Scenario: Fresh product details cannot be obtained

- **WHEN** an authoritative product lookup fails or cannot resolve an exact reviewed product during application
- **THEN** the server fails closed, performs no mutation, and requires a new proposal after current product data is available
