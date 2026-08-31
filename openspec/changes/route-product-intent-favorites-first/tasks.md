## 1. Intent Routing

- [x] 1.1 Update the existing MCP server instructions and current tool descriptions so ordinary find-or-add requests use `plan_shopping_list`, explicit catalog searches use `search_products`, and explicit favorite browsing uses `list_favorites`; verify no new tool or mutation path is introduced.
- [x] 1.2 Add one focused MCP contract test for the routing guidance and verify existing candidate ambiguity, planner fallback, and read-only annotations still pass.

## 2. Documentation and Release

- [x] 2.1 Reconcile the favorites-first backlog entry with the implemented routing while retaining the deferred real-example questions for substantial price differences and incomparable units; verify hosted-service and basket-safety boundaries are unchanged.
- [x] 2.2 Run the read-only Nemlig release plan, apply any required alpha version bump, and verify `pnpm --filter nemlig-assistant check:version-bump --base origin/main` accepts the runtime diff.

## 3. Verification and Delivery

- [x] 3.1 Run `pnpm exec openspec validate route-product-intent-favorites-first --strict --no-interactive` and the focused Nemlig tests, confirming no live Nemlig account or basket is contacted.
- [x] 3.2 Run `pnpm verify`, review the final diff against every delta-spec scenario, commit the scoped change to `main`, push it, and verify `origin/main` resolves to the delivered commit.
