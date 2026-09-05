## Context

See `proposal.md` for motivation. Discovery and proposal preparation populate a
bounded process-local map of complete product objects. The same general product
lookup is currently called during application, so a map hit avoids the upstream
request that the basket-proposal contract describes as revalidation.

Application already runs under a process-local mutation lock, refreshes the
basket, compares reviewed fields, fails closed on drift, avoids mutation retries,
and reads the basket back. The fix must preserve those boundaries and the
existing request, timeout, and proposal-size limits.

## Goals / Non-Goals

**Goals:**

- Make the final product comparison depend on an upstream read started during
  application.
- Keep ordinary product discovery able to reuse previously observed objects.
- Prove no mutation is attempted when fresh lookup fails or returns changed
  details.
- Keep request growth deterministic and bounded.

**Non-Goals:**

- Designing the broader discovery cache, changing product ranking, or adding a
  persistent/local-first store.
- Changing proposal payloads, approval UX, mutation sequencing, quotas, or retry
  budgets.
- Exercising a live basket mutation as acceptance evidence.

## Decisions

### Add an explicit fresh lookup path

Give the client an authoritative exact-product operation that bypasses the
process-local product map but otherwise uses the existing bounded catalogue
search path and exact-ID check. The proposal service will use that operation only
for final additions and replacement comparisons.

This is preferable to clearing the entire map because clearing changes unrelated
discovery behavior and still leaves freshness implicit. It is preferable to a
TTL alone because even a very short TTL cannot guarantee that the apply-time
comparison was started after approval/application began.

### Preserve cached discovery behavior

Keep the existing general lookup semantics for planning and review preparation.
This avoids turning every internal reuse into another upstream request and keeps
the safety-related cost increase limited to approved apply attempts.

### Keep final reads sequential and bounded as today

Additions continue checking each of at most twenty reviewed lines before the
first mutation; replacement continues fetching its two products concurrently.
The existing read timeout and single bounded transport retry remain unchanged.
No new retry, background refresh, storage, or request fan-out is introduced.

### Verify through fakes, then deploy without a live mutation

Client tests will prove the fresh operation bypasses a populated map. Proposal
tests will distinguish cached and authoritative lookup calls and prove drift or
lookup failure prevents every mutation. Production verification will use exact
revision, health, OAuth metadata, and cheap/read-only probes; no basket mutation
is required or authorized.

## Risks / Trade-offs

- **Added apply latency and reads** → Limit new reads to approved apply attempts
  and retain the existing twenty-line, timeout, and retry bounds.
- **Upstream lookup unavailable after valid review** → Fail closed and require a
  new proposal; availability is less important than applying stale details.
- **Search-by-ID endpoint does not return an exact product** → Reject rather
  than falling back to the cached object.
- **Future caching work accidentally wraps the fresh path** → Name the client
  contract explicitly and retain a regression test that starts from a populated
  cache and requires another request.

## Migration Plan

1. Land the spec, client contract, proposal wiring, and regression tests together.
2. Verify strict OpenSpec validation, focused tests, root verification, and
   exact-head CI on `main`.
3. Coordinate with sibling work, deploy the exact verified revision disabled,
   run fail-closed checks, restore the prior enabled state for that same
   revision, and run health plus read-only acceptance checks.
4. Roll back to the recorded last-known-good Worker version if health or
   read-only acceptance fails; do not attempt a basket mutation for diagnosis.
