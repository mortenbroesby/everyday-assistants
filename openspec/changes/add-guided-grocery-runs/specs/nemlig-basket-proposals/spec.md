## MODIFIED Requirements

### Requirement: Picker proposal interaction
The picker SHALL display exact product details for one or more selected lines and SHALL prepare, display, and separately apply one batch additions proposal rather than mutating on candidate selection or the first review action.

#### Scenario: User chooses a product card
- **WHEN** the user selects available product IDs and positive quantities from one or more product cards
- **THEN** the picker records only local review state and performs no basket mutation

#### Scenario: User prepares a batch
- **WHEN** the user activates prepare for selected lines with positive remaining quantities
- **THEN** the picker prepares one additions proposal and displays every exact item, quantity, price, line total, expected basket effect, and expiry without mutation

#### Scenario: User applies the displayed proposal
- **WHEN** the user explicitly activates the separate apply action and the host authorizes the write tool
- **THEN** the server applies only the still-valid batch proposal and the picker displays verified basket readback or a sanitized refusal

#### Scenario: Host approval input is pending
- **WHEN** an approval-gated tool has not received approved input from the host
- **THEN** the picker waits for the MCP Apps approval lifecycle and does not infer hidden arguments
