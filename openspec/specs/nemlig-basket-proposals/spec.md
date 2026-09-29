# Nemlig Basket Proposals Specification

## Purpose

Defines the server-enforced proposal protocol that lets the private ChatGPT connection or a local MCP client review exact Nemlig basket changes and apply only unchanged, authorization-bound, single-use approvals.

## Requirements

### Requirement: Exact addition proposal

The system SHALL prepare one or more basket additions without mutation and return an opaque proposal ID, issue and expiry times, current basket fingerprint, exact product IDs and names, sizes, quantities, availability, unit prices, line totals, expected basket effect, relevant upstream labels, and the authorization scope that produced the proposal. The private ownership binding SHALL NOT be disclosed.

#### Scenario: Prepare available additions

- **WHEN** the private connection prepares one or more distinct valid product IDs and positive quantities
- **THEN** the server resolves current product and basket data through bounded read work, stores an authorization-bound proposal, and returns all details needed for exact validation without changing the basket

#### Scenario: Product is unavailable or ambiguous

- **WHEN** a requested product cannot be resolved exactly or is unavailable
- **THEN** preparation reports the unresolved line and creates no applicable proposal containing that line

#### Scenario: Addition input is invalid

- **WHEN** a client supplies no additions, duplicate product IDs, invalid IDs, or invalid quantities
- **THEN** preparation fails before reading or changing the basket

### Requirement: Exact clear proposal

The system SHALL prepare clearing without mutation and bind the proposal to the authorization context, exact current basket lines and totals, basket fingerprint, issue time, and expiry.

#### Scenario: Prepare clearing a non-empty basket

- **WHEN** the private connection requests a clear proposal
- **THEN** the server returns the exact basket that would be removed and performs no mutation

#### Scenario: Prepare clearing an empty basket

- **WHEN** the basket is already empty
- **THEN** the server reports that no mutation is necessary and does not create an applicable destructive proposal

### Requirement: Exact line-removal proposal

The system SHALL prepare removal of one exact basket product line without mutation and bind the proposal to the product ID, current line name, quantity, total, basket fingerprint, authorization context, issue time, and expiry.

#### Scenario: Prepare removal of an existing product line

- **WHEN** the private connection requests removal of a product ID currently present in the basket
- **THEN** the server returns the exact line that would be removed and performs no mutation

#### Scenario: Product line is absent

- **WHEN** the requested product ID is not present in the current basket
- **THEN** the server reports that no mutation is necessary and creates no applicable removal proposal

### Requirement: Exact replacement proposal

The system SHALL prepare replacement of one exact current basket line with one distinct available product and positive final quantity without mutation, and SHALL bind the proposal to the authorization context, current basket fingerprint, both product identities, current line quantity and total, replacement package and price metadata, replacement quantity and line total, expected basket totals, issue time, and expiry. The review SHALL present the signed price difference as a factual basket-cost change and SHALL NOT claim that the products are equivalent.

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

### Requirement: Short-lived authorization-bound proposals

The system SHALL generate cryptographically random opaque proposal IDs, store proposals only for a short configurable lifetime, and bind each proposal to its operation and current basket fingerprint. Hosted proposal state SHALL be isolated by authenticated principal, policy revision, and credential generation, independently of the request-scoped MCP server. A transport server instance or client-supplied session identifier SHALL NOT define hosted proposal ownership. Local MCP clients SHALL retain their process/transport connection binding.

#### Scenario: Same principal presents a proposal in another HTTP request

- **WHEN** the preparing principal presents a proposal in a later stateless HTTP request with the same policy revision and credential generation
- **THEN** the server can locate the proposal across fresh MCP server instances and still enforces operation, expiry, authorization, and basket freshness before application

#### Scenario: Another authorization context presents a proposal

- **WHEN** another hosted principal or another local connection attempts to apply a proposal
- **THEN** the server rejects the request and performs no mutation

#### Scenario: Proposal expires

- **WHEN** application begins after proposal expiry
- **THEN** the server treats the proposal as expired and requires a new proposal

#### Scenario: Policy or credentials change

- **WHEN** a hosted request uses a different policy revision or credential generation from the proposal's preparing context
- **THEN** the old proposal is unavailable in that context and a fresh review is required before any mutation

#### Scenario: Process-local proposal state is lost

- **WHEN** a restart or replacement removes an uncompleted process-local proposal
- **THEN** the server fails closed, requires a fresh review, and does not infer approval or repeat an uncertain mutation

