# OpenSpec portfolio reconciliation

[#114](https://github.com/mortenbroesby/everyday-assistants/issues/114) owns this
documentation reconciliation, not runtime implementation or live acceptance.
Inspected baseline: `f45ce93600cee7922703dd1e8a5c65e904ddf5a8`, 29 September 2026.
PR #141 is integrated at that SHA; its tested head `a7dcb7e` passed
[CI 36579414097](https://github.com/mortenbroesby/everyday-assistants/actions/runs/36579414097).
Exact-main `f45ce936` subsequently passed
[CI 36581810980](https://github.com/mortenbroesby/everyday-assistants/actions/runs/36581810980).
That evidence is separate from production, which was directly observed serving
`c97fde4` with MCP disabled and onboarding enabled.

This record replaces the issue's dated 13-change inventory with dispositions
for all 16 changes found on current main. It is an evidence index, not a second
implementation plan. Historical unchecked tasks are not automatically current
obligations; completed local implementation is not native host acceptance.

## Portfolio dispositions

| Change | Disposition and evidence | Remaining acceptance / owner |
| --- | --- | --- |
| `add-release-codenames` | Identity metadata delivered by PR #45, merge `18699cb3`; later SHA-based delivery superseded the mandatory publication ceremony. | Keep the historical record unarchived while its mixed live/publication task is unresolved; do not create a tag merely to check it. Current release/identity evidence: #96, broader connection stability: #67. |
| `automate-nemlig-cloudflare-release-retention` | Superseded on 2026-10-07 by the owner-approved routine-only deploy decision in `remove-production-release-leases`. | Its lease, journal, recovery, and automatic-retention requirements are retired; issue #96 needs a separate disposition after the replacement lands. |
| `fix-nemlig-oauth-reliability` | Repository fixes delivered; remaining acceptance narrowed to #67's current owner matrix. | Two fresh provider-backed conversations, idle/cold start, genuine expiry or approved equivalent, stable identity and bounded recovery remain #67. Legacy Mac removal is a separate held local operation. |
| `p0-add-self-service-nemlig-credential-onboarding` | Current section 12 restored owner browser recovery in PR #154, with Worker/form fixes #155/#156. Earlier invitation/tier/Organization/schema-v2 research is superseded, not completed. | Section 12.5 remains unchecked: staging and owner portal save are observed, but enabled protected release/owner reads are not. #96/#67 own those gates. Do not retire the current recovery path using the old #114 recommendation. |
| `migrate-nemlig-mcp-v2` | Archived implementation: PR #95 head `8f7220fe`, merge `ff6252c3`, exact-head CI `35789718220`. Final integration checkbox reconciled from that evidence. | Canonical stateless/principal-bound requirements are synced; current source uses the SDK's stateless legacy handshake option, not a transport session or application compatibility adapter. No compatibility code is added here. Native identity/expiry acceptance remains #67. |
| `rich-product-search-and-viewer` | Archived implementation: the same PR #95 delivered hydration, shared presentation and planner retirement; final repository tasks reconciled from its recorded gates. | Retained discovery requirements are synced. Current native local-review/historical-card acceptance remains #137, not an assertion of this archive. |
| `hydrate-picker-product-details` | Archived with explicit closeout: PR #49 head `cfaef4e2`, merge `41d7095b`, exact-head CI `34747325056`. | Keep current exact hydration, bounded safe facts, cache/fresh-write distinction and API manifest. Old React/ingredient/nine-choice wizard semantics were superseded; do not replay their delta. |
| `coordinate-product-discovery-with-effect` | Archived delivered research/adoption: PR #40 head `a3578ecf`, merge `be5ebfb5`, exact-head CI `34716385126`; planner subsequently retired by #95. | Preserve benchmark/cancellation provenance. Do not reinstate whole-list planning, automatic authority or fresh-login-every-task behavior. No external performance/cancellation proof claimed. |
| `guide-nemlig-shopping-flow` | Superseded design research. Its old wizard acceptance was never fully established; #95 and #149 define current independent discovery and local review. | Keep unchecked historical host tasks unarchived. Current host acceptance is #137; there is no task to restore List → Proposal → Choices → Approve. |
| `fix-fresh-product-revalidation` | Fresh exact validation is implemented and retained. Its backlog records disabled/enabled probes, but task 4.2 also asks for an authorized owner read not proven by that record. | Leave 4.2/4.3 unchecked; reuse verified current owner/read evidence through #67/#96 before archival. Never weaken fresh pre-write lookup or manufacture a live mutation. |
| `p2-simplify-nemlig-maintenance` | Fifty repository tasks are checked and its evidence records integration; planner/list/version-ceremony parts were later superseded. | Leave mixed applicable-live/archival tasks unchecked until their applicability is reconciled through #96/#67. No duplicate refactor or restoration of removed contracts. |
| `remove-nemlig-feature-requests` | Source integrated at `09adaa53`, recorded CI `34286037728`; removed surface remains absent. | Keep dated live/archival tasks open rather than infer exact owner acceptance from later green CI. Retained inventory evidence belongs to #96/#67; no replacement feedback feature. |
| `remove-saved-shopping` | Source integrated at `446fdb74`, recorded CI `34287860887`; interfaces retired, PlanStorage tombstone/namespace retained. | Keep live/archival tasks open under #96/#67. Interface removal is not stored-data deletion, native-list integration or authority to replay old list deltas. |
| `voice-first-product-review` | Active implemented v6 contract: PR #138 historical protections, #146 persistence, #149 In Review/Ready; evidence tasks 7.3/9.4 reconciled in #141. | #137 owns native historical/reopen/recovery acceptance; 6.4/7.4/8.5/9.5 remain unchecked. #96 owns deployment, not widget acceptance. Do not implement another renderer or retirement scheme. |
| `show-nemlig-basket-visually` | Archived implementation: PR #140 head `77537fee`, merge `476dd923`, exact-head CI `36272254098`; both requirements already canonical. | No native gallery proof is inferred from image URLs. Actual provider basket visualization is distinct from #137's local review/historical cards. |
| `remove-nemlig-local-rate-limits` | Archived implementation: PR #152 merge `9b934706`, exact-main CI `36455906771`; all eleven tasks checked and current family contract already canonical. | Staged configuration/owner portal evidence does not establish enabled owner MCP acceptance (#96/#67). Preserve old records; no tiers, quotas or compatibility adapters are restored. |

CI results and browser/provider checks cited above are **previously recorded
execution**, not tests rerun for every historical SHA. The six cited merge
commits for #40/#49/#95/#140/#149/#152 are ancestors of the inspected baseline.
Current documentation checks and final candidate/remote CI are recorded on this
reconciliation PR. The #141 head and merge have distinct successful CI runs;
neither establishes production or native acceptance.

## Preserved worktree-only plans

The four plans named by #114 still exist in their historical worktrees. A
read-only status check left all files/branches untouched; the first-party OAuth
proposal remains untracked. No branch is declared inactive solely from its age.

| Plan | Evidence-backed disposition |
| --- | --- |
| `adopt-effect-picker-lifecycle` | Historical research/superseded. PR #36 closed without merge; subsequent server adoption is #40, now archived. Retain research, not a second frontend experiment. |
| `replace-auth0-with-first-party-oauth` | Superseded/untracked proposal. Current approved owner recovery retains the existing issuer/client integration (#154); do not import, delete, or implement this old proposal. |
| `strengthen-nemlig-kill-switch` | Parked research, not implementation proof. Reassess only if selected after #96; manual kill switches remain maintained and this record performs no drill. |
| `retain-recent-cloudflare-container-images` | Superseded by #96; PR #48 closed without merge. Preserve provider research; no competing retention plan or provider deletion. |

The two known legacy Mac tunnel labels are still loaded without a reported PID
and retain their prior failed exit state. This is a read-only observation, not
removal or current cloud-only acceptance. Do not remove their files or unrelated
sleep assertions while reconciling repository plans.

## Canonical contract reconciliation

The documentation-only patch reconciles existing supported behavior:

- Reuse valid principal-scoped provider sessions, with coalesced/bounded read
  reauthentication and fresh authentication for protected apply; no write retry.
- Modern stateless MCP requests do not require transport sessions. Proposal
  ownership is authenticated principal/application state, not a client session ID.
- Package identity/private packing remain distinct from exact-SHA deployment
  eligibility; no npm publication or release ceremony is reinstated.
- Pure product-fact rendering/disclosure does no reads or writes. Activated
  local-review controls use authoritative server state and the same protected
  confirmation path; no duplicate browser business state or direct provider API.
- Canonical product-review/discovery contracts retain current In Review/Ready,
  freshness, authorization, historical gating and headless fallback behavior.
- Current family policy has no app-local count quotas, tiers or usage breaker;
  retain authentication-before-wake, CSRF/replay, deadlines, fixed capacity,
  isolation, the manual kill switch and single-attempt uncertain-write handling.

Archival skips applying old deltas where current canonical requirements are
already synced or their original surfaces are superseded. Checked local tasks
are not broadened into live acceptance. Incomplete/blocked plans remain
unarchived, with the owners above; the CLI's historical checkbox counts are not
a list of newly authorized features.

## Now / next / later

**Now:** Finish this #114 documentation diff and its exact-head/integration
evidence; preserve #67/#96/#137's independent gates.

**Next epic:** Bounded enabled-production and owner acceptance under #96/#67.
Outcome: prove the staged exact source/image through approved read-only operations,
then perform identifiable native UI checks. It comes first because current MCP
is disabled. Dependencies: explicit enable authority, the saved owner connection,
existing ChatGPT session and identifiable historical cards. Done requires exact
source/image readback, protected acceptance and honest per-case results, with
no real basket submission, secret change or destructive cleanup.

**Later:** #147's targeted routing assessment and #148's exact Deslop
implementation/adoption decision. These are unfinished scoped enhancements,
not grounds to close issues or install an unidentified tool. Worker-native
hosting, invitation enrollment and unrelated historical experiments remain
deferred, not newly authorized by cleanup.
