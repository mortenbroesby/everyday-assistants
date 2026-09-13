## 1. Characterize the guided journey

- [x] 1.1 Add focused component or rendered-contract tests for the approved four-screen visual structure, including List rows, the shared stepper, card hierarchy, mobile layout, and completed/current/upcoming semantics; verify the new tests fail against the current UI.
- [x] 1.2 Add focused host-session tests for List submit, Proposal Back/Continue, Choices Back/submit, and branch-aware Approve Back; verify duplicate sends are coalesced and no action before final approval can mutate the basket.

## 2. Implement the guidance

- [x] 2.1 Add the bounded read-only List-stage tool and extend the existing shared UI payload with list rows and navigation context; verify checked state and requested amounts round-trip without a provider or basket call.
- [x] 2.2 Implement the shared four-stage header and approved visual system using the existing Apps SDK UI and CSS; verify List, Proposal, Choices, and Approve match the supplied mobile design without a new dependency.
- [x] 2.3 Implement guarded bottom Back/Next controls through the existing host-message bridge, including direct Proposal → Approve and Proposal → Choices → Approve branches; verify pending controls disable and the preceding visited stage is restored.
- [x] 2.4 Preserve unresolved-item guidance, evidence accordions, alternatives, product imagery, exact approval, fresh validation, cancellation, readback, and no-retry behavior; verify existing focused safeguards remain green.
- [x] 2.5 Update the showcase to exercise all four screens and both navigation branches at mobile width; visually compare hierarchy, spacing, shapes, colors, imagery, and controls with the approved design.
- [x] 2.6 Replace host-round-trip Back/Next with local traversal of carried snapshots, add an explicit Proposal-to-Choices action, and retain the host bridge only for initial discovery and final protected approval.
- [x] 2.7 Preserve conversational add, remove, quantity, preference, and replacement refinements at every stage; re-render complete affected state and invalidate changed recaps before approval.

## 3. Verify and deliver

- [x] 3.1 Run the focused picker checks, TypeScript/build checks, and one final root `pnpm verify`; review the diff for unrelated changes, secret exposure, new provider access, and unjustified complexity.
- [ ] 3.2 Run a fresh read-only ChatGPT acceptance through List → Proposal → Choices → Approve in one widget, exercise Back at each applicable stage plus the direct Proposal → Approve skip path, and stop before `Add to Nemlig basket`.
- [ ] 3.3 Make the package-scoped version decision near merge, update release artifacts only if the change is release-bearing, then commit, push, open the single epic pull request, verify exact-head CI, merge through the repository ruleset, and verify the exact integrated `main` revision and production deployment when applicable.
