## 1. Prove the intended discovery behavior

- [x] 1.1 Add focused failing tests that require recipe instructions to use separate short `find_groceries` searches, refine unsuitable results, consult favourites below 80% confidence, and avoid current-basket inspection during planning.
- [x] 1.2 Add focused failing tests for proposed-basket validation: confidence must be 0–100, product identifiers must resolve, alternatives expand below 80%, and one actionable group contains no more than five items.
- [x] 1.3 Add a focused failing suitability case where an unrelated catalogue result remains visible but cannot become the proposed product without matching evidence.

## 2. Make individual discovery the normal path

- [x] 2.1 Update MCP instructions and tool descriptions so ordinary recipe shopping uses one short search per ingredient and may refine through additional bounded calls; retain `plan_my_shopping` for explicit batch compatibility.
- [x] 2.2 Guide ChatGPT to provide one proposed product, package quantity, evidence, and match confidence per ingredient; below 80%, consult existing favourites and include meaningful alternatives.
- [x] 2.3 State pantry assumptions explicitly and ensure the recipe-planning path neither calls nor presents current basket contents.

## 3. Add the proposed-basket review

- [x] 3.1 Add the smallest read-only proposed-basket tool contract using existing product metadata and a maximum of five actionable entries per view.
- [x] 3.2 Extend the existing MCP App view to show the chosen product, image, description, size, quantity, price, unit price, confidence, and collapsed alternatives; expand alternatives below 80%.
- [x] 3.3 Return alternative selections to the conversation without storing a draft or calling basket mutation tools, and provide a compact final proposed-basket view after choices settle.

## 4. Preserve exact basket mutation safety

- [x] 4.1 Route the settled product identifiers and quantities through the existing `review_items_to_add` contract; verify a product or quantity outside the reviewed set is rejected.
- [x] 4.2 Preserve fresh product validation, same-run authorization, basket fingerprint checks, single-attempt mutation, and verified readback.

## 5. Add the representative smoke gate

- [x] 5.1 Extend the credentials-free smoke suite with a mixed recipe scenario covering short searches, an uncertain favourite, an unrelated result, package quantity, grouped choices, pantry assumptions, final proposal, exact review, apply, and readback.
- [x] 5.2 Prove the smoke rejects authorization drift and does not retry a simulated write failure.

## 6. Verify and document

- [x] 6.1 Update Nemlig user-facing documentation and package prerelease version; document that favourites are read-only evidence and favourite mutation is a separate explicitly approved follow-up.
- [x] 6.2 Run focused tests, `pnpm --filter nemlig-assistant smoke`, root `pnpm verify`, strict OpenSpec validation, package checks, and the credentials-free production-readiness gate.
- [x] 6.3 Confirm the change adds no storage, dependency, paid service, retry loop, Container, or weakened quota/breaker/kill-switch boundary.

## 7. Deliver and accept

- [x] 7.1 Commit and push the scoped branch, open a pull request, and verify exact-head CI before merge.
- [x] 7.2 Merge through the protected pull-request path and verify the production deployment reports the merged revision.
- [ ] 7.3 Run two fresh read-only ChatGPT recipe acceptances: one under twenty products with grouped visual choices and one larger proposal with confident items compact; record any live basket mutation as a separate explicit approval.

## 8. Remove the live authentication race

- [x] 8.1 Reproduce parallel read-only searches starting overlapping fresh logins on the shared principal client.
- [x] 8.2 Coalesce only overlapping login attempts per client while preserving fresh pre-authentication and one 401 retry.
- [ ] 8.3 Deploy the fix and repeat the fresh read-only ChatGPT acceptances without a visible authentication error.

## 9. Make the reviewed proposal the only visual path

- [x] 9.1 Reproduce the production mismatch where the legacy raw chooser remains exposed while the reviewed-basket tool is blocked at the gateway, and capture the dark-theme contrast failure.
- [x] 9.2 Retire the raw chooser, expose `review_proposed_basket` through the maintained HTTP and service paths, and render readable light and dark themes.
- [ ] 9.3 Run focused and full verification, merge and deploy through the protected PR path, then repeat both fresh read-only ChatGPT recipe acceptances.

## 10. Prevent proposal retry storms

- [x] 10.1 Reproduce a live ChatGPT run where fractional confidence and one mismatched line fail whole proposal groups and leave many error widgets.
- [x] 10.2 Normalize fractional confidence and return valid choices plus identified rejected lines without weakening the unrelated-product guard.
- [x] 10.3 Treat a product that disappears between search and review as an identified rejected line while preserving valid choices and propagating real service failures.
- [ ] 10.4 Verify, deploy, refresh the ChatGPT app, and repeat both read-only recipe acceptances without a proposal retry storm.
