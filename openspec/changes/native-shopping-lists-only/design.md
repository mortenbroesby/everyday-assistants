## Context

See proposal.md. Baseline refreshed to main `ea56ce3`, including merged PR #294. Current `client.ts` already has native create/read/update/delete,
account identity and list-to-basket transfer. It has no account list enumeration.
`product-review.ts` still routes saved content through `LocalBasketRepository`.
`local-basket.ts` owns IDs, revisions, 24-hour expiry, eviction and submission
state; `local-basket-storage.ts` persists lines and conversation selections.
The Worker exports `OwnerLocalBasketStorage`, brokers request capabilities and
forwards container callbacks to that storage. These are removal targets.

## Goals / Non-Goals

**Goals:** use native identity and native content, keep the current useful
product controls, and preserve the smallest independent submission safeguard.
**Non-goals:** generic storage interfaces, a new database, durable/offline drafts,
background synchronization, dual writes, or a permanent compatibility layer.

## Decisions

### One provider list, no local identity registry

Use `(connected Nemlig account identity, provider list ID)` as the storage key.
The numeric ID is an identifier, never permission. Fetch through the current
user's authenticated client and verify account identity before acting; validate
inventory membership and reject foreign, malformed or mismatched readbacks.
Names are display text, not identity, and duplicate names are allowed.

Add the missing list-inventory operation to the existing client after capturing
a sanitized provider contract fixture. Include lists created outside the
assistant; do not filter by app name or prefix. Paginate if the provider does,
without silently truncating inventory or loading every list's full contents.
Keep existing bounded request concurrency and deadlines. An empty valid inventory
is distinct from failed authentication, timeout, malformed data or partial reads.

A conversation stores at most a selected ID in existing transient session state
or a host-returned hint. Without stable host context, require explicit selection.
A restart may lose selection; listing and selecting again is sufficient. No
DO is needed for selection, identity, list names or list content. Multiple chats
may explicitly choose the same account list; their review and approval state
remain separate. A credential/account switch invalidates selection and authority.

### Ideate first; explicitly save the draft

Start with the existing draft UI backed by owner/conversation-scoped process
memory. Label it Unsaved draft and offer Save as shopping list. Ideating a list,
accepting products, changing quantities, removing rows, viewing details and
choosing alternatives do not create a provider list. Product discovery can still
read Nemlig; the draft is not an offline product catalogue.

Save as shopping list stores the current displayed draft product rows and exact
quantities, not just items marked Ready and not the separate alternatives search
results. To decide/Ready are temporary review hints, not a second native list or
an implied approval to buy. Resolve any non-product ideas into exact catalogue
items before saving; never silently drop unresolved text or unavailable lines.
Show the intended list name and saved contents. Saving does not authorize a
basket transfer. Submission starts from a saved list and still requires the
separate exact basket review; asking to submit an unsaved draft offers Save as
shopping list first, without silently saving or transferring it.

Serialize Save for the exact current draft revision. Create one native list,
retain its returned ID during the operation, populate it and verify exact
readback. Only then switch that draft's view to the native list and discard its
editable local copy. Disable/reject duplicate in-flight Save actions; a repeated
Save for an already saved live draft opens its known native list. Do not maintain
a durable draft-to-list identity registry. If creation or population times out,
keep the draft while its session exists, show partial/uncertain save status and
inspect the known list ID or refresh the inventory. Never automatically create
another list, replay uncertain writes, delete a partially created list, or claim
saving was atomic. If the process loses the draft/returned ID, offer inventory
inspection; do not infer identity from a duplicate name. A stale draft action
cannot save a replacement draft after restart or expiry.

Unsaved drafts have bounded, process-local memory only. They may disappear on
restart, closing/ending the draft, eviction or inactivity. An implementation
constant will define the idle interval; no exact duration is promised by this
plan. Only explicit draft interaction renews activity, not passive renders,
background refresh or heartbeat. Use clock-based expiry checks and existing
bounded memory management, not Durable Object alarms or a durable draft store.
An active bounded Save pins its draft until the operation settles; inactivity
must not discard the products midway through that operation. On expiry, cached
cards report Unsaved draft expired and never reconstruct or replay their data.

