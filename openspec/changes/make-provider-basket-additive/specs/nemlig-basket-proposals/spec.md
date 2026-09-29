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

### Requirement: Add-only provider basket operations

The assistant SHALL expose no provider-basket removal, replacement, or clear operation. An approved addition SHALL increase the requested product quantity by the reviewed positive delta, preserve every unrelated line, and fail closed if the current basket no longer matches the reviewed state. Because Nemlig's observed write endpoint accepts an absolute line quantity, the service SHALL verify current quantities immediately before writing, SHALL never intentionally send a lower quantity than the latest verified quantity, and SHALL report the provider's lack of an atomic increment precondition as a concurrency limitation.

#### Scenario: Add to an existing product line
- **WHEN** an unchanged proposal adds a positive quantity to a product already in the current basket
- **THEN** the applied target is the latest verified quantity plus the approved delta, and readback verifies the resulting line and all unchanged lines

#### Scenario: Basket changes after review
- **WHEN** the basket fingerprint differs from the proposal before application
- **THEN** the proposal is invalidated and no provider mutation occurs

#### Scenario: Current quantity increases immediately before a write
- **WHEN** a fresh pre-write basket read shows a higher quantity than the quantity used to calculate the pending target
- **THEN** the service recalculates the target from the latest quantity before sending the write

#### Scenario: Provider write may have an uncertain outcome
- **WHEN** a provider write or its readback fails or is uncertain
- **THEN** the proposal is consumed, the user is told to inspect the basket, and the mutation is never automatically retried

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
