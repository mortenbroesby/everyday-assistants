## ADDED Requirements

### Requirement: Six-tool shopping surface
The user MCP catalog SHALL advertise exactly `check_nemlig_connection`, `find_groceries`, `show_my_basket`, `start_product_review`, `update_product_review`, and `submit_product_review`. Search and actual-basket reads SHALL remain read-only. The start/update tools SHALL change only the temporary Draft list; only the protected submit tool MAY add to the actual Nemlig basket. Retired tool names SHALL return the standard unknown-tool response without provider mutation.

#### Scenario: Tools are listed
- **WHEN** a user MCP client lists tools
- **THEN** it sees exactly the six named tools with complete schemas and behavior-matched annotations

#### Scenario: Retired tool is called
- **WHEN** a client calls `get_profile`, `show_my_basket_visually`, `review_items_to_add`, `add_approved_items`, or another retired tool name
- **THEN** the server reports an unknown tool and performs no provider operation

#### Scenario: Search and basket are inspected
- **WHEN** a client searches or reads the actual Nemlig basket
- **THEN** it receives complete structured and text data without opening a Draft list or modifying the basket

### Requirement: Service fixture matches the retained reads
The machine-authenticated service acceptance surface SHALL expose only `find_groceries` and `show_my_basket`. It SHALL reject Draft list start, update, and submit before provider work.

#### Scenario: Service attempts a Draft list action
- **WHEN** the service principal calls a Draft list tool
- **THEN** the call is denied with HTTP 403 and no provider mutation

## MODIFIED Requirements

### Requirement: Complete production feature acceptance
The system SHALL provide an automated, read-only production acceptance workflow that verifies the exact advertised six-tool user catalog and shared resource inventory against the hosted service. It SHALL exercise authenticated product search and actual Nemlig basket inspection, and SHALL fail on inventory drift without starting a Draft list or applying a real basket mutation.

#### Scenario: Read-only production acceptance runs
- **WHEN** the operator runs production acceptance with valid owner authentication
- **THEN** the advertised read-only features and viewer resource are checked, no local or provider mutation is applied, and failures identify the missing feature without disclosing secrets

#### Scenario: Advertised surface drifts
- **WHEN** production lists a tool or resource that the acceptance inventory does not classify, or an expected supported feature disappears
- **THEN** acceptance fails rather than silently skipping the drift

### Requirement: Representative recipe-scale smoke verification
The repository SHALL provide a deterministic, credentials-free smoke scenario covering product discovery, exact Draft list choices, Ready preparation, explicit authorization, a single protected addition, verified Nemlig basket readback, and an uncertain-write path without contacting Nemlig.

#### Scenario: Representative flow succeeds
- **WHEN** the smoke runs against its deterministic catalogue and basket fixture
- **THEN** the exact authorized Ready additions apply once and final readback confirms the result

#### Scenario: Authorization differs from settled additions
- **WHEN** a prepared submission contains a product or quantity outside the settled Ready set
- **THEN** verification fails before simulated mutation succeeds

#### Scenario: Simulated write is uncertain
- **WHEN** the simulated write or readback becomes indeterminate
- **THEN** the submission is not retried and the user is directed to inspect the actual Nemlig basket

## REMOVED Requirements

### Requirement: Non-recipe tool surface
**Reason**: Its catalog requires retired favorites, details, browsing, visual basket, and duplicate prepare/apply tools.
**Migration**: Use the six-tool shopping surface above.

### Requirement: Add-only MCP basket tools
**Reason**: The direct `review_items_to_add` and `add_approved_items` path is retired.
**Migration**: Prepare Ready lines in the Draft list and call `submit_product_review` after exact authorization.

### Requirement: Composable catalogue and product viewer surface
**Reason**: Independent favorites, sections, exact details, and visual basket MCP tools are retired.
**Migration**: Use `find_groceries`, `show_my_basket`, and the Draft list viewer.

### Requirement: Read-only MCP favorites search
**Reason**: The model-visible favorites tool is retired.
**Migration**: Search the current catalogue with `find_groceries`.

### Requirement: Independent product discovery
**Reason**: It directs clients to retired exact-details and favorites tools.
**Migration**: Use `find_groceries` for detailed current candidates.

### Requirement: Conversational reviewed basket changes
**Reason**: It allows the retired direct prepare/apply path.
**Migration**: Use the protected Draft list submission path.

### Requirement: Human-friendly basket tool presentation
**Reason**: It describes the retired direct preparation and application tools.
**Migration**: Present exact Draft list submission and verified Nemlig basket readback in plain language.

### Requirement: Shared product viewer resource
**Reason**: It requires a separate visual basket tool that is retired.
**Migration**: Keep the shared resource for Draft list interactions; use structured/text actual-basket results.

### Requirement: Read-only visual view of the actual Nemlig basket
**Reason**: `show_my_basket_visually` is retired.
**Migration**: Call `show_my_basket` for current basket lines and totals.

### Requirement: Safe production mutation acceptance
**Reason**: The assistant is add-only, so a reversible add/remove acceptance test is unavailable.
**Migration**: Keep production acceptance read-only; use separately authorized, exact user-flow evidence for any real addition.