### Reuse one product UI for drafts and saved lists

Reuse the existing draft rows, details, swipe actions, trash, alternatives and
compact quantity controls. The backing target determines whether an action edits
transient draft state or a native list; do not duplicate the viewer or maintain a
local editable mirror of a saved list. Keep distinct, validated action targets:
an opaque process-local draft reference versus an account-scoped native list ID.
The draft reference exists only to reject stale actions; it is not a saved basket
identity. An expired draft reference must never resolve to a newer draft or list.

Shopping lists opens all accessible provider lists, including those created in
Nemlig itself. Selecting any list renders its contents in this same product UI
using its native name and a Saved to Nemlig state. Edits to a saved list change
only a bounded, process-local buffer. Show the list as dirty and expose
**Update shopping list**; do not write
on quantity, add, remove, replacement, acceptance, alternatives or navigation.
Update is the only operation that persists staged changes. It is distinct from
**Save shopping list**, which creates a native list from an unsaved draft.
Submission is unavailable while the buffer is dirty or an Update is saving,
partial or uncertain. Any edit invalidates prior submission authority.

Before Update, validate the exact connected account and list ID and compare the
current provider fingerprint with the baseline shown when the edit buffer was
opened. If it matches, apply the minimal requested changes and verify exact
readback. A replacement may span two provider writes and is not atomic. Writes
must not be retried blindly. After a failure, reconcile against the same list
before resuming; never create another list or retarget the operation.

If Nemlig changed the list since it was opened, do not write staged edits over
that external change. Read and show the latest provider contents beside the
still-pending user edits, keep the buffer dirty, and require the user to review
that state before an explicit Update can retry against the new baseline. Do not
silently merge or discard either side. Authentication or transport failures
preserve the exact target and pending edits; confirmed not-found shows current
inventory without recreating or retargeting a list.

The process-local edit buffer exists only while the user is editing. Persist a
narrow operation journal only after explicit Save shopping list or Update
shopping list begins. It binds operation ID, account/list identity, prior
fingerprint, exact intended change and progress needed to reconcile an
interrupted provider write. Save may retain its exact draft rows only for that
active operation. The journal is removed after verified completion or kept in
an uncertain state until explicit reconciliation; it is not an editable list
store or a second saved-content authority.

### Submission safety is not basket storage

A concrete defect would result from deleting `submissionAttempted` without a
replacement: a transfer succeeds, its response is lost, the process restarts,
and the still-existing list can be prepared and transferred again. Native list
identity cannot prove whether that transfer already happened.

Keep a narrowly scoped durable submission receipt, preferably in the existing
`NemligMcpContainer` Durable Object's storage. Do not retain or rename the old
basket registry into another inventory. The receipt stores account/list binding,
submission ID, approved fingerprint, originating conversation authority, phase
(attempted/verified/uncertain) and cleanup status, not saved product lines.
Acquire the durable attempt fence atomically before dispatch; all chats sharing
the account/list consult it. Persist verified outcome before cleanup. A failed
receipt write blocks dispatch. A restart with an attempted or uncertain receipt
never creates new authority for that list, even if the list has since changed.
No timer may reopen an unresolved fence. Keep terminal receipts until old
submission authority has expired and provider deletion is confirmed; retain
uncertain receipts until explicit reconciliation. Never evict safety state to
make room: fail closed at a documented bounded-storage limit.

Only receipt access needs an authenticated internal transport. Reuse the
existing owner-bound request capability pattern if needed, narrowed and renamed
for submission receipts; remove the old inventory endpoint and its read/edit
command language. Test Worker/Container restart and failed durable writes. If
provider-side idempotency eventually proves equivalent guarantees, this receipt
can be removed; current client evidence does not establish that capability.

### Bind submission and cleanup to the native source list

