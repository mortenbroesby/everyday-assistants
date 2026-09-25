## 1. Shared local review

- [x] 1.1 Implement bounded private drafts and exact local edits; test identity, revision, expiry, alternatives navigation and absence of provider writes.
- [x] 1.2 Bind explicit submission to an unchanged draft through the existing proposal service; test invalidation, single use, readback and uncertain failures.

## 2. Voice and touch

- [x] 2.1 Expose the same draft operations through MCP and retain them in principal contexts; verify protocol tests and service exclusion.
- [x] 2.2 Implement compact accessible review, local Basket, alternatives and inline details in the shared viewer; verify a mobile rendered end-to-end flow and conversational fallback.

## 3. Integration

- [x] 3.1 Reconcile contracts and documentation; run strict OpenSpec validation, focused checks and final pnpm verify.
- [x] 3.2 Review the final scoped diff, commit, push and open PR #120; verify the remote head. Exact-head CI and handoff status are tracked on PR #120.

Implementation verification: focused service/protocol tests, a deterministic
loopback browser/MCP smoke at 375px and 320px, strict OpenSpec validation,
public-tree privacy checks, full `pnpm verify`, and packed-package smoke passed.
Local Docker is stopped, so the complete Cloudflare dry run is delegated to PR CI.
No live Nemlig or production operation was performed. Do not infer deployment
from this implementation checklist.

## 4. Owner feedback after PR #120

- [x] 4.1 Re-run the original mobile flow and reproduce missing host initialization.
- [x] 4.2 Scope drafts to conversations without hourly expiry; add append, revisit and end with service and protocol tests.
- [x] 4.3 Match the mockup, initialize the real host protocol, and verify mobile navigation through a standards-only parent iframe.
- [x] 4.4 Verify, commit and push follow-up PR #127; record baseline deployment separately from follow-up delivery. Exact-head CI is tracked on the PR.

Follow-up evidence: 437 tests and five package smoke checks passed in the full
`pnpm verify` push gate. The local mobile fixture also exercised a standard
MCP Apps parent iframe without `window.openai`, including initialize, accept,
revisit, alternatives, free list navigation, replacement and finish/cancel.
No real Nemlig basket was mutated. Baseline PR #120 is merged at
`c0048d11267e04b96904c3b6352618d39f7cbf6f`; production deploy job 36096394361
succeeded and the live edge probe verified that exact revision. PR #127 remains
a separate, undeployed follow-up for feedback and review.
