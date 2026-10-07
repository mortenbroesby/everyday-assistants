## 1. Terminal lease contract

- [x] 1.1 Add focused workflow/recovery checks for a queued successor that releases a proven terminal predecessor lease, re-runs preflight, and acquires fresh ownership exactly once.
- [x] 1.2 Add focused negative checks proving missing artifact, changed journal head, pending acceptance, drift, and unknown mutation keep the predecessor lease and perform no provider mutation.
- [x] 1.3 Normalize the accepted-terminal recovery predicate to retain exact identity checks while excluding transient post-acceptance lifecycle reads; verify the focused production deployment suite passes.

## 2. Workflow continuation

- [x] 2.1 Change the existing production workflow so a blocked routine candidate invokes only protected non-mutating predecessor reconciliation and then re-enters exact candidate preflight; verify the workflow fixtures cover safe continuation and fail-closed blocking.
- [x] 2.2 Update the production delivery specification and operations runbook with the event-subscription conclusion and automatic terminal cleanup boundary; verify strict OpenSpec validation passes.

## 3. Delivery evidence

- [x] 3.1 Run focused tests, production readiness, and required repository verification; record exact commands and results.
- [ ] 3.2 Commit, push, open one scoped PR, and verify exact-head CI. Merge and conduct one normal exact-SHA production deployment only after review and authorization; verify public revision and routine lease absence separately from native ChatGPT acceptance.
