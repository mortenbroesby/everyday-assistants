## 1. Establish provider contracts and delivery baseline

- [ ] 1.1 Rebase the implementation branch on current main containing merged PR #294; verify its successful-transfer cleanup and warning tests remain present. Record the issue, branch and integration owner.
- [ ] 1.2 Capture sanitized native inventory, pagination, account/list identity and not-found fixtures; implement enumeration in the existing client and test empty, multiple-page, duplicate-name, malformed, unauthorized and unavailable responses.
- [ ] 1.3 Characterize absolute list quantities, removal and partial replacement with focused client tests; demonstrate writes are not automatically retried.
- [ ] 1.4 Resolve the concurrent native-edit gate: prove conditional transfer/deletion or prove an immutable/isolated approved transfer snapshot and retain unsafe-to-delete source lists; a normal copied list is not sufficient, and unavailable guarantees block dispatch. Verify exact payload and preservation of post-review edits with race fixtures; record supported cleanup behavior before wiring it into the UI.

## 2. Add explicit saving and move saved selections to native lists

- [ ] 2.1 Use account-scoped provider IDs throughout product review and optional conversation hints; test two chats selecting one list, two accounts, duplicate names, restart with lost selection and missing host context.
- [ ] 2.2 Replace saved-list LocalBasketRepository reads/edits with native operations and exact readback, reusing client methods; test add, accept, remove, quantity, alternatives, replacement, clear and explicit list deletion without real-basket writes.
- [ ] 2.3 Keep the entire ideated draft transient until explicit Save as shopping list; save its displayed exact product rows/quantities once with verified readback and switch the existing view to the returned native ID. Test no writes on ideation/accept/edit, saving To decide and Ready rows without persisting their review flags, duplicate clicks, partial/uncertain creation, and no replay after restart.
- [ ] 2.4 Distinguish confirmed deletion from transport/auth failures and stale content; test picker recovery with no recreation, retargeting, lost hint on outage or replay of failed actions.

- [ ] 2.5 Define bounded process-local draft inactivity handling without DO persistence; test explicit interaction renews activity, passive refresh does not, unsaved expiry rejects stale actions, in-flight Save settles before eviction, and saved native lists never expire through this mechanism. Record the idle interval in the implementation.
- [ ] 2.6 Require saving before submission of an unsaved draft; test Save grants no basket authority and direct submission offers explicit Save before the separate exact review.

## 3. Preserve submission safety without a basket registry

- [ ] 3.1 Implement the minimum durable attempt receipt in existing hosting storage with a narrow authenticated interface; test atomic fence acquisition, failed storage writes, spoofed owner/account binding and no product-line persistence.
- [ ] 3.2 Bind preparation and approval to the exact native source, fingerprint and current basket baseline; test stale external edits, wrong conversation, unavailable products and missing lists before dispatch.
- [ ] 3.3 Integrate one native transfer and verified-success-before-cleanup; test repeated submission, two-chat contention, process restart after dispatch, lost response, failed final readback and cleanup warning without another transfer.
- [ ] 3.4 Define and test receipt retention: expired approval cannot replay, attempted/uncertain receipts never expire into new authority, and resource limits fail closed rather than evict safety evidence.
- [ ] 3.5 Extend the representative MCP fixture to 55 distinct products plus an existing basket item; assert one transfer, additive exact readback and only safe corresponding-list cleanup, with no per-product fallback.

## 4. Replace the product and tool contract

- [ ] 4.1 Reuse the existing draft viewer for Unsaved draft and all native Shopping lists, with Save as shopping list only for unsaved state and Nemlig basket for actual basket state; preserve full-screen and swipe controls and verify Storybook at mobile widths.
- [ ] 4.2 Update MCP schemas to distinct process-local draft and shopping_list_id targets, explicit Save, widget targeting and truthful provider-mutation annotations; test stale local IDs, retained tool inventory, text fallback, reconnect and service-principal rejection.
- [ ] 4.3 Add Storybook and viewer coverage for unsaved draft, Save in progress, partial/failed Save, draft expiry, all-list picker, native lists in the reused viewer, native names, missing list, auth/outage, stale card, completed deletion and retained-list warning; verify mount/correlated result behavior and no repeated heading/action text.
- [ ] 4.4 Update README, relevant instructions/plugin sources, acceptance docs and specs; reconcile superseded two-list/registry tasks and issue #276 without marking unimplemented work complete. Verify strict OpenSpec validation and matching product/tool wording.

## 5. Remove obsolete runtime infrastructure

- [ ] 5.1 Remove durable local-basket domain/storage modules, repositories, inventory callback protocol, persistent expiry/heartbeat/eviction and redundant tests while preserving bounded transient drafts and shared UI; search all callers, exports and dynamic config references and retain safety tests on the replacement path.
- [ ] 5.2 Remove OwnerLocalBasketStorage from the active request path and both environment bindings; remove or narrowly rename required receipt capability transport. Verify Worker integration tests show no inventory callback and preserve auth-before-wake, fixed capacity and kill switch.
- [ ] 5.3 Prepare namespace retirement using the pinned Wrangler syntax and release workflow; verify a local dry-run/fixture for migration compatibility and identify the exact destructive deployment gate. Do not deploy or delete provider data under planning authority.
- [ ] 5.4 Preserve unresolved old attempt fences using verified native-ID correlation, or drain/reconcile them; uncorrelatable attempts require a temporary account-level submission hold; verify metadata readback and document rollback boundaries without restoring old contents as authoritative. Any inert class retained for staged retirement must have a tracked removal checkpoint.

## 6. Verify and deliver the implementation

- [ ] 6.1 Review checkpoint commits and the final diff for removal completeness, privacy, unrelated changes and duplication; run focused tests, the full app suite, pnpm format, pnpm verify, strict spec validation and relevant Storybook/Worker smoke checks after final edits.
- [ ] 6.2 Obtain one independent challenge review of ownership, restart safety, concurrent edits and destructive cleanup; resolve concrete findings and record evidence, then open/update the one implementation PR and require exact-head CI/ruleset before merge.
- [ ] 6.3 With separate deployment approval and migration disposition, deploy one reviewed main SHA through the normal production workflow; verify actual revision, health and read-only list discovery. No automatic semantic-version release is part of this epic.
- [ ] 6.4 Run the repeatable fresh-ChatGPT smoke: let an unsaved draft expire without provider creation, ideate another draft and explicitly save it, reopen it and an existing list in the same viewer, edit the selected native list, refresh an external edit, handle a deleted list, reselect after restart, then review and separately authorize 55 exact products for one transfer. Record basket and list readback, cleanup outcome and no retry without logging private shopping data.
- [ ] 6.5 Complete any separately gated namespace retirement, verify no active local-basket binding/code remains, reconcile the issue/OpenSpec completion status and report code, merge, deployment and live acceptance separately.
