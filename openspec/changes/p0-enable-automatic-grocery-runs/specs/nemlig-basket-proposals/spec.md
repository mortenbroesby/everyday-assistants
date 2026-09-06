## MODIFIED Requirements

### Requirement: Exact addition proposal

The system SHALL prepare between one and fifty basket additions without mutation and return an opaque proposal ID, local connection binding, issue and expiry times, current basket fingerprint, exact product IDs and names, sizes, quantities, availability, unit prices, line totals, expected basket effect, relevant upstream labels, and the authorization scope that produced the proposal.

#### Scenario: Prepare available additions

- **WHEN** the private connection prepares one or more and at most fifty valid product IDs and positive quantities
- **THEN** the server resolves current product and basket data, stores a connection-bound proposal, and returns all details needed for exact validation without changing the basket

#### Scenario: Product is unavailable or ambiguous

- **WHEN** a requested product cannot be resolved exactly or is unavailable
- **THEN** preparation reports the unresolved line and creates no applicable proposal containing that line

#### Scenario: Addition batch is too large

- **WHEN** a client attempts to prepare more than fifty additions
- **THEN** preparation fails before reading or changing the basket

### Requirement: Approval remains explicit

Tunnel access, app creation, proposal preparation, this OpenSpec, implementation work, planning alone, and candidate visibility SHALL NOT count as approval to apply a basket change. Approval MAY be either an explicit approval of an exact unchanged proposal or an authenticated user’s explicit instruction to proceed with automatic additions resolved within the same request’s lines, quantities, hard constraints, and preferences. The automatic authorization SHALL NOT cover removals, replacements, clearing, checkout, payment, ordering, delivery slots, unresolved candidates, or a later resumed run.

#### Scenario: Exact proposal is approved

- **WHEN** the user explicitly approves an exact unchanged proposal
- **THEN** the model or picker may invoke its apply tool once subject to every proposal invariant

#### Scenario: Automatic additions were authorized initially

- **WHEN** the user explicitly instructed the assistant to proceed, the same run deterministically resolved sufficiently clear additions within the supplied scope, and the proposal remains unchanged
- **THEN** the model may invoke the additions apply tool without asking the user to approve the resolved SKU and price details again

#### Scenario: Automatic scope is exceeded

- **WHEN** an addition changes a requested quantity or hard constraint, uses an unresolved candidate, or belongs to a later or different run
- **THEN** the initial automatic authorization does not cover it and no such addition is applied

#### Scenario: Destructive operation is requested

- **WHEN** the system prepares removal, replacement, or clearing
- **THEN** the automatic-additions authorization does not apply and the exact unchanged proposal still requires separate explicit approval

#### Scenario: Proposal exists without either approval form

- **WHEN** a valid proposal exists but neither its exact details nor its same-run automatic additions scope was explicitly approved by the user
- **THEN** the model and picker do not invoke its apply tool

#### Scenario: Proposal exists without explicit approval

- **WHEN** a valid proposal exists but the user has neither approved that exact proposal nor explicitly authorized the same run's automatic additions
- **THEN** the model and picker do not invoke its apply tool
