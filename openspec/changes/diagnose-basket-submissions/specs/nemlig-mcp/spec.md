## ADDED Requirements

### Requirement: Exact read-only submission inspection

The existing show_my_basket tool SHALL accept an optional draft_id for submission inspection. Without it, the tool SHALL retain its ordinary read-only basket behavior. With it, the tool SHALL use owner-scoped durable evidence, verify the provider account before and after reading and return the basket with quantity comparison and safe failure evidence. Missing evidence or another account SHALL produce an actionable failure without a basket write. The viewer's uncertain-submission recovery SHALL send its exact draft ID when available and forbid replay; without a handle it SHALL request a generic read and disclose that it cannot verify that operation.

#### Scenario: Reconstructed service inspects its owner's receipt

- **WHEN** an authenticated owner supplies the failed draft ID after service restart
- **THEN** the tool returns the stored baseline and dispatched-quantity comparison without creating a draft, completing uncertainty or adding products

#### Scenario: Foreign account requests evidence

- **WHEN** the receipt account differs from the current provider account
- **THEN** inspection fails before reading that account's basket and does not disclose the receipt
