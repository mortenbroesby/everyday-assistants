## Why

The optional product picker is split between `src/picker` and `src/ui` even
though the latter exists only to support the picker and its repository
showcase. More importantly, proposed-basket review resolves each proposed and
alternative product through nested unbounded `Promise.all` calls. A cold
maximum-size review can therefore duplicate exact-product reads, start all
provider calls together, and leave sibling work running when authentication,
caller cancellation, or another fatal provider failure ends the attempt.

## What Changes

- Make `src/picker` the single feature boundary for the production picker,
  host frame, styles, contract, session adapter, product-review resolver, and
  synthetic showcase; remove the ambiguous `src/ui` folder.
- Raise proposed-basket review from five to the existing application-wide
  maximum of fifty ingredient decisions, without imposing a smaller visual
  grouping limit or dropping later decisions.
- Flatten and coalesce repeated proposed or alternative product IDs within one
  review request, resolve every unique ID with Effect at concurrency three,
  and reconstruct the unchanged ordered per-ingredient payload.
- Propagate caller cancellation, stop queued work on HTTP 401 or another fatal
  provider failure, and await active reads before the authenticated wrapper can
  retry. Keep an exact-product 404 local to the affected proposal or
  alternative.
- Expose the proven Effect coordinator as a small adjustable request-local read
  pool. Use it for read-only addition and replacement preparation as well as
  picker review, so exact-product batches cannot start unbounded work or overlap
  an authenticated retry.
- Consolidate the duplicate basket transport projection, calculate addition
  proposal totals in one pass over reviewed lines, and make planning output
  schemas the source of their TypeScript output types where this removes an
  existing parallel definition.

### Goal

Give the implemented picker and review flow one understandable feature
boundary and make every production multi-product read-only review efficient and
lifecycle-safe without changing product relevance, proposal authority, or
basket behavior.

### Non-goals

- No unbounded simultaneous provider traffic, live provider benchmark,
  cross-request cache, new retry, provider configuration, or dependency.
- No basket mutation, proposal-policy change, ranking change, UI redesign,
  indiscriminate Effect rewrite, or generic MCP registration framework.
- No process-global queue. The pool is request-local; cross-request fairness or
  dynamic autoscaling requires production evidence and a separate design.
- No removal of the fifty-line request envelope, which bounds payload, memory,
  provider work, and single-container cost. The review resolves all accepted
  decisions rather than limiting the total to the concurrency ceiling.

### Acceptance criteria

- A review accepts and returns up to fifty ingredient decisions in original
  order, with up to four alternatives per decision, and never drops later
  decisions merely to create visual groups.
- Repeated product IDs within one review perform one exact-product retrieval
  and independently retain their ingredient-specific relevance outcome.
- A maximum 250-reference fixture never exceeds three active provider reads;
  all unique reads eventually resolve unless the request terminates.
- HTTP 401, fatal provider failure, or caller cancellation stops queued work,
  waits for active abort-aware reads to settle, and leaves no outstanding work
  before failure or authenticated retry.
- Read-only addition preparation resolves up to fifty exact products through
  the same ordered pool, and addition or replacement review propagates caller
  cancellation without changing proposal payloads or authorization semantics.
- Product 404 remains local: a missing proposed product rejects that ingredient
  while a missing alternative is omitted; unrelated ingredients remain usable.
- The picker payload, safety filtering, display behavior, proposal consent,
  fresh pre-mutation revalidation, quotas, kill switch, and single-attempt
  mutation rules remain unchanged.
- Focused coordination, MCP, picker, proposal, and schema tests pass, followed
  by strict OpenSpec validation and the full repository verification gate.

### Epic and pull-request boundary

Deliver the complete refactor on `codex/refactor-picker-review`, created from
`cc964c94` on current `origin/main`, as one pull request. It is a
release-bearing Nemlig change because it raises the user-visible review batch
and changes hosted read coordination. Merge and deployment remain the existing
pull-request and production checkpoints.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-chatgpt-integration`: proposed-basket review accepts the established
  fifty-line request envelope, and multi-product read-only reviews coordinate
  exact-product reads with bounded request-local concurrency and quiescent
  cancellation.

## Impact

- Primary scope: `apps/nemlig-assistant/src/picker`, `src/mcp.ts`, the shared
  read-coordination boundary, proposal serialization/calculation, and focused
  tests.
- Folder moves update Vite/showcase imports and package checks but do not add a
  second UI or change the production picker resource URI.
- No credentials, provider state, basket state, external data, infrastructure,
  or production configuration is accessed or changed during implementation.