On one explicit Submit action, prepare and apply the exact currently displayed
saved-list snapshot internally; do not add a separate review stage or second
confirmation. Do not create another permanent Ready list or replay list contents
into a new local basket. Preserve fresh product validation, exact quantities,
current basket baseline, user intent and one native transfer. Re-read list
content under the assistant mutation lock just before dispatch; changed content
invalidates the action and refreshes the view, requiring a fresh deliberate
Submit. Deleted lists cannot be submitted. External edits observed after
submission prevent source deletion.

Carry PR #294's verified-success-before-cleanup and warning behavior forward,
but its temporary-list assumptions must be revisited for user-created lists.
The exact review must disclose that successful submission consumes/deletes this
named list. After confirmed completion, delete the bound source ID, including
known-unavailable rows, and report those rows in the result. A verified
transfer remains completed if cleanup fails; retain the source, report cleanup
separately and never invite resubmission. Persist enough result information to
recover the summary across restart before destructive cleanup.

The inspected provider API has no demonstrated conditional transfer or delete.
The owner accepts the possible concurrent Nemlig-side edit between the final
contents read and native transfer, provided the implementation revalidates the
exact source and basket baseline, sends one transfer, verifies additive basket
readback, and keeps the durable no-replay fence. A mismatch before dispatch
rejects the action; an unexpected readback after dispatch remains uncertain and
must never invite retry. Issue #295 selects source deletion after confirmed
completion, including known-unavailable rows. Before deletion, recheck provider
identity and the exact source; if an external edit is observed, retain the list
and report cleanup as unsafe. This read is not atomic with deletion, and the
owner's accepted transfer race does not authorize deleting observed newer
content. The native transfer path in this checkpoint does not implement source
cleanup; defer physical deletion until cleanup eligibility, durable recovery,
and no-replay are implemented and tested. No live source-list deletion was
performed for this checkpoint. Do not create another account-visible list to
claim isolation or treat temporary-list cleanup as proof for user-owned lists.

## Removal and reuse map

All paths below are under `apps/nemlig-assistant/` unless qualified.

| Surface | Planned result |
| --- | --- |
| `src/local-basket.ts`, `src/local-basket-storage.ts` and dedicated tests | Delete durable domain inventory, line persistence, TTL, alarms, heartbeat and eviction; preserve bounded transient draft state; move only meaningful safety tests to the new path. |
| `src/local-basket-callback.ts`, `src/local-basket-capability.ts` and tests | Remove inventory callback protocol; retain only proven authentication mechanics needed by narrow receipt transport. |
| `src/cloudflare-worker.ts`, `wrangler.jsonc` | Remove `OwnerLocalBasketStorage`, its binding in both environments, capability inventory routing and associated config expectations; preserve Container/auth/kill switch. |
| `src/mcp.ts`, HTTP context plumbing, `src/product-review.ts` | Remove `LocalBasketRepository`, durable/legacy branches and local inventory calls; explicit transient draft/save/native-list states, without a durable draft repository. |
| `src/client.ts`, `src/proposals.ts` | Reuse endpoints and approval/readback logic; add validated enumeration and native-source preparation; retain #294 cleanup semantics where safe. |
| `src/picker/`, Storybook, UI parsers and smoke fixtures | Reuse the draft UI for both target types, with Unsaved/Save and native-list states plus all-list picker; update correlated-result and stale-card tests. |
| `README.md`, `BACKLOG.md`, connector/tool guidance, plugin sources, acceptance scripts and OpenSpec | Distinguish unsaved drafts from native lists; remove durable/offline draft and native-list TTL promises; align tool annotations and contract inventories. |

Search actual callers and exports before deletion. Historical migration tags,
archived specs and test descriptions may name retired code; active runtime imports,
wire aliases and feature promises must not. Preserve unrelated DOs and CLI
contracts unless a demonstrated caller requires a scoped change.

## Risks / Trade-offs

