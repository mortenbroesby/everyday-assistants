## Purpose

Defines the server-enforced proposal protocol that lets the private ChatGPT connection or a local MCP client review exact Nemlig basket changes and apply only unchanged, connection-bound, single-use approvals.

## ADDED Requirements

### Requirement: Exact addition proposal

The system SHALL prepare basket additions without mutation and return an opaque proposal ID, local connection binding, issue and expiry times, current basket fingerprint, exact product IDs and names, sizes, quantities, availability, unit prices, line totals, expected basket effect, and relevant upstream labels.

#### Scenario: Prepare available additions

- **WHEN** the private connection prepares one or more valid product IDs and positive quantities
- **THEN** the server resolves current product and basket data, stores a connection-bound proposal, and returns all details needed for exact review without changing the basket

#### Scenario: Product is unavailable or ambiguous

- **WHEN** a requested product cannot be resolved exactly or is unavailable
- **THEN** preparation reports the unresolved line and creates no applicable proposal containing that line

### Requirement: Exact clear proposal

The system SHALL prepare clearing without mutation and bind the proposal to the local connection, exact current basket lines and totals, basket fingerprint, issue time, and expiry.

#### Scenario: Prepare clearing a non-empty basket

- **WHEN** the private connection requests a clear proposal
- **THEN** the server returns the exact basket that would be removed and performs no mutation

#### Scenario: Prepare clearing an empty basket

- **WHEN** the basket is already empty
- **THEN** the server reports that no mutation is necessary and does not create an applicable destructive proposal

### Requirement: Exact line-removal proposal

The system SHALL prepare removal of one exact basket product line without mutation and bind the proposal to the product ID, current line name, quantity, total, basket fingerprint, local connection, issue time, and expiry.

#### Scenario: Prepare removal of an existing product line

- **WHEN** the private connection requests removal of a product ID currently present in the basket
- **THEN** the server returns the exact line that would be removed and performs no mutation

#### Scenario: Product line is absent

- **WHEN** the requested product ID is not present in the current basket
- **THEN** the server reports that no mutation is necessary and creates no applicable removal proposal

### Requirement: Short-lived connection-bound proposals

The system SHALL generate cryptographically random opaque proposal IDs, store proposals only for a short configurable lifetime, and bind each proposal to its local connection, operation, and current basket fingerprint.

#### Scenario: Another connection presents a proposal

- **WHEN** a connection other than the one that prepared a proposal attempts to apply it
- **THEN** the server rejects the request and performs no mutation

#### Scenario: Proposal expires

- **WHEN** application begins after proposal expiry
- **THEN** the server treats the proposal as expired and requires a new proposal

### Requirement: Revalidation inside the mutation lock

The system SHALL obtain the process-local mutation lock and revalidate connection binding, proposal state, expiry, current basket fingerprint, exact product identity, availability, quantity, unit price, line total, and expected totals before mutation.

#### Scenario: Reviewed details remain unchanged

- **WHEN** every proposal invariant still matches inside the mutation lock
- **THEN** the server may perform exactly the proposed operation once

#### Scenario: Reviewed details changed

- **WHEN** price, availability, product, quantity, total, or basket state differs
- **THEN** the server invalidates the proposal, reports the changed fields, performs no mutation, and requires a new proposal

### Requirement: Single-use and idempotency-aware application

The system SHALL consume a proposal at most once, SHALL return a stored sanitized result for a replay whose completion is known, and SHALL never automatically repeat a mutation whose outcome is uncertain.

#### Scenario: Completed proposal is replayed

- **WHEN** the same connection repeats an apply request for a proposal with a stored completed result
- **THEN** the server returns that result without calling Nemlig again

#### Scenario: Outcome is indeterminate

- **WHEN** execution state is lost after a mutation may have reached Nemlig but before completion is known
- **THEN** the server reports indeterminate state, requires basket inspection, and does not retry

### Requirement: Post-mutation readback

