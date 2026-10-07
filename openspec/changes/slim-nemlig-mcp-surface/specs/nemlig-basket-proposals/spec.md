## ADDED Requirements

### Requirement: Draft list is the model-visible addition path
The model-visible provider-basket write path SHALL use `start_product_review` or `update_product_review` to prepare exact Ready lines and `submit_product_review` to apply only an authorized unchanged submission. It SHALL preserve positive-addition semantics, fresh validation, principal binding, single-use authority, serialization, verified readback, and no automatic retry after an uncertain write. Direct provider-basket prepare and apply tools SHALL NOT be advertised.

#### Scenario: Ready addition is authorized
- **WHEN** the user clearly asks to add the unchanged Ready Draft list or approves the exact prepared effect
- **THEN** the protected submission applies only those positive additions once and returns verified Nemlig basket readback

#### Scenario: Direct legacy addition is attempted
- **WHEN** a caller invokes `review_items_to_add` or `add_approved_items`
- **THEN** the tool is unavailable and no provider mutation occurs

## MODIFIED Requirements

### Requirement: Approval remains explicit
Connection access, app creation, proposal preparation, this OpenSpec, implementation work, product search, candidate visibility, and local Ready status SHALL NOT count as authorization to change the Nemlig basket. A clear user instruction to add the unchanged current Ready items or explicit approval of the exact prepared effect SHALL be required. Rendering or accepting a product in the Draft list SHALL NOT authorize a provider write.

#### Scenario: Exact Ready addition is authorized
- **WHEN** the user clearly requests addition of unchanged Ready items or approves the exact prepared effect
- **THEN** the model may call `submit_product_review` once subject to every proposal invariant

#### Scenario: Ready items exist without authorization
- **WHEN** Ready items exist but the user has not instructed their addition
- **THEN** the model does not call `submit_product_review`

## REMOVED Requirements

### Requirement: Add-only proposal MCP surface
**Reason**: The direct prepare/apply pair is removed from the MCP catalog.
**Migration**: Use the Draft list submission path above.

### Requirement: Accurate write annotations
**Reason**: Its scenarios refer to retired direct addition tools.
**Migration**: Mark search and basket read as read-only; mark Draft list edits and submission as state-changing and non-destructive while enforcing all safety server-side.
