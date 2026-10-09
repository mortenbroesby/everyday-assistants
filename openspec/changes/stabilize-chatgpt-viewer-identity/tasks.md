## 1. Contract and regression boundary

- [x] 1.1 Reconcile current main, published viewer inventory, and overlapping
  voice-first-product-review requirements; record the integration SHA and verify
  that the new permanent URI has never been published.
- [x] 1.2 Add focused failing coverage for matching permanent descriptor aliases,
  current packaged resource delivery, and every prior identity returning an
  inert document with zero provider calls.

## 2. Minimal implementation

- [x] 2.1 Register the permanent identity and permanently retire the prior
  inventory; verify focused resource/catalog tests and existing artifact
  validation pass without external scripts, styles, imports, or fetches.
- [x] 2.2 Add the non-secret native build marker and exact served-artifact
  identity; verify the packaged HTML, resource response, and recorded digest
  agree without modifying the business-state contract.
- [x] 2.3 Add one bounded resources/read diagnostic event at the existing
  authenticated boundary; test current/retired/other classification, null
  artifact identity for non-current responses, request-local correlation,
  no raw URI/payload/secret fields, no provider calls, and clean stdio output.

## 3. Safety and integration verification

- [x] 3.1 Run or extend the existing synthetic viewer smoke for current-state
  refresh with cached compatible code, duplicate/older/foreign snapshots,
  explicit activation, stale view/revision rejection, unavailable drafts,
  cancellation, and conversation isolation; record each result.
- [x] 3.2 Run existing protected-submission regressions with fake providers;
  verify exact authorization, freshness, single use, additive quantities,
  readback, and uncertain-write no retry remain intact.
- [x] 3.3 Update connector recovery guidance, README feature inventory, and
  conflicting voice-first-product-review URI policies; verify all identify
  the permanent URI, operator-only cutover, unsupported historical identities,
  and separate code/data freshness.
- [x] 3.4 Run strict OpenSpec validation, one representative artifact/browser
  smoke, and final pnpm verify; review the final diff for scope and privacy,
  then record exact revision and check results.

## 4. Reviewed delivery and operator cutover

- [x] 4.1 Complete one scoped PR with the required release note/version policy;
  record commit/PR, exact-head CI and active ruleset evidence separately from
  production and native acceptance.
- [x] 4.2 Through the separately authorized production path, deploy and verify
  exact source/artifact identity, authenticated descriptor aliases, resource
  content and CSP; record sanitized evidence without inferring native success.
- [ ] 4.3 Have the operator perform the approved clean installation/reconnection;
  record completion and installed descriptor readback without credentials,
  account identifiers, automated retries, or OAuth/provider changes.

## 5. Native acceptance and reconciliation

- [ ] 5.1 In a new chat immediately after cutover, verify the native build marker
  and shell, local selection, Ready/back, quantity change, and conversational
  edit/readback in the mounted viewer; record pass/fail and available binding
  evidence without real basket access.
- [ ] 5.2 Repeat the same proof in a second independent fresh chat using the
  cutover connection; record artifact identity and state isolation separately.
- [ ] 5.3 If either native run is stale or unobservable, record the exact failed
  boundary and keep delivery pending without another URI bump or autonomous
  reconnect; otherwise reconcile the earlier native gaps as superseded and
  sync/archive the change with its acceptance evidence.

## Implementation evidence (8 October 2026)

- Current integration base: `fdb5ebf`; `ui://nemlig/draft-list.html` was absent
  from that published inventory. The historical unversioned URI and v1-v16
  identities are all now explicit inert resources.
- Focused regressions passed after initially failing against the prior v16
  identity. The package artifact is self-contained and its SHA-256 is derived
  from the exact HTML delivered by the current resource.
- `pnpm --filter nemlig-assistant smoke:review-ui:artifact` passed. The
  protected loopback/HTTP/production-acceptance suite passed with fake
  providers only; no real basket or provider access occurred.
- Strict OpenSpec validation and `pnpm verify` passed. Exact-head CI,
  deployment, clean connection cutover, and two native fresh-chat runs remain
  pending under tasks 4.1 through 5.3.
- Local verification revision: `7b61e8a23a7dda833c543c6b6ddab141218f925a`.
  It passed `pnpm verify`, `smoke:review-ui:artifact`, focused resource/gateway
  coverage, protected fake-provider regressions, the full package test suite,
  release-note/version eligibility, and strict OpenSpec validation.

## Delivery evidence (9 October 2026)

- Task 4.1: PR #252 merged as `8481af4afbb768533dc6705af332b1a6188b6c92`
  with the 6.2.5 **Lumen** release note. Exact-main CI run `37851067309`
  and the production workflow run `37851380397` succeeded. The separately
  triggered duplicate production run `37851709008` was skipped, not failed.
- Task 4.2: the production workflow recorded the authenticated descriptor and
  current-resource acceptance boundary. A subsequent edge-only production
  probe at 2026-10-09T12:00:08Z read back exact revision `8481af4…` and passed
  all required edge checks. This verifies service delivery only; it does not
  establish the installed ChatGPT descriptor, resource rendering, or mounted
  viewer behavior.
- A fresh ChatGPT conversation initially rendered the inert retired document.
  An explicit installed-app **Refresh tools** then allowed a new chat to render
  the current interactive Draft list and complete local select → Ready → To
  decide plus quantity persistence without real-basket access. The same chat
  exposed a remaining native failure: a successful conversational Ready → To
  decide update did not update the already mounted view. Tasks 4.3 and 5.1–5.3
  therefore remain open; no URI rotation, reconnection retry, or automatic
  reopen was attempted.
- The `cf415ce` follow-up tried associating the conversational update result
  with the current viewer resource. In a refreshed installed connection and a
  fresh chat, local To decide → Ready remained in the mounted card, but a
  conversational Ready → To decide mutation created two new inactive “Update
  your draft list” cards. The newest card showed the correct server state while
  the original mounted card remained unchanged. This proves the host rendered
  replacement cards rather than delivering a state update to the existing
  iframe. The experiment is being reverted without adding reopen, polling, or
  URI-rotation behavior; no real basket was accessed or changed.
