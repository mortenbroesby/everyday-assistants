## 1. Characterize the Complete Review

- [ ] 1.1 Add a picker rendering fixture containing favourite, non-favourite, high-confidence, low-confidence, no-alternative, and rejected items; verify every selected row is compact, visible, and unchecked by default.
- [ ] 1.2 Add MCP metadata and structured-result assertions that every supplied proposed item reaches one review payload and non-favourite guidance requests useful already-discovered alternatives when available.
- [ ] 1.3 Add focused lifecycle tests for checked-line expansion, local alternative selection, one deliberate catalogue-search message, one consolidated final-review message, pending duplicate prevention, failure recovery, stale completion, and no provider or basket-tool invocation.

## 2. Implement the Compact Proposed Basket

- [ ] 2.1 Refactor the existing product card into a compact selected-row presentation without adding a second renderer, and verify image fallback, product identity, package, price, and requested quantity remain visible.
- [ ] 2.2 Present confidence and favourite provenance as clear accessible badges on each selected row, and verify non-favourites are not mislabeled or hidden.
- [ ] 2.3 Add one native unchecked review checkbox per row; when checked, expose populated evidence, local alternative choice, and a bounded ingredient-scoped catalogue-search input while leaving the summary visible.
- [ ] 2.4 Initialize local choices from assistant selections and add one final action that sends every ingredient, chosen product ID, and quantity through the existing host message boundary.
- [ ] 2.5 Preserve pending, duplicate-send, stale-completion, recoverable-failure, and no-automatic-retry behavior for catalogue search and final review.
- [ ] 2.6 Update server and tool guidance to include every selected item in one review and retain useful discovered alternatives for non-favourites regardless of confidence, without adding provider reads or changing schemas.

## 3. Verify and Deliver

- [ ] 3.1 Update the synthetic showcase and README feature description, then verify narrow and wide layouts, native checkbox and keyboard operation, text resizing, contrast, and absence of horizontal or nested scrolling.
- [ ] 3.2 Run focused picker, contract, MCP-interface, cancellation, package, and smoke checks plus strict OpenSpec validation; verify conversational fallback and every basket authorization/fresh-validation/no-retry safeguard remain green.
- [ ] 3.3 Refresh affected jCodeMunch files, review the final diff for secrets, extra provider traffic, unsafe markup, hidden products, duplicated exploration abstractions, or unjustified dependencies, then run final `pnpm verify` once.
- [ ] 3.4 Apply the required release identity near merge, reconcile latest `origin/main`, commit and push the epic, verify exact-head PR CI, squash merge through repository rules, and verify exact integrated-main CI and protected deployment evidence.
