## ADDED Requirements

### Requirement: User-oriented MCP tool catalog
The MCP server SHALL advertise one concise catalog whose tool identifiers, titles, descriptions, and input guidance use ordinary shopping language. Each description SHALL lead with the outcome and SHALL state whether invoking the tool can change the Nemlig basket, local saved state, or another external system.

#### Scenario: User inspects the tool list
- **WHEN** an MCP client displays the advertised tools
- **THEN** each tool is understandable without knowledge of MCP proposals, immutable snapshots, internal status names, UUIDs, or implementation terminology

#### Scenario: Client inspects a tool input
- **WHEN** an MCP client displays a tool's input schema
- **THEN** every non-obvious input has plain-language guidance that explains the value the client should supply without exposing credentials or weakening exact product selection

#### Scenario: Read-only action is advertised
- **WHEN** a tool only searches, plans, browses, loads, reviews, or views data
- **THEN** its description and MCP annotations consistently identify it as non-mutating for the Nemlig basket

#### Scenario: Write action is advertised
- **WHEN** a tool can change the basket, save local state, or create an external feature request
- **THEN** its description names that effect and its MCP annotations match the actual behavior

### Requirement: Plain-language basket review and action tools
The MCP server SHALL preserve separate review and approved-action tools for every basket mutation while presenting those stages in ordinary shopping language. The approved-action tools SHALL continue to accept only the opaque reference produced by the matching unchanged review and SHALL retain all existing approval, expiry, fingerprint, idempotency, and verified-readback safeguards.

#### Scenario: Basket change is reviewed
- **WHEN** a client prepares an addition, removal, replacement, or clear operation
- **THEN** the advertised tool describes reviewing the exact shopping change and makes clear that the basket is not changed

#### Scenario: Approved basket change is performed
- **WHEN** a client invokes the matching action after explicit approval of the unchanged review
- **THEN** the advertised tool describes the household outcome and the server preserves the existing safe apply and readback behavior

#### Scenario: Approval is absent
- **WHEN** the user has not explicitly approved every exact detail in the unchanged review
- **THEN** the tool catalog and server guidance do not direct the client to invoke the basket-changing action

### Requirement: Single renamed catalog
The MCP server SHALL replace the former protocol-oriented tool identifiers with the new user-oriented identifiers and SHALL NOT advertise compatibility aliases for the former identifiers. Operator documentation SHALL tell existing clients to refresh or reconnect after deployment.

#### Scenario: Client refreshes after deployment
- **WHEN** an installed or cached client reconnects to the updated MCP server
- **THEN** it receives only the new catalog and can use every previously supported feature through the renamed tools

#### Scenario: Client retains an obsolete identifier
- **WHEN** a stale client attempts to invoke a former tool identifier
- **THEN** the server performs no operation and the operator can resolve the mismatch by refreshing or reconnecting the client

#### Scenario: Catalog safety inventory runs
- **WHEN** automated tests enumerate the complete MCP surface
- **THEN** they fail if a former identifier, duplicate alias, missing friendly description, incorrect annotation, or unclassified tool is present
