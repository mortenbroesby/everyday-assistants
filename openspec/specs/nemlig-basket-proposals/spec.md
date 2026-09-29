# Nemlig Basket Proposals Specification

## Purpose

Defines the server-enforced proposal protocol that lets the private ChatGPT connection or a local MCP client review exact Nemlig basket additions and apply only unchanged, authorization-bound, single-use approvals. The real provider basket is add-only through this assistant.

## Requirements

### Requirement: Exact addition proposal

The system SHALL prepare one or more positive basket additions without mutation and return an opaque proposal ID, issue and expiry times, current basket fingerprint, exact product IDs and names, sizes, requested addition quantities, current and expected final line quantities, availability, unit prices, added line totals, expected basket effect, relevant upstream labels, and the authorization scope that produced the proposal. The private ownership binding SHALL NOT be disclosed.

#### Scenario: Prepare available additions

- **WHEN** the private connection prepares one or more distinct valid product IDs and positive addition quantities
- **THEN** the server resolves current product and basket data through bounded read work, stores an authorization-bound proposal, and returns the exact increment, current and resulting quantities, and expected basket totals without changing the basket

#### Scenario: Product is unavailable or ambiguous

- **WHEN** a requested product cannot be resolved exactly or is unavailable
- **THEN** preparation reports the unresolved line and creates no applicable proposal containing that line

#### Scenario: Addition input is invalid

- **WHEN** a client supplies no additions, duplicate product IDs, invalid IDs, or invalid quantities
- **THEN** preparation fails before reading or changing the basket

#### Scenario: Product already exists in the basket

- **WHEN** a requested product already has a positive basket quantity
- **THEN** the proposal treats the requested quantity as an increment and displays the existing quantity and exact resulting quantity, not an absolute target

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

### Requirement: Add-only provider operations

The assistant SHALL expose no provider-basket removal, replacement, or clear operation. An approved addition SHALL increase the requested product quantity by its reviewed positive delta, preserve every previously verified line, and fail closed if the reviewed basket state changed before application. The observed Nemlig write endpoint accepts an absolute quantity rather than an atomic increment; the assistant SHALL read current quantity immediately before writing, SHALL never intentionally send a lower quantity than that read, and SHALL document that an independent Nemlig client can still race between read and write.

#### Scenario: Add to an existing product line

- **WHEN** an unchanged proposal adds a positive quantity to a product already in the basket
- **THEN** the provider client sends the latest observed quantity plus the approved delta and readback verifies the resulting line and preservation of existing lines

#### Scenario: Basket changes after review

- **WHEN** the current basket fingerprint differs from the proposal before application
- **THEN** the proposal is invalidated and no provider mutation occurs

#### Scenario: Provider write may have an uncertain outcome

- **WHEN** a provider write or its readback fails or is uncertain
- **THEN** the proposal is consumed, the user is told to inspect the basket, and the mutation is never automatically retried

#### Scenario: Concurrent external basket mutation

- **WHEN** another Nemlig client changes the basket between the final read and Nemlig applying the absolute-quantity write
- **THEN** the system makes no claim that the provider write is atomic or concurrency-safe and documents this limitation

### Requirement: Revalidation inside the mutation lock

The system SHALL obtain the process-local mutation lock and revalidate authorization binding, proposal state, expiry, current basket fingerprint, exact product identity, availability, quantity, unit price, line total, and expected totals before mutation. Addition application SHALL use fresh authoritative product facts rather than cached review facts.

#### Scenario: Reviewed details remain unchanged

- **WHEN** every proposal invariant still matches inside the mutation lock
- **THEN** the server may perform exactly the proposed operation once

#### Scenario: Reviewed details changed

- **WHEN** price, availability, product, quantity, total, or basket state differs
- **THEN** the server invalidates the proposal, reports the changed fields, performs no mutation, and requires a new proposal

#### Scenario: Fresh product validation fails

- **WHEN** a fresh authoritative lookup fails for any addition product
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

### Requirement: Add-only proposal MCP surface

The model-visible MCP surface SHALL expose only `review_items_to_add` and `add_approved_items` for provider-basket mutation, and SHALL NOT expose a provider-basket remove, replace, or clear capability. Local review edits are not provider-basket operations. Historical clients requesting retired provider tools SHALL receive the standard unknown-tool response.

#### Scenario: Tools are enumerated

- **WHEN** an MCP client lists tools
- **THEN** it can prepare and apply exact additions but sees no provider-basket remove, replace, or clear tool

#### Scenario: Retired destructive operation is requested

- **WHEN** a client requests a removed provider-basket remove, replace, or clear tool by name
- **THEN** the MCP server reports that the tool is unavailable and performs no provider mutation

### Requirement: Accurate write annotations

The system SHALL advertise annotations that match each tool's actual behavior and SHALL rely on server-side proposal validation rather than annotations for enforcement.

#### Scenario: Read and preparation tools are inspected

- **WHEN** a discovery, basket-view, or `review_items_to_add` tool is enumerated
- **THEN** it is marked read-only and non-destructive

#### Scenario: Addition application is inspected

- **WHEN** add_approved_items is enumerated
- **THEN** it is marked state-changing, non-destructive, and open-world

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