- [Provider outage] → saved lists remain on Nemlig but Save and native edits are
  unavailable; the current transient draft remains while its session lives.
  No local saved-list fallback or queued write runs later.
- [Abandoned ideas] → show Unsaved draft and Save as shopping list clearly;
  inactivity may discard only unsaved state, never native shopping lists.
- [External edits during review/cleanup] → stale rejection, isolated exact
  submission where necessary, and conditional cleanup gate described above.
- [Two chats choose the same list] → explicit selection is allowed, content is
  shared, but per-list mutation serialization and durable attempt fencing apply.
- [Old local data is lost at cutover] → announce unsupported old IDs, no implicit
  export or provider creation; namespace deletion is a separate destructive gate.
- [Extra provider reads] → one paged inventory, lazy details and bounded readback;
  no polling, duplicate product cache or new infrastructure. Measure 50+ items
  against existing gateway deadlines before release.

## Migration Plan

1. Preserve merged #294 and capture native inventory, save/update, missing-list and
   concurrent-edit contracts using sanitized fixtures. No production writes
   are authorized by this plan.
2. Add transient draft, explicit Save, native list behavior and a restart-safe receipt behind internal test
   construction, with no public dual-write mode; replace the consumers in one
   coherent implementation PR, using small checkpoint commits.
3. Replace UI/MCP naming and identity, remove old runtime storage/callbacks,
   reconcile predecessor OpenSpec deltas and update acceptance documentation.
   Keep historical migration entries; use the repository's pinned Wrangler
   lifecycle syntax rather than mixing this with a tooling migration.
4. Before deploying a destructive class migration, inspect actual namespace
   contents privately and preserve unresolved submission fences. Either migrate
   the minimum safety metadata with verified readback, or drain/reconcile it
   before cutover. Old records contain a local basket ID and attempted flag,
   not a native source-list ID. Require verified correlation before translating
   a fence; uncorrelatable attempts require explicit reconciliation or a temporary
   account-level submission hold. Copying the old boolean into an unrelated
   provider-ID record is insufficient. Do not delete ambiguous transfer evidence.
5. Validate the current production workflow's version-upload/rollback support for
   DO lifecycle changes. Present exact retirement/data-disposition evidence for
   deployment approval. If deletion cannot share the normal release, keep only
   an inert, unbound class temporarily for that release and retire it in a
   separately reviewed migration; it has no content-authority or selection role.
6. Run exact-head CI, controlled deployment and fresh ChatGPT acceptance including
   unsaved expiry, explicit saving, native list discovery in the reused viewer,
   external deletion, account isolation, restart recovery and
   an exact separately authorized 50+ product transfer. No version bump is
   needed for the normal SHA-based workflow.
7. Remove any inert retirement scaffold after the explicit deletion gate; record
   source, deployed revision and live results separately. Close the epic only
   when the old active infrastructure is gone and the behavior is demonstrated.

Rollback before namespace deletion can restore code but must preserve new
submission fences and must not resurrect stale local content as authoritative.
After deletion, use a forward fix; a source revert cannot restore deleted data.
Cloudflare documents permanent namespace deletion and lifecycle rollback limits:
https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/

## Evidence still needed during implementation

- First-party public client evidence captured 2026-10-11 from
  `https://www.nemlig.com/scom/dist/main.js?v=b1.0.0.0` (SHA256
  `57cbe33511fd50de1cd2faf33b8e03f66aafc179799816a70ee5829be80886d8`):
  inventory is `GET /webapi/ShoppingList/GetShoppingLists?skip=<n>&take=<n>`;
  the overview response uses `ShoppingListOverViewViewModels` and
  `NumberOfPages`, with `Id`, `Name`, `ProductsCount`, and `TotalAmount` rows.
  This is source-derived evidence, not a live account response. Authenticated
  not-found behavior and live pagination consistency remain unverified.
- Conditional write/transfer/delete support and tested snapshot behavior at the
  concurrency gate above.
- Existing Container storage access and narrow receipt transport, checked with a
  Worker integration fixture before the old storage implementation is removed.
