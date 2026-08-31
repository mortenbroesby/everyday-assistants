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
The system SHALL expose `login`, `logout`, `search`, `favorites`, `departments`, `browse`, `feature-request`, `add`, `remove`, and `cart` commands, SHALL offer the `nemlig` and `nemlig-assistant` entry names, and SHALL omit recipe, checkout, payment, purchase, order, and delivery-slot commands.

#### Scenario: Inspect help
- **WHEN** a user requests CLI help
- **THEN** help documents the supported commands and contains no recipe or ordering capability

### Requirement: No ordering capability
The system SHALL NOT expose checkout, purchase, payment, order-placement, or delivery-slot mutation capability.

#### Scenario: Inspect executable surface
- **WHEN** CLI commands and exported shopping operations are enumerated
- **THEN** none can place or pay for an order

### Requirement: Authenticated favorites text search
The system SHALL let an authenticated user optionally supply a non-empty text query to the favorites command, SHALL compare the trimmed query with favorite product names using Danish locale-aware case folding, SHALL return only matching favorites up to the requested positive result limit, and SHALL preserve unfiltered favorites listing when no query is supplied.

#### Scenario: Danish favorite matches
- **WHEN** the user's favorites contain `Økologiske bananer` and the user searches favorites for `BANAN`
- **THEN** the matching favorite is returned with its existing product details and unrelated favorites are omitted

#### Scenario: Multiple favorites match
- **WHEN** more than one favorite name contains the normalized query
- **THEN** the system returns the matching favorites in their existing order up to the requested limit without selecting or adding one

#### Scenario: No favorite matches
- **WHEN** no favorite name contains the normalized query
- **THEN** the system returns an empty favorites result and performs no general catalog search or basket mutation

#### Scenario: Favorites are listed without a query
- **WHEN** the user requests favorites without supplying search text
- **THEN** the system preserves the existing limited favorites listing behavior

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
