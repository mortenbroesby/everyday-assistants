## 1. Characterize the guided journey

- [ ] 1.1 Add focused component or rendered-contract tests for the shared List → Proposal → Choices → Approve indicator, including completed/current/upcoming semantics and the optional Choices branch; verify the new tests fail against the current UI.
- [ ] 1.2 Add focused assertions for each view's single next-action guidance and confirm no test permits a basket mutation from Proposal or Choices.

## 2. Implement the guidance

- [ ] 2.1 Add the shared journey header by mapping the existing `presentation` value to stage state; verify Proposal, Choices, and Approve render independently without new client state or dependencies.
- [ ] 2.2 Replace ambiguous stage copy with one explicit next action per view while preserving unresolved-item guidance, product evidence accordions, alternatives, and the protected `Add to Nemlig basket` boundary.
- [ ] 2.3 Add minimal responsive and accessible styling for the stage indicator and verify keyboard semantics plus the existing mobile-width showcase.

## 3. Verify and deliver

- [ ] 3.1 Run the focused picker checks, TypeScript/build checks, and one final root `pnpm verify`; review the diff for unrelated changes, secret exposure, new provider access, and unjustified complexity.
- [ ] 3.2 Run a fresh read-only ChatGPT acceptance that renders the independently placed Proposal and Choices views, verifies that each communicates the current and next stage, and stops before `Add to Nemlig basket`.
- [ ] 3.3 Make the package-scoped version decision near merge, update release artifacts only if the change is release-bearing, then commit, push, open the single epic pull request, verify exact-head CI, merge through the repository ruleset, and verify the exact integrated `main` revision and production deployment when applicable.
