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

## 5. Visible release requirement

- [x] 5.1 Reject stale viewer HTML/resource metadata in release acceptance and verify regular-user review tool metadata.
- [x] 5.2 Make verified ChatGPT metadata refresh and live local UI checks mandatory before claiming UI delivery; record the September 25 incident evidence.
- [x] 5.3 Run focused checks and final verification, merge the UI delivery fixes through PRs #127, #131, and #132, then verify the production release in ChatGPT after integration.


Live baseline evidence, 25 September 2026: Cloudflare run 36096394361 rolled out
c0048d1 and Container application version 94. The existing ChatGPT app initially
advertised the old catalog after two refresh attempts. A third instrumented
Refresh returned HTTP 200 from refresh_actions, and the UI then listed all three
review tools. The exact cause of the earlier unsuccessful refreshes is unproven.
The same conversation successfully rendered the review, accepted one of three
products locally, displayed Basket (1) with only that product, and returned to
Needs review (2). No real Nemlig basket write or submission was performed. This
is baseline 4.15.0 evidence, not acceptance of the still-unreleased 4.16.0 follow-up.

Alternatives opened for Pingvin Sweet Salmiak Soft, rendered current product and
selectable results, and exposed a cancel route. Search relevance remains a
separate observed defect: the full product-name query returned sweet chilli
sauce among the candidates. No replacement was selected.

Release-acceptance regression checks: 34 focused tests passed; typecheck passed.
The exact UI resource check uses the same read already made by machine acceptance.
Regular-user read-only acceptance adds one resource read and validates review-tool
metadata. No tool allowlist, provider mutation, quota or capacity changes.

Final follow-up evidence, 25 September 2026: PR #132 merged at
`174d461444c8b98f75525d4d2f2f104e9201045e`. Protected production run
`36105335638` passed source/auth preflight, edge acceptance, and service fixture
acceptance, leaving the Worker enabled at application version 98. Native Refresh
readback reported `ui://nemlig/product-viewer-v2.html` for all three review
tools. In the existing shopping conversation, without a page reload, the fresh
viewer rendered three products and exercised start review, select/add, local
Basket (one accepted product), inline details, Move to Needs review, contextual
alternatives, back to Needs review, Return to alternatives, and Cancel. The
final state returned to Needs review with an empty local Basket. No
`prepare_submission`, `submit_product_review`, provider basket write, checkout,
payment, or ordering call was made. The earlier failed rollout
`36103722265` was rolled back and its pending operation was reconciled by
`36105133533` before the successful deployment.

## 6. Stale card recovery regression

- [x] 6.1 Reproduce retained-card failure across review service restart; make refresh find the current conversation and explicitly report absence.
- [x] 6.2 Provide explicit safe restart in the viewer without replaying edits or restoring submission authority; bump the viewer resource version.
- [x] 6.3 Smoke the rendered UI across reset, explicit restart, normal controls, and replaced/ended drafts; verify zero provider basket calls.
- [ ] 6.4 Run focused checks and final verification, release, then exercise recovery and normal controls in ChatGPT before claiming delivery.

Local recovery evidence: real MCP HTTP regression passes across a fresh service and explicit end. Browser smoke reproduced the wrapped INVALID_ARGUMENT error, missing-state refresh, explicit restart with unchecked selections, accepted basket, quantity 3, alternatives/cancel, and recovery to a different current draft without replay. Provider basket calls: 0.

## 7. Historical and conflicting card regression (#137)

- [x] 7.1 Add executable failing browser-program checks for inactive activation, stale revision, generic failure and safe restart.
- [x] 7.2 Gate host snapshots, normalize recovery, and retain inert retired resources with bounded explicit activation.
- [ ] 7.3 Run real MCP browser smoke and final gates; merge one reviewed release PR.
- [ ] 7.4 Deploy exact merged SHA and verify refreshed v4 UI plus historical cards in ChatGPT.

Regression baseline: 4.16.3 / 02d66c9 rendered stale active revisions with raw
INVALID_ARGUMENT; reload/remount restored actionable historical snapshots.
Ended-review recovery passed. This follow-up completes the failed 6.4 criterion.

Implementation evidence: executable viewer tests first failed then passed; the
real-MCP browser smoke passed inactive mount/remount, rejected stale edit plus
one read, connection failure, process restart, quantity-preserving unchecked
recovery, finish, and zero provider basket calls. A separate real-MCP submission
smoke uses the real proposal service and a fake basket to verify the exact
accepted lines, protected submit, readback and rejection of duplicate submission.
