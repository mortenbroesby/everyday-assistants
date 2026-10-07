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
- [x] 7.3 Run real MCP browser smoke and final gates; merge one reviewed release PR.
- [ ] 7.4 Deploy exact merged SHA and verify refreshed v4 UI plus historical cards in ChatGPT.

Regression baseline: 4.16.3 / 02d66c9 rendered stale active revisions with raw
INVALID_ARGUMENT; reload/remount restored actionable historical snapshots.
Ended-review recovery passed locally; the native ChatGPT portion of 6.4 remains unverified.

Implementation evidence: executable viewer tests first failed then passed; the
real-MCP browser smoke passed inactive mount/remount, rejected stale edit plus
one read, connection failure, process restart, quantity-preserving unchecked
recovery, finish, and zero provider basket calls. A separate real-MCP submission
smoke uses the real proposal service and a fake basket to verify the exact
accepted lines, protected submit, readback and rejection of duplicate submission.

7.3 was completed by PR #138 (merged as `94a9a3c61fcdf87b05b0de1f1aad8a4bd0ffffd4`):
its exact-head CI, recorded browser smoke, and final verification passed. On
`476dd9239ec03ada14664c38fe14b2dafe5540d5`, the focused viewer, review,
MCP, and gateway tests and loopback real-MCP browser regression were rerun on
27 September 2026. This is local evidence, not native ChatGPT acceptance.
6.4 remains open for its native recovery and normal-control portion. 7.4 remains
open for exact-served-revision and native historical-card proof; production
deployment and retention are separately owned by #96. See #137 for the
sanitized host acceptance matrix and remaining blocked cases.

## 8. Persistent review and Basket actions

- [x] 8.1 Reproduce the mounted-card collapse, preserve activation only for the same current review, and add regression coverage for duplicate/stale host results and historical cards.
- [x] 8.2 Preserve compatible presentation state, simplify Basket rows, and add a revision-checked local Clear Basket confirmation.
- [x] 8.3 Add interactive exact submission confirmation through the existing protected submit operation; test cancellation, stale/expired/uncertain outcomes and no automatic retry.
- [x] 8.4 Run focused and repository gates, review the diff, and prepare a scoped release PR.
- [ ] 8.5 Verify the exact v5 artifact in native ChatGPT after release and metadata refresh; keep production release and host acceptance separate from local proof.

27 September local evidence: native v4 ChatGPT card collapsed within the same
mounted sandbox after acceptance and navigation; the accepted line was present
after explicit reopening. The v5 test program exercises duplicate results,
inactive historical cards, compatible presentation state, clear confirmation,
UI submission cancel/confirm/uncertainty, and expiry rejection. The loopback
real-MCP browser passed one-activation local accept, Basket, quantity, revisit,
alternatives, replacement, clear and rebuild with zero provider basket calls.
The real-MCP fake-basket submission smoke passed protected apply/readback; no
live Nemlig submission or native v5 host acceptance was attempted.

## 9. In Review and Ready UX refinement

- [x] 9.1 Implement Ready as the sole review contract, reject obsolete basket actions, and add focused protocol tests.
- [x] 9.2 Keep alternatives in In Review, batch acceptance, remove-all-Ready semantics, and protected Ready-only submission; add service regressions.
- [x] 9.3 Refine the existing lightweight viewer with compact rows, disclosures, quantity, empty/success states and same-frame navigation; add executable viewer and mobile browser checks.
- [x] 9.4 Version the resource, update docs/release note, pass repository gates, commit/push one scoped PR and verify exact-head CI.
- [ ] 9.5 After a separately approved release, verify the registered React v8 mounted experience in native ChatGPT; do not infer this from local tests.

9.4 was completed by PR #149, tested at
`a1ebed07f94565a46b3662c77fdc440bad23e2c9` and merged as
`85bcd7ee3d094c94041282dab2ce85925e803aa2` on 28 September 2026.
Exact-head CI run `36346228455` passed. Its recorded loopback continuous-flow
checks at 320px and 375px made zero provider basket calls. This credits the
implementation gate only; 9.5 and the native historical/recovery gates remain
open. The current resource was v6 at that checkpoint, with v4/v5 then retired;
#137's historical v4 case must not be mistaken for current-renderer acceptance
or an instruction to redeploy the old v4 release.

## 10. Discovery, selection language, and current-card continuity

- [x] 10.1 Replace the foreign-snapshot fold expectation with a failing
  historical A → explicit current B → delayed A regression; ignore unsolicited
  foreign review payloads only after activation. Verify both bridges and both
  notification channels, reversed order, a following local edit, fresh inactive
  remount, same-ID stale rejection, and explicit recovery to C without replay.
- [x] 10.2 Remove the alternatives-only default five, maximum ten, and viewer
  refinement count while retaining optional caller counts. Verify more than ten
  eligible results in provider order, omitted count reaching the provider,
  duplicate IDs, incomplete details, cancellation, stale candidate rejection,
  replacement quantity/state, and zero provider basket mutations.
