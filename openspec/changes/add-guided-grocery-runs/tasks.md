## 1. P0 Plan Model and Resolution

- [ ] 1.1 Add the 1-20 line guided-plan schemas and pure constraint/preference ordering in `src/plans.ts`; verify focused tests cover invalid whole-request rejection, missing constraint data, deterministic ties, and no implicit selection.
- [ ] 1.2 Resolve all lines from one favorites fetch with catalog fallback only for unmatched lines and at most three concurrent fallbacks; verify synthetic tests cover favorites-first behavior, mixed sources, per-line failure, the candidate cap, and no basket/proposal calls.
- [ ] 1.3 Add exact-ID basket-gap and selected-total calculation; verify tests cover absent, partial, complete, over-complete, and unresolved selections without removal or mutation.

## 2. P0 Conversational and Picker Flow

- [ ] 2.1 Register `plan_shopping_list` with complete structured output, accurate read-only annotations, authenticated favorites/basket reuse, and sanitized errors; verify MCP tests cover 1-20 lines, metadata, ambiguity, and zero mutation calls.
- [ ] 2.2 Extend planning candidates with source, dietary/discount flags, constraint outcomes, preference tags, basket coverage, and resolution state while preserving existing search/favorites output compatibility; verify interface snapshots for both old and new tools.
- [ ] 2.3 Extend the shared MCP Apps resource with keyboard-accessible multi-line candidate selection and quantity controls while preserving the single-query picker; verify DOM/source checks cover native controls, unresolved lines, exact IDs, and no direct mutation tool name.
- [ ] 2.4 Connect the guided workspace to one `prepare_cart_additions` call and a separately activated `apply_cart_additions` call; verify synthetic MCP Apps tests cover exact batch review, expiry display, pending host approval, changed proposal refusal, and verified basket readback.

## 3. P1 Discovery, Deals, and Basket Awareness

- [ ] 3.1 Add safe top-level department discovery and returned-ID validation to the client; verify fixtures cover current departments, malformed content, duplicate IDs, and rejection of arbitrary or cross-origin paths.
- [ ] 3.2 Add bounded one-based department paging with normalized products and explicit next-page state; verify tests cover page boundaries, limit validation, empty/final pages, product deduplication, and the 1,000-product ceiling.
- [ ] 3.3 Add paginated authenticated favorites retrieval across product groups while preserving current `listFavorites` defaults and favorites search; verify tests cover cross-group offsets, duplicates, later pages, empty/final pages, and the bounded ceiling.
- [ ] 3.4 Register read-only `list_departments` and `browse_department` MCP tools and add `departments`, `browse`, and optional favorites `--page` CLI surfaces; verify help/interface tests, accurate annotations, normalized results, and no basket calls.
- [ ] 3.5 Integrate department candidates, discount/unit-price preferences, and exact basket-gap fields into guided results; verify a mixed synthetic plan remains deterministic and prepares only selected positive remaining quantities.

## 4. P2 Immutable Plan Snapshots

- [ ] 4.1 Implement versioned immutable snapshot save/load under owner-only local Nemlig storage using exclusive create and schema validation; verify tests cover `0700`/`0600` permissions, UUID/path traversal rejection, no overwrite, malformed data, and sanitized errors.
- [ ] 4.2 Register `save_shopping_plan` and `load_shopping_plan` with accurate local-write/read-only annotations; verify MCP tests prove snapshots contain only structured inputs/selections and neither tool authenticates, contacts Nemlig, prepares, or applies a mutation.
- [ ] 4.3 Re-resolve loaded snapshots through `plan_shopping_list` rather than persisting candidates, prices, proposals, or basket data; verify changed synthetic price/availability/basket fixtures appear after resume while the saved file remains unchanged.

## 5. Compatibility, Documentation, and Release

- [ ] 5.1 Update tool lists, output schemas, CLI help, package smoke checks, and MCP Apps-disabled behavior for the additive interfaces; verify existing single-product CLI/MCP/proposal tests still pass unchanged.
- [ ] 5.2 Update the Nemlig README and operating guidance with ChatGPT-first planning, departments, snapshots, the multi-line picker, alpha-test steps, and the unchanged exact approval boundary; verify public-tree checks find no local path, credential, prompt, plan, or basket data.
- [ ] 5.3 Run the read-only Nemlig release plan, apply the required feature version bump, and verify `pnpm --filter nemlig-assistant check:version-bump --base origin/main` accepts the final runtime diff.

## 6. Verification and Delivery

- [ ] 6.1 Run `pnpm exec openspec validate add-guided-grocery-runs --strict --no-interactive` and all focused Nemlig tests, confirming fixtures never contact a live account or mutate a real basket.
- [ ] 6.2 Run `pnpm verify` from the repository root and resolve every failure without weakening the guided-shopping or proposal requirements.
- [ ] 6.3 Review the final diff requirement-by-requirement, commit the completed scoped change to `main`, push it, and verify `origin/main` resolves to the delivered commit.
- [ ] 6.4 Hand off a concise owner alpha exercise covering login, whole-list planning, ambiguity, departments, save/resume, picker batch review, and an optional separately approved exact basket addition; record any live discrepancy as follow-up work rather than bypassing safety checks.
