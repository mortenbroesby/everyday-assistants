## 1. Remove the vertical feature

- [x] 1.1 Prove retired CLI/MCP expectations fail before edits, then remove implementation and all callers; focused interface and isolation tests pass.
- [x] 1.2 Remove runtime gh installation and GH_TOKEN wiring; source/config/package checks prove no runtime issue-submission path remains.
- [x] 1.3 Update feature docs, roadmap, package version and affected specs; strict validation and diff review prove consistency without rewriting historical evidence.

## 2. Deliver and accept

- [x] 2.1 Run full pnpm verify, strict specs, privacy, packed smoke and credential-free production readiness; record red/green evidence and scoped review.
- [x] 2.2 Integrate and push the scoped commit to main; verify exact remote ref and green exact-head CI.
- [ ] 2.3 Confirm provider authority, deploy the exact verified main revision through the approved fail-closed procedure and verify health/read-only inventory; report pending if authority or credentials are unavailable.
- [ ] 2.4 After applicable acceptance sync this delta and archive it; verify strict specs and exact remote main/CI for final documentation.
