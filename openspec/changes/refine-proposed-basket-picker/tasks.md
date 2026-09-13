## 1. Characterize the Complete Review

- [ ] 1.1 Add a picker rendering fixture containing favourite, non-favourite, high-confidence, low-confidence, no-alternative, and rejected items; verify current selected cards fail the compact always-visible contract.
- [ ] 1.2 Add MCP metadata and structured-result assertions that every supplied proposed item reaches one review payload and non-favourite guidance requests useful already-discovered alternatives when available.
- [ ] 1.3 Preserve focused choice-message tests for one deliberate send, pending duplicate prevention, failure recovery, stale completion, and no basket-tool invocation.

## 2. Implement the Compact Proposed Basket

- [ ] 2.1 Refactor the existing product card into a compact selected-row presentation without adding a second renderer, and verify image fallback, product identity, package, price, and requested quantity remain visible.
- [ ] 2.2 Present confidence and favourite provenance as clear accessible badges on each selected row, and verify non-favourites are not mislabeled or hidden.
- [ ] 2.3 Keep populated description, declaration, item details, and alternatives behind semantic disclosure controls; verify empty sections are omitted and every selected summary remains visible while disclosures open and close.
- [ ] 2.4 Update server and tool guidance to include every selected item in one review and retain useful discovered alternatives for non-favourites regardless of confidence, without adding provider reads or changing schemas.

## 3. Verify and Deliver

- [ ] 3.1 Update the synthetic showcase and README feature description, then verify narrow and wide layouts, keyboard disclosure, text resizing, contrast, and absence of horizontal or nested scrolling.
- [ ] 3.2 Run focused picker, contract, MCP-interface, cancellation, package, and smoke checks plus strict OpenSpec validation; verify conversational fallback and every basket authorization/fresh-validation/no-retry safeguard remain green.
- [ ] 3.3 Refresh affected jCodeMunch files, review the final diff for secrets, extra provider traffic, unsafe markup, hidden products, or unjustified abstractions, then run final `pnpm verify` once.
- [ ] 3.4 Apply the required release identity near merge, reconcile latest `origin/main`, commit and push the epic, verify exact-head PR CI, squash merge through repository rules, and verify exact integrated-main CI and protected deployment evidence.
