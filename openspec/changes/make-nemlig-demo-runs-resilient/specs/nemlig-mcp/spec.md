## ADDED Requirements

### Requirement: Read-only proposed-basket tool

The MCP server SHALL provide a read-only proposed-basket tool that accepts no more than five actionable entries per invocation. It SHALL validate match confidence, product identifiers, quantities, and alternative identifiers, then return current image, description, package size, price, unit price, confidence, and favourite evidence for display. It SHALL NOT read or mutate the basket.

#### Scenario: Valid proposal group

- **WHEN** ChatGPT supplies up to five valid proposed entries
- **THEN** the server resolves current product metadata and returns a displayable proposed-basket group without basket access

#### Scenario: Invalid proposal group

- **WHEN** confidence is outside 0 to 100, quantity is invalid, a product identifier cannot be resolved, or more than five actionable entries are supplied
- **THEN** the server rejects the proposal without displaying misleading choices

### Requirement: Stateless alternative selection

The proposed-basket view SHALL return an alternative selection to the conversation and SHALL NOT call `review_items_to_add`, `add_approved_items`, or store proposal state.

#### Scenario: User selects an alternative

- **WHEN** the user chooses another product in the view
- **THEN** the view sends the requested ingredient and chosen product identifier back to ChatGPT for a revised proposal

### Requirement: Representative recipe-scale smoke verification

The repository SHALL provide a deterministic, credentials-free smoke scenario covering individual discovery, short-query refinement, an uncertain favourite, an unrelated result, package quantity, grouped proposal review, pantry assumptions, exact addition review, authorization rejection on drift, application, and verified readback without contacting Nemlig.

#### Scenario: Representative flow succeeds

- **WHEN** the smoke runs against its deterministic catalogue, favourites, and basket fixture
- **THEN** suitable products are proposed, uncertain choices are grouped, the exact approved additions apply once, and final readback confirms the result

#### Scenario: Authorization differs from settled additions

- **WHEN** a proposal contains a product or quantity outside the settled reviewed set
- **THEN** verification fails before simulated mutation succeeds

#### Scenario: Simulated write fails

- **WHEN** the simulated basket write fails
- **THEN** the smoke confirms no automatic write retry occurs
