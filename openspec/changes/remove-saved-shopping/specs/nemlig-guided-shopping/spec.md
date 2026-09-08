## REMOVED Requirements

### Requirement: Immutable local plan snapshots
**Reason**: The owner retired all assistant-managed saved shopping functionality.
**Migration**: Supply groceries in each new run. Existing saved records remain untouched and are no longer accessible through the assistant; no automatic export or native-list integration is introduced.

## MODIFIED Requirements

### Requirement: Planning never authorizes mutation
The system SHALL keep planning, browsing, candidate selection, gap analysis, picker interaction, and proposal preparation distinct from approval to apply a basket change. An authenticated user’s explicit instruction to proceed with an automatic grocery run MAY authorize only the sufficiently clear additions resolved from the supplied lines, quantities, constraints, and preferences; merely requesting or viewing a plan SHALL NOT authorize mutation.

#### Scenario: Automatic run was explicitly authorized
- **WHEN** the user explicitly instructs the assistant to proceed, automatic mode resolves one or more sufficiently clear additions, and the exact proposal remains valid
- **THEN** the authorized additions may be applied without another approval question while unresolved lines remain unchanged

#### Scenario: Plan is fully selected
- **WHEN** every line has an exact available selection and positive remaining quantity
- **THEN** the system may prepare the exact additions proposal and may apply it only when covered by exact approval or the same run's explicit automatic authorization

#### Scenario: Plan was requested without authorization to proceed
- **WHEN** the user asks to plan, compare, show choices, or use manual mode without explicitly instructing the assistant to add the result
- **THEN** the system does not apply a basket mutation


#### Scenario: Plan is saved or resumed
- **WHEN** a client attempts to save or resume a plan through a retired interface
- **THEN** the request is rejected without storage access or any basket mutation

## ADDED Requirements

### Requirement: Request-scoped shopping intent
The assistant SHALL resolve supplied grocery lines without saving or loading shopping snapshots or named lists. It SHALL preserve current candidate selection, basket gap analysis and explicit same-run authorization.

#### Scenario: Plan supplied groceries
- **WHEN** a user supplies grocery lines in a conversation
- **THEN** planning returns current candidates and basket gaps without reading or writing saved-shopping records
