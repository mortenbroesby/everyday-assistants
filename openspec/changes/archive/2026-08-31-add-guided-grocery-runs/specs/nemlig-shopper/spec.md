## ADDED Requirements

### Requirement: Department browsing commands
The CLI SHALL expose read-only `departments` and `browse <department-id>` commands, SHALL accept positive page and bounded limit options for browsing, and SHALL print normalized product details without changing favorites or the basket.

#### Scenario: List departments from the CLI
- **WHEN** a user runs `departments`
- **THEN** the CLI prints current department identifiers and names without authenticating for a basket mutation

#### Scenario: Browse a department from the CLI
- **WHEN** a user runs `browse` with a current department identifier, page, and limit
- **THEN** the CLI prints that normalized product page and next-page state without mutation

### Requirement: Paginated favorites command
The CLI SHALL let the authenticated `favorites` command request a positive page and bounded limit while preserving its existing no-query listing and optional Danish text search behavior.

#### Scenario: Request a later favorites page
- **WHEN** a user supplies a page greater than one to `favorites`
- **THEN** the CLI returns that deduplicated page and its next-page state without changing favorites or the basket

#### Scenario: Existing favorites command is unchanged
- **WHEN** a user omits the page option
- **THEN** the command preserves the first-page listing or search behavior and existing default limit

## MODIFIED Requirements

### Requirement: CLI surface
The system SHALL expose `login`, `logout`, `search`, `favorites`, `departments`, `browse`, `feature-request`, `add`, `remove`, and `cart` commands, SHALL offer the `nemlig` and `nemlig-assistant` entry names, and SHALL omit recipe, checkout, payment, purchase, order, and delivery-slot commands.

#### Scenario: Inspect help
- **WHEN** a user requests CLI help
- **THEN** help documents the supported commands and contains no recipe or ordering capability
