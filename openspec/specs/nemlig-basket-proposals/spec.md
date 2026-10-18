# Nemlig basket addition contract

## Purpose

Define the current add-only provider effect behind an authorized temporary-draft Submit. The earlier proposal preparation/application tools and sequential per-product writes were retired by #317/#318 and #322. Their historical requirements remain in Git history; this canonical spec describes the active path. The draft and viewer contract is in `nemlig-product-review`.

## Requirements

### Requirement: Exact authorized direct submission

A basket addition SHALL require a clear instruction to add the exact reviewed products and positive quantities, an explicit approval of that addition, or an explicit viewer Submit click. Search, list-source loading, product display, draft editing, and a remembered ChatGPT tool approval SHALL NOT authorize an addition. The submitted draft ID, review context, account identity, product IDs, and quantities SHALL match the active reviewed draft. The server does not receive an independently verifiable consent receipt from the host; server validation of caller-supplied fields SHALL NOT be described as proof of user consent.

#### Scenario: Unchanged reviewed draft is authorized

- **WHEN** the user authorizes the exact active draft's product IDs and positive quantities
- **THEN** the protected Submit may add only those quantities once

#### Scenario: Reviewed payload or account changes

- **WHEN** the submitted products, quantities, context, or account differ from the active draft
- **THEN** the server rejects the submission before provider dispatch and requires a fresh exact review or authorization

### Requirement: Add-only bulk provider operation

The assistant SHALL expose no real-basket remove, decrease, replace, swap, or clear operation. After Submit begins and while the draft is locked, it SHALL freshly resolve every reviewed product without using remembered product details. A changed identity or package, failed or ambiguous lookup, or unknown current availability SHALL stop before provider dispatch. A product confirmed missing or unavailable MAY be skipped and reported while other unchanged reviewed products continue. Missing or changed prices alone SHALL NOT block an exact authorized addition; unknown prices SHALL remain unknown. If no products remain, no basket write or optional basket-to-list save is offered. Otherwise the provider client SHALL verify the current basket and anti-forgery state before dispatch, then send the available approved positive additions in one `AddManyToBasket` request with additive semantics. It SHALL independently read back the basket, verify the requested increases, and preserve previously observed unrelated rows. Nemlig has no proven atomicity guarantee against a concurrent external basket change, so the assistant SHALL report only what it can observe and verify.

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

### Requirement: Durable single-attempt fence

The hosted Submit SHALL write and atomically claim a principal/account/payload-bound durable operation before provider dispatch. A failed or conflicting claim SHALL prevent dispatch. A completed receipt MAY return a read-only replay result; an attempted or uncertain receipt SHALL prevent another provider write, including after a process restart. A transport error, completion failure, or failed readback after a possible dispatch SHALL NOT be treated as proof that no write occurred. Retained historical native-list receipts SHALL NOT be deleted merely because their producer is retired.

#### Scenario: Concurrent Submit calls

- **WHEN** two calls attempt to claim the same authorized submission
- **THEN** at most one receives dispatch authority

#### Scenario: Outcome remains uncertain after restart

- **WHEN** the service restarts after dispatch may have occurred but before completion was confirmed
- **THEN** the retained receipt fences another write and the user is directed to inspect the real basket

### Requirement: Separate optional whole-basket save

Only after a verified addition MAY the viewer offer a separate explicit action to save the whole current basket as a Nemlig shopping list. It SHALL include pre-existing basket rows, SHALL NOT clear the basket, SHALL NOT invent a saved-list ID without provider evidence, and SHALL NOT retry an uncertain save. This action is app-only, not a model-visible direct list editor.

#### Scenario: Verified addition followed by optional save

- **WHEN** the user explicitly chooses whole-basket save after verified Submit
- **THEN** the client sends one separately fenced basket-to-list request, preserves the actual basket, and reports only the list identity the provider establishes

### Requirement: No autonomous checkout

The assistant SHALL NOT expose checkout, payment, purchase, order-placement, or delivery-slot mutations.

#### Scenario: Client requests an order

- **WHEN** a client asks the assistant to place, pay for, or schedule an order
- **THEN** it refuses the unsupported operation without a provider mutation
