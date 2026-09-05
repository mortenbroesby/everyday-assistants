## Why

Basket proposal application claims to revalidate current product details, but
`NemligClient.getProduct()` can return an indefinitely retained process-local
product from an earlier search. A changed price, availability flag, package, or
other reviewed detail can therefore escape the final pre-mutation comparison.

## What Changes

- Separate inexpensive reuse of previously observed products from an explicit
  authoritative product lookup that bypasses process-local product reuse.
- Require every final additions and replacement apply path to use the fresh
  lookup before any Nemlig basket mutation.
- Fail closed without mutating when a product cannot be freshly resolved or any
  reviewed product detail has changed.
- Add regression coverage proving the final check performs a new upstream read
  even when the product is already present in the local product map.
- Preserve the existing mutation lock, proposal expiry, basket fingerprint,
  bounded reads, no mutation retries, and post-action basket readback.

Non-goals are adding a persistent cache, changing discovery ranking, changing
the approval contract, increasing retry or request budgets, or mutating any live
Nemlig basket during development or acceptance.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-basket-proposals`: Make the required pre-mutation product revalidation
  explicitly fresh rather than satisfiable from an unbounded process-local
  observation cache.

## Impact

- Affected code: `apps/nemlig-assistant/src/client.ts`, proposal service wiring,
  and focused client/proposal tests.
- External behavior: approved apply requests may now fail safely when current
  product details cannot be fetched or have drifted since review.
- Cost and performance: at most one fresh product lookup per addition line and
  two per replacement at apply time, within the existing twenty-line proposal
  bound and existing read timeouts/retries. No background work, new storage,
  dependency, autoscaling, or paid service is introduced.
- Acceptance: focused regression tests, root verification, strict OpenSpec
  validation, exact-main CI, then the normal fail-closed production deployment
  and read-only health checks. No basket mutation is authorized by this change.
