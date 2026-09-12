## MODIFIED Requirements

### Requirement: Complete proposed-basket review

Before requesting approval to add products, the integration SHALL present the
complete proposed basket with one recommended choice per ingredient, requested
package quantity, match confidence, product evidence, alternatives, and stated
pantry assumptions. It SHALL accept up to fifty ingredient decisions in one
review, preserve their submitted order, and SHALL NOT drop or require artificial
five-decision groups for later decisions. Each decision MAY contain at most four
alternatives. The integration SHALL coalesce repeated exact product IDs within
one review, SHALL resolve every unique product with at most three simultaneous
provider reads, and SHALL NOT reuse those reads across reviews or principals.

#### Scenario: Large proposal is reviewed

- **WHEN** a proposal contains between one and fifty ingredient decisions
- **THEN** the integration resolves and returns every decision in submitted
  order without requiring groups of five or silently dropping later decisions

#### Scenario: Proposal has fewer than twenty products

- **WHEN** the proposal contains fewer than twenty ingredient decisions
- **THEN** ChatGPT may present the complete visual review in one ordered view

#### Scenario: Proposal has twenty or more products

- **WHEN** the proposal contains at least twenty and at most fifty ingredient
  decisions
- **THEN** confident recommendations remain compact while every decision stays
  available in the same ordered review without five-decision grouping

#### Scenario: Review repeats a product reference

- **WHEN** the same exact product ID appears in more than one proposed or
  alternative position in one review
- **THEN** the integration performs one provider retrieval for that ID and
  evaluates its relevance independently for every ingredient position

#### Scenario: Review contains maximum references

- **WHEN** fifty ingredient decisions each contain one proposed product and
  four alternatives
- **THEN** the integration accepts all 250 references, eventually resolves each
  unique reference, and never runs more than three provider reads at once

#### Scenario: Reviewed product disappeared

- **WHEN** an exact product lookup returns not found
- **THEN** a missing proposed product rejects only its ingredient, a missing
  alternative is omitted, and unrelated ingredient decisions remain available

#### Scenario: Proposed review terminates fatally

- **WHEN** a lookup reports expired authentication or another fatal provider
  failure, or the caller cancels the review
- **THEN** the integration stops queued work, interrupts and awaits active
  abort-aware reads, preserves the fatal identity, and leaves no outstanding
  reads before returning or beginning the one allowed authenticated retry

#### Scenario: User settles the alternatives

- **WHEN** the user finishes choosing among presented alternatives
- **THEN** ChatGPT shows the complete updated proposed basket before requesting
  exact basket-addition approval

### Requirement: Bounded read-only product review

The integration SHALL coordinate multi-product reads for read-only review with
an ordered request-local pool. The pool SHALL use a configurable positive
concurrency value that defaults to three, SHALL preserve submitted result order,
and SHALL await active abort-aware reads before returning a fatal failure or
allowing an authenticated retry. This coordination SHALL NOT make basket writes
parallel, cancellable after they begin, or automatically retried.

#### Scenario: Fifty additions are prepared for review

- **WHEN** the user asks to review fifty exact products before adding them
- **THEN** every product is resolved in submitted order with no more than three
  simultaneous product reads and no basket mutation

#### Scenario: Addition review authentication expires during the batch

- **WHEN** one product read reports expired authentication while sibling reads
  are active and later products are queued
- **THEN** queued reads do not start, active reads settle, and only then may the
  integration begin its one authenticated retry

#### Scenario: Approved basket mutation begins

- **WHEN** the user applies an unchanged reviewed proposal
- **THEN** fresh validation and basket writes retain their existing sequential,
  single-attempt mutation safeguards rather than entering the read pool
