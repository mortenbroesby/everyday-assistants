## Context

See [proposal.md](proposal.md). The merged shared-card work makes supported
cards interchangeable within one current process-local review scope, but the
scope is still keyed with ChatGPT session/conversation context and is lost with
the MCP process. This implementation starts from merged #274, which established
the current Local basket UI direction.

`find_groceries` is independent of product-review ownership. The observed
32/37 failure report is therefore a discovery/reliability investigation, not a
storage-recovery symptom. Current per-search detail hydration is bounded, but
the aggregate fan-out across simultaneous host tool calls is not yet evidenced.

## Goals / Non-Goals

**Goals:**

- One owner can recover, list, select, edit, and explicitly delete unexpired
  Local baskets from supported chats for 24 hours after intentional activity.
- A container restart cannot discard successful local-basket edits.
- Old cards recover predictably: they act on their identified Local basket or
  offer explicit selection/creation after deletion or expiry.
- Search reliability is measured before changing concurrency, and verified
  partial catalogue results remain useful.
- Existing provider-write safeguards remain stronger than Local basket recovery.

**Non-Goals:**

- Permanent saved lists, history, cross-owner sharing, arbitrary labels/folders,
  basket merging, or any change to checkout/payment/delivery.
- Restoring a prepared provider submission, retrying an uncertain write, or
  treating Local basket recovery as approval to add to Nemlig.
- Replacing the current shared Local basket UI or its swipe/details actions.
- Guessing a provider fan-out limit before a bounded reproduction identifies the
  failing stage.

## Decisions

### 1. Use owner-keyed Durable Object storage for a short-lived collection

One Durable Object identity is derived from the authenticated principal. It
stores a collection of Local basket records rather than one global basket:

- `basketId` is opaque and stable; it is never derived from product contents or
  a ChatGPT conversation id.
- A record contains creation/last-activity/expiry timestamps, an internal
  revision, the complete product lines (up to 500), a durable submission fence
  when needed, and presentation-safe inventory metadata.
- `expiresAt` is `lastActivityAt + 24 hours`. An explicit open, selection, or
  local edit updates `lastActivityAt`; passive chat restoration does not. An
  active mounted viewer sends at most one keep-alive heartbeat per hour, which
  also refreshes `lastActivityAt`; it stops on inactivity or unmount.
- An owner may retain at most 50 baskets. Creating basket 51 silently evicts
  the basket with the oldest `lastActivityAt`, with `createdAt` as a stable
  tie-breaker.
- The object removes expired records on every read/write and schedules its next
  alarm for the earliest expiry. Alarm cleanup is a storage optimization; read
  and write enforcement remains authoritative.

This is smaller and more reliable than an owner-wide list index plus one Durable
Object per basket. It gives serialized owner mutations and a bounded retention
window without a second database or global cleanup worker. The existing retired
PlanStorage Durable Object is not reused.

### 2. Keep ChatGPT identity out of durable ownership; remember selection only when safe

The durable key is the authenticated owner only. Conversation identity is never
an authorization key or storage partition. When the host provides a stable
conversation identifier, it stores that chat's selected opaque `basketId` in the
owner's inventory. A chat without that reliable identifier opens the basket
picker instead of guessing a selection. A supported card carries its opaque
`basketId`; every owner chat can list and select every unexpired basket.

The first inventory UI is deliberately small: a short non-secret UUID prefix,
last-active date, and unique-product count. User-editable or generated human
names are deferred. When a grocery request arrives with a valid selected basket,
the assistant proposes appending to it and waits for the user's explicit choice
between append and creating a new basket.

Appending an exact product ID already in the selected basket increments that
line's quantity; variants remain separate. A final local-basket submission is
only available for the complete current basket. On confirmed provider readback,
the basket is closed and deleted. Failed or uncertain write outcomes keep it
available for inspection and never retry automatically.

Retain the current seven model-visible shopping tools. Extend the existing
Local-basket start/update schemas with explicit list, create, select, show, and
delete intents instead of adding another public tool. This preserves host
discovery and permission behavior while making every cross-chat switch visible
and reviewable.

### 3. Keep durable state on the Worker side of the Container boundary

The Container has no broad Durable Object binding. The Worker validates the
authenticated principal before Container wake, exposes a narrow native
Container outbound callback with a request-scoped authenticated capability, and
forwards only validated owner-scoped commands and snapshots. The callback never
trusts an owner supplied by Container JSON and cannot be reused after the
request. The Container remains the owner of provider credentials, catalogue
reads, and protected proposal execution; the Durable Object never receives
credentials, cookies, provider headers, or complete request logs.

