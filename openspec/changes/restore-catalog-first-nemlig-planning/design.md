## Context

See `proposal.md` for motivation. Live read-only reproduction showed `show_my_favorites("Kakao Crunchers")` returning one product while ordinary planning for `7-Morgen Kakao Crunchers` returned zero candidates and `no_eligible_candidate`. The planner currently downloads up to 1,000 favourites before ordinary catalogue fallback, exact review re-searches products whose IDs were already returned, optional search failures collapse to empty JSON, and the hosted path combines two 8-second upstream attempts with a 25-second backend ceiling.

The service must remain bounded, but the user's requirement is only to prevent an indefinite or several-minute wait—not to reject normal slow catalogue work after a few seconds. Basket mutations remain single-attempt and separately approval-gated.

## Goals / Non-Goals

**Goals:**

- Make ordinary planning use the live catalogue without an automatic favourites fetch.
- Preserve explicit favourite browsing and selection as a separate user-directed path.
- Reuse exact products already discovered by the current process and honour explicit product IDs.
- Keep failed discovery distinct from a genuine empty catalogue result.
- Bound the complete hosted interaction generously without aggressive nested read failures.

**Non-Goals:**

- Fuzzy auto-selection, unbounded retries, background jobs, mutation retries, basket changes, or broader Cloudflare capacity.

## Decisions

### 1. Ordinary planning is catalogue-first and favourites are explicit

`plan_my_shopping` will call current catalogue search for every line and will not load the favourites pool. `show_my_favorites` remains the explicit favourites surface. If a user selects a favourite returned by that tool, its exact product ID is passed into planning or review like any other explicit candidate.

This replaces automatic favourites fallback rather than merely changing ranking: avoiding the large authenticated favourites scan is both the requested behavior and the most direct latency reduction.

### 2. Cache complete discovered products in process

The client will retain the normalized product object, keyed by product ID, whenever catalogue, favourite, or department discovery returns it. Exact lookup will return that current cached object before attempting another upstream search. The cache is process-local, owner-private, bounded to the existing discovery ceilings, and disappears with the Container.

This avoids the observed failure where a valid returned favourite cannot later be reviewed because numeric or differently worded search fails. If the process has restarted, exact lookup still performs bounded current upstream resolution and fails closed if the product cannot be revalidated.

### 3. Preserve search failure as a separate planner outcome

Primary catalogue failures will not be swallowed into an empty response. The planner will catch per-line failures so other lines can still resolve, but it will label the affected line `discovery_unavailable`; only a successful empty result becomes `no_eligible_candidate`.

### 4. Use a generous outer deadline and non-aggressive upstream bound

Production will use a 90-second total request ceiling and an 85-second backend ceiling. Auth0 and short control-plane boundaries remain independently bounded because they are not implicated in product discovery and otherwise can consume the entire request before work begins. Nemlig reads return to a 30-second per-attempt ceiling with at most one retry; this bound exists because Container-side upstream fetches do not reliably inherit the Worker's cancellation after the caller-visible response ends.

The maximum caller-visible wait remains 90 seconds—well below several minutes—while a normal slow read has almost four times the current attempt budget. Mutation calls remain one attempt and retain uncertainty handling. The one-Container maximum, daily quotas, rate limits, breaker, sleep policy, and kill switch are unchanged, so the longer exceptional request window does not create parallel capacity or a material cost increase.

## Risks / Trade-offs

- [A genuinely stalled call can now take up to 90 seconds] → Keep the privacy-safe terminal event and correlation ID so the boundary is visible, and retain immediate dynamic disable.
- [Catalogue-first results may differ from saved household favourites] → Use favourites only when the user asks, and preserve explicit exact selection.
- [A cached product may become stale during one Container lifetime] → Proposal application still revalidates basket state; a Container restart clears the cache, and discovery remains bounded.
- [Two slow read attempts can consume most of the backend window] → Permit only one retry for reads and never retry mutations.

## Migration Plan

1. Update planner, exact product lookup, error outcomes, tool guidance, configuration, and focused tests.
2. Run strict OpenSpec validation, `pnpm verify`, privacy checking, and production readiness.
3. Commit and push the exact implementation and verify exact-head CI.
4. With explicit production authority, deploy disabled first, prove both routes fail closed and the Container is inactive, then enable the same revision.
5. Reproduce catalogue planning and exact selected-product review read-only through the existing ChatGPT app. Disable or roll back if latency, error classification, authentication, or safety acceptance fails.
