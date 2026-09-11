## 1. Prove the intended discovery behavior

- [ ] 1.1 Add focused failing tests that require recipe instructions to use separate short `find_groceries` searches, refine unsuitable results, consult favourites below 80% confidence, and avoid current-basket inspection during planning.
- [ ] 1.2 Add focused failing tests for proposed-basket validation: confidence must be 0–100, product identifiers must resolve, alternatives expand below 80%, and one actionable group contains no more than five items.
- [ ] 1.3 Add a focused failing suitability case where an unrelated catalogue result remains visible but cannot become the proposed product without matching evidence.

## 2. Make individual discovery the normal path

- [ ] 2.1 Update MCP instructions and tool descriptions so ordinary recipe shopping uses one short search per ingredient and may refine through additional bounded calls; retain `plan_my_shopping` for explicit batch compatibility.
- [ ] 2.2 Guide ChatGPT to provide one proposed product, package quantity, evidence, and match confidence per ingredient; below 80%, consult existing favourites and include meaningful alternatives.
- [ ] 2.3 State pantry assumptions explicitly and ensure the recipe-planning path neither calls nor presents current basket contents.

## 3. Add the proposed-basket review

- [ ] 3.1 Add the smallest read-only proposed-basket tool contract using existing product metadata and a maximum of five actionable entries per view.
- [ ] 3.2 Extend the existing MCP App view to show the chosen product, image, description, size, quantity, price, unit price, confidence, and collapsed alternatives; expand alternatives below 80%.
- [ ] 3.3 Return alternative selections to the conversation without storing a draft or calling basket mutation tools, and provide a compact final proposed-basket view after choices settle.

## 4. Preserve exact basket mutation safety

- [ ] 4.1 Route the settled product identifiers and quantities through the existing `review_items_to_add` contract; verify a product or quantity outside the reviewed set is rejected.
- [ ] 4.2 Preserve fresh product validation, same-run authorization, basket fingerprint checks, single-attempt mutation, and verified readback.

## 5. Add the representative smoke gate

- [ ] 5.1 Extend the credentials-free smoke suite with a mixed recipe scenario covering short searches, an uncertain favourite, an unrelated result, package quantity, grouped choices, pantry assumptions, final proposal, exact review, apply, and readback.
- [ ] 5.2 Prove the smoke rejects authorization drift and does not retry a simulated write failure.

## 6. Verify and document

- [ ] 6.1 Update Nemlig user-facing documentation and package prerelease version; document that favourites are read-only evidence and favourite mutation is a separate explicitly approved follow-up.
- [ ] 6.2 Run focused tests, `pnpm --filter nemlig-assistant smoke`, root `pnpm verify`, strict OpenSpec validation, package checks, and the credentials-free production-readiness gate.
- [ ] 6.3 Confirm the change adds no storage, dependency, paid service, retry loop, Container, or weakened quota/breaker/kill-switch boundary.

## 7. Deliver and accept

- [ ] 7.1 Commit and push the scoped branch, open a pull request, and verify exact-head CI before merge.
- [ ] 7.2 Merge through the protected pull-request path and verify the production deployment reports the merged revision.
- [ ] 7.3 Run two fresh read-only ChatGPT recipe acceptances: one under twenty products with grouped visual choices and one larger proposal with confident items compact; record any live basket mutation as a separate explicit approval.
