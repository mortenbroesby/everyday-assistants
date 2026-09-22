## 1. Product hydration

- [x] 1.1 Add failing tests for ordered unique search-result enrichment, detail parity, bounded concurrency, and explicit per-item failure status; verify the focused product-discovery test fails for the current shallow path.
- [x] 1.2 Implement request-local detailed search enrichment using existing search/exact lookup/cache/cancellation seams; verify focused product-discovery tests pass without real credentials.
- [x] 1.3 Add cache, authentication, cancellation, deadline, limit, and missing-field regression coverage; verify request counts and failure outcomes are explicit.

## 2. Shared product presentation

- [x] 2.1 Define a display-only product view model and adapters for product, basket, review, and partial-result contexts; verify unknown fields and unsafe images/text are handled safely.
- [ ] 2.2 Add one packaged reusable product presentation resource and headless structured/text fallback after the issue-72 adapter boundary is available; verify resource inventory and zero render-triggered provider calls.
- [ ] 2.3 Add accessibility, missing-image, partial/error, and context-isolation tests; verify no proposal, basket, or durable selection state is created by rendering.

## 3. Planner retirement and MCP integration

- [ ] 3.1 Coordinate and rebase onto the tested issue-72 MCP v2 integration point; verify the shared transport files remain conflict-free and the current branch contains the exact integration base.
- [ ] 3.2 Remove planner registrations, automatic-authority production, planner-only schemas/formatting/modules, and stale callers after tracing retained imports; verify planner-only tools are absent while direct search, product details, basket, review, and apply remain advertised.
- [ ] 3.3 Preserve and extend proposal safety tests for exact review binding, principal scope, expiry, fresh product/basket checks, replay, changed intent, and indeterminate writes; verify the retained write boundary passes.

## 4. Contract and delivery

- [ ] 4.1 Reconcile README, backlog, OpenSpec, package/resource policy, and synthetic fixtures with the delivered behavior; verify strict OpenSpec/privacy checks pass.
- [ ] 4.2 Run focused app build/check/smoke tests and inspect the final diff for secrets, stale planner references, and scope creep; verify all relevant focused checks pass.
- [ ] 4.3 Run the final `pnpm verify` once on the final candidate, commit checkpoint/final changes, push the dedicated branch, and verify the PR exact head and required CI.
- [ ] 4.4 Integrate through repository rules, verify remote `main` contains the exact intended commit and exact-head CI succeeds, then report remaining live/provider uncertainty without claiming production deployment.
