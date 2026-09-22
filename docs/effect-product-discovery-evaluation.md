# Product discovery lifecycle decision record

The retained discovery boundary is a small request-local coordinator for rich
product search. It hydrates the provider-selected search results through the
existing exact-product loader, preserves provider order, coalesces duplicate
IDs within the request, and joins active abort-aware reads before returning.

Search has no application-imposed result-count cap. A caller or provider may
select the returned result set; the coordinator does not silently replace that
choice with a default maximum. Its concurrency setting controls simultaneous
detail work only and does not discard results.

## Failure and safety behavior

- successful detail reads return the shared normalized product facts;
- ordinary detail failures produce explicit unavailable rows while other rows
  remain usable;
- invalid provider rows are represented explicitly rather than as invented
  products;
- authentication failures retain their identity and are not disguised as
  partial catalogue results;
- caller cancellation and deadlines abort active reads, do not start queued
  reads, and wait for active work to settle;
- the coordinator does not read or mutate the basket and does not create
  planner, selection, proposal, or approval state.

## Reproduction

From the repository root, without provider credentials:

```sh
pnpm install --frozen-lockfile
pnpm --filter nemlig-assistant exec tsx --test src/product-discovery.test.ts
pnpm --filter nemlig-assistant check
pnpm --filter nemlig-assistant lint
pnpm --filter nemlig-assistant build
```

The tests use synthetic products and assert exact detail-call counts, order,
partial outcomes, authentication propagation, cancellation, and quiescence.
The suite never contacts Nemlig or reads credentials.

## Scope

The coordinator is intentionally limited to product-search hydration. Basket
inspection, review, approval, mutation, and readback remain in their existing
separate boundaries. Product presentation is pure and display-only; the shared
viewer performs no provider work.