- [x] 10.3 Refine the existing contextual search control and user-facing copy to
  Your Nemlig selection / To decide / Ready / Open current selection. Verify an
  empty or irrelevant result can search again without changing membership, a
  slow or cancelled broad search remains recoverable, disclosure/navigation
  make no provider reads, and 320px/375px plus accessible labels remain usable.
- [x] 10.4 Update existing MCP descriptions, titles and agent instructions for
  broad search, deliberate follow-up phrases, conversation-only local edits and
  exact real-basket preparation. Verify the 21-tool inventory, honest
  annotations and structured/headless responses; demonstrate direct search,
  add, quantity, revisit, alternative, replace and remove without opening a
  widget, with stale edits rejected and no automatic retry.
- [x] 10.5 Version changed viewer content, retire the prior URI per policy,
  update product docs and one reviewed release note, then run focused checks,
  browser/MCP smoke, strict OpenSpec validation and required repository gates.
  Review the scoped diff, checkpoint commits and draft PR head against current
  main; verify exact-head CI before requesting merge or release.
- [ ] 10.6 After a separately approved release, record the exact served revision,
  ChatGPT metadata/resource readback, and a native historical-card A → current
  B → delayed A acceptance attempt. Verify current and remounted card behavior
  separately; keep #137's other historical evidence and #96 deployment evidence
  separately attributed and leave this item open without direct host proof.
- [x] 10.7 Debounce rapid quantity +/- input on the existing server-authoritative
  update path with a defined 400 ms quiet interval. Keep displayed quantities
  and totals responsive; serialize/cancel pending edits safely; flush before
  navigation, other mutations, prepare, or submit. Test bursts, per-item edits,
  flush ordering, failures, stale revisions, and no stale submission.
- [x] 10.8 Trace assistant clarification after Ready products exist. Preserve a
  prepared exact submission across edits confined to To decide only when its
  Ready IDs/quantities remain identical; invalidate it on any Ready-set or
  Ready-quantity change. Keep the submission visible/recoverable in the same
  workspace, require a fresh exact confirmation where applicable, and preserve
  current price/readback/uncertainty protections. Test the conversational add
  path and mixed Ready/To decide state.
- [x] 10.9 Treat an unambiguous conversational instruction to add the current
  exact Ready selection to the real Nemlig basket as authorization for that
  exact prepared payload; do not ask for a redundant second conversational
  approval. Ready acceptance alone is not authorization. Clarify ambiguous
  scope or changed Ready contents/quantities, and preserve exact binding,
  freshness, principal/conversation binding, single-use serialization,
  readback, and uncertain-write/no-retry behavior. Test explicit intent,
  ambiguity/change rejection, and uncertain writes.
- [x] 10.10 Add open-ended search guidance and MCP parity for the user jobs in
  conversation and the viewer. Verify a term such as “salmiak” calls direct
  catalogue search independently of any local/alternatives product, does not
  mutate that selection, and allows a deliberate broader search when contextual
  alternatives are insufficient. Trace successful-empty and upstream HTTP 500
  through the real fixture-backed tool/client path; assert distinct outcomes,
  exact safe error mapping, and assistant instructions that do not report a
  failure as no matches. Do not rename/merge tools without demonstrated benefit.

10.5 local implementation evidence (29 September 2026): commit `c439732`
contains the v7 viewer identity and retired-v6 handling; package/release metadata
is `5.2.0 / Gather` with a reviewed release note. `pnpm verify`, strict
OpenSpec validation, fixture-backed interface tests, and loopback browser smoke
passed on `c439732` before release-only metadata was applied. Smoke covered
320px/375px and recorded zero provider basket writes. Release metadata is not a
deployment or native ChatGPT acceptance; 10.6 remains open for served-revision,
metadata-readback, and historical-card evidence.

## 11. Add-only real Nemlig basket safety

- [x] 11.1 Update the basket proposal contract and repository/basket instructions
  to state that the real Nemlig basket is add-only; verify strict OpenSpec
  validation and keep local selection clearing explicitly separate.
- [x] 11.2 Remove real-basket clear, line removal, and swap from the provider
  client, proposal service, CLI, MCP inventory, and production acceptance path;
  verify no assistant path can call those provider mutations.
- [x] 11.3 Make requested quantities additive to the latest known provider line
  quantity; test 2 existing + 2 approved = 4, positive-only provider writes,
  exact proposal totals, stale-basket rejection, and verified readback.
- [x] 11.4 Update README/tool inventory and relevant tests; run focused gates,
  strict OpenSpec validation, browser/MCP smoke, and `pnpm verify`; push the
  change to draft PR #164 without merging or deploying.

## 12. Registered React viewer migration update (7 October 2026)

- [x] 12.1 Register the self-contained React v8 resource, keep v7 inert, and
  retain server-owned review state and exact submission confirmation.
