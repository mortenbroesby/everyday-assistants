## Context

See `proposal.md` for motivation. The current proposal service already owns connection binding, short expiry, basket fingerprints, a process-local mutation lock, single-use state, exact product revalidation, sanitized audit events, and post-mutation readback. Nemlig exposes separate set-quantity and remove operations, so it cannot provide an atomic replacement transaction.

## Goals / Non-Goals

**Goals:**

- Extend the existing proposal state machine with one replacement operation.
- Prefer the recoverable failure mode: keep the old product until the replacement is confirmed present.
- Return exact arithmetic and enough metadata for human comparison without deciding equivalence.

**Non-Goals:**

- A second proposal engine, rollback mutation, distributed transaction, optimizer, or scoring configuration.
- Picker UI or CLI replacement support in this slice; compatible MCP clients can use the conversational tool pair.

## Decisions

### Reuse the existing proposal service and operation union

Add `replacement` beside additions, removal, and clear. The same map, mutex, lifecycle, fingerprint, replay behavior, audit sink, and apply entry point remain authoritative. A separate coordinator would duplicate the safety boundary and create inconsistent behavior.

### Accept exact IDs and a final replacement quantity

`prepare_cart_replacement` accepts `current_product_id`, `replacement_product_id`, and `replacement_quantity`. Existing search, favorites, planning, and department tools already provide candidate discovery. The final quantity matches Nemlig's set-quantity semantics and remains unambiguous when the replacement product is already in the basket.

### Report basket arithmetic, not product equivalence

Preparation resolves the replacement through the existing product lookup and reports item price, unit price, package size, line total, expected basket total, and `price_difference = current_products_price - expected_products_price`. This net-basket formula remains correct when the replacement product already has a basket line. Positive values may be labeled potential savings. No unit parser or similarity heuristic is added because upstream unit strings and real equivalence examples are insufficient for a reliable automatic decision.

### Add first, remove second

Application revalidates the unchanged basket and replacement product under the existing lock, calls the existing set-quantity add operation, verifies the exact replacement line, then calls the existing removal operation and verifies the old ID is absent. Removing first risks silently losing an intended item if the add fails; adding first can at worst leave both products for explicit cleanup.

### Never compensate or retry after a possible write

If replacement add/readback is uncertain, the old line is not intentionally removed. If old-line removal/readback is uncertain, the sequence stops and reports that both products may remain. The proposal becomes indeterminate and cannot be replayed. An automatic rollback would itself be another unapproved, failure-prone basket mutation.

### Keep the first UI surface conversational

Add only the MCP prepare/apply pair and structured schemas. The existing picker remains unchanged. This delivers the capability with the fewest files; a replacement picker can be added after real usage proves it necessary.

## Risks / Trade-offs

- [Nemlig has no atomic replacement] → Add and verify first, remove second, stop on uncertainty, and require basket inspection.
- [The replacement may not be equivalent] → Require exact user selection and show package and unit metadata without an equivalence claim.
- [The replacement product may already exist] → Treat the supplied replacement quantity as its reviewed final basket quantity and include its current state in the fingerprinted review.
- [A cheaper line can reflect a smaller quantity] → Show both quantities and label the difference as potential savings for the reviewed basket state only.
- [Process-local locking does not coordinate another client] → Retain basket fingerprint revalidation immediately before writes; invalidate on any detected drift.

## Migration Plan

1. Add the replacement operation and focused service tests without changing existing tool behavior.
2. Add the MCP schemas and tool registrations with interface tests.
3. Run the repository verification and OpenSpec validation suites.
4. Release as an additive alpha version. Rollback removes the two new MCP tools and operation branch; existing proposals remain unaffected and in-memory proposals expire naturally.
