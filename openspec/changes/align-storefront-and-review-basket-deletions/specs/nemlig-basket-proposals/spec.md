## MODIFIED Requirements

### Requirement: Add-only bulk provider operation

Draft submission SHALL remain strictly additive. Whole-line removal and clearing SHALL use the separate reviewed deletion workflow. Partial decreases, replacements and swaps SHALL remain prohibited. After Submit begins and while the draft is locked, it SHALL freshly resolve every reviewed product without using remembered product details. A changed identity or package, failed or ambiguous lookup, or unknown current availability SHALL stop before provider dispatch. A product confirmed missing or unavailable MAY be skipped and reported while other unchanged reviewed products continue. Missing or changed prices alone SHALL NOT block an exact authorized addition; unknown prices SHALL remain unknown. If no products remain, no basket write or optional basket-to-list save is offered. Otherwise the provider client SHALL verify the current basket and anti-forgery state before dispatch, then send the available approved positive additions in one `AddManyToBasket` request with additive semantics. It SHALL independently read back the basket, verify the requested increases, and preserve previously observed unrelated rows. Nemlig has no proven atomicity guarantee against a concurrent external basket change, so the assistant SHALL report only what it can observe and verify.

#### Scenario: Fresh product details changed

- **WHEN** a fresh provider read changes a reviewed product's identity or package, or cannot establish its current availability
- **THEN** no provider write is sent and the user must review the changed or unresolved product again

#### Scenario: Confirmed unavailable product among approved lines

- **WHEN** a fresh provider read confirms one approved product is missing or unavailable but other reviewed products are unchanged and available
- **THEN** only the available approved lines are sent in the one bulk request, and the skipped product is reported separately from verified additions

#### Scenario: Price-only change

- **WHEN** a fresh product price differs but identity and package still match the reviewed product
- **THEN** the authorized addition can proceed and the actual basket readback supplies the resulting price

#### Scenario: Many products are authorized

- **WHEN** the user authorizes 37 distinct positive product additions in one reviewed draft
- **THEN** the client sends one additive bulk provider request and verifies the basket readback, rather than issuing 37 sequential writes

#### Scenario: Preflight cannot establish a safe baseline

- **WHEN** the basket or anti-forgery state cannot be safely verified before dispatch
- **THEN** no provider write is sent and the failure is classified as a known no-write result

#### Scenario: Basket readback is ambiguous

- **WHEN** a provider request may have been dispatched but the resulting basket cannot be independently verified
- **THEN** the result is uncertain, the user is directed to inspect the real basket, and no automatic replay is allowed
