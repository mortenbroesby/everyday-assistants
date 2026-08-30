## Purpose

Defines a local TypeScript command-line shopper that discovers Nemlig products and performs explicitly approved basket operations without Python or recipe functionality.

## Requirements

### Requirement: Local TypeScript runtime
The system SHALL implement the Nemlig shopper locally in TypeScript for the repository's supported Node.js 22 runtime and SHALL NOT require Python, `uv`, or `uvx`.

#### Scenario: Run the local CLI
- **WHEN** a user runs the repository's Nemlig command
- **THEN** the built local Node.js CLI executes without downloading or launching the upstream Python package

### Requirement: Safe credential resolution
The system SHALL resolve a complete `NEMLIG_USERNAME` and `NEMLIG_PASSWORD` environment pair before a locally saved credential pair, SHALL collect missing login credentials through a masked interactive prompt, and SHALL NOT accept or print a password command-line argument.

#### Scenario: Environment credentials take precedence
- **WHEN** both environment credentials and saved credentials exist
- **THEN** the system uses the environment pair without revealing either secret

#### Scenario: Interactive login
- **WHEN** a user runs `login` without a complete credential pair in a terminal
- **THEN** the system prompts for missing values, masks the password, authenticates, and saves the pair only when saving was requested

#### Scenario: Non-interactive login lacks credentials
- **WHEN** login or an authenticated operation runs without complete credentials and no interactive terminal is available
- **THEN** the system exits with a concise remediation error and no stack trace

### Requirement: Restricted local credential storage
The system SHALL store saved credentials only in the ignored local Nemlig configuration area, create the credential file with owner-read/write permissions, and remove only that saved credential file on logout.

#### Scenario: Save credentials
- **WHEN** the user explicitly requests credential persistence after a successful login
- **THEN** the containing directory is owner-only and the JSON credential file mode is `0600`

#### Scenario: Logout
- **WHEN** the user runs `logout`
- **THEN** the saved Nemlig credential file is removed without mutating the remote basket or exposing its former contents

### Requirement: Nemlig session establishment
The system SHALL establish and retain the HTTP session state needed by Nemlig, including cookies, access token, application timestamps, current user identifier, and delivery timeslot, and SHALL report expected HTTP or data failures without exposing credentials or internal stack traces.

#### Scenario: Successful login
- **WHEN** Nemlig accepts the supplied credentials
- **THEN** the client retains the returned session state for subsequent authenticated requests

#### Scenario: Rejected login
- **WHEN** Nemlig returns an authentication error
- **THEN** the CLI reports the sanitized Nemlig error and performs no basket mutation

### Requirement: Product search parity
The system SHALL search the Nemlig search gateway with a caller-supplied query and positive result limit, return the upstream product fields and classifications, and fall back through up to three quick-search categories when the primary search returns no products.

#### Scenario: Gateway search succeeds
- **WHEN** the search gateway returns products
- **THEN** the result includes product ID, name, price, unit price, size, brand, category, subcategory, image, availability, labels, and organic, frozen, refrigerated, dairy, lactose-free, gluten-free, vegan, and discount flags up to the requested limit

#### Scenario: Gateway search is empty
- **WHEN** the primary search returns no products and quick search returns category URLs
- **THEN** the system tries at most the first three categories in order and returns the first non-empty product result

#### Scenario: Search cannot produce results
- **WHEN** both primary and fallback search paths fail or return no products
- **THEN** the system returns an empty result with a concise user-facing message rather than a stack trace

### Requirement: Basket operations
The system SHALL support adding a positive quantity of one product, viewing basket lines and totals, and clearing the basket, and SHALL require an authenticated session for each operation.

#### Scenario: Add a product
- **WHEN** an approved product ID and quantity of at least one are submitted
- **THEN** the system sends exactly that product ID and quantity and then reads back the basket for verification

#### Scenario: View the basket
- **WHEN** an authenticated user requests the basket
- **THEN** the system returns item names, quantities, line totals, product total, delivery price, product count, and formatted delivery time

#### Scenario: Clear the basket
- **WHEN** the user explicitly approves clearing that exact basket
- **THEN** the system clears it and then reads back the basket for verification

#### Scenario: Mutation readback differs
- **WHEN** a post-mutation basket readback does not match the approved result or cannot be completed
- **THEN** the system reports the mismatch or partial success and performs no further mutation

### Requirement: Approval-gated shopping workflow
The system's operating instructions SHALL classify search and basket viewing as read-only and SHALL require an exact proposal containing product name and ID, package or size, quantity, price, and expected line total before invoking an add or clear mutation.

#### Scenario: Exact proposal approved
- **WHEN** the user explicitly approves an unchanged mutation proposal
- **THEN** the operator may invoke only the mutation described by that proposal

#### Scenario: Proposal details change
- **WHEN** any product, quantity, price, or expected total differs from the approved proposal
- **THEN** the system requires new approval before mutation

### Requirement: CLI surface
The system SHALL expose `login`, `logout`, `search`, `add`, and `cart` commands with upstream-compatible non-recipe arguments and defaults, SHALL offer the `nemlig` and `nemlig-shopper` entry names, and SHALL omit the `parse` command.

#### Scenario: Inspect help
- **WHEN** a user requests CLI help
- **THEN** help documents the five supported commands and contains no recipe or checkout command

### Requirement: No ordering capability
The system SHALL NOT expose checkout, purchase, payment, order-placement, or delivery-slot mutation capability.

#### Scenario: Inspect executable surface
- **WHEN** CLI commands and exported shopping operations are enumerated
- **THEN** none can place or pay for an order

