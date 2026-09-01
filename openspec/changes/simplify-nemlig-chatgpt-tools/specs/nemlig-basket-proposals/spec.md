## MODIFIED Requirements

### Requirement: Proposal-based MCP tool surface

The model-visible MCP surface SHALL expose `review_items_to_add`, `add_approved_items`, `review_item_to_remove`, `remove_approved_item`, `review_item_swap`, `make_approved_item_swap`, `review_emptying_basket`, and `empty_approved_basket` and SHALL NOT expose direct `add_to_cart`, `remove_from_cart`, `replace_cart_line`, or `clear_cart` mutation tools. Deliberate local CLI commands may remain available.

#### Scenario: Tools are enumerated

- **WHEN** an MCP client lists tools
- **THEN** it can review and complete approved exact additions, one-line removals, one-line replacements, or emptying the basket but cannot directly mutate the basket without an approved review

#### Scenario: Model attempts direct mutation

- **WHEN** a client requests `add_to_cart`, `remove_from_cart`, `replace_cart_line`, or `clear_cart` by name
- **THEN** the MCP server reports that the direct tool is unavailable and performs no mutation

### Requirement: Accurate write annotations

The system SHALL advertise annotations that match each tool's actual behavior and SHALL rely on server-side proposal validation rather than annotations for enforcement.

#### Scenario: Read and preparation tools are inspected

- **WHEN** `find_groceries`, `show_my_basket`, `choose_products_visually`, `review_items_to_add`, `review_item_to_remove`, `review_item_swap`, or `review_emptying_basket` is enumerated
- **THEN** it is marked read-only and non-destructive

#### Scenario: Addition application is inspected

- **WHEN** `add_approved_items` is enumerated
- **THEN** it is marked state-changing, non-destructive, and open-world

#### Scenario: Clear application is inspected

- **WHEN** `remove_approved_item` or `empty_approved_basket` is enumerated
- **THEN** it is marked state-changing, destructive, and open-world

#### Scenario: Replacement application is inspected

- **WHEN** `make_approved_item_swap` is enumerated
- **THEN** it is marked state-changing, destructive, and open-world

### Requirement: Picker proposal interaction

The picker SHALL display exact product details for one or more selected lines and SHALL call `review_items_to_add`, display the resulting batch review, and separately call `add_approved_items` rather than mutating on candidate selection or the first review action.

#### Scenario: User chooses a product card

- **WHEN** the user selects available products and positive quantities from one or more product cards
- **THEN** the picker records only local review state and performs no basket mutation

#### Scenario: User prepares a batch

- **WHEN** the user activates review for selected lines with positive remaining quantities
- **THEN** the picker creates one additions review and displays every exact item, quantity, price, line total, expected basket effect, and expiry without mutation

#### Scenario: User applies the displayed proposal

- **WHEN** the user explicitly activates the separate approved action and the host authorizes the write tool
- **THEN** the server applies only the still-valid proposal and the picker displays verified basket readback or a sanitized refusal

#### Scenario: Host approval input is pending

- **WHEN** an approval-gated tool has not received approved input from the host
- **THEN** the picker waits for the MCP Apps approval lifecycle and does not infer hidden arguments
