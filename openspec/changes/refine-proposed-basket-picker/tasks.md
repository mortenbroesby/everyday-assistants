## 1. Characterize the Approved Flow

- [ ] 1.1 Add strict picker contract fixtures for complete proposal, focused choices, and final recap payloads, including favourite, non-favourite, changed, no-alternative, and rejected lines.
- [ ] 1.2 Add focused rendering and lifecycle tests for compact rows, native radio groups, one consolidated replacement message, one explicit basket-approval message, pending duplicate prevention, failure recovery, stale completion, and no provider or basket invocation.
- [ ] 1.3 Add MCP assertions that the tool guidance preserves unchallenged selections, requests focused choices only for challenged ingredients, and routes final approval through `review_items_to_add` and `add_approved_items`.

## 2. Implement the Conversational Shopping Flow

- [ ] 2.1 Extend the existing strict payload with minimal presentation and changed-line metadata without adding a tool, resource, endpoint, dependency, or client-owned workflow store.
- [ ] 2.2 Refine the existing product card into one responsive compact row with larger image, exact identity, brand, package, package count, price, favourite provenance, confidence, and populated evidence disclosures.
- [ ] 2.3 Render the complete proposal with conversational correction guidance and no review checkbox, search input, status column, or hidden selected product.
- [ ] 2.4 Render challenged ingredients as native radio groups; keep replacements local and send one bounded consolidated host message while preserving pending, duplicate, stale-completion, failure recovery, cancellation, and no-retry behavior.
- [ ] 2.5 Render the full final recap, mark only changed lines, and send one `Add to Nemlig basket` approval handoff into the existing protected write flow without direct mutation.
- [ ] 2.6 Update server instructions and conversational fallback for the full stage sequence without changing ranking, provider reads, public tool names, or basket safeguards.

## 3. Verify and Deliver

- [ ] 3.1 Update the synthetic showcase and README feature description; verify narrow and wide layouts, keyboard radio operation, text resizing, contrast, image fallback, and absence of horizontal or nested scrolling.
- [ ] 3.2 Run focused picker, contract, MCP-interface, cancellation, package, and smoke checks plus strict OpenSpec validation; verify every authorization, fresh-validation, single-use, readback, and no-retry safeguard remains green.
- [ ] 3.3 Refresh affected jCodeMunch files, review the final diff for secrets, extra provider traffic, unsafe markup, hidden products, duplicated abstractions, or unjustified dependencies, then run final `pnpm verify` once.
- [ ] 3.4 Apply the required release identity near merge, reconcile latest `origin/main`, commit and push the epic, verify exact-head PR CI, squash merge through repository rules, and verify exact integrated-main CI and any policy-selected protected deployment evidence.
