# Nemlig Basket Proposals Specification

## Purpose

Defines the server-enforced proposal protocol that lets the private ChatGPT connection or a local MCP client review exact Nemlig basket additions and apply only unchanged, authorization-bound, single-use approvals. The real provider basket is add-only through this assistant.

## Requirements

### Requirement: Exact addition proposal

The system SHALL prepare one or more positive basket additions without mutation and return an opaque proposal ID, issue and expiry times, current basket fingerprint, exact product IDs and names, sizes, requested addition quantities, current and expected final line quantities, availability, any known estimated prices and totals, expected basket effect, relevant upstream labels, and the authorization scope that produced the proposal. The private ownership binding SHALL NOT be disclosed.

#### Scenario: Prepare available additions

- **WHEN** the private connection prepares one or more distinct valid product IDs and positive addition quantities
- **THEN** the server resolves current product and basket data through bounded read work, stores an authorization-bound proposal, and returns the exact increment, current and resulting quantities, and any known estimated totals without changing the basket

#### Scenario: Product is unavailable or ambiguous

- **WHEN** a requested product cannot be resolved exactly or is unavailable
- **THEN** preparation excludes and reports that line while allowing other exact available lines; if none remain, it creates no applicable proposal

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

The assistant SHALL expose no provider-basket removal, replacement, or clear operation. An approved addition SHALL increase the requested product quantity by its reviewed positive delta, preserve every previously verified line, and fail closed if the basket differs from the reviewed snapshot at the immediate pre-write read. For a multi-product addition, each successful write and readback SHALL become the expected snapshot for the next write. If drift is detected before the first write, no write SHALL be sent; if detected after an earlier verified write, the remaining writes SHALL stop and the proposal SHALL be consumed without retry or rollback. The observed Nemlig write endpoint accepts an absolute quantity rather than an atomic increment; the assistant SHALL never intentionally send a lower quantity than the expected snapshot and SHALL document that an independent Nemlig client can still race between read and write.

#### Scenario: Add to an existing product line

- **WHEN** an unchanged proposal adds a positive quantity to a product already in the basket
- **THEN** the provider client sends the latest observed quantity plus the approved delta and readback verifies the resulting line and preservation of existing lines

#### Scenario: Basket changes after review

- **WHEN** the current basket fingerprint differs from the proposal before application
- **THEN** the proposal is invalidated and no provider mutation occurs

#### Scenario: Basket changes after proposal validation but before the first write
- **WHEN** the immediate pre-write basket read differs from the reviewed snapshot
- **THEN** the proposal is invalidated and no `AddToBasket` request is sent

#### Scenario: Basket changes between product writes
- **WHEN** the immediate pre-write basket read differs from the last verified readback after an earlier product addition
- **THEN** no further write is sent, the proposal is consumed, and the user is told to inspect the basket without retry or rollback

#### Scenario: Multi-product addition uses verified snapshots sequentially
- **WHEN** an approved proposal contains multiple products and each provider readback verifies
- **THEN** each line is sent in sequence and its verified basket becomes the expected snapshot for the next line

#### Scenario: Provider write may have an uncertain outcome

- **WHEN** a provider write or its readback fails or is uncertain
- **THEN** the proposal is consumed, the user is told to inspect the basket, and the mutation is never automatically retried

#### Scenario: Concurrent external basket mutation

- **WHEN** another Nemlig client changes the basket between the final read and Nemlig applying the absolute-quantity write
- **THEN** the system makes no claim that the provider write is atomic or concurrency-safe and documents this limitation

### Requirement: Revalidation inside the mutation lock

The system SHALL obtain the process-local mutation lock and revalidate authorization binding, proposal state, expiry, current basket contents, exact product identity, availability, and quantity before mutation. Missing or changed prices SHALL NOT invalidate an otherwise unchanged approval. Addition application SHALL use fresh authoritative product facts rather than cached review facts. A definitively unavailable or missing reviewed product MAY be skipped while other approved lines continue; a failed or ambiguous lookup SHALL stop before the first write.

#### Scenario: Reviewed details remain unchanged

- **WHEN** every proposal invariant still matches inside the mutation lock
- **THEN** the server may perform exactly the proposed operation once

#### Scenario: Reviewed details changed

