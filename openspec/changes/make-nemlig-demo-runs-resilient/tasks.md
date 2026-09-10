## 1. Prove the selection failure

- [ ] 1.1 Add focused failing cases for ordinary close alternatives, requested amounts requiring multiple packages, explicit choice, and an unavailable preferred brand; verify the new cases fail for the expected current behavior before production edits.

## 2. Make automatic selection practical

- [ ] 2.1 Update the shared automatic-candidate decision to select the first deterministically ranked eligible ordinary candidate while preserving explicit choice, preferred-brand, amount-evidence, availability, relevance, and hard-constraint boundaries; verify the focused planning tests pass.
- [ ] 2.2 Add `ranked_default` to the existing plan result contract and MCP schema where needed; verify interface/schema tests accept the new reason and reject unknown reasons.

## 3. Add the recipe-scale smoke gate

- [ ] 3.1 Extend the existing credentials-free smoke suite with one in-memory MCP run of at least twenty mixed lines covering ordinary alternatives, multiple-package amounts, explicit brand, incompatible data, existing basket coverage, explicit choice, exact same-run authorization, proposal apply, and readback; verify `pnpm --filter nemlig-assistant smoke` passes.
- [ ] 3.2 Prove the smoke detects authorization drift by asserting an addition outside the selected positive gaps is rejected before simulated apply; verify the smoke command fails when that assertion is deliberately inverted, then restore it.

## 4. Make completion expectations durable

- [ ] 4.1 Update repository and Nemlig instructions so a user-visible feature change requires a representative multi-step smoke scenario and passing evidence before completion; verify the rule is present in both applicable instruction files.
- [ ] 4.2 Update the Nemlig feature documentation and advance the package prerelease version required for the runtime fix; verify the package version gate and documentation checks pass.

## 5. Verify and deliver

- [ ] 5.1 Run strict validation for this OpenSpec change, focused planning/interface tests, the package smoke suite, root `pnpm verify`, package smoke, and the credentials-free production-readiness gate; record every passing command.
- [ ] 5.2 Commit and push the scoped branch, open a pull request, and verify exact-head CI is green before merge.
- [ ] 5.3 Merge through the protected pull-request path, verify the production deployment reports the merged revision, and run exact-revision read-only production acceptance without mutating a real basket.
