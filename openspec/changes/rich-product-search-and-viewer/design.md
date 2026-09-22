## Context

The current client keeps a bounded observed-product cache, but search returns normalized catalogue rows and the MCP layer ranks them directly. Planning and calculation combine catalogue reads, basket subtraction, selection, and automatic authorization. The active issue-72 task owns the MCP/HTTP/gateway/Worker transport boundary, so this change first establishes product hydration and presentation contracts in independent modules, then integrates the adapter changes after that boundary is tested.

## Goals / Non-Goals

**Goals:**

- Make detailed search a request-local, bounded composition over the existing search and exact-product client methods.
- Preserve order, cancellation, cache semantics, explicit failures, and authentication propagation.
- Keep product facts and context-specific basket/review facts separate.
- Remove planner-specific domain code once the shared adapter can stop importing it.
- Provide one safe, display-only product view with a headless representation.

**Non-Goals:**

- No new authentication, provider, transport, deployment, database, scheduler, or generic UI framework.
- No checkout, payment, order, delivery-slot, favourite, or live basket mutation.
- No new UI-managed product selection, optimistic basket, or direct write path.
- No edits to issue-72-owned transport files until its migration reports the integration point.

## Decisions

1. **Hydrate through a pure product-discovery seam.** Add a typed enrichment operation around the existing `searchProducts` and `getProduct` methods. It will deduplicate IDs, retain positions, use the existing request-local read coordinator, and return a typed item status so failures cannot masquerade as complete products. A new provider endpoint or client cache policy is unnecessary.

2. **Keep exact lookup authoritative.** Search rows are candidates only; exact lookup supplies the supported detail projection. Existing `getProduct` hydrated-cache behavior is reused, while pre-write freshness remains the separate `getFreshProduct` path owned by proposal code.

3. **Separate presentation from orchestration.** Product projection and safe image/text handling stay in `product-presentation.ts`; the eventual MCP resource adapter will consume returned data only. The viewer has no provider client, proposal service, or durable store. Context adapters add basket/review fields without widening the product authority model.

4. **Retire planning by caller tracing, not by renaming.** After the issue-72 adapter boundary is available, remove planner registrations, imports, automatic-authority creation, planner-only schemas/formatting, and tests. Preserve `BasketProposalService` and its exact review/apply contract. Any shared read primitive retained by direct search is moved or narrowed rather than leaving an inert planner subsystem.

5. **Use synthetic fixtures as the proof boundary.** Focused tests assert value parity, request counts, concurrency/order, cache reuse, partial failures, cancellation, safe rendering, and retained proposal behavior. No test uses real credentials or mutates a real provider basket.

## Risks / Trade-offs

- **More exact reads per search** → cap unique enrichment IDs, concurrency, input/result sizes, and deadlines; reuse hydrated cache entries and record request-count evidence.
- **Provider detail gaps** → expose a per-item status and omit unknown values; never silently downgrade to a shallow-looking success.
- **Transport overlap with #72** → keep adapter and package changes out of the first slice; rebase once the v2 migration is tested and coordinate the minimal integration diff.
- **UI resource drift** → test the packaged resource inventory and headless fallback; keep the resource single-purpose and self-contained.
- **Planner removal could weaken writes** → retain proposal-service tests for principal binding, expiry, fresh revalidation, replay, and indeterminate outcomes before deleting callers.

## Migration Plan

1. Add the product hydration result model and failing focused tests, then implement the bounded ordered enrichment.
2. Extend product projection tests and add the shared display-only representation/resource contract without provider calls.
3. After issue #72's tested integration point, update MCP registrations and policies, remove planner-only callers/modules, and reconcile docs/specs/package assets.
4. Run focused app tests, package/resource smoke tests, the final repository verification gate, and exact-head CI.
5. Roll back using a reviewed revert of the branch merge; no provider data migration or basket compensation is required.