- **WHEN** product identity, quantity, or basket contents differ
- **THEN** the server invalidates the proposal, reports the changed fields, performs no mutation, and requires a new proposal

#### Scenario: One reviewed product disappears

- **WHEN** a fresh lookup establishes that one reviewed product is unavailable or no longer exists while other approved products remain valid
- **THEN** the server skips and reports that product, adds only the remaining approved quantities, and reports the verified additions separately from skipped products

#### Scenario: Price changes after review

- **WHEN** only a product or basket price changes after review and the exact products and quantities remain valid
- **THEN** the server may continue the approved addition and reports the actual price from basket readback

#### Scenario: Fresh product validation fails

- **WHEN** a fresh authoritative lookup fails without establishing that the product is unavailable or missing
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

The system SHALL read the basket immediately after every mutation attempt, return the normalized result when verified, and stop on uncertain writes, failed readback, or quantity mismatch. Prices MAY rise, fall, or be absent without stopping remaining approved additions. The server SHALL require exact requested and previously verified quantities, no unexpected product lines, and a matching product count after every write. Missing prices SHALL be reported as unknown rather than inferred as zero. No basket submission places an order or charges a payment method.

#### Scenario: Applied additions match

- **WHEN** the exact proposed additions succeed and basket readback matches
- **THEN** the server marks the proposal completed and returns the resulting basket and totals

#### Scenario: Basket price changes

- **WHEN** an approved addition changes a line price or the basket product total without changing approved quantities
- **THEN** the server accepts the verified basket, continues any remaining approved additions, and returns the actual total

#### Scenario: Readback fails or differs

- **WHEN** Nemlig may have changed the basket but verification fails or differs
- **THEN** the server reports partial or indeterminate success, consumes the proposal, and performs no further mutation

### Requirement: Redacted proposal audit

The system SHALL record sanitized proposal creation, invalidation, application, replay, expiry, and indeterminate transitions and SHALL NOT audit raw prompts, secrets, session identifiers, or complete basket contents.

#### Scenario: Proposal changes state

- **WHEN** a proposal is created, rejected, consumed, replayed, expires, or becomes indeterminate
- **THEN** the audit sink records only the transition, operation, and result class

### Requirement: Approval remains explicit
Connection access, app creation, proposal preparation, this OpenSpec, implementation work, product search, candidate visibility, and local Ready status SHALL NOT count as authorization to change the Nemlig basket. A clear user instruction to add the unchanged current Ready items or explicit approval of the exact prepared effect SHALL be required. Rendering or accepting a product in the Draft list SHALL NOT authorize a provider write.

#### Scenario: Exact Ready addition is authorized
- **WHEN** the user clearly requests addition of unchanged Ready items or approves the exact prepared effect
- **THEN** the model may call `submit_product_review_conversation` once subject to every proposal invariant

#### Scenario: Ready items exist without authorization
- **WHEN** Ready items exist but the user has not instructed their addition
- **THEN** the model does not call `submit_product_review_conversation`

### Requirement: No autonomous checkout

The proposal protocol SHALL NOT prepare or apply checkout, payment, purchase, order-placement, or delivery-slot mutations.

#### Scenario: Client requests an order

- **WHEN** a client asks the proposal service to place, pay for, or schedule an order
- **THEN** the service refuses the unsupported operation and does not mutate the basket or order

### Requirement: Draft list is the model-visible addition path
The model-visible provider-basket write path SHALL use `start_product_review` or `update_product_review_conversation` to prepare exact Ready lines and `submit_product_review_conversation` to apply only an authorized unchanged submission. It SHALL preserve positive-addition semantics, fresh validation, principal binding, single-use authority, serialization, verified readback, and no automatic retry after an uncertain write. Direct provider-basket prepare and apply tools SHALL NOT be advertised.

#### Scenario: Ready addition is authorized
- **WHEN** the user clearly asks to add the unchanged Ready Draft list or approves the exact prepared effect
- **THEN** the protected submission applies only those positive additions once and returns verified Nemlig basket readback

#### Scenario: Direct legacy addition is attempted
- **WHEN** a caller invokes `review_items_to_add` or `add_approved_items`
- **THEN** the tool is unavailable and no provider mutation occurs
