## MODIFIED Requirements

### Requirement: Exact addition proposal

The system SHALL prepare one or more positive basket additions without mutation and return an opaque proposal ID, issue and expiry times, current basket fingerprint, exact product IDs and names, sizes, requested addition quantities, current and expected final line quantities, availability, unit prices, added line totals, expected basket effect, relevant upstream labels, and the authorization scope that produced the proposal. The private ownership binding SHALL NOT be disclosed.

#### Scenario: Prepare available additions
- **WHEN** the private connection prepares one or more distinct valid product IDs and positive addition quantities
- **THEN** the server resolves current product and basket data through bounded read work, stores an authorization-bound proposal, and returns the exact requested increment and resulting basket totals without changing the basket

#### Scenario: Product is unavailable or ambiguous
- **WHEN** a requested product cannot be resolved exactly or is unavailable
- **THEN** preparation reports the unresolved line and creates no applicable proposal containing that line

#### Scenario: Addition input is invalid
- **WHEN** a client supplies no additions, duplicate product IDs, invalid IDs, or invalid quantities
- **THEN** preparation fails before reading or changing the basket

#### Scenario: Product already exists in the basket
- **WHEN** a requested product already has a positive basket quantity
- **THEN** the proposal treats the requested quantity as an increment, displays the existing quantity and exact resulting quantity, and does not describe the increment as an absolute target

#### Scenario: Basket snapshot is incomplete
- **WHEN** the basket is missing verified aggregate totals/count, valid line identities or quantities, or the current total for a requested existing line
- **THEN** preparation creates no applicable proposal and reports that the basket cannot be reviewed safely

### Requirement: Add-only provider basket operations

The assistant SHALL expose no provider-basket removal, replacement, or clear operation. An approved addition SHALL increase the requested product quantity by the reviewed positive delta, preserve every unrelated line, and fail closed if the current basket differs from the last verified snapshot before a write. The first expected snapshot SHALL be the reviewed basket; after each successful per-product write and readback, that verified basket SHALL become the expected snapshot for the next product. Because Nemlig's observed write endpoint accepts an absolute line quantity, the service SHALL never intentionally send a lower quantity than the expected snapshot and SHALL report the provider's lack of an atomic increment precondition as a concurrency limitation.

#### Scenario: Add to an existing product line
- **WHEN** an unchanged proposal adds a positive quantity to a product already in the current basket
- **THEN** the applied target is the latest verified quantity plus the approved delta, and readback verifies the resulting line and all unchanged lines

#### Scenario: Basket changes after review
- **WHEN** the basket fingerprint differs from the proposal before application
- **THEN** the proposal is invalidated and no provider mutation occurs

#### Scenario: Basket changes before the first write
- **WHEN** the immediate pre-write basket read differs from the reviewed snapshot
- **THEN** the proposal is invalidated and no `AddToBasket` request is sent

#### Scenario: Basket changes between product writes
- **WHEN** an immediate pre-write basket read differs from the last verified readback after an earlier product addition
- **THEN** the service sends no further write, consumes the proposal, reports that earlier verified additions may already be present, and requires basket inspection without retry or rollback

#### Scenario: Multiple approved products
- **WHEN** an unchanged proposal contains multiple distinct product lines
- **THEN** the service sends one `AddToBasket` request per line sequentially, verifies each readback, and uses it as the next line's expected snapshot

#### Scenario: Provider write may have an uncertain outcome
- **WHEN** a provider write or its readback fails or is uncertain
- **THEN** the proposal is consumed, the user is told to inspect the basket, and the mutation is never automatically retried

#### Scenario: A write cannot be prepared before dispatch
- **WHEN** a fresh pre-write basket read, basket validation, or anti-forgery bootstrap fails before the `AddToBasket` request is dispatched
- **THEN** no provider mutation is reported as uncertain; with no earlier verified additions, the proposal is invalidated and may be replaced by a fresh review

#### Scenario: Pre-write failure follows an earlier verified addition
- **WHEN** a later product's pre-write read, validation, or anti-forgery bootstrap fails after earlier products were verified
- **THEN** no later `AddToBasket` request is dispatched, the proposal becomes terminal partial, and the user is told which earlier additions were verified and to inspect before preparing again

#### Scenario: Concurrent external basket mutation
- **WHEN** another Nemlig client changes the basket in the interval after the final read and before Nemlig applies the absolute-quantity write
- **THEN** the service makes no claim that the provider write is atomic or concurrency-safe and reports this boundary in user-facing documentation

## REMOVED Requirements

### Requirement: Exact clear proposal
**Reason**: Clearing the real Nemlig basket violates the household's add-only safety policy.
**Migration**: Use Nemlig.com directly for any removal or clearing the user chooses to perform.

### Requirement: Exact line-removal proposal
**Reason**: Removing a real Nemlig basket line is outside the assistant's allowed capabilities.
**Migration**: Use Nemlig.com directly to remove a line.

### Requirement: Exact replacement proposal
**Reason**: Replacing a basket item requires removing an existing line, which the assistant must never do.
**Migration**: Add the desired product as a separate addition; manage the existing line directly on Nemlig.com if needed.

### Requirement: Staged replacement application
**Reason**: The workflow intentionally removes the old basket line after adding its replacement.
**Migration**: Use additive product proposals only; no provider line is removed or swapped by the assistant.

### Requirement: Proposal-based MCP tool surface
**Reason**: The prior surface exposed assistant-controlled remove, replace, and clear operations contrary to the add-only policy.
**Migration**: Use only `review_items_to_add` followed by `add_approved_items`, or the equivalent protected local-review submission. Historical clients that call removed tools receive the standard unknown-tool response and must use Nemlig.com for destructive basket changes.

### Requirement: Accurate write annotations
**Reason**: Destructive apply tools are removed, so their annotations and scenarios no longer describe any supported capability.
**Migration**: Inspect the remaining addition tool's non-destructive, state-changing annotation; use Nemlig.com directly for removals or clearing.
