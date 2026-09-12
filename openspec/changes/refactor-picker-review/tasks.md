## 1. Characterize Current Behavior

- [x] 1.1 Add focused tests for ordered proposed-basket output, local proposed
  and alternative 404 handling, fatal failure identity, and no basket access.
- [x] 1.2 Add deterministic abort-aware product readers that record starts,
  active count, interruptions, settlements, and retry overlap.
- [x] 1.3 Add failing fixtures for fifty decisions, 250 references, duplicate
  IDs, concurrency, caller cancellation, and HTTP 401 quiescence.

## 2. Coordinate Picker Review Reads

- [x] 2.1 Extract the minimum shared abort-aware Effect adapter from product
  discovery without changing whole-list planning behavior.
- [x] 2.2 Implement pure picker reference flattening, exact-ID coalescing,
  per-ingredient relevance evaluation, and ordered output reconstruction.
- [x] 2.3 Implement the bounded Effect product-read scope at concurrency three;
  preserve local 404 behavior and make other fatal failures quiescent.
- [x] 2.4 Delegate the MCP handler to the new resolver, propagate the caller
  signal, and verify an authenticated retry never overlaps the first attempt.
- [x] 2.5 Raise proposed-basket input/output capacity from five to fifty and
  update server guidance so accepted decisions are not artificially grouped or
  dropped.
- [x] 2.6 Promote the settled-read boundary into a small ordered pool with
  adjustable positive concurrency and characterization tests.
- [x] 2.7 Route addition and replacement preparation through the pool, pass the
  caller signal through every read-only proposal review, and verify fatal reads
  settle before authenticated retry.

## 3. Apply Focused Functional Cleanup

- [x] 3.1 Consolidate Basket-to-MCP serialization and verify all basket,
  proposal, and apply payloads remain unchanged.
- [x] 3.2 Build one basket-line index and calculate addition price/count deltas
  in one pass while preserving exact proposal totals and validation order.
- [x] 3.3 Remove exact plan output type/schema duplication where Zod can remain
  the single source without crossing a trust or browser-bundle boundary.

## 4. Consolidate the Picker Feature

- [x] 4.1 Move the host frame, production styles, showcase entry, and showcase
  styles from `src/ui` into `src/picker`; rename the frame for its actual scope.
- [x] 4.2 Update entry imports, tests, build checks, and documentation without
  changing `ui://nemlig/picker.html` or its CSP contract.
- [x] 4.3 Verify the production picker and synthetic showcase at narrow and wide
  viewports with folded alternatives, separate islands, and no overflow.

## 5. Verify and Deliver the Epic

- [x] 5.1 Run focused coordination, MCP, proposal, picker, plan, and smoke tests,
  then strict OpenSpec validation and privacy checks.
- [x] 5.2 Run the final `pnpm verify`, packed-package smoke, and Cloudflare dry
  run once against the final candidate.
- [x] 5.3 Review the diff for secrets, accidental behavior changes, unjustified
  abstraction, cost amplification, and retained mutation safeguards.
- [ ] 5.4 Apply the package version policy and agent-written release note,
  commit and push the epic, open one pull request, and verify exact-head CI.
- [x] 5.5 Leave merge, publication, deployment, and any live provider or basket
  acceptance at their existing human and production checkpoints.
