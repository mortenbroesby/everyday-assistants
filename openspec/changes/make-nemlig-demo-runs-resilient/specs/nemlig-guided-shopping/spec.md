## ADDED Requirements

### Requirement: Practical automatic defaults for ordinary groceries
After relevance filtering, hard-constraint checks, requested-amount evaluation, explicit-brand matching, and deterministic ranking, automatic mode SHALL treat the first eligible candidate as a clear selection for an ordinary grocery line unless the line requests explicit choice. When the user names or prefers a brand, the selected candidate SHALL match that brand; when the requested amount is present, the selected package combination SHALL cover it. The system SHALL NOT require uniqueness or a large score gap merely because several otherwise suitable products remain.

#### Scenario: Ordinary line has close alternatives
- **WHEN** several relevant products satisfy an ordinary line's hard constraints and no explicit choice or brand requirement applies
- **THEN** automatic mode selects the first deterministically ranked candidate without presenting a choice

#### Scenario: Requested amount needs several packages
- **WHEN** the first ranked eligible candidate requires multiple packages to cover the requested amount
- **THEN** automatic mode selects that candidate with the calculated package count and covered amount

#### Scenario: Explicit brand is available
- **WHEN** the user names or prefers a brand and an eligible matching product is available
- **THEN** automatic mode selects a matching-brand candidate ahead of non-matching candidates

#### Scenario: Explicit choice remains required
- **WHEN** the line requests explicit choice and several eligible candidates remain
- **THEN** the line remains unresolved and no candidate is covered by automatic authorization

#### Scenario: Required brand or evidence is unavailable
- **WHEN** no eligible candidate satisfies an explicit brand, hard constraint, relevance requirement, or requested-amount evidence requirement
- **THEN** the line remains unresolved rather than selecting a merely available product
