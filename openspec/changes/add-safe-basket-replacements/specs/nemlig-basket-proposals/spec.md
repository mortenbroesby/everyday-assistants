## ADDED Requirements

### Requirement: Exact replacement proposal

The system SHALL prepare replacement of one exact current basket line with one distinct available product and positive final quantity without mutation, and SHALL bind the proposal to the connection, current basket fingerprint, both product identities, current line quantity and total, replacement package and price metadata, replacement quantity and line total, expected basket totals, issue time, and expiry. The review SHALL present the signed price difference as a factual basket-cost change and SHALL NOT claim that the products are equivalent.

#### Scenario: Prepare an available replacement

- **WHEN** a client supplies one product ID currently in the basket, one distinct available replacement product ID, and a positive final replacement quantity
- **THEN** the server returns the exact current and replacement lines, expected basket effect, and signed price difference without changing the basket

#### Scenario: Replacement request is not applicable

- **WHEN** the current line is absent, both product IDs are the same, the replacement cannot be resolved exactly, the replacement is unavailable, or the quantity is invalid
- **THEN** the server creates no applicable proposal and performs no mutation

### Requirement: Staged replacement application

The system SHALL apply an explicitly approved replacement inside the existing process-local mutation lock by revalidating every proposal invariant, setting and verifying the replacement line first, and only then removing and verifying the old line. The system SHALL consume the proposal and stop immediately when any mutation or readback is failed, mismatched, or uncertain, and SHALL never retry or continue the sequence automatically.

#### Scenario: Replacement remains unchanged

- **WHEN** the exact replacement proposal is approved and every basket and product invariant still matches
- **THEN** the server sets and verifies the approved final replacement quantity, removes and verifies the old line, and returns the resulting verified basket

#### Scenario: Replacement line cannot be verified

- **WHEN** adding or reading back the replacement line fails or differs from the approved quantity and total
- **THEN** the server consumes the proposal, does not remove the old line, reports that the basket requires inspection, and performs no automatic retry

#### Scenario: Old line removal cannot be verified

- **WHEN** the replacement line is verified but removing or reading back the old line fails or differs
- **THEN** the server consumes the proposal, reports that the basket may contain both products and requires inspection, and performs no further mutation or automatic retry

## MODIFIED Requirements

### Requirement: Proposal-based MCP tool surface

The model-visible MCP surface SHALL expose prepare_cart_additions, apply_cart_additions, prepare_cart_removal, apply_cart_removal, prepare_cart_replacement, apply_cart_replacement, prepare_cart_clear, and apply_cart_clear and SHALL NOT expose direct add_to_cart, remove_from_cart, replace_cart_line, or clear_cart mutation tools. Deliberate local CLI commands may remain available.

#### Scenario: Tools are enumerated

- **WHEN** an MCP client lists tools
- **THEN** it can prepare and apply exact additions, one-line removals, one-line replacements, or clearing but cannot directly mutate the basket without a proposal

#### Scenario: Model attempts direct mutation

- **WHEN** a client requests add_to_cart, remove_from_cart, replace_cart_line, or clear_cart by name
- **THEN** the MCP server reports that the direct tool is unavailable and performs no mutation

### Requirement: Accurate write annotations

The system SHALL advertise annotations that match each tool's actual behavior and SHALL rely on server-side proposal validation rather than annotations for enforcement.

#### Scenario: Read and preparation tools are inspected

- **WHEN** search_products, view_cart, pick_products, prepare_cart_additions, prepare_cart_removal, prepare_cart_replacement, or prepare_cart_clear is enumerated
- **THEN** it is marked read-only and non-destructive

#### Scenario: Addition application is inspected

- **WHEN** apply_cart_additions is enumerated
- **THEN** it is marked state-changing, non-destructive, and open-world

#### Scenario: Clear application is inspected

- **WHEN** apply_cart_removal or apply_cart_clear is enumerated
- **THEN** it is marked state-changing, destructive, and open-world

#### Scenario: Replacement application is inspected

- **WHEN** apply_cart_replacement is enumerated
- **THEN** it is marked state-changing, destructive, and open-world
