## MODIFIED Requirements

### Requirement: Exact addition proposal

The system SHALL prepare one or more positive basket additions without mutation and return an opaque proposal ID, issue and expiry times, current basket fingerprint, exact product IDs and names, sizes, requested additional quantities, observed current quantities, resulting quantities, estimated current and resulting line totals, availability, estimated unit prices, incremental line totals, expected resulting basket totals, relevant upstream labels, and the authorization scope that produced the proposal. The private ownership binding SHALL NOT be disclosed. Requested quantities mean additional units, never absolute target quantities.

#### Scenario: Prepare available additions

- **WHEN** the private connection prepares one or more distinct valid product IDs and positive additional quantities
- **THEN** the server resolves current product and basket data through bounded read work, stores an authorization-bound proposal, and returns all details needed for exact validation without changing the basket

#### Scenario: Add to an existing line

- **WHEN** the basket contains two units and a proposal requests two additional units of that product
- **THEN** the proposal shows two existing, two additional, and four resulting units, with any known estimated price for the added units and resulting basket

#### Scenario: Product is unavailable or ambiguous

- **WHEN** a requested product cannot be resolved exactly or is unavailable
- **THEN** preparation excludes and reports that line while allowing other available exact products; if none remain, no applicable proposal is created

#### Scenario: Addition input is invalid

- **WHEN** a client supplies no additions, duplicate product IDs, invalid IDs, or invalid quantities
- **THEN** preparation fails before reading or changing the basket

#### Scenario: Product already exists in the basket

- **WHEN** a requested product already has a positive basket quantity
- **THEN** the proposal treats the requested quantity as an increment and displays the existing quantity and exact resulting quantity, not an absolute target

### Requirement: Revalidation inside the mutation lock

The system SHALL obtain the process-local mutation lock and revalidate authorization binding, proposal state, expiry, current basket contents, exact product identity, availability, and requested additional quantity before mutation. Missing or changed prices SHALL NOT invalidate an otherwise unchanged approval. A definitively unavailable or missing product MAY be skipped and reported while other exact approved products continue; other lookup failures SHALL stop before mutation. Addition application SHALL use fresh authoritative product facts rather than cached review facts. Every provider quantity write SHALL be a positive absolute quantity strictly greater than the latest observed quantity for that line; incomplete existing quantities or stale basket contents SHALL fail closed.

#### Scenario: Reviewed details remain unchanged

- **WHEN** every proposal invariant still matches inside the mutation lock
- **THEN** the server may perform exactly the proposed positive addition once, setting each resulting line quantity to observed current quantity plus approved additional quantity

#### Scenario: Reviewed details changed

- **WHEN** product identity, quantity, or basket contents differ
- **THEN** the server invalidates the proposal, reports the changed fields, performs no mutation, and requires a new proposal

#### Scenario: Price changes after review

- **WHEN** only a product or basket price changes after review and the exact products and quantities remain valid
- **THEN** the server may continue the approved addition and reports the actual price from basket readback

#### Scenario: Existing basket line is incomplete

- **WHEN** the quantity for an existing requested product line is missing or invalid
- **THEN** preparation or application fails closed without writing a provider quantity

#### Scenario: Fresh product validation fails

- **WHEN** a fresh authoritative lookup fails without confirming that the reviewed product is unavailable or missing
- **THEN** the server invalidates the proposal before the first mutation and requires a new review without retrying the write

#### Scenario: One reviewed product disappears

- **WHEN** a fresh lookup confirms one reviewed product is unavailable or missing
- **THEN** the server skips and reports that line while adding the remaining exact approved products

### Requirement: Proposal-based MCP tool surface

The model-visible MCP surface SHALL expose only `review_items_to_add` and `add_approved_items` for actual Nemlig basket mutation and SHALL NOT expose provider-basket removal, replacement, swap, clear, or direct mutation tools. Deliberate local CLI commands may add products but SHALL NOT remove or clear products from the actual provider basket.

#### Scenario: Tools are enumerated

- **WHEN** an MCP client lists tools
- **THEN** it can prepare and apply exact positive additions but cannot request provider-basket removal, replacement, swap, or clearing

#### Scenario: Model attempts destructive provider mutation

- **WHEN** a client requests actual-basket removal, replacement, swap, or clearing
- **THEN** the operation is unavailable and performs no provider mutation; the user may manage those changes directly on Nemlig.com

#### Scenario: Model attempts direct mutation

- **WHEN** a client requests a direct basket mutation tool by name
- **THEN** the MCP server reports that the direct tool is unavailable and performs no mutation

### Requirement: Accurate write annotations

The system SHALL advertise annotations that match each tool's actual behavior and SHALL rely on server-side proposal validation rather than annotations for enforcement.

#### Scenario: Read and preparation tools are inspected

- **WHEN** `find_groceries`, `show_my_basket`, or `review_items_to_add` is enumerated
- **THEN** it is marked read-only and non-destructive

#### Scenario: Addition application is inspected

- **WHEN** `add_approved_items` is enumerated
- **THEN** it is marked state-changing, non-destructive, and open-world

#### Scenario: Clear application is inspected

- **WHEN** an MCP client enumerates tools
- **THEN** no provider-basket clear application tool is available

#### Scenario: Replacement application is inspected

- **WHEN** an MCP client enumerates tools
- **THEN** no provider-basket replacement application tool is available

### Requirement: Approval remains explicit
Connection access, app creation, proposal preparation, this OpenSpec, implementation work, product search, candidate visibility, and local Ready status SHALL NOT count as authorization to change the Nemlig basket. A clear user instruction to add the unchanged current Ready items or explicit approval of the exact prepared effect SHALL be required. Rendering or accepting a product in the Draft list SHALL NOT authorize a provider write.

#### Scenario: Exact Ready addition is authorized
- **WHEN** the user clearly requests addition of unchanged Ready items or approves the exact prepared effect
- **THEN** the model may call `submit_product_review` once subject to every proposal invariant

#### Scenario: Ready items exist without authorization
- **WHEN** Ready items exist but the user has not instructed their addition
- **THEN** the model does not call `submit_product_review`

## REMOVED Requirements

### Requirement: Exact clear proposal

**Reason**: The owner has made the real Nemlig basket sacred and add-only. The user manages clearing directly on Nemlig.com.

### Requirement: Exact line-removal proposal

**Reason**: The owner has forbidden assistant removal from the real Nemlig basket, even with explicit approval.

### Requirement: Exact replacement proposal

**Reason**: Replacement requires removing an existing provider line; alternatives remain available in the local selection before submission, but the assistant cannot swap actual basket contents.

### Requirement: Staged replacement application

**Reason**: This destructive operation is removed. The assistant may only add; it must not remove the old item after adding a replacement.
