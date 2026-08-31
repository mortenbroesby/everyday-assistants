## MODIFIED Requirements

### Requirement: MCP basket tools

The view tool SHALL return normalized basket data, and every model-visible add, remove, replace, or clear operation SHALL use the matching read-only prepare tool followed by its apply tool only after explicit approval of the unchanged proposal.

#### Scenario: Prepare additions

- **WHEN** `prepare_cart_additions` receives one or more exact positive product quantities
- **THEN** it returns an exact review without changing the basket

#### Scenario: Invalid add quantity

- **WHEN** `prepare_cart_additions` receives a quantity below one
- **THEN** it returns a validation error without calling Nemlig or creating a proposal

#### Scenario: Apply approved additions

- **WHEN** `apply_cart_additions` receives the still-valid proposal ID after explicit approval
- **THEN** it applies only those unchanged lines and returns verified basket readback

#### Scenario: Prepare a replacement

- **WHEN** `prepare_cart_replacement` receives an exact current basket product ID, distinct replacement product ID, and positive final replacement quantity
- **THEN** it returns both exact lines, price and package metadata, signed basket-price difference, expected basket totals, and expiry without changing the basket

#### Scenario: Apply an approved replacement

- **WHEN** `apply_cart_replacement` receives the still-valid proposal ID after explicit approval
- **THEN** it applies only the unchanged staged replacement and returns verified basket readback or sanitized inspection guidance for a consumed partial or uncertain result

#### Scenario: Successful add

- **WHEN** an unchanged addition proposal is explicitly approved and applied
- **THEN** the server adds only its exact lines and returns verified basket readback

#### Scenario: Successful clear

- **WHEN** an unchanged clear proposal is explicitly approved and applied
- **THEN** the server clears only that reviewed basket and returns verified empty-basket readback

#### Scenario: Direct mutation is requested

- **WHEN** a model-visible client requests `add_to_cart`, `remove_from_cart`, `replace_cart_line`, or `clear_cart`
- **THEN** the server reports that the tool is unavailable and performs no mutation

## ADDED Requirements

### Requirement: Factual replacement savings

The replacement preparation tool SHALL report the exact current line total, proposed replacement line total, expected product total, and signed price difference using current normalized basket and product data. It SHALL describe a positive difference as potential savings only for the reviewed quantities and SHALL expose package, item-price, and unit-price metadata needed for the user to judge comparability.

#### Scenario: Replacement costs less

- **WHEN** the proposed replacement line total is lower than the current basket line total
- **THEN** the review reports the exact positive potential savings and does not claim product equivalence or apply the replacement

#### Scenario: Replacement costs the same or more

- **WHEN** the proposed replacement line total is equal to or greater than the current line total
- **THEN** the review reports the signed price difference without labeling it as savings or suppressing the candidate
