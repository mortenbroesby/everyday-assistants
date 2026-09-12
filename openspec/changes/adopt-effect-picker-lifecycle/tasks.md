## 1. Establish the fair comparison contract

- [x] 1.1 Verify the merged picker baseline, exact stable candidate versions,
  worktree ownership, Node 22.23.1/pnpm 9.15.9, and one frozen install; record
  that production remains native and no provider or basket access is needed.
- [x] 1.2 Add the smallest failing shared tests for one plain derived model and
  success, failure, duplicate, replacement, stale-completion, disposal, and
  remount traces; verify both unimplemented candidates fail the same contract.
- [x] 1.3 Add candidate-neutral plain types, fixtures, and fake host utilities;
  verify expected outputs and assertions are owned only by the shared harness.

## 2. Implement the two proof-of-concept stacks

- [x] 2.1 Implement the `fp-ts` pure transformation with its natural immutable
  composition APIs; verify it returns the exact shared plain display model.
- [x] 2.2 Implement the `fp-ts` lifecycle with typed expected failures and
  explicit delivery guards/cleanup; verify every shared lifecycle case passes.
- [x] 2.3 Implement the Remeda pure transformation over the same plain input;
  verify it returns the exact shared display model with no Effect type leakage.
- [x] 2.4 Implement the Effect lifecycle with typed failures and scoped cleanup
  while retaining necessary delivery guards; verify every shared lifecycle case
  passes, then checkpoint commit both reviewable candidates.

## 3. Make behavior and costs inspectable

- [ ] 3.1 Extend the development-only showcase with candidate and deterministic
  scenario controls, derived output, state sequence, and event trace; verify no
  Nemlig request or external mutation is possible.
- [ ] 3.2 Add candidate-isolated browser builds, candidate-specific type checks,
  and one reproducible benchmark command; verify ignored JSON output reports
  repeated medians, bundle bytes, code shape, and pass/fail evidence.
- [ ] 3.3 Run the benchmark on the pinned environment and write
  `docs/picker-functional-comparison.md` with commands, results, clear pros and
  cons, manual guards, diagnostic notes, and no manufactured numeric winner;
  checkpoint commit the evidence.

## 4. Verify and deliver the draft comparison

- [ ] 4.1 Prove production `picker.html` excludes candidate imports and showcase
  markers; run focused comparison, picker artifact, package, and MCP safety
  checks and verify identical candidate behavior.
- [ ] 4.2 Run strict OpenSpec validation, `pnpm privacy:check`, and final
  `pnpm verify`; review the diff for secrets, unrelated edits, hidden runtime
  adoption, cost, safety regression, and unjustified benchmark machinery.
- [ ] 4.3 Push the complete comparison to draft PR #36 and verify exact-head CI.
  Keep production native, leave the PR unmerged, and request owner selection
  before deleting candidates or making any release/deployment decision.