### Requirement: Revalidation inside the mutation lock

The system SHALL obtain the process-local mutation lock and revalidate authorization binding, proposal state, expiry, current basket fingerprint, exact product identity, availability, quantity, unit price, line total, and expected totals before mutation. Addition and replacement application SHALL use fresh authoritative product facts rather than cached review facts.

#### Scenario: Reviewed details remain unchanged

- **WHEN** every proposal invariant still matches inside the mutation lock
- **THEN** the server may perform exactly the proposed operation once

#### Scenario: Reviewed details changed

- **WHEN** price, availability, product, quantity, total, or basket state differs
- **THEN** the server invalidates the proposal, reports the changed fields, performs no mutation, and requires a new proposal

#### Scenario: Fresh product validation fails

- **WHEN** a fresh authoritative lookup fails for any addition or replacement product
- **THEN** the server invalidates the proposal before the first mutation and requires a new review without retrying the write

### Requirement: Single-use and idempotency-aware application

The system SHALL consume a proposal at most once, SHALL return a stored sanitized result for a replay whose completion is known, and SHALL never automatically repeat a mutation whose outcome is uncertain.

#### Scenario: Completed proposal is replayed

- **WHEN** the same authorization context repeats an apply request for a proposal with a stored completed result
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

The model-visible MCP surface SHALL expose review_items_to_add, add_approved_items, review_item_to_remove, remove_approved_item, review_item_swap, make_approved_item_swap, review_emptying_basket, and empty_approved_basket and SHALL NOT expose direct add_to_cart, remove_from_cart, replace_cart_line, or clear_cart mutation tools. Deliberate local CLI commands may remain available.

#### Scenario: Tools are enumerated

- **WHEN** an MCP client lists tools
- **THEN** it can prepare and apply exact additions, one-line removals, one-line replacements, or clearing but cannot directly mutate the basket without a proposal

#### Scenario: Model attempts direct mutation

- **WHEN** a client requests add_to_cart, remove_from_cart, replace_cart_line, or clear_cart by name
- **THEN** the MCP server reports that the direct tool is unavailable and performs no mutation

### Requirement: Accurate write annotations

The system SHALL advertise annotations that match each tool's actual behavior and SHALL rely on server-side proposal validation rather than annotations for enforcement.

#### Scenario: Read and preparation tools are inspected

- **WHEN** find_groceries, show_my_basket, review_items_to_add, review_item_to_remove, review_item_swap, or review_emptying_basket is enumerated
- **THEN** it is marked read-only and non-destructive

#### Scenario: Addition application is inspected

- **WHEN** add_approved_items is enumerated
- **THEN** it is marked state-changing, non-destructive, and open-world

#### Scenario: Clear application is inspected

- **WHEN** remove_approved_item or empty_approved_basket is enumerated
- **THEN** it is marked state-changing, destructive, and open-world

#### Scenario: Replacement application is inspected

- **WHEN** make_approved_item_swap is enumerated
- **THEN** it is marked state-changing, destructive, and open-world

### Requirement: Redacted proposal audit

The system SHALL record sanitized proposal creation, invalidation, application, replay, expiry, and indeterminate transitions and SHALL NOT audit raw prompts, secrets, session identifiers, or complete basket contents.

#### Scenario: Proposal changes state

- **WHEN** a proposal is created, rejected, consumed, replayed, expires, or becomes indeterminate
- **THEN** the audit sink records only the transition, operation, and result class

### Requirement: Approval remains explicit

Tunnel access, app creation, proposal preparation, this OpenSpec, implementation work, product search, and candidate visibility SHALL NOT count as approval to apply a basket change. Approval SHALL be an explicit approval of the exact unchanged proposal. The viewer remains display-only and cannot approve or apply a proposal.

#### Scenario: Exact proposal is approved

- **WHEN** the user explicitly approves an exact unchanged proposal
- **THEN** the model may invoke its apply tool once subject to every proposal invariant

#### Scenario: Proposal exists without explicit approval

- **WHEN** a valid proposal exists but the user has not approved that exact proposal
- **THEN** the model does not invoke its apply tool

### Requirement: No autonomous checkout

The proposal protocol SHALL NOT prepare or apply checkout, payment, purchase, order-placement, or delivery-slot mutations.

#### Scenario: Client requests an order

- **WHEN** a client asks the proposal service to place, pay for, or schedule an order
- **THEN** the service refuses the unsupported operation and does not mutate the basket or order
