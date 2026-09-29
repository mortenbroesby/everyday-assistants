## ADDED Requirements

### Requirement: Bounded exact-product hydration for picker review

The proposed-basket review tool SHALL hydrate every unique proposed or
alternative product through Nemlig's current read-only exact-product response,
SHALL normalize provider markup and array-valued visible attributes into bounded
plain text, and SHALL return distinct optional description, declaration, and
detail fields. It SHALL coalesce repeated IDs and use the existing bounded,
abort-aware read coordination without reading or changing the basket.

#### Scenario: Search cards omit detail fields

- **WHEN** a proposal references products discovered through shallow catalogue
  search cards
- **THEN** review retrieves each unique exact product once and returns the
  current product-view evidence rather than reusing the shallow card as final
  detail

#### Scenario: Provider returns markup and attribute arrays

- **WHEN** the exact-product response contains HTML description or declaration
  fields and attributes whose values are arrays of strings
- **THEN** review returns bounded plain text with scripts, styles, links, and
  unsafe markup removed and retains the meaningful ordered attribute values

#### Scenario: Review repeats a product reference

- **WHEN** multiple ingredients or alternatives reference the same product ID
- **THEN** the request performs one exact-product detail read for that ID and
  independently applies each ingredient's relevance validation

#### Scenario: Detail request is cancelled or fatally fails

- **WHEN** caller cancellation, authentication failure, or another fatal
  provider error ends a detail review
- **THEN** queued reads stop, active abort-aware reads settle, and no basket
  operation occurs before the failure is returned

### Requirement: Normal-page alternative capacity

The proposed-basket review tool SHALL accept zero through nine unique
alternative product IDs per ingredient, preserve their supplied order after
omitting unavailable or irrelevant products, and reject duplicate IDs or the
selected product repeated as an alternative.

#### Scenario: Nine alternatives are supplied

- **WHEN** one valid review item contains nine unique relevant alternative IDs
- **THEN** all nine are hydrated, returned in order, and remain available to
  the picker

#### Scenario: More than nine alternatives are supplied

- **WHEN** one review item contains more alternatives than one normal
  ten-result catalogue page can support alongside its selected product
- **THEN** validation rejects the request before any Nemlig read or mutation