Alternatives considered:

- Persist from the Container directly: rejected because it weakens the existing
  Worker authentication boundary and couples application state to a provider
  process.
- Use KV: rejected because expiry/select/edit needs serialized, strongly
  consistent owner mutations.
- Persist every review/proposal state: rejected because recovery must not
  restore write authority or uncertain-operation ambiguity.

### 4. Re-establish submission safety after recovery

Persist local basket membership, quantities, safe presentation data, and a
small non-authorizing `submissionAttempted` fence before beginning a provider
write. Do not persist a prepared payload, approval, submission id, proposal, or
operation lock as reusable authority. On recovery, clear local prepared state
and require fresh product validation and exact preparation unless the fence is
present. A recovered fence blocks preparation and submission, directs the user
to inspect the real Nemlig basket, and never authorizes or retries a write. A
verified successful readback deletes the basket; if deletion fails, the fence
remains.

### 5. Diagnose discovery fan-out before fixing it

First add a deterministic recipe-scale reproduction plus privacy-safe telemetry
at the shallow catalogue, detail hydration, deadline/cancellation, and
authentication boundaries. Record only stage, normalized error class, and
active-read counts; never terms, product contents, tokens, credentials, or
session identifiers.

Use the captured evidence to choose the smallest fix. If a queue is warranted,
retry only retryable read failures through a bounded product-search queue, for
at most three total attempts with exponential backoff. Never retry invalid
requests, cancellation, or lost authorization. Define the queue only for a
stable host chat identifier; otherwise retain request-local limits rather than
guessing a session. After more than ten retryable failures in one minute, stop
additional search work for that chat and report the outage; other sessions
remain unaffected. This pause clears when the rolling 60-second failure count
falls to ten or fewer. New requests may then proceed; stopped or canceled
requests are not automatically replayed. If upstream search failures are the cause, retain truthful
error/partial-result behavior rather than adding unrelated global throttling.

## Risks / Trade-offs

- [A durable basket is mistakenly treated as a durable authorization] → Persist
  no reusable proposal or submission authority; fresh preparation and explicit
  approval remain mandatory after recovery, while a durable uncertainty fence
  prevents duplicate writes.
- [An old card edits the wrong basket] → Require an opaque basket ID for card
  mutations and return a bounded current snapshot only for that owner/basket.
- [Expiry cleanup misses an alarm] → Enforce activity-based expiry on reads and
  writes, not only in background cleanup.
- [Capacity silently drops a useful basket] → Bound the inventory at 50 as
  explicitly selected, evict only the least recently used record, and show the
  same neutral picker for expired, deleted, or evicted old cards.
- [Cross-chat inventory leaks product data] → Inventory is owner-scoped and
  contains only enough local metadata to distinguish/select baskets; no data is
  exposed across principals or logged.
- [A concurrency change hides the real search cause] → Make the production-like
  fixture and failure-stage capture a hard task prerequisite for any limiter or
  retry adjustment.
- [A mounted viewer retains a basket forever] → Limit heartbeats to one per hour
  and stop them when the viewer is inactive or unmounted.
- [A successful addition can be repeated] → Write a durable non-authorizing
  uncertainty fence before provider execution, close and delete the complete
  Local basket only after verified readback, and retain the fence on uncertain
  or cleanup-failure paths instead of retrying.
- [The stacked UI changes alter the Local basket protocol] → Start from the
  current `origin/main` containing #274, re-read its final protocol and specs, and update this
  plan only if that concrete baseline changes the selected implementation seam.

## Migration Plan

1. Reconcile the implementation branch with current `origin/main`, including
   #274, the #281 PlanStorage retirement, and subsequent Local basket changes.
2. Preserve the existing `v1` creation and `v2` PlanStorage deletion migrations
   unchanged. Add the owner Local basket binding in a new `v3` migration and
   the authenticated state boundary behind existing production safety checks.
   This feature does not repeat the PlanStorage deletion or reuse its records.
3. Route new Local basket create/list/select/edit/delete operations through the
   boundary. Existing in-memory conversation drafts receive an explicit
   unavailable/choose-or-create recovery path; they are never silently copied
   into owner storage.
4. Ship with exact-head CI, Worker/Container state readback, refreshed ChatGPT
   metadata, and old/new-chat smoke proof. Rollback is the prior Worker/Container
   release; durable records remain inert and expire within 24 hours of their
   last intentional interaction.

## Deferred follow-up

User-editable labels and generated human-friendly names are deferred. The first
inventory shows a short non-secret UUID prefix, last-active date, and
unique-product count only.
