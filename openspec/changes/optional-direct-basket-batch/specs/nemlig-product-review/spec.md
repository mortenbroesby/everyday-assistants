## MODIFIED Requirements

### Requirement: Temporary basket review draft

Product selection SHALL create an owner-scoped temporary process-local draft.
Draft edits SHALL remain local and SHALL NOT create or mutate a Nemlig shopping
list.

#### Scenario: Explicit additive basket submission

- GIVEN a draft bound to the exact account, card context, product IDs, and
  positive reviewed quantities
- WHEN the user explicitly submits that draft
- THEN the service records a durable no-replay fence before dispatch
- AND sends all reviewed lines in one additive provider request
- AND independently validates basket readback while preserving all previous
  rows
- AND does not create, update, delete, or transfer a shopping list

#### Scenario: Saved list loaded as a read-only source

- GIVEN an exact saved Nemlig shopping list
- WHEN the user loads it into a draft
- THEN its current rows are copied into a fresh temporary draft
- AND later draft edits, submission, or abandonment do not mutate or delete the
  source list

#### Scenario: Abandon, expiry, and uncertainty

- GIVEN an unsubmitted draft
- WHEN the user abandons it or it expires
- THEN no provider mutation occurs
- WHEN a basket submission is uncertain
- THEN the same draft cannot be submitted again and the user is told to inspect
  the actual basket

### Requirement: Optional whole-basket list save

After verified basket submission, the viewer SHALL offer a separate explicit
action to save the entire current basket as a Nemlig shopping list. The action
SHALL preserve the basket, SHALL NOT clear it, and SHALL NOT claim a saved-list
ID unless the provider response establishes one. Uncertain saves SHALL NOT be
retried.

#### Scenario: Provider evidence limits

The first-party website bundle establishes request paths and request shapes
only. The implementation and documentation SHALL NOT claim live acceptance,
atomicity, response shape, or provider limits without further evidence.