The system SHALL read the basket immediately after every mutation attempt, return the normalized result when verified, and stop on partial success, failed readback, or mismatch.

#### Scenario: Applied additions match

- **WHEN** the exact proposed additions succeed and basket readback matches
- **THEN** the server marks the proposal completed and returns the resulting basket and totals

#### Scenario: Readback fails or differs

- **WHEN** Nemlig may have changed the basket but verification fails or differs
- **THEN** the server reports partial or indeterminate success, consumes the proposal, and performs no further mutation

### Requirement: Proposal-based MCP tool surface

The model-visible MCP surface SHALL expose prepare_cart_additions, apply_cart_additions, prepare_cart_removal, apply_cart_removal, prepare_cart_clear, and apply_cart_clear and SHALL NOT expose direct add_to_cart, remove_from_cart, or clear_cart mutation tools. Deliberate local CLI commands may remain available.

#### Scenario: Tools are enumerated

- **WHEN** an MCP client lists tools
- **THEN** it can prepare and apply exact additions, one-line removals, or clearing but cannot directly mutate the basket without a proposal

#### Scenario: Model attempts direct mutation

- **WHEN** a client requests add_to_cart, remove_from_cart, or clear_cart by name
- **THEN** the MCP server reports that the direct tool is unavailable and performs no mutation

### Requirement: Accurate write annotations

The system SHALL advertise annotations that match each tool's actual behavior and SHALL rely on server-side proposal validation rather than annotations for enforcement.

#### Scenario: Read and preparation tools are inspected

- **WHEN** search_products, view_cart, pick_products, prepare_cart_additions, prepare_cart_removal, or prepare_cart_clear is enumerated
- **THEN** it is marked read-only and non-destructive

#### Scenario: Addition application is inspected

- **WHEN** apply_cart_additions is enumerated
- **THEN** it is marked state-changing, non-destructive, and open-world

#### Scenario: Clear application is inspected

- **WHEN** apply_cart_removal or apply_cart_clear is enumerated
- **THEN** it is marked state-changing, destructive, and open-world

### Requirement: Picker proposal interaction

The picker SHALL display exact product details and SHALL prepare, display, and separately apply proposals rather than mutating on the first product-selection action.

#### Scenario: User chooses a product card

- **WHEN** the user activates the initial action for an available product
- **THEN** the picker prepares a quantity-one proposal and displays its exact item, price, total, and expiry without mutation

#### Scenario: User applies the displayed proposal

- **WHEN** the user explicitly activates the separate apply action and the host authorizes the write tool
- **THEN** the server applies only the still-valid proposal and the picker displays verified basket readback or a sanitized refusal

#### Scenario: Host approval input is pending

- **WHEN** an approval-gated tool has not received approved input from the host
- **THEN** the picker waits for the MCP Apps approval lifecycle and does not infer hidden arguments

### Requirement: Redacted proposal audit

The system SHALL record sanitized proposal creation, invalidation, application, replay, expiry, and indeterminate transitions and SHALL NOT audit raw prompts, secrets, session identifiers, or complete basket contents.

#### Scenario: Proposal changes state

- **WHEN** a proposal is created, rejected, consumed, replayed, expires, or becomes indeterminate
- **THEN** the audit sink records only the transition, operation, and result class

### Requirement: Approval remains explicit

Tunnel access, app creation, proposal preparation, this OpenSpec, and implementation work SHALL NOT count as approval to apply a basket change.

#### Scenario: Proposal exists without explicit approval

- **WHEN** a valid proposal exists but the user has not explicitly approved that exact proposal
- **THEN** the model and picker do not invoke its apply tool

### Requirement: No autonomous checkout

The proposal protocol SHALL NOT prepare or apply checkout, payment, purchase, order-placement, or delivery-slot mutations.

#### Scenario: Client requests an order

- **WHEN** a client asks the proposal service to place, pay for, or schedule an order
- **THEN** the service refuses the unsupported operation and does not mutate the basket or order
