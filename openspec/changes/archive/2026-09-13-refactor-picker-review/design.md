## Context

The server already uses Effect to coordinate whole-list catalogue discovery:
request-local retrievals are coalesced, catalogue concurrency is three, and a
fatal scope waits for abort-aware reads to settle. The proposed-basket picker
is a second concrete coordinated-read boundary, but it currently resolves up
to five proposed products plus four alternatives each through nested
`Promise.all`. `NemligClient.getProduct` has a completed-product cache, but
concurrent cold calls for the same ID can all miss that cache and start duplicate
provider searches.

The browser implementation is also split between `src/picker` and `src/ui`.
`AppFrame`, shared styles, and the showcase have no consumer outside the picker
feature, so the split communicates a reuse boundary that does not exist.

## Decisions

### Treat total capacity and simultaneous concurrency separately

Raise review capacity from five to the existing fifty-line application limit.
Each line may contain one proposed product and four alternatives, so the input
contract accepts at most 250 references. Coalesce those references by exact
product ID and eventually evaluate every accepted line in order.

Keep simultaneous provider reads at three. This is not a total-result limit:
later reads queue and run. It preserves the measured whole-list provider
pressure, prevents a single request from consuming all process and provider
capacity, and avoids amplifying a complete authenticated retry. Removing every
bound was rejected because Nemlig exposes no authoritative public concurrency
contract and this hosted service has explicit per-principal, global, and
single-container cost controls.

### Add a picker-specific functional core around the existing Effect boundary

Represent each review line as immutable proposed and alternative references.
Pure functions flatten references, construct the unique-ID/index mapping,
validate resolved products against each ingredient term, and reconstruct the
ordered picker payload. The Effect shell owns exact-product I/O, concurrency,
interruption, and error classification, and still exposes a plain Promise to
the MCP handler.

Reuse the established abort-aware Effect adapter rather than adding `p-limit`,
`p-map`, another package, or a second cancellation protocol. Generalize only
the minimum settled-read primitive now that two production callers need it;
keep planning-specific ordinary-failure semantics in product discovery and
picker-specific 404 semantics in picker review.

### Generalize the proven boundary into a request-local read pool

Three production paths now have the same lifecycle requirement: whole-list
planning, proposed-basket review, and exact-product proposal preparation. Keep
Effect at those orchestration edges and expose an ordered `runReadPool` with an
adjustable positive concurrency value, caller cancellation, and an explicit
quiescence guarantee. The pool is request-local and defaults to three; it is
not a process-global scheduler, cache, rate limiter, or provider policy.

Use the pool for the up-to-fifty product reads in addition preparation and the
two product reads in replacement preparation. Pass the MCP caller signal to
all read-only proposal preparation methods, including single basket reads. Keep
the apply path outside the pool: fresh validation and basket writes deliberately
remain sequential and non-retried because parallel or cancellable mutation work
would weaken the existing indeterminate-result safety boundary.

The broader inventory intentionally leaves direct code in place when Effect has
no demonstrated benefit:

| Path | Decision | Reason |
| --- | --- | --- |
| Whole-list product discovery | Keep Effect scope | Basket plus bounded catalogue reads, timeout, cancellation, retry quiescence |
| Proposed-basket review | Use read pool | Up to 250 coalesced exact references with local 404 semantics |
| Addition and replacement preparation | Use read pool | Up to 50 exact reads, or a fatal sibling pair, before authenticated retry |
| Single catalogue, basket, favourite, and department reads | Keep direct Promise | No sibling work to schedule or drain |
| Principal storage listing | Keep direct Promise batch | Maximum 15, no abortable provider contract, unrelated storage semantics |
| Pre-mutation validation and basket writes | Keep sequential Promise | Consent, fresh validation, and indeterminate mutation safeguards |
| Deployment checks and historical native benchmark | Keep direct Promise | Local independent checks or an intentional comparison baseline |

### Keep failures local only when the contract says they are local

An exact 404 means one referenced product disappeared. A missing proposed
product rejects its ingredient; a missing alternative is omitted. HTTP 401,
caller cancellation, and other provider failures end the entire attempt so the
existing authenticated wrapper can respond consistently. The coordinator must
finish interrupting active reads before it rejects, preventing abandoned work
from overlapping the one allowed authenticated retry.

### Make the picker one feature island

Move the host frame, production stylesheet, showcase entry, and showcase
stylesheet into `src/picker`. Rename `AppFrame` to `PickerFrame`. Keep the
production entry, reusable view, schema contract, host session adapter, and
server-side review resolver together because they implement one optional MCP
App. Do not reorganize unrelated flat server modules or create generic
component, domain, service, and adapter directories.

### Consolidate only proven duplication

Move the repeated Basket-to-MCP snake-case projection to one domain-adjacent
helper used by both MCP display and proposal results. Combine the two
`prepareAdditions` delta reductions into one pass backed by a basket-line map.
Where the shopping-plan TypeScript output model exactly duplicates its Zod
schema, infer the type from the schema; retain distinct schemas at trust or
browser bundle boundaries.

The proposal state machine, local Maps used for efficient indexing, picker
contract validation, relevance/ranking logic, and pure plan calculator remain
explicit. Replacing them with generic functional abstractions was rejected.

## Risks / Trade-offs

- Large reviews may take longer at concurrency three. They complete without
  dropping decisions, and cancellation remains prompt; tests measure total
  completion and quiescence rather than promising provider latency.
- A generic read helper could become an abstraction magnet. Keep it limited to
  ordered abort-aware Promise reads; do not add global queue state, priorities,
  retries, caching, adaptive tuning, or mutation support without measurements.
- Moving CSS and entries can break the single-file picker bundle. Existing
  package, CSP, smoke, and local showcase checks remain mandatory.
- Consolidating proposal calculations could weaken exact totals if semantics
  drift. Add characterization tests first and keep the resulting review payload
  byte-for-byte equivalent for representative baskets.

## Migration Plan

1. Add failing focused tests for fifty decisions, 250 references, duplicate
   coalescing, maximum active reads, local 404s, fatal cancellation, and retry
   quiescence.
2. Extract the smallest shared abort-aware Effect primitive and ordered read
   pool, then implement the picker review functional core plus coordinated shell.
3. Delegate the MCP handler to the new resolver and raise schemas/instructions
   from five to fifty while preserving payload order and shape.
4. Route read-only addition and replacement preparation through the pool,
   propagate caller cancellation, then consolidate basket projection, addition
   calculations, and exact duplicate plan schema/type ownership under
   characterization coverage.
5. Move all picker/showcase UI files into `src/picker`, update imports and build
   checks, and verify production and showcase rendering.
6. Run focused tests, strict OpenSpec, privacy/package checks, and `pnpm verify`;
   decide version and release note from the final diff, then commit, push, and
   open one pull request without merging it.

## Open Questions

- Nemlig has no public supported contract for maximum simultaneous calls to the
  private catalogue endpoints. Concurrency three therefore remains the current
  safe operational value and can be raised later only with provider-backed or
  production telemetry evidence and the same cost safeguards.
- Cross-request fairness and automatic concurrency scaling remain unanswered.
  Introduce a process-global queue only if production telemetry demonstrates
  contention or starvation that request-local bounded pools cannot address.
