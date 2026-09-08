## MODIFIED Requirements

### Requirement: CLI surface
The system SHALL expose `login`, `logout`, `search`, `favorites`, `departments`, `browse`, `add`, `remove`, and `cart` commands, SHALL offer the `nemlig` and `nemlig-assistant` entry names, and SHALL omit recipe, checkout, payment, purchase, order, and delivery-slot commands.

#### Scenario: Inspect help
- **WHEN** a user requests CLI help
- **THEN** help documents the supported commands and contains no recipe or ordering capability

#### Scenario: Retired feedback command
- **WHEN** a user invokes `feature-request`
- **THEN** the CLI rejects the unknown command without submitting an issue
