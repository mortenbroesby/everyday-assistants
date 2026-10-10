## MODIFIED Requirements

### Requirement: Revalidation inside the mutation lock

The system SHALL obtain the process-local mutation lock and revalidate
connection binding, proposal state, expiry, current basket contents, exact
product identity, availability, and quantity before mutation. Product identity,
availability, package, and current price estimates SHALL come from a bounded
authoritative upstream read started during application and SHALL NOT be
satisfied by product data retained from discovery or proposal preparation.
Price-only changes SHALL NOT invalidate an otherwise unchanged approval.

#### Scenario: Fresh product validation fails

- **WHEN** any addition or replacement product cannot be freshly revalidated
- **THEN** the server invalidates the proposal before the first mutation and requires a new review without retrying the write

#### Scenario: Reviewed details remain unchanged

- **WHEN** every proposal invariant still matches inside the mutation lock using fresh authoritative product data
- **THEN** the server may perform exactly the proposed operation once

#### Scenario: Reviewed details changed

- **WHEN** fresh availability, product identity, quantity, or basket contents differ
- **THEN** the server invalidates the proposal, reports the changed fields, performs no mutation, and requires a new proposal

#### Scenario: Price changes after review

- **WHEN** only a product or basket price changes after review and the exact products and quantities remain valid
- **THEN** the server may continue the approved addition and reports the actual price from basket readback

#### Scenario: Fresh product details cannot be obtained

- **WHEN** an authoritative product lookup fails or cannot resolve an exact reviewed product during application
- **THEN** the server fails closed, performs no mutation, and requires a new proposal after current product data is available
