## Purpose

Provide trustworthy, richly detailed Nemlig product facts and one consistent display-only presentation without recreating a shopping application or weakening approved basket changes.

## ADDED Requirements

### Requirement: Search results are richly detailed by default

The system SHALL return every result selected by the caller or returned by the provider with the supported product facts available from exact lookup, preserving provider order and representing a detail failure explicitly rather than silently returning a shallow or substituted product. It SHALL NOT impose an application result-count ceiling that is not required by Nemlig or the caller.

#### Scenario: Hydrated search parity

- **WHEN** a search returns products with valid exact identifiers and exact lookup can resolve them
- **THEN** the search result exposes the same supported identity, price, unit, availability, descriptive, dietary, and image facts as exact lookup for those products

#### Scenario: Partial detail failure

- **WHEN** exact detail retrieval fails for one selected search result for a non-authentication reason
- **THEN** successful results remain usable and the affected result is marked unavailable or incomplete without inventing fields, changing order, or presenting the shallow row as complete

#### Scenario: Authentication failure

- **WHEN** detail retrieval reports an authentication failure
- **THEN** the authentication failure is propagated to the existing authenticated-read recovery boundary and is not converted into an empty or apparently partial search

### Requirement: Product retrieval is request-local and chunked only for active work

The system SHALL deduplicate selected product identifiers, preserve search order, process detail reads in an active concurrency window without dropping returned results, honor cancellation and deadlines, and reuse a valid hydrated cache entry without redundant provider calls. Any result-count limit MUST come from Nemlig or the caller rather than an invented application ceiling.

#### Scenario: Ordered hydration without an application cap

- **WHEN** a search returns repeated or more-than-eight product identifiers
- **THEN** unique identifiers are hydrated in a chunked active window, no returned result is discarded because of an application cap, and the final result follows the original search order

#### Scenario: Hydrated cache reuse

- **WHEN** a product was already hydrated in the same client scope
- **THEN** search enrichment reuses that product and does not issue another exact-detail request

#### Scenario: Cancellation

- **WHEN** the caller cancels or the bounded deadline expires during enrichment
- **THEN** no new detail reads begin after cancellation, in-flight reads receive the cancellation signal, and the caller receives the existing cancellation/deadline outcome

### Requirement: Product presentation is shared and display-only

The system SHALL provide one reusable product presentation for product-bearing search, exact lookup, basket, review, and result contexts, while retaining structured and text results for clients without UI support.

The visual presentation SHALL expose the supplied product image, name, brand, package size, package price, unit price, availability, and relevant labels. It SHALL provide an accessible, keyboard-operable disclosure for supplied description, declaration, and structured details. Missing or unknown facts SHALL remain explicitly unknown rather than being invented or silently omitted when material to the comparison.

#### Scenario: Shared product facts

- **WHEN** any supported product-bearing tool returns a product
- **THEN** the presentation uses the returned product facts and context-specific basket or review facts without fetching additional provider data merely to render

#### Scenario: Safe partial rendering

- **WHEN** a product has missing fields, a failed image, partial detail status, or provider-supplied text
- **THEN** the presentation remains readable, uses safe text/image handling, labels unknown values honestly, and does not execute provider markup

#### Scenario: Product comparison facts and expandable details

- **WHEN** a product-bearing result includes image, name, brand, package size, package and unit prices, availability, labels, description, declaration, or structured details
- **THEN** the shared card exposes the comparison facts and relevant labels, and offers an accessible disclosure for the supplied long-form and structured details without another provider request

#### Scenario: Headless fallback

- **WHEN** the host does not support the presentation resource
- **THEN** the structured result and plain text remain complete enough to use the product or existing review/apply flow

#### Scenario: No UI write path

- **WHEN** a product presentation is expanded or rendered
- **THEN** it performs no provider call, creates no basket proposal, changes no basket, and stores no durable product selection or duplicate basket state

### Requirement: Planner removal preserves safe shopping boundaries

The system SHALL remove planner-only orchestration and planner-issued automatic authority from the advertised product workflow while retaining direct product reads, basket inspection, exact review, explicitly approved additions, and their existing principal, freshness, replay, uncertainty, and readback protections.

#### Scenario: Direct product and basket operations remain available

- **WHEN** a client searches or looks up products, reads the basket, reviews additions, or applies an unchanged explicit review
- **THEN** the corresponding retained capability works without a server-owned shopping plan or UI selection workflow

#### Scenario: Unapproved or stale additions are rejected

- **WHEN** an addition lacks exact unchanged review, has expired or foreign-principal authority, has changed product or quantity facts, or cannot be verified after mutation
- **THEN** the operation does not mutate through a bypass and returns the existing refusal or indeterminate outcome

#### Scenario: Retired planner is not advertised

- **WHEN** a client lists available product and basket capabilities
- **THEN** planner-only tools, automatic-authority fields, and picker workflow controls are absent, while retained read/review/apply tools and safe plain-text fallback remain available