- [x] 12.2 Restore supported review controls, safe quantity flush, explicit
  continuation after verified submit, and authoritative end handling in the
  React artifact with synthetic/loopback browser coverage.
- [ ] 12.3 After a separately approved release, verify the registered resource
  and historical cards in native ChatGPT. Local evidence does not complete
  task 9.5 or this host-acceptance gate.

## 13. Staged visual refinement (8 October 2026)

**Story gate:** Before Story 1, verify and record the resource URI actually
served in native ChatGPT (expected baseline: v8; do not infer it from source or
`main`), explicit activation, one local navigation/edit, and whether the same
mounted frame remains visible. If another URI is served or the host fails
before the viewer loads, record the exact boundary and reconcile the baseline
before drawing lifecycle conclusions; do not paper over it in the viewer.

### Story 1 — compact row foundation (one PR)

- [ ] 13.1 Characterize the current row/disclosure behavior with focused
  React/viewer tests, including keyboard operation, checkbox-versus-row click,
  missing image, long name, supplied factual sections and zero tool/provider
  calls on disclosure.
- [ ] 13.2 Refine existing To decide and Ready row layout for image, identity,
  pack/brand, quantity and line price while keeping only the supplied factual
  disclosures; verify 320px/375px layout, focus visibility, unavailable rows,
  and no new business-state/client fetch path.
- [ ] 13.3 Bump the viewer resource URI when its HTML changes and update the
  scoped feature inventory. Run focused viewer/browser smoke, strict OpenSpec
  validation and applicable repository gates, then prepare one reviewable PR.
  Use the verified-main deployment path after merge; add package identity or
  release-note changes only when the package release policy requires them.
- [ ] 13.4 After merge/release, perform and record native ChatGPT Story 1 smoke
  for expansion, factual disclosure, quantity persistence and a mounted-frame
  check. Do not start Story 2 until this result is pass or an exact host block
  is documented and accepted.

### Story 2 — local selection action hierarchy (one PR)

- [ ] 13.5 Add focused failing coverage for redundant/invalid state actions,
  then make To decide batch acceptance its only acceptance path and make Ready
  row expansion expose only existing move-back/remove paths; verify that local
  removal remains confirmed and makes zero provider basket calls.
- [ ] 13.6 Remove redundant Ready banner/summary and action clutter, retaining
  one destination-appropriate primary action and clear local-versus-Nemlig
  basket wording; verify batch accept, revisit, removal, quantity flush and
  stale-revision recovery preserve server authority.
- [ ] 13.7 Version/release the Story 2 viewer change through one PR after
  focused tests, loopback browser smoke, strict OpenSpec validation and the
  applicable repository gate; record exact revision and CI evidence.
- [ ] 13.8 After merge/release, perform and record native ChatGPT Story 2 smoke:
  select → accept → Ready → quantity → move back → To decide, plus one
  conversational edit/readback. Do not start Story 3 until this is pass or an
  exact host block is documented and accepted.

### Story 3 — contextual alternatives comparison (one PR)

- [ ] 13.9 Add focused coverage for immediately scannable returned alternatives,
  long-form factual disclosures, no current-product internal divider, empty and
  unavailable results, current-candidate-only replacement, and no implicit
  Ready acceptance.
- [ ] 13.10 Refine the existing alternatives destination without new provider or
  browser business state; show supplied comparison facts directly and retain
  the existing search, back and replace actions. Verify replacement preserves
  quantity, returns to To decide, and requires later batch acceptance.
- [ ] 13.11 Version/release Story 3 in one PR after focused tests, loopback
  browser smoke, strict OpenSpec validation and applicable repository gates.
- [ ] 13.12 After merge/release, perform and record native ChatGPT Story 3
  smoke: search, refine search, compare, select, replace, return, and accept.
  Confirm empty/error paths remain honest. Do not start Story 4 until this is
  pass or an exact host block is documented and accepted.

### Story 4 — entry and outcome states (one PR)

- [ ] 13.13 Characterize the existing prepared, cancel, verified-success,
  uncertain, unavailable, empty and ended-draft states. Determine any standard
  host follow-up, close or external-link capability from current official
  documentation and native evidence before adding such a control; omit it if
  not proven.
- [ ] 13.14 Simplify the existing confirmation/outcome hierarchy and add only
  supported empty-state conversational suggestions or compact local overflow
  actions. Verify exact confirmation, cancel, single-use submission, readback,
  no automatic retry, local-only discard and complete text fallback remain
  unchanged.
- [ ] 13.15 Version/release Story 4 in one PR after focused tests, fake-provider
  protected-submit smoke, loopback browser smoke, strict OpenSpec validation
  and applicable repository gates.
- [ ] 13.16 After merge/release, perform and record native ChatGPT Story 4
  smoke for empty/end, prepared confirmation/cancel and verified/uncertain
  presentation. A real Nemlig addition remains separately authorized; do not
  use it as this story's default test.
